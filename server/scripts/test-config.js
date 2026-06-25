#!/usr/bin/env node
/**
 * Server configuration check.
 * Prints only whether sensitive env vars are present and parseable.
 */

require('dotenv').config();

const { buildAppleIapDiagnostics } = require('../lib/appleIapDiagnostics');

function parseJsonOrBase64Json(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return null;

    try {
        return JSON.parse(rawValue);
    } catch {
        return JSON.parse(Buffer.from(rawValue, 'base64').toString('utf8'));
    }
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function looksLikeFirebaseAdminSdkEmail(value) {
    return normalizeEmail(value).includes('firebase-adminsdk');
}

function checkServiceAccount(label, value, options = {}) {
    if (!value) {
        console.log(`  ${label}: missing`);
        return { configured: false, valid: false, clientEmail: null };
    }

    try {
        const parsed = parseJsonOrBase64Json(value);
        const clientEmail = parsed.client_email || null;
        let valid = Boolean(clientEmail && parsed.private_key);

        console.log(`  ${label}: configured`);
        console.log(`    Project ID: ${parsed.project_id || 'not found'}`);
        console.log(`    Client Email: ${clientEmail || 'not found'}`);
        console.log(`    Private Key: ${parsed.private_key ? 'configured' : 'missing'}`);

        if (parsed.type && parsed.type !== 'service_account') {
            console.log(`    Error: expected type "service_account", got "${parsed.type}"`);
            valid = false;
        }

        if (options.rejectFirebaseAdminSdk && looksLikeFirebaseAdminSdkEmail(clientEmail)) {
            console.log('    Error: this looks like a Firebase Admin SDK credential, not a Google Play service account.');
            valid = false;
        }

        return { configured: true, valid, clientEmail };
    } catch (error) {
        console.log(`  ${label}: invalid (${error.message})`);
        return { configured: true, valid: false, clientEmail: null };
    }
}

console.log('Checking server configuration...\n');

const checks = {
    pluggy: {
        clientId: Boolean(process.env.PLUGGY_CLIENT_ID),
        clientSecret: Boolean(process.env.PLUGGY_CLIENT_SECRET),
        sandbox: process.env.PLUGGY_SANDBOX || 'not set (default: false)',
    },
    firebase: {
        serviceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
        projectId: Boolean(process.env.FIREBASE_PROJECT_ID),
        privateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
        clientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    },
    googlePlay: {
        serviceAccount: Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT),
        clientEmail: Boolean(process.env.GOOGLE_PLAY_CLIENT_EMAIL),
        privateKey: Boolean(process.env.GOOGLE_PLAY_PRIVATE_KEY),
        packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.gustavodev25.controlarapp',
        productId: process.env.GOOGLE_PLAY_PRO_PRODUCT_ID || 'controlarapp_pro_monthly',
        trialOfferId: process.env.GOOGLE_PLAY_TRIAL_OFFER_ID || 'trial-7d',
        rtdnToken: Boolean(process.env.GOOGLE_PLAY_RTDN_TOKEN),
    },
    emailVerification: {
        smtpHost: Boolean(process.env.SMTP_HOST),
        smtpPort: process.env.SMTP_PORT || '465',
        smtpSecure: process.env.SMTP_SECURE || 'true',
        smtpUser: Boolean(process.env.SMTP_USER),
        smtpPass: Boolean(process.env.SMTP_PASS),
    },
    server: {
        port: process.env.BACKEND_PORT || process.env.PORT || '3001',
    },
};

console.log('Pluggy Configuration:');
console.log(`  Client ID: ${checks.pluggy.clientId ? 'configured' : 'missing'}`);
console.log(`  Client Secret: ${checks.pluggy.clientSecret ? 'configured' : 'missing'}`);
console.log(`  Sandbox Mode: ${checks.pluggy.sandbox}`);

console.log('\nFirebase Admin Configuration:');
let firebaseConfigured = false;
let firebaseClientEmail = null;
if (checks.firebase.serviceAccount) {
    const result = checkServiceAccount('FIREBASE_SERVICE_ACCOUNT', process.env.FIREBASE_SERVICE_ACCOUNT);
    firebaseConfigured = result.valid;
    firebaseClientEmail = result.clientEmail;
} else if (checks.firebase.projectId && checks.firebase.privateKey && checks.firebase.clientEmail) {
    firebaseConfigured = true;
    firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    console.log('  Individual variables: configured');
    console.log(`    Client Email: ${firebaseClientEmail}`);
} else {
    console.log('  Firebase Admin: missing');
    console.log('  Configure FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL.');
}

const appleIapDiagnostics = buildAppleIapDiagnostics({
    targetEnvironment: process.env.APPLE_DIAGNOSTIC_TARGET_ENVIRONMENT || 'sandbox',
    firebaseStatus: {
        configured: firebaseConfigured,
        error: firebaseConfigured ? null : 'Firebase Admin variables are missing or invalid',
    },
});

