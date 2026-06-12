import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useCategories } from '@/hooks/use-categories';
import { IosCoreLoader } from '@/components/ui/IosCoreLoader';
import type { InvoiceItem } from '@/services/invoiceBuilder';

interface TransactionOptionsSheetContentProps {
    transaction: InvoiceItem | null;
    onMoveInvoice: (target: 'prev' | 'next' | 'current' | 'custom', date?: string) => void;
    onDelete: (item: InvoiceItem) => void;
    onRefund?: (item: InvoiceItem) => void;
    moveOptions?: { target: 'prev' | 'next' | 'current' | 'custom'; label: string; date?: string; icon?: 'prev' | 'next' }[];
    onChangeCategory?: (item: InvoiceItem) => void;
    loading?: boolean;
}

export function TransactionOptionsSheetContent({
    transaction,
    onMoveInvoice,
    onDelete,
    onRefund,
    moveOptions,
    onChangeCategory,
    loading,
}: TransactionOptionsSheetContentProps) {
    const { getCategoryName } = useCategories();

    if (!transaction) return null;

    const isPayment = transaction.isPayment;
    const isProjected = transaction.isProjected;
    const isRefund = transaction.isRefund;
    const isInstallment = (transaction.totalInstallments ?? 0) > 1;
    const canRefund = !isProjected && !isPayment && !isRefund && onRefund;
    const canMoveInvoice = !isProjected || isInstallment;
    const showMoveSection = !isRefund;

    const formattedDate = new Date(transaction.date + 'T12:00:00').toLocaleDateString('pt-BR');
    const categoryName = getCategoryName(transaction.category);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    {transaction.description}
                </Text>
                <Text style={styles.subtitle}>
                    {formattedDate} • {categoryName}
                </Text>
            </View>

            {showMoveSection && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>FATURA</Text>
                    <View style={styles.optionsList}>
                        {moveOptions?.map((opt, index) => (
                            <React.Fragment key={opt.target}>
                                <TouchableOpacity
                                    style={[styles.option, !canMoveInvoice && styles.optionDisabled]}
                                    disabled={!canMoveInvoice}
                                    onPress={() => {
                                        if (!canMoveInvoice) return;
                                        onMoveInvoice(opt.target);
                                    }}
                                    activeOpacity={0.72}
                                    accessibilityRole="button"
                                >
                                    <View style={styles.optionTextBlock}>
                                        <Text style={styles.optionTitle}>{opt.label}</Text>
                                        {!!opt.date && <Text style={styles.optionSubtitle}>{opt.date}</Text>}
                                    </View>
                                </TouchableOpacity>
                                {index < (moveOptions?.length || 0) - 1 && <View style={styles.divider} />}
                            </React.Fragment>
                        ))}
                    </View>

                    {!canMoveInvoice && (
                        <Text style={styles.hintText}>
                            Transações projetadas sem parcelas não podem ser movidas.
                        </Text>
                    )}
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>AÇÕES</Text>
                <View style={styles.optionsList}>
                    {isRefund ? (
                        <TouchableOpacity
                            style={styles.option}
                            activeOpacity={0.72}
                            onPress={() => onDelete(transaction)}
                            accessibilityRole="button"
                        >
                            <View style={styles.optionTextBlock}>
                                <Text style={[styles.optionTitle, styles.dangerText]}>Excluir transação</Text>
                            </View>
                        </TouchableOpacity>
                    ) : (
                        <>
                            {canRefund && (
                                <>
                                    <TouchableOpacity
                                        style={styles.option}
                                        activeOpacity={0.72}
                                        onPress={() => onRefund && onRefund(transaction)}
                                        accessibilityRole="button"
                                    >
                                        <View style={styles.optionTextBlock}>
                                            <Text style={styles.optionTitle}>Estornar transação</Text>
                                        </View>
                                    </TouchableOpacity>
                                    <View style={styles.divider} />
                                </>
                            )}

                            <TouchableOpacity
                                style={styles.option}
                                activeOpacity={0.72}
                                onPress={() => onChangeCategory && onChangeCategory(transaction)}
                                accessibilityRole="button"
                            >
                                <View style={styles.optionTextBlock}>
                                    <Text style={styles.optionTitle}>Mudar categoria</Text>
                                </View>
                            </TouchableOpacity>

                            <View style={styles.divider} />

                            <TouchableOpacity
                                style={styles.option}
                                activeOpacity={0.72}
                                onPress={() => onDelete(transaction)}
                                accessibilityRole="button"
                            >
                                <View style={styles.optionTextBlock}>
                                    <Text style={[styles.optionTitle, styles.dangerText]}>Excluir transação</Text>
                                </View>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            {loading && (
                <View style={styles.loadingOverlay}>
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    <IosCoreLoader fill={false} style={styles.loaderContainer} />
                </View>
            )}
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
    section: {
        marginTop: 16,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8E8E93',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    optionsList: {
        overflow: 'hidden',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        backgroundColor: '#171717',
    },
    option: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    optionDisabled: {
        opacity: 0.45,
    },
    optionTextBlock: {
        flex: 1,
    },
    optionTitle: {
        color: '#F4F1EF',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
    },
    optionSubtitle: {
        color: '#606060',
        fontSize: 12,
        fontFamily: 'AROneSans_400Regular',
        marginTop: 2,
    },
    dangerText: {
        color: '#FF453A',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
    hintText: {
        marginTop: 8,
        color: '#606060',
        fontSize: 12,
        fontFamily: 'AROneSans_400Regular',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFill,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 22,
        overflow: 'hidden',
        zIndex: 999,
    },
    loaderContainer: {
        alignItems: 'center',
        backgroundColor: 'rgba(26, 26, 26, 0.8)',
        padding: 24,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2A2A2A',
    },
});
