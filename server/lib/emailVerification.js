const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getFirebaseAdmin, isFirebaseConfigured } = require('./firebaseAdmin');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

const verificationRecords = new Map();
let transporter = null;

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

function getSmtpConfig() {
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

    return {
        host,
        port,
        secure,
        auth: { user, pass },
    };
}

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport(getSmtpConfig());
    }
    return transporter;
}

function isSmtpConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function ensureEmailIsAvailable(email) {
    if (!isFirebaseConfigured()) return;

    try {
        const admin = getFirebaseAdmin();
        await admin.auth().getUserByEmail(email);
        const error = new Error('Este e-mail ja esta em uso.');
        error.statusCode = 409;
        throw error;
    } catch (error) {
        if (error && error.code === 'auth/user-not-found') return;
        throw error;
    }
}

async function sendVerificationEmail({ email, code, name, ttlMinutes }) {
    const smtpConfig = getSmtpConfig();
    const from = process.env.SMTP_FROM || `"Controlar+" <${smtpConfig.auth.user}>`;
    const displayName = String(name || '').trim();
    const greeting = displayName ? `Ola, ${displayName}!` : 'Ola!';
    const safeGreeting = escapeHtml(greeting);

    await getTransporter().sendMail({
        from,
        to: email,
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
    });
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
    cleanupExpiredRecords(now);

    const existingRecord = verificationRecords.get(normalizedEmail);
    if (existingRecord && existingRecord.nextSendAt > now) {
        const remainingSeconds = Math.ceil((existingRecord.nextSendAt - now) / 1000);
        const error = new Error(`Aguarde ${remainingSeconds}s para reenviar o codigo.`);
        error.statusCode = 429;
        error.remainingSeconds = remainingSeconds;
        throw error;
    }

    await ensureEmailIsAvailable(normalizedEmail);

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
    isSmtpConfigured,
    normalizeEmail,
    requestEmailVerificationCode,
    verifyEmailCode,
};
