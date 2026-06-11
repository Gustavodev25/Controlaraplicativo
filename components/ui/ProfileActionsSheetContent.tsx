import Avvvatars from '@/components/ui/Avvvatars';
import { ChevronRight, LogOut, Settings } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ProfileActionsSheetContentProps {
    displayName: string;
    email: string;
    avatarValue: string;
    onSettingsPress: () => void;
    onSignOutPress: () => void;
}

export function ProfileActionsSheetContent({
    displayName,
    email,
    avatarValue,
    onSettingsPress,
    onSignOutPress,
}: ProfileActionsSheetContentProps) {
    return (
        <View style={styles.container}>
            <View style={styles.profile}>
                <Avvvatars value={avatarValue} size={48} style="shape" />
                <View style={styles.profileText}>
                    <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                    {!!email && <Text style={styles.email} numberOfLines={1}>{email}</Text>}
                </View>
            </View>

            <View style={styles.actions}>
                <TouchableOpacity
                    style={styles.action}
                    activeOpacity={0.72}
                    onPress={onSettingsPress}
                    accessibilityRole="button"
                    accessibilityLabel="Abrir configurações"
                >
                    <View style={styles.actionIcon}>
                        <Settings size={20} color="#F4F1EF" strokeWidth={2} />
                    </View>
                    <Text style={styles.actionText}>Configurações</Text>
                    <ChevronRight size={20} color="#68686D" />
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity
                    style={styles.action}
                    activeOpacity={0.72}
                    onPress={onSignOutPress}
                    accessibilityRole="button"
                    accessibilityLabel="Sair da conta"
                >
                    <View style={[styles.actionIcon, styles.destructiveIcon]}>
                        <LogOut size={20} color="#FF6B6B" strokeWidth={2} />
                    </View>
                    <Text style={[styles.actionText, styles.destructiveText]}>Sair</Text>
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
    profile: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 18,
    },
    profileText: {
        flex: 1,
        minWidth: 0,
        marginLeft: 14,
    },
    name: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'AROneSans_600SemiBold',
    },
    email: {
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
    actionIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        backgroundColor: '#222222',
    },
    destructiveIcon: {
        backgroundColor: 'rgba(255,107,107,0.10)',
    },
    actionText: {
        flex: 1,
        color: '#F4F1EF',
        fontSize: 16,
        fontFamily: 'AROneSans_400Regular',
    },
    destructiveText: {
        color: '#FF6B6B',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 58,
        backgroundColor: '#282828',
    },
});
