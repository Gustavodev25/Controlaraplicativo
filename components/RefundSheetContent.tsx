import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AuthButton } from '@/components/ui/AuthButton';
import { formatCurrency } from '@/services/invoiceBuilder';
import type { RefundTransaction } from './RefundSheet.types';

interface RefundSheetContentProps {
    transaction: RefundTransaction | null;
    onConfirm: (transaction: RefundTransaction, customAmount?: number) => Promise<void>;
    onDismiss: () => void;
}

type RefundType = 'total' | 'custom';

export function RefundSheetContent({
    transaction,
    onConfirm,
    onDismiss,
}: RefundSheetContentProps) {
    const [refundType, setRefundType] = useState<RefundType>('total');
    const [customValue, setCustomValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const transactionAmount = Math.abs(transaction?.amount || 0);

    useEffect(() => {
        setRefundType('total');
        setCustomValue('');
        setError('');
        setLoading(false);
    }, [transaction]);

    const formatInputValue = (text: string) => {
        const cleaned = text.replace(/\D/g, '');
        const value = parseInt(cleaned, 10) || 0;
        return (value / 100).toFixed(2).replace('.', ',');
    };

    const handleValueChange = (text: string) => {
        setCustomValue(formatInputValue(text));
        setError('');
    };

    const parseCustomValue = (): number => {
        if (!customValue) return 0;
        const value = parseFloat(customValue.replace(',', '.'));
        return Number.isNaN(value) ? 0 : value;
    };

    const handleConfirm = async () => {
        if (!transaction) return;

        let refundAmount: number | undefined;

        if (refundType === 'custom') {
            refundAmount = parseCustomValue();

            if (refundAmount <= 0) {
                setError('Digite um valor maior que zero');
                return;
            }

            if (refundAmount > transactionAmount) {
                setError('O valor não pode ser maior que a transação original');
                return;
            }
        }

        setLoading(true);
        setError('');

        try {
            await onConfirm(transaction, refundType === 'custom' ? refundAmount : undefined);
            onDismiss();
        } catch (err: any) {
            setError(err.message || 'Não foi possível registrar o estorno');
        } finally {
            setLoading(false);
        }
    };

    if (!transaction) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    Estorno de Transação
                </Text>
                <Text style={styles.subtitle}>
                    Escolha o valor que será lançado como estorno nesta fatura.
                </Text>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
            >
                <Text style={styles.sectionTitle}>TRANSAÇÃO</Text>
                <View style={styles.groupCard}>
                    <View style={styles.itemContent}>
                        <View style={styles.itemTextBlock}>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                                {transaction.description}
                            </Text>
                            <Text style={styles.itemSubLabel}>
                                {formatCurrency(transactionAmount)}
                            </Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>VALOR DO ESTORNO</Text>
                <View style={styles.groupCard}>
                    <TouchableOpacity
                        style={styles.itemContainer}
                        onPress={() => setRefundType('total')}
                        activeOpacity={0.72}
                        accessibilityRole="button"
                    >
                        <View style={styles.itemTextBlock}>
                            <Text style={styles.itemTitle}>Valor total</Text>
                            <Text style={styles.itemSubLabel}>
                                Estornar {formatCurrency(transactionAmount)}
                            </Text>
                        </View>
                        <View style={[styles.selectionDot, refundType === 'total' && styles.selectionDotActive]} />
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                        style={styles.itemContainer}
                        onPress={() => setRefundType('custom')}
                        activeOpacity={0.72}
                        accessibilityRole="button"
                    >
                        <View style={styles.itemTextBlock}>
                            <Text style={styles.itemTitle}>Valor personalizado</Text>
                            <Text style={styles.itemSubLabel}>Estorno parcial</Text>
                        </View>

                        {refundType === 'custom' ? (
                            <View style={styles.inputPill}>
                                <Text style={styles.inputPrefix}>R$</Text>
                                <TextInput
                                    style={styles.inputRight}
                                    value={customValue}
                                    onChangeText={handleValueChange}
                                    placeholder="0,00"
                                    placeholderTextColor="#555"
                                    keyboardType="numeric"
                                    textAlign="right"
                                    maxLength={12}
                                    autoFocus
                                />
                            </View>
                        ) : (
                            <View style={styles.selectionDot} />
                        )}
                    </TouchableOpacity>
                </View>

                {error ? (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                <View style={styles.footerButtonContainer}>
                    <AuthButton
                        title="Estornar"
                        onPress={handleConfirm}
                        isLoading={loading}
                    />
                </View>
            </ScrollView>
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
    scrollContent: {
        paddingBottom: 12,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8E8E93',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 12,
    },
    groupCard: {
        backgroundColor: '#171717',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        overflow: 'hidden',
        marginBottom: 16,
    },
    itemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        minHeight: 48,
    },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        minHeight: 52,
    },
    itemTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    itemTitle: {
        fontSize: 15,
        color: '#FFFFFF',
        fontFamily: 'AROneSans_400Regular',
    },
    itemSubLabel: {
        fontSize: 12,
        color: '#606060',
        fontFamily: 'AROneSans_400Regular',
        marginTop: 2,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
    selectionDot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: '#3A3A3C',
        marginLeft: 12,
    },
    selectionDotActive: {
        borderWidth: 5,
        borderColor: '#D97757',
    },
    inputPill: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 12,
        backgroundColor: '#111111',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#2A2A2A',
        paddingHorizontal: 10,
        height: 36,
    },
    inputPrefix: {
        color: '#8E8E93',
        fontSize: 13,
        fontFamily: 'AROneSans_400Regular',
        marginRight: 6,
    },
    inputRight: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
        minWidth: 58,
        padding: 0,
    },
    errorContainer: {
        backgroundColor: 'rgba(255, 69, 58, 0.1)',
        padding: 12,
        borderRadius: 10,
        marginTop: 8,
        marginBottom: 8,
    },
    errorText: {
        fontSize: 13,
        color: '#FF453A',
        fontFamily: 'AROneSans_400Regular',
    },
    footerButtonContainer: {
        marginTop: 16,
    },
});
