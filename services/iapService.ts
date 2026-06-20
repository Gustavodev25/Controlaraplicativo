/**
 * IAP Service — Skips native module loading entirely in Expo Go.
 *
 * `react-native-iap` depends on `react-native-nitro-modules` which throws
 * at the top-level when running inside Expo Go. Metro propagates this as an
 * uncaught global error even inside try-catch. We detect Expo Go via
 * expo-constants and never attempt to require `react-native-iap` at all.
 */

import { Platform } from 'react-native';
import {
    getAppleSubscriptionStatus,
    getFirebaseAuthorizationHeaders,
    getGooglePlaySubscriptionStatus,
    getStoreSubscriptionStatus,
    type AppleSubscriptionStatusOptions,
    type AppleSubscriptionStatusResult,
    type StoreSubscriptionStatusOptions,
    type StoreSubscriptionStatusResult,
} from '@/services/storeSubscriptionStatus';

// ---------------------------------------------------------------------------
// Expo Go detection — keep lazy so importing this file during app startup does
// not initialize extra native modules.
// ---------------------------------------------------------------------------

let isExpoGoCache: boolean | null = null;

function isRunningInExpoGo(): boolean {
    if (isExpoGoCache !== null) return isExpoGoCache;

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Constants = require('expo-constants').default;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ExecutionEnvironment = require('expo-constants').ExecutionEnvironment;
        isExpoGoCache = Constants?.executionEnvironment === ExecutionEnvironment?.StoreClient;
    } catch (e) {
        console.warn('[IAP] expo-constants unavailable, disabling IAP:', e);
        isExpoGoCache = true;
    }

    return isExpoGoCache;
}

// ---------------------------------------------------------------------------
// Lazy module reference (only loaded in native builds)
// ---------------------------------------------------------------------------

let _iap: typeof import('react-native-iap') | null = null;
let _iapLoadFailed = false;

function getIAP(): typeof import('react-native-iap') | null {
    if (isRunningInExpoGo() || _iapLoadFailed) return null;
    if (_iap) return _iap;

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        _iap = require('react-native-iap') as typeof import('react-native-iap');
        return _iap;
    } catch (e) {
        _iapLoadFailed = true;
        console.warn('[IAP] react-native-iap could not be loaded:', e);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Re-exported types (these are type-only so no runtime cost)
// ---------------------------------------------------------------------------

export type StorePurchase = import('react-native-iap').Purchase;
export type SubscriptionPurchase = StorePurchase;
export type PurchaseError = import('react-native-iap').PurchaseError;
export type ProductSubscription = import('react-native-iap').ProductSubscription;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_IAP_BACKEND_URL = 'https://backendcontrolarapp-production.up.railway.app';
const BACKEND_URL = (
    process.env.EXPO_PUBLIC_IAP_API_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    DEFAULT_IAP_BACKEND_URL
).replace(/\/+$/, '');

export const APPLE_PRO_PRODUCT_ID = 'com.gustavodev25.controlarapp.pro.monthly';
export const GOOGLE_PLAY_PRO_PRODUCT_ID = 'controlarapp_pro_monthly';
export const GOOGLE_PLAY_PACKAGE_NAME = 'com.gustavodev25.controlarapp';
export const GOOGLE_PLAY_TRIAL_OFFER_ID = 'trial-7d';
const GOOGLE_PLAY_LEGACY_TRIAL_OFFER_ID = 'pro-monthly-trial-7d';
const GOOGLE_PLAY_TRIAL_OFFER_IDS = new Set([
    GOOGLE_PLAY_TRIAL_OFFER_ID,
    GOOGLE_PLAY_LEGACY_TRIAL_OFFER_ID,
]);
export const PRO_PRODUCT_ID =
    Platform.OS === 'android' ? GOOGLE_PLAY_PRO_PRODUCT_ID : APPLE_PRO_PRODUCT_ID;
export const PRO_PRICE_STRING = 'R$ 34,90';
export const PRO_TRIAL_DAYS = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseResult {
    success: boolean;
    alreadyActive?: boolean;
    userCancelled?: boolean;
    hasPro?: boolean;
    syncedFromStoreKit?: boolean;
    status?: string;
    expiresAt?: string | null;
    cancelAtPeriodEnd?: boolean;
    autoRenewStatus?: string | null;
    error?: string;
    errorCode?: string;
}

export interface RestoreResult {
    success: boolean;
    hasPro: boolean;
    error?: string;
    errorCode?: string;
}

export interface OfferingsResult {
    priceString: string;
    hasIntroductoryOffer?: boolean;
    introductoryPriceString?: string;
    introductoryNumberOfPeriods?: number;
    introductoryPeriodUnit?: string;
    introductoryPeriodNumberOfUnits?: number;
    trialAvailable?: boolean;
    trialDays?: number;
    error?: string;
}

export {
    getAppleSubscriptionStatus,
    getGooglePlaySubscriptionStatus,
    getStoreSubscriptionStatus,
};
export type {
    AppleSubscriptionStatusOptions,
    AppleSubscriptionStatusResult,
    StoreSubscriptionStatusOptions,
    StoreSubscriptionStatusResult,
};

let connectionPromise: Promise<void> | null = null;
let googlePlayOfferToken: string | null = null;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isJws = (value?: string | null) => {
    return typeof value === 'string' && value.split('.').length === 3;
};

const toFiniteNumber = (value: any): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const getProPurchaseFromRequestResult = (result: any): StorePurchase | null => {
    const purchases = Array.isArray(result) ? result : result ? [result] : [];
    return purchases.find((item: StorePurchase) => item?.productId === PRO_PRODUCT_ID) || null;
};

type ExpoCryptoModule = typeof import('expo-crypto');
let cryptoModule: ExpoCryptoModule | null | undefined;

const getCryptoModule = (): ExpoCryptoModule | null => {
    if (cryptoModule === undefined) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            cryptoModule = require('expo-crypto') as ExpoCryptoModule;
        } catch (error) {
            console.warn('[IAP] expo-crypto unavailable:', error);
            cryptoModule = null;
        }
    }
    return cryptoModule;
};

