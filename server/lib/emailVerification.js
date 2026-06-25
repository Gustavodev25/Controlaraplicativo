const crypto = require('crypto');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const { getFirebaseAdmin, isFirebaseConfigured } = require('./firebaseAdmin');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_SMTP_TIMEOUT_MS = 15000;
const DEFAULT_RESEND_TIMEOUT_MS = 20000;
const DEFAULT_RESEND_API_URL = 'https://api.resend.com/emails';

const verificationRecords = new Map();
const transporterCache = new Map();

function parsePositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'sim'].includes(String(value).trim().toLowerCase());
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_REGEX.test(normalizedEmail)) {
        const error = new Error('Informe um e-mail valido.');
        error.statusCode = 400;
        throw error;
    }
    return normalizedEmail;
}

function getVerificationTtlMs() {
    const minutes = parsePositiveInteger(process.env.EMAIL_VERIFICATION_TTL_MINUTES, 10);
    return minutes * 60 * 1000 || DEFAULT_TTL_MS;
}

function getSendCooldownMs() {
    const seconds = parsePositiveInteger(process.env.EMAIL_VERIFICATION_COOLDOWN_SECONDS, 60);
    return seconds * 1000 || DEFAULT_COOLDOWN_MS;
}

function getMaxAttempts() {
    return parsePositiveInteger(process.env.EMAIL_VERIFICATION_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS);
}

function getSmtpTimeoutMs() {
    return parsePositiveInteger(process.env.SMTP_TIMEOUT_MS, DEFAULT_SMTP_TIMEOUT_MS);
}

function getResendTimeoutMs() {
    return parsePositiveInteger(process.env.RESEND_TIMEOUT_MS, DEFAULT_RESEND_TIMEOUT_MS);
}

function getHashSecret() {
    return (
        process.env.EMAIL_VERIFICATION_HASH_SECRET ||
        process.env.SMTP_PASS ||
        'controlar-email-verification'
    );
}

function createCodeHash(email, code) {
    return crypto
        .createHmac('sha256', getHashSecret())
        .update(`${email}:${code}`)
        .digest('hex');
}

function timingSafeHexEqual(a, b) {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function generateCode() {
    return String(crypto.randomInt(100000, 1000000));
}

function buildSmtpConfig({ host, user, pass, port, secure, requireTLS = false }) {
    return {
        host,
        port,
        secure,
        requireTLS,
        auth: { user, pass },
        connectionTimeout: getSmtpTimeoutMs(),
        greetingTimeout: getSmtpTimeoutMs(),
        socketTimeout: getSmtpTimeoutMs(),
    };
}

function getSmtpConfigs() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    const port = parsePositiveInteger(process.env.SMTP_PORT, 465);
    const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);

    if (!host || !user || !pass) {
        const error = new Error('SMTP nao configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS no backend.');
        error.statusCode = 503;
        throw error;
    }

    const configs = [buildSmtpConfig({
        host,
        user,
        pass,
        port,
        secure,
        requireTLS: !secure && port === 587,
    })];

    const isZohoHost = host.toLowerCase().includes('zoho.com');
    if (isZohoHost && port !== 587) {
        configs.push(buildSmtpConfig({
            host,
            user,
            pass,
            port: 587,
            secure: false,
            requireTLS: true,
        }));
    }

    return configs;
}

function getTransporter(smtpConfig) {
    const cacheKey = [
        smtpConfig.host,
        smtpConfig.port,
        smtpConfig.secure ? 'secure' : 'starttls',
        smtpConfig.requireTLS ? 'requiretls' : 'optional',
    ].join(':');

    if (!transporterCache.has(cacheKey)) {
        transporterCache.set(cacheKey, nodemailer.createTransport(smtpConfig));
    }

    return transporterCache.get(cacheKey);
}

function isSmtpConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isResendConfigured() {
    return Boolean(process.env.RESEND_API_KEY);
}

function isEmailDeliveryConfigured() {
    return isResendConfigured() || isSmtpConfigured();
}

