import { useAuthContext } from '@/contexts/AuthContext';
import { getSubscriptionAccessState } from '@/services/subscriptionAccess';
import { getStoreSubscriptionStatus } from '@/services/storeSubscriptionStatus';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';

const NATIVE_STORE_PROVIDERS = new Set(['apple', 'app_store', 'storekit', 'google', 'google_play', 'play_store']);
const STORE_STATUS_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REFRESH_TIMER_MS = 2_147_483_647;
const STARTUP_TIME_MS = Date.now();

/**
 * Keeps non-Pro users on the subscription screen while allowing native-store
 * renewals to sync before an expired local trial blocks access.
 */
export function SubscriptionBlocker({ children }: { children: React.ReactNode }) {
    const { profile, isLoading, isAuthenticated, user, refreshProfile } = useAuthContext();
    const router = useRouter();
    const pathname = usePathname();
    const hasRedirectedRef = useRef(false);
    const syncInFlightKeyRef = useRef<string | null>(null);
    const syncedSubscriptionKeyRef = useRef<string | null>(null);
    const [, forceStoreSyncRender] = useState(0);

    const subscription = profile?.subscription as any;
    const {
        plan,
        status,
        provider,
        expiresMs,
        isPaidPlan,
        isActiveStatus,
        hasAccess,
    } = getSubscriptionAccessState(subscription);
    const isNativeStoreSubscription = NATIVE_STORE_PROVIDERS.has(provider);
    const subscriptionKey = [
        user?.uid || '',
        plan,
        status,
        provider,
        expiresMs || '',
    ].join(':');
    const shouldSyncNativeStoreStatus =
        Boolean(user?.uid) &&
        isPaidPlan &&
        isActiveStatus &&
        isNativeStoreSubscription &&
        (
            !expiresMs ||
            status === 'trial' ||
            status === 'trialing' ||
            expiresMs <= STARTUP_TIME_MS + STORE_STATUS_REFRESH_WINDOW_MS
        );

    useEffect(() => {
        if (!shouldSyncNativeStoreStatus || !user?.uid) return;
        if (
            syncedSubscriptionKeyRef.current === subscriptionKey ||
            syncInFlightKeyRef.current === subscriptionKey
        ) {
            return;
        }

        let cancelled = false;
        syncInFlightKeyRef.current = subscriptionKey;

        // Startup must stay backend-only here. Native StoreKit/Google Billing
        // is loaded later from explicit purchase/restore flows.
        const safeSync = async () => {
            try {
                const statusResult = await getStoreSubscriptionStatus(user.uid, {
                    refreshServerStatus: !expiresMs || expiresMs <= Date.now() + STORE_STATUS_REFRESH_WINDOW_MS,
                    syncActivePurchase: false,
                });
                if (!cancelled && statusResult.success) {
                    await refreshProfile();
                }
            } catch (error) {
                console.warn('[SubscriptionBlocker] Store subscription sync failed:', error);
            } finally {
                if (syncInFlightKeyRef.current === subscriptionKey) {
                    syncInFlightKeyRef.current = null;
                }
                syncedSubscriptionKeyRef.current = subscriptionKey;
                if (!cancelled) {
                    forceStoreSyncRender((value) => value + 1);
                }
            }
        };

        safeSync();

        return () => {
            cancelled = true;
        };
    }, [expiresMs, refreshProfile, shouldSyncNativeStoreStatus, subscriptionKey, user?.uid]);

    useEffect(() => {
        if (!expiresMs || expiresMs <= Date.now()) return;

        const refreshDelayMs = Math.min(
            Math.max(expiresMs - Date.now() + 1000, 1000),
            MAX_REFRESH_TIMER_MS
        );
        const timer = setTimeout(() => {
            forceStoreSyncRender((value) => value + 1);
        }, refreshDelayMs);

        return () => clearTimeout(timer);
    }, [expiresMs]);

    useEffect(() => {
        if (isLoading || !isAuthenticated) {
            hasRedirectedRef.current = false;
            syncInFlightKeyRef.current = null;
            syncedSubscriptionKeyRef.current = null;
            return;
        }

        if (profile?.isAdmin) return;

        const isWaitingForStoreSync =
            shouldSyncNativeStoreStatus &&
            (
                syncInFlightKeyRef.current === subscriptionKey ||
                syncedSubscriptionKeyRef.current !== subscriptionKey
            );

        if (hasAccess) {
            hasRedirectedRef.current = false;
            return;
        }

        if (isWaitingForStoreSync) {
            return;
        }

        if (
            pathname.includes('subscription') ||
            pathname.includes('plans') ||
            pathname.includes('legal') ||
            pathname.includes('login') ||
            pathname.includes('register') ||
            pathname.includes('welcome')
        ) {
            return;
        }

        if (hasRedirectedRef.current) return;
        hasRedirectedRef.current = true;

        // Defer navigation to next tick to ensure navigator is fully mounted.
        // Calling router.replace synchronously in an effect can crash expo-router
        // when the Stack navigator has not finished its initial render.
        setTimeout(() => {
            try {
                router.replace('/settings/subscription');
            } catch (e) {
                console.warn('[SubscriptionBlocker] Navigation failed:', e);
                hasRedirectedRef.current = false;
            }
        }, 0);
    }, [
        expiresMs,
        hasAccess,
        isActiveStatus,
        isAuthenticated,
        isLoading,
        isNativeStoreSubscription,
        isPaidPlan,
        pathname,
        profile,
        router,
        shouldSyncNativeStoreStatus,
        subscriptionKey,
    ]);

    return <>{children}</>;
}
