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

export interface ManualSubAccountInput {
    id?: string;
    accountName: string;
    balanceOrLimit: number;
    dueDate?: number;
    closeDate?: number;
}

interface ManualSubAccountModalProps {
    visible: boolean;
    mode: 'CREDIT_CARD' | 'SAVINGS' | null;
    isEditing?: boolean;
    initialData?: ManualSubAccountInput | null;
    onClose: () => void;
    onSubmit: (data: ManualSubAccountInput) => Promise<void>;
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

export function ManualSubAccountModal({
    visible,
    mode,
    isEditing = false,
    initialData,
    onClose,
    onSubmit,
}: ManualSubAccountModalProps) {
    const [accountName, setAccountName] = React.useState('');
    const [balance, setBalance] = React.useState('0');
    const [dueDate, setDueDate] = React.useState('');
    const [closeDate, setCloseDate] = React.useState('');
    const [error, setError] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (visible) {
            if (isEditing && initialData) {
                setAccountName(initialData.accountName || '');
                setBalance(initialData.balanceOrLimit ? (initialData.balanceOrLimit * 100).toString() : '0');
                setDueDate(initialData.dueDate ? initialData.dueDate.toString() : '');
                setCloseDate(initialData.closeDate ? initialData.closeDate.toString() : '');
            } else {
                setAccountName('');
                setBalance('0');
                setDueDate('');
                setCloseDate('');
            }
            setError('');
            setSaving(false);
        }
    }, [visible, isEditing, initialData]);

    const resetForm = () => {
        setAccountName('');
        setBalance('0');
        setDueDate('');
        setCloseDate('');
        setError('');
        setSaving(false);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleDueDateChange = (text: string) => {
        const cleaned = text.replace(/\D/g, '').substring(0, 2);
        setDueDate(cleaned);
        
        if (cleaned.length > 0) {
            const day = parseInt(cleaned, 10);
            if (day >= 1 && day <= 31) {
                // Auto calculate closing date (usually 7 days before due date)
                let closeDay = day - 7;
                if (closeDay <= 0) {
                    closeDay += 30; // Approximation
                }
                setCloseDate(closeDay.toString());
            }
        } else {
            setCloseDate('');
        }
    };

    const handleCloseDateChange = (text: string) => {
        const cleaned = text.replace(/\D/g, '').substring(0, 2);
        setCloseDate(cleaned);
    };

    const handleSubmit = async () => {
        const cleanAccountName = accountName.trim();
        const parsedBalance = parseCurrencyInput(balance);

        if (!cleanAccountName) {
            setError('Informe o nome.');
            return;
        }

        const isCreditCard = mode === 'CREDIT_CARD';
        let parsedDueDate: number | undefined;
        let parsedCloseDate: number | undefined;

        if (isCreditCard) {
            parsedDueDate = parseInt(dueDate, 10);
            parsedCloseDate = parseInt(closeDate, 10);
            
            if (!parsedDueDate || parsedDueDate < 1 || parsedDueDate > 31) {
                setError('Informe um dia de vencimento válido (1-31).');
                return;
            }
            if (!parsedCloseDate || parsedCloseDate < 1 || parsedCloseDate > 31) {
                setError('Informe um dia de fechamento válido (1-31).');
                return;
            }
        }

        setSaving(true);
        setError('');

        try {
            await onSubmit({
                id: isEditing ? initialData?.id : undefined,
                accountName: cleanAccountName,
                balanceOrLimit: parsedBalance,
                dueDate: parsedDueDate,
                closeDate: parsedCloseDate,
            });
            resetForm();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Não foi possível criar a conta.');
        } finally {
            setSaving(false);
        }
    };

    const isCreditCard = mode === 'CREDIT_CARD';
    const title = isCreditCard ? 'Criar cartão de crédito' : 'Criar patrimônio / poupança';
    const desc = isCreditCard
        ? 'Adicione um cartão de crédito manual para controlar seus gastos.'
        : 'Adicione uma poupança ou investimento manual.';
    const nameLabel = isCreditCard ? 'NOME DO CARTÃO' : 'NOME DO PATRIMÔNIO';
    const namePlaceholder = isCreditCard ? 'Ex: Cartão Nubank, Cartão Itaú' : 'Ex: Poupança Caixa, Tesouro Direto';
    const balanceLabel = isCreditCard ? 'LIMITE DO CARTÃO' : 'SALDO ATUAL';

    return (
        <ModalPadrao
            visible={visible}
            onClose={handleClose}
            title={title}
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
                            <Text style={styles.primaryButtonText}>Criar</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        >
            <View style={styles.container}>
                <Text style={styles.description}>
                    {desc}
                </Text>

                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>{nameLabel}</Text>
                    <TextInput
                        style={styles.input}
                        value={accountName}
                        onChangeText={(text) => {
                            setAccountName(text);
                            setError('');
                        }}
                        placeholder={namePlaceholder}
                        placeholderTextColor="#6F7480"
                        autoCorrect={false}
                    />
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>{balanceLabel}</Text>
                    <TextInput
                        style={styles.input}
                        value={balance}
                        onChangeText={(text) => {
                            setBalance(formatCurrencyInput(text));
                            setError('');
                        }}
                        placeholder="0,00"
                        placeholderTextColor="#6F7480"
                        keyboardType="numeric"
                    />
                </View>

                {isCreditCard && (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                            <Text style={styles.label}>DIA DO VENCIMENTO</Text>
                            <TextInput
                                style={styles.input}
                                value={dueDate}
                                onChangeText={(text) => {
                                    handleDueDateChange(text);
                                    setError('');
                                }}
                                placeholder="Ex: 10"
                                placeholderTextColor="#6F7480"
                                keyboardType="numeric"
                                maxLength={2}
                            />
                        </View>

                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                            <Text style={styles.label}>DIA DO FECHAMENTO</Text>
                            <TextInput
                                style={styles.input}
                                value={closeDate}
                                onChangeText={(text) => {
                                    handleCloseDateChange(text);
                                    setError('');
                                }}
                                placeholder="Ex: 03"
                                placeholderTextColor="#6F7480"
                                keyboardType="numeric"
                                maxLength={2}
                            />
                        </View>
                    </View>
                )}

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