const getGooglePlayAccountId = async (firebaseUid: string): Promise<string> => {
    const Crypto = getCryptoModule();
    if (!Crypto) throw new Error('Expo Crypto indisponivel neste ambiente.');
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, firebaseUid);
};

const getAppleAppAccountToken = async (firebaseUid: string): Promise<string> => {
    const Crypto = getCryptoModule();
    if (!Crypto) throw new Error('Expo Crypto indisponivel neste ambiente.');
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, firebaseUid);
    const chars = hash.slice(0, 32).split('');
    chars[12] = '5';
    chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
    return [
        chars.slice(0, 8).join(''),
        chars.slice(8, 12).join(''),
        chars.slice(12, 16).join(''),
        chars.slice(16, 20).join(''),
        chars.slice(20, 32).join(''),
    ].join('-');
};

const getPurchaseTransactionId = (purchase?: any): string | null => {
    return purchase?.transactionId || purchase?.id || null;
};

const getPurchaseOriginalTransactionId = (purchase?: any): string | null => {
    return (
        purchase?.originalTransactionIdentifierIOS ||
        purchase?.originalTransactionId ||
        purchase?.transactionId ||
        purchase?.id ||
        null
    );
};

const APPLE_PURCHASE_LINKED_TO_ANOTHER_ACCOUNT_CODE = 'apple_purchase_linked_to_another_account';
const APPLE_PURCHASE_LINKED_TO_ANOTHER_ACCOUNT_MESSAGE =
    'Esta assinatura da App Store já está vinculada a outra conta Controlar+. Entre com a conta correta para acessar.';

