import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';
import { Dimensions, ScrollView, View, Text } from 'react-native';
import { ModalPadraoFallback } from './ModalPadraoFallback';
import type { ModalPadraoProps } from './ModalPadrao.types';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function ModalPadrao(props: ModalPadraoProps) {
    const {
        visible,
        onClose,
        title,
        children,
        presentation = 'bottom',
        scrollable = true,
        onAfterClose,
        bodyStyle,
        contentStyle,
        maxHeightRatio = 0.75,
        enableDragToClose = true,
    } = props;

    const sheetRef = useRef<BottomSheetMethods>(null);

    const handleDismiss = useCallback(() => {
        onClose();
        if (onAfterClose) {
            onAfterClose();
        }
    }, [onClose, onAfterClose]);

    useEffect(() => {
        if (presentation === 'bottom') {
            if (visible) {
                sheetRef.current?.present();
            } else {
                sheetRef.current?.dismiss();
            }
        }
    }, [visible, presentation]);

    if (presentation === 'center') {
        return <ModalPadraoFallback {...props} />;
    }

    const maxSheetHeight = SCREEN_HEIGHT * maxHeightRatio;
    // Reserve space for header (~62px) + footer (~60px if present) + padding
    const headerHeight = title ? 62 : 0;
    const footerHeight = props.footer ? 60 : 0;
    const bodyMaxHeight = maxSheetHeight - headerHeight - footerHeight - 20;

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            enablePanDownToClose={enableDragToClose}
            enableDynamicSizing
            backgroundStyle={{ backgroundColor: '#111111' }}
            onDismiss={handleDismiss}
        >
            <BottomSheetView>
                <View style={[{ backgroundColor: '#111111' }, contentStyle]}>
                    {/* Header (Clean, no border, no close button) */}
                    {title ? (
                        <View style={{
                            paddingHorizontal: 20,
                            paddingTop: 22,
                            paddingBottom: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <View style={{ flex: 1 }}>
                                {typeof title === 'string' ? (
                                    <Text style={{
                                        color: '#FFFFFF',
                                        fontSize: 22,
                                        fontFamily: 'AROneSans_600SemiBold',
                                    }}>
                                        {title}
                                    </Text>
                                ) : (
                                    title
                                )}
                            </View>
                            {props.headerRight}
                        </View>
                    ) : null}

                    {/* Body */}
                    {scrollable ? (
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 }, bodyStyle]}
                            style={{ maxHeight: bodyMaxHeight }}
                            {...props.scrollViewProps}
                        >
                            {children}
                        </ScrollView>
                    ) : (
                        <View style={[{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34, maxHeight: bodyMaxHeight }, bodyStyle]}>
                            {children}
                        </View>
                    )}

                    {/* Footer */}
                    {props.footer && (
                        <View style={[{
                            paddingHorizontal: 20,
                            paddingTop: 12,
                            paddingBottom: 24,
                            borderTopWidth: 1,
                            borderTopColor: '#242424',
                            backgroundColor: '#111111'
                        }, props.footerStyle]}>
                            {props.footer}
                        </View>
                    )}
                </View>
            </BottomSheetView>
        </BottomSheet>
    );
}
export default ModalPadrao;
