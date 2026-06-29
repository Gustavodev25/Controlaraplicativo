import { CategorySelectorSheet } from '@/components/CategorySelectorSheet';
import { ModalPadrao } from '@/components/ui/ModalPadrao';
import type { CategoryGroup } from '@/constants/defaultCategories';
import { Calendar, ChevronDown } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export interface ManualTransactionAccount {
    id: string;
    name?: string;
    bankName?: string;
    balance?: number;
    manual?: boolean;
    source?: string | null;
}

export interface ManualTransactionInput {
    accountId?: string | null;
    accountName?: string | null;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    date: string;
    category: string;
}

interface ManualTransactionModalProps {
    visible: boolean;
    onClose: () => void;
    accounts: ManualTransactionAccount[];
    accountLoading?: boolean;
    accountError?: string;
    categories: CategoryGroup[];
    categoryLoading?: boolean;
    getCategoryName: (key?: string) => string;
    onSubmit: (data: ManualTransactionInput) => Promise<void>;
    onRetryAccounts?: () => void;
}

const DEFAULT_EXPENSE_CATEGORY = 'food delivery';
const DEFAULT_INCOME_CATEGORY = 'salary';

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

const formatDateInput = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 8);
    const parts = [];
    if (cleaned.length > 0) parts.push(cleaned.slice(0, 2));
    if (cleaned.length > 2) parts.push(cleaned.slice(2, 4));
    if (cleaned.length > 4) parts.push(cleaned.slice(4, 8));
    return parts.join('/');
};

const todayAsBrDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
};