const isPurchaseLinkedToAnotherAccountError = (error: any): boolean => {
    const code = String(error?.code || error?.errorCode || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return (
        code === APPLE_PURCHASE_LINKED_TO_ANOTHER_ACCOUNT_CODE ||
        message.includes('already linked to another account') ||
        message.includes('linked to another account') ||
        message.includes('vinculada a outra conta')
    );
};

const hasStoreKitPurchaseEvidence = (
    purchase?: Partial<StorePurchase> | Record<string, any> | null
): boolean => {
    if (!purchase) return false;

    const rawPurchase = purchase as Record<string, any>;
    if (rawPurchase.productId && rawPurchase.productId !== APPLE_PRO_PRODUCT_ID) {
        return false;
    }

    return Boolean(
        rawPurchase.transactionId ||
        rawPurchase.id ||
        rawPurchase.originalTransactionIdentifierIOS ||
        rawPurchase.originalTransactionId ||
        rawPurchase.transactionDate ||
        rawPurchase.expirationDateIOS ||
        rawPurchase.originalTransactionDateIOS ||
        rawPurchase.revocationDateIOS ||
        rawPurchase.offerIOS ||
        rawPurchase.renewalInfoIOS ||
        rawPurchase.environmentIOS ||
        rawPurchase.isActive === true ||
        rawPurchase.purchaseState
    );
};

const normalizeStoreKitPurchaseForBackend = (
    purchase?: Partial<StorePurchase> | Record<string, any> | null,
    signedTransactionInfo?: string | null
) => {
    if (!purchase && !signedTransactionInfo) return null;

    const rawPurchase = (purchase || {}) as Record<string, any>;

    return {
        productId: rawPurchase.productId || APPLE_PRO_PRODUCT_ID,
        transactionId: getPurchaseTransactionId(rawPurchase),
        originalTransactionId: getPurchaseOriginalTransactionId(rawPurchase),
        purchaseToken: isJws(rawPurchase.purchaseToken) ? rawPurchase.purchaseToken : null,
        signedTransactionInfo: signedTransactionInfo || (isJws(rawPurchase.purchaseToken) ? rawPurchase.purchaseToken : null),
        purchaseState: rawPurchase.purchaseState || null,
        transactionDate: toFiniteNumber(rawPurchase.transactionDate),
        expirationDateIOS: toFiniteNumber(rawPurchase.expirationDateIOS),
        originalTransactionDateIOS: toFiniteNumber(rawPurchase.originalTransactionDateIOS),
        revocationDateIOS: toFiniteNumber(rawPurchase.revocationDateIOS),
        revocationReasonIOS: rawPurchase.revocationReasonIOS || null,
        appAccountToken: rawPurchase.appAccountToken || null,
        offerIOS: rawPurchase.offerIOS || null,
        environmentIOS: rawPurchase.environmentIOS || null,
        isAutoRenewing: typeof rawPurchase.isAutoRenewing === 'boolean' ? rawPurchase.isAutoRenewing : null,
        renewalInfoIOS: rawPurchase.renewalInfoIOS || null,
        store: rawPurchase.store || rawPurchase.platform || 'ios',
    };
};

function getTrustedDisplayPrice(product: ProductSubscription): string {
    const displayPrice = String(product.displayPrice || '').trim();
    const currency = String((product as any).currency || '').trim().toUpperCase();

    if (!displayPrice) return PRO_PRICE_STRING;

    const isDollarPrice =
        (displayPrice.includes('$') && !displayPrice.includes('R$')) ||
        /\bUSD\b/i.test(displayPrice);
    if (isDollarPrice) return PRO_PRICE_STRING;

    if (currency && currency !== 'BRL' && !displayPrice.includes('R$')) {
        return PRO_PRICE_STRING;
    }

    return displayPrice;
}

function getGooglePlaySubscriptionOfferToken(product?: ProductSubscription | null): string | null {
    if (!product || product.platform !== 'android') return null;

    const parseOfferList = (value: any): any[] => {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string' || !value.trim()) return [];

        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };
    const legacyOffers = parseOfferList((product as any).subscriptionOfferDetailsAndroid);
    const standardizedOffers = parseOfferList((product as any).subscriptionOffers);
    const getOfferId = (offer: any) => String(offer?.offerId || offer?.id || '').trim();
    const isKnownTrialOffer = (offer: any) => GOOGLE_PLAY_TRIAL_OFFER_IDS.has(getOfferId(offer));
    const getPricingPhaseList = (offer: any) => {
        const pricingPhases = offer?.pricingPhases || offer?.pricingPhasesAndroid;
        if (Array.isArray(pricingPhases)) return pricingPhases;
        if (Array.isArray(pricingPhases?.pricingPhaseList)) return pricingPhases.pricingPhaseList;
        if (Array.isArray(offer?.pricingPhaseList)) return offer.pricingPhaseList;
        return [];
    };
    const hasFreePhase = (offer: any) => {
        if (toFiniteNumber(offer?.price) === 0) return true;
        const pricingPhases = getPricingPhaseList(offer);
        return Array.isArray(pricingPhases) && pricingPhases.some((phase: any) => {
            return (
                String(phase?.priceAmountMicros ?? phase?.priceAmountMicrosAndroid ?? '') === '0' ||
                toFiniteNumber(phase?.price) === 0
            );
        });
    };
    const trialOffer =
        legacyOffers.find(isKnownTrialOffer) ||
        standardizedOffers.find(isKnownTrialOffer) ||
        legacyOffers.find(hasFreePhase) ||
        standardizedOffers.find(hasFreePhase);
    const fallbackOffer = legacyOffers[0] || standardizedOffers[0] || null;
    const selectedOffer = trialOffer || fallbackOffer;

    return selectedOffer?.offerToken || selectedOffer?.offerTokenAndroid || null;
}

// ---------------------------------------------------------------------------
// Re-exported helpers (lazy)
// ---------------------------------------------------------------------------

export function purchaseUpdatedListener(
    listener: (purchase: SubscriptionPurchase) => void
) {
    const iap = getIAP();
    if (!iap) {
        // Return a no-op subscription so callers don't break
        return { remove: () => {} };
    }
    return iap.purchaseUpdatedListener(listener as any);
}

export function purchaseErrorListener(
    listener: (error: PurchaseError) => void
) {
    const iap = getIAP();
    if (!iap) {
        return { remove: () => {} };
    }
    return iap.purchaseErrorListener(listener as any);
}

export async function finishTransaction(opts: {
    purchase: SubscriptionPurchase;
    isConsumable: boolean;
}): Promise<void> {
    const iap = getIAP();
    if (!iap) return;
    await iap.finishTransaction(opts as any);
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function initializePurchases(_userId?: string): Promise<void> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    if (isRunningInExpoGo()) {
        console.log('[IAP] Skipping — running in Expo Go');
        return;
    }

    const iap = getIAP();
    if (!iap) return;

    if (!connectionPromise) {
        // Wrap initConnection with a timeout to prevent startup deadlock.
        // iOS watchdog kills apps that take too long to become responsive.
        const INIT_TIMEOUT_MS = 10000;
        const timeoutPromise = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('[IAP] initConnection timed out')), INIT_TIMEOUT_MS)
        );

        connectionPromise = Promise.race([
            iap.initConnection().then(() => undefined),
            timeoutPromise,
        ]).catch((e) => {
            connectionPromise = null;
            console.warn('[IAP] initConnection warning:', e);
        });
    }

    await connectionPromise;
}

