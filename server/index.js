require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pluggyRoutes = require('./api/pluggy');
const { isFirebaseConfigured, getFirebaseInitStatus } = require('./lib/firebaseAdmin');
const { isSmtpConfigured } = require('./lib/emailVerification');
const {
    buildAppleIapDiagnostics,
    renderAppleIapDiagnosticsHtml,
} = require('./lib/appleIapDiagnostics');

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 3001;
console.log('[Server] PORT from env:', process.env.PORT);
console.log('[Server] BACKEND_PORT from env:', process.env.BACKEND_PORT);
console.log('[Server] Using PORT:', PORT);

// O seu middleware original já inicializa o Firebase com sucesso lendo o FIREBASE_SERVICE_ACCOUNT
const { limiter, securityHeaders } = require('./middleware/security');

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(limiter);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));

// Importante: garante a leitura correta do body em JSON (inclusive para os webhooks)
// Stripe webhook precisa de raw body — NÃO parsear JSON no /api/stripe/webhook
app.use((req, res, next) => {
    if (req.originalUrl === '/api/stripe/webhook') {
        return next();
    }
    express.json({ limit: '256kb' })(req, res, next);
});

app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        stripe: process.env.STRIPE_SECRET_KEY ? 'configured' : 'missing',
        googlePlay: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT ? 'configured' : 'missing',
        firebase: require('./lib/firebaseAdmin').isFirebaseConfigured() ? 'connected' : 'missing',
        smtp: isSmtpConfigured() ? 'configured' : 'missing',
    });
});

app.get('/api/diagnostics', (req, res) => {
    const firebaseStatus = getFirebaseInitStatus();
    const pluggyAuthConfigured = !!process.env.PLUGGY_CLIENT_ID && !!process.env.PLUGGY_CLIENT_SECRET;
    const appleIapDiagnostics = buildAppleIapDiagnostics({
        targetEnvironment: req.query.appleTarget || req.query.target || 'sandbox',
        firebaseStatus,
    });

    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: { port: PORT },
        config: {
            pluggyClientId: !!process.env.PLUGGY_CLIENT_ID,
            pluggyClientSecret: !!process.env.PLUGGY_CLIENT_SECRET,
            pluggySandbox: process.env.PLUGGY_SANDBOX || 'false',
            pluggyAuthConfigured,
            googlePlayConfigured: !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT,
            firebaseConfigured: isFirebaseConfigured(),
            firebaseInitError: firebaseStatus.error,
            smtpConfigured: isSmtpConfigured(),
            appleIap: {
                status: appleIapDiagnostics.status,
                readyForIosTest: appleIapDiagnostics.readyForIosTest,
                canAttemptIosTest: appleIapDiagnostics.canAttemptIosTest,
                targetEnvironment: appleIapDiagnostics.targetEnvironment,
                fail: appleIapDiagnostics.summary.fail,
                warn: appleIapDiagnostics.summary.warn,
                endpoint: '/api/diagnostics/apple-iap?target=sandbox',
                panel: '/api/diagnostics/apple-iap/panel?target=sandbox',
            },
            oauthCallbackEnabled: true,
        }
    });
});

app.get('/api/diagnostics/apple-iap', (req, res) => {
    const diagnostics = buildAppleIapDiagnostics({
        targetEnvironment: req.query.target || req.query.environment || 'sandbox',
    });

    if (String(req.query.format || '').toLowerCase() === 'html') {
        res.type('html').send(renderAppleIapDiagnosticsHtml(diagnostics));
        return;
    }

    res.json(diagnostics);
});

app.get('/api/diagnostics/apple-iap/panel', (req, res) => {
    const diagnostics = buildAppleIapDiagnostics({
        targetEnvironment: req.query.target || req.query.environment || 'sandbox',
    });
    res.type('html').send(renderAppleIapDiagnosticsHtml(diagnostics));
});

app.use('/api/pluggy', pluggyRoutes);
app.use('/api/auth', require('./api/auth'));
app.use('/api/stripe', require('./api/stripe'));
app.use('/api/apple', require('./api/apple'));
app.use('/api/google', require('./api/google'));
app.use('/api/admin', require('./api/admin'));
console.log('[Server] Rotas Stripe, Apple IAP e Google Play Billing carregadas ✅');

app.use((err, req, res, next) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ERROR:`, err.message);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Servidor] Rodando na porta ${PORT} (Railway Ready) 🚂`);
});