function getEmailFrom() {
    return (
        process.env.EMAIL_FROM ||
        process.env.RESEND_FROM ||
        process.env.SMTP_FROM ||
        `"Controlar+" <${process.env.SMTP_USER || 'contato@controlarmais.com.br'}>`
    );
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function maskEmail(email) {
    const normalized = normalizeEmail(email);
    const [local, domain] = normalized.split('@');
    if (!local || !domain) return normalized ? '***' : '';
    const visibleLocal = local.length <= 2 ? local[0] : `${local[0]}${local[local.length - 1]}`;
    return `${visibleLocal}***@${domain}`;
}

function toPublicSmtpError(error) {
    const code = String(error?.code || error?.command || '').toUpperCase();
    const message = String(error?.message || '');
    const publicError = new Error('Nao foi possivel enviar o codigo agora. Tente novamente em alguns minutos.');
    publicError.statusCode = 502;

    if (code.includes('EAUTH') || /auth|login|credential|535|authentication/i.test(message)) {
        publicError.message = 'Falha na autenticacao do SMTP. Confira SMTP_USER e SMTP_PASS no backend.';
        publicError.statusCode = 503;
        return publicError;
    }

    if (
        code.includes('ETIMEDOUT') ||
        code.includes('ESOCKET') ||
        code.includes('ECONNECTION') ||
        code.includes('ECONNREFUSED') ||
        /timeout|timed out|connection|socket/i.test(message)
    ) {
        publicError.message = 'O servidor nao conseguiu conectar ao SMTP. No Railway, tente SMTP_PORT=587 e SMTP_SECURE=false.';
        publicError.statusCode = 504;
        return publicError;
    }

    if (/recipient|mailbox|invalid address/i.test(message)) {
        publicError.message = 'Nao foi possivel enviar para este e-mail. Confira o endereco e tente novamente.';
        publicError.statusCode = 400;
        return publicError;
    }

    return publicError;
}

function isConnectionFailure(error) {
    const code = String(error?.code || error?.command || '').toUpperCase();
    const message = String(error?.message || '');

    return (
        code.includes('ETIMEDOUT') ||
        code.includes('ESOCKET') ||
        code.includes('ECONNECTION') ||
        code.includes('ECONNREFUSED') ||
        /timeout|timed out|connection|socket/i.test(message)
    );
}

function toPublicResendError(error, statusCode) {
    const message = String(error?.message || '');
    const publicError = new Error('Nao foi possivel enviar o codigo pelo Resend agora. Tente novamente em alguns minutos.');
    publicError.statusCode = statusCode >= 500 ? 502 : 400;

    if (statusCode === 401 || statusCode === 403) {
        publicError.message = 'Falha na autenticacao do Resend. Confira RESEND_API_KEY no backend.';
        publicError.statusCode = 503;
        return publicError;
    }

    if (statusCode === 422 || /domain|from|sender|verified/i.test(message)) {
        publicError.message = 'O Resend recusou o remetente. Confira EMAIL_FROM e se o dominio esta verificado no Resend.';
        publicError.statusCode = 400;
        return publicError;
    }

    if (/timeout|network|fetch|connection/i.test(message)) {
        publicError.message = 'O servidor nao conseguiu conectar ao Resend. Tente novamente em alguns minutos.';
        publicError.statusCode = 504;
        return publicError;
    }

    return publicError;
}

function buildVerificationEmail({ code, name, ttlMinutes }) {
    const displayName = String(name || '').trim();
    const greeting = displayName ? `Ola, ${displayName}!` : 'Ola!';
    const safeGreeting = escapeHtml(greeting);

    return {
        subject: 'Seu codigo de verificacao Controlar+',
        text: [
            greeting,
            '',
            `Seu codigo de verificacao do Controlar+ e: ${code}`,
            '',
            `Ele expira em ${ttlMinutes} minutos. Se voce nao pediu este cadastro, ignore este e-mail.`,
        ].join('\n'),
        html: `
            <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
                <p>${safeGreeting}</p>
                <p>Seu codigo de verificacao do Controlar+ e:</p>
                <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #d97757;">${code}</p>
                <p>Ele expira em ${ttlMinutes} minutos. Se voce nao pediu este cadastro, ignore este e-mail.</p>
            </div>
        `,
    };
}

async function readResendPayload(response) {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

async function sendVerificationEmailWithResend({ email, from, subject, text, html }) {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    const apiUrl = String(process.env.RESEND_API_URL || DEFAULT_RESEND_API_URL).trim();

    if (!apiKey) {
        const error = new Error('RESEND_API_KEY nao configurada no backend.');
        error.statusCode = 503;
        throw error;
    }

    try {
        console.log(`[EmailVerification] Sending code to ${maskEmail(email)} via Resend from=${from}`);
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to: [email],
                subject,
                text,
                html,
            }),
            timeout: getResendTimeoutMs(),
        });
        const payload = await readResendPayload(response);

        if (!response.ok) {
            const error = new Error(payload?.message || payload?.error || `Resend HTTP ${response.status}`);
            error.statusCode = response.status;
            throw error;
        }

        console.log(`[EmailVerification] Code sent to ${maskEmail(email)} via Resend id=${payload?.id || 'n/a'}`);
    } catch (error) {
        console.error('[EmailVerification] Resend send failed:', {
            statusCode: error?.statusCode,
            message: error?.message,
        });
        throw toPublicResendError(error, error?.statusCode || 502);
    }
}