const parseBrDateToIso = (value: string): string | null => {
    const [dayRaw, monthRaw, yearRaw] = value.split('/');
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);

    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
        return null;
    }

    const parsed = new Date(year, month - 1, day, 12, 0, 0);
    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) {
        return null;
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export function ManualTransactionModal({
    visible,
    onClose,
    accounts,
    accountLoading = false,
    accountError = '',
    categories,
    categoryLoading,
    getCategoryName,
    onSubmit,
    onRetryAccounts,
}: ManualTransactionModalProps) {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [type, setType] = useState<'income' | 'expense'>('expense');
    const [date, setDate] = useState(todayAsBrDate);
    const [category, setCategory] = useState(DEFAULT_EXPENSE_CATEGORY);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [categorySelectorVisible, setCategorySelectorVisible] = useState(false);
    const [accountSelectorVisible, setAccountSelectorVisible] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const resetForm = () => {
        setDescription('');
        setAmount('');
        setType('expense');
        setDate(todayAsBrDate());
        setCategory(DEFAULT_EXPENSE_CATEGORY);
        setSelectedAccountId(null);
        setCategorySelectorVisible(false);
        setAccountSelectorVisible(false);
        setError('');
        setSaving(false);
    };

    const handleClose = () => {
        if (saving) return;
        resetForm();
        onClose();
    };

    const selectedAccount = useMemo(() => {
        if (!selectedAccountId) return null;
        return accounts.find((account) => account.id === selectedAccountId) || null;
    }, [accounts, selectedAccountId]);

    const canOpenAccountSelector = !saving && !accountLoading && accounts.length > 0;
    const accountLabel = selectedAccount
        ? `${selectedAccount.bankName ? `${selectedAccount.bankName} - ` : ''}${selectedAccount.name || 'Conta'}`
        : accountLoading
            ? 'Carregando contas...'
            : accountError
                ? 'Tentar carregar contas'
                : accounts.length > 0
                    ? 'Selecionar conta'
                    : 'Sem conta vinculada';

    const categoryLabel = useMemo(() => {
        for (const group of categories) {
            const item = group.items.find((categoryItem) => categoryItem.key === category);
            if (item) {
                return `${group.title} - ${item.label}`;
            }
        }

        return getCategoryName(category);
    }, [categories, category, getCategoryName]);

    const handleTypeChange = (nextType: 'income' | 'expense') => {
        setType(nextType);
        setCategory(nextType === 'income' ? DEFAULT_INCOME_CATEGORY : DEFAULT_EXPENSE_CATEGORY);
        setError('');
    };

    const handleAccountPress = () => {
        if (saving || accountLoading) return;
        if (accounts.length > 0) {
            setAccountSelectorVisible(true);
            return;
        }
        if (accountError && onRetryAccounts) {
            onRetryAccounts();
        }
    };

    const handleSubmit = async () => {
        const cleanDescription = description.trim();
        const parsedAmount = parseCurrencyInput(amount);
        const isoDate = parseBrDateToIso(date);

        if (!cleanDescription) {
            setError('Informe a descrição.');
            return;
        }

        if (parsedAmount <= 0) {
            setError('Informe um valor maior que zero.');
            return;
        }

        if (!isoDate) {
            setError('Informe uma data válida.');
            return;
        }

        setSaving(true);
        setError('');

        try {
            await onSubmit({
                accountId: selectedAccount?.id ?? null,
                accountName: selectedAccount?.name ?? null,
                description: cleanDescription,
                amount: parsedAmount,
                type,
                date: isoDate,
                category,
            });
            resetForm();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Não foi possível salvar a transação.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <ModalPadrao
                visible={visible}
                onClose={handleClose}
                title="Transação manual"
                titleAlign="start"
                presentation="bottom"
                size="md"
                maxHeightRatio={0.92}
                enableDragToClose={!saving}
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
                                <Text style={styles.primaryButtonText}>Salvar transação</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            >
                <View style={styles.container}>
                    <View style={styles.segmentedControl}>
                        <TouchableOpacity
                            style={[styles.segmentButton, type === 'expense' && styles.segmentButtonActive]}
                            activeOpacity={0.78}
                            onPress={() => handleTypeChange('expense')}
                            disabled={saving}
                        >
                            <Text style={[styles.segmentText, type === 'expense' && styles.segmentTextActive]}>
                                Despesa
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.segmentButton, type === 'income' && styles.segmentButtonActive]}
                            activeOpacity={0.78}
                            onPress={() => handleTypeChange('income')}
                            disabled={saving}
                        >
                            <Text style={[styles.segmentText, type === 'income' && styles.segmentTextActive]}>
                                Receita
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>DESCRIÇÃO</Text>
                        <TextInput
                            style={styles.input}
                            value={description}
                            onChangeText={(text) => {
                                setDescription(text);
                                setError('');
                            }}
                            placeholder={type === 'income' ? 'Ex: Salário, reembolso' : 'Ex: Mercado, aluguel, Pix'}
                            placeholderTextColor="#6F7480"
                            autoCorrect={false}
                            editable={!saving}
                        />
                    </View>

                    <View style={styles.twoColumns}>
                        <View style={styles.column}>
                            <Text style={styles.label}>VALOR</Text>
                            <TextInput
                                style={styles.input}
                                value={amount}
                                onChangeText={(text) => {
                                    setAmount(formatCurrencyInput(text));
                                    setError('');
                                }}
                                placeholder="0,00"
                                placeholderTextColor="#6F7480"
                                keyboardType="numeric"
                                editable={!saving}
                            />
                        </View>

                        <View style={styles.column}>
                            <Text style={styles.label}>DATA</Text>
                            <View style={styles.iconInputWrapper}>
                                <TextInput
                                    style={[styles.input, styles.iconInput]}
                                    value={date}
                                    onChangeText={(text) => {
                                        setDate(formatDateInput(text));
                                        setError('');
                                    }}
                                    placeholder="25/06/2026"
                                    placeholderTextColor="#6F7480"
                                    keyboardType="numeric"
                                    maxLength={10}
                                    editable={!saving}
                                />
                                <Calendar size={16} color="#D8D8D8" strokeWidth={2} style={styles.inputIcon} />
                            </View>
                        </View>
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>CONTA</Text>
                        <TouchableOpacity
                            style={[
                                styles.selectInput,
                                (saving || accountLoading || (!accounts.length && !accountError)) && styles.selectInputDisabled
                            ]}
                            activeOpacity={0.78}
                            onPress={handleAccountPress}
                            disabled={saving || (!canOpenAccountSelector && !accountError)}
                        >
                            <Text style={styles.selectInputText} numberOfLines={1}>
                                {accountLabel}
                            </Text>
                            {accountLoading ? (
                                <ActivityIndicator color="#D8D8D8" size="small" />
                            ) : accounts.length > 0 ? (
                                <ChevronDown size={16} color="#8E8E93" strokeWidth={2.2} />
                            ) : null}
                        </TouchableOpacity>
                        {accountError ? (
                            <Text style={styles.helperErrorText}>
                                {accountError} Toque para tentar de novo.
                            </Text>
                        ) : null}
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>CATEGORIA</Text>
                        <TouchableOpacity
                            style={[styles.selectInput, saving && styles.selectInputDisabled]}
                            activeOpacity={0.78}
                            onPress={() => setCategorySelectorVisible(true)}
                            disabled={saving}
                        >
                            <Text style={styles.selectInputText} numberOfLines={1}>
                                {categoryLabel}
                            </Text>
                            <ChevronDown size={16} color="#8E8E93" strokeWidth={2.2} />
                        </TouchableOpacity>
                    </View>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </View>
            </ModalPadrao>

            <ModalPadrao
                visible={accountSelectorVisible}
                onClose={() => setAccountSelectorVisible(false)}
                title="Selecionar conta"
                titleAlign="start"
                presentation="bottom"
                size="md"
                maxHeightRatio={0.72}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.accountList}
                    keyboardShouldPersistTaps="handled"
                >
                    <TouchableOpacity
                        style={styles.accountOption}
                        activeOpacity={0.78}
                        onPress={() => {
                            setSelectedAccountId(null);
                            setAccountSelectorVisible(false);
                            setError('');
                        }}
                    >
                        <View style={styles.accountOptionTextBlock}>
                            <Text style={styles.accountOptionTitle}>Sem conta vinculada</Text>
                            <Text style={styles.accountOptionSubtitle}>Salvar apenas como transação normal</Text>
                        </View>
                    </TouchableOpacity>

                    {accounts.map((account) => (
                        <TouchableOpacity
                            key={account.id}
                            style={styles.accountOption}
                            activeOpacity={0.78}
                            onPress={() => {
                                setSelectedAccountId(account.id);
                                setAccountSelectorVisible(false);
                                setError('');
                            }}
                        >
                            <View style={styles.accountOptionTextBlock}>
                                <Text style={styles.accountOptionTitle} numberOfLines={1}>
                                    {account.name || 'Conta'}
                                </Text>
                                <Text style={styles.accountOptionSubtitle} numberOfLines={1}>
                                    {account.bankName || 'Conta bancária'}
                                </Text>
                            </View>

                            {selectedAccountId === account.id ? <View style={styles.selectedDot} /> : null}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </ModalPadrao>

            <CategorySelectorSheet
                visible={categorySelectorVisible}
                onVisibleChange={setCategorySelectorVisible}
                categories={categories}
                loading={categoryLoading}
                onSelect={(categoryKey) => {
                    setCategory(categoryKey);
                    setError('');
                }}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 18,
    },
    segmentedControl: {
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#242424',
        backgroundColor: '#171717',
        flexDirection: 'row',
        padding: 3,
        gap: 4,
    },
    segmentButton: {
        flex: 1,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentButtonActive: {
        backgroundColor: '#D97757',
    },
    segmentText: {
        color: '#9EA4AF',
        fontSize: 14,
        fontWeight: '700',
    },
    segmentTextActive: {
        color: '#FFFFFF',
    },
    fieldGroup: {
        gap: 8,
    },
    twoColumns: {
        flexDirection: 'row',
        gap: 12,
    },
    column: {
        flex: 1,
        minWidth: 0,
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
    iconInputWrapper: {
        position: 'relative',
    },
    iconInput: {
        paddingRight: 38,
    },
    inputIcon: {
        position: 'absolute',
        right: 14,
        top: 15,
    },
    selectInput: {
        height: 46,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#242424',
        backgroundColor: '#171717',
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    selectInputDisabled: {
        opacity: 0.68,
    },
    selectInputText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
        flex: 1,
        minWidth: 0,
    },
    accountList: {
        paddingBottom: 10,
        gap: 10,
    },
    accountOption: {
        minHeight: 58,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#242424',
        backgroundColor: '#171717',
        paddingHorizontal: 14,
        paddingVertical: 11,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    accountOptionTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    accountOptionTitle: {
        color: '#F4F1EF',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
    },
    accountOptionSubtitle: {
        color: '#606060',
        fontSize: 12,
        fontFamily: 'AROneSans_400Regular',
        marginTop: 2,
    },
    selectedDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#D97757',
    },
    errorText: {
        color: '#FF7A7A',
        fontSize: 13,
        lineHeight: 18,
        fontFamily: 'AROneSans_400Regular',
    },
    helperErrorText: {
        color: '#FF9A8A',
        fontSize: 12,
        lineHeight: 17,
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
