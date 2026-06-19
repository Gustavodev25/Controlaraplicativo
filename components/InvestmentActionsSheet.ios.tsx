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
                        <InvestmentActionsSheetContent
                            investmentName={investmentName}
                            onExtractPress={() => dismissWithAction(onExtract)}
                            onMovePress={() => dismissWithAction(onMove)}
                            onEditPress={() => dismissWithAction(onEdit)}
                            onDeletePress={() => dismissWithAction(onDelete)}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