async function ensureEmailIsAvailable(email) {
    if (!isFirebaseConfigured()) return null;

    const normalizedEmail = validateEmail(email);
    const admin = getFirebaseAdmin();
    const auth = admin.auth();
    const db = admin.firestore();
    let existingUser = null;

    try {
        existingUser = await auth.getUserByEmail(normalizedEmail);
    } catch (error) {
        if (!error || error.code !== 'auth/user-not-found') throw error;
    }

    if (existingUser) {
        const profileSnap = await db.collection('users').doc(existingUser.uid).get();
        if (profileSnap.exists) {
            const error = new Error('Este e-mail ja esta em uso.');
            error.statusCode = 409;
            throw error;
        }
    }

    const profileByEmail = await db
        .collection('users')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

    if (!profileByEmail.empty) {
        const error = new Error('Este e-mail ja esta em uso.');
        error.statusCode = 409;
        throw error;
    }

    return existingUser;
}

async function sendVerificationEmail({ email, code, name, ttlMinutes }) {
    const from = getEmailFrom();
    const { subject, text, html } = buildVerificationEmail({ code, name, ttlMinutes });

    if (isResendConfigured()) {
        await sendVerificationEmailWithResend({ email, from, subject, text, html });
        return;
    }

    const smtpConfigs = getSmtpConfigs();
    let lastError = null;

    for (let index = 0; index < smtpConfigs.length; index += 1) {
        const smtpConfig = smtpConfigs[index];

        try {
            console.log(
                `[EmailVerification] Sending code to ${maskEmail(email)} via ${smtpConfig.host}:${smtpConfig.port} secure=${smtpConfig.secure} requireTLS=${smtpConfig.requireTLS} attempt=${index + 1}/${smtpConfigs.length}`
            );
            const result = await getTransporter(smtpConfig).sendMail({
                from,
                to: email,
                subject,
                text,
                html,
            });
            console.log(`[EmailVerification] Code sent to ${maskEmail(email)} messageId=${result.messageId || 'n/a'}`);
            return;
        } catch (error) {
            lastError = error;
            console.error('[EmailVerification] SMTP send failed:', {
                host: smtpConfig.host,
                port: smtpConfig.port,
                secure: smtpConfig.secure,
                requireTLS: smtpConfig.requireTLS,
                code: error?.code,
                command: error?.command,
                responseCode: error?.responseCode,
                message: error?.message,
            });

            if (index < smtpConfigs.length - 1 && isConnectionFailure(error)) {
                console.warn('[EmailVerification] Retrying SMTP with fallback configuration.');
                continue;
            }

            break;
        }
    }

    throw toPublicSmtpError(lastError);
}

