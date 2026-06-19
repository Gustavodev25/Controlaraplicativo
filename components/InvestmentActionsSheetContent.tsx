import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface InvestmentActionsSheetContentProps {
    investmentName: string;
    onExtractPress: () => void;
    onMovePress: () => void;
    onEditPress: () => void;
    onDeletePress: () => void;
}

export function InvestmentActionsSheetContent({
    investmentName,
    onExtractPress,
    onMovePress,
    onEditPress,
    onDeletePress,
}: InvestmentActionsSheetContentProps) {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    {investmentName.includes(' • ') ? investmentName.split(' • ')[0] : investmentName}
                </Text>
                <Text style={styles.subtitle}>Opções do investimento</Text>
            </View>

            <View style={styles.optionsList}>
                {/* Extrato */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={onExtractPress}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>Extrato</Text>
                        <Text style={styles.optionSubtitle}>Ver histórico de movimentações</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Movimentar */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={onMovePress}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>Movimentar</Text>
                        <Text style={styles.optionSubtitle}>Aplicar ou resgatar valor</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Editar */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={onEditPress}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>Editar</Text>
                        <Text style={styles.optionSubtitle}>Alterar nome, meta ou prazo</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Excluir */}
                <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.72}
                    onPress={onDeletePress}
                    accessibilityRole="button"
                >
                    <View style={styles.optionTextBlock}>
                        <Text style={[styles.optionTitle, styles.destructiveText]}>Excluir</Text>
                        <Text style={styles.optionSubtitle}>Remover esta caixinha permanentemente</Text>
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
    destructiveText: {
        color: '#FF6B6B',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
});
