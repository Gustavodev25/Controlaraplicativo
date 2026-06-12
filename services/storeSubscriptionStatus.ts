import { auth } from '@/services/firebase';
import { Platform } from 'react-native';

const DEFAULT_IAP_BACKEND_URL = 'https://backendcontrolarapp-production.up.railway.app';
const BACKEND_URL = (
    process.env.EXPO_PUBLIC_IAP_API_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    DEFAULT_IAP_BACKEND_URL
).replace(/\/+$/, '');

export interface AppleSubscriptionSnapshot {
    plan: string;
    status: string;
    provider?: string | null;
    paymentProvider?: string | null;
    iapSource?: string | null;
    productId?: string | null;
    billingCycle?: 'monthly' | 'yearly' | null;
    price?: number | null;
    currency?: string | null;
    expiresAt?: string | null;
    nextBillingDate?: string | null;
    renewalDate?: string | null;
    startedAt?: string | null;
    cancelledAt?: string | null;
    cancelAtPeriodEnd?: boolean;
    autoRenewStatus?: string | null;
    transactionId?: string | null;
    originalTransactionId?: string | null;
    updatedAt?: string | null;
}

export interface AppleSubscriptionStatusResult {
    success: boolean;
    hasPro: boolean;
    plan: string;
    status: string;
    provider: string | null;
    expiresAt: string | null;
    cancelAtPeriodEnd: boolean;
    autoRenewStatus?: string | null;
    subscription: AppleSubscriptionSnapshot | null;
    error?: string;
}

export interface AppleSubscriptionStatusOptions {
    refreshServerStatus?: boolean;
    syncActivePurchase?: boolean;
}

export type StoreSubscriptionStatusResult = AppleSubscriptionStatusResult;
export type StoreSubscriptionStatusOptions = AppleSubscriptionStatusOptions;

export const createFallbackStoreSubscriptionStatus = (
    error?: string
): StoreSubscriptionStatusResult => ({
    success: false,
    hasPro: false,
    plan: 'free',
    status: 'inactive',
    provider: null,
    expiresAt: null,
    cancelAtPeriodEnd: false,
    subscription: null,
    error,
});

export const getFirebaseAuthorizationHeaders = async (): Promise<Record<string, string>> => {
    const idToken = await auth.currentUser?.getIdToken();
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
};

export async function getAppleSubscriptionStatus(
    firebaseUid: string,
    options: AppleSubscriptionStatusOptions = {}
): Promise<AppleSubscriptionStatusResult> {
    try {
        const refreshParam = options.refreshServerStatus ? '&refresh=true' : '';
        const authorizationHeaders = await getFirebaseAuthorizationHeaders();
        const response = await fetch(
            `${BACKEND_URL}/api/apple/subscription-status?firebaseUid=${encodeURIComponent(firebaseUid)}${refreshParam}`,
            { headers: authorizationHeaders }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Erro ao consultar assinatura Apple');
        }

        return {
            success: true,
            hasPro: data.hasPro === true,
            plan: String(data.plan || data.subscription?.plan || 'free').trim().toLowerCase(),
            status: String(data.status || data.subscription?.status || 'inactive').trim().toLowerCase(),
            provider: data.provider || data.subscription?.provider || null,
            expiresAt: data.expiresAt || data.subscription?.expiresAt || null,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd === true || data.subscription?.cancelAtPeriodEnd === true,
            autoRenewStatus: data.autoRenewStatus || data.subscription?.autoRenewStatus || null,
            subscription: data.subscription || null,
        };
    } catch (e: any) {
        console.warn('[StoreSubscription] Apple status unavailable:', e);
        return createFallbackStoreSubscriptionStatus(e?.message || 'Erro ao consultar assinatura Apple');
    }
}

export async function getGooglePlaySubscriptionStatus(
    firebaseUid: string,
    options: StoreSubscriptionStatusOptions = {}
): Promise<StoreSubscriptionStatusResult> {
    try {
        const refreshParam = options.refreshServerStatus ? '&refresh=true' : '';
        const authorizationHeaders = await getFirebaseAuthorizationHeaders();
        const response = await fetch(
            `${BACKEND_URL}/api/google/subscription-status?firebaseUid=${encodeURIComponent(firebaseUid)}${refreshParam}`,
            { headers: authorizationHeaders }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Erro ao consultar assinatura Google Play');
        }

        return {
            success: true,
            hasPro: data.hasPro === true,
            plan: String(data.plan || data.subscription?.plan || 'free').trim().toLowerCase(),
            status: String(data.status || data.subscription?.status || 'inactive').trim().toLowerCase(),
            provider: data.provider || data.subscription?.provider || null,
            expiresAt: data.expiresAt || data.subscription?.expiresAt || null,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd === true || data.subscription?.cancelAtPeriodEnd === true,
            autoRenewStatus: data.autoRenewStatus || data.subscription?.autoRenewStatus || null,
            subscription: data.subscription || null,
        };
    } catch (e: any) {
        console.warn('[StoreSubscription] Google Play status unavailable:', e);
        return createFallbackStoreSubscriptionStatus(e?.message || 'Erro ao consultar assinatura Google Play');
    }
}

export async function getStoreSubscriptionStatus(
    firebaseUid: string,
    options: StoreSubscriptionStatusOptions = {}
): Promise<StoreSubscriptionStatusResult> {
    if (Platform.OS === 'android') {
        return getGooglePlaySubscriptionStatus(firebaseUid, options);
    }
    return getAppleSubscriptionStatus(firebaseUid, options);
}
