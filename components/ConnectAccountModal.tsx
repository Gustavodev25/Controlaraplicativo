import { ArrowLeft, X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ModalPadrao } from '@/components/ui/ModalPadrao';

interface ConnectAccountModalProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    connectionStep: string;
    banksCount?: number;
    isBanksLoading?: boolean;
    credentialsCount?: number;
    onBack?: () => void;
    rightElement?: React.ReactNode;
    searchElement?: React.ReactNode;
    warningText?: string;
    overlayElement?: React.ReactNode;
    onDismiss?: () => void;
    scrollable?: boolean;
}

export function ConnectAccountModal({
    visible,
    onClose,
    title,
    subtitle,
    children,
    onBack,
    searchElement,
    warningText,
    overlayElement,
    onDismiss,
    scrollable = true,
}: ConnectAccountModalProps) {
    const { height } = useWindowDimensions();

    const handleClose = () => {
        onClose();
    };

    const fixedBodyHeight = Math.max(320, Math.floor(height * 0.75) - 82);

    const CustomTitle = (
        <View style={styles.titleRow}>
            {onBack && (
                <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backButton}>
                    <ArrowLeft size={22} color="#FFFFFF" />
                </TouchableOpacity>
            )}
            <Text style={styles.titleText}>
                {title}
            </Text>
            {!scrollable && !onBack && (
                <TouchableOpacity onPress={handleClose} hitSlop={10} style={styles.closeButton}>
                    <X size={20} color="#8E8E93" />
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <ModalPadrao
            visible={visible}
            onClose={handleClose}
            title={CustomTitle}
            presentation="bottom"
            scrollable={scrollable}
            enableDragToClose={scrollable}
            showHandle={true}
            maxHeightRatio={0.75}
            onAfterClose={onDismiss}
            bodyStyle={[
                styles.modalBody,
                !scrollable && { height: fixedBodyHeight },
            ]}
        >
            <View style={styles.container}>
                {subtitle && (
                    <Text style={styles.subtitle} numberOfLines={2}>
                        {subtitle}
                    </Text>
                )}
                {warningText && (
                    <Text style={styles.warningText} numberOfLines={2}>
                        {warningText}
                    </Text>
                )}
                {searchElement && (
                    <View style={styles.searchWrapper}>
                        {searchElement}
                    </View>
                )}
                <View style={styles.content}>
                    {children}
                </View>
            </View>
            {overlayElement}
        </ModalPadrao>
    );
}

const styles = StyleSheet.create({
    modalBody: {
        paddingHorizontal: 0,
        paddingBottom: 0,
    },
    container: {
        flex: 1,
        paddingTop: 8,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    backButton: {
        padding: 4,
        marginRight: 2,
    },
    titleText: {
        flex: 1,
        fontSize: 22,
        color: '#FFFFFF',
        fontFamily: 'AROneSans_400Regular',
    },
    closeButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1C1C1E',
    },
    subtitle: {
        fontSize: 15,
        color: '#909090',
        marginTop: 2,
        fontFamily: 'AROneSans_400Regular',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    warningText: {
        fontSize: 11,
        color: '#FF9F0A',
        marginTop: 4,
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    searchWrapper: {
        marginTop: 4,
        width: '100%',
        alignSelf: 'stretch',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    content: {
        flex: 1,
    },
});
