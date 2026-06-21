const express = require('express');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const { getFirebaseAdmin, isFirebaseConfigured } = require('../lib/firebaseAdmin');

const router = express.Router();
const fetch = global.fetch || require('node-fetch');

const GOOGLE_PLAY_PACKAGE_NAME =
    process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.gustavodev25.controlarapp';
const GOOGLE_PLAY_PRO_PRODUCT_ID =
    process.env.GOOGLE_PLAY_PRO_PRODUCT_ID || 'controlarapp_pro_monthly';
const GOOGLE_PLAY_TRIAL_OFFER_ID =
    process.env.GOOGLE_PLAY_TRIAL_OFFER_ID || 'trial-7d';
const GOOGLE_PLAY_LEGACY_TRIAL_OFFER_ID = 'pro-monthly-trial-7d';
const GOOGLE_PLAY_TRIAL_OFFER_IDS = new Set([
    GOOGLE_PLAY_TRIAL_OFFER_ID,
    GOOGLE_PLAY_LEGACY_TRIAL_OFFER_ID,
]);
const GOOGLE_PLAY_TRIAL_DAYS = 7;
const PRO_PRICE = 34.90;
const PRO_CURRENCY = 'BRL';
const DAY_MS = 24 * 60 * 60 * 1000;
const GOOGLE_STATUS_REFRESH_THROTTLE_MS = 15 * 60 * 1000;
const GOOGLE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ANDROID_PUBLISHER_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

const ACTIVE_GOOGLE_STATES = new Set([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_CANCELED',
]);
const GOOGLE_PROVIDER_VALUES = new Set(['google', 'google_play', 'play_store']);

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

const GOOGLE_PLAY_BILLING_PERMISSION_HINT =
    'Grant the service account Play Console access to this app with "View financial data" ' +
    '(or account-level "View financial data, orders, and cancellation survey responses") ' +
    'and "Manage orders and subscriptions".';

function base64UrlEncode(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function normalizePrivateKey(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return '';

    const withNewlines = rawValue.replace(/\\n/g, '\n');
    if (withNewlines.includes('-----BEGIN')) return withNewlines;

    try {
        const decoded = Buffer.from(withNewlines, 'base64').toString('utf8').trim();
        if (decoded.includes('-----BEGIN')) return decoded.replace(/\\n/g, '\n');
    } catch {
        // Let crypto surface the useful key error below.
    }

    return withNewlines;
}

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

function getFirebaseAdminClientEmailForComparison() {
    if (process.env.FIREBASE_CLIENT_EMAIL) {
        return process.env.FIREBASE_CLIENT_EMAIL;
    }

    try {
        const serviceAccount = parseJsonOrBase64Json(process.env.FIREBASE_SERVICE_ACCOUNT);
        return serviceAccount?.client_email || null;
    } catch {
        return null;
    }
}

function validateGooglePlayServiceAccountIdentity(clientEmail) {
    const googlePlayEmail = normalizeEmail(clientEmail);
    const firebaseAdminEmail = normalizeEmail(getFirebaseAdminClientEmailForComparison());

    if (!googlePlayEmail) return;

    if (firebaseAdminEmail && googlePlayEmail === firebaseAdminEmail) {
        throw new Error(
            'GOOGLE_PLAY_SERVICE_ACCOUNT must not use the same client_email as Firebase Admin. ' +
            'Use FIREBASE_SERVICE_ACCOUNT for Firebase Auth/Firestore and GOOGLE_PLAY_SERVICE_ACCOUNT for the Play Console Android Publisher API.'
        );
    }

    if (looksLikeFirebaseAdminSdkEmail(googlePlayEmail)) {
        throw new Error(
            'GOOGLE_PLAY_SERVICE_ACCOUNT client_email looks like a Firebase Admin SDK service account. ' +
            'Create or select a Play Console service account and grant it access to orders and subscriptions.'
        );
    }
}

function getGooglePlayServiceAccountIdentity() {
    let serviceAccount = null;
    try {
        serviceAccount = parseJsonOrBase64Json(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT);
    } catch {
        serviceAccount = null;
    }

    const clientEmail = serviceAccount?.client_email || process.env.GOOGLE_PLAY_CLIENT_EMAIL || null;
    const privateKey = serviceAccount?.private_key || process.env.GOOGLE_PLAY_PRIVATE_KEY || null;

    return {
        configured: Boolean(clientEmail && privateKey),
        clientEmail,
        projectId: serviceAccount?.project_id || null,
        packageName: GOOGLE_PLAY_PACKAGE_NAME,
        productId: GOOGLE_PLAY_PRO_PRODUCT_ID,
    };
}

function getGooglePlayServiceAccount() {
    const serviceAccount = parseJsonOrBase64Json(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT);
    const clientEmail = serviceAccount?.client_email || process.env.GOOGLE_PLAY_CLIENT_EMAIL;
    const privateKey = serviceAccount?.private_key || process.env.GOOGLE_PLAY_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
        return null;
    }

    validateGooglePlayServiceAccountIdentity(clientEmail);

    return {
        clientEmail,
        privateKey: normalizePrivateKey(privateKey),
    };
}

