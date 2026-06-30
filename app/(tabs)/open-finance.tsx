import { ConnectAccountModal } from '@/components/ConnectAccountModal';
import { CreateAccountChoiceModal } from '@/components/CreateAccountChoiceModal';
import { ManualBankAccountModal, type ManualBankAccountInput } from '@/components/ManualBankAccountModal';
import { ManualSubAccountModal, type ManualSubAccountInput } from '@/components/ManualSubAccountModal';
import { UniversalBackground } from '@/components/UniversalBackground';
import { BankConnectorLogo } from '@/components/open-finance/BankConnectorLogo';
import { ConnectedBankCard, BankSyncStatus as SyncStatus } from '@/components/open-finance/ConnectedBankCard';
import { SyncCreditsDisplay, useSyncCredits } from '@/components/open-finance/SyncCreditsDisplay';
import { AnimatedInlineBanner } from '@/components/ui/AnimatedInlineBanner';
import { IosCoreLoader } from '@/components/ui/IosCoreLoader';
import { ModalPadrao } from '@/components/ui/ModalPadrao';
import { useAuthContext as useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { API_BASE_URL_CANDIDATES } from '@/services/apiBaseUrl';
import { databaseService } from '@/services/firebase';
import { notificationService } from '@/services/notifications';
import { openFinanceConnectionState } from '@/services/openFinanceConnectionState';
import { queryCache } from '@/services/queryCache';
import { getConnectorLogoUrl, normalizeHexColor } from '@/utils/connectorLogo';
import { useIsFocused } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { ChevronRight, Landmark, Lock, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    AppState,
    FlatList,
    Image,
    InteractionManager,
    Keyboard,
    LayoutAnimation,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    useWindowDimensions,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
    Easing,
    Extrapolation,
    FadeIn,
    FadeInDown,
    FadeOut,
    FadeOutUp,
    interpolate,
    LinearTransition,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
    cancelAnimation,
} from 'react-native-reanimated';

if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

const AnimatedTouchableOpacity = Reanimated.createAnimatedComponent(TouchableOpacity);

const SPRING_ENTRY = {
    damping: 16,
    stiffness: 195,
    mass: 1.05,
    overshootClamping: false,
    restDisplacementThreshold: 0.001,
    restSpeedThreshold: 0.001,
} as const;

const SPRING_STRETCH = {
    damping: 12,
    stiffness: 165,
    mass: 1.1,
    overshootClamping: false,
    restDisplacementThreshold: 0.001,
    restSpeedThreshold: 0.001,
} as const;

const SPRING_RECOIL = {
    damping: 16,
    stiffness: 150,
    mass: 1.05,
    overshootClamping: false,
    restDisplacementThreshold: 0.001,
    restSpeedThreshold: 0.001,
} as const;

const SPRING_SETTLE = {
    damping: 22,
    stiffness: 160,
    mass: 1,
    overshootClamping: false,
    restDisplacementThreshold: 0.001,
    restSpeedThreshold: 0.001,
} as const;

const PRESS_SPRING = {
    damping: 16,
    stiffness: 360,
    mass: 0.5,
    overshootClamping: false,
} as const;

const BANK_CARD_IOS_LAYOUT = LinearTransition
    .springify()
    .damping(15)
    .stiffness(185)
    .mass(1.08);

const BANK_CARD_ENTER = FadeInDown
    .springify()
    .damping(16)
    .stiffness(195)
    .mass(1.05);

const BANK_CARD_EXIT = FadeOutUp.duration(160);

const RAILWAY_FALLBACK_API_URL = 'https://backendcontrolarapp-production.up.railway.app';
const BACKEND_WEBHOOK_URL = `${RAILWAY_FALLBACK_API_URL}/api/pluggy/webhook`;

const API_BASE_URL_FALLBACKS = Array.from(new Set([
    ...API_BASE_URL_CANDIDATES,
    RAILWAY_FALLBACK_API_URL
]));

const API_HEALTH_CHECK_TIMEOUT_MS = 3500;
const API_HEALTH_CACHE_TTL_MS = 120000;
const API_DEFAULT_TIMEOUT_MS = 60000;
const CONNECTORS_TIMEOUT_MS = 40000;
const OAUTH_POLL_MAX_DURATION_MS = 10 * 60 * 1000;
const OAUTH_POLL_INITIAL_DELAY_MS = 3000;
const OAUTH_POLL_MAX_DELAY_MS = 12000;
const SYNC_REQUEST_TIMEOUT_MS = 240000;
const MANUAL_REFRESH_MAX_DURATION_MS = 5 * 60 * 1000;
const CPF_MODAL_IOS_PRESENT_DELAY_MS = 90;
const CPF_MODAL_IOS_DISMISS_FALLBACK_MS = 900;
const CONNECTORS_CACHE_TTL_MS = 10 * 60 * 1000;
const CONNECTORS_CACHE_TTL_MINUTES = CONNECTORS_CACHE_TTL_MS / (60 * 1000);
const BANK_CONNECTORS_CACHE_KEY = 'open_finance_bank_connectors_v1';
const BANK_HEALTH_CACHE_TTL_MS = 2 * 60 * 1000;
const BANK_ROW_HEIGHT = 63;
const BANK_ROW_ANIMATION_DELAY_MS = 18;
const BANK_ROW_ANIMATION_MAX_DELAY_MS = 144;

let cachedBankConnectors: any[] = [];
let cachedBankConnectorsAt = 0;
let bankConnectorsRequest: Promise<any[]> | null = null;
let cachedUnhealthyBankIds: Set<string> | null = null;
let cachedUnhealthyBankIdsAt = 0;
let bankHealthRequest: Promise<Set<string>> | null = null;

const rememberBankConnectors = (bankConnectors: any[]) => {
    cachedBankConnectors = bankConnectors;
    cachedBankConnectorsAt = Date.now();
};

const normalizeConnectorSearchKey = (value: any) => {
    const text = String(value || '');
    const normalizedText = typeof text.normalize === 'function' ? text.normalize('NFD') : text;

    return normalizedText
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
};

const getConnectorDedupeKey = (connector: any) => {
    const name = normalizeConnectorSearchKey(connector?.name);
    const type = normalizeConnectorSearchKey(connector?.type);

    if (name) return `${type || 'bank'}:${name}`;
    if (connector?.id) return `id:${String(connector.id)}`;

    return null;
};

const getConnectorQualityScore = (connector: any) => {
    let score = 0;

    if (connector?.id) score += 4;
    if (connector?.imageUrl) score += 3;
    if (connector?.primaryColor) score += 1;
    if (Array.isArray(connector?.credentials)) score += connector.credentials.length;

    return score;
};

const deduplicateBankConnectors = (items: any[]) => {
    const result: any[] = [];
    const keyToIndex = new Map<string, number>();

    items.forEach((connector) => {
        const keys = [
            connector?.id ? `id:${String(connector.id)}` : null,
            getConnectorDedupeKey(connector),
        ].filter(Boolean) as string[];

        const existingIndex = keys
            .map((key) => keyToIndex.get(key))
            .find((index) => index !== undefined);

        if (existingIndex === undefined) {
            const nextIndex = result.length;
            result.push(connector);
            keys.forEach((key) => keyToIndex.set(key, nextIndex));
            return;
        }

        const current = result[existingIndex];
        if (getConnectorQualityScore(connector) > getConnectorQualityScore(current)) {
            result[existingIndex] = connector;
        }

        keys.forEach((key) => keyToIndex.set(key, existingIndex));
    });

    return result;
};

const normalizeBankConnectorsPayload = (data: any): any[] => {
    const results = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];

    const bankConnectors = results
        .filter((c: any) => c?.type === 'PERSONAL_BANK' || c?.type === 'BUSINESS_BANK')
        .map((c: any) => ({
            ...c,
            imageUrl: getConnectorLogoUrl(c) || '',
            primaryColor: normalizeHexColor(c.primaryColor, '#30302E'),
            credentials: Array.isArray(c.credentials) ? c.credentials : []
        }));

    return deduplicateBankConnectors(bankConnectors);
};

const triggerBankCardMorph = () => {
    LayoutAnimation.configureNext({
        duration: 430,
        create: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
        },
        update: {
            type: LayoutAnimation.Types.spring,
            springDamping: 0.74,
        },
        delete: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
        },
    });
};

const useElasticEntrance = (delay = 0, translateStart = 18) => {
    const visibility = useSharedValue(0);
    const squash = useSharedValue(1);

    useEffect(() => {
        squash.value = 0.84;

        visibility.value = withDelay(
            delay,
            withSpring(1, SPRING_ENTRY)
        );

        squash.value = withDelay(
            delay,
            withSequence(
                withSpring(1.085, SPRING_STRETCH),
                withSpring(0.976, SPRING_RECOIL),
                withSpring(1, SPRING_SETTLE)
            )
        );
    }, [delay, squash, visibility]);

    return useAnimatedStyle(() => {
        const stretchX = interpolate(
            squash.value,
            [0.84, 0.976, 1, 1.085],
            [0.92, 0.99, 1, 1.04],
            Extrapolation.CLAMP
        );

        const stretchY = interpolate(
            squash.value,
            [0.84, 0.976, 1, 1.085],
            [1.08, 1.018, 1, 0.976],
            Extrapolation.CLAMP
        );

        const baseScaleX = interpolate(
            visibility.value,
            [0, 0.34, 0.68, 1],
            [0.18, 1.028, 0.992, 1],
            Extrapolation.CLAMP
        );

        const baseScaleY = interpolate(
            visibility.value,
            [0, 0.42, 0.78, 1],
            [0.18, 0.94, 1.012, 1],
            Extrapolation.CLAMP
        );

        const translateY = interpolate(
            visibility.value,
            [0, 0.5, 0.82, 1],
            [translateStart, -3, 1, 0],
            Extrapolation.CLAMP
        );

        return {
            opacity: interpolate(
                visibility.value,
                [0, 0.22, 1],
                [0, 0.86, 1],
                Extrapolation.CLAMP
            ),
            transform: [
                { translateY },
                { scaleX: baseScaleX * stretchX },
                { scaleY: baseScaleY * stretchY },
            ],
        };
    });
};

const isNetworkTransportError = (error: unknown): boolean => {
    if (error instanceof TypeError) return true;
    const msg = error instanceof Error ? error.message : String(error ?? '');
    return /timeout|network request failed|abort/i.test(msg);
};

const getApiConnectionErrorMessage = (errorMsg?: string): string =>
    `Erro de rede: ${errorMsg || 'Falha na conexão'}. Verifique sua internet e tente novamente.`;

const toNonEmptyString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const extractPluggyItemError = (item: any) => {
    const directError = item?.error && typeof item.error === 'object' ? item.error : {};
    const statusDetail = item?.statusDetail && typeof item.statusDetail === 'object' ? item.statusDetail : {};
    const statusDetailError = statusDetail?.error && typeof statusDetail.error === 'object' ? statusDetail.error : {};

    const code = toNonEmptyString(
        directError.code ||
        statusDetailError.code ||
        item?.errorCode ||
        item?.code
    );

    const message = toNonEmptyString(
        directError.message ||
        statusDetailError.message ||
        item?.message
    );

    const providerMessage = toNonEmptyString(
        directError.providerMessage ||
        statusDetailError.providerMessage
    );

    return { code, message, providerMessage };
};

const buildPluggyConnectionErrorMessage = (item: any): string => {
    const status = String(item?.status || '').toUpperCase();
    const executionStatus = String(item?.executionStatus || '').toUpperCase();
    const { code, message, providerMessage } = extractPluggyItemError(item);
    const normalizedCode = String(code || executionStatus || status).toUpperCase();

    if (normalizedCode.includes('INVALID_CREDENTIALS') || status === 'LOGIN_ERROR') {
        return 'Credenciais inválidas. Confira usuário e senha do banco e tente novamente.';
    }

    if (
        normalizedCode.includes('SITE_NOT_AVAILABLE') ||
        normalizedCode.includes('INSTITUTION_UNAVAILABLE')
    ) {
        return 'O banco está temporariamente indisponível. Tente novamente em alguns minutos.';
    }

    if (
        normalizedCode.includes('MFA') ||
        normalizedCode.includes('OTP') ||
        normalizedCode.includes('2FA')
    ) {
        return 'O banco pediu validação adicional. Finalize no app do banco e tente novamente.';
    }

    if (status === 'OUTDATED') {
        return 'A conexão expirou ou o banco recusou a atualização. Tente reconectar.';
    }

    const bestDetail = providerMessage || message;
    if (bestDetail) return `O banco retornou erro: ${bestDetail}`;

    return status === 'LOGIN_ERROR' ? 'Acesso negado pelo banco.' : 'Erro ao conectar no banco.';
};

const getItemOAuthUrl = (payload: any): string | null => {
    const candidates = [
        payload?.oauthUrl,
        payload?.clientUrl,
        payload?.parameter?.oauthUrl,
        payload?.parameter?.data,
        payload?.userAction?.url,
        payload?.userAction?.attributes?.url,
        payload?.item?.oauthUrl,
        payload?.item?.clientUrl,
        payload?.item?.parameter?.oauthUrl,
        payload?.item?.parameter?.data,
        payload?.item?.userAction?.url,
        payload?.item?.userAction?.attributes?.url
    ];

    for (const candidate of candidates) {
        const normalized = toNonEmptyString(candidate);
        if (normalized) return normalized;
    }

    return null;
};

