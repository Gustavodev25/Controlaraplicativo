import { ModalPadrao } from '@/components/ui/ModalPadrao';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export interface ManualBankAccountInput {
    bankName: string;
    accountName: string;
    initialBalance: number;
}

interface ManualBankAccountModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (data: ManualBankAccountInput) => Promise<void>;
}

const formatCurrencyInput = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (!cleaned) return '';
    const value = parseInt(cleaned, 10) || 0;
    return (value / 100).toFixed(2).replace('.', ',');
};

const parseCurrencyInput = (value: string) => {
    const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

export function ManualBankAccountModal({
    visible,
    onClose,
    onSubmit,
}: ManualBankAccountModalProps) {
    const [bankName, setBankName] = useState('');
    const [accountName, setAccountName] = useState('');
    const [initialBalance, setInitialBalance] = useState('0');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const resetForm = () => {
        setBankName('');
        setAccountName('');
        setInitialBalance('0');
        setError('');
        setSaving(false);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async () => {
        const cleanBankName = bankName.trim();
        const cleanAccountName = accountName.trim();
        const parsedInitialBalance = parseCurrencyInput(initialBalance);

        if (!cleanBankName) {
            setError('Informe o banco.');
            return;
        }

        if (!cleanAccountName) {
            setError('Informe o nome da conta.');
            return;
        }

        setSaving(true);
        setError('');

        try {
            await onSubmit({
                bankName: cleanBankName,
                accountName: cleanAccountName,
                initialBalance: parsedInitialBalance,
            });
            resetForm();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Não foi possível criar a conta.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalPadrao
            visible={visible}
            onClose={handleClose}
            title="Criar conta manual"
            titleAlign="start"
            presentation="bottom"
            size="md"
            maxHeightRatio={0.9}
            footer={(
                <View style={styles.footerRow}>
                    <TouchableOpacity
                        style={[styles.footerButton, styles.cancelButton]}
                        activeOpacity={0.78}
                        onPress={handleClose}
                        disabled={saving}
                    >
                        <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.footerButton, styles.primaryButton, saving && styles.disabledButton]}
                        activeOpacity={0.78}
                        onPress={handleSubmit}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Text style={styles.primaryButtonText}>Criar conta</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        >
            <View style={styles.container}>
                <Text style={styles.description}>
                    Cadastre uma conta fora da sincronização bancária para controlar seu saldo manualmente.
                </Text>

                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>BANCO / INSTITUIÇÃO</Text>
                    <TextInput
                        style={styles.input}
                        value={bankName}
                        onChangeText={(text) => {
                            setBankName(text);
                            setError('');
                        }}
                        placeholder="Ex: Nubank, Itaú, Carteira, Dinheiro"
                        placeholderTextColor="#6F7480"
                        autoCorrect={false}
                    />
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>NOME DA CONTA</Text>
                    <TextInput
                        style={styles.input}
                        value={accountName}
                        onChangeText={(text) => {
                            setAccountName(text);
                            setError('');
                        }}
                        placeholder="Ex: Conta principal, Dinheiro físico"
                        placeholderTextColor="#6F7480"
                        autoCorrect={false}
                    />
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>SALDO ATUAL</Text>
                    <TextInput
                        style={styles.input}
                        value={initialBalance}
                        onChangeText={(text) => {
                            setInitialBalance(formatCurrencyInput(text));
                            setError('');
                        }}
                        placeholder="0,00"
                        placeholderTextColor="#6F7480"
                        keyboardType="numeric"
                    />
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
        </ModalPadrao>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 18,
    },
    description: {
        color: '#A7ADB8',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'AROneSans_400Regular',
    },
    fieldGroup: {
        gap: 8,
    },
    label: {
        color: '#9EA4AF',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
    },
    input: {
        height: 46,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#242424',
        backgroundColor: '#171717',
        color: '#FFFFFF',
        paddingHorizontal: 16,
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
    },
    errorText: {
        color: '#FF7A7A',
        fontSize: 13,
        lineHeight: 18,
        fontFamily: 'AROneSans_400Regular',
    },
    footerRow: {
        flexDirection: 'row',
        gap: 10,
    },
    footerButton: {
        flex: 1,
        height: 46,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#1A1A1A',
    },
    primaryButton: {
        backgroundColor: '#D97757',
    },
    disabledButton: {
        opacity: 0.64,
    },
    cancelButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
});
