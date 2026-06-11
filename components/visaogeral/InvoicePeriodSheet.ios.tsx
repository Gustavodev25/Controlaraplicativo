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

    const handlePeriodChange = useCallback((period: InvoicePeriod) => {
        dismissWithAction(() => onPeriodChange(period));
    }, [dismissWithAction, onPeriodChange]);

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
                        <InvoicePeriodSheetContent
                            cardName={cardName}
                            selectedPeriod={selectedPeriod}
                            pastTotal={pastTotal}
                            currentTotal={currentTotal}
                            totalUsed={totalUsed}
                            onPeriodChange={handlePeriodChange}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
