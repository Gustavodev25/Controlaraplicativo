import { consumeSyncCreditState } from '../syncCreditsPolicy';

describe('sync credit policy', () => {
    const today = '2026-05-14';

    test('charges connect only when consumption is requested after success', () => {
        const result = consumeSyncCreditState({ credits: 3, syncedItems: {} }, 'connect', undefined, today);

        expect(result.success).toBe(true);
        expect(result.remainingCredits).toBe(2);
        expect(result.nextState).toMatchObject({
            credits: 2,
            lastResetDate: today,
            lastSyncDate: null,
            syncedItems: {},
            connectedItems: {},
        });
    });

    test('charges connect once per item when itemId is provided', () => {
        const first = consumeSyncCreditState({ credits: 3, syncedItems: {} }, 'connect', 'item-1', today);
        expect(first.success).toBe(true);
        expect(first.remainingCredits).toBe(2);
        expect(first.nextState?.connectedItems).toEqual({ 'item-1': today });

        const repeated = consumeSyncCreditState(first.nextState, 'connect', 'item-1', today);
        expect(repeated.success).toBe(true);
        expect(repeated.remainingCredits).toBe(2);
        expect(repeated.nextState?.credits).toBe(2);
    });

    test('charges successful sync and marks item as synced today', () => {
        const result = consumeSyncCreditState({ credits: 2, syncedItems: {} }, 'sync', 'item-1', today);

        expect(result.success).toBe(true);
        expect(result.remainingCredits).toBe(1);
        expect(result.nextState?.syncedItems).toEqual({ 'item-1': today });
        expect(result.nextState?.connectedItems).toEqual({});
        expect(result.nextState?.lastSyncDate).toBe(today);
    });

    test('blocks repeated sync for same item on same day', () => {
        const result = consumeSyncCreditState(
            { credits: 2, syncedItems: { 'item-1': today } },
            'sync',
            'item-1',
            today
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('ja foi sincronizado');
    });

    test('does not charge when there are no credits', () => {
        const result = consumeSyncCreditState({ credits: 0, syncedItems: {} }, 'connect', undefined, today);

        expect(result.success).toBe(false);
        expect(result.nextState).toBeUndefined();
    });
});
