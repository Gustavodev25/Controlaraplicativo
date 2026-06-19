import { BankActionsSheet } from '@/components/open-finance/BankActionsSheet';
import { BankConnectorLogo } from '@/components/open-finance/BankConnectorLogo';
import { databaseService } from '@/services/firebase';
import { notificationService } from '@/services/notifications';
import { openFinanceSyncBus } from '@/services/openFinanceSyncBus';
import { BlurView } from 'expo-blur';
import {
    CheckCircle,
    ChevronRight,
    Lock,
    RefreshCw,
    XCircle
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    LayoutAnimation,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    useWindowDimensions,
    View
} from 'react-native';
import Reanimated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

export type BankSyncStatus = {
    step: 'idle' | 'connecting' | 'fetching_accounts' | 'saving_accounts' | 'fetching_transactions' | 'saving_transactions' | 'done' | 'error';
    message: string;
    progress: number;
    details?: { checking: number; credit: number };
};

interface ConnectedBankCardProps {
    group: any;
    onDelete: (group: any) => void;
    onSync: (group: any, onStatusUpdate: (status: BankSyncStatus) => void) => Promise<void>;
    // Sync Credits props
    hasCredits?: boolean;
    // Function to check if this specific bank can sync (by itemId)
    canSyncItem?: (itemId: string) => boolean;
    // Function to consume credit with itemId
    onConsumeCredit?: (action: 'sync', itemId?: string) => Promise<{ success: boolean; error?: string }>;
    hiddenAccountIds?: string[];
    onToggleVisibility?: (accountId: string) => void;
    onStatusChange?: (group: any, status: BankSyncStatus) => void;
}

// Helper Component: Minimalist progress indicator
// Removed complex stepper components (PulseRing, StepIcon, StepItem) for a minimalist design

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const splitCurrency = (value: number) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const isNegative = safeValue < 0;
    const absValue = Math.abs(safeValue);
    const integerPart = Math.floor(absValue);
    const fractionPart = Math.round((absValue - integerPart) * 100);
    const integerStr = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const fractionStr = fractionPart.toString().padStart(2, '0');

    return {
        currency: isNegative ? '-R$' : 'R$',
        amount: `${integerStr},${fractionStr}`
    };
};

const isCreditAccount = (account: any) => (
    account.type === 'CREDIT' ||
    account.type === 'credit' ||
    account.type === 'CREDIT_CARD' ||
    account.subtype === 'CREDIT_CARD'
);

const getAccountTypeLabel = (account: any) => {
    if (isCreditAccount(account)) return 'Cartão de Crédito';

    if (account.subtype === 'SAVINGS_ACCOUNT') return 'Conta Poupança';
    if (account.subtype === 'CHECKING_ACCOUNT' || account.type === 'BANK' || account.type === 'checking') {
        return 'Conta Corrente';
    }

    return 'Conta Corrente';
};

const getAccountNumericValue = (account: any) => {
    const value = isCreditAccount(account)
        ? (account.creditLimit ?? account.creditData?.creditLimit ?? account.availableCreditLimit ?? account.creditData?.availableCreditLimit)
        : account.balance;

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
};

const normalizeDateValue = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getLatestSyncDate = (accounts: any[]) => {
    return accounts.reduce<Date | null>((latest, account) => {
        const date = normalizeDateValue(account.lastSyncedAt || account.syncedAt || account.updatedAt);
        if (!date) return latest;
        if (!latest || date.getTime() > latest.getTime()) return date;
        return latest;
    }, null);
};