console.log('\nApple IAP Configuration:');
console.log(`  Status: ${appleIapDiagnostics.status}`);
console.log(`  Target Environment: ${appleIapDiagnostics.targetEnvironment}`);
console.log(`  Ready for iOS test: ${appleIapDiagnostics.readyForIosTest ? 'yes' : 'no'}`);
console.log(`  Can attempt iOS test: ${appleIapDiagnostics.canAttemptIosTest ? 'yes' : 'no'}`);
console.log(`  Bundle ID: ${appleIapDiagnostics.config.bundleId.value}`);
console.log(`  Product ID: ${appleIapDiagnostics.config.productId}`);
for (const check of appleIapDiagnostics.checks) {
    if (check.status === 'pass') continue;
    console.log(`  - [${check.status}] ${check.label}: ${check.message}`);
    if (check.impact) console.log(`    Impact: ${check.impact}`);
    if (check.fix) console.log(`    Fix: ${check.fix}`);
}
if (appleIapDiagnostics.summary.fail === 0 && appleIapDiagnostics.summary.warn === 0) {
    console.log('  All Apple IAP checks passed.');
}

console.log('\nGoogle Play Billing Configuration:');
let googlePlayConfigured = false;
let googlePlayClientEmail = null;
if (checks.googlePlay.serviceAccount) {
    const result = checkServiceAccount('GOOGLE_PLAY_SERVICE_ACCOUNT', process.env.GOOGLE_PLAY_SERVICE_ACCOUNT, {
        rejectFirebaseAdminSdk: true,
    });
    googlePlayConfigured = result.valid;
    googlePlayClientEmail = result.clientEmail;
} else if (checks.googlePlay.clientEmail && checks.googlePlay.privateKey) {
    googlePlayConfigured = true;
    googlePlayClientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL;
    console.log('  Individual variables: configured');
    console.log(`    Client Email: ${googlePlayClientEmail}`);
    if (looksLikeFirebaseAdminSdkEmail(googlePlayClientEmail)) {
        googlePlayConfigured = false;
        console.log('    Error: this looks like a Firebase Admin SDK credential, not a Google Play service account.');
    }
} else {
    console.log('  Google Play Billing: missing');
    console.log('  Configure GOOGLE_PLAY_SERVICE_ACCOUNT or GOOGLE_PLAY_CLIENT_EMAIL + GOOGLE_PLAY_PRIVATE_KEY.');
}
console.log(`  Package Name: ${checks.googlePlay.packageName}`);
console.log(`  Product ID: ${checks.googlePlay.productId}`);
console.log(`  Trial Offer ID: ${checks.googlePlay.trialOfferId}`);
console.log(`  RTDN Token: ${checks.googlePlay.rtdnToken ? 'configured' : 'not set'}`);
console.log('  Required Play Console permissions:');
console.log('    - View financial data (or account-level View financial data, orders, and cancellation survey responses)');
console.log('    - Manage orders and subscriptions');

console.log('\nEmail Verification SMTP Configuration:');
console.log(`  SMTP Host: ${checks.emailVerification.smtpHost ? 'configured' : 'missing'}`);
console.log(`  SMTP Port: ${checks.emailVerification.smtpPort}`);
console.log(`  SMTP Secure: ${checks.emailVerification.smtpSecure}`);
console.log(`  SMTP User: ${checks.emailVerification.smtpUser ? 'configured' : 'missing'}`);
console.log(`  SMTP Pass: ${checks.emailVerification.smtpPass ? 'configured' : 'missing'}`);

const sameCredentialEmail =
    firebaseClientEmail &&
    googlePlayClientEmail &&
    normalizeEmail(firebaseClientEmail) === normalizeEmail(googlePlayClientEmail);

if (sameCredentialEmail) {
    firebaseConfigured = false;
    googlePlayConfigured = false;
    console.log('\nCredential Separation: invalid');
    console.log('  FIREBASE_* and GOOGLE_PLAY_* resolve to the same client_email.');
    console.log('  Use Firebase Admin credentials for Auth/Firestore and a Play Console service account for Android Publisher API.');
}

console.log('\nServer Configuration:');
console.log(`  Port: ${checks.server.port}`);

console.log('\n' + '='.repeat(50));

const pluggyConfigured = checks.pluggy.clientId && checks.pluggy.clientSecret;
const appleIapConfigured = appleIapDiagnostics.canAttemptIosTest;
const emailVerificationConfigured =
    checks.emailVerification.smtpHost &&
    checks.emailVerification.smtpUser &&
    checks.emailVerification.smtpPass;
const allRequiredConfigured =
    pluggyConfigured &&
    firebaseConfigured &&
    googlePlayConfigured &&
    appleIapConfigured &&
    emailVerificationConfigured;

if (allRequiredConfigured) {
    console.log('All required configuration is present.');
    console.log('You can start the server with: npm start');
    process.exit(0);
}

console.log('Some required configuration is missing:');
if (!pluggyConfigured) {
    console.log('  - Configure PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET.');
}
if (!firebaseConfigured) {
    console.log('  - Configure Firebase Admin variables.');
}
if (!appleIapConfigured) {
    console.log('  - Configure Apple IAP variables or run /api/diagnostics/apple-iap?target=sandbox for details.');
}
if (!googlePlayConfigured) {
    console.log('  - Configure Google Play Billing variables.');
}
if (!emailVerificationConfigured) {
    console.log('  - Configure SMTP_HOST, SMTP_USER and SMTP_PASS for email verification.');
}
console.log('\nSee server/.env.example and docs/CONFIGURAR_ASSINATURAS_APPLE_GOOGLE.md.');
process.exit(1);
