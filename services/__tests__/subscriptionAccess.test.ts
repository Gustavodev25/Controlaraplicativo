import { getSubscriptionAccessState } from '../subscriptionAccess';

describe('subscription access state', () => {
    const nowMs = Date.parse('2026-06-30T12:00:00.000Z');

    test('allows a seven-day trial before expiration', () => {
        const state = getSubscriptionAccessState({
            plan: 'pro',
            status: 'trialing',
            provider: 'apple',
            expiresAt: '2026-07-01T12:00:00.000Z',
        }, nowMs);

        expect(state.hasAccess).toBe(true);
        expect(state.isExpiredByDate).toBe(false);
    });

    test('allows cancelled native subscriptions until the paid period ends', () => {
        const state = getSubscriptionAccessState({
            plan: 'pro',
            status: 'active',
            provider: 'google',
            cancelAtPeriodEnd: true,
            autoRenewStatus: 'disabled',
            expiresAt: '2026-07-30T12:00:00.000Z',
        }, nowMs);

        expect(state.hasAccess).toBe(true);
    });

    test('blocks stale active access after expiration even when provider is missing', () => {
        const state = getSubscriptionAccessState({
            plan: 'pro',
            status: 'active',
            expiresAt: '2026-06-29T12:00:00.000Z',
        }, nowMs);

        expect(state.hasAccess).toBe(false);
        expect(state.isExpiredByDate).toBe(true);
    });

    test('blocks inactive or expired statuses', () => {
        expect(getSubscriptionAccessState({
            plan: 'pro',
            status: 'expired',
            provider: 'apple',
            expiresAt: '2026-07-30T12:00:00.000Z',
        }, nowMs).hasAccess).toBe(false);

        expect(getSubscriptionAccessState({
            plan: 'free',
            status: 'active',
        }, nowMs).hasAccess).toBe(false);
    });
});
