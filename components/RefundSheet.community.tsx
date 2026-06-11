import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { RefundSheetContent } from './RefundSheetContent';
import type { RefundSheetProps } from './RefundSheet.types';

export function RefundSheet({
    visible,
    onVisibleChange,
    transaction,
    onConfirm,
}: RefundSheetProps) {
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

    const handleDismiss = useCallback(() => {
        sheetRef.current?.dismiss();
    }, []);

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
                <RefundSheetContent
                    transaction={transaction}
                    onConfirm={onConfirm}
                    onDismiss={handleDismiss}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
