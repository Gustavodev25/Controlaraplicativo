import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { InvoicePeriodSheetContent } from './InvoicePeriodSheetContent';
import type { InvoicePeriodSheetProps } from './InvoicePeriodSheet.types';
import type { InvoicePeriod } from './types';

export function InvoicePeriodSheet({
    visible,
    onVisibleChange,
    cardName,
    selectedPeriod,
    pastTotal,
    currentTotal,
    totalUsed,
    onPeriodChange,
}: InvoicePeriodSheetProps) {
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

    const handlePeriodChange = useCallback((period: InvoicePeriod) => {
        dismissWithAction(() => onPeriodChange(period));
    }, [dismissWithAction, onPeriodChange]);

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
                <InvoicePeriodSheetContent
                    cardName={cardName}
                    selectedPeriod={selectedPeriod}
                    pastTotal={pastTotal}
                    currentTotal={currentTotal}
                    totalUsed={totalUsed}
                    onPeriodChange={handlePeriodChange}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
