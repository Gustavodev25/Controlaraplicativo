export type SyncCreditAction = 'connect' | 'sync';

export type SyncCreditsState = {
    credits?: number;
    lastResetDate?: string | null;
    lastSyncDate?: string | null;
    syncedItems?: Record<string, string>;
    connectedItems?: Record<string, string>;
    unlimited?: boolean;
};

export type SyncCreditDecision = {
    success: boolean;
    error?: string;
    remainingCredits?: number;
    unlimited?: boolean;
    nextState?: {
        credits: number;
        lastResetDate: string;
        lastSyncDate: string | null;
        syncedItems: Record<string, string>;
        connectedItems: Record<string, string>;
    };
};

export const consumeSyncCreditState = (
    state: SyncCreditsState | null | undefined,
    action: SyncCreditAction,
    itemId: string | undefined,
    today: string
): SyncCreditDecision => {
    const currentCredits = Number(state?.credits ?? 3);
    const currentSyncedItems = { ...(state?.syncedItems || {}) };
    const currentConnectedItems = { ...(state?.connectedItems || {}) };

    if (state?.unlimited) {
        return {
            success: true,
            remainingCredits: currentCredits,
            unlimited: true,
        };
    }

    if (action === 'connect' && itemId && currentConnectedItems[itemId]) {
        return {
            success: true,
            remainingCredits: currentCredits,
            nextState: {
                credits: currentCredits,
                lastResetDate: today,
                lastSyncDate: state?.lastSyncDate || null,
                syncedItems: currentSyncedItems,
                connectedItems: currentConnectedItems,
            },
        };
    }

    if (currentCredits <= 0) {
        return {
            success: false,
            error: 'Voce nao tem creditos suficientes. Aguarde ate meia-noite para renovar.',
        };
    }

    if (action === 'sync' && itemId && currentSyncedItems[itemId] === today) {
        return {
            success: false,
            error: 'Este banco ja foi sincronizado hoje. Tente novamente amanha.',
        };
    }

    if (action === 'sync' && itemId) {
        currentSyncedItems[itemId] = today;
    }
    if (action === 'connect' && itemId) {
        currentConnectedItems[itemId] = today;
    }

    return {
        success: true,
        remainingCredits: currentCredits - 1,
        nextState: {
            credits: currentCredits - 1,
            lastResetDate: today,
            lastSyncDate: action === 'sync' ? today : (state?.lastSyncDate || null),
            syncedItems: currentSyncedItems,
            connectedItems: currentConnectedItems,
        },
    };
};
