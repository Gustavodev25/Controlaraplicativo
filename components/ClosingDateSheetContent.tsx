import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthButton } from '@/components/ui/AuthButton';
import type { ClosingDateItem } from './ClosingDateSheet.types';

interface ClosingDateSheetContentProps {
    items: ClosingDateItem[];
    bankName?: string;
    originalCloseDate?: string | null;
    originalDueDate?: string | null;
    onSave: (updates: { id: string, exactDate: string }[]) => Promise<void>;
    onDismiss: () => void;
}

export function ClosingDateSheetContent({
    items,
    bankName,
    originalCloseDate,
    originalDueDate,
    onSave,
    onDismiss,
}: ClosingDateSheetContentProps) {
    const [days, setDays] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const initialDays: Record<string, string> = {};
        items.forEach(item => {
            if (item.currentDate) {
                const parts = item.currentDate.split('-');
                if (parts.length === 3) {
                    initialDays[item.id] = parts[2];
                }
            }
        });
        setDays(initialDays);
        setIsSaving(false);
    }, [items]);

    const handleSave = async () => {
        const updates: { id: string, exactDate: string }[] = [];

        items.forEach(item => {
            const dayValue = days[item.id];
            if (dayValue) {
                const d = parseInt(dayValue, 10);
                if (!isNaN(d) && d >= 1 && d <= 31) {
                    const parts = item.currentDate.split('-');
                    if (parts.length === 3) {
                        const newDate = `${parts[0]}-${parts[1]}-${String(d).padStart(2, '0')}`;
                        updates.push({ id: item.monthKey || item.id, exactDate: newDate });
                    }
                }
            }
        });

        setIsSaving(true);
        try {
            await onSave(updates);
            onDismiss();
        } finally {
            setIsSaving(false);
        }
    };

    const handleDayChange = (id: string, text: string) => {
        setDays(prev => ({ ...prev, [id]: text.replace(/\D/g, '') }));
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    Editar fechamento
                </Text>
                <Text style={styles.subtitle}>
                    Defina o dia exato do fechamento para as faturas abaixo.
                </Text>
            </View>

            <Text style={styles.sectionTitle}>FECHAMENTO</Text>
            <View style={styles.groupCard}>
                {items.map((item, index) => (
                    <View key={item.id}>
                        <View style={styles.itemContent}>
                            <View style={styles.itemTextBlock}>
                                <Text style={styles.itemTitle}>{item.label}</Text>
                                {item.subLabel ? (
                                    <Text style={styles.itemSubLabel}>{item.subLabel}</Text>
                                ) : null}
                            </View>

                            <View style={styles.dayInputGroup}>
                                <Text style={styles.dayLabel}>Dia</Text>
                                <TextInput
                                    style={styles.inputRight}
                                    value={days[item.id] || ''}
                                    onChangeText={(text) => handleDayChange(item.id, text)}
                                    placeholder="25"
                                    placeholderTextColor="#636366"
                                    keyboardType="numeric"
                                    textAlign="center"
                                    maxLength={2}
                                />
                            </View>
                        </View>
                        {index < items.length - 1 && <View style={styles.divider} />}
                    </View>
                ))}
            </View>

            <View style={styles.footerButtonContainer}>
                <AuthButton
                    title="Salvar"
                    onPress={handleSave}
                    isLoading={isSaving}
                />
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
    infoContent: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    infoBoxText: {
        fontSize: 13,
        color: '#8E8E93',
        lineHeight: 18,
        fontFamily: 'AROneSans_400Regular',
    },
    boldDate: {
        fontWeight: '700',
        color: '#FFFFFF',
    },
    itemContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        minHeight: 60,
    },
    itemTextBlock: {
        flex: 1,
        marginRight: 12,
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
    dayInputGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dayLabel: {
        color: '#8E8E93',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
    },
    inputRight: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
        width: 44,
        height: 34,
        borderRadius: 8,
        backgroundColor: '#111111',
        borderWidth: 1,
        borderColor: '#2A2A2A',
        padding: 0,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
    footerButtonContainer: {
        marginTop: 12,
    },
});
