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

import { BankActionsSheetContent } from './BankActionsSheetContent';
import type { BankActionsSheetProps } from './BankActionsSheet.types';

export function BankActionsSheet({
    visible,
    bankName,
    syncDisabled,
    onVisibleChange,
    onSync,
    onDisconnect,
}: BankActionsSheetProps) {
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
                        <BankActionsSheetContent
                            bankName={bankName}
                            syncDisabled={syncDisabled}
                            onSyncPress={() => dismissWithAction(onSync)}
                            onDisconnectPress={() => dismissWithAction(onDisconnect)}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
