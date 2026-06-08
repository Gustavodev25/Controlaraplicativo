const mockFirestore = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(true),
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

const appleRouter = require('../api/apple');

const {
  APPLE_MONTHLY_FALLBACK_MS,
  assertAppleAppAccountTokenMatches,
  getExpectedAppleAppAccountToken,
  inferAppleNotificationStatusCode,
  isAppleFreeTrial,
  resolveMonthlyEntitlementPeriod,
  persistAppleSubscription,
  persistStoreKitSubscription,
  persistAppStoreServerSubscription,
} = appleRouter._test;

describe('Apple subscription entitlement period', () => {
  test('uses the App Store expiration when it is present', () => {
    const purchaseMs = Date.parse('2026-05-22T12:00:00.000Z');
    const explicitExpiresMs = Date.parse('2026-06-22T12:00:00.000Z');

    const period = resolveMonthlyEntitlementPeriod({
      explicitExpiresMs,
      purchaseMs,
      nowMs: Date.parse('2026-05-24T12:00:00.000Z'),
    });

    expect(period.expiresMs).toBe(explicitExpiresMs);
    expect(period.periodStartMs).toBe(purchaseMs);
    expect(period.usedFallbackExpiration).toBe(false);
  });

  test('grants a monthly period for valid Apple purchases without an expiration date', () => {
    const purchaseMs = Date.parse('2026-05-22T12:00:00.000Z');

    const period = resolveMonthlyEntitlementPeriod({
      explicitExpiresMs: null,
      purchaseMs,
      nowMs: Date.parse('2026-05-24T12:00:00.000Z'),
    });

    expect(period.expiresMs).toBe(purchaseMs + APPLE_MONTHLY_FALLBACK_MS);
    expect(period.periodStartMs).toBe(purchaseMs);
    expect(period.usedFallbackExpiration).toBe(true);
  });

  test('grants a 7-day period for trial Apple purchases without an expiration date', () => {
    const purchaseMs = Date.parse('2026-05-22T12:00:00.000Z');

    const period = resolveMonthlyEntitlementPeriod({
      explicitExpiresMs: null,
      purchaseMs,
      nowMs: Date.parse('2026-05-24T12:00:00.000Z'),
      isTrial: true,
    });

    expect(period.expiresMs).toBe(purchaseMs + 7 * 24 * 60 * 60 * 1000);
    expect(period.periodStartMs).toBe(purchaseMs);
    expect(period.usedFallbackExpiration).toBe(true);
  });

  test('falls back to the StoreKit signed date when purchase date is missing', () => {
    const signedMs = Date.parse('2026-05-22T12:00:00.000Z');

    const period = resolveMonthlyEntitlementPeriod({
      explicitExpiresMs: null,
      purchaseMs: null,
      signedMs,
      nowMs: Date.parse('2026-05-24T12:00:00.000Z'),
    });

    expect(period.expiresMs).toBe(signedMs + APPLE_MONTHLY_FALLBACK_MS);
    expect(period.periodStartMs).toBe(signedMs);
    expect(period.usedFallbackExpiration).toBe(true);
  });

  test('recognizes App Store free trials from receipts and StoreKit transactions', () => {
    expect(isAppleFreeTrial({ receipt: { is_trial_period: 'true' } })).toBe(true);
    expect(isAppleFreeTrial({ transactionPayload: { offerDiscountType: 'FREE_TRIAL' } })).toBe(true);
    expect(isAppleFreeTrial({ transactionPayload: { rawOfferDiscountType: 'free_trial' } })).toBe(true);
    expect(isAppleFreeTrial({ transactionPayload: { offerType: 1, offerIdentifier: 'intro-free-trial' } })).toBe(true);
    expect(isAppleFreeTrial({ purchase: { offerIOS: { paymentMode: 'freeTrial' } } })).toBe(true);
    expect(isAppleFreeTrial({ transactionPayload: { offerDiscountType: 'PAY_AS_YOU_GO' } })).toBe(false);
  });

  test('validates deterministic Apple app account tokens when StoreKit provides one', () => {
    const firebaseUid = 'firebase-user-123';
    const token = getExpectedAppleAppAccountToken(firebaseUid);

    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(assertAppleAppAccountTokenMatches(firebaseUid, { appAccountToken: token })).toBe(true);
    expect(assertAppleAppAccountTokenMatches(firebaseUid, {})).toBe(false);
    expect(() => {
      assertAppleAppAccountTokenMatches(firebaseUid, { appAccountToken: getExpectedAppleAppAccountToken('other-user') });
    }).toThrow('Apple transaction account token does not match the signed-in user');
  });

  test('infers App Store notification statuses for renewal lifecycle events', () => {
    expect(inferAppleNotificationStatusCode({ notificationType: 'DID_RENEW', data: {} }, {})).toBe(1);
    expect(inferAppleNotificationStatusCode({ notificationType: 'DID_FAIL_TO_RENEW', data: {} }, {})).toBe(3);
    expect(inferAppleNotificationStatusCode({ notificationType: 'EXPIRED', data: {} }, {})).toBe(2);
    expect(inferAppleNotificationStatusCode({ notificationType: 'REFUND', data: {} }, {})).toBe(5);
    expect(inferAppleNotificationStatusCode({ notificationType: 'DID_RENEW', data: { status: 4 } }, {})).toBe(4);
  });
});

