export type RecurrenceType = 'subscription' | 'reminder';

export type RecurrenceSourceCollection =
    | 'recurrences'
    | 'subscriptions'
    | 'reminders';

export interface RecurrenceDeleteDependencies {
    deleteFromCollection: (
        collectionName: RecurrenceSourceCollection,
        recurrenceId: string
    ) => Promise<void>;
    addToBlacklist: (
        recurrenceId: string,
        type: RecurrenceType
    ) => Promise<void>;
    onLegacyDeleteError?: (error: unknown) => void;
}

export const isRecurrenceSourceCollection = (
    value: unknown
): value is RecurrenceSourceCollection => {
    return value === 'recurrences'
        || value === 'subscriptions'
        || value === 'reminders';
};

export const resolveRecurrenceSourceCollection = (
    type: RecurrenceType,
    sourceCollection?: RecurrenceSourceCollection
): RecurrenceSourceCollection => {
    if (sourceCollection) return sourceCollection;
    return type === 'subscription' ? 'subscriptions' : 'reminders';
};

export const isVirtualRecurrenceId = (recurrenceId: string): boolean => {
    return recurrenceId.startsWith('auto_')
        || recurrenceId.startsWith('tx_')
        || recurrenceId.startsWith('bill_')
        || recurrenceId.startsWith('detected_');
};

export const deleteRecurrenceRecord = async (
    recurrenceId: string,
    type: RecurrenceType,
    sourceCollection: RecurrenceSourceCollection | undefined,
    dependencies: RecurrenceDeleteDependencies
): Promise<void> => {
    if (isVirtualRecurrenceId(recurrenceId)) {
        await dependencies.addToBlacklist(recurrenceId, type);
        return;
    }

    const resolvedCollection = resolveRecurrenceSourceCollection(
        type,
        sourceCollection
    );

    await dependencies.deleteFromCollection(resolvedCollection, recurrenceId);
    await dependencies.addToBlacklist(recurrenceId, type);

    if (resolvedCollection === 'recurrences') return;

    try {
        await dependencies.deleteFromCollection('recurrences', recurrenceId);
    } catch (error) {
        dependencies.onLegacyDeleteError?.(error);
    }
};