function createGoogleServiceAccountJwt() {
    const credentials = getGooglePlayServiceAccount();
    if (!credentials) {
        throw new Error('Google Play service account is not configured');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: credentials.clientEmail,
        scope: GOOGLE_OAUTH_SCOPE,
        aud: GOOGLE_OAUTH_TOKEN_URL,
        iat: nowSeconds,
        exp: nowSeconds + 60 * 60,
    };
    const signingInput =
        `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), {
        key: credentials.privateKey,
    });

    return `${signingInput}.${base64UrlEncode(signature)}`;
}

function getGooglePlayApiBodyMessage(body) {
    return (
        body?.error?.message ||
        body?.error_description ||
        body?.message ||
        ''
    );
}

function isGooglePlayPermissionDenied(response, body) {
    const message = String(getGooglePlayApiBodyMessage(body)).toLowerCase();
    return (
        response.status === 401 ||
        response.status === 403 ||
        message.includes('insufficient permissions') ||
        message.includes('permission')
    );
}

function describeGooglePlayRequest(path) {
    const safePath = String(path || '');
    if (safePath.includes('/purchases/subscriptionsv2/tokens/')) {
        return 'purchases.subscriptionsv2.get';
    }
    if (safePath.includes('/purchases/subscriptions/') && safePath.includes(':acknowledge')) {
        return 'purchases.subscriptions.acknowledge';
    }
    return safePath.replace(/tokens\/[^/]+/g, 'tokens/<redacted>');
}

function buildGooglePlayApiErrorMessage(response, body, path) {
    const bodyMessage = getGooglePlayApiBodyMessage(body);
    if (!isGooglePlayPermissionDenied(response, body)) {
        return `Google Play API failed (${response.status}): ${JSON.stringify(body).slice(0, 240)}`;
    }

    const identity = getGooglePlayServiceAccountIdentity();
    return [
        `Google Play API denied Android Publisher access (${response.status}) for ${GOOGLE_PLAY_PACKAGE_NAME}.`,
        `Configured service account: ${identity.clientEmail || 'not found'}.`,
        GOOGLE_PLAY_BILLING_PERMISSION_HINT,
        'Also confirm Google Play Android Developer API is enabled in the Google Cloud project that owns this service account, then redeploy/restart the backend.',
        bodyMessage ? `Google response: ${bodyMessage}` : null,
        `Google API request: ${describeGooglePlayRequest(path)}`,
    ].filter(Boolean).join(' ');
}

function createGooglePlayApiError(response, body, path) {
    const error = new Error(buildGooglePlayApiErrorMessage(response, body, path));
    error.statusCode = isGooglePlayPermissionDenied(response, body) ? 502 : response.status;
    error.errorCode = isGooglePlayPermissionDenied(response, body)
        ? 'google_play_permission_denied'
        : 'google_play_api_error';
    error.googleStatusCode = response.status;
    return error;
}

function getAdminBearerToken(req) {
    const authorization = String(req.headers.authorization || '').trim();
    if (authorization.toLowerCase().startsWith('bearer ')) {
        return authorization.slice(7).trim();
    }

    return String(req.headers['x-admin-token'] || '').trim();
}

function requireGoogleDiagnosticsToken(req, res, next) {
    const expectedToken = String(process.env.ADMIN_API_TOKEN || '').trim();
    if (!expectedToken) {
        return res.status(503).json({
            success: false,
            error: 'ADMIN_API_TOKEN is not configured',
        });
    }

    const providedToken = getAdminBearerToken(req);
    if (!providedToken || providedToken !== expectedToken) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
        });
    }

    return next();
}

async function getGoogleAccessToken() {
    if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60 * 1000) {
        return cachedAccessToken;
    }

    const assertion = createGoogleServiceAccountJwt();
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }).toString(),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.access_token) {
        throw new Error(`Google OAuth failed (${response.status}): ${JSON.stringify(body).slice(0, 240)}`);
    }

    cachedAccessToken = body.access_token;
    cachedAccessTokenExpiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
    return cachedAccessToken;
}

async function googlePublisherRequest(path, options = {}) {
    const accessToken = await getGoogleAccessToken();
    const response = await fetch(`${GOOGLE_ANDROID_PUBLISHER_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
    });
    const bodyText = await response.text();
    let body = {};
    try {
        body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
        body = { raw: bodyText.slice(0, 240) };
    }

    if (!response.ok) {
        throw createGooglePlayApiError(response, body, path);
    }

    return body;
}

