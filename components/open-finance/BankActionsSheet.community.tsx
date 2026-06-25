import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { BankActionsSheetContent } from './BankActionsSheetContent';
import type { BankActionsSheetProps } from './BankActionsSheet.types';

export function BankActionsSheet({
    visible,
    bankName,
    syncDisabled,
    onVisibleChange,
    onSync,
    onDisconnect,
    isManual,
    onCreateCard,
    onCreateSavings,
}: BankActionsSheetProps) {
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

    const dismissWithAction = useCallback((action?: () => void) => {
        if (!action) {
            onVisibleChange(false);
            return;
        }

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
                <BankActionsSheetContent
                    bankName={bankName}
                    syncDisabled={syncDisabled}
                    isManual={isManual}
                    onSyncPress={() => dismissWithAction(onSync)}
                    onDisconnectPress={() => dismissWithAction(onDisconnect)}
                    onCreateCardPress={() => dismissWithAction(onCreateCard)}
                    onCreateSavingsPress={() => dismissWithAction(onCreateSavings)}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
