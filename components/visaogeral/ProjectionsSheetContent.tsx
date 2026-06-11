import { ModernSwitch } from '@/components/ui/ModernSwitch';
import type { ProjectionSettings } from '@/components/ProjectionsModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ProjectionsSheetContentProps {
    currentSettings: ProjectionSettings;
    onSave: (settings: ProjectionSettings) => Promise<void> | void;
    salaryPreview: number;
    valePreview: number;
    includeOpenFinance: boolean;
    onToggleOpenFinance: (value: boolean) => Promise<void> | void;
    onDismiss: () => void;
}

export function ProjectionsSheetContent({
    currentSettings,
    onSave,
    salaryPreview,
    valePreview,
    includeOpenFinance,
    onToggleOpenFinance,
    onDismiss,
}: ProjectionsSheetContentProps) {
    const [includeSalary, setIncludeSalary] = useState(currentSettings.includeSalary);
    const [includeVale, setIncludeVale] = useState(currentSettings.includeVale);
    const [includeReminders, setIncludeReminders] = useState(currentSettings.includeReminders);
    const [includeSubscriptions, setIncludeSubscriptions] = useState(currentSettings.includeSubscriptions);
    const [localOpenFinance, setLocalOpenFinance] = useState(includeOpenFinance);

    // Keep refs in sync for the auto-save callback
    const settingsRef = useRef({ includeSalary, includeVale, includeReminders, includeSubscriptions });
    settingsRef.current = { includeSalary, includeVale, includeReminders, includeSubscriptions };

    useEffect(() => {
        setIncludeSalary(currentSettings.includeSalary);
        setIncludeVale(currentSettings.includeVale);
        setIncludeReminders(currentSettings.includeReminders);
        setIncludeSubscriptions(currentSettings.includeSubscriptions);
        setLocalOpenFinance(includeOpenFinance);
    }, [currentSettings, includeOpenFinance]);

    // Auto-save projection settings whenever a toggle changes
    const autoSave = useCallback((next: Partial<ProjectionSettings>) => {
        const merged = { ...settingsRef.current, ...next };
        settingsRef.current = merged;
        Promise.resolve(onSave(merged)).catch((error) => {
            console.error('Error saving projections:', error);
        });
    }, [onSave]);

    const handleToggleSalary = useCallback((value: boolean) => {
        setIncludeSalary(value);
        autoSave({ includeSalary: value });
    }, [autoSave]);

    const handleToggleVale = useCallback((value: boolean) => {
        setIncludeVale(value);
        autoSave({ includeVale: value });
    }, [autoSave]);

    const handleToggleReminders = useCallback((value: boolean) => {
        setIncludeReminders(value);
        autoSave({ includeReminders: value });
    }, [autoSave]);

    const handleToggleSubscriptions = useCallback((value: boolean) => {
        setIncludeSubscriptions(value);
        autoSave({ includeSubscriptions: value });
    }, [autoSave]);

    const handleToggleOpenFinance = useCallback((value: boolean) => {
        setLocalOpenFinance(value);
        Promise.resolve(onToggleOpenFinance(value)).catch((error) => {
            console.error('Error saving open finance toggle:', error);
        });
    }, [onToggleOpenFinance]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Previsões</Text>
                <Text style={styles.subtitle}>
                    Ajuste quais dados devem compor sua projeção de saldo futuro.
                </Text>
            </View>

            {/* INTEGRAÇÃO */}
            <Text style={styles.sectionTitle}>INTEGRAÇÃO</Text>
            <View style={styles.groupCard}>
                <View style={styles.itemContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>Contas Bancárias</Text>
                        <Text style={styles.itemSubtitle}>Transações automáticas</Text>
                    </View>
                    <ModernSwitch
                        value={localOpenFinance}
                        onValueChange={handleToggleOpenFinance}
                    />
                </View>
            </View>

            {/* RENDA ESTIMADA */}
            <Text style={styles.sectionTitle}>RENDA ESTIMADA</Text>
            <View style={styles.groupCard}>
                <View style={styles.itemContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>Salário Mensal</Text>
                        <Text style={[styles.itemPreview, salaryPreview <= 0 && styles.itemPreviewMuted]}>
                            {salaryPreview > 0
                                ? `R$ ${salaryPreview.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                : 'Não configurado'}
                        </Text>
                    </View>
                    <ModernSwitch
                        value={includeSalary}
                        onValueChange={handleToggleSalary}
                        disabled={salaryPreview <= 0}
                    />
                </View>
                <View style={styles.separator} />
                <View style={styles.itemContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>Vale / Adiantamento</Text>
                        <Text style={[styles.itemPreview, valePreview <= 0 && styles.itemPreviewMuted]}>
                            {valePreview > 0
                                ? `R$ ${valePreview.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                : 'Não configurado'}
                        </Text>
                    </View>
                    <ModernSwitch
                        value={includeVale}
                        onValueChange={handleToggleVale}
                        disabled={valePreview <= 0}
                    />
                </View>
            </View>

            {/* GASTOS RECORRENTES */}
            <Text style={styles.sectionTitle}>GASTOS RECORRENTES</Text>
            <View style={styles.groupCard}>
                <View style={styles.itemContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>Lembretes Pendentes</Text>
                    </View>
                    <ModernSwitch
                        value={includeReminders}
                        onValueChange={handleToggleReminders}
                    />
                </View>
                <View style={styles.separator} />
                <View style={styles.itemContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>Assinaturas</Text>
                    </View>
                    <ModernSwitch
                        value={includeSubscriptions}
                        onValueChange={handleToggleSubscriptions}
                    />
                </View>
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
        paddingTop: 18,
        paddingBottom: 8,
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
        marginTop: 6,
        lineHeight: 18,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8E8E93',
        marginLeft: 0,
        marginBottom: 8,
        marginTop: 16,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    groupCard: {
        overflow: 'hidden',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        backgroundColor: '#171717',
    },
    itemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        minHeight: 48,
    },
    itemTitle: {
        fontSize: 16,
        color: '#F4F1EF',
        fontFamily: 'AROneSans_400Regular',
    },
    itemSubtitle: {
        fontSize: 12,
        color: '#8E8E93',
        marginTop: 1,
    },
    itemPreview: {
        fontSize: 13,
        color: '#8E8E93',
        marginTop: 1,
    },
    itemPreviewMuted: {
        color: '#5A5A5E',
        fontStyle: 'italic',
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
        marginLeft: 0,
    },
});
