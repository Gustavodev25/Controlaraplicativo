import { ArrowLeft } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
}: ConnectAccountModalProps) {
    const handleClose = () => {
        onClose();
    };

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
        </View>
    );

    return (
        <ModalPadrao
            visible={visible}
            onClose={handleClose}
            title={CustomTitle}
            presentation="bottom"
            scrollable={true}
            enableDragToClose={true}
            showHandle={true}
            maxHeightRatio={0.75}
            onAfterClose={onDismiss}
            bodyStyle={styles.modalBody}
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
        fontSize: 22,
        color: '#FFFFFF',
        fontFamily: 'AROneSans_400Regular',
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
