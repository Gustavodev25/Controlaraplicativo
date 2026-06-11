import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';

import { ProfileActionsSheetContent } from './ProfileActionsSheetContent';
import type { ProfileActionsSheetProps } from './ProfileActionsSheet.types';

export function ProfileActionsSheet({
    visible,
    displayName,
    email,
    avatarValue,
    onVisibleChange,
    onSettings,
    onSignOut,
}: ProfileActionsSheetProps) {
    const sheetRef = useRef<BottomSheetMethods>(null);
    const pendingActionRef = useRef<ProfileActionsSheetProps['onSettings'] | null>(null);

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

    const dismissWithAction = useCallback((action: ProfileActionsSheetProps['onSettings']) => {
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
                <ProfileActionsSheetContent
                    displayName={displayName}
                    email={email}
                    avatarValue={avatarValue}
                    onSettingsPress={() => dismissWithAction(onSettings)}
                    onSignOutPress={() => dismissWithAction(onSignOut)}
                />
            </BottomSheetView>
        </BottomSheet>
    );
}
