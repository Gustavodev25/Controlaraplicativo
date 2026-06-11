import { databaseService } from '@/services/firebase';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface BalanceAccountsSheetContentProps {
    userId: string;
    accounts: any[];
    selectedAccountIds: string[];
    onSave: (selectedIds: string[]) => void;
    onDismiss: () => void;
}

export function BalanceAccountsSheetContent({
    userId,
    accounts,
    selectedAccountIds,
    onSave,
    onDismiss,
}: BalanceAccountsSheetContentProps) {
    const [selected, setSelected] = useState<string[]>(selectedAccountIds);

    useEffect(() => {
        setSelected(selectedAccountIds);
    }, [selectedAccountIds]);

    const displayedAccounts = (accounts || []).filter(account => {
        const isCheckingType = account.type === 'BANK' || account.type === 'checking' || account.subtype === 'CHECKING_ACCOUNT';
        const isCreditType = account.type === 'credit' || account.type === 'CREDIT' || account.type === 'CREDIT_CARD' || account.subtype === 'CREDIT_CARD';
        const isSavingsType = account.type === 'SAVINGS' || account.subtype === 'SAVINGS_ACCOUNT' || account.subtype === 'SAVINGS';
        const isInvestmentType = account.type === 'INVESTMENT';

        const nameLower = (account.name || '').toLowerCase();
        const isSavingsByName = nameLower.includes('poupança') || nameLower.includes('poupanca') || nameLower.includes('savings');
        const isCaixinhaByName = nameLower.includes('caixinha') || nameLower.includes('invest');

        return isCheckingType && !isCreditType && !isSavingsType && !isInvestmentType && !isSavingsByName && !isCaixinhaByName;
    });

    // Count occurrences of each name to add indexes if necessary
    const nameTotals = (displayedAccounts || []).reduce((acc, account) => {
        const name = account.name || account.connector?.name || 'Conta';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const nameCurrentCounts: Record<string, number> = {};

    const toggleAccount = (accountId: string) => {
        setSelected(prev => {
            const next = prev.includes(accountId)
                ? prev.filter(id => id !== accountId)
                : [...prev, accountId];

            // Auto-save on toggle
            onSave(next);
            databaseService.updatePreference(userId, {
                balanceAccountIds: next
            }).catch((error) => {
                console.error('Error saving balance preferences:', error);
            });

            return next;
        });
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>Contas Bancárias</Text>
                <Text style={styles.subtitle}>Selecione as contas para o saldo</Text>
            </View>

            {displayedAccounts.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Nenhuma conta</Text>
                    <Text style={styles.emptyDescription}>
                        Conecte uma conta para ver seu saldo.
                    </Text>
                </View>
            ) : (
                <View style={styles.accountsList}>
                    {displayedAccounts.map((account, index) => {
                        const isSelected = selected.includes(account.id);
                        const isLast = index === displayedAccounts.length - 1;

                        const baseName = account.name || account.connector?.name || 'Conta';
                        nameCurrentCounts[baseName] = (nameCurrentCounts[baseName] || 0) + 1;

                        const hasDuplicates = nameTotals[baseName] > 1;
                        const accountNumberSuffix = account.number ? account.number.replace(/\D/g, '').slice(-4) : null;

                        let displayName = baseName;
                        if (hasDuplicates) {
                            if (accountNumberSuffix) {
                                displayName = `${baseName} • ${accountNumberSuffix}`;
                            } else {
                                displayName = `${baseName} #${nameCurrentCounts[baseName]}`;
                            }
                        }

                        let subtitle = 'Conta Corrente';
                        if (!hasDuplicates && accountNumberSuffix) {
                            subtitle = `Conta Corrente • Final ${accountNumberSuffix}`;
                        }

                        return (
                            <View key={account.id}>
                                <TouchableOpacity
                                    activeOpacity={0.72}
                                    onPress={() => toggleAccount(account.id)}
                                    style={[
                                        styles.accountItem,
                                        !isSelected && styles.accountItemDeselected,
                                    ]}
                                >
                                    <View style={styles.accountInfo}>
                                        <Text style={styles.accountName} numberOfLines={1}>
                                            {displayName}
                                        </Text>
                                        <Text style={styles.accountSubtitle}>
                                            {subtitle}
                                        </Text>
                                    </View>
                                    <Text style={[
                                        styles.accountBalance,
                                        account.balance >= 0 ? styles.positiveValue : styles.negativeValue,
                                    ]}>
                                        {formatCurrency(account.balance || 0)}
                                    </Text>
                                </TouchableOpacity>
                                {!isLast && <View style={styles.divider} />}
                            </View>
                        );
                    })}
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
    accountsList: {
        overflow: 'hidden',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        backgroundColor: '#171717',
    },
    accountItem: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    accountItemDeselected: {
        opacity: 0.35,
    },
    accountInfo: {
        flex: 1,
        marginRight: 12,
    },
    accountName: {
        color: '#F4F1EF',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
        marginBottom: 2,
    },
    accountSubtitle: {
        color: '#606060',
        fontSize: 12,
        fontFamily: 'AROneSans_400Regular',
    },
    accountBalance: {
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
    },
    positiveValue: {
        color: '#04D361',
    },
    negativeValue: {
        color: '#FF4C4C',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        paddingHorizontal: 20,
    },
    emptyTitle: {
        fontSize: 17,
        fontFamily: 'AROneSans_400Regular',
        color: '#E5E5E5',
        marginBottom: 6,
        textAlign: 'center',
    },
    emptyDescription: {
        fontSize: 13,
        color: '#606060',
        textAlign: 'center',
        lineHeight: 18,
        fontFamily: 'AROneSans_400Regular',
    },
});
