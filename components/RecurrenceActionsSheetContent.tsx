import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface RecurrenceActionsSheetContentProps {
    itemName: string;
    itemType: 'subscription' | 'reminder';
    itemStatus: 'paid' | 'pending' | 'overdue';
    onAction: (action: 'pay' | 'edit' | 'delete') => void;
}

export function RecurrenceActionsSheetContent({
    itemName,
    itemType,
    itemStatus,
    onAction,
}: RecurrenceActionsSheetContentProps) {
    const isPaid = itemStatus === 'paid';
    const payLabel = isPaid
        ? 'Marcar como pendente'
        : itemType === 'reminder'
            ? 'Marcar como feito'
            : 'Marcar como pago';

    const payDescription = isPaid
        ? 'Reverter o pagamento deste mês'
        : itemType === 'reminder'
            ? 'Concluir este lembrete'
            : 'Confirmar pagamento deste vencimento';

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    {itemName}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                    {itemType === 'subscription' ? 'Opções da Assinatura' : 'Opções do Lembrete'}
                </Text>
            </View>

            <View style={styles.optionsList}>
                {/* Ação de Pagar/Reverter */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={() => onAction('pay')}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>
                            {payLabel}
                        </Text>
                        <Text style={styles.optionSubtitle}>{payDescription}</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Ação de Editar */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={() => onAction('edit')}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>Editar</Text>
                        <Text style={styles.optionSubtitle}>Alterar título, valor ou vencimento</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Ação de Excluir */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={() => onAction('delete')}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>Excluir</Text>
                        <Text style={styles.optionSubtitle}>Remover esta recorrência permanentemente</Text>
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
    optionTitleSuccess: {
        color: '#32D74B',
    },
    optionTitleDanger: {
        color: '#FF453A',
    },
    optionSubtitle: {
        color: '#606060',
        fontSize: 12,
        marginTop: 1,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
});
