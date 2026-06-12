import { UniversalBackground } from '@/components/UniversalBackground';
import { IosCoreLoader } from '@/components/ui/IosCoreLoader';
import { useAuthContext } from '@/contexts/AuthContext';
import { databaseService } from '@/services/firebase';
import { openSubscriptionManagement, restorePurchases, syncStoreSubscriptionStatus } from '@/services/iapService';
import { getStoreSubscriptionStatus } from '@/services/storeSubscriptionStatus';
import { safeBack } from '@/utils/navigation';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import {
    AlertCircle,
    AlertTriangle,
    ChevronLeft,
    LogOut,
    RefreshCw,
    Zap
} from 'lucide-react-native';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Types
interface PaymentHistoryItem {
    id: string;
    amount: number;
    status: 'paid' | 'pending' | 'failed';
    createdAt: any;
    paymentMethod?: {
        brand?: string;
        last4?: string;
    };
    invoiceUrl?: string;
}

interface SubscriptionData {
    plan: string;
    status: string;
    provider?: string;
    paymentProvider?: string;
    iapSource?: string;
    manualGrant?: boolean;
    expiresAt?: any;
    startedAt?: any;
    renewalDate?: any;
    billingCycle?: 'monthly' | 'yearly';
    price?: number;
    nextBillingDate?: string;
    cancelledAt?: any;
    cancelAtPeriodEnd?: boolean;
    autoRenewStatus?: string | null;
}

interface PaymentMethodData {
    type: string;
    brand?: string;
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
}

// Helper Components
const SectionHeader = ({ title }: { title: string }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
);

const LoadingState = () => <IosCoreLoader />;