function extractIntroductoryOfferInfo(product: ProductSubscription): Partial<OfferingsResult> {
    const rawProduct = product as Record<string, any>;

    // StoreKit 2 / react-native-iap v15 exposes introductory offer data on the product.
    const introPrice = rawProduct.introductoryPrice ?? rawProduct.introductoryPriceIOS;
    const introPriceString = String(
        rawProduct.introductoryPriceStringIOS ??
        rawProduct.introductoryPriceString ??
        introPrice ??
        ''
    ).trim();

    const paymentMode = String(
        rawProduct.introductoryPricePaymentModeIOS ??
        rawProduct.introductoryPricePaymentMode ??
        rawProduct.introductoryPaymentMode ??
        ''
    ).trim().toLowerCase();

    const periodUnit = String(
        rawProduct.introductoryPriceSubscriptionPeriodIOS ??
        rawProduct.introductoryPriceSubscriptionPeriod ??
        rawProduct.introductorySubscriptionPeriod ??
        ''
    ).trim().toUpperCase();

    const numberOfPeriods = toFiniteNumber(
        rawProduct.introductoryPriceNumberOfPeriodsIOS ??
        rawProduct.introductoryPriceNumberOfPeriods ??
        rawProduct.introductoryNumberOfPeriods
    ) ?? 1;

    const numberOfUnits = toFiniteNumber(
        rawProduct.introductoryPriceSubscriptionPeriodNumberOfUnitsIOS ??
        rawProduct.introductoryPriceSubscriptionPeriodNumberOfUnits ??
        rawProduct.introductorySubscriptionPeriodNumberOfUnits
    ) ?? 1;

    // A free trial is an introductory offer with payment mode "free" or "freetrial"
    // and the price is 0 or the price string includes "Free" / "Grátis".
    const isFreeByMode = paymentMode === 'freetrial' || paymentMode === 'free' || paymentMode === '2';
    const isFreeByPrice =
        introPriceString === '' ||
        introPriceString === '0' ||
        /gr[aá]tis|free|\b0[.,]00\b/i.test(introPriceString);
    const numericPrice = toFiniteNumber(introPrice);
    const isFreeByNumeric = numericPrice === 0;

    const hasIntro = Boolean(introPriceString || isFreeByMode || isFreeByNumeric || periodUnit);
    if (!hasIntro) return {};

    const isFreeTrial = isFreeByMode || isFreeByPrice || isFreeByNumeric;

    // Convert period to approximate days for easy display
    let trialDays: number | undefined;
    if (isFreeTrial && numberOfUnits > 0) {
        const unitDays: Record<string, number> = {
            DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365,
        };
        trialDays = (unitDays[periodUnit] ?? 0) * numberOfUnits * numberOfPeriods;
    }

    return {
        hasIntroductoryOffer: true,
        introductoryPriceString: introPriceString || undefined,
        introductoryNumberOfPeriods: numberOfPeriods,
        introductoryPeriodUnit: periodUnit || undefined,
        introductoryPeriodNumberOfUnits: numberOfUnits,
        trialAvailable: isFreeTrial,
        trialDays: trialDays || undefined,
    };
}

export async function getProOffering(): Promise<OfferingsResult> {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || isRunningInExpoGo()) {
        return { priceString: PRO_PRICE_STRING };
    }

    const iap = getIAP();
    if (!iap) return { priceString: PRO_PRICE_STRING };

    try {
        await initializePurchases();
        const products = await iap.fetchProducts({
            skus: [PRO_PRODUCT_ID],
            type: 'subs',
        }) as ProductSubscription[];
        const product = products.find((item) => item.id === PRO_PRODUCT_ID) || products[0];
        if (product) {
            if (Platform.OS === 'android') {
                googlePlayOfferToken = getGooglePlaySubscriptionOfferToken(product);
            }
            const introInfo = Platform.OS === 'ios'
                ? extractIntroductoryOfferInfo(product)
                : {};
            return {
                priceString: getTrustedDisplayPrice(product),
                ...introInfo,
            };
        }
    } catch (e) {
        console.warn('[IAP] fetchProducts warning:', e);
    }
    return { priceString: PRO_PRICE_STRING };
}

async function getStoreKitSignedTransaction(purchase?: Partial<StorePurchase> | Record<string, any> | null): Promise<string | null> {
    const purchaseToken = (purchase as any)?.purchaseToken;
    if (isJws(purchaseToken)) return purchaseToken;

    if (!hasStoreKitPurchaseEvidence(purchase)) return null;

    const iap = getIAP();
    if (!iap || typeof (iap as any).getTransactionJwsIOS !== 'function') return null;

    try {
        await initializePurchases();
        const signedTransaction = await (iap as any).getTransactionJwsIOS(APPLE_PRO_PRODUCT_ID);
        return isJws(signedTransaction) ? signedTransaction : null;
    } catch (e) {
        console.warn('[IAP] getTransactionJwsIOS unavailable:', e);
        return null;
    }
}

