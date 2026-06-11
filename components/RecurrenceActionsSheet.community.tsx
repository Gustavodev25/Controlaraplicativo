import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { RecurrenceActionsSheetContent } from './RecurrenceActionsSheetContent';

interface RecurrenceItem {
    id: string;
    name: string;
    type: 'subscription' | 'reminder';
    status: 'paid' | 'pending' | 'overdue';
}

interface RecurrenceActionsSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    item: RecurrenceItem | null;
    onPay: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

export function RecurrenceActionsSheet({
    visible,
    onVisibleChange,
    item,
    onPay,
    onEdit,
    onDelete,
}: RecurrenceActionsSheetProps) {
    const sheetRef = useRef<BottomSheetMethods>(null);
    const pendingActionRef = useRef<(() => void) | null>(null);
    // Keep the last valid item so the sheet doesn't unmount mid-dismiss
    const lastItemRef = useRef<RecurrenceItem | null>(item);
    if (item) {
        lastItemRef.current = item;
    }

    const displayItem = item ?? lastItemRef.current;

    const finishDismiss = useCallback(() => {
        onVisibleChange(false);

        const pendingAction = pendingActionRef.current;
        pendingActionRef.current = null;
        if (pendingAction) {
            requestAnimationFrame(() => {
                void pendingAction();
            });
        }

        // Clear the stale item after dismiss completes
        lastItemRef.current = null;
    }, [onVisibleChange]);

    const dismissWithAction = useCallback((action: () => void) => {
        pendingActionRef.current = action;

        if (sheetRef.current) {
            sheetRef.current.dismiss();
            return;
        }

        onVisibleChange(false);
        requestAnimationFrame(() => {
            void action();
        });
    }, [onVisibleChange]);

    useEffect(() => {
        if (visible) {
            sheetRef.current?.present();
        } else if (!pendingActionRef.current) {
            sheetRef.current?.dismiss();
        }
    }, [visible]);

    const handleAction = useCallback((action: 'pay' | 'edit' | 'delete') => {
        if (action === 'pay') {
            dismissWithAction(onPay);
        } else if (action === 'edit') {
            dismissWithAction(onEdit);
        } else if (action === 'delete') {
            dismissWithAction(onDelete);
        }
    }, [dismissWithAction, onPay, onEdit, onDelete]);

    if (!displayItem) return null;

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            enablePanDownToClose
            enableDynamicSizing
            backgroundStyle={{ backgroundColor: '#111111' }}
            onDismiss={finishDismiss}
        >
            <BottomSheetView>
                <RecurrenceActionsSheetContent
                    itemName={displayItem.name}
                    itemType={displayItem.type}
                    itemStatus={displayItem.status}
                    onAction={handleAction}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}

