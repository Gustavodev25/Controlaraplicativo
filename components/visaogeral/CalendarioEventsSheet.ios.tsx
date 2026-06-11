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

import { CalendarioEventsSheetContent } from './CalendarioEventsSheetContent';
import type { CalendarioEventsSheetProps } from './CalendarioEventsSheet.types';

export function CalendarioEventsSheet({
    visible,
    onVisibleChange,
    selectedDate,
    selectedEvents,
}: CalendarioEventsSheetProps) {
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
                        <CalendarioEventsSheetContent
                            selectedDate={selectedDate}
                            selectedEvents={selectedEvents}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
