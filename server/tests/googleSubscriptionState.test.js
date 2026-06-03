jest.mock('express', () => ({
  Router: () => ({
    get: jest.fn(),
    post: jest.fn(),
  }),
}), { virtual: true });

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
}), { virtual: true });

const googleRouter = require('../api/google');

const {
  GOOGLE_PLAY_PRO_PRODUCT_ID,
  GOOGLE_PLAY_TRIAL_OFFER_ID,
  GOOGLE_PLAY_TRIAL_DAYS,
  obfuscateFirebaseUid,
  resolveGoogleSubscriptionState,
} = googleRouter._test;

const DAY_MS = 24 * 60 * 60 * 1000;

function createPurchase({
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

describe('Google Play subscription state', () => {
  test('recognizes an active seven-day free trial', () => {
    const nowMs = Date.parse('2026-06-03T12:00:00.000Z');
    const result = resolveGoogleSubscriptionState(createPurchase({
      offerId: GOOGLE_PLAY_TRIAL_OFFER_ID,
    }), nowMs);

    expect(result.hasPro).toBe(true);
    expect(result.status).toBe('trialing');
    expect(result.trialEndsMs).toBe(Date.parse('2026-06-01T12:00:00.000Z') + GOOGLE_PLAY_TRIAL_DAYS * DAY_MS);
  });

  test('keeps access until expiration after auto-renewal is cancelled', () => {
    const result = resolveGoogleSubscriptionState(createPurchase({
      state: 'SUBSCRIPTION_STATE_CANCELED',
      autoRenewEnabled: false,
    }), Date.parse('2026-06-03T12:00:00.000Z'));

    expect(result.hasPro).toBe(true);
    expect(result.status).toBe('active');
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  test('blocks access while the subscription is on hold', () => {
    const result = resolveGoogleSubscriptionState(createPurchase({
      state: 'SUBSCRIPTION_STATE_ON_HOLD',
    }), Date.parse('2026-06-03T12:00:00.000Z'));

    expect(result.hasPro).toBe(false);
    expect(result.status).toBe('past_due');
  });

  test('uses a stable sha256 account identifier', () => {
    expect(obfuscateFirebaseUid('firebase-user-123')).toMatch(/^[a-f0-9]{64}$/);
    expect(obfuscateFirebaseUid('firebase-user-123')).toBe(obfuscateFirebaseUid('firebase-user-123'));
  });
});