const formatRelativeSyncTime = (date: Date | null) => {
    if (!date) return 'agora';

    const diffMs = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.max(1, Math.floor(diffMs / 60000));

    if (minutes < 60) {
        return minutes === 1 ? 'há 1 minuto' : `há ${minutes} minutos`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return hours === 1 ? 'há 1 hora' : `há ${hours} horas`;
    }

    const days = Math.floor(hours / 24);
    if (days < 7) {
        return days === 1 ? 'há 1 dia' : `há ${days} dias`;
    }

    return `em ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
};



export const ConnectedBankCard = ({
    group,
    onDelete,
    onSync,
    hasCredits = true,
    canSyncItem,
    onConsumeCredit,
    hiddenAccountIds,
    onStatusChange
}: ConnectedBankCardProps) => {
    const { width } = useWindowDimensions();
    const isNarrowPhone = width < 360;
    const isTinyPhone = width < 340;
    const logoSize = isNarrowPhone ? 32 : 36;
    const logoRadius = logoSize / 2;
    const [expanded, setExpanded] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const pressProgress = useSharedValue(0);
    const morphProgress = useSharedValue(0);
    const [syncStatus, setSyncStatus] = useState<BankSyncStatus>({
        step: 'idle',
        message: '',
        progress: 0
    });
    const syncStepRef = useRef<BankSyncStatus['step']>('idle');

    useEffect(() => {
        syncStepRef.current = syncStatus.step;
    }, [syncStatus.step]);

    const updateSyncStatus = useCallback((status: BankSyncStatus) => {
        syncStepRef.current = status.step;
        setSyncStatus(status);
        onStatusChange?.(group, status);

        const bankName = group?.connector?.name || null;
        const inFlight = status.step !== 'idle' && status.step !== 'done' && status.step !== 'error';
        openFinanceSyncBus.setState({
            active: inFlight || status.step === 'error',
            phase: status.step,
            message: status.message || '',
            progress: typeof status.progress === 'number' ? status.progress : 0,
            bankName,
            accountsProcessed: status.details?.checking,
            creditAccountsProcessed: status.details?.credit,
        });

        if (status.step === 'done') {
            // clear the banner shortly after completion
            setTimeout(() => {
                const cur = openFinanceSyncBus.getState();
                if (cur.phase === 'done') openFinanceSyncBus.reset();
            }, 1500);
        }
    }, [group, onStatusChange]);

    const cardAnimatedStyle = useAnimatedStyle(() => {
        const pressed = pressProgress.value;
        const morph = morphProgress.value;

        return {
            borderRadius: 16 + morph * 4 - pressed * 1.2,
            transform: [
                { translateY: pressed * 1.4 },
                { scaleX: 1 + morph * 0.012 - pressed * 0.012 },
                { scaleY: 1 + morph * 0.016 + pressed * 0.008 },
            ],
        };
    });

    const startCardMorph = () => {
        pressProgress.value = withSpring(1, {
            damping: 16,
            stiffness: 250,
            mass: 0.42,
        });
        morphProgress.value = withSpring(1, {
            damping: 13,
            stiffness: 190,
            mass: 0.48,
        });
    };

    const endCardMorph = () => {
        pressProgress.value = withSpring(0, {
            damping: 15,
            stiffness: 215,
            mass: 0.45,
        });
        morphProgress.value = withSpring(0, {
            damping: 11,
            stiffness: 145,
            mass: 0.52,
        });
    };


    // Timer state for countdown until midnight
    const [timeUntilReset, setTimeUntilReset] = useState<string>('');

    // Get itemId from first account in group
    const itemId = group.accounts?.[0]?.pluggyItemId || group.accounts?.[0]?.itemId || null;

    // Check if THIS specific bank can sync today
    const canSyncThisBank = canSyncItem ? (itemId ? canSyncItem(itemId) : true) : true;

    // Update countdown timer every second when sync is disabled
    useEffect(() => {
        if (!canSyncThisBank) {
            const updateTimer = () => {
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);

                const diffMs = tomorrow.getTime() - now.getTime();
                const hours = Math.floor(diffMs / (1000 * 60 * 60));
                const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

                setTimeUntilReset(
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                );
            };

            updateTimer();
            const interval = setInterval(updateTimer, 1000);
            return () => clearInterval(interval);
        }
    }, [canSyncThisBank]);

    const isSyncing = syncStatus.step !== 'idle' && syncStatus.step !== 'done' && syncStatus.step !== 'error';

    // Sync is disabled if: no credits OR already synced this bank today
    const isSyncDisabled = !hasCredits || !canSyncThisBank;

    useEffect(() => {
        if (isSyncing) setMenuVisible(false);
    }, [isSyncing]);

    const accounts = Array.isArray(group.accounts) ? group.accounts : [];
    const hiddenIds = hiddenAccountIds || [];
    const bankName = group.connector?.name || 'Instituição';
    const cashAccounts = accounts.filter((account: any) => !isCreditAccount(account));
    const totalBalance = cashAccounts.reduce((sum: number, account: any) => {
        if (hiddenIds.includes(account.id)) return sum;
        return sum + getAccountNumericValue(account);
    }, 0);
    const totalBalanceParts = splitCurrency(totalBalance);
    const latestSyncDate = getLatestSyncDate(accounts);
    const canTapSync = !isSyncing && !(isSyncDisabled && syncStatus.step === 'idle');
    const syncStatusLabel = syncStatus.step === 'done'
        ? 'Sincronizado agora'
        : syncStatus.step === 'error'
            ? 'Erro ao sincronizar'
            : isSyncing
                ? (syncStatus.message || 'Sincronizando...')
                : latestSyncDate
                    ? `Sincronizado ${formatRelativeSyncTime(latestSyncDate)}`
                    : 'Sincronizar agora';
    const syncIconColor = syncStatus.step === 'done'
        ? '#04D361'
        : syncStatus.step === 'error'
            ? '#EF4444'
            : canTapSync
                ? '#C9CDD3'
                : '#A6ABB3';
    const handleSync = async () => {
        if (isSyncing) return;

        console.log('[ConnectedBankCard] handleSync called');

        // Check if sync is available for THIS bank
        if (!canSyncThisBank) {
            const resetTime = databaseService.getTimeUntilReset();
            Alert.alert(
                'Sincronização Diária Usada',
                `Você já sincronizou este banco hoje. A sincronização estará disponível novamente após meia-noite.\n\nRenova em: ${resetTime.formatted}`,
                [{ text: 'Entendi' }]
            );
            return;
        }

        if (!hasCredits) {
            const resetTime = databaseService.getTimeUntilReset();
            Alert.alert(
                'Créditos Esgotados',
                `Você não tem mais créditos de sincronização hoje.\n\nSeus créditos serão renovados em ${resetTime.formatted}.`,
                [{ text: 'Entendi' }]
            );
            return;
        }

        const shouldConsumeCreditBeforeSync = false;
        if (shouldConsumeCreditBeforeSync && onConsumeCredit) {
            const creditResult: { success: boolean; error?: string } = { success: true };
            if (!creditResult.success) {
                Alert.alert('Erro', creditResult.error || 'Erro ao consumir crédito.');
                return;
            }

            // Schedule notification for when this bank is available again
            notificationService.scheduleBankAvailabilityNotification(group.connector?.name || 'Banco');
        }

        updateSyncStatus({ step: 'connecting', message: 'Iniciando...', progress: 0 });

        try {
            await onSync(group, updateSyncStatus);
            // Fallback: guarantee a final status when sync resolves without done/error.
            if (!['idle', 'done', 'error'].includes(syncStepRef.current)) {
                updateSyncStatus({
                    step: 'done',
                    message: 'Sincronizacao concluida com sucesso.',
                    progress: 100
                });
                setTimeout(() => {
                    updateSyncStatus({ step: 'idle', message: '', progress: 0 });
                }, 3000);
            }

            if (syncStepRef.current !== 'error' && onConsumeCredit) {
                const postSuccessCredit = await onConsumeCredit('sync', itemId);
                if (!postSuccessCredit.success) {
                    Alert.alert('Aviso', postSuccessCredit.error || 'Sincronizacao concluida, mas o credito nao foi atualizado.');
                } else {
                    notificationService.scheduleBankAvailabilityNotification(group.connector?.name || 'Banco');
                }
            }
        } catch {
            updateSyncStatus({ step: 'error', message: 'Erro na sincronização', progress: 0 });
            setTimeout(() => {
                updateSyncStatus({ step: 'idle', message: '', progress: 0 });
            }, 3000);
        }
    };

    const handleMenuSync = () => {
        setMenuVisible(false);
        handleSync();
    };

    const handleDisconnect = () => {
        setMenuVisible(false);
        onDelete(group);
    };

    const toggleExpand = () => {
        setMenuVisible(false);
        LayoutAnimation.configureNext({
            duration: 300,
            create: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
            update: {
                type: LayoutAnimation.Types.easeInEaseOut,
            },
            delete: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
        });
        setExpanded(!expanded);
    };

    return (
        <Reanimated.View
            style={[styles.connectedBankCard, cardAnimatedStyle]}
            onTouchStart={startCardMorph}
            onTouchEnd={endCardMorph}
            onTouchCancel={endCardMorph}
        >
            <View pointerEvents="none" style={styles.connectedBankBackdrop}>
                <BlurView
                    intensity={12}
                    tint="dark"
                    experimentalBlurMethod="dimezisBlurView"
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.connectedBankBackdropTint} />
            </View>

            <View style={styles.connectedBankContent}>
            <TouchableOpacity
                style={[styles.connectedBankHeader, isNarrowPhone && styles.connectedBankHeaderNarrow]}
                onPress={() => setMenuVisible(true)}
                activeOpacity={0.7}
                disabled={isSyncing}
            >
                <View style={[styles.bankHeaderLeft, isNarrowPhone && styles.bankHeaderLeftNarrow]}>
                    <BankConnectorLogo
                        connector={group.connector}
                        size={logoSize}
                        borderRadius={logoRadius}
                        iconSize={isNarrowPhone ? 14 : 16}
                        showBorder={false}
                        backgroundColor="#FFFFFF"
                        containerStyle={styles.connectorLogoContainer}
                    />
                    <View style={styles.headerInfo}>
                        <Text style={styles.connectorName} numberOfLines={1}>
                            {bankName}
                        </Text>
                        <Text style={styles.accountCount}>
                            {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
                        </Text>
                    </View>
                </View>

                <View style={styles.bankHeaderRight}>
                    <View style={styles.headerBalance}>
                        <Text style={styles.headerBalanceLabel}>Saldo em conta</Text>
                        <Text
                            style={[styles.headerBalanceAmount, isNarrowPhone && styles.headerBalanceAmountNarrow]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                        >
                            <Text style={styles.headerBalanceCurrency}>{totalBalanceParts.currency} </Text>
                            {totalBalanceParts.amount}
                        </Text>
                    </View>
                    <ChevronRight size={16} color="#68686D" strokeWidth={2} />
                </View>

                <BankActionsSheet
                    visible={menuVisible}
                    bankName={bankName}
                    syncDisabled={isSyncDisabled || isSyncing}
                    onVisibleChange={setMenuVisible}
                    onSync={handleMenuSync}
                    onDisconnect={handleDisconnect}
                />
            </TouchableOpacity>

            <View style={styles.cardDivider} />

            {expanded && (
                <>
                    <View style={styles.accountsGroup}>
                        {accounts.map((acc: any) => {
                            const accountTypeLabel = getAccountTypeLabel(acc);
                            const hasCustomName = acc.name && acc.name !== bankName;
                            const accountName = hasCustomName ? acc.name : accountTypeLabel;
                            const numericValue = getAccountNumericValue(acc);
                            const formattedValue = formatCurrency(numericValue);
                            const isMuted = hiddenIds.includes(acc.id) || Math.abs(numericValue) === 0;

                            return (
                                <View
                                    key={acc.id || `${accountName}-${formattedValue}`}
                                    style={[styles.accountRow, isNarrowPhone && styles.accountRowNarrow]}
                                >
                                    <View style={[styles.accountDot, isMuted && styles.accountDotMuted]} />
                                    <View style={[styles.accountTextGroup, isNarrowPhone && styles.accountTextGroupNarrow]}>
                                        <Text
                                            style={[
                                                styles.accountName,
                                                isNarrowPhone && styles.accountNameNarrow,
                                                isMuted && styles.accountTextMuted
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {accountName}
                                        </Text>
                                        <Text
                                            style={[styles.accountType, isNarrowPhone && styles.accountTypeNarrow]}
                                            numberOfLines={1}
                                        >
                                            {accountTypeLabel}
                                        </Text>
                                    </View>
                                    <Text
                                        style={[
                                            styles.accountValue,
                                            isNarrowPhone && styles.accountValueNarrow,
                                            isTinyPhone && styles.accountValueTiny,
                                            isMuted && styles.accountValueMuted
                                        ]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.78}
                                    >
                                        {formattedValue}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                    <View style={styles.cardDivider} />
                </>
            )}

            <View style={[styles.syncRow, isNarrowPhone && styles.syncRowNarrow]}>
                <View style={styles.syncStatusTouch}>
                    {syncStatus.step === 'done' ? (
                        <CheckCircle size={14} color={syncIconColor} strokeWidth={2} />
                    ) : syncStatus.step === 'error' ? (
                        <XCircle size={14} color={syncIconColor} strokeWidth={2} />
                    ) : !hasCredits ? (
                        <Lock size={13} color={syncIconColor} strokeWidth={2} />
                    ) : (
                        <RefreshCw size={14} color={syncIconColor} strokeWidth={2} />
                    )}
                    <Text style={styles.syncStatusText} numberOfLines={1}>
                        {syncStatusLabel}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={toggleExpand}
                    style={styles.hideButton}
                    activeOpacity={0.7}
                    disabled={isSyncing}
                >
                    <Text style={styles.hideButtonText} numberOfLines={1}>
                        {expanded ? 'Ocultar' : 'Exibir'}
                    </Text>
                </TouchableOpacity>
            </View>

            </View>

        </Reanimated.View>
    );
};

const styles = StyleSheet.create({
    connectedBankCard: {
        backgroundColor: '#101010',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#222222',
        marginBottom: 10,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
        elevation: 4,
    },
    connectedBankBackdrop: {
        ...StyleSheet.absoluteFill,
        zIndex: 0,
    },
    connectedBankBackdropTint: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(16, 16, 16, 0.92)',
    },
    connectedBankContent: {
        position: 'relative',
        zIndex: 1,
    },
    connectedBankHeader: {
        position: 'relative',
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        minHeight: 56,
    },
    connectedBankHeaderNarrow: {
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 10,
        minHeight: 50,
    },
    bankHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
    },
    bankHeaderLeftNarrow: {
        gap: 8,
    },
    headerInfo: {
        flex: 1,
        minWidth: 0,
    },
    accountCount: {
        fontSize: 11,
        color: '#A0A4AB',
        marginTop: 1,
        fontFamily: 'AROneSans_400Regular',
    },
    bankHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    connectorLogoContainer: {
        flexShrink: 0,
    },
    connectorName: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
        fontFamily: 'AROneSans_400Regular',
    },
    menuButton: {
        width: 28,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 3,
    },

    headerBalance: {
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    headerBalanceLabel: {
        color: '#9EA2AA',
        fontSize: 9,
        lineHeight: 11,
        fontFamily: 'AROneSans_400Regular',
        marginBottom: 1,
    },
    headerBalanceAmount: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'AROneSans_400Regular',
    },
    headerBalanceAmountNarrow: {
        fontSize: 13,
    },
    headerBalanceCurrency: {
        color: '#E6E8EC',
        fontSize: 10,
        fontWeight: '600',
        fontFamily: 'AROneSans_400Regular',
    },
    cardDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#242424',
        width: '100%',
    },
    connectedBankBody: {
        backgroundColor: '#111111',
        paddingTop: 0,
    },
    headerSeparator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        marginHorizontal: 0,
    },
    accountsGroup: {
        marginTop: 0,
        marginBottom: 0,
        paddingHorizontal: 0,
        paddingVertical: 8,
    },
    accountRowContainer: {
        position: 'relative',
    },
    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 32,
        paddingVertical: 6,
        paddingHorizontal: 16,
        backgroundColor: 'transparent',
    },
    accountRowNarrow: {
        minHeight: 30,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    accountDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#3899F3',
        marginRight: 11,
    },
    accountDotMuted: {
        backgroundColor: '#17324D',
    },
    accountTextGroup: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 12,
        gap: 8,
    },
    accountTextGroupNarrow: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        paddingRight: 8,
    },
    accountSeparator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        marginLeft: 0,
        marginRight: 0,
    },
    accountIconWrapper: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    creditIconBg: {
        backgroundColor: 'rgba(217, 119, 87, 0.12)',
    },
    debitIconBg: {
        backgroundColor: 'rgba(4, 211, 97, 0.12)',
    },
    accountMainInfo: {
        flex: 1,
        justifyContent: 'center',
        paddingRight: 8,
    },
    accountName: {
        fontSize: 12.5,
        color: '#FFFFFF',
        fontFamily: 'AROneSans_400Regular',
        maxWidth: '62%',
    },
    accountNameNarrow: {
        maxWidth: '100%',
        fontSize: 11.5,
    },
    accountTextMuted: {
        color: '#64676D',
    },
    accountType: {
        flexShrink: 1,
        fontSize: 10.5,
        color: '#62666E',
        fontFamily: 'AROneSans_400Regular',
    },
    accountTypeNarrow: {
        maxWidth: '100%',
        fontSize: 9.5,
    },
    accountNumber: {
        fontSize: 11,
        color: '#606060',
        fontFamily: 'AROneSans_400Regular',
    },
    accountBalanceInfo: {
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    accountValue: {
        fontSize: 11.5,
        color: '#FFFFFF',
        fontWeight: '700',
        fontFamily: 'AROneSans_400Regular',
        minWidth: 80,
        textAlign: 'right',
    },
    accountValueNarrow: {
        minWidth: 70,
        fontSize: 10.5,
    },
    accountValueTiny: {
        minWidth: 70,
    },
    accountValueMuted: {
        color: '#555961',
        fontWeight: '400',
    },
    accountLabel: {
        fontSize: 10,
        color: '#505050',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontFamily: 'AROneSans_400Regular',
    },
    accountSecondaryLabel: {
        fontSize: 9,
        color: '#606060',
        marginTop: 2,
        fontFamily: 'AROneSans_400Regular',
    },
    positiveValue: {
        color: '#04D361',
    },
    negativeValue: {
        color: '#FF4C4C',
    },
    visibilityButton: {
        marginLeft: 12,
        padding: 4,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    syncRow: {
        height: 36,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    syncRowNarrow: {
        paddingHorizontal: 12,
    },
    syncStatusTouch: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingRight: 12,
    },
    syncStatusText: {
        flex: 1,
        color: '#A4A8AF',
        fontSize: 10,
        lineHeight: 13,
        fontFamily: 'AROneSans_400Regular',
    },
    hideButton: {
        minWidth: 50,
        height: 28,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    hideButtonText: {
        color: '#E8845B',
        fontSize: 11,
        fontWeight: '700',
        fontFamily: 'AROneSans_400Regular',
    },
    syncButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 0,
        paddingHorizontal: 8,
        backgroundColor: 'transparent',
        borderRadius: 8,
        height: 32,
        minWidth: 32,
    },
    disconnectButton: {
        backgroundColor: 'transparent',
        marginRight: -4,
    },
    syncButtonSuccess: {
        backgroundColor: 'rgba(4, 211, 97, 0.1)',
    },
    syncButtonError: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    syncButtonDisabled: {
        opacity: 0.5,
    },
    syncButtonTimer: {
        backgroundColor: '#222',
    },
    syncButtonText: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 6,
    },
    timerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    syncContainer: {
        paddingTop: 16,
        paddingBottom: 8,
        paddingHorizontal: 16,
        position: 'relative'
    },
    syncLine: {
        position: 'absolute',
        left: 27,
        top: 38,
        bottom: 30,
        width: 2,
        backgroundColor: '#262626',
        borderRadius: 1,
        zIndex: 0
    },
    activeBall: {
        position: 'absolute',
        left: 24,
        top: 34,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#D97757',
        zIndex: 10,
        shadowColor: '#D97757',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        zIndex: 1
    },
    stepDotContainer: {
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
        zIndex: 2,
        backgroundColor: '#111111'
    },
    stepCompletedDot: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepPendingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#333',
    },
    stepTextActive: {
        color: '#E0E0E0',
        fontSize: 13.5,
        fontWeight: '500'
    },
    stepText: {
        fontSize: 13.5,
    },
    stepTextCompleted: {
        color: '#666',
        fontWeight: '400'
    },
    stepTextPending: {
        color: '#444',
        fontWeight: '400'
    },
    timerText: {
        fontSize: 12,
        color: '#FFFFFF',
        fontVariant: ['tabular-nums'],
    },
    flipTimerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timerDigit: {
        fontSize: 12,
        fontWeight: '600',
        color: '#888',
        fontVariant: ['tabular-nums'],
        width: 8,
        textAlign: 'center',
    },
    digitContainer: {
        overflow: 'hidden',
        height: 16,
        width: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    digitAbsolute: {
        position: 'absolute',
    },
    timerColon: {
        fontSize: 12,
        color: '#888',
        marginHorizontal: 1,
    },
    morphButton: {
        height: 32,
        borderRadius: 16,
        overflow: 'hidden',
        justifyContent: 'center',
        borderWidth: 1,
    },
    morphIconContainer: {
        width: 36,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    morphContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        paddingHorizontal: 8,
    },
    morphConfirmBtn: {
        flex: 1,
        justifyContent: 'center',
    },
    morphConfirmText: {
        color: '#EF4444',
        fontSize: 12,
        fontWeight: '600',
    },
    morphDivider: {
        width: 1,
        height: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginHorizontal: 8,
    },
    morphCancelBtn: {
        padding: 4,
    },
    syncContainerHorizontal: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111',
        borderRadius: 8,
        marginHorizontal: 16,
        marginTop: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    labelWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    successLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(4, 211, 97, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    hLabelText: {
        fontSize: 12,
        color: '#E0E0E0',
        fontWeight: '500',
        letterSpacing: 0.3,
    },
    deleteButtonHeader: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerActionDisabled: {
        opacity: 0.45,
    },
    chevronContainer: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    syncStatusHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: 8,
    }
});

