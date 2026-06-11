import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface InvoiceActionsSheetContentProps {
    showInvoiceCards: boolean;
    onConfigureInvoice: () => void;
    onSearchTransaction: () => void;
    onToggleInvoiceCards: () => void;
}

export function InvoiceActionsSheetContent({
    showInvoiceCards,
    onConfigureInvoice,
    onSearchTransaction,
    onToggleInvoiceCards,
}: InvoiceActionsSheetContentProps) {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    Ações da fatura
                </Text>
                <Text style={styles.subtitle}>Opções de gerenciamento</Text>
            </View>

            <View style={styles.optionsList}>
                {/* Configurar fatura */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={onConfigureInvoice}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>Configurar fatura</Text>
                        <Text style={styles.optionSubtitle}>Fechamento, vencimento e ajustes</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Buscar transação */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={onSearchTransaction}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>Buscar transação</Text>
                        <Text style={styles.optionSubtitle}>Encontrar lançamentos nesta fatura</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Alternar visualização dos cartões */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={onToggleInvoiceCards}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>
                            {showInvoiceCards ? 'Ocultar cartões da fatura' : 'Mostrar cartões da fatura'}
                        </Text>
                        <Text style={styles.optionSubtitle}>Alternar a visualização do carrossel</Text>
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
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
});
