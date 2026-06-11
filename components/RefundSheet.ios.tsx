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

import { RefundSheetContent } from './RefundSheetContent';
import type { RefundSheetProps } from './RefundSheet.types';

export function RefundSheet({
    visible,
    onVisibleChange,
    transaction,
    onConfirm,
}: RefundSheetProps) {
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
                        <RefundSheetContent
                            transaction={transaction}
                            onConfirm={onConfirm}
                            onDismiss={handleDismiss}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
