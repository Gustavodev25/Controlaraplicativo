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
    const { width } = useWindowDimensions();
    const pendingActionRef = useRef<ProfileActionsSheetProps['onSettings'] | null>(null);

    const dismissWithAction = useCallback((action: ProfileActionsSheetProps['onSettings']) => {
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
                        <ProfileActionsSheetContent
                            displayName={displayName}
                            email={email}
                            avatarValue={avatarValue}
                            onSettingsPress={() => dismissWithAction(onSettings)}
                            onSignOutPress={() => dismissWithAction(onSignOut)}
                        />
                    </RNHostView>
                </Group>
            </BottomSheet>
        </Host>
    );
}
