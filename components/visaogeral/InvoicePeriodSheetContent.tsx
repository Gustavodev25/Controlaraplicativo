import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { InvoicePeriod } from './types';

interface InvoicePeriodSheetContentProps {
    cardName: string;
    selectedPeriod: InvoicePeriod;
    pastTotal: number;
    currentTotal: number;
    totalUsed: number;
    onPeriodChange: (period: InvoicePeriod) => void;
}

const formatValue = (value: number) =>
    `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value))}`;

export function InvoicePeriodSheetContent({
    cardName,
    selectedPeriod,
    pastTotal,
    currentTotal,
    totalUsed,
    onPeriodChange,
}: InvoicePeriodSheetContentProps) {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    Selecionar Fatura
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>{cardName}</Text>
            </View>

            <View style={styles.optionsList}>
                {/* Fatura Anterior */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={() => onPeriodChange('past')}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={[
                            styles.optionTitle,
                            selectedPeriod === 'past' && styles.optionTitleSelected,
                        ]}>
                            Anterior
                        </Text>
                        <Text style={styles.optionSubtitle}>Visualizar fatura passada</Text>
                    </View>
                    <Text style={styles.optionValue}>{formatValue(pastTotal)}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Fatura Atual */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={() => onPeriodChange('current')}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={[
                            styles.optionTitle,
                            selectedPeriod === 'current' && styles.optionTitleSelected,
                        ]}>
                            Atual
                        </Text>
                        <Text style={styles.optionSubtitle}>Visualizar mês vigente</Text>
                    </View>
                    <Text style={styles.optionValue}>{formatValue(currentTotal)}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Total Usado */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={() => onPeriodChange('total_used')}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={[
                            styles.optionTitle,
                            selectedPeriod === 'total_used' && styles.optionTitleSelected,
                        ]}>
                            Total Usado
                        </Text>
                        <Text style={styles.optionSubtitle}>Soma de todas as faturas abertas</Text>
                    </View>
                    <Text style={styles.optionValue}>{formatValue(totalUsed)}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Não considerar */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={() => onPeriodChange('none')}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={[
                            styles.optionTitle,
                            selectedPeriod === 'none' && styles.optionTitleDanger,
                        ]}>
                            Não considerar
                        </Text>
                        <Text style={styles.optionSubtitle}>Ocultar faturas do resumo</Text>
                    </View>
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
    optionsList: {
        overflow: 'hidden',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        backgroundColor: '#171717',
    },
    option: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 16,
    },
    optionTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    optionTitle: {
        color: '#F4F1EF',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
    },
    optionTitleSelected: {
        color: '#D97757',
    },
    optionTitleDanger: {
        color: '#FF6B6B',
    },
    optionSubtitle: {
        color: '#606060',
        fontSize: 12,
        marginTop: 1,
    },
    optionValue: {
        color: '#AAAAAA',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
        textAlign: 'right',
        minWidth: 104,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
});