async function getActiveStoreKitPurchase(): Promise<Record<string, any> | null> {
    if (Platform.OS !== 'ios' || isRunningInExpoGo()) return null;

    const iap = getIAP();
    if (!iap) return null;

    await initializePurchases();

    try {
        if (typeof (iap as any).getActiveSubscriptions === 'function') {
            const subscriptions = await (iap as any).getActiveSubscriptions([APPLE_PRO_PRODUCT_ID]);
            const activeSubscription = Array.isArray(subscriptions)
                ? subscriptions.find((item: any) => item?.productId === APPLE_PRO_PRODUCT_ID && item?.isActive !== false)
                : null;

            if (activeSubscription) return activeSubscription;
        }
    } catch (e) {
        console.warn('[IAP] getActiveSubscriptions unavailable:', e);
    }

    try {
        if (typeof (iap as any).currentEntitlementIOS === 'function') {
            const entitlement = await (iap as any).currentEntitlementIOS(APPLE_PRO_PRODUCT_ID);
            if (entitlement?.productId === APPLE_PRO_PRODUCT_ID) return entitlement;
        }
    } catch (e) {
        console.warn('[IAP] currentEntitlementIOS unavailable:', e);
    }

    try {
        if (typeof (iap as any).latestTransactionIOS === 'function') {
            const latestTransaction = await (iap as any).latestTransactionIOS(APPLE_PRO_PRODUCT_ID);
            const expiresMs = toFiniteNumber(latestTransaction?.expirationDateIOS);
            const revokedMs = toFiniteNumber(latestTransaction?.revocationDateIOS);
            const transactionMs = toFiniteNumber(latestTransaction?.transactionDate);
            const recentTransactionWindowMs = 35 * 24 * 60 * 60 * 1000;
            const isRecentOrExplicitlyActive =
                (expiresMs && expiresMs > Date.now()) ||
                (!expiresMs && (!transactionMs || transactionMs > Date.now() - recentTransactionWindowMs));

            if (
                latestTransaction?.productId === APPLE_PRO_PRODUCT_ID &&
                !revokedMs &&
                isRecentOrExplicitlyActive
            ) {
                return latestTransaction;
            }
        }
    } catch (e) {
        console.warn('[IAP] latestTransactionIOS unavailable:', e);
    }

    try {
        const purchases = await iap.getAvailablePurchases({
            onlyIncludeActiveItemsIOS: true,
            alsoPublishToEventListenerIOS: false,
        });
        return (purchases || []).find((item: StorePurchase) => item.productId === APPLE_PRO_PRODUCT_ID) || null;
    } catch (e) {
        console.warn('[IAP] getAvailablePurchases unavailable:', e);
        return null;
    }
}

async function getActiveGooglePlayPurchase(): Promise<Record<string, any> | null> {
    if (Platform.OS !== 'android' || isRunningInExpoGo()) return null;

    const iap = getIAP();
    if (!iap) return null;

    await initializePurchases();

    try {
        if (typeof (iap as any).getActiveSubscriptions === 'function') {
            const subscriptions = await (iap as any).getActiveSubscriptions([GOOGLE_PLAY_PRO_PRODUCT_ID]);
            const activeSubscription = Array.isArray(subscriptions)
                ? subscriptions.find((item: any) =>
                    item?.productId === GOOGLE_PLAY_PRO_PRODUCT_ID &&
                    item?.isActive !== false &&
                    (item?.purchaseToken || item?.purchaseTokenAndroid)
                )
                : null;

            if (activeSubscription) {
                return {
                    ...activeSubscription,
                    purchaseToken: activeSubscription.purchaseToken || activeSubscription.purchaseTokenAndroid,
                };
            }
        }
    } catch (e) {
        console.warn('[IAP] getActiveSubscriptions unavailable on Google Play:', e);
    }

    try {
        const purchases = await iap.getAvailablePurchases();
        return (purchases || []).find((item: StorePurchase) => {
            return item.productId === GOOGLE_PLAY_PRO_PRODUCT_ID && item.purchaseState === 'purchased';
        }) || null;
    } catch (e) {
        console.warn('[IAP] getAvailablePurchases unavailable on Google Play:', e);
        return null;
    }
}

