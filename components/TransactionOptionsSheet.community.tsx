import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

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
    const sheetRef = useRef<BottomSheetMethods>(null);
    const pendingActionRef = useRef<(() => void) | null>(null);

    const finishDismiss = useCallback(() => {
        onVisibleChange(false);

        const pendingAction = pendingActionRef.current;
        pendingActionRef.current = null;
        if (pendingAction) {
            requestAnimationFrame(() => {
                void pendingAction();
            });
        }
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
        <BottomSheet
            ref={sheetRef}
            index={-1}
            enablePanDownToClose
            enableDynamicSizing
            backgroundStyle={{ backgroundColor: '#111111' }}
            onDismiss={finishDismiss}
        >
            <BottomSheetView>
                <TransactionOptionsSheetContent
                    transaction={transaction}
                    onMoveInvoice={handleMoveInvoice}
                    onDelete={handleDelete}
                    onRefund={onRefund ? handleRefund : undefined}
                    moveOptions={moveOptions}
                    onChangeCategory={onChangeCategory ? handleChangeCategory : undefined}
                    loading={loading}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
