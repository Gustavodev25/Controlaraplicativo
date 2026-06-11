import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { CategorySelectorSheetContent } from './CategorySelectorSheetContent';
import type { CategorySelectorSheetProps } from './CategorySelectorSheet.types';

export function CategorySelectorSheet({
    visible,
    onVisibleChange,
    onSelect,
    categories,
    loading,
}: CategorySelectorSheetProps) {
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

    const handleSelect = useCallback((categoryKey: string) => {
        dismissWithAction(() => onSelect(categoryKey));
    }, [dismissWithAction, onSelect]);

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
                <CategorySelectorSheetContent
                    categories={categories}
                    loading={loading}
                    onSelect={handleSelect}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