export async function syncStoreKitPurchaseWithBackend(
    firebaseUid: string,
    purchase?: Partial<StorePurchase> | Record<string, any> | null
): Promise<PurchaseResult> {
    if (Platform.OS !== 'ios' || isRunningInExpoGo()) {
        return { success: false, hasPro: false, error: 'StoreKit indisponivel neste ambiente' };
    }

    try {
        const signedTransactionInfo = await getStoreKitSignedTransaction(purchase);
        if (!signedTransactionInfo) {
            return {
                success: false,
                hasPro: false,
                error: 'Nao foi possivel obter a transacao assinada da App Store.',
            };
        }

        const normalizedPurchase = normalizeStoreKitPurchaseForBackend(purchase, signedTransactionInfo);

        const response = await fetch(`${BACKEND_URL}/api/apple/sync-storekit-purchase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(await getFirebaseAuthorizationHeaders()),
            },
            body: JSON.stringify({
                firebaseUid,
                signedTransactionInfo,
                purchase: normalizedPurchase,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'Erro ao sincronizar compra Apple') as Error & { code?: string };
            error.code = data.code || data.errorCode || undefined;
            throw error;
        }

        return {
            success: data.hasPro === true,
            hasPro: data.hasPro === true,
            syncedFromStoreKit: true,
            status: data.status,
            expiresAt: data.expiresAt || null,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
            autoRenewStatus: data.autoRenewStatus || null,
            error: data.error,
        };
    } catch (e: any) {
        const linkedToAnotherAccount = isPurchaseLinkedToAnotherAccountError(e);
        console.warn('[IAP] sync-storekit-purchase warning:', e);
        return {
            success: false,
            hasPro: false,
            error: linkedToAnotherAccount
                ? APPLE_PURCHASE_LINKED_TO_ANOTHER_ACCOUNT_MESSAGE
                : e?.message || 'Erro ao sincronizar compra Apple',
            errorCode: linkedToAnotherAccount
                ? APPLE_PURCHASE_LINKED_TO_ANOTHER_ACCOUNT_CODE
                : e?.code || e?.errorCode,
        };
    }
}

export async function syncActiveStoreKitPurchaseWithBackend(firebaseUid: string): Promise<PurchaseResult> {
    const activePurchase = await getActiveStoreKitPurchase();
    if (!activePurchase) {
        return { success: false, hasPro: false, error: 'Nenhuma assinatura Pro ativa encontrada na App Store.' };
    }

    return syncStoreKitPurchaseWithBackend(firebaseUid, activePurchase);
}

export async function syncGooglePlayPurchaseWithBackend(
    firebaseUid: string,
    purchase?: Partial<StorePurchase> | Record<string, any> | null
): Promise<PurchaseResult> {
    if (Platform.OS !== 'android' || isRunningInExpoGo()) {
        return { success: false, hasPro: false, error: 'Google Play Billing indisponivel neste ambiente' };
    }

    const purchaseToken = (purchase as any)?.purchaseToken || (purchase as any)?.purchaseTokenAndroid;
    if (!purchaseToken) {
        return { success: false, hasPro: false, error: 'Token da compra Google Play nao encontrado.' };
    }

    try {
        const authorizationHeaders = await getFirebaseAuthorizationHeaders();
        const response = await fetch(`${BACKEND_URL}/api/google/validate-purchase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authorizationHeaders,
            },
            body: JSON.stringify({
                firebaseUid,
                productId: (purchase as any)?.productId || GOOGLE_PLAY_PRO_PRODUCT_ID,
                purchaseToken,
                purchase: {
                    productId: (purchase as any)?.productId || GOOGLE_PLAY_PRO_PRODUCT_ID,
                    purchaseState: (purchase as any)?.purchaseState || null,
                    transactionId: (purchase as any)?.transactionId || (purchase as any)?.id || null,
                    transactionDate: toFiniteNumber((purchase as any)?.transactionDate),
                    currentPlanId: (purchase as any)?.currentPlanId || null,
                    isAutoRenewing: typeof (purchase as any)?.isAutoRenewing === 'boolean'
                        ? (purchase as any).isAutoRenewing
                        : null,
                },
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Erro ao validar assinatura Google Play');

        return {
            success: data.hasPro === true,
            hasPro: data.hasPro === true,
            status: data.status,
            expiresAt: data.expiresAt || null,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
            autoRenewStatus: data.autoRenewStatus || null,
        };
    } catch (e: any) {
        console.warn('[IAP] google validate-purchase warning:', e);
        return {
            success: false,
            hasPro: false,
            error: e?.message || 'Erro ao validar assinatura Google Play',
        };
    }
}

export async function syncActiveGooglePlayPurchaseWithBackend(firebaseUid: string): Promise<PurchaseResult> {
    const activePurchase = await getActiveGooglePlayPurchase();
    if (!activePurchase) {
        return { success: false, hasPro: false, error: 'Nenhuma assinatura Pro ativa encontrada na Google Play.' };
    }

    return syncGooglePlayPurchaseWithBackend(firebaseUid, activePurchase);
}

export async function syncActiveStorePurchaseWithBackend(firebaseUid: string): Promise<PurchaseResult> {
    if (Platform.OS === 'android') {
        return syncActiveGooglePlayPurchaseWithBackend(firebaseUid);
    }
    return syncActiveStoreKitPurchaseWithBackend(firebaseUid);
}

export async function syncAppleSubscriptionStatus(
    firebaseUid: string,
    options: AppleSubscriptionStatusOptions = {}
): Promise<AppleSubscriptionStatusResult> {
    const currentStatus = await getAppleSubscriptionStatus(firebaseUid, options);

    if (Platform.OS !== 'ios' || isRunningInExpoGo() || options.syncActivePurchase !== true) {
        return currentStatus;
    }

    if (currentStatus.hasPro) {
        return currentStatus;
    }

    const storeKitSync = await syncActiveStoreKitPurchaseWithBackend(firebaseUid);
    if (storeKitSync.success || storeKitSync.hasPro) {
        return getAppleSubscriptionStatus(firebaseUid);
    }

    return currentStatus;
}

export async function syncGooglePlaySubscriptionStatus(
    firebaseUid: string,
    options: StoreSubscriptionStatusOptions = {}
): Promise<StoreSubscriptionStatusResult> {
    const currentStatus = await getGooglePlaySubscriptionStatus(firebaseUid, options);

    if (Platform.OS !== 'android' || isRunningInExpoGo() || options.syncActivePurchase !== true) {
        return currentStatus;
    }

    const playSync = await syncActiveGooglePlayPurchaseWithBackend(firebaseUid);
    if (playSync.success || playSync.hasPro) {
        return getGooglePlaySubscriptionStatus(firebaseUid);
    }

    return currentStatus;
}

export async function syncStoreSubscriptionStatus(
    firebaseUid: string,
    options: StoreSubscriptionStatusOptions = {}
): Promise<StoreSubscriptionStatusResult> {
    if (Platform.OS === 'android') {
        return syncGooglePlaySubscriptionStatus(firebaseUid, options);
    }
    return syncAppleSubscriptionStatus(firebaseUid, options);
}

export async function checkProStatus(firebaseUid: string): Promise<boolean> {
    const status = await syncStoreSubscriptionStatus(firebaseUid);
    return status.hasPro === true;
}

export async function validateReceiptWithBackend(
    firebaseUid: string,
    receiptData: string,
    purchase?: StorePurchase
): Promise<PurchaseResult> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/apple/validate-receipt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(await getFirebaseAuthorizationHeaders()),
            },
            body: JSON.stringify({
                firebaseUid,
                receiptData,
                productId: purchase?.productId,
                transactionId: purchase?.transactionId,
                originalTransactionId: (purchase as any)?.originalTransactionIdentifierIOS,
                purchaseToken: purchase?.purchaseToken,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'Erro ao validar recibo') as Error & { code?: string };
            error.code = data.code || data.errorCode || undefined;
            throw error;
        }
        return {
            success: data.hasPro === true,
            hasPro: data.hasPro === true,
            status: data.status,
            expiresAt: data.expiresAt || null,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
            autoRenewStatus: data.autoRenewStatus || null,
        };
    } catch (e: any) {
        const linkedToAnotherAccount = isPurchaseLinkedToAnotherAccountError(e);
        console.warn('[IAP] validate-receipt warning:', e);
        return {
            success: false,
            hasPro: false,
            error: linkedToAnotherAccount
                ? APPLE_PURCHASE_LINKED_TO_ANOTHER_ACCOUNT_MESSAGE
                : e?.message || 'Erro ao validar recibo',
            errorCode: linkedToAnotherAccount
                ? APPLE_PURCHASE_LINKED_TO_ANOTHER_ACCOUNT_CODE
                : e?.code || e?.errorCode,
        };
    }
}

