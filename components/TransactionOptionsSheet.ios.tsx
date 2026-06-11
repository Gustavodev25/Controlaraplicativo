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

import { TransactionOptionsSheetContent } from './TransactionOptionsSheetContent';
import type { TransactionOptionsSheetProps } from './TransactionOptionsSheet.types';
import type { InvoiceItem } from '@/services/invoiceBuilder';

export function TransactionOptionsSheet({
    visible,
    onVisibleChange,
    transaction,
    onMoveInvoice,
    onDelete,
    onRefund,
    moveOptions,
    onChangeCategory,
    loading,
}: TransactionOptionsSheetProps) {
    const { width } = useWindowDimensions();
    const pendingActionRef = useRef<(() => void) | null>(null);

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
    }, [onVisibleChange]);

    const handleMoveInvoice = useCallback((target: 'prev' | 'next' | 'current' | 'custom', date?: string) => {
        dismissWithAction(() => onMoveInvoice(target, date));
    }, [dismissWithAction, onMoveInvoice]);

    const handleDelete = useCallback((item: InvoiceItem) => {
        dismissWithAction(() => onDelete(item));
    }, [dismissWithAction, onDelete]);

    const handleRefund = useCallback((item: InvoiceItem) => {
        dismissWithAction(() => onRefund && onRefund(item));
    }, [dismissWithAction, onRefund]);

    const handleChangeCategory = useCallback((item: InvoiceItem) => {
        dismissWithAction(() => onChangeCategory && onChangeCategory(item));
    }, [dismissWithAction, onChangeCategory]);

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
                        <TransactionOptionsSheetContent
                            transaction={transaction}
                            onMoveInvoice={handleMoveInvoice}
                            onDelete={handleDelete}
                            onRefund={onRefund ? handleRefund : undefined}
                            moveOptions={moveOptions}
                            onChangeCategory={onChangeCategory ? handleChangeCategory : undefined}
                            loading={loading}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
