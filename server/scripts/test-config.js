#!/usr/bin/env node
/**
 * Server configuration check.
 * Prints only whether sensitive env vars are present and parseable.
 */

require('dotenv').config();

function parseJsonOrBase64Json(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return null;

    try {
        return JSON.parse(rawValue);
    } catch {
        return JSON.parse(Buffer.from(rawValue, 'base64').toString('utf8'));
    }
}

function checkServiceAccount(label, value) {
    if (!value) {
        console.log(`  ${label}: missing`);
        return false;
    }

    try {
        const parsed = parseJsonOrBase64Json(value);
        console.log(`  ${label}: configured`);
        console.log(`    Project ID: ${parsed.project_id || 'not found'}`);
        console.log(`    Client Email: ${parsed.client_email || 'not found'}`);
        console.log(`    Private Key: ${parsed.private_key ? 'configured' : 'missing'}`);
        return Boolean(parsed.client_email && parsed.private_key);
    } catch (error) {
        console.log(`  ${label}: invalid (${error.message})`);
        return false;
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
        trialOfferId: process.env.GOOGLE_PLAY_TRIAL_OFFER_ID || 'pro-monthly-trial-7d',
        rtdnToken: Boolean(process.env.GOOGLE_PLAY_RTDN_TOKEN),
    },
    server: {
        port: process.env.PORT || '3001',
    },
};

console.log('Pluggy Configuration:');
console.log(`  Client ID: ${checks.pluggy.clientId ? 'configured' : 'missing'}`);
console.log(`  Client Secret: ${checks.pluggy.clientSecret ? 'configured' : 'missing'}`);
console.log(`  Sandbox Mode: ${checks.pluggy.sandbox}`);

console.log('\nFirebase Admin Configuration:');
let firebaseConfigured = false;
if (checks.firebase.serviceAccount) {
    firebaseConfigured = checkServiceAccount('FIREBASE_SERVICE_ACCOUNT', process.env.FIREBASE_SERVICE_ACCOUNT);
} else if (checks.firebase.projectId && checks.firebase.privateKey && checks.firebase.clientEmail) {
    firebaseConfigured = true;
    console.log('  Individual variables: configured');
} else {
    console.log('  Firebase Admin: missing');
    console.log('  Configure FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL.');
}

console.log('\nGoogle Play Billing Configuration:');
let googlePlayConfigured = false;
if (checks.googlePlay.serviceAccount) {
    googlePlayConfigured = checkServiceAccount('GOOGLE_PLAY_SERVICE_ACCOUNT', process.env.GOOGLE_PLAY_SERVICE_ACCOUNT);
} else if (checks.googlePlay.clientEmail && checks.googlePlay.privateKey) {
    googlePlayConfigured = true;
    console.log('  Individual variables: configured');
} else {
    console.log('  Google Play Billing: missing');
    console.log('  Configure GOOGLE_PLAY_SERVICE_ACCOUNT or GOOGLE_PLAY_CLIENT_EMAIL + GOOGLE_PLAY_PRIVATE_KEY.');
}
console.log(`  Package Name: ${checks.googlePlay.packageName}`);
console.log(`  Product ID: ${checks.googlePlay.productId}`);
console.log(`  Trial Offer ID: ${checks.googlePlay.trialOfferId}`);
console.log(`  RTDN Token: ${checks.googlePlay.rtdnToken ? 'configured' : 'not set'}`);

console.log('\nServer Configuration:');
console.log(`  Port: ${checks.server.port}`);

console.log('\n' + '='.repeat(50));

const pluggyConfigured = checks.pluggy.clientId && checks.pluggy.clientSecret;
const allRequiredConfigured = pluggyConfigured && firebaseConfigured && googlePlayConfigured;

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
if (!googlePlayConfigured) {
    console.log('  - Configure Google Play Billing variables.');
}
console.log('\nSee server/.env.example and docs/CONFIGURAR_ASSINATURAS_APPLE_GOOGLE.md.');
process.exit(1);