function cleanupExpiredRecords(now = Date.now()) {
    for (const [email, record] of verificationRecords.entries()) {
        if (!record || record.expiresAt <= now) {
            verificationRecords.delete(email);
        }
    }
}

async function requestEmailVerificationCode({ email, name }) {
    const normalizedEmail = validateEmail(email);
    const now = Date.now();
    const startedAt = Date.now();
    cleanupExpiredRecords(now);
    console.log(`[EmailVerification] Code request started for ${maskEmail(normalizedEmail)}`);

    const existingRecord = verificationRecords.get(normalizedEmail);
    if (existingRecord && existingRecord.nextSendAt > now) {
        const remainingSeconds = Math.ceil((existingRecord.nextSendAt - now) / 1000);
        const error = new Error(`Aguarde ${remainingSeconds}s para reenviar o codigo.`);
        error.statusCode = 429;
        error.remainingSeconds = remainingSeconds;
        throw error;
    }

    const existingUser = await ensureEmailIsAvailable(normalizedEmail);
    console.log(`[EmailVerification] Availability checked for ${maskEmail(normalizedEmail)} existingAuthWithoutProfile=${Boolean(existingUser)}`);

    const code = generateCode();
    const ttlMs = getVerificationTtlMs();
    const cooldownMs = getSendCooldownMs();

    await sendVerificationEmail({
        email: normalizedEmail,
        code,
        name,
        ttlMinutes: Math.max(1, Math.round(ttlMs / 60000)),
    });

    verificationRecords.set(normalizedEmail, {
        codeHash: createCodeHash(normalizedEmail, code),
        expiresAt: now + ttlMs,
        nextSendAt: now + cooldownMs,
        attempts: 0,
    });
    console.log(`[EmailVerification] Code request completed for ${maskEmail(normalizedEmail)} in ${Date.now() - startedAt}ms`);

    return {
        email: normalizedEmail,
        expiresInSeconds: Math.floor(ttlMs / 1000),
        resendAfterSeconds: Math.floor(cooldownMs / 1000),
    };
}

function verifyEmailCode({ email, code, consume = false }) {
    const normalizedEmail = validateEmail(email);
    const normalizedCode = String(code || '').trim();
    const now = Date.now();
    cleanupExpiredRecords(now);

    if (!CODE_REGEX.test(normalizedCode)) {
        const error = new Error('Informe o codigo de 6 digitos.');
        error.statusCode = 400;
        throw error;
    }

    const record = verificationRecords.get(normalizedEmail);
    if (!record) {
        const error = new Error('Codigo expirado ou nao solicitado. Envie um novo codigo.');
        error.statusCode = 400;
        throw error;
    }

    if (record.attempts >= getMaxAttempts()) {
        verificationRecords.delete(normalizedEmail);
        const error = new Error('Muitas tentativas. Envie um novo codigo.');
        error.statusCode = 429;
        throw error;
    }

    const incomingHash = createCodeHash(normalizedEmail, normalizedCode);
    if (!timingSafeHexEqual(record.codeHash, incomingHash)) {
        record.attempts += 1;
        const error = new Error('Codigo invalido. Confira o e-mail e tente novamente.');
        error.statusCode = 400;
        error.remainingAttempts = Math.max(getMaxAttempts() - record.attempts, 0);
        throw error;
    }

    if (consume) {
        verificationRecords.delete(normalizedEmail);
    }

    return { email: normalizedEmail };
}

function consumeEmailVerificationCode(email) {
    verificationRecords.delete(normalizeEmail(email));
}

module.exports = {
    consumeEmailVerificationCode,
    ensureEmailIsAvailable,
    isEmailDeliveryConfigured,
    isResendConfigured,
    isSmtpConfigured,
    normalizeEmail,
    requestEmailVerificationCode,
    verifyEmailCode,
};
