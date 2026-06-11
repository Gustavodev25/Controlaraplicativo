import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { CalendarioEventsSheetContent } from './CalendarioEventsSheetContent';
import type { CalendarioEventsSheetProps } from './CalendarioEventsSheet.types';

export function CalendarioEventsSheet({
    visible,
    onVisibleChange,
    selectedDate,
    selectedEvents,
}: CalendarioEventsSheetProps) {
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
                <CalendarioEventsSheetContent
                    selectedDate={selectedDate}
                    selectedEvents={selectedEvents}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
