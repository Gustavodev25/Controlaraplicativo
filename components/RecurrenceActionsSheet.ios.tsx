import {
    BottomSheet,
    Group,
    Host,
    RNHostView,
} from '@expo/ui/swift-ui';
import {
    presentationBackground,
    presentationDragIndicator,
} from '@expo/ui/swift-ui/modifiers';
import React, { useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';

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
    const { width } = useWindowDimensions();
    const pendingActionRef = useRef<(() => void) | null>(null);
    // Keep the last valid item so the sheet doesn't unmount mid-dismiss
    const lastItemRef = useRef<RecurrenceItem | null>(item);
    if (item) {
        lastItemRef.current = item;
    }

    const displayItem = item ?? lastItemRef.current;

    const dismissWithAction = useCallback((action: () => void) => {
        pendingActionRef.current = action;
        onVisibleChange(false);
    }, [onVisibleChange]);

    const handleDismiss = useCallback(() => {
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
        <Host
            style={{ position: 'absolute', width }}
            pointerEvents={visible ? 'auto' : 'none'}
            colorScheme="dark"
        >
            <BottomSheet
                isPresented={visible}
                onIsPresentedChange={onVisibleChange}
                onDismiss={handleDismiss}
                fitToContents
            >
                <Group
                    modifiers={[
                        presentationBackground('#111111'),
                        presentationDragIndicator('visible'),
                    ]}
                >
                    <RNHostView matchContents>
                        <RecurrenceActionsSheetContent
                            itemName={displayItem.name}
                            itemType={displayItem.type}
                            itemStatus={displayItem.status}
                            onAction={handleAction}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}

