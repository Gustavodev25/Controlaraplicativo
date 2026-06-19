/// <reference types="jest" />

import {
    deleteRecurrenceRecord,
    isRecurrenceSourceCollection,
    isVirtualRecurrenceId,
    resolveRecurrenceSourceCollection
} from '../recurrenceDeletion';

describe('recurrence deletion', () => {
    const createDependencies = () => ({
        deleteFromCollection: jest.fn().mockResolvedValue(undefined),
        addToBlacklist: jest.fn().mockResolvedValue(undefined),
        onLegacyDeleteError: jest.fn()
    });

    test('deletes a subscription from subscriptions and the legacy collection', async () => {
        const dependencies = createDependencies();

        await deleteRecurrenceRecord(
            'subscription-1',
            'subscription',
            undefined,
            dependencies
        );

        expect(dependencies.deleteFromCollection).toHaveBeenNthCalledWith(
            1,
            'subscriptions',
            'subscription-1'
        );
        expect(dependencies.deleteFromCollection).toHaveBeenNthCalledWith(
            2,
            'recurrences',
            'subscription-1'
        );
        expect(dependencies.addToBlacklist).toHaveBeenCalledWith(
            'subscription-1',
            'subscription'
        );
    });

    test('deletes a reminder from reminders and the legacy collection', async () => {
        const dependencies = createDependencies();

        await deleteRecurrenceRecord(
            'reminder-1',
            'reminder',
            undefined,
            dependencies
        );

        expect(dependencies.deleteFromCollection).toHaveBeenNthCalledWith(
            1,
            'reminders',
            'reminder-1'
        );
        expect(dependencies.deleteFromCollection).toHaveBeenNthCalledWith(
            2,
            'recurrences',
            'reminder-1'
        );
        expect(dependencies.addToBlacklist).toHaveBeenCalledWith(
            'reminder-1',
            'reminder'
        );
    });

    test('honors a legacy source without deleting it twice', async () => {
        const dependencies = createDependencies();

        await deleteRecurrenceRecord(
            'legacy-1',
            'subscription',
            'recurrences',
            dependencies
        );

        expect(dependencies.deleteFromCollection).toHaveBeenCalledTimes(1);
        expect(dependencies.deleteFromCollection).toHaveBeenCalledWith(
            'recurrences',
            'legacy-1'
        );
        expect(dependencies.addToBlacklist).toHaveBeenCalledWith(
            'legacy-1',
            'subscription'
        );
    });

    test.each(['auto_1', 'tx_1', 'bill_1', 'detected_netflix_monthly'])(
        'blacklists virtual recurrence %s',
        async recurrenceId => {
            const dependencies = createDependencies();

            await deleteRecurrenceRecord(
                recurrenceId,
                'reminder',
                'reminders',
                dependencies
            );

            expect(dependencies.addToBlacklist).toHaveBeenCalledWith(
                recurrenceId,
                'reminder'
            );
            expect(dependencies.deleteFromCollection).not.toHaveBeenCalled();
        }
    );

    test('does not fail when legacy cleanup fails', async () => {
        const dependencies = createDependencies();
        const legacyError = new Error('legacy delete failed');
        dependencies.deleteFromCollection
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(legacyError);

        await expect(deleteRecurrenceRecord(
            'subscription-2',
            'subscription',
            'subscriptions',
            dependencies
        )).resolves.toBeUndefined();

        expect(dependencies.onLegacyDeleteError).toHaveBeenCalledWith(legacyError);
    });

    test('validates and resolves source collections', () => {
        expect(resolveRecurrenceSourceCollection('subscription')).toBe('subscriptions');
        expect(resolveRecurrenceSourceCollection('reminder')).toBe('reminders');
        expect(resolveRecurrenceSourceCollection('reminder', 'recurrences')).toBe('recurrences');

        expect(isRecurrenceSourceCollection('subscriptions')).toBe(true);
        expect(isRecurrenceSourceCollection('reminders')).toBe(true);
        expect(isRecurrenceSourceCollection('recurrences')).toBe(true);
        expect(isRecurrenceSourceCollection('transactions')).toBe(false);

        expect(isVirtualRecurrenceId('auto_123')).toBe(true);
        expect(isVirtualRecurrenceId('subscription-123')).toBe(false);
    });
});
