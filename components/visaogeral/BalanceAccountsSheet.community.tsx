import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { BalanceAccountsSheetContent } from './BalanceAccountsSheetContent';
import type { BalanceAccountsSheetProps } from './BalanceAccountsSheet.types';

export function BalanceAccountsSheet({
    visible,
    onVisibleChange,
    userId,
    accounts,
    selectedAccountIds,
    onSave,
}: BalanceAccountsSheetProps) {
    const sheetRef = useRef<BottomSheetMethods>(null);

    const finishDismiss = useCallback(() => {
        onVisibleChange(false);
    }, [onVisibleChange]);

    useEffect(() => {
        if (visible) {
            sheetRef.current?.present();
        } else {
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
                <BalanceAccountsSheetContent
                    userId={userId}
                    accounts={accounts}
                    selectedAccountIds={selectedAccountIds}
                    onSave={onSave}
                    onDismiss={finishDismiss}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
