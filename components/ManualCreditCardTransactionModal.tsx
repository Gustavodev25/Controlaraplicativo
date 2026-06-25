import { CategorySelectorSheet } from '@/components/CategorySelectorSheet';
import { ModalPadrao } from '@/components/ui/ModalPadrao';
import type { CategoryGroup } from '@/constants/defaultCategories';
import { CreditCardAccount, formatCurrency } from '@/services/invoiceBuilder';
import { Calendar, ChevronDown } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export interface ManualCreditCardTransactionInput {
    cardId: string;
    description: string;
    amount: number;
    installments: number;
    date: string;
    category: string;
}

interface ManualCreditCardTransactionModalProps {
    visible: boolean;
    onClose: () => void;
    card: CreditCardAccount | null;
    availableAmount: number;
    categories: CategoryGroup[];
    categoryLoading?: boolean;
    getCategoryName: (key?: string) => string;
    onSubmit: (data: ManualCreditCardTransactionInput) => Promise<void>;
}

const DEFAULT_CATEGORY = 'food delivery';

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

const clampInstallments = (value: string) => {
    const parsed = parseInt(value.replace(/\D/g, ''), 10);
    if (!Number.isFinite(parsed)) return '';
    return String(Math.min(Math.max(parsed, 1), 48));
};

export function ManualCreditCardTransactionModal({
    visible,
    onClose,
    card,
    availableAmount,
    categories,
    categoryLoading,
    getCategoryName,
    onSubmit,
}: ManualCreditCardTransactionModalProps) {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [installments, setInstallments] = useState('1');
    const [date, setDate] = useState(todayAsBrDate);
    const [category, setCategory] = useState(DEFAULT_CATEGORY);
    const [categorySelectorVisible, setCategorySelectorVisible] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const resetForm = () => {
        setDescription('');
        setAmount('');
        setInstallments('1');
        setDate(todayAsBrDate());
        setCategory(DEFAULT_CATEGORY);
        setCategorySelectorVisible(false);
        setError('');
        setSaving(false);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const categoryLabel = useMemo(() => {
        for (const group of categories) {
            const item = group.items.find((categoryItem) => categoryItem.key === category);
            if (item) {
                return `${group.title} - ${item.label}`;
            }
        }

        return getCategoryName(category);
    }, [categories, category, getCategoryName]);

    const handleSubmit = async () => {
        if (!card?.id) {
            setError('Selecione um cartão.');
            return;
        }

        const cleanDescription = description.trim();
        const parsedAmount = parseCurrencyInput(amount);
        const parsedInstallments = Number(installments || '1');
        const isoDate = parseBrDateToIso(date);

        if (!cleanDescription) {
            setError('Informe a descrição.');
            return;
        }

        if (parsedAmount <= 0) {
            setError('Informe um valor maior que zero.');
            return;
        }

        if (!Number.isInteger(parsedInstallments) || parsedInstallments < 1 || parsedInstallments > 48) {
            setError('Informe parcelas entre 1 e 48.');
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
                cardId: card.id,
                description: cleanDescription,
                amount: parsedAmount,
                installments: parsedInstallments,
                date: isoDate,
                category,
            });
            resetForm();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Não foi possível salvar o lançamento.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <ModalPadrao
                visible={visible}
                onClose={handleClose}
                title="Lançamento manual"
                titleAlign="start"
                presentation="bottom"
                size="md"
                maxHeightRatio={0.92}
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
                                <Text style={styles.primaryButtonText}>Salvar lançamento</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            >
                <View style={styles.container}>
                    <View style={styles.selectedCardBox}>
                        <View style={styles.selectedCardTextBlock}>
                            <Text style={styles.selectedCardLabel}>Cartão selecionado</Text>
                            <Text style={styles.selectedCardName} numberOfLines={1}>
                                {card?.name || 'Nenhum cartão'}
                            </Text>
                        </View>
                        <Text style={styles.availableText} numberOfLines={1}>
                            Disponível: {formatCurrency(availableAmount)}
                        </Text>
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
                            placeholder="Ex: Mercado, farmacia, assinatura"
                            placeholderTextColor="#6F7480"
                            autoCorrect={false}
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
                            />
                        </View>

                        <View style={styles.column}>
                            <Text style={styles.label}>PARCELAS</Text>
                            <TextInput
                                style={styles.input}
                                value={installments}
                                onChangeText={(text) => {
                                    setInstallments(clampInstallments(text));
                                    setError('');
                                }}
                                placeholder="1"
                                placeholderTextColor="#6F7480"
                                keyboardType="numeric"
                                maxLength={2}
                            />
                        </View>
                    </View>

                    <View style={styles.twoColumns}>
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
                                    placeholder="24/06/2026"
                                    placeholderTextColor="#6F7480"
                                    keyboardType="numeric"
                                    maxLength={10}
                                />
                                <Calendar size={16} color="#D8D8D8" strokeWidth={2} style={styles.inputIcon} />
                            </View>
                        </View>

                        <View style={styles.column}>
                            <Text style={styles.label}>Categoria</Text>
                            <TouchableOpacity
                                style={styles.selectInput}
                                activeOpacity={0.78}
                                onPress={() => setCategorySelectorVisible(true)}
                            >
                                <Text style={styles.selectInputText} numberOfLines={1}>
                                    {categoryLabel}
                                </Text>
                                <ChevronDown size={16} color="#8E8E93" strokeWidth={2.2} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </View>
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
    selectedCardBox: {
        minHeight: 64,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#303030',
        backgroundColor: '#1B1B1B',
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    selectedCardTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    selectedCardLabel: {
        color: '#9EA4AF',
        fontSize: 11,
        fontFamily: 'AROneSans_400Regular',
        marginBottom: 7,
    },
    selectedCardName: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    availableText: {
        color: '#B5BAC4',
        fontSize: 12,
        fontFamily: 'AROneSans_400Regular',
        maxWidth: 152,
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
    selectInputText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
        flex: 1,
        minWidth: 0,
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
