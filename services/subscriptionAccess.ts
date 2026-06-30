export const ACTIVE_PRO_STATUSES = new Set(['active', 'trial', 'trialing']);

export const parseSubscriptionDateMs = (value: any): number | null => {
    if (!value) return null;

    if (typeof value?.toDate === 'function') {
        const date = value.toDate();
        return Number.isNaN(date?.getTime?.()) ? null : date.getTime();
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.getTime();
    }

    if (typeof value === 'number' && Number.isFinite(value)) return value;

    if (typeof value === 'object' && Number.isFinite(value?.seconds)) {
        return Number(value.seconds) * 1000;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
};

export function getSubscriptionAccessState(subscription: any, nowMs = Date.now()) {
    const plan = String(subscription?.plan || '').trim().toLowerCase();
    const status = String(subscription?.status || '').trim().toLowerCase();
    const provider = String(
        subscription?.provider ||
        subscription?.paymentProvider ||
        subscription?.iapSource ||
        ''
    ).trim().toLowerCase();
    const expiresMs = parseSubscriptionDateMs(
        subscription?.expiresAt ||
        subscription?.renewalDate ||
        subscription?.nextBillingDate
    );
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
