import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { ClosingDateSheetContent } from './ClosingDateSheetContent';
import type { ClosingDateSheetProps } from './ClosingDateSheet.types';

export function ClosingDateSheet({
    visible,
    onVisibleChange,
    onSave,
    items,
    bankName,
    originalCloseDate,
    originalDueDate,
}: ClosingDateSheetProps) {
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
                <ClosingDateSheetContent
                    items={items}
                    bankName={bankName}
                    originalCloseDate={originalCloseDate}
                    originalDueDate={originalDueDate}
                    onSave={onSave}
                    onDismiss={handleDismiss}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
