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

import { CategorySelectorSheetContent } from './CategorySelectorSheetContent';
import type { CategorySelectorSheetProps } from './CategorySelectorSheet.types';

export function CategorySelectorSheet({
    visible,
    onVisibleChange,
    onSelect,
    categories,
    loading,
}: CategorySelectorSheetProps) {
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

    const handleSelect = useCallback((categoryKey: string) => {
        dismissWithAction(() => onSelect(categoryKey));
    }, [dismissWithAction, onSelect]);

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
                        <CategorySelectorSheetContent
                            categories={categories}
                            loading={loading}
                            onSelect={handleSelect}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
