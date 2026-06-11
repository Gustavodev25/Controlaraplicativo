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
import React, { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';

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
    const { width } = useWindowDimensions();

    const handleDismiss = useCallback(() => {
        onVisibleChange(false);
    }, [onVisibleChange]);

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
                        <ClosingDateSheetContent
                            items={items}
                            bankName={bankName}
                            originalCloseDate={originalCloseDate}
                            originalDueDate={originalDueDate}
                            onSave={onSave}
                            onDismiss={handleDismiss}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
