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

import { BalanceAccountsSheetContent } from './BalanceAccountsSheetContent';
import type { BalanceAccountsSheetProps } from './BalanceAccountsSheet.types';

export function BalanceAccountsSheet({
    visible,
    onVisibleChange,
    userId,
    accounts,
    selectedAccountIds,
    onSave,
}: BalanceAccountsSheetProps) {
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
                        <BalanceAccountsSheetContent
                            userId={userId}
                            accounts={accounts}
                            selectedAccountIds={selectedAccountIds}
                            onSave={onSave}
                            onDismiss={handleDismiss}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
