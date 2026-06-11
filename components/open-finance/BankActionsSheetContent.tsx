import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface BankActionsSheetContentProps {
    bankName: string;
    syncDisabled: boolean;
    onSyncPress: () => void;
    onDisconnectPress: () => void;
}

export function BankActionsSheetContent({
    bankName,
    syncDisabled,
    onSyncPress,
    onDisconnectPress,
}: BankActionsSheetContentProps) {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>{bankName}</Text>
                <Text style={styles.subtitle}>Opções da conta</Text>
            </View>

            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.action, syncDisabled && styles.actionDisabled]}
                    activeOpacity={0.72}
                    onPress={onSyncPress}
                    disabled={syncDisabled}
                    accessibilityRole="button"
                    accessibilityLabel="Sincronizar conta bancária"
                >
                    <Text style={[styles.actionText, syncDisabled && styles.actionTextDisabled]}>
                        Sincronizar
                    </Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity
                    style={styles.action}
                    activeOpacity={0.72}
                    onPress={onDisconnectPress}
                    accessibilityRole="button"
                    accessibilityLabel="Desconectar conta bancária"
                >
                    <Text style={[styles.actionText, styles.destructiveText]}>Desconectar</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 28,
        backgroundColor: '#111111',
    },
    header: {
        paddingVertical: 18,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'AROneSans_600SemiBold',
    },
    subtitle: {
        color: '#8E8E93',
        fontSize: 13,
        fontFamily: 'AROneSans_400Regular',
        marginTop: 3,
    },
    actions: {
        overflow: 'hidden',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        backgroundColor: '#171717',
    },
    action: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
    },
    actionDisabled: {
        opacity: 0.45,
    },
    actionText: {
        flex: 1,
        color: '#F4F1EF',
        fontSize: 16,
        fontFamily: 'AROneSans_400Regular',
    },
    actionTextDisabled: {
        color: '#555',
    },
    destructiveText: {
        color: '#FF6B6B',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
});