describe('Apple subscription persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('persistAppleSubscription sets trialing status and 0 amount for a free trial', async () => {
    const firebaseUid = 'user-trial-123';
    const purchaseMs = Date.now() - 1000;
    const expiresMs = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const result = await persistAppleSubscription({
      firebaseUid,
      result: { status: 0, environment: 'Sandbox' },
      latestReceipt: {
        purchase_date_ms: purchaseMs.toString(),
        expires_date_ms: expiresMs.toString(),
        is_trial_period: 'true',
        transaction_id: 'tx-trial',
        original_transaction_id: 'tx-trial',
      },
      renewalInfo: { auto_renew_status: '1' },
      requestBody: { transactionId: 'tx-trial', originalTransactionId: 'tx-trial' },
    });

    expect(result.status).toBe('trialing');
    expect(result.hasPro).toBe(true);

    const userUpdate = mockFirestore.set.mock.calls.find(call => {
      return call[0] && call[0].subscription && call[0].subscription.plan === 'pro';
    });
    expect(userUpdate).toBeDefined();
    expect(userUpdate[0].subscription.status).toBe('trialing');
    expect(userUpdate[0].subscription.price).toBe(34.90);

    const paymentsCall = mockFirestore.set.mock.calls.find(call => {
      return call[0] && call[0].amount === 0 && call[0].status === 'trialing';
    });
    expect(paymentsCall).toBeDefined();
    expect(paymentsCall[0].id).toBe('apple_tx-trial');
    expect(paymentsCall[0].amount).toBe(0);
  });

  test('persistAppleSubscription sets active status and full amount for a paid subscription', async () => {
    const firebaseUid = 'user-paid-123';
    const purchaseMs = Date.now() - 1000;
    const expiresMs = Date.now() + 30 * 24 * 60 * 60 * 1000;

    const result = await persistAppleSubscription({
      firebaseUid,
      result: { status: 0, environment: 'Sandbox' },
      latestReceipt: {
        purchase_date_ms: purchaseMs.toString(),
        expires_date_ms: expiresMs.toString(),
        is_trial_period: 'false',
        transaction_id: 'tx-paid',
        original_transaction_id: 'tx-paid',
      },
      renewalInfo: { auto_renew_status: '1' },
      requestBody: { transactionId: 'tx-paid', originalTransactionId: 'tx-paid' },
    });

    expect(result.status).toBe('active');
    expect(result.hasPro).toBe(true);

    const userUpdate = mockFirestore.set.mock.calls.find(call => {
      return call[0] && call[0].subscription && call[0].subscription.plan === 'pro';
    });
    expect(userUpdate).toBeDefined();
    expect(userUpdate[0].subscription.status).toBe('active');

    const paymentsCall = mockFirestore.set.mock.calls.find(call => {
      return call[0] && call[0].amount === 34.90 && call[0].status === 'paid';
    });
    expect(paymentsCall).toBeDefined();
    expect(paymentsCall[0].id).toBe('apple_tx-paid');
    expect(paymentsCall[0].amount).toBe(34.90);
  });

  test('persistStoreKitSubscription sets trialing status and 0 amount for a free trial', async () => {
    const firebaseUid = 'user-sk-trial';
    const purchaseMs = Date.now() - 1000;
    const expiresMs = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const result = await persistStoreKitSubscription({
      firebaseUid,
      transactionPayload: {
        transactionId: 'tx-sk-trial',
        originalTransactionId: 'tx-sk-trial',
        purchaseDate: purchaseMs,
        expiresDate: expiresMs,
        offerDiscountType: 'FREE_TRIAL',
        environment: 'Sandbox',
      },
      purchase: {},
    });

    expect(result.status).toBe('trialing');
    const paymentsCall = mockFirestore.set.mock.calls.find(call => {
      return call[0] && call[0].amount === 0 && call[0].status === 'trialing';
    });
    expect(paymentsCall).toBeDefined();
  });

  test('persistAppStoreServerSubscription sets trialing status and 0 amount for a free trial', async () => {
    const firebaseUid = 'user-server-trial';
    const purchaseMs = Date.now() - 1000;
    const expiresMs = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const result = await persistAppStoreServerSubscription({
      firebaseUid,
      transactionPayload: {
        transactionId: 'tx-server-trial',
        originalTransactionId: 'tx-server-trial',
        purchaseDate: purchaseMs,
        expiresDate: expiresMs,
        offerDiscountType: 'FREE_TRIAL',
        environment: 'Sandbox',
      },
      renewalPayload: {
        originalTransactionId: 'tx-server-trial',
        autoRenewStatus: 1,
      },
      statusCode: 1,
      serverEnvironment: 'Sandbox',
    });

    expect(result.status).toBe('trialing');
    const paymentsCall = mockFirestore.set.mock.calls.find(call => {
      return call[0] && call[0].amount === 0 && call[0].status === 'trialing';
    });
    expect(paymentsCall).toBeDefined();
  });
});