function hashValue(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function obfuscateFirebaseUid(firebaseUid) {
    return hashValue(firebaseUid);
}

function getGooglePurchaseAccountId(purchase) {
    return (
        purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId ||
        purchase?.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers?.obfuscatedExternalAccountId ||
        null
    );
}

function assertGooglePurchaseAccountMatchesUser({ purchase, firebaseUid, requireAccountMatch }) {
    if (!requireAccountMatch) return;

    const accountId = getGooglePurchaseAccountId(purchase);
    if (accountId && accountId !== obfuscateFirebaseUid(firebaseUid)) {
        throw new Error('Google Play purchase is linked to another account');
    }
}

function isGoogleSubscriptionAcknowledgementPending(purchase) {
    return String(purchase?.acknowledgementState || '').trim().toUpperCase() ===
        'ACKNOWLEDGEMENT_STATE_PENDING';
}

function getGoogleAcknowledgeExternalAccountIds({ purchase, firebaseUid }) {
    if (!firebaseUid || !purchase?.outOfAppPurchaseContext) return null;
    if (purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId) return null;

    return {
        obfuscatedAccountId: obfuscateFirebaseUid(firebaseUid),
    };
}

function dateValueToMillis(value) {
    if (!value) return null;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value._seconds === 'number') return value._seconds * 1000;
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

function serializeDateValue(value) {
    const millis = dateValueToMillis(value);
    return millis ? new Date(millis).toISOString() : null;
}

function getLatestProLineItem(purchase) {
    return (Array.isArray(purchase?.lineItems) ? purchase.lineItems : [])
        .filter((item) => item?.productId === GOOGLE_PLAY_PRO_PRODUCT_ID)
        .sort((a, b) => {
            return (dateValueToMillis(b.expiryTime) || 0) - (dateValueToMillis(a.expiryTime) || 0);
        })[0] || null;
}

function resolveGoogleSubscriptionState(purchase, nowMs = Date.now()) {
    const lineItem = getLatestProLineItem(purchase);
    const googleState = String(purchase?.subscriptionState || '').trim().toUpperCase();
    const expiresMs = dateValueToMillis(lineItem?.expiryTime);
    const isExpiredByDate = !expiresMs || expiresMs <= nowMs;
    const isCanceled = googleState === 'SUBSCRIPTION_STATE_CANCELED';
    const hasPro = ACTIVE_GOOGLE_STATES.has(googleState) && !isExpiredByDate;
    const offerId = lineItem?.offerDetails?.offerId || null;
    const startedMs = dateValueToMillis(purchase?.startTime);
    const trialEndsMs =
        offerId && GOOGLE_PLAY_TRIAL_OFFER_IDS.has(offerId) && startedMs
            ? startedMs + GOOGLE_PLAY_TRIAL_DAYS * DAY_MS
            : null;
    const isTrialing = hasPro && trialEndsMs && trialEndsMs > nowMs;

    let status = 'expired';
    if (hasPro) status = isTrialing ? 'trialing' : 'active';
    else if (googleState === 'SUBSCRIPTION_STATE_PENDING') status = 'pending';
    else if (googleState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') status = 'past_due';
    else if (googleState === 'SUBSCRIPTION_STATE_ON_HOLD') status = 'past_due';
    else if (googleState === 'SUBSCRIPTION_STATE_PAUSED') status = 'paused';
    else if (isCanceled) status = 'expired';

    return {
        lineItem,
        googleState,
        hasPro,
        status,
        expiresMs,
        startedMs,
        trialEndsMs,
        isTrialing: Boolean(isTrialing),
        cancelAtPeriodEnd:
            hasPro &&
            (isCanceled || lineItem?.autoRenewingPlan?.autoRenewEnabled === false),
        autoRenewStatus:
            lineItem?.autoRenewingPlan?.autoRenewEnabled === false ? 'disabled' : 'enabled',
    };
}

function mirrorSubscriptionField(update, field, value) {
    if (value === undefined) return;
    update.subscription = update.subscription || {};
    update.profile = update.profile || {};
    update.profile.subscription = update.profile.subscription || {};
    update.subscription[field] = value;
    update.profile.subscription[field] = value;
}

function mirrorPaymentField(update, field, value) {
    if (value === undefined) return;
    update.paymentMethod = update.paymentMethod || {};
    update.profile = update.profile || {};
    update.profile.paymentMethod = update.profile.paymentMethod || {};
    update.paymentMethod[field] = value;
    update.profile.paymentMethod[field] = value;
}

function resolveProvider(sub) {
    return String(sub?.provider || sub?.paymentProvider || sub?.iapSource || '')
        .trim()
        .toLowerCase();
}

function buildStatusSnapshot(sub) {
    if (!sub) {
        return {
            hasPro: false,
            plan: 'free',
            status: 'inactive',
            provider: null,
            expiresAt: null,
            cancelAtPeriodEnd: false,
            subscription: null,
        };
    }

    const now = Date.now();
    const plan = String(sub.plan || '').trim().toLowerCase() || 'free';
    const status = String(sub.status || '').trim().toLowerCase() || 'inactive';
    const expiresMs = dateValueToMillis(sub.expiresAt || sub.renewalDate || sub.nextBillingDate);
    const hasPro =
        (plan === 'pro' || plan === 'premium') &&
        (status === 'active' || status === 'trial' || status === 'trialing') &&
        (!expiresMs || expiresMs > now);

    const subscription = {
        ...sub,
        plan,
        status,
        provider: sub.provider || 'google',
        expiresAt: expiresMs ? new Date(expiresMs).toISOString() : null,
        nextBillingDate: serializeDateValue(sub.nextBillingDate),
        renewalDate: serializeDateValue(sub.renewalDate),
        startedAt: serializeDateValue(sub.startedAt || sub.startDate || sub.createdAt),
        cancelledAt: serializeDateValue(sub.cancelledAt || sub.cancellationDate),
        trialEndsAt: serializeDateValue(sub.trialEndsAt),
        updatedAt: serializeDateValue(sub.updatedAt || sub.lastUpdatedAt),
    };

    return {
        hasPro,
        plan,
        status,
        provider: resolveProvider(sub) || 'google',
        expiresAt: subscription.expiresAt,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd === true,
        autoRenewStatus: sub.autoRenewStatus || null,
        subscription,
    };
}

async function verifyFirebaseUser(req, expectedUid) {
    const authorization = String(req.headers.authorization || '');
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!idToken) {
        const error = new Error('Missing Firebase authorization token');
        error.statusCode = 401;
        throw error;
    }

    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!decoded?.uid || decoded.uid !== expectedUid) {
        const error = new Error('Firebase user does not match subscription account');
        error.statusCode = 403;
        throw error;
    }

    return decoded;
}