const fetchWithTimeout = async (
    resource: string,
    options: RequestInit & { timeout?: number } = {}
) => {
    const { timeout = API_DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(resource, {
            ...fetchOptions,
            signal: controller.signal as any
        });

        clearTimeout(id);
        return response;
    } catch (error: any) {
        clearTimeout(id);
        if (error.name === 'AbortError') throw new TypeError('Network request timed out');
        throw error;
    }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getPollingDelay = (attempt: number) => (
    Math.min(OAUTH_POLL_INITIAL_DELAY_MS + attempt * 750, OAUTH_POLL_MAX_DELAY_MS)
);

const readApiPayload = async (response: Response): Promise<any | null> => {
    try {
        return await response.json();
    } catch {
        return null;
    }
};

const isRetryableApiResponse = (response: Response, payload?: any | null): boolean => {
    if (payload?.retryable === true) return true;
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
};

const getApiErrorText = (payload: any | null, fallback: string): string => (
    toNonEmptyString(payload?.error) ||
    toNonEmptyString(payload?.message) ||
    fallback
);

type PersistStepResult = {
    success?: boolean;
    error?: string;
    [key: string]: any;
};

const PERSIST_RETRY_ATTEMPTS = 3;
const PERSIST_RETRY_BASE_DELAY_MS = 450;

const isRetryablePersistError = (error: any): boolean => {
    const normalized = String(error?.message || error || '').toLowerCase();

    return [
        'aborted',
        'deadline-exceeded',
        'internal',
        'network',
        'resource-exhausted',
        'timeout',
        'timed out',
        'unavailable'
    ].some((token) => normalized.includes(token));
};

const runPersistStepWithRetry = async (
    operation: () => Promise<PersistStepResult>
): Promise<PersistStepResult> => {
    let lastResult: PersistStepResult = { success: false, error: 'Falha ao salvar dados.' };

    for (let attempt = 1; attempt <= PERSIST_RETRY_ATTEMPTS; attempt += 1) {
        try {
            lastResult = await operation();
        } catch (error: any) {
            lastResult = {
                success: false,
                error: error?.message || 'Falha ao salvar dados.'
            };
        }

        if (lastResult?.success !== false) {
            return lastResult;
        }

        if (!isRetryablePersistError(lastResult.error) || attempt >= PERSIST_RETRY_ATTEMPTS) {
            return lastResult;
        }

        await sleep(PERSIST_RETRY_BASE_DELAY_MS * attempt + Math.random() * 250);
    }

    return lastResult;
};

const OAUTH_CALLBACK_PATH = 'open-finance/callback';
const OAUTH_REDIRECT_URI = Platform.OS === 'web'
    ? Linking.createURL(OAUTH_CALLBACK_PATH)
    : `controlarapp:///${OAUTH_CALLBACK_PATH}`;

export default function OpenFinanceScreen() {
    const { user, profile, refreshProfile } = useAuth();
    const { showError, showWarning } = useToast();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const isNarrowPhone = width < 360;
    const isShortPhone = height < 700;
    const horizontalPadding = isNarrowPhone ? 12 : 16;

    const headerAnimatedStyle = useElasticEntrance(0, 18);
    const contentAnimatedStyle = useElasticEntrance(80, 16);

    const [isModalVisible, setIsModalVisible] = useState(false);
    const [showCreateChoiceModal, setShowCreateChoiceModal] = useState(false);
    const [subAccountModalConfig, setSubAccountModalConfig] = useState<{
        visible: boolean;
        mode: 'CREDIT_CARD' | 'SAVINGS' | null;
        connector: any;
    }>({ visible: false, mode: null, connector: null });
    const [editSubAccountConfig, setEditSubAccountConfig] = useState<{
        visible: boolean;
        account: any | null;
    }>({ visible: false, account: null });
    const [showManualBankAccountModal, setShowManualBankAccountModal] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<any>(null);
    const [deleteInProgress, setDeleteInProgress] = useState(false);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [dataRefreshKey, setDataRefreshKey] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const {
        credits,
        refresh: refreshCredits,
        consumeCredit,
        hasCredits,
        canSyncItem
    } = useSyncCredits(user?.uid);

    const [connectionStep, setConnectionStep] = useState<'info' | 'banks' | 'credentials' | 'connecting' | 'oauth_pending' | 'success' | 'error'>('info');
    const [connectors, setConnectors] = useState<any[]>([]);
    const [loadingConnectors, setLoadingConnectors] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [connectorsFetchError, setConnectorsFetchError] = useState<string | null>(null);

    // Health warnings for banks that are currently having issues (from Pluggy)
    const [unhealthyBankIds, setUnhealthyBankIds] = useState<Set<string>>(new Set());
    const [bankHealthLoading, setBankHealthLoading] = useState(false);
    const [selectedConnector, setSelectedConnector] = useState<any>(null);
    const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
    const [useCNPJ, setUseCNPJ] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [connectionProgress, setConnectionProgress] = useState(0);
    const [connectionStatusText, setConnectionStatusText] = useState('');

    const [bankSyncBanner, setBankSyncBanner] = useState<{
        step: 'idle' | 'connecting' | 'success' | 'error';
        statusText: string;
        error: string | null;
    }>({
        step: 'idle',
        statusText: '',
        error: null
    });

    const [pendingItemId, setPendingItemId] = useState<string | null>(null);

    const [showCpfModal, setShowCpfModal] = useState(false);
    const [cpfInput, setCpfInput] = useState('');
    const [cpfConnector, setCpfConnector] = useState<any>(null);
    const [cpfModalStep, setCpfModalStep] = useState<'cpf' | 'confirm'>('cpf');

    const [confirmLogoScale] = useState(() => new Animated.Value(0));
    const [confirmLogoOpacity] = useState(() => new Animated.Value(0));
    const [confirmFlowProgress] = useState(() => new Animated.Value(0));
    const confirmFlowLoopRef = useRef<Animated.CompositeAnimation | null>(null);

    const lastApiHealthCheckRef = useRef(0);
    const apiHealthRequestRef = useRef<Promise<string> | null>(null);
    const [apiBaseUrl, setApiBaseUrl] = useState(API_BASE_URL_FALLBACKS[0] || RAILWAY_FALLBACK_API_URL);
    const pendingItemIdRef = useRef<string | null>(null);
    const openedOAuthUrlRef = useRef(false);
    const isRestoringPendingRef = useRef(false);
    const bankSyncBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const legacyPollingDisabledRef = useRef(true);
    const activePollingItemIdRef = useRef<string | null>(null);
    const pendingItemSyncInFlightRef = useRef(false);
    const activeManualSyncsRef = useRef<Set<string>>(new Set());
    const pendingCpfAfterBankDismissRef = useRef(false);
    const cpfModalOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastOAuthCallbackRef = useRef<{ url: string; receivedAt: number } | null>(null);
    const handleOAuthCallbackRef = useRef<((url: string) => Promise<void>) | null>(null);
    const fetchAccountsRef = useRef<() => Promise<void>>(async () => undefined);
    const connectorsRef = useRef<any[]>([]);
    const isOpenFinanceMountedRef = useRef(false);

    useEffect(() => {
        isOpenFinanceMountedRef.current = true;

        return () => {
            isOpenFinanceMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        pendingItemIdRef.current = pendingItemId;
    }, [pendingItemId]);

    useEffect(() => {
        connectorsRef.current = connectors;
    }, [connectors]);

    useEffect(() => {
        const unsubscribe = queryCache.subscribe<any[]>(BANK_CONNECTORS_CACHE_KEY, (nextConnectors) => {
            if (!isOpenFinanceMountedRef.current) return;

            const bankConnectors = normalizeBankConnectorsPayload(nextConnectors);
            if (bankConnectors.length === 0) return;

            rememberBankConnectors(bankConnectors);
            setConnectors(bankConnectors);
            setConnectorsFetchError(null);
            setLoadingConnectors(false);
        });

        return unsubscribe;
    }, []);

    const clearBankSyncBannerTimer = useCallback(() => {
        if (bankSyncBannerTimerRef.current) {
            clearTimeout(bankSyncBannerTimerRef.current);
            bankSyncBannerTimerRef.current = null;
        }
    }, []);

    useEffect(() => clearBankSyncBannerTimer, [clearBankSyncBannerTimer]);

    const clearCpfModalOpenTimer = useCallback(() => {
        if (cpfModalOpenTimerRef.current) {
            clearTimeout(cpfModalOpenTimerRef.current);
            cpfModalOpenTimerRef.current = null;
        }
    }, []);

    useEffect(() => clearCpfModalOpenTimer, [clearCpfModalOpenTimer]);

    const showPendingCpfModal = useCallback(() => {
        if (!pendingCpfAfterBankDismissRef.current) return;

        pendingCpfAfterBankDismissRef.current = false;
        clearCpfModalOpenTimer();
        setTimeout(() => {
            setShowCpfModal(true);
        }, 0);
    }, [clearCpfModalOpenTimer]);

    const schedulePendingCpfModal = useCallback((delayMs = 0) => {
        if (!pendingCpfAfterBankDismissRef.current) return;

        clearCpfModalOpenTimer();

        cpfModalOpenTimerRef.current = setTimeout(
            showPendingCpfModal,
            delayMs
        );
    }, [clearCpfModalOpenTimer, showPendingCpfModal]);

    const handleConnectAccountModalDismiss = useCallback(() => {
        if (Platform.OS === 'ios') {
            schedulePendingCpfModal(CPF_MODAL_IOS_PRESENT_DELAY_MS);
        }
    }, [schedulePendingCpfModal]);

    const handleCloseCpfModal = useCallback(() => {
        pendingCpfAfterBankDismissRef.current = false;
        clearCpfModalOpenTimer();
        setShowCpfModal(false);
    }, [clearCpfModalOpenTimer]);

    const hideBankSyncBanner = useCallback(() => {
        setBankSyncBanner({
            step: 'idle',
            statusText: '',
            error: null
        });
    }, []);

    const handleBankSyncStatusChange = useCallback((group: any, status: SyncStatus) => {
        clearBankSyncBannerTimer();

        if (status.step === 'idle') {
            hideBankSyncBanner();
            return;
        }

        if (status.step === 'done') {
            setBankSyncBanner({
                step: 'success',
                statusText: status.message || 'Sincronizado!',
                error: null
            });

            bankSyncBannerTimerRef.current = setTimeout(hideBankSyncBanner, 3000);
            return;
        }

        if (status.step === 'error') {
            setBankSyncBanner({
                step: 'error',
                statusText: '',
                error: status.message || 'Erro na sincronização'
            });

            bankSyncBannerTimerRef.current = setTimeout(hideBankSyncBanner, 4000);
            return;
        }

        setBankSyncBanner({
            step: 'connecting',
            statusText: status.message || `Sincronizando ${group.connector?.name || 'banco'}...`,
            error: null
        });
    }, [clearBankSyncBannerTimer, hideBankSyncBanner]);

    const clearPersistedOpenFinanceState = useCallback(async () => {
        await Promise.all([
            openFinanceConnectionState.clearPendingConnection(),
            openFinanceConnectionState.clearCallbackPayload(),
            openFinanceConnectionState.clearBackgroundSync()
        ]);
    }, []);

    const savePendingConnectionState = useCallback(async (
        itemId: string,
        connector?: any,
        syncPhase?: string
    ) => {
        const connectorSnapshot = connector
            ? {
                id: connector.id,
                name: connector.name ?? null,
                primaryColor: connector.primaryColor ?? null,
                imageUrl: connector.imageUrl ?? null,
                type: connector.type ?? null
            }
            : null;

        await openFinanceConnectionState.savePendingConnection({
            itemId,
            startedAt: Date.now(),
            connector: connectorSnapshot,
            userId: user?.uid ?? null,
            syncPhase: (syncPhase as any) ?? 'polling'
        });

        if (user?.uid) {
            await openFinanceConnectionState.saveBackgroundSync({
                active: true,
                itemId,
                userId: user.uid,
                connectorName: connector?.name ?? null,
                syncPhase: (syncPhase as any) ?? 'polling',
                startedAt: Date.now(),
                lastUpdatedAt: Date.now()
            });
        }
    }, [user]);

    const openOAuthUrlSafely = useCallback(async (url: string) => {
        if (!url) throw new Error('URL OAuth não fornecida.');

        const canOpen = await Linking.canOpenURL(url);
        const isWebUrl = /^https?:\/\//i.test(url);

        if (!canOpen && !isWebUrl) {
            throw new Error('Não foi possível abrir o link de autorização do banco.');
        }

        if (!isWebUrl) {
            await Linking.openURL(url);
            return;
        }

        if (Platform.OS !== 'ios') {
            await WebBrowser.openBrowserAsync(url);
            return;
        }

        let authResult: Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;

        try {
            authResult = await WebBrowser.openAuthSessionAsync(
                url,
                OAUTH_REDIRECT_URI,
                { preferEphemeralSession: false }
            );
        } catch (error: any) {
            const code = String(error?.code || '').toUpperCase();
            const message = String(error?.message || '');
            const wasDismissed = code.includes('CANCEL') ||
                code.includes('DISMISS') ||
                /cancel|dismiss/i.test(message);

            if (wasDismissed) {
                console.info('[OpenFinance] OAuth session was dismissed on iOS; keeping pending item active.');
                return;
            }

            throw error;
        }

        if (authResult.type === 'success') {
            await handleOAuthCallbackRef.current?.(authResult.url);
            return;
        }

        if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
            console.info(`[OpenFinance] OAuth session ended as ${authResult.type}; keeping pending item active.`);
            return;
        }

        throw new Error('Autorizacao nao concluida pelo banco.');
    }, []);

    const extractItemIdFromDeepLink = useCallback((url: string): string | null => {
        try {
            const { queryParams } = Linking.parse(url);
            const rawItemId = queryParams?.itemId;

            if (typeof rawItemId === 'string' && rawItemId.trim()) return rawItemId.trim();
            if (Array.isArray(rawItemId) && rawItemId[0]?.trim()) return rawItemId[0].trim();
        } catch { }

        return null;
    }, []);

    const restorePendingConnectionIfNeeded = useCallback(async () => {
        if (!user || isRestoringPendingRef.current) return;

        isRestoringPendingRef.current = true;

        try {
            const [pendingState, callbackPayload, bgSync] = await Promise.all([
                openFinanceConnectionState.getPendingConnection(),
                openFinanceConnectionState.consumeCallbackPayload(),
                openFinanceConnectionState.getBackgroundSync(),
            ]);

            const callbackItemId = callbackPayload?.itemId?.trim() || null;
            const restoredItemId = callbackItemId || pendingState?.itemId || bgSync?.itemId || pendingItemIdRef.current;
            const callbackError = callbackPayload?.error || null;

            if (callbackError) {
                setIsModalVisible(false);
                setConnectionError('O banco recusou a conexão ou ocorreu um erro.');
                setConnectionStep('error');
                setPendingItemId(null);

                await clearPersistedOpenFinanceState();

                notificationService.sendSyncCompleteNotification(
                    pendingState?.connector?.name || 'Banco',
                    false,
                    'O banco recusou a conexão.'
                ).catch(() => null);

                setTimeout(() => setConnectionStep('info'), 5000);
                return;
            }

            if (!restoredItemId) return;

            if (
                pendingItemIdRef.current === restoredItemId &&
                ['connecting', 'oauth_pending'].includes(connectionStep)
            ) {
                return;
            }

            if (!selectedConnector && (pendingState?.connector || bgSync)) {
                setSelectedConnector(pendingState?.connector || bgSync);
            }

            setPendingItemId(restoredItemId);
            setIsModalVisible(false);

            const savedPhase = pendingState?.syncPhase || bgSync?.syncPhase || 'polling';

            if (savedPhase === 'syncing' || savedPhase === 'saving') {
                setConnectionStep('connecting');
                setConnectionProgress(55);
                setConnectionStatusText('Retomando sincronização...');
            } else {
                setConnectionStep('oauth_pending');
                setConnectionProgress(40);
                setConnectionStatusText('Retomando conexão com o banco...');
            }
        } finally {
            isRestoringPendingRef.current = false;
        }
    }, [
        clearPersistedOpenFinanceState,
        connectionStep,
        selectedConnector,
        user
    ]);

    const resolveReachableApiBaseUrl = useCallback(async (): Promise<string> => {
        const now = Date.now();

        if ((now - lastApiHealthCheckRef.current) < API_HEALTH_CACHE_TTL_MS) {
            return apiBaseUrl;
        }

        if (apiHealthRequestRef.current) {
            return apiHealthRequestRef.current;
        }

        const request = (async () => {
            const candidates = [
                apiBaseUrl,
                ...API_BASE_URL_FALLBACKS.filter((url) => url !== apiBaseUrl)
            ];
            const bestEffortFallback =
                candidates.find((url) => url === RAILWAY_FALLBACK_API_URL) ||
                candidates[candidates.length - 1] ||
                apiBaseUrl;

            for (const candidate of candidates) {
                try {
                    const response = await fetchWithTimeout(`${candidate}/health`, {
                        method: 'GET',
                        timeout: API_HEALTH_CHECK_TIMEOUT_MS
                    });

                    if (response.ok) {
                        lastApiHealthCheckRef.current = Date.now();
                        if (isOpenFinanceMountedRef.current) {
                            setApiBaseUrl(candidate);
                        }
                        return candidate;
                    }
                } catch { }
            }

            lastApiHealthCheckRef.current = Date.now();
            if (isOpenFinanceMountedRef.current) {
                setApiBaseUrl(bestEffortFallback);
            }
            return bestEffortFallback;
        })();

        apiHealthRequestRef.current = request;

        try {
            return await request;
        } finally {
            if (apiHealthRequestRef.current === request) {
                apiHealthRequestRef.current = null;
            }
        }
    }, [apiBaseUrl]);

    const apiFetch = useCallback(async (
        path: string,
        options: RequestInit & { timeout?: number } = {}
    ) => {
        const resolved = await resolveReachableApiBaseUrl();

        return fetchWithTimeout(`${resolved}${path}`, {
            ...options,
            timeout: options.timeout ?? API_DEFAULT_TIMEOUT_MS
        });
    }, [resolveReachableApiBaseUrl]);

    const persistPluggySyncData = useCallback(async (
        syncData: any,
        connector: any,
        setStatusText?: (text: string) => void
    ) => {
        if (!user?.uid) throw new Error('Usuario nao autenticado.');

        const syncedAccounts = Array.isArray(syncData?.accounts) ? syncData.accounts : [];
        const totalTx = syncedAccounts.reduce(
            (acc: number, account: any) => acc + (Array.isArray(account?.transactions) ? account.transactions.length : 0),
            0
        );

        const serverAccountErrors: any[] = Array.isArray(syncData?.accountErrors) ? [...syncData.accountErrors] : [];
        const accountWarnings: any[] = Array.isArray(syncData?.accountWarnings) ? [...syncData.accountWarnings] : [];
        const localPersistErrors: any[] = [];
        let savedAccountsCount = 0;

        if (syncedAccounts.length === 0) {
            throw new Error(
                serverAccountErrors[0]?.error ||
                'Banco autorizado, mas nenhuma conta foi retornada. Credito nao consumido.'
            );
        }

        if (syncedAccounts.length > 0) {
            setStatusText?.(`Organizando ${syncedAccounts.length} contas...`);

            const accountResults = await Promise.all(
                syncedAccounts.map((account: any) =>
                    runPersistStepWithRetry(() =>
                        databaseService.saveAccount(user.uid, account, connector)
                    )
                )
            );

            accountResults.forEach((result: any, index: number) => {
                if (!result?.success) {
                    localPersistErrors.push({
                        stage: 'local_account_save',
                        accountId: syncedAccounts[index]?.id || null,
                        accountName: syncedAccounts[index]?.name || null,
                        error: result?.error || 'Falha ao salvar conta no app.',
                        retryable: true,
                    });
                }
            });

            savedAccountsCount = accountResults.filter((result: any) => result?.success).length;

            if (savedAccountsCount === 0) {
                throw new Error('Nao foi possivel salvar as contas no banco de dados. Credito nao consumido.');
            }

            setStatusText?.(`Salvando ${totalTx} transacoes...`);

            const transactionResult = await databaseService.saveOpenFinanceTransactions(
                user.uid,
                syncedAccounts,
                connector
            );

            if (!transactionResult?.success) {
                throw new Error(transactionResult?.error || 'Falha ao salvar transacoes no app.');
            }

            const transactionErrorCount = Number(transactionResult?.errorCount || 0);
            const transactionErrors = transactionResult?.details?.errors || [];

            if (transactionErrorCount > 0 || transactionErrors.length > 0) {
                localPersistErrors.push({
                    stage: 'local_transaction_save',
                    error: 'Algumas transacoes nao foram salvas.',
                    retryable: true,
                    details: transactionErrors,
                });
            }
        }

        return {
            totalTx,
            savedAccountsCount,
            partial: syncData?.partial === true || serverAccountErrors.length > 0 || localPersistErrors.length > 0,
            accountErrors: [...serverAccountErrors, ...localPersistErrors],
            accountWarnings,
        };
    }, [user]);

    useEffect(() => {
        notificationService.scheduleDailySyncResetNotification();
    }, []);

    useEffect(() => {
        if (user) {
            let cancelled = false;
            let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
            const timer = setTimeout(() => {
                task = InteractionManager.runAfterInteractions(() => {
                    if (!cancelled) {
                        void fetchAccountsRef.current();
                    }
                });
            }, 180);

            return () => {
                cancelled = true;
                clearTimeout(timer);
                task?.cancel?.();
            };
        }
    }, [user]);

    useEffect(() => {
        if (!user) return;
        restorePendingConnectionIfNeeded();
    }, [restorePendingConnectionIfNeeded, user]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                restorePendingConnectionIfNeeded();
            }
        });

        return () => subscription.remove();
    }, [restorePendingConnectionIfNeeded]);

    const handleToggleVisibility = useCallback(async (accountId: string) => {
        if (!user?.uid || !profile) {
            showError('Erro', 'Usuário não autenticado.');
            return;
        }

        try {
            const preferences = (profile.preferences as any) || {};

            let hiddenAccountIds: string[] = Array.isArray(preferences.hiddenAccountIds)
                ? [...preferences.hiddenAccountIds]
                : [];

            const currentlyHidden = hiddenAccountIds.includes(accountId);

            if (currentlyHidden) {
                hiddenAccountIds = hiddenAccountIds.filter((id: string) => id !== accountId);
            } else if (!hiddenAccountIds.includes(accountId)) {
                hiddenAccountIds.push(accountId);
            }

            await databaseService.updatePreference(user.uid, { hiddenAccountIds });
            await refreshProfile();
            setDataRefreshKey((prev) => prev + 1);
        } catch (error) {
            console.error('handleToggleVisibility error:', error);
            showError('Erro', 'Não foi possível alterar a visibilidade da conta.');
        }
    }, [
        user,
        profile,
        refreshProfile,
        showError
    ]);

    const fetchAccounts = async () => {
        if (!user) return;

        try {
            const result = await databaseService.getAccounts(user.uid);

            if (result.success && result.data) {
                setAccounts(result.data);
                setDataRefreshKey((p) => p + 1);
            }
        } catch (e) {
            console.error('Error fetching accounts:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };
    fetchAccountsRef.current = fetchAccounts;

    const handleCreateManualBankAccount = useCallback(async (data: ManualBankAccountInput) => {
        if (!user?.uid) {
            throw new Error('Usuário não autenticado.');
        }

        const result = await databaseService.createManualBankAccount(user.uid, data);
        if (!result?.success) {
            throw new Error(result?.error || 'Não foi possível criar a conta.');
        }

        fetchAccounts();
    }, [user, fetchAccounts]);

    const handleCreateManualSubAccount = useCallback(async (data: { accountName: string; balanceOrLimit: number }) => {
        if (!user?.uid) {
            throw new Error('Usuário não autenticado.');
        }

        const { mode, connector } = subAccountModalConfig;
        if (!connector) return;

        const type = mode === 'CREDIT_CARD' ? 'CREDIT' : 'BANK';
        const subtype = mode === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'SAVINGS_ACCOUNT';

        const result = await databaseService.createManualSubAccount(
            user.uid,
            connector,
            type,
            subtype,
            data.accountName,
            data.balanceOrLimit
        );
        
        if (!result?.success) {
            throw new Error(result?.error || 'Não foi possível criar a conta.');
        }

        fetchAccounts();
    }, [user, fetchAccounts, subAccountModalConfig]);

    const handleEditManualSubAccount = useCallback(async (data: { id?: string; accountName: string; balanceOrLimit: number; dueDate?: number; closeDate?: number }) => {
        if (!user?.uid) {
            throw new Error('Usuário não autenticado.');
        }

        const { account } = editSubAccountConfig;
        if (!account || !data.id) return;

        const updateData: any = {
            name: data.accountName,
        };

        if (account.type === 'CREDIT' || account.type === 'CREDIT_CARD' || account.subtype === 'CREDIT_CARD') {
            updateData.creditLimit = data.balanceOrLimit;
            updateData.availableCreditLimit = data.balanceOrLimit;
            // Also update creditData if present
            if (account.creditData) {
                updateData['creditData.creditLimit'] = data.balanceOrLimit;
                updateData['creditData.availableCreditLimit'] = data.balanceOrLimit;
            }
        } else {
            updateData.balance = data.balanceOrLimit;
        }

        const result = await databaseService.updateAccount(user.uid, data.id, updateData);
        
        if (!result?.success) {
            throw new Error(result?.error || 'Não foi possível atualizar a conta.');
        }

        fetchAccounts();
    }, [user, fetchAccounts, editSubAccountConfig]);

    const handleOAuthCallback = useCallback(async (url: string) => {
        const now = Date.now();
        const lastCallback = lastOAuthCallbackRef.current;

        if (lastCallback?.url === url && now - lastCallback.receivedAt < 2000) {
            return;
        }

        lastOAuthCallbackRef.current = { url, receivedAt: now };

        try {
            WebBrowser.dismissBrowser();
        } catch { }

        const parsedItemId = extractItemIdFromDeepLink(url);
        const fallbackItemId = pendingItemIdRef.current;

        let queryParams: Record<string, any> | null = null;

        try {
            ({ queryParams } = Linking.parse(url));
        } catch { }

        const callbackError = typeof queryParams?.error === 'string' ? queryParams.error : null;
        const callbackStatus = typeof queryParams?.status === 'string' ? queryParams.status : null;
        const itemId = parsedItemId || fallbackItemId;

        await openFinanceConnectionState.saveCallbackPayload({
            itemId: itemId || null,
            status: callbackStatus,
            error: callbackError,
            receivedAt: Date.now(),
            rawUrl: url
        });

        if (itemId) {
            setPendingItemId(itemId);
            await savePendingConnectionState(itemId, selectedConnector, 'oauth_pending');
        }

        if (callbackError) {
            setConnectionError('O banco recusou a conexão ou ocorreu um erro.');
            setConnectionStep('error');
            setIsModalVisible(false);

            await clearPersistedOpenFinanceState();

            setTimeout(() => setConnectionStep('info'), 5000);
            return;
        }

        if (!itemId || !user) return;

        setIsModalVisible(false);
        setConnectionStep('oauth_pending');
        setConnectionProgress(40);
        setConnectionStatusText('Autorização recebida do banco. Finalizando conexão...');
    }, [
        clearPersistedOpenFinanceState,
        extractItemIdFromDeepLink,
        savePendingConnectionState,
        selectedConnector,
        user
    ]);

    useEffect(() => {
        handleOAuthCallbackRef.current = handleOAuthCallback;
    }, [handleOAuthCallback]);

    useEffect(() => {
        const subscription = Linking.addEventListener('url', (event) => {
            if (
                event.url.includes('open-finance') ||
                event.url.includes('pluggy') ||
                event.url.includes('oauth-callback')
            ) {
                handleOAuthCallback(event.url);
            }
        });

        Linking.getInitialURL().then((url) => {
            if (
                url &&
                (
                    url.includes('open-finance') ||
                    url.includes('pluggy') ||
                    url.includes('oauth-callback')
                )
            ) {
                handleOAuthCallback(url);
            }
        });

        return () => subscription.remove();
    }, [handleOAuthCallback]);

    const getActiveConnectorName = useCallback(() => {
        return selectedConnector?.name || cpfConnector?.name || 'Banco';
    }, [selectedConnector, cpfConnector]);

    useEffect(() => {
        if (!pendingItemId || !user) return;

        const itemId = pendingItemId;
        if (activePollingItemIdRef.current === itemId) return;

        let cancelled = false;
        let attempt = 0;
        const startedAt = Date.now();
        const bankName = getActiveConnectorName();
        activePollingItemIdRef.current = itemId;

        const updateBgPhase = (phase: string) => {
            openFinanceConnectionState.updateBackgroundSyncPhase(phase as any).catch(() => null);
            openFinanceConnectionState.updateSyncPhase(phase as any).catch(() => null);
        };

        const failConnection = async (message: string, notifyMessage = message) => {
            cancelled = true;
            setConnectionError(message);
            setConnectionStep('error');
            setPendingItemId(null);
            setIsModalVisible(false);

            await clearPersistedOpenFinanceState();

            notificationService.sendSyncCompleteNotification(
                bankName,
                false,
                notifyMessage
            ).catch(() => null);

            setTimeout(() => setConnectionStep('info'), 5000);
        };

        const runPollingLoop = async () => {
            while (!cancelled && activePollingItemIdRef.current === itemId) {
                if (Date.now() - startedAt > OAUTH_POLL_MAX_DURATION_MS) {
                    await failConnection('Tempo expirado aguardando o banco.');
                    return;
                }

                attempt += 1;
                updateBgPhase('polling');

                try {
                    const token = await user.getIdToken();
                    const response = await apiFetch(`/api/pluggy/items/${itemId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        timeout: 15000
                    });

                    const payload = await readApiPayload(response);

                    if (!response.ok) {
                        if (isRetryableApiResponse(response, payload)) {
                            setConnectionStatusText('Ainda tentando falar com o banco...');
                            await sleep(getPollingDelay(attempt));
                            continue;
                        }

                        await failConnection(
                            getApiErrorText(payload, `Falha ao consultar status da conexao (HTTP ${response.status}).`)
                        );
                        return;
                    }

                    const item = payload?.item || payload;
                    const normalizedStatus = String(item?.status || '').toUpperCase();
                    const clientUrl = getItemOAuthUrl(item);

                    if (
                        normalizedStatus === 'WAITING_USER_INPUT' &&
                        clientUrl &&
                        !openedOAuthUrlRef.current
                    ) {
                        try {
                            openedOAuthUrlRef.current = true;
                            setConnectionStep('oauth_pending');
                            updateBgPhase('oauth_pending');
                            await openOAuthUrlSafely(clientUrl);
                        } catch (openError: any) {
                            await failConnection(
                                openError?.message || 'Nao foi possivel abrir a autorizacao do banco.',
                                'Nao foi possivel abrir a autorizacao.'
                            );
                            return;
                        }
                    }

                    if (normalizedStatus === 'WAITING_USER_INPUT') {
                        setConnectionStep('oauth_pending');
                        setConnectionProgress((previous) => previous < 40 ? 40 : previous);
                        setConnectionStatusText(
                            clientUrl
                                ? 'Abra o app do banco para aprovar a conexao.'
                                : 'Aguardando voce concluir a autorizacao no banco...'
                        );
                        await sleep(getPollingDelay(attempt));
                        continue;
                    }

                    if (normalizedStatus === 'UPDATING' || normalizedStatus === 'PROCESSING') {
                        setConnectionStep('connecting');
                        setConnectionProgress((previous) => previous < 55 ? 55 : previous);
                        setConnectionStatusText('O banco autorizou. Extraindo dados...');
                        updateBgPhase('syncing');
                        await sleep(getPollingDelay(attempt));
                        continue;
                    }

                    if (normalizedStatus === 'UPDATED') {
                        if (pendingItemSyncInFlightRef.current) {
                            await sleep(1000);
                            continue;
                        }

                        pendingItemSyncInFlightRef.current = true;
                        setConnectionStep('connecting');
                        setConnectionProgress(60);
                        setConnectionStatusText('Autorizacao confirmada! Extraindo suas contas e transacoes...');
                        updateBgPhase('syncing');

                        const token2 = await user.getIdToken();
                        let syncResponse = await apiFetch('/api/pluggy/sync', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token2}`
                            },
                            body: JSON.stringify({
                                itemId,
                                fullHistory: true
                            }),
                            timeout: SYNC_REQUEST_TIMEOUT_MS
                        });

                        let syncPayload = await readApiPayload(syncResponse);

                        if (
                            syncResponse.ok &&
                            Array.isArray(syncPayload?.accounts) &&
                            syncPayload.accounts.length > 0 &&
                            Number(syncPayload.totalTransactions || 0) === 0
                        ) {
                            setConnectionStatusText('O banco ainda esta processando seu extrato. Tentando novamente...');
                            await sleep(3000);

                            syncResponse = await apiFetch('/api/pluggy/sync', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token2}`
                                },
                                body: JSON.stringify({
                                    itemId,
                                    fullHistory: true
                                }),
                                timeout: SYNC_REQUEST_TIMEOUT_MS
                            });
                            syncPayload = await readApiPayload(syncResponse);
                        }

                        if (!syncResponse.ok) {
                            if (isRetryableApiResponse(syncResponse, syncPayload)) {
                                pendingItemSyncInFlightRef.current = false;
                                setConnectionStatusText(getApiErrorText(syncPayload, 'Banco ainda processando. Tentando novamente...'));
                                await sleep(getPollingDelay(attempt));
                                continue;
                            }

                            await failConnection(getApiErrorText(syncPayload, 'Falha ao baixar transacoes do banco.'));
                            return;
                        }

                        setConnectionProgress(80);
                        updateBgPhase('saving');

                        const persistResult = await persistPluggySyncData(
                            syncPayload,
                            syncPayload?.connector || selectedConnector,
                            setConnectionStatusText
                        );

                        if (persistResult.partial) {
                            showWarning('Sincronizacao parcial', 'Algumas contas ou transacoes nao foram atualizadas. Tente sincronizar novamente depois.');
                        }

                        const creditResult = await consumeCredit('connect', itemId);
                        if (!creditResult.success) {
                            console.warn('[OpenFinance] Connection completed but credit was not consumed:', creditResult.error);
                            refreshCredits();
                        }

                        setConnectionProgress(100);
                        setConnectionStatusText(
                            persistResult.partial
                                ? 'Sincronizacao concluida com avisos.'
                                : 'Sincronizacao concluida com sucesso!'
                        );
                        setConnectionStep('success');
                        setPendingItemId(null);
                        setIsModalVisible(false);

                        await clearPersistedOpenFinanceState();

                        notificationService.sendSyncCompleteNotification(bankName, true).catch(() => null);

                        setTimeout(() => {
                            fetchAccounts();
                            refreshCredits();
                            setConnectionStep('info');
                        }, 3500);
                        return;
                    }

                    if (
                        normalizedStatus === 'LOGIN_ERROR' ||
                        normalizedStatus === 'OUTDATED' ||
                        normalizedStatus === 'ERROR'
                    ) {
                        await failConnection(buildPluggyConnectionErrorMessage(item));
                        return;
                    }

                    setConnectionStatusText('Aguardando retorno do banco...');
                    await sleep(getPollingDelay(attempt));
                } catch (error) {
                    console.warn('[OAuth Polling] Error:', error);
                    pendingItemSyncInFlightRef.current = false;
                    setConnectionStatusText('Conexao instavel. Tentando novamente...');
                    await sleep(getPollingDelay(attempt));
                } finally {
                    if (pendingItemSyncInFlightRef.current && cancelled) {
                        pendingItemSyncInFlightRef.current = false;
                    }
                }
            }
        };

        runPollingLoop().finally(() => {
            if (activePollingItemIdRef.current === itemId) {
                activePollingItemIdRef.current = null;
            }
            pendingItemSyncInFlightRef.current = false;
        });

        return () => {
            cancelled = true;
        };
    // Keep this effect keyed only by item/user; several callbacks above are recreated each render and would cancel the active polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingItemId, user]);

    useEffect(() => {
        if (legacyPollingDisabledRef.current) return;
        if (!['oauth_pending', 'connecting'].includes(connectionStep) || !pendingItemId || !user) return;

        let pollCount = 0;
        const maxPolls = 180;
        let cancelled = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        const bankName = getActiveConnectorName();

        const updateBgPhase = (phase: string) => {
            openFinanceConnectionState.updateBackgroundSyncPhase(phase as any).catch(() => null);
            openFinanceConnectionState.updateSyncPhase(phase as any).catch(() => null);
        };

        const checkStatus = async () => {
            if (cancelled) return;

            pollCount++;
            updateBgPhase('polling');

            try {
                const token = await user.getIdToken();

                const response = await apiFetch(`/api/pluggy/items/${pendingItemId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    timeout: 15000
                });

                if (response.ok) {
                    const data = await response.json();
                    const item = data.item || data;
                    const status = item.status;
                    const normalizedStatus = String(status || '').toUpperCase();
                    const clientUrl = getItemOAuthUrl(item);

                    if (
                        normalizedStatus === 'WAITING_USER_INPUT' &&
                        clientUrl &&
                        !openedOAuthUrlRef.current
                    ) {
                        try {
                            openedOAuthUrlRef.current = true;
                            setConnectionStep('oauth_pending');
                            updateBgPhase('oauth_pending');
                            await openOAuthUrlSafely(clientUrl);
                        } catch (openError: any) {
                            cancelled = true;

                            if (intervalId) clearInterval(intervalId);

                            setConnectionError(openError?.message || 'Não foi possível abrir a autorização do banco.');
                            setConnectionStep('error');
                            setPendingItemId(null);
                            setIsModalVisible(false);

                            await clearPersistedOpenFinanceState();

                            notificationService.sendSyncCompleteNotification(
                                bankName,
                                false,
                                'Não foi possível abrir a autorização.'
                            ).catch(() => null);

                            setTimeout(() => setConnectionStep('info'), 5000);
                            return;
                        }
                    }

                    if (normalizedStatus === 'WAITING_USER_INPUT') {
                        setConnectionStep('oauth_pending');
                        setConnectionProgress((previous) => previous < 35 ? 35 : previous);
                        setConnectionStatusText(
                            clientUrl
                                ? 'Abra o app do banco para aprovar a conexão.'
                                : 'Aguardando você concluir a autorização no banco...'
                        );
                        return;
                    }

                    if (normalizedStatus === 'UPDATED') {
                        cancelled = true;

                        if (intervalId) clearInterval(intervalId);

                        setConnectionStep('connecting');
                        setConnectionProgress(60);
                        setConnectionStatusText('Autorização confirmada! Extraindo suas contas e transações...');
                        updateBgPhase('syncing');

                        const token2 = await user.getIdToken();

                        let syncResponse = await apiFetch('/api/pluggy/sync', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token2}`
                            },
                            body: JSON.stringify({
                                itemId: pendingItemId,
                                autoRefresh: true,
                                fullHistory: true
                            }),
                            timeout: 240000
                        });

                        if (syncResponse.ok) {
                            let syncData = await syncResponse.json();

                            let totalTx =
                                syncData.accounts?.reduce(
                                    (acc: any, a: any) => acc + (a.transactions?.length || 0),
                                    0
                                ) || 0;

                            if (totalTx === 0 && syncData.accounts?.length > 0) {
                                setConnectionStatusText('O banco ainda está processando seu extrato. Tentando novamente...');

                                await new Promise((resolve) => setTimeout(resolve, 3000));

                                const retryResponse = await apiFetch('/api/pluggy/sync', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token2}`
                                    },
                                    body: JSON.stringify({
                                        itemId: pendingItemId,
                                        autoRefresh: true,
                                        fullHistory: true
                                    }),
                                    timeout: 240000
                                });

                                if (retryResponse.ok) {
                                    syncData = await retryResponse.json();

                                    totalTx =
                                        syncData.accounts?.reduce(
                                            (acc: any, a: any) => acc + (a.transactions?.length || 0),
                                            0
                                        ) || 0;
                                }
                            }

                            setConnectionProgress(80);
                            updateBgPhase('saving');

                            if (syncData.accounts && syncData.accounts.length > 0) {
                                setConnectionStatusText(`Organizando ${syncData.accounts.length} contas...`);

                                await Promise.all(
                                    syncData.accounts.map((account: any) =>
                                        databaseService.saveAccount(
                                            user.uid,
                                            account,
                                            syncData.connector || selectedConnector
                                        )
                                    )
                                );

                                setConnectionStatusText(`Salvando ${totalTx} transações...`);

                                await databaseService.saveOpenFinanceTransactions(
                                    user.uid,
                                    syncData.accounts,
                                    syncData.connector || selectedConnector
                                );
                            }

                            setConnectionProgress(100);
                            setConnectionStatusText('Sincronização concluída com sucesso!');
                            setConnectionStep('success');
                            setPendingItemId(null);
                            setIsModalVisible(false);

                            await clearPersistedOpenFinanceState();

                            notificationService.sendSyncCompleteNotification(bankName, true).catch(() => null);

                            setTimeout(() => {
                                fetchAccounts();
                                refreshCredits();
                                setConnectionStep('info');
                            }, 3500);
                        } else {
                            const errPayload = await syncResponse.json().catch(() => null);

                            cancelled = true;

                            if (intervalId) clearInterval(intervalId);

                            const errMsg = errPayload?.error || 'Falha ao baixar transações do banco.';

                            setConnectionError(errMsg);
                            setConnectionStep('error');
                            setPendingItemId(null);
                            setIsModalVisible(false);

                            await clearPersistedOpenFinanceState();

                            notificationService.sendSyncCompleteNotification(bankName, false, errMsg).catch(() => null);

                            setTimeout(() => setConnectionStep('info'), 5000);
                            return;
                        }

                        return;
                    }

                    if (normalizedStatus === 'UPDATING') {
                        setConnectionStep('connecting');
                        setConnectionProgress((previous) => previous < 50 ? 50 : previous);
                        setConnectionStatusText('O banco autorizou. Extraindo dados...');
                        updateBgPhase('syncing');
                        return;
                    }

                    if (
                        normalizedStatus === 'LOGIN_ERROR' ||
                        normalizedStatus === 'OUTDATED' ||
                        normalizedStatus === 'ERROR'
                    ) {
                        cancelled = true;

                        if (intervalId) clearInterval(intervalId);

                        const resolvedError = buildPluggyConnectionErrorMessage(item);

                        setConnectionError(resolvedError);
                        setConnectionStep('error');
                        setPendingItemId(null);
                        setIsModalVisible(false);

                        await clearPersistedOpenFinanceState();

                        notificationService.sendSyncCompleteNotification(bankName, false, resolvedError).catch(() => null);

                        setTimeout(() => setConnectionStep('info'), 5000);
                        return;
                    }
                } else {
                    const errPayload = await response.json().catch(() => null);

                    cancelled = true;

                    if (intervalId) clearInterval(intervalId);

                    const errMsg =
                        errPayload?.error ||
                        `Falha ao consultar status da conexão (HTTP ${response.status}).`;

                    setConnectionError(errMsg);
                    setConnectionStep('error');
                    setPendingItemId(null);
                    setIsModalVisible(false);

                    await clearPersistedOpenFinanceState();

                    notificationService.sendSyncCompleteNotification(bankName, false, errMsg).catch(() => null);

                    setTimeout(() => setConnectionStep('info'), 5000);
                    return;
                }
            } catch (error) {
                console.warn('[OAuth Polling] Error:', error);
            }

            if (pollCount >= maxPolls && !cancelled) {
                cancelled = true;

                if (intervalId) clearInterval(intervalId);

                setConnectionError('Tempo expirado aguardando o banco.');
                setConnectionStep('error');
                setPendingItemId(null);
                setIsModalVisible(false);

                await clearPersistedOpenFinanceState();

                notificationService.sendSyncCompleteNotification(
                    bankName,
                    false,
                    'Tempo expirado aguardando o banco.'
                ).catch(() => null);

                setTimeout(() => setConnectionStep('info'), 5000);
            }
        };

        checkStatus();
        intervalId = setInterval(checkStatus, 3000);

        return () => {
            cancelled = true;
            if (intervalId) clearInterval(intervalId);
        };
    }, [
        clearPersistedOpenFinanceState,
        connectionStep,
        getActiveConnectorName,
        openOAuthUrlSafely,
        pendingItemId,
        selectedConnector,
        user,
        apiFetch,
        refreshCredits
    ]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchAccounts();
    };

    const fetchConnectors = useCallback(async (options: { force?: boolean; silent?: boolean } = {}) => {
        const { force = false, silent = false } = options;

        if (!user) {
            setLoadingConnectors(false);
            return;
        }

        const now = Date.now();
        const hasCachedConnectors = cachedBankConnectors.length > 0;
        const cacheIsFresh = hasCachedConnectors && (now - cachedBankConnectorsAt) < CONNECTORS_CACHE_TTL_MS;

        if (!force && hasCachedConnectors) {
            setConnectors(cachedBankConnectors);
            setConnectorsFetchError(null);

            if (cacheIsFresh) {
                setLoadingConnectors(false);
                return;
            }
        }

        const hasVisibleConnectors = connectorsRef.current.length > 0 || hasCachedConnectors;
        setLoadingConnectors(!silent && !hasVisibleConnectors);
        setConnectorsFetchError(null);

        let request: Promise<any[]> | null = null;
        const fetchBankConnectorsFromApi = async () => {
            const token = await user.getIdToken();

            const response = await apiFetch('/api/pluggy/connectors', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                timeout: CONNECTORS_TIMEOUT_MS
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => null);
                throw new Error(errData?.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return normalizeBankConnectorsPayload(data);
        };

        try {
            if (!force && bankConnectorsRequest) {
                request = bankConnectorsRequest;
            } else if (force) {
                request = (async () => {
                    const bankConnectors = await fetchBankConnectorsFromApi();
                    await queryCache.set(BANK_CONNECTORS_CACHE_KEY, bankConnectors, true);
                    return bankConnectors;
                })();
            } else {
                request = queryCache
                    .get<any[]>(
                        BANK_CONNECTORS_CACHE_KEY,
                        fetchBankConnectorsFromApi,
                        { ttlMinutes: CONNECTORS_CACHE_TTL_MINUTES, persist: true }
                    )
                    .then((bankConnectors) => normalizeBankConnectorsPayload(bankConnectors || []));

                bankConnectorsRequest = request;
            }

            const bankConnectors = await request;
            rememberBankConnectors(bankConnectors);
            if (isOpenFinanceMountedRef.current) {
                setConnectors(bankConnectors);
            }
        } catch (error: any) {
            const msg = isNetworkTransportError(error)
                ? getApiConnectionErrorMessage(error instanceof Error ? error.message : undefined)
                : error instanceof Error
                    ? error.message
                    : 'NÃ£o foi possÃ­vel carregar os bancos.';

            if (!isOpenFinanceMountedRef.current) {
                return;
            }

            if (connectorsRef.current.length === 0 && cachedBankConnectors.length === 0) {
                setConnectorsFetchError(msg);
            } else {
                console.warn('[OpenFinance] Failed to refresh bank connectors:', msg);
            }
        } finally {
            if (request && bankConnectorsRequest === request) {
                bankConnectorsRequest = null;
            }

            if (isOpenFinanceMountedRef.current) {
                setLoadingConnectors(false);
            }
        }
    }, [apiFetch, user]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fetchConnectorsLegacy = async () => {
        setLoadingConnectors(true);
        setConnectorsFetchError(null);

        try {
            if (!user) return;

            const token = await user.getIdToken();

            const response = await apiFetch('/api/pluggy/connectors', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                timeout: CONNECTORS_TIMEOUT_MS
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => null);
                throw new Error(errData?.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.results) {
                const bankConnectors = data.results
                    .filter((c: any) => c.type === 'PERSONAL_BANK' || c.type === 'BUSINESS_BANK')
                    .map((c: any) => ({
                        ...c,
                        imageUrl: getConnectorLogoUrl(c) || '',
                        primaryColor: normalizeHexColor(c.primaryColor, '#30302E'),
                        credentials: Array.isArray(c.credentials) ? c.credentials : []
                    }));

                setConnectors(deduplicateBankConnectors(bankConnectors));
            }
        } catch (error: any) {
            const msg = isNetworkTransportError(error)
                ? getApiConnectionErrorMessage(error instanceof Error ? error.message : undefined)
                : error instanceof Error
                    ? error.message
                    : 'Não foi possível carregar os bancos.';

            setConnectorsFetchError(msg);
        } finally {
            setLoadingConnectors(false);
        }
    };

    // Fetch which banks are currently having issues according to Pluggy.
    const fetchBankHealthStatus = useCallback(async (options: { force?: boolean } = {}) => {
        const { force = false } = options;

        if (!user) {
            setBankHealthLoading(false);
            return;
        }

        const now = Date.now();
        const hasCachedHealth = cachedUnhealthyBankIds !== null;
        const cacheIsFresh = hasCachedHealth && (now - cachedUnhealthyBankIdsAt) < BANK_HEALTH_CACHE_TTL_MS;

        if (!force && cachedUnhealthyBankIds) {
            setUnhealthyBankIds(new Set(cachedUnhealthyBankIds));

            if (cacheIsFresh) {
                setBankHealthLoading(false);
                return;
            }
        }

        if (!hasCachedHealth) {
            setBankHealthLoading(true);
        }

        let request: Promise<Set<string>> | null = null;

        try {
            if (!force && bankHealthRequest) {
                request = bankHealthRequest;
            } else {
                request = (async () => {
                    const token = await user.getIdToken();

                    const response = await apiFetch('/api/pluggy/connectors/health', {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        timeout: 15000,
                    });

                    if (!response.ok) {
                        console.warn('[BankHealth] Failed to fetch health status');
                        return new Set<string>();
                    }

                    const data = await response.json();

                    if (data.success && Array.isArray(data.unhealthy)) {
                        return new Set<string>(
                            data.unhealthy
                                .map((b: any) => String(b.id))
                                .filter(Boolean)
                        );
                    }

                    return new Set<string>();
                })();

                if (!force) {
                    bankHealthRequest = request;
                }
            }

            const badIds = await request;
            cachedUnhealthyBankIds = new Set(badIds);
            cachedUnhealthyBankIdsAt = Date.now();
            setUnhealthyBankIds(badIds);
        } catch (e) {
            console.warn('[BankHealth] Error fetching health:', e);
            setUnhealthyBankIds(cachedUnhealthyBankIds ? new Set(cachedUnhealthyBankIds) : new Set());
        } finally {
            if (request && bankHealthRequest === request) {
                bankHealthRequest = null;
            }

            setBankHealthLoading(false);
        }
    }, [apiFetch, user]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fetchBankHealthStatusLegacy = async () => {
        setBankHealthLoading(true);
        try {
            if (!user) return;

            const token = await user.getIdToken();

            const response = await apiFetch('/api/pluggy/connectors/health', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                timeout: 15000,
            });

            if (!response.ok) {
                // Non-critical — just don't show warnings if it fails
                console.warn('[BankHealth] Failed to fetch health status');
                setUnhealthyBankIds(new Set());
                return;
            }

            const data = await response.json();

            if (data.success && Array.isArray(data.unhealthy)) {
                const badIds = new Set<string>(
                    data.unhealthy
                        .map((b: any) => String(b.id))
                        .filter(Boolean)
                );
                setUnhealthyBankIds(badIds);
            } else {
                setUnhealthyBankIds(new Set());
            }
        } catch (e) {
            console.warn('[BankHealth] Error fetching health:', e);
            setUnhealthyBankIds(new Set());
        } finally {
            setBankHealthLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;

        let cancelled = false;
        const task = InteractionManager.runAfterInteractions(() => {
            if (!cancelled) {
                void fetchConnectors({ silent: true });
            }
        });

        return () => {
            cancelled = true;
            task?.cancel?.();
        };
    }, [fetchConnectors, user]);

    const handleOpenModal = () => {
        pendingCpfAfterBankDismissRef.current = false;
        clearCpfModalOpenTimer();
        openedOAuthUrlRef.current = false;
        setIsModalVisible(true);
        setConnectionStep('banks');
        setSelectedConnector(null);
        setCredentialValues({});
        setConnectorsFetchError(null);
        setConnectionError(null);
        setConnectionStatusText('');
        setSearchQuery('');

        setShowCpfModal(false);
        setCpfInput('');
        setCpfConnector(null);

        openFinanceConnectionState.clearCallbackPayload().catch(() => null);

        void fetchConnectors();
        void fetchBankHealthStatus();
    };

    const handleCloseModal = () => {
        // If a CPF modal transition is pending (user just selected a bank on iOS),
        // preserve the pending state so the CPF modal can still open.
        const isCpfTransition = pendingCpfAfterBankDismissRef.current;

        if (!isCpfTransition) {
            pendingCpfAfterBankDismissRef.current = false;
            clearCpfModalOpenTimer();
        }

        const isActiveConnection =
            ['connecting', 'oauth_pending'].includes(connectionStep) &&
            pendingItemId;

        openedOAuthUrlRef.current = false;
        setIsModalVisible(false);
        setSearchQuery('');
        setConnectorsFetchError(null);

        // Don't clear CPF state if we're transitioning to the CPF modal
        if (!isCpfTransition) {
            setShowCpfModal(false);
            setCpfInput('');
            setCpfConnector(null);
        }

        if (isActiveConnection) {
            return;
        }

        setConnectionStep('banks');
        setSelectedConnector(null);
        setCredentialValues({});
        setConnectionError(null);
        setUseCNPJ(false);
        setConnectionStatusText('');
        setPendingItemId(null);

        clearPersistedOpenFinanceState().catch(() => null);
    };

    const handleSelectConnector = (connector: any) => {
        pendingCpfAfterBankDismissRef.current = false;
        clearCpfModalOpenTimer();

        setCpfConnector(connector);
        setCpfInput('');
        setCpfModalStep('cpf');

        if (Platform.OS === 'ios') {
            Keyboard.dismiss();
            setShowCpfModal(false);
            pendingCpfAfterBankDismissRef.current = true;
            setIsModalVisible(false);

            // Direct fallback: open CPF modal after a delay, regardless of
            // whether the BottomSheet onDismiss callback fires or not.
            // This bypasses the fragile dismiss callback chain.
            clearCpfModalOpenTimer();
            cpfModalOpenTimerRef.current = setTimeout(() => {
                if (pendingCpfAfterBankDismissRef.current) {
                    pendingCpfAfterBankDismissRef.current = false;
                    setShowCpfModal(true);
                }
            }, CPF_MODAL_IOS_DISMISS_FALLBACK_MS);

            return;
        }

        setShowCpfModal(true);
    };

    const handleConfirmCpf = () => {
        const cleanCpf = cpfInput.replace(/\D/g, '');

        if (cleanCpf.length !== 11) {
            showError('CPF inválido', 'Digite um CPF válido com 11 dígitos.');
            return;
        }

        if (!cpfConnector) return;

        if (!hasCredits) {
            const resetTime = databaseService.getTimeUntilReset();
            showWarning('Creditos esgotados', `Seus creditos renovam em ${resetTime.formatted}.`);
            return;
        }

        Keyboard.dismiss();
        setCpfModalStep('confirm');

        confirmLogoScale.setValue(0.3);
        confirmLogoOpacity.setValue(0);

        Animated.parallel([
            Animated.spring(confirmLogoScale, {
                toValue: 1,
                friction: 5,
                tension: 80,
                useNativeDriver: true,
            }),
            Animated.timing(confirmLogoOpacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
        ]).start();
    };

    useEffect(() => {
        if (showCpfModal && cpfModalStep === 'confirm') {
            confirmFlowLoopRef.current?.stop();
            confirmFlowProgress.setValue(0);

            const flowLoop = Animated.loop(
                Animated.sequence([
                    Animated.timing(confirmFlowProgress, {
                        toValue: 1,
                        duration: 1250,
                        easing: Easing.inOut(Easing.cubic),
                        useNativeDriver: true,
                    }),
                    Animated.delay(260),
                ]),
                { resetBeforeIteration: true }
            );

            confirmFlowLoopRef.current = flowLoop;
            flowLoop.start();

            return () => {
                flowLoop.stop();
                confirmFlowLoopRef.current = null;
            };
        }

        confirmFlowLoopRef.current?.stop();
        confirmFlowLoopRef.current = null;
        confirmFlowProgress.setValue(0);
    }, [showCpfModal, cpfModalStep, confirmFlowProgress]);

    const handleStartConnection = async () => {
        if (!cpfConnector) return;

        if (!hasCredits) {
            const resetTime = databaseService.getTimeUntilReset();
            showWarning('Creditos esgotados', `Seus creditos renovam em ${resetTime.formatted}.`);
            return;
        }

        pendingCpfAfterBankDismissRef.current = false;
        clearCpfModalOpenTimer();
        setSelectedConnector(cpfConnector);

        const creds = cpfConnector.credentials || [];
        const documentCred = creds.find((c: any) => credentialHasCpf(c) || credentialHasCnpj(c));
        const credName = documentCred ? documentCred.name : (creds[0]?.name || 'document');

        const credentialsPayload = {
            [credName]: cpfInput
        };

        setCredentialValues(credentialsPayload);

        setShowCpfModal(false);
        setIsModalVisible(false);
        setConnectionStep('connecting');

        setTimeout(() => {
            handleConnect(credentialsPayload, cpfConnector);
        }, 100);
    };

    const handleRequestDelete = (group: any) => {
        triggerBankCardMorph();
        setItemToDelete(group);
        setDeleteModalVisible(true);
    };

    const handleConfirmDelete = async () => {
        if (!user || !itemToDelete || deleteInProgress) return;

        const groupToDelete = itemToDelete;
        const bankName = groupToDelete?.connector?.name || 'Banco';
        const previousAccounts = accounts;
        const accountIds = (groupToDelete.accounts || [])
            .map((acc: any) => acc?.id)
            .filter(Boolean);
        const accountIdSet = new Set(accountIds);
        const accountWithItem = (groupToDelete.accounts || [])
            .find((account: any) => account?.pluggyItemId || account?.itemId);
        const itemId = accountWithItem?.pluggyItemId || accountWithItem?.itemId || null;
        let didStartLocalDelete = false;

        setDeleteInProgress(true);
        setDeleteModalVisible(false);
        setItemToDelete(null);
        clearBankSyncBannerTimer();
        setBankSyncBanner({
            step: 'connecting',
            statusText: `Desconectando ${bankName}...`,
            error: null
        });

        if (accountIdSet.size > 0) {
            triggerBankCardMorph();
            setAccounts((current) => current.filter((account) => !accountIdSet.has(account.id)));
            setDataRefreshKey((prev) => prev + 1);
        }

        try {
            const remoteDeletePromise = (async () => {
                if (!itemId) return;

                const token = await user.getIdToken();
                const deleteResponse = await apiFetch(`/api/pluggy/items/${itemId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    timeout: 45000
                });

                if (!deleteResponse.ok && deleteResponse.status !== 404) {
                    const deletePayload = await readApiPayload(deleteResponse);
                    throw new Error(getApiErrorText(deletePayload, 'Nao foi possivel desconectar no banco.'));
                }
            })();

            didStartLocalDelete = true;
            const localDeletePromise = databaseService.deleteOpenFinanceConnection(user.uid, accountIds, {
                deleteAccountsFirst: true
            });

            const [remoteDeleteResult, localDeleteResult] = await Promise.allSettled([
                remoteDeletePromise,
                localDeletePromise
            ]);

            if (remoteDeleteResult.status === 'rejected') {
                throw remoteDeleteResult.reason;
            }

            if (localDeleteResult.status === 'rejected') {
                throw localDeleteResult.reason;
            }

            const deleteResult = localDeleteResult.value;
            if (!deleteResult.success) {
                throw new Error(deleteResult.error || 'Nao foi possivel concluir a limpeza local.');
            }

            setBankSyncBanner({
                step: 'success',
                statusText: `${bankName} desconectado.`,
                error: null
            });
            bankSyncBannerTimerRef.current = setTimeout(hideBankSyncBanner, 3000);
        } catch (error) {
            console.error('handleConfirmDelete error:', error);
            if (!didStartLocalDelete) {
                setAccounts(previousAccounts);
                setDataRefreshKey((prev) => prev + 1);
            }
            setBankSyncBanner({
                step: 'error',
                statusText: '',
                error: 'Não foi possível desconectar.'
            });
            bankSyncBannerTimerRef.current = setTimeout(hideBankSyncBanner, 4000);
        } finally {
            setDeleteInProgress(false);
        }
    };

    const handleSyncBank = async (
        group: any,
        onStatusUpdate: (status: SyncStatus) => void
    ) => {
        if (!user) return;

        const accountWithItem = (group.accounts || [])
            .find((account: any) => account?.pluggyItemId || account?.itemId);

        const itemId = accountWithItem?.pluggyItemId || accountWithItem?.itemId || null;

        if (!itemId) {
            onStatusUpdate({
                step: 'error',
                message: 'Item ID ausente',
                progress: 0
            });

            setTimeout(() => {
                onStatusUpdate({
                    step: 'idle',
                    message: '',
                    progress: 0
                });
            }, 3000);

            return;
        }

        if (activeManualSyncsRef.current.has(itemId)) {
            onStatusUpdate({
                step: 'connecting',
                message: 'Sincronizacao ja em andamento...',
                progress: 15
            });
            return;
        }

        activeManualSyncsRef.current.add(itemId);

        try {
            onStatusUpdate({
                step: 'connecting',
                message: 'Atualizando no banco...',
                progress: 10
            });

            const token = await user.getIdToken();

            const refreshResponse = await apiFetch(`/api/pluggy/force-refresh/${itemId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const refreshPayload = await readApiPayload(refreshResponse);

            if (!refreshResponse.ok && !isRetryableApiResponse(refreshResponse, refreshPayload)) {
                const refreshError = refreshPayload;
                throw new Error(refreshError?.error || 'Falha ao iniciar atualização no banco.');
            }

            onStatusUpdate({
                step: 'connecting',
                message: 'Aguardando atualização do banco...',
                progress: 20
            });

            const maxPollAttempts = Math.ceil(MANUAL_REFRESH_MAX_DURATION_MS / OAUTH_POLL_INITIAL_DELAY_MS);
            let itemUpdated = false;

            for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
                const statusResponse = await apiFetch(`/api/pluggy/items/${itemId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    timeout: 15000
                });

                const statusPayload = await readApiPayload(statusResponse);

                if (!statusResponse.ok && !isRetryableApiResponse(statusResponse, statusPayload)) {
                    const statusError = statusPayload;
                    throw new Error(statusError?.error || 'Falha ao consultar status da atualização.');
                }

                const statusData = statusPayload;
                const item = statusData?.item || statusData;
                const normalizedStatus = String(item?.status || '').toUpperCase();

                if (normalizedStatus === 'UPDATED') {
                    itemUpdated = true;
                    break;
                }

                if (
                    normalizedStatus === 'LOGIN_ERROR' ||
                    normalizedStatus === 'OUTDATED' ||
                    normalizedStatus === 'ERROR'
                ) {
                    throw new Error(buildPluggyConnectionErrorMessage(item));
                }

                if (normalizedStatus === 'WAITING_USER_INPUT') {
                    throw new Error('O banco pediu uma nova autorização. Reconecte a conta e tente novamente.');
                }

                if (attempt < maxPollAttempts) {
                    onStatusUpdate({
                        step: 'connecting',
                        message: 'Banco processando atualização...',
                        progress: Math.min(20 + attempt, 35)
                    });

                    await sleep(getPollingDelay(attempt));
                }
            }

            if (!itemUpdated) {
                throw new Error('Tempo de atualização do banco expirou. Tente sincronizar novamente em instantes.');
            }

            onStatusUpdate({
                step: 'fetching_accounts',
                message: 'Buscando dados atualizados...',
                progress: 40
            });

            const syncResponse = await apiFetch('/api/pluggy/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    itemId,
                    autoRefresh: false
                }),
                timeout: SYNC_REQUEST_TIMEOUT_MS
            });

            if (syncResponse.ok) {
                const syncData = await readApiPayload(syncResponse) || {};

                onStatusUpdate({
                    step: 'fetching_accounts',
                    message: `${syncData.accounts?.length || 0} contas`,
                    progress: 50
                });

                onStatusUpdate({
                    step: 'fetching_accounts',
                    message: 'Organizando contas...',
                    progress: 65
                });

                const persistResult = await persistPluggySyncData(
                    syncData,
                    syncData.connector || group.connector,
                    (message) => onStatusUpdate({
                        step: 'fetching_accounts',
                        message,
                        progress: 72
                    })
                );

                onStatusUpdate({
                    step: 'done',
                    message: persistResult.partial ? 'Sincronizado com avisos' : 'Sincronizado!',
                    progress: 100
                });

                setTimeout(() => {
                    onStatusUpdate({
                        step: 'idle',
                        message: '',
                        progress: 0
                    });
                }, 3000);

                activeManualSyncsRef.current.delete(itemId);
                fetchAccounts();
            } else {
                const errData = await readApiPayload(syncResponse);
                throw new Error(getApiErrorText(errData, 'Falha na resposta do servidor'));
            }
        } catch (error: any) {
            activeManualSyncsRef.current.delete(itemId);
            onStatusUpdate({
                step: 'error',
                message: error.message || 'Erro na sincronização',
                progress: 0
            });
        }
    };

    const handleConnect = async (
        customCredentials?: Record<string, string>,
        customConnector?: any
    ) => {
        const currentConnector = customConnector || selectedConnector;

        if (!user || !currentConnector) return;

        const connectorCredentials = currentConnector.credentials || [];
        const credsToUse = customCredentials || credentialValues;

        if (!hasCredits) {
            const resetTime = databaseService.getTimeUntilReset();
            showWarning('Créditos esgotados', `Seus créditos renovam em ${resetTime.formatted}.`);
            return;
        }

        const missingFields = connectorCredentials.filter((cred: any) => {
            if (credsToUse[cred.name]?.trim()) return false;
            return true;
        });

        if (missingFields.length > 0 && connectorCredentials.length > 1) {
            console.warn('[Fintech] Prosseguindo com CPF apenas - outros campos serão tratados pelo Pluggy');
        }

        const creditResult: { success: boolean; error?: string } = { success: true };

        if (!creditResult.success) {
            showError('Erro', creditResult.error || 'Erro ao consumir crédito.');
            return;
        }

        setConnecting(true);
        setIsModalVisible(false);
        setConnectionStep('connecting');
        setConnectionProgress(5);
        setConnectionStatusText('Criando conexão com o banco...');

        const sanitizedCredentials = {
            ...credsToUse
        };

        connectorCredentials.filter(isDocumentCredential).forEach((cred: any) => {
            if (sanitizedCredentials[cred.name]) {
                sanitizedCredentials[cred.name] = sanitizedCredentials[cred.name].replace(/\D/g, '');
            }
        });

        openedOAuthUrlRef.current = false;

        try {
            const token = await user.getIdToken();

            const createResponse = await apiFetch('/api/pluggy/create-item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    connectorId: currentConnector.id,
                    credentials: sanitizedCredentials,
                    appRedirectUri: OAUTH_REDIRECT_URI,
                    oauthRedirectUri: OAUTH_REDIRECT_URI,
                    webhookUrl: BACKEND_WEBHOOK_URL
                }),
                timeout: 90000
            });

            const createData = await readApiPayload(createResponse) || {};

            if (!createResponse.ok) {
                setConnectionError(createData.error || 'Falha ao criar item no servidor');
                setConnectionStep('error');
                setPendingItemId(null);
                setIsModalVisible(false);

                await clearPersistedOpenFinanceState();

                setTimeout(() => setConnectionStep('info'), 5000);
                return;
            }

            const createItemOAuthUrl = getItemOAuthUrl(createData);
            const itemId = createData.item?.id;

            if (!itemId) {
                setConnectionError('O servidor não retornou o ID da conexão.');
                setConnectionStep('error');
                setPendingItemId(null);
                setIsModalVisible(false);

                await clearPersistedOpenFinanceState();

                setTimeout(() => setConnectionStep('info'), 5000);
                return;
            }

            setPendingItemId(itemId);

            await savePendingConnectionState(itemId, currentConnector, 'creating');

            if (createItemOAuthUrl) {
                try {
                    openedOAuthUrlRef.current = true;
                    setConnectionStep('oauth_pending');
                    setConnectionStatusText('Redirecionando para o banco...');

                    await sleep(Platform.OS === 'ios' ? 250 : 1000);
                    await openOAuthUrlSafely(createItemOAuthUrl);
                } catch (openError: any) {
                    setConnectionError(openError?.message || 'Não foi possível abrir o app do banco.');
                    setConnectionStep('error');
                    setPendingItemId(null);
                    setIsModalVisible(false);

                    await clearPersistedOpenFinanceState();

                    setTimeout(() => setConnectionStep('info'), 5000);
                }
            } else {
                setConnectionStep('oauth_pending');
                setConnectionStatusText('Aguardando você autorizar no banco...');
            }
        } catch (error: any) {
            setConnectionError(error?.message || 'Erro de conexão na internet');
            setConnectionStep('error');
            setPendingItemId(null);
            setIsModalVisible(false);

            await clearPersistedOpenFinanceState();

            setTimeout(() => setConnectionStep('info'), 5000);
        } finally {
            setConnecting(false);
        }
    };

    const sortedConnectors = useMemo(() => [...connectors].sort((a, b) => {
        const priorityA = getBankPriority(a.name);
        const priorityB = getBankPriority(b.name);

        if (priorityA === priorityB) {
            return a.name.localeCompare(b.name);
        }

        return priorityA - priorityB;
    }), [connectors]);

    const displayConnectors = useMemo(() => {
        const normalizedQuery = normalizeConnectorSearchKey(searchQuery);

        if (!normalizedQuery) return sortedConnectors;

        return sortedConnectors.filter((connector) =>
            normalizeConnectorSearchKey(connector.name).includes(normalizedQuery)
        );
    }, [searchQuery, sortedConnectors]);

    const banksListMaxHeight = Math.max(
        isShortPhone ? 260 : 320,
        Math.floor(height * 0.75) - (isShortPhone ? 190 : 178)
    );

    const confirmFlowTranslateX = confirmFlowProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [-6, 74],
    });

    const confirmFlowOpacity = confirmFlowProgress.interpolate({
        inputRange: [0, 0.12, 0.84, 1],
        outputRange: [0, 1, 1, 0],
    });

    const confirmFlowScale = confirmFlowProgress.interpolate({
        inputRange: [0, 0.18, 0.82, 1],
        outputRange: [0.72, 1, 1, 0.72],
    });

    const shouldShowConnectorsNetworkError =
        !loadingConnectors &&
        displayConnectors.length === 0 &&
        Boolean(connectorsFetchError);

    const filteredAccounts = useMemo(() => {
        const checkingGroups: Record<string, any[]> = {};
        const otherAccounts: any[] = [];

        accounts.forEach((acc) => {
            const isChecking = acc.type === 'BANK' || acc.subtype === 'CHECKING_ACCOUNT';

            if (isChecking && acc.number) {
                const connectorId = acc.connector?.id || acc.connectorId || 'unknown';
                const cleanNumber = String(acc.number).replace(/\D/g, '');
                const last4 = cleanNumber.slice(-4);

                if (!last4) {
                    otherAccounts.push(acc);
                    return;
                }

                const key = `${connectorId}-${last4}`;

                if (!checkingGroups[key]) checkingGroups[key] = [];
                checkingGroups[key].push(acc);
            } else {
                otherAccounts.push(acc);
            }
        });

        const bestCheckingAccounts = Object.values(checkingGroups).map((group) => {
            if (group.length === 1) return group[0];

            group.sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0));

            return group[0];
        });

        return [
            ...otherAccounts,
            ...bestCheckingAccounts
        ];
    }, [accounts]);

    const groupedAccounts = filteredAccounts.reduce((acc, account) => {
        const connectorName = account.connector?.name || account.name || 'Outros';

        if (!acc[connectorName]) {
            acc[connectorName] = {
                connector: account.connector,
                accounts: []
            };
        }

        acc[connectorName].accounts.push(account);

        return acc;
    }, {} as Record<string, any>);

    const renderModalContent = () => {
        switch (connectionStep) {
            case 'banks':
                if (loadingConnectors && displayConnectors.length === 0) {
                    return (
                        <IosCoreLoader style={{ minHeight: 400 }} />
                    );
                }

                if (shouldShowConnectorsNetworkError) {
                    return (
                        <Reanimated.View
                            entering={FadeIn.duration(180).springify().damping(16).stiffness(195)}
                            exiting={FadeOut.duration(120)}
                            style={styles.connectorsErrorContainer}
                        >
                            <View pointerEvents="none" style={styles.cardBlurLayer}>
                                <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                            </View>

                            <View pointerEvents="none" style={styles.cardTint}>
                                <LinearGradient
                                    colors={[
                                        'rgba(255,255,255,0.02)',
                                        'rgba(20,20,20,0.04)',
                                        'rgba(0,0,0,0.12)',
                                    ]}
                                    locations={[0, 0.48, 1]}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            </View>

                            <Text style={styles.connectorsErrorTitle}>Falha na comunicação</Text>
                            <Text style={styles.connectorsErrorText}>{connectorsFetchError}</Text>

                            <TouchableOpacity
                                style={styles.connectorsRetryButton}
                                onPress={() => fetchConnectors({ force: true })}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.connectorsRetryButtonText}>Tentar novamente</Text>
                            </TouchableOpacity>
                        </Reanimated.View>
                    );
                }

            default:
                return (
                    <FlatList
                        style={[styles.banksListContainer, { height: banksListMaxHeight }]}
                        contentContainerStyle={[
                            styles.banksListContent,
                            { paddingHorizontal: horizontalPadding },
                            isShortPhone && styles.banksListContentShort
                        ]}
                        data={displayConnectors}
                        keyExtractor={(item, index) => `${item.id || item.name}-${index}`}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        bounces
                        alwaysBounceVertical={false}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={14}
                        maxToRenderPerBatch={12}
                        updateCellsBatchingPeriod={40}
                        windowSize={7}
                        removeClippedSubviews={Platform.OS === 'android'}
                        getItemLayout={(_, index) => ({
                            length: BANK_ROW_HEIGHT,
                            offset: BANK_ROW_HEIGHT * index,
                            index,
                        })}
                        ListEmptyComponent={(
                            <Text style={[styles.emptyText, { padding: 20 }]}>
                                Nenhum banco encontrado
                            </Text>
                        )}
                        renderItem={({ item, index }) => {
                            const isUnhealthy = unhealthyBankIds.has(String(item.id));

                            return (
                                <View
                                    style={[
                                        styles.banksVirtualizedRow,
                                        index === 0 && styles.banksVirtualizedRowFirst,
                                        index === displayConnectors.length - 1 && styles.banksVirtualizedRowLast,
                                    ]}
                                >
                                    <ConnectorCard
                                        item={item}
                                        index={index}
                                        onSelect={handleSelectConnector}
                                        styles={styles}
                                        isUnhealthy={isUnhealthy}
                                    />
                                    {index < displayConnectors.length - 1 && (
                                        <View style={styles.banksRowDivider} />
                                    )}
                                </View>
                            );
                        }}
                    />
                );
        }
    };

    return (
        <View style={styles.mainContainer}>
            <View style={StyleSheet.absoluteFill}>
                <UniversalBackground
                    backgroundColor="#0A0A0A"
                    glowSize={350}
                    showParticles={true}
                    particleCount={15}
                />
            </View>

            <View
                style={[
                    styles.container,
                    {
                        paddingTop: Math.max(insets.top + (isShortPhone ? 10 : 14), isShortPhone ? 44 : 56)
                    }
                ]}
            >
                <Reanimated.View
                    style={[
                        styles.header,
                        isNarrowPhone && styles.headerCompact,
                        headerAnimatedStyle
                    ]}
                >
                    <View style={styles.headerLeft}>
                        <View style={[styles.headerIconShell, isNarrowPhone && styles.headerIconShellCompact]}>
                            <Image
                                source={require('../../assets/images/icon.png')}
                                style={[styles.headerIcon, isNarrowPhone && styles.headerIconCompact]}
                                resizeMode="contain"
                            />
                        </View>

                        <Text
                            style={[styles.title, isNarrowPhone && styles.titleCompact]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                        >
                            Contas Bancárias
                        </Text>
                    </View>

                    <View style={styles.headerRight}>
                        {user && (
                            <SyncCreditsDisplay
                                userId={user.uid}
                                compact
                                onConnect={() => setShowCreateChoiceModal(true)}
                                connectDisabled={!hasCredits}
                            />
                        )}
                    </View>
                </Reanimated.View>

                <Reanimated.View style={[styles.content, contentAnimatedStyle]}>
                    {loading ? (
                        <IosCoreLoader />
                    ) : (
                        <ScrollView
                            style={styles.accountsScroll}
                            contentContainerStyle={[
                                styles.accountsScrollContent,
                                { paddingHorizontal: horizontalPadding },
                                isShortPhone && styles.accountsScrollContentShort,
                                accounts.length === 0 && styles.accountsScrollContentEmpty
                            ]}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    tintColor="#D97757"
                                />
                            }
                        >
                            {accounts.length === 0 ? (
                                <EmptyAccountsState styles={styles} />
                            ) : (
                                Object.values(groupedAccounts).map((group: any, index) => {
                                    const groupItemId =
                                        group.accounts?.[0]?.pluggyItemId ||
                                        group.accounts?.[0]?.itemId ||
                                        group.connector?.id ||
                                        `bank-${index}`;

                                    return (
                                        <Reanimated.View
                                            key={`${groupItemId}-${dataRefreshKey}`}
                                            layout={BANK_CARD_IOS_LAYOUT}
                                            entering={BANK_CARD_ENTER.delay(index * 45)}
                                            exiting={BANK_CARD_EXIT}
                                            collapsable={false}
                                            onTouchStart={triggerBankCardMorph}
                                            onStartShouldSetResponderCapture={() => {
                                                triggerBankCardMorph();
                                                return false;
                                            }}
                                            style={styles.bankCardMorphWrapper}
                                        >
                                            <ConnectedBankCard
                                                group={group}
                                                onDelete={handleRequestDelete}
                                                onSync={handleSyncBank}
                                                hasCredits={hasCredits}
                                                canSyncItem={canSyncItem}
                                                onConsumeCredit={consumeCredit}
                                                hiddenAccountIds={(profile?.preferences as any)?.hiddenAccountIds}
                                                onToggleVisibility={handleToggleVisibility}
                                                onStatusChange={handleBankSyncStatusChange}
                                                onCreateManualCard={(g) => setSubAccountModalConfig({ visible: true, mode: 'CREDIT_CARD', connector: g.connector })}
                                                onCreateManualSavings={(g) => setSubAccountModalConfig({ visible: true, mode: 'SAVINGS', connector: g.connector })}
                                                onEditManualSubAccount={(acc) => setEditSubAccountConfig({ visible: true, account: acc })}
                                            />
                                        </Reanimated.View>
                                    );
                                })
                            )}
                        </ScrollView>
                    )}
                </Reanimated.View>

                <ConnectAccountModal
                    visible={isModalVisible}
                    onClose={handleCloseModal}
                    onDismiss={handleConnectAccountModalDismiss}
                    title={
                        connectionStep === 'banks'
                            ? 'Selecione o seu banco'
                            : connectionStep === 'connecting'
                                ? 'Conectando'
                                : connectionStep === 'oauth_pending'
                                    ? 'Autorização'
                                    : connectionStep === 'success'
                                        ? 'Sucesso!'
                                        : 'Erro'
                    }
                    subtitle={
                        connectionStep === 'banks'
                            ? 'Escolha a instituição que deseja conectar'
                            : undefined
                    }
                    warningText={
                        connectionStep === 'connecting' || connectionStep === 'oauth_pending'
                            ? 'Pode demorar alguns minutos. Você pode sair — será notificado ao concluir.'
                            : undefined
                    }
                    connectionStep={connectionStep}
                    banksCount={displayConnectors.length}
                    isBanksLoading={loadingConnectors}
                    credentialsCount={selectedConnector?.credentials?.length || 0}
                    onBack={connectionStep === 'credentials' ? () => setConnectionStep('banks') : undefined}
                    scrollable={connectionStep !== 'banks'}
                    searchElement={
                        connectionStep === 'banks' ? (
                            <SearchInputShell
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                styles={styles}
                            />
                        ) : undefined
                    }
                >
                    {renderModalContent()}
                </ConnectAccountModal>

                <ModalPadrao
                    visible={showCpfModal}
                    onClose={handleCloseCpfModal}
                    title={cpfModalStep === 'cpf' ? 'Confirme seu CPF' : 'Confirmar'}
                    presentation="bottom"
                    size="md"
                    maxWidth={Math.min(390, width - 24)}
                    scrollable={false}
                    enableDragToClose={true}
                    footer={
                        cpfModalStep === 'cpf' ? (
                            <View style={{ paddingTop: 10 }}>
                                <TouchableOpacity
                                    style={[
                                        styles.cpfModalFooterButton,
                                        styles.cpfModalConfirmButton,
                                        cpfInput.length < 14 && styles.cpfModalConfirmButtonDisabled
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={handleConfirmCpf}
                                    disabled={cpfInput.length < 14}
                                >
                                    <Text
                                        style={[
                                            styles.cpfModalConfirmButtonText,
                                            cpfInput.length < 14 && styles.cpfModalConfirmButtonTextDisabled
                                        ]}
                                    >
                                        Avançar
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={{ paddingTop: 10 }}>
                                <TouchableOpacity
                                    style={[styles.cpfModalFooterButton, styles.cpfModalConfirmButton]}
                                    activeOpacity={0.7}
                                    onPress={handleStartConnection}
                                >
                                    <Text style={styles.cpfModalConfirmButtonText}>Confirmar</Text>
                                </TouchableOpacity>
                            </View>
                        )
                    }
                >
                    {cpfModalStep === 'cpf' ? (
                        <>
                            <Text style={styles.cpfModalSubtitle}>
                                Para continuar com {cpfConnector?.name || 'o banco selecionado'}, informe seu CPF.
                            </Text>

                            <View style={styles.cpfSectionCard}>
                                <TextInput
                                    style={styles.cpfInput}
                                    placeholder="CPF"
                                    placeholderTextColor="#555"
                                    keyboardType="number-pad"
                                    maxLength={14}
                                    value={cpfInput}
                                    onChangeText={(text) => setCpfInput(formatCPF(text))}
                                    autoFocus
                                />
                            </View>
                        </>
                    ) : (
                        <>
                            <View style={styles.confirmLogosRow}>
                                <View style={styles.confirmEndpointColumn}>
                                    <Text style={styles.confirmEndpointLabel} numberOfLines={1}>
                                        {cpfConnector?.name || 'Banco'}
                                    </Text>
                                    <Animated.View
                                        style={[
                                            styles.confirmLogoCircle,
                                            {
                                                transform: [{ scale: confirmLogoScale }],
                                                opacity: confirmLogoOpacity
                                            }
                                        ]}
                                    >
                                        <View style={styles.confirmLogoInner}>
                                            <BankConnectorLogo
                                                connector={cpfConnector}
                                                size={34}
                                                borderRadius={17}
                                                backgroundColor="transparent"
                                                showBorder={false}
                                            />
                                        </View>
                                    </Animated.View>
                                </View>

                                <Animated.View
                                    style={[
                                        styles.confirmFlowTrack,
                                        {
                                            opacity: confirmLogoOpacity
                                        }
                                    ]}
                                >
                                    <View style={styles.confirmFlowLine} />
                                    <Animated.View
                                        style={[
                                            styles.confirmFlowDot,
                                            {
                                                opacity: confirmFlowOpacity,
                                                transform: [
                                                    { translateX: confirmFlowTranslateX },
                                                    { scale: confirmFlowScale },
                                                ],
                                            },
                                        ]}
                                    />
                                </Animated.View>

                                <View style={styles.confirmEndpointColumn}>
                                    <Text style={styles.confirmEndpointLabel}>Controlar</Text>
                                    <Animated.View
                                        style={[
                                            styles.confirmAppLogoCircle,
                                            {
                                                transform: [{ scale: confirmLogoScale }],
                                                opacity: confirmLogoOpacity
                                            }
                                        ]}
                                    >
                                        <View style={styles.confirmLogoInner}>
                                            <Image
                                                source={require('@/assets/images/logo.png')}
                                                style={styles.confirmAppLogoImage}
                                                resizeMode="contain"
                                            />
                                        </View>
                                    </Animated.View>
                                </View>
                            </View>

                            <View style={styles.confirmSummaryCard}>
                                <View style={styles.confirmSummaryRow}>
                                    <Text style={styles.confirmSummaryLabel}>Banco</Text>
                                    <Text style={styles.confirmSummaryValue}>
                                        {cpfConnector?.name || 'Banco'}
                                    </Text>
                                </View>

                                <View style={styles.confirmSummarySeparator} />

                                <View style={styles.confirmSummaryRow}>
                                    <Text style={styles.confirmSummaryLabel}>CPF</Text>
                                    <Text style={styles.confirmSummaryValue}>
                                        {cpfInput.replace(/\d{3}\.\d{3}/, '•••.•••')}
                                    </Text>
                                </View>

                                <View style={styles.confirmSummarySeparator} />

                                <View style={styles.confirmSummaryRow}>
                                    <Text style={styles.confirmSummaryLabel}>Dados</Text>
                                    <Text style={styles.confirmSummaryValue}>
                                        Contas e transações
                                    </Text>
                                </View>
                            </View>

                            <Text style={styles.confirmDisclaimer}>
                                Ao confirmar, seus dados serão sincronizados de forma segura via Open Finance.
                            </Text>
                        </>
                    )}
                </ModalPadrao>

                <AnimatedInlineBanner
                    show={
                        deleteModalVisible ||
                        bankSyncBanner.step !== 'idle' ||
                        (
                            ['connecting', 'oauth_pending', 'success', 'error'].includes(connectionStep) &&
                            !isModalVisible
                        )
                    }
                    step={
                        deleteModalVisible
                            ? 'error'
                            : bankSyncBanner.step !== 'idle'
                                ? bankSyncBanner.step
                                : connectionStep
                    }
                    error={
                        deleteModalVisible
                            ? `Excluir ${itemToDelete?.connector?.name || 'Conta'}?`
                            : bankSyncBanner.step !== 'idle'
                                ? bankSyncBanner.error
                                : connectionError
                    }
                    statusText={bankSyncBanner.step !== 'idle' ? bankSyncBanner.statusText : connectionStatusText}
                    actions={
                        deleteModalVisible
                            ? {
                                cancelLabel: 'Cancelar',
                                confirmLabel: 'Excluir',
                                onCancel: () => {
                                    setDeleteModalVisible(false);
                                    setItemToDelete(null);
                                },
                                onConfirm: handleConfirmDelete,
                                disabled: deleteInProgress
                            }
                            : undefined
                    }
                />

                <CreateAccountChoiceModal
                    visible={showCreateChoiceModal}
                    onClose={() => setShowCreateChoiceModal(false)}
                    onSelectManual={() => setShowManualBankAccountModal(true)}
                    onSelectConnect={handleOpenModal}
                    credits={credits?.credits}
                    unlimited={credits?.unlimited}
                />

                {showManualBankAccountModal && (
                    <ManualBankAccountModal
                        visible={showManualBankAccountModal}
                        onClose={() => setShowManualBankAccountModal(false)}
                        onSubmit={handleCreateManualBankAccount}
                    />
                )}

                {subAccountModalConfig.visible && (
                    <ManualSubAccountModal
                        visible={subAccountModalConfig.visible}
                        mode={subAccountModalConfig.mode}
                        onClose={() => setSubAccountModalConfig({ visible: false, mode: null, connector: null })}
                        onSubmit={handleCreateManualSubAccount}
                    />
                )}

                {editSubAccountConfig.visible && editSubAccountConfig.account && (
                    <ManualSubAccountModal
                        visible={editSubAccountConfig.visible}
                        mode={(editSubAccountConfig.account.type === 'CREDIT' || editSubAccountConfig.account.type === 'CREDIT_CARD' || editSubAccountConfig.account.subtype === 'CREDIT_CARD') ? 'CREDIT_CARD' : 'SAVINGS'}
                        isEditing={true}
                        initialData={{
                            id: editSubAccountConfig.account.id,
                            accountName: editSubAccountConfig.account.name || '',
                            balanceOrLimit: (editSubAccountConfig.account.type === 'CREDIT' || editSubAccountConfig.account.type === 'CREDIT_CARD' || editSubAccountConfig.account.subtype === 'CREDIT_CARD') 
                                ? (editSubAccountConfig.account.creditLimit || 0)
                                : (editSubAccountConfig.account.balance || 0),
                            dueDate: editSubAccountConfig.account.dueDate,
                            closeDate: editSubAccountConfig.account.closeDate,
                        }}
                        onClose={() => setEditSubAccountConfig({ visible: false, account: null })}
                        onSubmit={handleEditManualSubAccount}
                    />
                )}
            </View>
        </View>
    );
}

const getBankPriority = (name: string): number => {
    return 0;
};

const formatCPF = (value: string) =>
    value
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
        .slice(0, 14);

const credentialHasCpf = (cred: any) =>
    /cpf|documento/i.test(cred.label || cred.name || '');

const credentialHasCnpj = (cred: any) =>
    /cnpj/i.test(cred.label || cred.name || '');

const isDocumentCredential = (cred: any) =>
    credentialHasCpf(cred) || credentialHasCnpj(cred);

const SearchInputShell = ({ searchQuery, setSearchQuery, styles }: any) => {
    const entranceStyle = useElasticEntrance(40, 10);
    const press = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            {
                scaleX: interpolate(press.value, [0, 1], [1, 0.988], Extrapolation.CLAMP),
            },
            {
                scaleY: interpolate(press.value, [0, 1], [1, 1.026], Extrapolation.CLAMP),
            },
        ],
    }));

    return (
        <Reanimated.View style={[styles.searchContainer, entranceStyle, animatedStyle]}>
            <Search size={18} color="#7A7A7A" style={styles.searchIcon} />

            <TextInput
                style={styles.searchInput}
                placeholder="Buscar banco..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="never"
                onFocus={() => {
                    press.value = withSpring(1, PRESS_SPRING);
                }}
                onBlur={() => {
                    press.value = withSpring(0, PRESS_SPRING);
                }}
            />
        </Reanimated.View>
    );
};

const EmptyAccountsState = ({ styles }: any) => {
    const entranceStyle = useElasticEntrance(120, 18);

    return (
        <Reanimated.View style={[styles.emptyState, entranceStyle]}>
            <Text style={styles.emptyTitle}>
                Nenhuma conta
            </Text>

            <Text style={styles.emptyDescription}>
                Conecte uma conta para ver seu saldo.
            </Text>
        </Reanimated.View>
    );
};

const ConnectorCard = ({ item, index, onSelect, styles, isUnhealthy }: any) => {
    const press = useSharedValue(0);

    const cardStyle = useAnimatedStyle(() => {
        const stretchX = interpolate(press.value, [0, 1], [1, 0.988], Extrapolation.CLAMP);
        const stretchY = interpolate(press.value, [0, 1], [1, 1.026], Extrapolation.CLAMP);

        return {
            transform: [
                { scaleX: stretchX },
                { scaleY: stretchY },
            ],
        };
    });

    const chevronStyle = useAnimatedStyle(() => ({
        opacity: interpolate(press.value, [0, 1], [0.5, 1], Extrapolation.CLAMP),
        transform: [
            {
                translateX: interpolate(press.value, [0, 1], [0, 2], Extrapolation.CLAMP),
            },
            {
                scale: interpolate(press.value, [0, 1], [1, 0.92], Extrapolation.CLAMP),
            },
        ],
    }));

    const showWarning = !!isUnhealthy;

    return (
        <Reanimated.View
            entering={FadeInDown
                .springify()
                .damping(16)
                .stiffness(195)
                .mass(1.05)
                .delay(Math.min(index * BANK_ROW_ANIMATION_DELAY_MS, BANK_ROW_ANIMATION_MAX_DELAY_MS))}
            exiting={FadeOut.duration(120)}
            layout={LinearTransition.springify()
                .damping(15)
                .stiffness(185)
                .mass(1.08)}
        >
            <AnimatedTouchableOpacity
                onPress={showWarning ? undefined : () => onSelect(item)}
                onPressIn={() => {
                    if (showWarning) return;
                    press.value = withSpring(1, PRESS_SPRING);
                }}
                onPressOut={() => {
                    if (showWarning) return;
                    press.value = withSpring(0, PRESS_SPRING);
                }}
                style={[styles.bankListRow, cardStyle, showWarning && styles.bankListRowWarning]}
                activeOpacity={showWarning ? 1 : 0.88}
                disabled={showWarning}
            >
            <View style={styles.bankListLogoContainer}>
                <View style={styles.bankListLogoBubble}>
                    <BankConnectorLogo
                        connector={item}
                        size={26}
                        borderRadius={13}
                        backgroundColor="transparent"
                        showBorder={false}
                    />
                </View>
            </View>

            <View style={styles.bankRowTitleContainer}>
                <Text style={[styles.bankRowTitle, showWarning && styles.bankRowTitleWarning]} numberOfLines={1}>
                    {item.name}
                </Text>
                {showWarning && (
                    <View style={styles.bankWarningBadge}>
                        <Text style={styles.bankWarningText}>Instável</Text>
                    </View>
                )}
            </View>

            {showWarning ? (
                <View style={styles.bankLockedIcon}>
                    <Lock size={14} color="#6F6F76" strokeWidth={1.8} />
                </View>
            ) : (
                <Reanimated.View style={chevronStyle}>
                    <ChevronRight size={18} color="#6F6F76" />
                </Reanimated.View>
            )}
            </AnimatedTouchableOpacity>
        </Reanimated.View>
    );
};

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: '#0A0A0A'
    },

    container: {
        flex: 1,
        paddingTop: 60
    },

    header: {
        marginBottom: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20
    },

    headerCompact: {
        paddingHorizontal: 12,
        marginBottom: 14,
    },

    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
        paddingRight: 8,
    },

    headerIconShell: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: 'transparent',
        borderWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },

    headerIconShellCompact: {
        width: 34,
        height: 34,
        borderRadius: 9,
    },

    headerIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
    },

    headerIconCompact: {
        width: 34,
        height: 34,
        borderRadius: 9,
    },

    title: {
        fontSize: 18,
        fontFamily: 'AROneSans_400Regular',
        color: '#E5E5E5',
        letterSpacing: 0,
        flexShrink: 1,
    },

    titleCompact: {
        fontSize: 16,
    },

    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
    },

    headerCreateButton: {
        backgroundColor: '#1E1E1E',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#2D2D2D',
        alignItems: 'center',
        justifyContent: 'center',
    },

    headerCreateButtonText: {
        color: '#E5E5E5',
        fontSize: 13,
        fontWeight: '600',
        fontFamily: 'AROneSans_400Regular',
    },

    content: {
        flex: 1
    },

    banksListContainer: {
        flex: 1,
        marginTop: 10
    },

    banksListContent: {
        paddingBottom: 40,
        paddingHorizontal: 20,
    },

    banksListContentShort: {
        paddingBottom: 24,
    },

    banksGroupCard: {
        backgroundColor: '#171717',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        overflow: 'hidden',
    },

    banksVirtualizedRow: {
        backgroundColor: '#171717',
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        overflow: 'hidden',
    },

    banksVirtualizedRowFirst: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
    },

    banksVirtualizedRowLast: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 14,
    },

    banksRowDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
        marginLeft: 0,
        marginRight: 0,
    },

    connectorsErrorContainer: {
        backgroundColor: '#111111',
        borderRadius: 24,
        padding: 16,
        alignItems: 'center',
        marginHorizontal: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#2B2B2B',
    },

    connectorsErrorTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
        zIndex: 4,
    },

    connectorsErrorText: {
        color: '#909090',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginTop: 8,
        zIndex: 4,
    },

    connectorsRetryButton: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        marginTop: 16,
        alignItems: 'center',
        width: '100%',
        zIndex: 4,
    },

    connectorsRetryButtonText: {
        color: '#000000',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular'
    },

    bankListRow: {
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderRadius: 0,
        overflow: 'hidden',
        backgroundColor: '#171717',
        borderWidth: 0,
        elevation: 0,
    },

    cardBlurLayer: {
        ...StyleSheet.absoluteFill,
        zIndex: 0,
        overflow: 'hidden',
    },

    cardTint: {
        ...StyleSheet.absoluteFill,
        zIndex: 1,
        opacity: 0.92,
        backgroundColor: 'rgba(16, 16, 16, 0.92)',
    },

    cardRightGlow: {
        position: 'absolute',
        top: -20,
        right: -46,
        width: 132,
        height: 88,
        borderRadius: 999,
        overflow: 'hidden',
        zIndex: 2,
    },

    bankListLogoContainer: {
        marginRight: 14,
        zIndex: 4,
    },

    bankListLogoBubble: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#222222',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 0,
        overflow: 'hidden',
    },

    bankRowTitle: {
        flex: 1,
        fontSize: 15,
        color: '#F2F2F2',
        fontFamily: 'AROneSans_400Regular',
        zIndex: 4,
    },

    bankListRowWarning: {
        backgroundColor: '#171717',
        opacity: 0.58,
    },

    bankRowTitleContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginRight: 8,
    },

    bankRowTitleWarning: {
        color: '#A9A9AD',
    },

    bankWarningBadge: {
        backgroundColor: '#252525',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 5,
        borderWidth: 0,
    },

    bankWarningText: {
        color: '#8E8E93',
        fontSize: 9,
        fontFamily: 'AROneSans_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    bankLockedIcon: {
        width: 22,
        alignItems: 'flex-end',
    },

    bankCardMorphWrapper: {
        marginBottom: 12,
        backgroundColor: 'transparent',
        borderWidth: 0,
        overflow: 'visible',
    },

    statusContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        minHeight: 400
    },

    statusIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24
    },

    statusTitle: {
        color: '#E5E5E5',
        fontSize: 22,
        fontFamily: 'AROneSans_400Regular',
        marginBottom: 12,
        textAlign: 'center'
    },

    statusText: {
        color: '#909090',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 24,
        fontFamily: 'AROneSans_400Regular'
    },

    stepContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 12,
        marginTop: 24,
        width: '100%'
    },

    emptyText: {
        color: '#8E8E93',
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 18,
        maxWidth: 232,
        fontFamily: 'AROneSans_400Regular'
    },

    accountsScroll: {
        flex: 1
    },

    accountsScrollContent: {
        paddingBottom: 120,
        paddingHorizontal: 16,
        paddingTop: 4
    },

    accountsScrollContentShort: {
        paddingBottom: 84,
    },

    accountsScrollContentEmpty: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingTop: 0,
        paddingBottom: 96
    },

    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 42,
        marginHorizontal: 4,
    },

    emptyStateCardBase: {
        ...StyleSheet.absoluteFill,
        zIndex: 0,
        overflow: 'hidden',
    },

    emptyStateTint: {
        ...StyleSheet.absoluteFill,
        zIndex: 1,
        opacity: 0.9,
    },

    emptyIconShell: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        zIndex: 4,
        overflow: 'hidden',
    },

    emptyIconGlow: {
        position: 'absolute',
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(217,119,87,0.16)',
    },

    emptyTitle: {
        fontSize: 17,
        fontFamily: 'AROneSans_400Regular',
        color: '#E5E5E5',
        marginBottom: 6,
        textAlign: 'center',
        zIndex: 4,
    },

    emptyDescription: {
        fontSize: 13,
        color: '#606060',
        textAlign: 'center',
        lineHeight: 18,
        maxWidth: 232,
        fontFamily: 'AROneSans_400Regular',
        zIndex: 4,
    },

    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        alignSelf: 'stretch',
        backgroundColor: '#101010',
        borderRadius: 20,
        paddingHorizontal: 14,
        height: 52,
        marginHorizontal: 0,
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#252525',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
        elevation: 6,
    },

    searchBlurLayer: {
        ...StyleSheet.absoluteFill,
        zIndex: 0,
        overflow: 'hidden',
    },

    searchTintLayer: {
        ...StyleSheet.absoluteFill,
        zIndex: 1,
        opacity: 0.92,
    },

    searchInput: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: 16,
        paddingVertical: 10,
        marginLeft: 8,
        fontFamily: 'AROneSans_400Regular',
        zIndex: 3,
    },

    searchIcon: {
        zIndex: 3,
    },

    cpfModalContent: {
        backgroundColor: '#101010',
        borderColor: '#252525',
    },

    cpfModalHeader: {
        backgroundColor: '#101010',
        borderBottomWidth: 0,
        paddingHorizontal: 20,
    },

    cpfModalBody: {
        backgroundColor: '#101010',
        paddingHorizontal: 20,
        paddingTop: 2,
        paddingBottom: 2,
    },

    cpfModalFooter: {
        backgroundColor: '#101010',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 12,
        borderTopWidth: 0,
    },

    cpfModalTitle: {
        fontSize: 20,
        fontFamily: 'AROneSans_400Regular',
        color: '#E5E5E5',
        fontWeight: '400',
    },

    cpfModalSubtitle: {
        fontSize: 14,
        color: '#606060',
        fontFamily: 'AROneSans_400Regular',
        textAlign: 'left',
        marginBottom: 24,
        lineHeight: 20
    },

    cpfSectionCard: {
        backgroundColor: '#161616',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#252525',
        marginBottom: 4,
        overflow: 'hidden',
    },

    cpfInput: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'AROneSans_400Regular',
        paddingVertical: 14,
        paddingHorizontal: 16
    },

    continuarButton: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 14,
        borderRadius: 18,
        alignItems: 'center'
    },

    continuarButtonDisabled: {
        opacity: 0.3
    },

    continuarButtonText: {
        color: '#000000',
        fontSize: 16,
        fontFamily: 'AROneSans_400Regular'
    },

    cpfModalFooterButton: {
        minHeight: 48,
        alignSelf: 'stretch',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },

    cpfModalConfirmButton: {
        backgroundColor: '#D97757',
    },

    cpfModalConfirmButtonDisabled: {
        backgroundColor: '#262626',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#303030',
    },

    cpfModalCancelButton: {
        backgroundColor: '#19191B',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#29292B',
    },

    cpfModalConfirmButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: 'AROneSans_600SemiBold',
        textAlign: 'center',
    },

    cpfModalConfirmButtonTextDisabled: {
        color: '#777777',
    },

    cpfModalCancelButtonText: {
        color: '#E5E5E5',
        fontSize: 15,
        fontFamily: 'AROneSans_600SemiBold',
        textAlign: 'center',
    },

    confirmLogosRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        marginBottom: 22,
    },

    confirmEndpointColumn: {
        width: 72,
        height: 54,
        alignItems: 'center',
        justifyContent: 'center',
    },

    confirmEndpointLabel: {
        position: 'absolute',
        top: -21,
        maxWidth: 72,
        color: '#727276',
        fontSize: 11,
        lineHeight: 13,
        fontFamily: 'AROneSans_600SemiBold',
        textAlign: 'center',
    },

    confirmLogoCircle: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: '#18181A',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#2C2C2E',
        justifyContent: 'center',
        alignItems: 'center',
    },

    confirmLogoInner: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },

    confirmFlowTrack: {
        width: 80,
        height: 54,
        justifyContent: 'center',
        marginHorizontal: 2,
    },

    confirmFlowLine: {
        width: '100%',
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#343436',
    },

    confirmFlowDot: {
        position: 'absolute',
        left: 0,
        top: 23,
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: '#D97757',
    },

    confirmAppLogoCircle: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: '#18181A',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(217, 119, 87, 0.32)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    confirmAppLogoImage: {
        width: 34,
        height: 34,
        borderRadius: 17,
    },

    confirmSummaryCard: {
        backgroundColor: 'transparent',
        borderRadius: 0,
        paddingVertical: 2,
        marginBottom: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: '#28282A',
    },

    confirmSummaryRow: {
        minHeight: 38,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 8,
    },

    confirmSummaryLabel: {
        fontSize: 13,
        color: '#77777B',
        fontFamily: 'AROneSans_400Regular',
    },

    confirmSummaryValue: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#F4F4F5',
        textAlign: 'right',
        fontFamily: 'AROneSans_600SemiBold',
    },

    confirmSummarySeparator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#242426',
    },

    confirmDisclaimer: {
        alignSelf: 'center',
        maxWidth: 300,
        fontSize: 11.5,
        color: '#77777B',
        textAlign: 'center',
        lineHeight: 16,
        marginBottom: 18,
    },

    confirmConnectButton: {
        backgroundColor: '#D97757',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center'
    },

    confirmConnectButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600'
    },

    actionButton: {
        backgroundColor: '#D97757',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10
    },

    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600'
    }
});
