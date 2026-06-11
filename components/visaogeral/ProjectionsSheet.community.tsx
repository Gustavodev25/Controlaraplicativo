import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { ProjectionsSheetContent } from './ProjectionsSheetContent';
import type { ProjectionsSheetProps } from './ProjectionsSheet.types';

export function ProjectionsSheet({
    visible,
    onVisibleChange,
    currentSettings,
    onSave,
    salaryPreview,
    valePreview,
    includeOpenFinance,
    onToggleOpenFinance,
}: ProjectionsSheetProps) {
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
                <ProjectionsSheetContent
                    currentSettings={currentSettings}
                    onSave={onSave}
                    salaryPreview={salaryPreview}
                    valePreview={valePreview}
                    includeOpenFinance={includeOpenFinance}
                    onToggleOpenFinance={onToggleOpenFinance}
                    onDismiss={finishDismiss}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
