/**
 * End-to-end IAP flow test — covers the EXACT lifecycle:
 *
 *   1. User signs up with 7-day free trial (valid card)
 *   2. Trial ends → auto-renews into paid monthly plan
 *   3. User keeps access during trial AND paid period
 *   4. User cancels → keeps access until current period ends
 *   5. Period ends → user is blocked
 *
 * Tests both Apple and Google paths, plus the app-side access gate.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFirestore = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
  runTransaction: jest.fn().mockImplementation(async (callback) => {
    return callback({
      get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
      set: jest.fn(),
    });
  }),
};

const mockFirebaseAdmin = {
  firestore: () => mockFirestore,
};
mockFirebaseAdmin.firestore.FieldValue = {
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  delete: () => 'DELETE_FIELD',
};

jest.mock('../lib/firebaseAdmin', () => ({
  getFirebaseAdmin: () => mockFirebaseAdmin,
  isFirebaseConfigured: () => true,
}));

jest.mock('express', () => ({
  Router: () => ({
    get: jest.fn(),
    post: jest.fn(),
  }),
}), { virtual: true });

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
}), { virtual: true });

// ── Load modules ───────────────────────────────────────────────────────────

const appleRouter = require('../api/apple');
const googleRouter = require('../api/google');

const {
  persistAppleSubscription,
  persistStoreKitSubscription,
  persistAppStoreServerSubscription,
  buildStatusSnapshot: buildAppleStatusSnapshot,
  mapAppleServerStatus,
} = appleRouter._test;

const {
  resolveGoogleSubscriptionState,
  buildStatusSnapshot: buildGoogleStatusSnapshot,
  GOOGLE_PLAY_PRO_PRODUCT_ID,
  GOOGLE_PLAY_TRIAL_OFFER_ID,
  GOOGLE_PLAY_TRIAL_DAYS,
} = googleRouter._test;

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Helper: test app-side access rule (pure reimplementation matching subscriptionAccess.ts) ──

const ACTIVE_PRO_STATUSES = new Set(['active', 'trial', 'trialing']);

function getSubscriptionAccessState(subscription, nowMs = Date.now()) {
  const plan = String(subscription?.plan || '').trim().toLowerCase();
  const status = String(subscription?.status || '').trim().toLowerCase();
  const provider = String(
    subscription?.provider ||
    subscription?.paymentProvider ||
    subscription?.iapSource ||
    ''
  ).trim().toLowerCase();

  let expiresMs = null;
  const expiresRaw = subscription?.expiresAt || subscription?.renewalDate || subscription?.nextBillingDate;
  if (expiresRaw) {
    if (expiresRaw instanceof Date) expiresMs = expiresRaw.getTime();
    else if (typeof expiresRaw === 'number') expiresMs = expiresRaw;
    else {
      const parsed = new Date(expiresRaw).getTime();
      expiresMs = Number.isFinite(parsed) ? parsed : null;
    }
  }

  const isPaidPlan = plan === 'pro' || plan === 'premium';
  const isActiveStatus = ACTIVE_PRO_STATUSES.has(status);
  const isExpiredByDate = isPaidPlan && isActiveStatus && !!expiresMs && expiresMs <= nowMs;

  return {
    plan,
    status,
    provider,
    expiresMs,
    isPaidPlan,
    isActiveStatus,
    isExpiredByDate,
    hasAccess: isPaidPlan && isActiveStatus && !isExpiredByDate,
  };
}

// ── Helper: create Google Play purchase ────────────────────────────────────

function createGooglePurchase({
  state = 'SUBSCRIPTION_STATE_ACTIVE',
  offerId = null,
  startTime = '2026-06-01T12:00:00.000Z',
  expiryTime = '2026-07-01T12:00:00.000Z',
  autoRenewEnabled = true,
} = {}) {
  return {
    subscriptionState: state,
    startTime,
    lineItems: [{
      productId: GOOGLE_PLAY_PRO_PRODUCT_ID,
      expiryTime,
      offerDetails: offerId ? { offerId } : {},
      autoRenewingPlan: { autoRenewEnabled },
    }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  APPLE: Full lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe('Apple IAP — complete subscription lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Step 1: User starts 7-day trial ──────────────────────────────────

  test('STEP 1: user signs up → 7-day free trial → has access', async () => {
    const now = Date.now();
    const purchaseMs = now - 1000;
    const expiresMs = now + 7 * DAY_MS;

    const result = await persistAppleSubscription({
      firebaseUid: 'e2e-user-apple',
      result: { status: 0, environment: 'Production' },
      latestReceipt: {
        purchase_date_ms: purchaseMs.toString(),
        expires_date_ms: expiresMs.toString(),
        is_trial_period: 'true',
        transaction_id: 'tx-trial-1',
        original_transaction_id: 'tx-original-1',
      },
      renewalInfo: { auto_renew_status: '1' },
      requestBody: { transactionId: 'tx-trial-1', originalTransactionId: 'tx-original-1' },
    });

    expect(result.status).toBe('trialing');
    expect(result.hasPro).toBe(true);
    expect(result.expiresMs).toBeGreaterThan(now);
    expect(result.cancelAtPeriodEnd).toBe(false);

    // App-side access check
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'trialing',
      provider: 'apple',
      expiresAt: new Date(expiresMs).toISOString(),
    }, now);
    expect(access.hasAccess).toBe(true);
  });

  // ── Step 2: Trial ends → auto-renews to paid ────────────────────────

  test('STEP 2: trial ends → webhook renews → active paid status', async () => {
    const now = Date.now();
    const purchaseMs = now - 1000;
    const expiresMs = now + 30 * DAY_MS; // new 30-day period

    const result = await persistAppStoreServerSubscription({
      firebaseUid: 'e2e-user-apple',
      transactionPayload: {
        transactionId: 'tx-paid-2',
        originalTransactionId: 'tx-original-1',
        purchaseDate: purchaseMs,
        expiresDate: expiresMs,
        // No trial discount on this renewal
        environment: 'Production',
      },
      renewalPayload: {
        originalTransactionId: 'tx-original-1',
        autoRenewStatus: 1,
      },
      statusCode: 1, // ACTIVE
      serverEnvironment: 'Production',
      notificationType: 'DID_RENEW',
    });

    expect(result.status).toBe('active');
    expect(result.hasPro).toBe(true);
    expect(result.cancelAtPeriodEnd).toBe(false);

    // Verify payment was recorded at full price
    const paymentCall = mockFirestore.set.mock.calls.find(call =>
      call[0]?.amount === 34.90 && call[0]?.status === 'paid'
    );
    expect(paymentCall).toBeDefined();

    // App-side access check
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'active',
      provider: 'apple',
      expiresAt: new Date(expiresMs).toISOString(),
    }, now);
    expect(access.hasAccess).toBe(true);
  });

  // ── Step 3: User cancels → keeps access until period ends ───────────

  test('STEP 3: user cancels → still has access until paid period ends', async () => {
    const now = Date.now();
    const expiresMs = now + 15 * DAY_MS; // 15 days left

    const result = await persistAppStoreServerSubscription({
      firebaseUid: 'e2e-user-apple',
      transactionPayload: {
        transactionId: 'tx-paid-2',
        originalTransactionId: 'tx-original-1',
        purchaseDate: now - 15 * DAY_MS,
        expiresDate: expiresMs,
        environment: 'Production',
      },
      renewalPayload: {
        originalTransactionId: 'tx-original-1',
        autoRenewStatus: 0, // user disabled auto-renew
      },
      statusCode: 1, // Apple still reports ACTIVE
      serverEnvironment: 'Production',
      notificationType: 'DID_CHANGE_RENEWAL_STATUS',
      notificationSubtype: 'AUTO_RENEW_DISABLED',
    });

    expect(result.hasPro).toBe(true);
    expect(result.status).toBe('active');
    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(result.autoRenewStatus).toBe('disabled');

    // App-side: user cancelled but still in the paid period → HAS access
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'active',
      provider: 'apple',
      cancelAtPeriodEnd: true,
      autoRenewStatus: 'disabled',
      expiresAt: new Date(expiresMs).toISOString(),
    }, now);
    expect(access.hasAccess).toBe(true);
  });

  // ── Step 4: Period ends → user is blocked ───────────────────────────

  test('STEP 4: period ends → user blocked', async () => {
    const now = Date.now();
    const expiredMs = now - 1 * DAY_MS; // expired yesterday

    const result = await persistAppStoreServerSubscription({
      firebaseUid: 'e2e-user-apple',
      transactionPayload: {
        transactionId: 'tx-paid-2',
        originalTransactionId: 'tx-original-1',
        purchaseDate: now - 31 * DAY_MS,
        expiresDate: expiredMs,
        environment: 'Production',
      },
      renewalPayload: {
        originalTransactionId: 'tx-original-1',
        autoRenewStatus: 0,
      },
      statusCode: 2, // EXPIRED
      serverEnvironment: 'Production',
      notificationType: 'EXPIRED',
    });

    expect(result.hasPro).toBe(false);
    expect(result.status).toBe('expired');

    // App-side: expired → NO access
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'expired',
      provider: 'apple',
      expiresAt: new Date(expiredMs).toISOString(),
    }, now);
    expect(access.hasAccess).toBe(false);
  });

  // ── Step 4b: Stale active status in Firestore after expiry → blocked ─

  test('STEP 4b: stale "active" in Firestore after expiry → buildStatusSnapshot corrects to expired', () => {
    const now = Date.now();
    const expiredMs = now - 2 * DAY_MS;

    const snapshot = buildAppleStatusSnapshot({
      plan: 'pro',
      status: 'active',
      provider: 'apple',
      expiresAt: new Date(expiredMs).toISOString(),
    });

    expect(snapshot.hasPro).toBe(false);
    expect(snapshot.status).toBe('expired');

    // App-side also blocks
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'active', // stale
      provider: 'apple',
      expiresAt: new Date(expiredMs).toISOString(),
    }, now);
    expect(access.hasAccess).toBe(false);
    expect(access.isExpiredByDate).toBe(true);
  });

  // ── Step 5: Trial cancelled mid-trial → access until trial end ──────

  test('STEP 5: trial cancelled mid-trial → access until 7 days end', async () => {
    const now = Date.now();
    const purchaseMs = now - 3 * DAY_MS;
    const expiresMs = purchaseMs + 7 * DAY_MS; // trial ends in 4 days

    const result = await persistAppStoreServerSubscription({
      firebaseUid: 'e2e-user-apple-trial-cancel',
      transactionPayload: {
        transactionId: 'tx-trial-cancel',
        originalTransactionId: 'tx-trial-cancel-orig',
        purchaseDate: purchaseMs,
        expiresDate: expiresMs,
        offerDiscountType: 'FREE_TRIAL',
        environment: 'Production',
      },
      renewalPayload: null,
      statusCode: 1, // still ACTIVE during trial
      serverEnvironment: 'Production',
      notificationType: 'DID_CHANGE_RENEWAL_STATUS',
      notificationSubtype: 'AUTO_RENEW_DISABLED',
    });

    expect(result.hasPro).toBe(true);
    expect(result.status).toBe('trialing');
    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(result.autoRenewStatus).toBe('disabled');

    // App-side: cancelled trial but expiry is in the future → HAS access
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'trialing',
      provider: 'apple',
      cancelAtPeriodEnd: true,
      expiresAt: new Date(expiresMs).toISOString(),
    }, now);
    expect(access.hasAccess).toBe(true);

    // After trial expiry → NO access
    const accessAfter = getSubscriptionAccessState({
      plan: 'pro',
      status: 'trialing',
      provider: 'apple',
      expiresAt: new Date(expiresMs).toISOString(),
    }, expiresMs + 1000);
    expect(accessAfter.hasAccess).toBe(false);
    expect(accessAfter.isExpiredByDate).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  GOOGLE: Full lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe('Google Play — complete subscription lifecycle', () => {
  // ── Step 1: 7-day trial ──────────────────────────────────────────────

  test('STEP 1: user signs up → 7-day free trial → has access', () => {
    const startMs = Date.parse('2026-06-01T12:00:00.000Z');
    const nowMs = Date.parse('2026-06-03T12:00:00.000Z'); // day 3 of trial

    const state = resolveGoogleSubscriptionState(createGooglePurchase({
      offerId: GOOGLE_PLAY_TRIAL_OFFER_ID,
      startTime: new Date(startMs).toISOString(),
      expiryTime: '2026-07-01T12:00:00.000Z',
    }), nowMs);

    expect(state.hasPro).toBe(true);
    expect(state.status).toBe('trialing');
    expect(state.isTrialing).toBe(true);
    expect(state.trialEndsMs).toBe(startMs + GOOGLE_PLAY_TRIAL_DAYS * DAY_MS);

    // App-side access check
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'trialing',
      provider: 'google',
      expiresAt: '2026-07-01T12:00:00.000Z',
    }, nowMs);
    expect(access.hasAccess).toBe(true);
  });

  // ── Step 2: Trial ends → paid monthly ────────────────────────────────

  test('STEP 2: trial ends → auto-renews into paid monthly', () => {
    const nowMs = Date.parse('2026-06-10T12:00:00.000Z'); // past trial window

    const state = resolveGoogleSubscriptionState(createGooglePurchase({
      // After trial, Google Play reports ACTIVE without the trial offer
      state: 'SUBSCRIPTION_STATE_ACTIVE',
      offerId: null,
      startTime: '2026-06-01T12:00:00.000Z',
      expiryTime: '2026-07-01T12:00:00.000Z',
    }), nowMs);

    expect(state.hasPro).toBe(true);
    expect(state.status).toBe('active');
    expect(state.isTrialing).toBe(false);

    // App-side: active paid → HAS access
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'active',
      provider: 'google',
      expiresAt: '2026-07-01T12:00:00.000Z',
    }, nowMs);
    expect(access.hasAccess).toBe(true);
  });

  // ── Step 3: User cancels → keeps access ──────────────────────────────

  test('STEP 3: user cancels → keeps access until period ends', () => {
    const nowMs = Date.parse('2026-06-15T12:00:00.000Z');

    const state = resolveGoogleSubscriptionState(createGooglePurchase({
      state: 'SUBSCRIPTION_STATE_CANCELED',
      autoRenewEnabled: false,
      startTime: '2026-06-01T12:00:00.000Z',
      expiryTime: '2026-07-01T12:00:00.000Z',
    }), nowMs);

    expect(state.hasPro).toBe(true);
    expect(state.status).toBe('active');
    expect(state.cancelAtPeriodEnd).toBe(true);
    expect(state.autoRenewStatus).toBe('disabled');

    // App-side: cancelled but period not ended → HAS access
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'active',
      provider: 'google',
      cancelAtPeriodEnd: true,
      autoRenewStatus: 'disabled',
      expiresAt: '2026-07-01T12:00:00.000Z',
    }, nowMs);
    expect(access.hasAccess).toBe(true);
  });

  // ── Step 4: Period expires → blocked ─────────────────────────────────

  test('STEP 4: period ends → user is blocked', () => {
    const nowMs = Date.parse('2026-07-02T12:00:00.000Z'); // past expiry

    const state = resolveGoogleSubscriptionState(createGooglePurchase({
      state: 'SUBSCRIPTION_STATE_CANCELED',
      autoRenewEnabled: false,
      startTime: '2026-06-01T12:00:00.000Z',
      expiryTime: '2026-07-01T12:00:00.000Z',
    }), nowMs);

    expect(state.hasPro).toBe(false);
    expect(state.status).toBe('expired');

    // App-side: expired → NO access
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'expired',
      provider: 'google',
      expiresAt: '2026-07-01T12:00:00.000Z',
    }, nowMs);
    expect(access.hasAccess).toBe(false);
  });

  // ── Step 4b: Stale active in Firestore → corrected by buildStatusSnapshot ──

  test('STEP 4b: stale "active" in Firestore after expiry → snapshot blocks', () => {
    const snapshot = buildGoogleStatusSnapshot({
      plan: 'pro',
      status: 'active',
      provider: 'google',
      expiresAt: '2026-06-01T12:00:00.000Z', // already expired
    });

    expect(snapshot.hasPro).toBe(false);
    expect(snapshot.status).toBe('expired');

    // App-side also catches it
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'active', // stale
      provider: 'google',
      expiresAt: '2026-06-01T12:00:00.000Z',
    });
    expect(access.hasAccess).toBe(false);
    expect(access.isExpiredByDate).toBe(true);
  });

  // ── Step 5: Trial cancelled mid-trial → access until trial ends ─────

  test('STEP 5: trial cancelled mid-trial → access until period ends', () => {
    const startMs = Date.parse('2026-06-01T12:00:00.000Z');
    const nowMs = Date.parse('2026-06-04T12:00:00.000Z'); // day 4 of trial

    const state = resolveGoogleSubscriptionState(createGooglePurchase({
      state: 'SUBSCRIPTION_STATE_CANCELED',
      offerId: GOOGLE_PLAY_TRIAL_OFFER_ID,
      autoRenewEnabled: false,
      startTime: new Date(startMs).toISOString(),
      expiryTime: '2026-07-01T12:00:00.000Z',
    }), nowMs);

    expect(state.hasPro).toBe(true);
    expect(state.status).toBe('active'); // cancelled but before expiry
    expect(state.cancelAtPeriodEnd).toBe(true);

    // After expiry
    const afterExpiry = resolveGoogleSubscriptionState(createGooglePurchase({
      state: 'SUBSCRIPTION_STATE_CANCELED',
      offerId: GOOGLE_PLAY_TRIAL_OFFER_ID,
      autoRenewEnabled: false,
      startTime: new Date(startMs).toISOString(),
      expiryTime: '2026-07-01T12:00:00.000Z',
    }), Date.parse('2026-07-02T12:00:00.000Z'));

    expect(afterExpiry.hasPro).toBe(false);
    expect(afterExpiry.status).toBe('expired');
  });

  // ── On Hold → blocked ────────────────────────────────────────────────

  test('ON HOLD subscription → blocked', () => {
    const nowMs = Date.parse('2026-06-15T12:00:00.000Z');

    const state = resolveGoogleSubscriptionState(createGooglePurchase({
      state: 'SUBSCRIPTION_STATE_ON_HOLD',
    }), nowMs);

    expect(state.hasPro).toBe(false);
    expect(state.status).toBe('past_due');

    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'past_due',
      provider: 'google',
    }, nowMs);
    expect(access.hasAccess).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  APP-SIDE: Edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('App-side access gate — edge cases', () => {
  const now = Date.now();

  test('free plan → no access regardless of status', () => {
    expect(getSubscriptionAccessState({ plan: 'free', status: 'active' }, now).hasAccess).toBe(false);
    expect(getSubscriptionAccessState({ plan: 'starter', status: 'active' }, now).hasAccess).toBe(false);
    expect(getSubscriptionAccessState({ plan: '', status: 'active' }, now).hasAccess).toBe(false);
  });

  test('no subscription → no access', () => {
    expect(getSubscriptionAccessState(null, now).hasAccess).toBe(false);
    expect(getSubscriptionAccessState(undefined, now).hasAccess).toBe(false);
    expect(getSubscriptionAccessState({}, now).hasAccess).toBe(false);
  });

  test('pro plan with no expiry and active status → has access', () => {
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'active',
      provider: 'stripe',
    }, now);
    expect(access.hasAccess).toBe(true);
  });

  test('expired status → no access even with future expiry', () => {
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'expired',
      provider: 'apple',
      expiresAt: new Date(now + 30 * DAY_MS).toISOString(),
    }, now);
    expect(access.hasAccess).toBe(false);
  });

  test('cancelled status → no access (cancelled is not in ACTIVE_PRO_STATUSES)', () => {
    const access = getSubscriptionAccessState({
      plan: 'pro',
      status: 'cancelled',
      provider: 'google',
      expiresAt: new Date(now + 15 * DAY_MS).toISOString(),
    }, now);
    expect(access.hasAccess).toBe(false);
  });

  test('paused/past_due/pending → no access', () => {
    for (const status of ['paused', 'past_due', 'pending', 'inactive']) {
      const access = getSubscriptionAccessState({
        plan: 'pro',
        status,
        provider: 'google',
        expiresAt: new Date(now + 15 * DAY_MS).toISOString(),
      }, now);
      expect(access.hasAccess).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  FIRESTORE: Subscription data never set directly by client
// ═══════════════════════════════════════════════════════════════════════════

describe('Backend status normalization', () => {
  test('Apple buildStatusSnapshot normalizes "canceled" to "cancelled"', () => {
    const snapshot = buildAppleStatusSnapshot({
      plan: 'pro',
      status: 'canceled',
      provider: 'apple',
      expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
    });
    expect(snapshot.status).toBe('cancelled');
    expect(snapshot.hasPro).toBe(false);
  });

  test('Apple buildStatusSnapshot normalizes "trial_expired" to "expired"', () => {
    const snapshot = buildAppleStatusSnapshot({
      plan: 'pro',
      status: 'trial_expired',
      provider: 'apple',
    });
    expect(snapshot.status).toBe('expired');
    expect(snapshot.hasPro).toBe(false);
  });

  test('Google buildStatusSnapshot catches stale trialing after expiry', () => {
    const snapshot = buildGoogleStatusSnapshot({
      plan: 'pro',
      status: 'trialing',
      provider: 'google',
      expiresAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
    });
    expect(snapshot.hasPro).toBe(false);
    expect(snapshot.status).toBe('expired');
  });

  test('mapAppleServerStatus maps correctly', () => {
    expect(mapAppleServerStatus(1, null)).toBe('active');
    expect(mapAppleServerStatus(2, null)).toBe('expired');
    expect(mapAppleServerStatus(3, null)).toBe('past_due');
    expect(mapAppleServerStatus(4, null)).toBe('active');
    expect(mapAppleServerStatus(5, null)).toBe('cancelled');
    expect(mapAppleServerStatus(1, Date.now())).toBe('cancelled'); // revoked
  });
});