async function getReceiptDataForValidation(
    options: { refreshIfMissing?: boolean; attempts?: number; retryDelayMs?: number } = {}
): Promise<string | null> {
    if (Platform.OS !== 'ios' || isRunningInExpoGo()) return null;

    const iap = getIAP();
    if (!iap) return null;

    const attempts = Math.max(1, options.attempts ?? 1);
    const retryDelayMs = options.retryDelayMs ?? 600;

    await initializePurchases();

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const receipt = await iap.getReceiptIOS();
            if (receipt) return receipt;
        } catch (e) {
            console.warn('[IAP] getReceiptIOS unavailable:', e);
        }

        if (attempt < attempts - 1) {
            await wait(retryDelayMs);
        }
    }

    if (options.refreshIfMissing !== true) {
        return null;
    }

    try {
        const refreshedReceipt = await iap.requestReceiptRefreshIOS();
        return refreshedReceipt || null;
    } catch (e) {
        console.warn('[IAP] requestReceiptRefreshIOS failed:', e);
    }

    try {
        const receiptData = await iap.getReceiptDataIOS();
        return receiptData || null;
    } catch (e) {
        console.warn('[IAP] getReceiptDataIOS failed:', e);
        return null;
    }
}

export async function validatePurchaseWithBackend(
    firebaseUid: string,
    purchase: StorePurchase
): Promise<PurchaseResult> {
    if (Platform.OS === 'android') {
        return syncGooglePlayPurchaseWithBackend(firebaseUid, purchase);
    }

    const storeKitResult = await syncStoreKitPurchaseWithBackend(firebaseUid, purchase);
    if (storeKitResult.success) {
        return storeKitResult;
    }
    if (isPurchaseLinkedToAnotherAccountError(storeKitResult)) {
        return storeKitResult;
    }

    const receiptData = await getReceiptDataForValidation({
        refreshIfMissing: false,
        attempts: 3,
        retryDelayMs: 700,
    });

    if (receiptData) {
        const receiptResult = await validateReceiptWithBackend(firebaseUid, receiptData, purchase);
        if (receiptResult.success || receiptResult.error) {
            return receiptResult;
        }
    }

    return {
        success: false,
        hasPro: false,
        error: storeKitResult.error || 'Compra feita na Apple, mas ainda nao foi possivel ativar o Pro. Toque em Restaurar compras.',
        errorCode: storeKitResult.errorCode,
    };
}