async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string
): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            promise,
            new Promise<null>((resolve) => {
                timer = setTimeout(() => {
                    console.warn(`[Subscription] ${label} timed out after ${timeoutMs}ms`);
                    resolve(null);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

const EmptyHistoryState = () => (
    <View style={styles.emptyHistoryContainer}>
        <AlertCircle size={32} color="#6E6E73" />
        <Text style={styles.emptyHistoryText}>Nenhum pagamento registrado</Text>
        <Text style={styles.emptyHistorySubtext}>
            Seu histórico de pagamentos aparecerá aqui
        </Text>
    </View>
);

// Helpers
const formatDateSimple = (dateVal: any) => {
    try {
        if (!dateVal) return '';
        let d;
        if (typeof dateVal.toDate === 'function') {
            d = dateVal.toDate();
        } else if (typeof dateVal === 'string' || typeof dateVal === 'number') {
            d = new Date(dateVal);
        } else {
            d = new Date(dateVal);
        }

        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
        return '';
    }
};

const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
};

const getCardBrandName = (brand?: string) => {
    if (!brand) return 'Cartão';
    const brands: Record<string, string> = {
        'visa': 'Visa',
        'mastercard': 'Mastercard',
        'amex': 'American Express',
        'elo': 'Elo',
        'hipercard': 'Hipercard',
        'diners': 'Diners Club',
        'credit_card': 'Cartão de Crédito',
    };
    return brands[brand.toLowerCase()] || brand;
};

const getStatusConfig = (status: string) => {
    switch (status) {
        case 'active':
            return { label: 'Ativo', color: '#30D158' };
        case 'canceled':
        case 'cancelled':
            return { label: 'Cancelado', color: '#FF453A' };
        case 'past_due':
            return { label: 'Pagamento Pendente', color: '#FF9500' };
        case 'expired':
        case 'trial_expired':
            return { label: 'Vencido', color: '#FF453A' };
        case 'trial':
        case 'trialing':
            return { label: 'Período de Teste', color: '#D97757' };
        case 'inactive':
            return { label: 'Inativo', color: '#FF453A' };
        case 'free':
        case 'starter':
            return { label: 'Gratuito', color: '#8E8E93' };
        default:
            return { label: 'Gratuito', color: '#8E8E93' };
    }
};

export default function SubscriptionSettingsScreen() {
    const router = useRouter();
    const { user, profile, refreshProfile, signOut } = useAuthContext();
    const userId = user?.uid;
    const insets = useSafeAreaInsets();

    // State
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
    const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethodData | null>(null);
    const refreshProfileRef = useRef(refreshProfile);

    useEffect(() => {
        refreshProfileRef.current = refreshProfile;
    }, [refreshProfile]);

    // Load subscription data from Firebase
    const loadSubscriptionData = useCallback(async (options: { syncStoreStatus?: boolean } = {}) => {
        if (!userId) {
            setIsLoading(false);
            setIsRefreshing(false);
            return;
        }

        try {
            if (options.syncStoreStatus !== false) {
                const statusResult = await withTimeout(
                    getStoreSubscriptionStatus(userId, { syncActivePurchase: false }),
                    8000,
                    'Store subscription sync'
                );
                if (statusResult?.success) {
                    await withTimeout(
                        refreshProfileRef.current(),
                        5000,
                        'Profile refresh after store sync'
                    );
                }
            }

            const subscriptionDataResult = await withTimeout(
                Promise.all([
                    databaseService.getFullSubscription(userId),
                    databaseService.getPaymentHistory(userId, 10),
                ]),
                10000,
                'Subscription data load'
            );

            if (!subscriptionDataResult) return;

            const [subResult, historyResult] = subscriptionDataResult;

            if (subResult.success && subResult.data) {
                setSubscription(subResult.data.subscription);
                setPaymentMethod(subResult.data.paymentMethod);
            }

            if (historyResult.success && historyResult.data) {
                setPaymentHistory(historyResult.data as PaymentHistoryItem[]);
            }
        } catch (error) {
            console.error('[Subscription] Error loading data:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [userId]);

    // Reload when the screen is opened again from App Store management or purchase flow
    useFocusEffect(useCallback(() => {
        setIsLoading(true);
        loadSubscriptionData();
    }, [loadSubscriptionData]));

    // Pull to refresh
    const onRefresh = async () => {
        setIsRefreshing(true);
        await loadSubscriptionData();
    };

    // Switch account handler
    const handleSwitchAccount = async () => {
        await signOut();
        router.replace('/(public)/login');
    };

    // Derived values - use profile data as fallback if subscription state is not yet loaded
    const currentSubscription = (subscription || profile?.subscription || null) as SubscriptionData | null;
    const currentPaymentMethod = paymentMethod || profile?.paymentMethod;

    const plan = String(currentSubscription?.plan || 'free').trim().toLowerCase();
    const status = String(currentSubscription?.status || 'free').trim().toLowerCase();
    const hasProPlan = plan === 'pro' || plan === 'premium';
    const isExpired = status === 'expired' || status === 'past_due' || status === 'trial_expired';
    const cancelAtPeriodEnd =
        currentSubscription?.cancelAtPeriodEnd === true ||
        String(currentSubscription?.autoRenewStatus || '').trim().toLowerCase() === 'disabled';
    const isCancelled = status === 'cancelled' || status === 'canceled' || (cancelAtPeriodEnd && !isExpired);
    const isPro = hasProPlan && (status === 'active' || status === 'trial' || status === 'trialing') && !isExpired;
    const isTrial = isPro && (status === 'trial' || status === 'trialing');
    const hasKnownProSubscription = hasProPlan && (isPro || isCancelled || isExpired);
    const displayStatus = isExpired ? 'expired' : isCancelled ? 'cancelled' : status;
    const statusConfig = getStatusConfig(displayStatus);

    // Content Logic
    // - Sem plano = Starter
    // - Plano pro/premium com status trial = Trial
    // - Plano pro/premium com status active = Pro
    const planDisplay = !hasKnownProSubscription ? 'Starter' : (isTrial ? 'Grátis' : 'Pro');
    const billingCycle = currentSubscription?.billingCycle || 'monthly';

    // Block Android back button for non-Pro users
    useEffect(() => {
        if (isPro) return;
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => backHandler.remove();
    }, [isPro]);
    // Valor padrão do Pro é R$ 34,90
    const priceValue = currentSubscription?.price
        ? formatCurrency(currentSubscription.price)
        : (hasKnownProSubscription ? 'R$ 34,90' : 'R$ 0,00');

    // Datas de renovação/vencimento removidas a pedido do usuário

    // Has valid payment method?
    const hasPaymentMethod = currentPaymentMethod && currentPaymentMethod.last4;

    // Fallback para paymentMethodDetails se não houver paymentMethod
    const paymentDetails = profile?.paymentMethodDetails;
    const displayPaymentMethod = hasPaymentMethod
        ? currentPaymentMethod
        : (paymentDetails?.last4 ? {
            brand: paymentDetails.brand,
            last4: paymentDetails.last4,
            expiryMonth: null,
            expiryYear: null,
            type: 'credit_card'
        } : null);

    const hasDisplayPaymentMethod = displayPaymentMethod && displayPaymentMethod.last4;
    const subscriptionProvider = String(
        currentSubscription?.provider ||
        currentSubscription?.paymentProvider ||
        currentSubscription?.iapSource ||
        ''
    ).trim().toLowerCase();
    const isAppleSubscription =
        Platform.OS === 'ios' &&
        ['apple', 'app_store', 'storekit'].includes(subscriptionProvider);
    const isGooglePlaySubscription =
        Platform.OS === 'android' &&
        ['google', 'google_play', 'play_store'].includes(subscriptionProvider);
    const isNativeStoreSubscription = isAppleSubscription || isGooglePlaySubscription;
    const nativeStoreName = isGooglePlaySubscription ? 'Google Play' : 'App Store';
    const isManualSubscription =
        subscriptionProvider === 'manual' ||
        subscriptionProvider === 'admin' ||
        currentSubscription?.manualGrant === true;
    const renewalDateText = formatDateSimple(
        currentSubscription?.renewalDate ||
        currentSubscription?.nextBillingDate ||
        currentSubscription?.expiresAt
    );
    const needsPaymentSetup =
        Platform.OS === 'ios' &&
        hasKnownProSubscription &&
        isManualSubscription &&
        !isAppleSubscription &&
        !hasDisplayPaymentMethod;

    const handleConfigurePayment = () => {
        router.push({
            pathname: '/settings/plans',
            params: { setupPayment: 'true' },
        } as any);
    };

    const handleManageNativeSubscription = async () => {
        try {
            await openSubscriptionManagement();
            if (user?.uid) {
                const statusResult = await syncStoreSubscriptionStatus(user.uid, {
                    refreshServerStatus: true,
                    syncActivePurchase: true,
                });
                if (statusResult.success) await refreshProfile();
                await loadSubscriptionData({ syncStoreStatus: false });
            }
        } catch (error: any) {
            Alert.alert(
                `Assinaturas da ${nativeStoreName}`,
                error?.message || 'Nao foi possivel abrir o gerenciamento de assinaturas.',
                [{ text: 'OK' }]
            );
        }
    };

    // Restore purchases handler
    const handleRestorePurchases = async () => {
        if (!user?.uid) return;
        setIsRestoring(true);
        try {
            const result = await restorePurchases(user.uid);
            if (result.hasPro) {
                await refreshProfile();
                await loadSubscriptionData({ syncStoreStatus: false });
                Alert.alert(
                    'Compra restaurada!',
                    'Sua assinatura Pro foi restaurada com sucesso.',
                    [{ text: 'Continuar', onPress: () => router.replace('/(tabs)/dashboard') }]
                );
            } else {
                Alert.alert(
                    'Nenhuma compra encontrada',
                    'Não encontramos uma assinatura Pro ativa para esta conta.',
                    [{ text: 'OK' }]
                );
            }
        } catch (error: any) {
            Alert.alert(
                'Erro ao restaurar',
                error?.message || 'Não foi possível restaurar as compras agora.',
                [{ text: 'OK' }]
            );
        } finally {
            setIsRestoring(false);
        }
    };

    // Expired plan helper for banner message
    const getExpiredInfo = () => {
        if (!isExpired || !hasKnownProSubscription) return null;
        return { message: 'Seu plano está vencido. Regularize para continuar com acesso total.' };
    };
    const expiredInfo = getExpiredInfo();

    return (
        <View style={styles.mainContainer}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="none">
                <UniversalBackground backgroundColor="#0C0C0C" glowSize={350} height={280} />
            </View>

            <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    {isPro ? (
                        <TouchableOpacity
                            onPress={() => safeBack(router)}
                            style={styles.backButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <ChevronLeft size={24} color="#A1A1A6" />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.backButton} />
                    )}
                    <Text style={styles.headerTitle}>Meu plano</Text>
                    {!isPro ? (
                        <TouchableOpacity
                            onPress={handleSwitchAccount}
                            style={styles.switchAccountButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <LogOut size={20} color="#A1A1A6" />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.switchAccountButton} />
                    )}
                </View>
            </View>

            {isLoading ? (
                <LoadingState />
            ) : (
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={onRefresh}
                            tintColor="#D97757"
                            colors={['#D97757']}
                        />
                    }
                >

                    <SectionHeader title="Plano atual" />

                    <View style={[styles.planCard, isExpired && hasKnownProSubscription && styles.planCardExpired]}>
                        <View style={styles.planHeader}>
                            <View>
                                <Text style={styles.planName}>{planDisplay}</Text>
                                <Text style={styles.planSubName}>
                                    {!hasKnownProSubscription ? 'Plano atual' : 'Recursos ilimitados'}
                                </Text>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}18` }]}>
                                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                    {statusConfig.label}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.planDescription}>
                            {!hasKnownProSubscription
                                ? 'Para usar o app você precisa de uma assinatura ativa. Você pode testar por 7 dias grátis. Após o período de teste, o valor é de R$ 35,90/mês (ou R$ 34,90/mês no iPhone).'
                                : 'Controle completo, relatórios detalhados, conexões inteligentes e muito mais.'}
                        </Text>

                        {hasKnownProSubscription && !isExpired && !isCancelled && (
                            <View style={styles.planMetaContainer}>
                                <Text style={styles.planMetaText}>
                                    {priceValue} • {billingCycle === 'yearly' ? 'Anual' : 'Mensal'}
                                </Text>
                            </View>
                        )}

                        {isPro && !isTrial && !isCancelled && !isExpired && (
                            <View style={styles.nextBillingRow}>
                                <Text style={styles.nextBillingLabel}>Próxima cobrança</Text>
                                <Text style={styles.nextBillingAmount}>{priceValue}</Text>
                            </View>
                        )}

                        {(isExpired || isCancelled) && hasKnownProSubscription && (
                            <View style={styles.planMetaContainer}>
                                <Text style={styles.planMetaText}>
                                    {isCancelled ? 'Plano cancelado' : 'Plano vencido'}
                                </Text>
                            </View>
                        )}

                        {isTrial && (
                            <View style={styles.planMetaContainer}>
                                <Text style={styles.planMetaText}>Período de teste em andamento</Text>
                            </View>
                        )}

                        {!hasKnownProSubscription ? (
                            <View style={styles.planFooterRow}>
                                <View>
                                    <Text style={styles.planPriceLabel}>Gratuito</Text>
                                    <Text style={styles.planPriceSublabel}>Para sempre</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.upgradeButton}
                                    onPress={() => router.push('/settings/plans')}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.upgradeButtonText}>Fazer upgrade</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        {/* Renewal / Restore buttons for expired or cancelled plans */}
                        {(isExpired || isCancelled) && hasKnownProSubscription && (
                            <View style={styles.planFooterRow}>
                                <TouchableOpacity
                                    style={styles.restoreButton}
                                    onPress={handleRestorePurchases}
                                    activeOpacity={0.7}
                                    disabled={isRestoring}
                                >
                                    {isRestoring ? (
                                        <ActivityIndicator size="small" color="#8E8E93" />
                                    ) : (
                                        <Text style={styles.restoreButtonText}>Restaurar</Text>
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.upgradeButton}
                                    onPress={() => router.push('/settings/plans')}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.upgradeButtonText}>Renovar assinatura</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* PAYMENT METHOD CARD */}
                    {(isNativeStoreSubscription || needsPaymentSetup || hasDisplayPaymentMethod) && (
                        <>
                            <SectionHeader title="Pagamento" />
                            <View style={styles.paymentCard}>
                                {isNativeStoreSubscription ? (
                                    <View style={styles.paymentRow}>
                                        <View style={styles.paymentIconBox}>
                                            <Text style={styles.paymentIconEmoji}></Text>
                                        </View>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardText}>{nativeStoreName}</Text>
                                            <Text style={styles.cardSubtext}>Gerenciado pela loja do dispositivo</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.editButton}
                                            onPress={handleManageNativeSubscription}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={styles.editButtonText}>Gerenciar</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : needsPaymentSetup ? (
                                    <View style={styles.paymentRow}>
                                        <View style={styles.paymentIconBox}>
                                            <Text style={styles.paymentIconEmoji}></Text>
                                        </View>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardText}>Método de pagamento pendente</Text>
                                            <Text style={styles.cardSubtext}>
                                                {renewalDateText
                                                    ? `Renovação prevista para ${renewalDateText}`
                                                    : 'Configure pela App Store para manter o Pro'}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.editButton}
                                            onPress={handleConfigurePayment}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={styles.editButtonText}>Configurar</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : hasDisplayPaymentMethod ? (
                                    <View style={styles.paymentRow}>
                                        <View style={styles.paymentIconBox}>
                                            <Text style={styles.paymentIconEmoji}>💳</Text>
                                        </View>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardText}>
                                                {getCardBrandName(displayPaymentMethod?.brand)} •••• {displayPaymentMethod?.last4}
                                            </Text>
                                            <Text style={styles.cardSubtext}>
                                                {displayPaymentMethod?.expiryMonth && displayPaymentMethod?.expiryYear
                                                    ? `Expira em ${String(displayPaymentMethod.expiryMonth).padStart(2, '0')}/${displayPaymentMethod.expiryYear}`
                                                    : paymentDetails?.expiry
                                                        ? `Expira em ${paymentDetails.expiry}`
                                                        : 'Cartão de crédito'
                                                }
                                            </Text>
                                        </View>
                                    </View>
                                ) : null}
                            </View>
                        </>
                    )}



                    <View style={{ height: 100 }} />

                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: '#0C0C0C',
    },
    headerWrapper: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 52,
        paddingHorizontal: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: '#E8E8EA',
        textAlign: 'center',
    },
    switchAccountButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    planCard: {
        backgroundColor: '#111111',
        borderRadius: 14,
        padding: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#1A1A1A',
    },
    planHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    planSubName: {
        fontSize: 13,
        color: '#8E8E93',
        marginTop: 2,
    },
    planDescription: {
        fontSize: 14,
        color: '#A1A1A6',
        lineHeight: 20,
        marginBottom: 16,
    },
    planMetaContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        alignSelf: 'flex-start',
        marginBottom: 12,
    },
    planMetaText: {
        fontSize: 13,
        color: '#E8E8EA',
        fontWeight: '500',
    },
    planPriceLabel: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    planPriceSublabel: {
        fontSize: 11,
        color: '#6E6E73',
        marginTop: 1,
    },
    upgradeIcon: {
        marginRight: 6,
    },
    planTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    planName: {
        fontSize: 26,
        fontWeight: '600',
        color: '#FFFFFF',
        letterSpacing: -0.3,
    },
    planMeta: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    nextBillingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
        paddingTop: 14,
        marginHorizontal: -18,
        paddingHorizontal: 18,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#242424',
    },
    nextBillingLabel: {
        fontSize: 14,
        color: '#8E8E93',
    },
    nextBillingAmount: {
        fontSize: 14,
        fontWeight: '500',
        color: '#E8E8EA',
    },
    planFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
        paddingTop: 14,
        marginHorizontal: -18,
        paddingHorizontal: 18,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 100,
        gap: 5,
    },
    statusDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },
    statusText: {
        fontSize: 12,
        color: '#909090',
        letterSpacing: 0,
    },
    upgradeButton: {
        backgroundColor: '#D97757',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
    },
    upgradeButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#fff',
    },
    restoreButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        minWidth: 90,
        alignItems: 'center',
        justifyContent: 'center',
    },
    restoreButtonText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#A1A1A6',
    },
    // Section Headers
    sectionHeader: {
        fontSize: 12,
        fontFamily: 'AROneSans_400Regular',
        color: '#909090',
        marginTop: 18,
        marginBottom: 10,
        marginLeft: 4,
        letterSpacing: 0,
    },

    itemSeparatorInset: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#161616',
        marginLeft: 0,
    },
    dangerButton: {
        marginTop: 32,
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'rgba(255, 69, 58, 0.05)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 69, 58, 0.15)',
    },
    dangerButtonText: {
        color: '#FF453A',
        fontSize: 15,
        fontWeight: '600',
    },
    // Payment Card
    paymentCard: {
        backgroundColor: '#111111',
        borderRadius: 14,
        padding: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#1A1A1A',
    },
    paymentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    paymentIconBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#1A1A1A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    paymentIconEmoji: {
        fontSize: 18,
    },
    cardInfo: {
        flex: 1,
    },
    cardText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#E8E8EA',
        marginBottom: 2,
    },
    cardSubtext: {
        fontSize: 12,
        color: '#555',
    },
    editButton: {
        paddingVertical: 7,
        paddingHorizontal: 13,
        backgroundColor: '#1A1A1A',
        borderRadius: 10,
    },
    editButtonText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#D97757',
    },
    noPaymentMethod: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    noPaymentText: {
        fontSize: 14,
        color: '#555',
    },
    // Invoice Items
    invoiceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'rgba(28, 28, 30, 0.82)',
    },
    invoiceIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    invoiceContent: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    invoiceDate: {
        fontSize: 15,
        fontWeight: '500',
        color: '#F5F5F7',
        marginBottom: 2,
    },
    invoiceStatus: {
        fontSize: 12,
        color: '#6E6E73',
    },
    invoiceAmount: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F5F7',
    },
    pdfBadge: {
        backgroundColor: 'rgba(255,255,255,0.07)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    pdfText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#8E8E93',
    },
    // Empty History State
    emptyHistoryContainer: {
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    emptyHistoryText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#8E8E93',
        marginTop: 8,
    },
    emptyHistorySubtext: {
        fontSize: 13,
        color: '#6E6E73',
        textAlign: 'center',
    },
    planCardExpired: {
        borderColor: 'rgba(255, 69, 58, 0.22)',
    },
    // CTA Upgrade Card
    ctaCard: {
        backgroundColor: '#0A84FF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 4,
    },
    ctaContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    ctaTextContainer: {
        flex: 1,
    },
    ctaTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#000',
        marginBottom: 2,
    },
    ctaSubtitle: {
        fontSize: 13,
        color: 'rgba(0,0,0,0.65)',
        fontWeight: '500',
    },
    ctaIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },

});
