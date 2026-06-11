import {
    BottomSheet,
    BottomSheetView,
    type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { ModalPadraoFallback } from './ModalPadraoFallback';
import type { ModalPadraoProps } from './ModalPadrao.types';

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

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            enablePanDownToClose
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
                            style={{ maxHeight: 600 }}
                            {...props.scrollViewProps}
                        >
                            {children}
                        </ScrollView>
                    ) : (
                        <View style={[{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 }, bodyStyle]}>
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