export async function restorePurchases(firebaseUid: string): Promise<RestoreResult> {
    const accountStatus = await getStoreSubscriptionStatus(firebaseUid, { refreshServerStatus: true });
    if (accountStatus.hasPro) {
        return { success: true, hasPro: true };
    }

    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || isRunningInExpoGo()) {
        return {
            success: accountStatus.success,
            hasPro: false,
            error: accountStatus.error || 'IAP not available in this environment',
        };
    }

    const iap = getIAP();
    if (!iap) {
        return {
            success: accountStatus.success,
            hasPro: false,
            error: accountStatus.error || 'IAP not available',
        };
    }

    try {
        await initializePurchases();

        const activeSync = await syncActiveStorePurchaseWithBackend(firebaseUid);
        if (activeSync.success || activeSync.hasPro) {
            return { success: true, hasPro: true };
        }

        await iap.restorePurchases();
        const purchases = await iap.getAvailablePurchases(
            Platform.OS === 'ios'
                ? {
                    onlyIncludeActiveItemsIOS: true,
                    alsoPublishToEventListenerIOS: false,
                }
                : undefined
        );
        const proPurchase = purchases.find(p => p.productId === PRO_PRODUCT_ID);
        if (!proPurchase) {
            const refreshedAccountStatus = await getStoreSubscriptionStatus(firebaseUid, { refreshServerStatus: true });
            return { success: true, hasPro: refreshedAccountStatus.hasPro };
        }
        const result = await validatePurchaseWithBackend(firebaseUid, proPurchase);
        if (result.success) {
            await iap.finishTransaction({ purchase: proPurchase as any, isConsumable: false });
            return { success: true, hasPro: true };
        }
        return {
            success: false,
            hasPro: false,
            error: result.error,
            errorCode: result.errorCode,
        };
    } catch (e: any) {
        console.warn('[IAP] restorePurchases warning:', e);
        return { success: false, hasPro: false, error: e.message };
    }
}

export async function purchaseProSubscription(firebaseUid?: string): Promise<StorePurchase | null> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        throw new Error('Assinaturas nativas nao sao suportadas nesta plataforma.');
    }
    if (isRunningInExpoGo()) {
        throw new Error('Compras não são suportadas no Expo Go. Use um build nativo (EAS).');
    }
    const iap = getIAP();
    if (!iap) throw new Error('IAP não disponível neste ambiente');
    await initializePurchases();

    if (!firebaseUid) throw new Error('Entre na sua conta antes de assinar.');
    console.log('[IAP] Starting purchase request', {
        platform: Platform.OS,
        productId: PRO_PRODUCT_ID,
        backendUrl: BACKEND_URL,
    });

    if (Platform.OS === 'android') {
        if (!googlePlayOfferToken) {
            await getProOffering();
        }
        if (!googlePlayOfferToken) {
            throw new Error('Oferta mensal do Google Play nao encontrada. Confira a configuracao no Play Console.');
        }

        const purchase = await iap.requestPurchase({
            request: {
                google: {
                    skus: [GOOGLE_PLAY_PRO_PRODUCT_ID],
                    obfuscatedAccountId: await getGooglePlayAccountId(firebaseUid),
                    subscriptionOffers: [{
                        sku: GOOGLE_PLAY_PRO_PRODUCT_ID,
                        offerToken: googlePlayOfferToken,
                    }],
                },
            },
            type: 'subs',
        });
        console.log('[IAP] requestPurchase result', {
            platform: Platform.OS,
            resultType: Array.isArray(purchase) ? 'array' : purchase ? 'object' : 'empty',
            productId: getProPurchaseFromRequestResult(purchase)?.productId || null,
        });
        return getProPurchaseFromRequestResult(purchase);
    }

    const purchase = await iap.requestPurchase({
        request: {
            apple: {
                sku: APPLE_PRO_PRODUCT_ID,
                appAccountToken: await getAppleAppAccountToken(firebaseUid),
            },
        },
        type: 'subs',
    });
    console.log('[IAP] requestPurchase result', {
        platform: Platform.OS,
        resultType: Array.isArray(purchase) ? 'array' : purchase ? 'object' : 'empty',
        productId: getProPurchaseFromRequestResult(purchase)?.productId || null,
    });
    return getProPurchaseFromRequestResult(purchase);
}

export async function openSubscriptionManagement(): Promise<void> {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || isRunningInExpoGo()) return;

    const iap = getIAP();
    if (!iap) throw new Error('IAP nao disponivel neste ambiente');

    await initializePurchases();
    await iap.deepLinkToSubscriptions(
        Platform.OS === 'android'
            ? {
                skuAndroid: GOOGLE_PLAY_PRO_PRODUCT_ID,
                packageNameAndroid: GOOGLE_PLAY_PACKAGE_NAME,
            }
            : undefined
    );
}
