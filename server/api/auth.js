const express = require('express');
const rateLimit = require('express-rate-limit');
const { getFirebaseAdmin } = require('../lib/firebaseAdmin');
const {
    consumeEmailVerificationCode,
    ensureEmailIsAvailable,
    normalizeEmail,
    requestEmailVerificationCode,
    verifyEmailCode,
} = require('../lib/emailVerification');

const router = express.Router();

const emailVerificationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

function sendError(res, error) {
    const statusCode = error.statusCode || error.status || 500;
    return res.status(statusCode).json({
        success: false,
        error: error.message || 'Erro interno no servidor.',
        remainingSeconds: error.remainingSeconds,
        remainingAttempts: error.remainingAttempts,
    });
}

function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizePhone(value) {
    const trimmed = String(value || '').trim();
    return trimmed || null;
}

function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 6) {
        const error = new Error('A senha deve ter pelo menos 6 caracteres.');
        error.statusCode = 400;
        throw error;
    }
}

function validateSignupPlatform(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['android', 'iphone', 'web', 'unknown'].includes(normalized)) {
        return normalized;
    }
    return 'unknown';
}

function validateSignupSource(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['mobile', 'web'].includes(normalized)) return normalized;
    return 'web';
}

function getFirebaseAuthErrorMessage(error) {
    switch (error && error.code) {
        case 'auth/email-already-exists':
            return 'Este e-mail ja esta em uso.';
        case 'auth/invalid-email':
            return 'Informe um e-mail valido.';
        case 'auth/invalid-password':
            return 'A senha deve ter pelo menos 6 caracteres.';
        default:
            return error.message || 'Nao foi possivel criar a conta.';
    }
}

router.post('/email-verification/request', emailVerificationLimiter, async (req, res) => {
    try {
        const result = await requestEmailVerificationCode({
            email: req.body && req.body.email,
            name: req.body && req.body.name,
        });

        return res.json({
            success: true,
            expiresInSeconds: result.expiresInSeconds,
            resendAfterSeconds: result.resendAfterSeconds,
        });
    } catch (error) {
        return sendError(res, error);
    }
});

router.post('/email-verification/confirm', emailVerificationLimiter, async (req, res) => {
    try {
        verifyEmailCode({
            email: req.body && req.body.email,
            code: req.body && req.body.code,
            consume: false,
        });

        return res.json({ success: true });
    } catch (error) {
        return sendError(res, error);
    }
});

router.post('/register-with-email-code', emailVerificationLimiter, async (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password;
    const name = normalizeName(req.body && req.body.name);
    const phone = normalizePhone(req.body && req.body.phone);
    const code = req.body && req.body.code;
    const signupPlatform = validateSignupPlatform(req.body && req.body.signupPlatform);
    const signupSource = validateSignupSource(req.body && req.body.signupSource);
    const createdFromMobile = Boolean(req.body && req.body.createdFromMobile);

    let createdUser = null;

    try {
        if (!name) {
            const error = new Error('Informe seu nome completo.');
            error.statusCode = 400;
            throw error;
        }

        validatePassword(password);
        verifyEmailCode({ email, code, consume: false });
        const existingUser = await ensureEmailIsAvailable(email);

        const admin = getFirebaseAdmin();
        const auth = admin.auth();
        const db = admin.firestore();
        const now = admin.firestore.FieldValue.serverTimestamp();
        let registeredUser = existingUser;

        if (registeredUser) {
            registeredUser = await auth.updateUser(registeredUser.uid, {
                password,
                displayName: name,
                emailVerified: true,
                disabled: false,
            });
        } else {
            createdUser = await auth.createUser({
                email,
                password,
                displayName: name,
                emailVerified: true,
                disabled: false,
            });
            registeredUser = createdUser;
        }

        await db.collection('users').doc(registeredUser.uid).set({
            name,
            email,
            phone,
            signupPlatform,
            signupSource,
            createdFromMobile,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
            subscription: {
                plan: 'starter',
                status: 'active',
            },
        }, { merge: true });

        consumeEmailVerificationCode(email);

        return res.status(201).json({
            success: true,
            user: {
                uid: registeredUser.uid,
                email: registeredUser.email,
                emailVerified: registeredUser.emailVerified,
            },
        });
    } catch (error) {
        if (createdUser && createdUser.uid) {
            try {
                const admin = getFirebaseAdmin();
                await admin.auth().deleteUser(createdUser.uid);
            } catch (cleanupError) {
                console.error('[Auth] Failed to rollback user after registration error:', cleanupError);
            }
        }

        if (error && error.code && String(error.code).startsWith('auth/')) {
            const mappedError = new Error(getFirebaseAuthErrorMessage(error));
            mappedError.statusCode = error.code === 'auth/email-already-exists' ? 409 : 400;
            return sendError(res, mappedError);
        }

        return sendError(res, error);
    }
});

module.exports = router;
