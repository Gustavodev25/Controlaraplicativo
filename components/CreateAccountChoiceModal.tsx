import { ModalPadrao } from '@/components/ui/ModalPadrao';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CreateAccountChoiceModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectManual: () => void;
    onSelectConnect: () => void;
}

export function CreateAccountChoiceModal({
    visible,
    onClose,
    onSelectManual,
    onSelectConnect,
}: CreateAccountChoiceModalProps) {
    return (
        <ModalPadrao
            visible={visible}
            onClose={onClose}
            title="Criar ou conectar conta"
            titleAlign="start"
            presentation="bottom"
            size="md"
        >
            <View style={styles.container}>
                <Text style={styles.description}>
                    Escolha como deseja adicionar uma nova conta bancária para controlar seu saldo.
                </Text>

                <View style={styles.optionsContainer}>
                    <TouchableOpacity
                        style={styles.optionCard}
                        activeOpacity={0.7}
                        onPress={() => {
                            onClose();
                            setTimeout(onSelectConnect, 300);
                        }}
                    >
                        <View style={styles.optionContent}>
                            <Text style={styles.optionTitle}>Conectar banco automático</Text>
                            <Text style={styles.optionDescription}>
                                Sincronize via Open Finance. Saldos e transações atualizam sozinhos.
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.optionCard}
                        activeOpacity={0.7}
                        onPress={() => {
                            onClose();
                            setTimeout(onSelectManual, 300);
                        }}
                    >
                        <View style={styles.optionContent}>
                            <Text style={styles.optionTitle}>Criar conta manual</Text>
                            <Text style={styles.optionDescription}>
                                Cadastre uma conta fora da sincronização para controlar saldo manualmente.
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </ModalPadrao>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 24,
        paddingBottom: 8,
    },
    description: {
        color: '#A7ADB8',
        fontSize: 15,
        lineHeight: 22,
        fontFamily: 'AROneSans_400Regular',
    },
    optionsContainer: {
        gap: 12,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        borderRadius: 14,
        padding: 18,
    },
    optionContent: {
        flex: 1,
        gap: 6,
    },
    optionTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'AROneSans_400Regular',
    },
    optionDescription: {
        color: '#909090',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'AROneSans_400Regular',
    },
});
