import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { InvestmentActionsSheetContent } from './InvestmentActionsSheetContent';
import type { InvestmentActionsSheetProps } from './InvestmentActionsSheet.types';

export function InvestmentActionsSheet({
    visible,
    investmentName,
    onVisibleChange,
    onExtract,
    onMove,
    onEdit,
    onDelete,
}: InvestmentActionsSheetProps) {
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
                <InvestmentActionsSheetContent
                    investmentName={investmentName}
                    onExtractPress={() => dismissWithAction(onExtract)}
                    onMovePress={() => dismissWithAction(onMove)}
                    onEditPress={() => dismissWithAction(onEdit)}
                    onDeletePress={() => dismissWithAction(onDelete)}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