async function getGoogleSubscriptionPurchase(purchaseToken) {
    return googlePublisherRequest(
        `/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}` +
        `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`
    );
}

async function listGooglePlaySubscriptions() {
    return googlePublisherRequest(
        `/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}` +
        '/subscriptions'
    );
}

async function listGooglePlayVoidedPurchases() {
    return googlePublisherRequest(
        `/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}` +
        '/purchases/voidedpurchases'
    );
}

async function acknowledgeGoogleSubscription(purchaseToken, productId, externalAccountIds = null) {
    const body = externalAccountIds?.obfuscatedAccountId
        ? { externalAccountIds }
        : {};

    return googlePublisherRequest(
        `/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}` +
        `/purchases/subscriptions/${encodeURIComponent(productId)}` +
        `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
        { method: 'POST', body: JSON.stringify(body) }
    );
}

async function acknowledgeGoogleSubscriptionIfNeeded({ firebaseUid, purchaseToken, purchase, state }) {
    const acknowledgementState = String(purchase?.acknowledgementState || '').trim().toUpperCase();

    if (!state?.hasPro || !isGoogleSubscriptionAcknowledgementPending(purchase)) {
        return {
            attempted: false,
            acknowledged: acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
            acknowledgementState: acknowledgementState || null,
        };
    }

    try {
        await acknowledgeGoogleSubscription(
            purchaseToken,
            GOOGLE_PLAY_PRO_PRODUCT_ID,
            getGoogleAcknowledgeExternalAccountIds({ purchase, firebaseUid })
        );
        return {
            attempted: true,
            acknowledged: true,
            acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        };
    } catch (error) {
        console.error('[Google Play] acknowledge failed:', error);
        return {
            attempted: true,
            acknowledged: false,
            acknowledgementState,
            error: error.message,
        };
    }
}

async function bindGooglePurchaseToUser({ admin, firebaseUid, purchaseToken }) {
    const db = admin.firestore();
    const tokenHash = hashValue(purchaseToken);
    const mappingRef = db.collection('googlePlayPurchases').doc(tokenHash);
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(mappingRef);
        const existingUid = existing.exists ? existing.data()?.firebaseUid : null;

        if (existingUid && existingUid !== firebaseUid) {
            throw new Error('Google Play purchase is already linked to another account');
        }

        transaction.set(mappingRef, {
            firebaseUid,
            purchaseToken,
            productId: GOOGLE_PLAY_PRO_PRODUCT_ID,
            updatedAt: serverTimestamp,
        }, { merge: true });
    });

    return tokenHash;
}

async function persistGoogleSubscription({
    firebaseUid,
    purchaseToken,
    purchase,
    requireAccountMatch = false,
}) {
    const state = resolveGoogleSubscriptionState(purchase);
    if (!state.lineItem) {
        throw new Error(`Google Play purchase does not contain ${GOOGLE_PLAY_PRO_PRODUCT_ID}`);
    }

    assertGooglePurchaseAccountMatchesUser({ purchase, firebaseUid, requireAccountMatch });

    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
    const deleteField = admin.firestore.FieldValue.delete();
    const userRef = db.collection('users').doc(firebaseUid);
    const tokenHash = await bindGooglePurchaseToUser({ admin, firebaseUid, purchaseToken });
    const latestOrderId =
        state.lineItem.latestSuccessfulOrderId ||
        purchase.latestOrderId ||
        null;
    const offerId = state.lineItem?.offerDetails?.offerId || null;
    const basePlanId = state.lineItem?.offerDetails?.basePlanId || null;
    const update = {};

    mirrorSubscriptionField(update, 'plan', 'pro');
    mirrorSubscriptionField(update, 'status', state.status);
    mirrorSubscriptionField(update, 'provider', 'google');
    mirrorSubscriptionField(update, 'paymentProvider', 'google');
    mirrorSubscriptionField(update, 'iapSource', 'google_play');
    mirrorSubscriptionField(update, 'productId', GOOGLE_PLAY_PRO_PRODUCT_ID);
    mirrorSubscriptionField(update, 'billingCycle', 'monthly');
    mirrorSubscriptionField(update, 'price', PRO_PRICE);
    mirrorSubscriptionField(update, 'currency', PRO_CURRENCY);
    mirrorSubscriptionField(update, 'updatedAt', serverTimestamp);
    mirrorSubscriptionField(update, 'serverStatusCheckedAt', serverTimestamp);
    mirrorSubscriptionField(update, 'googleSubscriptionState', state.googleState);
    mirrorSubscriptionField(update, 'googlePurchaseToken', deleteField);
    mirrorSubscriptionField(update, 'googlePurchaseTokenHash', tokenHash);
    mirrorSubscriptionField(update, 'googleLatestOrderId', latestOrderId);
    mirrorSubscriptionField(update, 'googleBasePlanId', basePlanId);
    mirrorSubscriptionField(update, 'googleOfferId', offerId);
    mirrorSubscriptionField(update, 'googlePlayVerified', true);
    mirrorSubscriptionField(update, 'cancelAtPeriodEnd', state.cancelAtPeriodEnd);
    mirrorSubscriptionField(update, 'autoRenewStatus', state.autoRenewStatus);

    if (state.startedMs) {
        mirrorSubscriptionField(update, 'startedAt', new Date(state.startedMs));
    }
    if (state.expiresMs) {
        const expiresAt = new Date(state.expiresMs);
        mirrorSubscriptionField(update, 'expiresAt', expiresAt);
        mirrorSubscriptionField(update, 'nextBillingDate', expiresAt);
        mirrorSubscriptionField(update, 'renewalDate', expiresAt);
    }
    if (state.trialEndsMs) {
        mirrorSubscriptionField(update, 'trialEndsAt', new Date(state.trialEndsMs));
    } else {
        mirrorSubscriptionField(update, 'trialEndsAt', deleteField);
    }
    if (state.cancelAtPeriodEnd || !state.hasPro) {
        mirrorSubscriptionField(update, 'cancelledAt', serverTimestamp);
    } else {
        mirrorSubscriptionField(update, 'cancelledAt', deleteField);
    }

    mirrorPaymentField(update, 'type', 'google_play');
    mirrorPaymentField(update, 'brand', 'Google Play');
    mirrorPaymentField(update, 'provider', 'google');
    mirrorPaymentField(update, 'updatedAt', serverTimestamp);

    await userRef.set(update, { merge: true });

    if (state.hasPro) {
        const paymentId = `google_${hashValue(latestOrderId || purchaseToken).slice(0, 40)}`;
        await userRef.collection('payments').doc(paymentId).set({
            id: paymentId,
            provider: 'google',
            paymentMethod: { type: 'google_play', brand: 'Google Play' },
            productId: GOOGLE_PLAY_PRO_PRODUCT_ID,
            purchaseTokenHash: tokenHash,
            orderId: latestOrderId,
            amount: state.isTrialing ? 0 : PRO_PRICE,
            currency: PRO_CURRENCY,
            status: state.isTrialing ? 'trialing' : 'paid',
            createdAt: state.startedMs ? new Date(state.startedMs) : serverTimestamp,
            paidAt: state.startedMs ? new Date(state.startedMs) : serverTimestamp,
            expiresAt: state.expiresMs ? new Date(state.expiresMs) : null,
            updatedAt: serverTimestamp,
            googlePlayVerified: true,
        }, { merge: true });
    }

    return state;
}

async function refreshGoogleSubscriptionForUser({ firebaseUid, sub, forceRefresh = false }) {
    if (!sub || !GOOGLE_PROVIDER_VALUES.has(resolveProvider(sub))) return null;

    const admin = getFirebaseAdmin();
    const tokenHash = sub.googlePurchaseTokenHash;
    const mappingDoc = tokenHash
        ? await admin.firestore().collection('googlePlayPurchases').doc(tokenHash).get()
        : null;
    const purchaseToken = mappingDoc?.exists
        ? mappingDoc.data()?.purchaseToken
        : sub.googlePurchaseToken;
    if (!purchaseToken || !getGooglePlayServiceAccount()) return null;

    const checkedMs = dateValueToMillis(sub.serverStatusCheckedAt);
    if (!forceRefresh && checkedMs && checkedMs > Date.now() - GOOGLE_STATUS_REFRESH_THROTTLE_MS) {
        return null;
    }

    const purchase = await getGoogleSubscriptionPurchase(purchaseToken);
    const persisted = await persistGoogleSubscription({ firebaseUid, purchaseToken, purchase });
    await acknowledgeGoogleSubscriptionIfNeeded({
        firebaseUid,
        purchaseToken,
        purchase,
        state: persisted,
    });
    return persisted;
}

function getRtdnToken(req) {
    const authorization = String(req.headers.authorization || '');
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    return String(req.query.token || req.headers['x-google-play-webhook-token'] || bearer || '');
}

async function findFirebaseUidByPurchaseToken(purchaseToken) {
    const admin = getFirebaseAdmin();
    const doc = await admin.firestore()
        .collection('googlePlayPurchases')
        .doc(hashValue(purchaseToken))
        .get();
    return doc.exists ? doc.data()?.firebaseUid || null : null;
}

router.post('/validate-purchase', async (req, res) => {
    const { firebaseUid, productId, purchaseToken } = req.body || {};

    if (!firebaseUid || !purchaseToken) {
        return res.status(400).json({ error: 'Missing firebaseUid or purchaseToken' });
    }
    if (productId && productId !== GOOGLE_PLAY_PRO_PRODUCT_ID) {
        return res.status(400).json({ error: 'Google Play product mismatch' });
    }

    try {
        await verifyFirebaseUser(req, firebaseUid);
        const purchase = await getGoogleSubscriptionPurchase(purchaseToken);
        const persisted = await persistGoogleSubscription({
            firebaseUid,
            purchaseToken,
            purchase,
            requireAccountMatch: true,
        });

        const acknowledgement = await acknowledgeGoogleSubscriptionIfNeeded({
            firebaseUid,
            purchaseToken,
            purchase,
            state: persisted,
        });

        return res.json({
            hasPro: persisted.hasPro,
            status: persisted.status,
            productId: GOOGLE_PLAY_PRO_PRODUCT_ID,
            expiresAt: persisted.expiresMs ? new Date(persisted.expiresMs).toISOString() : null,
            cancelAtPeriodEnd: persisted.cancelAtPeriodEnd,
            autoRenewStatus: persisted.autoRenewStatus,
            acknowledged: acknowledgement.acknowledged,
            acknowledgementState: acknowledgement.acknowledgementState,
            acknowledgementError: acknowledgement.error,
        });
    } catch (error) {
        console.error('[Google Play] validate-purchase error:', error);
        return res.status(error.statusCode || 400).json({
            hasPro: false,
            error: error.message,
            errorCode: error.errorCode || 'google_play_validate_purchase_failed',
        });
    }
});

router.get('/diagnostics', requireGoogleDiagnosticsToken, async (req, res) => {
    const identity = getGooglePlayServiceAccountIdentity();
    const checks = [];

    try {
        await getGoogleAccessToken();
        checks.push({
            name: 'oauth_access_token',
            status: 'pass',
        });
    } catch (error) {
        checks.push({
            name: 'oauth_access_token',
            status: 'fail',
            error: error.message,
        });

        return res.status(200).json({
            success: false,
            serviceAccount: identity,
            checks,
        });
    }

    let success = true;

    for (const check of [
        {
            name: 'android_publisher_subscription_catalog_access',
            googleApiRequest: 'monetization.subscriptions.list',
            run: listGooglePlaySubscriptions,
            readSummary: (body) => ({
                subscriptionsCount: Array.isArray(body?.subscriptions)
                    ? body.subscriptions.length
                    : null,
            }),
        },
        {
            name: 'google_play_purchases_api_access',
            googleApiRequest: 'purchases.voidedpurchases.list',
            run: listGooglePlayVoidedPurchases,
            readSummary: (body) => ({
                voidedPurchasesCount: Array.isArray(body?.voidedPurchases)
                    ? body.voidedPurchases.length
                    : null,
            }),
        },
    ]) {
        try {
            const body = await check.run();
            checks.push({
                name: check.name,
                status: 'pass',
                googleApiRequest: check.googleApiRequest,
                ...check.readSummary(body),
            });
        } catch (error) {
            success = false;
            checks.push({
                name: check.name,
                status: 'fail',
                googleApiRequest: check.googleApiRequest,
                errorCode: error.errorCode || 'google_play_api_error',
                googleStatusCode: error.googleStatusCode || null,
                error: error.message,
            });
        }
    }

    return res.status(200).json({
        success,
        serviceAccount: identity,
        checks,
    });
});

router.get('/subscription-status', async (req, res) => {
    const firebaseUid = String(req.query.firebaseUid || '').trim();
    if (!firebaseUid) return res.status(400).json({ error: 'Missing firebaseUid' });

    if (!isFirebaseConfigured()) {
        return res.json(buildStatusSnapshot(null));
    }

    try {
        await verifyFirebaseUser(req, firebaseUid);
        const admin = getFirebaseAdmin();
        const userRef = admin.firestore().collection('users').doc(firebaseUid);
        let doc = await userRef.get();
        if (!doc.exists) return res.json(buildStatusSnapshot(null));

        let data = doc.data() || {};
        let sub = data.subscription || data.profile?.subscription;
        const forceRefresh = req.query.refresh === 'true' || req.query.forceRefresh === 'true';

        try {
            const refreshed = await refreshGoogleSubscriptionForUser({
                firebaseUid,
                sub,
                forceRefresh,
            });
            if (refreshed) {
                doc = await userRef.get();
                data = doc.data() || {};
                sub = data.subscription || data.profile?.subscription;
            }
        } catch (refreshError) {
            console.error('[Google Play] subscription refresh failed:', refreshError.message);
        }

        return res.json(buildStatusSnapshot(sub));
    } catch (error) {
        console.error('[Google Play] subscription-status error:', error);
        return res.status(error.statusCode || 500).json({
            error: error.message,
            errorCode: error.errorCode || 'google_play_subscription_status_failed',
        });
    }
});

router.post('/rtdn', async (req, res) => {
    const configuredToken = String(process.env.GOOGLE_PLAY_RTDN_TOKEN || '').trim();
    if (!configuredToken || getRtdnToken(req) !== configuredToken) {
        return res.status(401).json({ error: 'Invalid Google Play RTDN token' });
    }

    try {
        const encodedData = req.body?.message?.data;
        const notification = encodedData
            ? JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'))
            : req.body;

        if (notification?.testNotification) {
            return res.status(204).send();
        }

        const purchaseToken = notification?.subscriptionNotification?.purchaseToken;
        if (!purchaseToken) {
            return res.status(204).send();
        }

        const firebaseUid = await findFirebaseUidByPurchaseToken(purchaseToken);
        if (!firebaseUid) {
            console.warn('[Google Play] Ignoring RTDN for an unlinked purchase token');
            return res.status(204).send();
        }

        const purchase = await getGoogleSubscriptionPurchase(purchaseToken);
        const persisted = await persistGoogleSubscription({ firebaseUid, purchaseToken, purchase });
        await acknowledgeGoogleSubscriptionIfNeeded({
            firebaseUid,
            purchaseToken,
            purchase,
            state: persisted,
        });
        return res.status(204).send();
    } catch (error) {
        console.error('[Google Play] RTDN error:', error);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;
module.exports._test = {
    GOOGLE_PLAY_PRO_PRODUCT_ID,
    GOOGLE_PLAY_TRIAL_OFFER_ID,
    GOOGLE_PLAY_TRIAL_DAYS,
    getGoogleAcknowledgeExternalAccountIds,
    getGooglePurchaseAccountId,
    getLatestProLineItem,
    isGoogleSubscriptionAcknowledgementPending,
    obfuscateFirebaseUid,
    resolveGoogleSubscriptionState,
    assertGooglePurchaseAccountMatchesUser,
    validateGooglePlayServiceAccountIdentity,
};
