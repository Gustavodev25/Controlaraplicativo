import MonthSelector from '@/components/MonthSelector';
import { RecurrenceFilterModal, RecurrenceFilterState } from '@/components/RecurrenceFilterModal';
import { ReminderModal } from '@/components/ReminderModal';
import { useCategories } from '@/hooks/use-categories';
import { AnimatedInlineBanner } from '@/components/ui/AnimatedInlineBanner';
import { IosCoreLoader } from '@/components/ui/IosCoreLoader';
import { ModalPadrao } from '@/components/ui/ModalPadrao';
import { ModernSwitch } from '@/components/ui/ModernSwitch';
import { MorphTouchable } from '@/components/ui/MorphTouchable';
import { OpenFinanceSyncBanner } from '@/components/ui/OpenFinanceSyncBanner';
import { UniversalBackground } from '@/components/UniversalBackground';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { databaseService } from '@/services/firebase';
import { notificationService } from '@/services/notifications';
import { DetectedSubscription, detectSubscriptions, formatDetectedSubscription, getDetectedSubscriptionKey } from '@/services/subscriptionDetector';
import { getCategoryConfig } from '@/utils/categoryUtils';
import { addMonths, toMonthKey } from '@/utils/monthWindow';
import { normalizeMonthKey, projectSubscriptionForMonth, summarizeProjectedSubscriptions } from '@/utils/recurrenceProjection';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import {
    Bell,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Info,
    Plus,
    Repeat2,
    Search,
    X
} from 'lucide-react-native';
import { RecurrenceActionsSheet } from '@/components/RecurrenceActionsSheet';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated as NativeAnimated,
    Easing,
    FlatList,
    Image,
    InteractionManager,
    LayoutAnimation,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';

import Animated, {
    Extrapolation,
    FadeInDown,
    FadeIn,
    FadeOut,
    interpolate,
    LinearTransition,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withSpring,
} from 'react-native-reanimated';

// — Spring configs idênticos ao MonthSelector —
const AS_SPRING_ENTRY   = { damping: 16, stiffness: 195, mass: 1.05, overshootClamping: false, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001 } as const;
const AS_SPRING_STRETCH = { damping: 12, stiffness: 165, mass: 1.1,  overshootClamping: false, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001 } as const;
const AS_SPRING_RECOIL  = { damping: 16, stiffness: 150, mass: 1.05, overshootClamping: false, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001 } as const;
const AS_SPRING_SETTLE  = { damping: 22, stiffness: 160, mass: 1,    overshootClamping: false, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.001 } as const;
const AS_LABEL_SPRING   = { damping: 18, stiffness: 260, mass: 0.7,  overshootClamping: false } as const;
const AS_PRESS_SPRING   = { damping: 16, stiffness: 360, mass: 0.5,  overshootClamping: false } as const;

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface ArrowSelectorOption { label: string; value: string | null; }

function ArrowSelector({ options, selectedValue, onChange }: {
    options: ArrowSelectorOption[];
    selectedValue: string | null;
    onChange: (value: string | null) => void;
}) {
    const currentIndex = Math.max(0, options.findIndex(o => o.value === selectedValue));
    const directionRef = useRef(0);

    const visibility    = useSharedValue(0);
    const squash        = useSharedValue(0.84);
    const contentReveal = useSharedValue(1);
    const leftPress     = useSharedValue(0);
    const rightPress    = useSharedValue(0);

    // Entry — idêntico ao MonthSelector
    useEffect(() => {
        squash.value    = 0.84;
        visibility.value = withSpring(1, AS_SPRING_ENTRY);
        squash.value    = withSequence(
            withSpring(1.085, AS_SPRING_STRETCH),
            withSpring(0.976, AS_SPRING_RECOIL),
            withSpring(1,     AS_SPRING_SETTLE),
        );
    }, []);

    // Squash/stretch ao trocar opção
    useEffect(() => {
        squash.value = withSequence(
            withSpring(1.075, AS_SPRING_STRETCH),
            withSpring(0.978, AS_SPRING_RECOIL),
            withSpring(1,     AS_SPRING_SETTLE),
        );
        contentReveal.value = 0;
        contentReveal.value = withDelay(75, withSpring(1, AS_LABEL_SPRING));
    }, [currentIndex]);

    // Container: squash + entry
    const containerStyle = useAnimatedStyle(() => {
        const pressAmount = Math.max(leftPress.value, rightPress.value);
        const stretchX = interpolate(squash.value, [0.84, 0.976, 1, 1.085], [0.92, 0.99, 1, 1.04],  Extrapolation.CLAMP);
        const stretchY = interpolate(squash.value, [0.84, 0.976, 1, 1.085], [1.08, 1.018, 1, 0.976], Extrapolation.CLAMP);
        const baseScaleX = interpolate(visibility.value, [0, 0.34, 0.68, 1], [0.18, 1.028, 0.992, 1], Extrapolation.CLAMP);
        const baseScaleY = interpolate(visibility.value, [0, 0.42, 0.78, 1], [0.18, 0.94,  1.012, 1], Extrapolation.CLAMP);
        const pressScaleX = interpolate(pressAmount, [0, 1], [1, 0.986], Extrapolation.CLAMP);
        const pressScaleY = interpolate(pressAmount, [0, 1], [1, 1.035], Extrapolation.CLAMP);
        const translateY  = interpolate(visibility.value, [0, 0.5, 0.82, 1], [14, -3, 1, 0], Extrapolation.CLAMP);
        return {
            opacity: interpolate(visibility.value, [0, 0.22, 1], [0, 0.86, 1], Extrapolation.CLAMP),
            transform: [
                { translateY },
                { scaleX: baseScaleX * stretchX * pressScaleX },
                { scaleY: baseScaleY * stretchY * pressScaleY },
            ],
        };
    });

    // Counter-squash no conteúdo interno
    const contentCounterStyle = useAnimatedStyle(() => {
        const cx = interpolate(squash.value, [0.84, 0.976, 1, 1.085], [1.09, 1.012, 1, 0.962], Extrapolation.CLAMP);
        const cy = interpolate(squash.value, [0.84, 0.976, 1, 1.085], [0.93, 0.984, 1, 1.024], Extrapolation.CLAMP);
        return { transform: [{ scaleX: cx }, { scaleY: cy }] };
    });

    // Label reveal
    const labelStyle = useAnimatedStyle(() => ({
        opacity: interpolate(contentReveal.value, [0, 0.45, 1], [0, 0.35, 1], Extrapolation.CLAMP),
        transform: [
            { translateY: interpolate(contentReveal.value, [0, 1], [4, 0],  Extrapolation.CLAMP) },
            { translateX: interpolate(contentReveal.value, [0, 1], [directionRef.current * 5, 0], Extrapolation.CLAMP) },
            { scale:      interpolate(contentReveal.value, [0, 1], [0.965, 1], Extrapolation.CLAMP) },
        ],
    }));

    // Press styles para setas
    const leftBtnStyle = useAnimatedStyle(() => ({
        opacity: interpolate(leftPress.value, [0, 1], [0.68, 1], Extrapolation.CLAMP),
        transform: [
            { translateX: interpolate(leftPress.value,  [0, 1], [0, -1.4], Extrapolation.CLAMP) },
            { scale:      interpolate(leftPress.value,  [0, 1], [1, 0.88], Extrapolation.CLAMP) },
        ],
    }));

    const rightBtnStyle = useAnimatedStyle(() => ({
        opacity: interpolate(rightPress.value, [0, 1], [0.68, 1], Extrapolation.CLAMP),
        transform: [
            { translateX: interpolate(rightPress.value, [0, 1], [0, 1.4],  Extrapolation.CLAMP) },
            { scale:      interpolate(rightPress.value, [0, 1], [1, 0.88], Extrapolation.CLAMP) },
        ],
    }));

    const handlePrev = () => {
        directionRef.current = -1;
        const prev = currentIndex === 0 ? options.length - 1 : currentIndex - 1;
        onChange(options[prev].value);
    };

    const handleNext = () => {
        directionRef.current = 1;
        const next = (currentIndex + 1) % options.length;
        onChange(options[next].value);
    };

    return (
        <Animated.View style={[styles.arrowSelector, containerStyle]}>
            <Animated.View style={[styles.arrowSelectorContent, contentCounterStyle]}>
                <AnimatedTouchableOpacity
                    onPress={handlePrev}
                    onPressIn={() => { leftPress.value = withSpring(1, AS_PRESS_SPRING); }}
                    onPressOut={() => { leftPress.value = withSpring(0, AS_PRESS_SPRING); }}
                    style={[styles.arrowSelectorBtn, leftBtnStyle]}
                    activeOpacity={0.75}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <ChevronLeft size={14} color="#F5F5F7" strokeWidth={2.4} />
                </AnimatedTouchableOpacity>

                <View style={styles.arrowSelectorLabelWrapper}>
                    <Animated.Text
                        key={options[currentIndex].label}
                        style={[styles.arrowSelectorLabel, labelStyle]}
                        numberOfLines={1}
                    >
                        {options[currentIndex].label}
                    </Animated.Text>
                </View>

                <AnimatedTouchableOpacity
                    onPress={handleNext}
                    onPressIn={() => { rightPress.value = withSpring(1, AS_PRESS_SPRING); }}
                    onPressOut={() => { rightPress.value = withSpring(0, AS_PRESS_SPRING); }}
                    style={[styles.arrowSelectorBtn, rightBtnStyle]}
                    activeOpacity={0.75}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <ChevronRight size={14} color="#F5F5F7" strokeWidth={2.4} />
                </AnimatedTouchableOpacity>
            </Animated.View>
        </Animated.View>
    );
}

const IOS_CORE_LAYOUT = LinearTransition
    .springify()
    .damping(21)
    .stiffness(245)
    .mass(0.72)
    .overshootClamping(0);

const IOS_FADE_IN = FadeIn.duration(220);
const IOS_FADE_OUT = FadeOut.duration(140);
const HEADER_CONTROL_HEIGHT = 36;

const getDismissedDetectionStorageKey = (userId: string) =>
    `@controlar:recurrence:dismissedDetections:${userId}`;

const loadDismissedDetectionKeys = async (userId: string): Promise<Set<string>> => {
    try {
        const stored = await AsyncStorage.getItem(getDismissedDetectionStorageKey(userId));
        const parsed = stored ? JSON.parse(stored) : [];
        return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []);
    } catch (error) {
        console.warn('[RecurrenceView] Error loading dismissed detections:', error);
        return new Set();
    }
};

const saveDismissedDetectionKey = async (userId: string, detectionKey: string): Promise<void> => {
    try {
        const dismissed = await loadDismissedDetectionKeys(userId);
        dismissed.add(detectionKey);
        await AsyncStorage.setItem(
            getDismissedDetectionStorageKey(userId),
            JSON.stringify(Array.from(dismissed))
        );
    } catch (error) {
        console.warn('[RecurrenceView] Error saving dismissed detection:', error);
    }
};

const triggerIOSCoreMorph = () => {
    LayoutAnimation.configureNext({
        duration: 420,
        create: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
        },
        update: {
            type: LayoutAnimation.Types.spring,
            springDamping: 0.76,
        },
        delete: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
        },
    });
};

// Habilitar LayoutAnimation no Android
if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}



type RecurrenceTab = 'subscriptions' | 'reminders';

interface RecurrenceItem {
    id: string;
    name: string;
    amount: number;
    dueDate: string; // ISO Date
    category?: string;
    type: 'subscription' | 'reminder';
    status: 'paid' | 'pending' | 'overdue';
    frequency?: 'monthly' | 'yearly';
    cancellationDate?: string; // ISO Date
    transactionType?: 'income' | 'expense';
    paidMonths?: string[];
    paid?: boolean;
    isValidated?: boolean; // Se false ou undefined, não soma nos totais
    isDetected?: boolean; // Se true, mostra botões de confirmar/excluir
    detectedData?: DetectedSubscription; // Dados da detecção original
    sourceCollection?: 'recurrences' | 'subscriptions' | 'reminders';
}

const isSameRecurrence = (left: RecurrenceItem, right: RecurrenceItem): boolean => {
    if (left.id !== right.id) return false;
    if (!left.sourceCollection || !right.sourceCollection) return true;
    return left.sourceCollection === right.sourceCollection;
};

// Helper para calcular status relative
const getDueStatus = (item: RecurrenceItem) => {
    if (item.status === 'paid') return null;

    const parseDate = (dateStr: string) => {
        // Supports YYYY-MM-DD
        const parts = dateStr.split('-');
        if (parts.length === 3) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return new Date();
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dueDate = parseDate(item.dueDate);
    const day = dueDate.getDate();
    const month = dueDate.getMonth();
    const year = dueDate.getFullYear();

    // Se for mensal, precisamos projetar para o mês atual
    // APENAS para Assinaturas (que usam lógica de paidMonths)
    // Lembretes agora confiam na data exata do banco
    if (item.frequency === 'monthly' && item.type === 'subscription') {
        // Cria data para este mês com o dia do vencimento
        const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), day);

        // Se o dia já passou neste mês, o próximo é mês que vem
        // MAS, se estamos "atrasados", pode ser que seja desse mês mesmo.
        // Como saber se é atrasado ou próximo?
        // Se item.status === 'overdue', assume que é passado.

        // Vamos simplificar: 
        // Se hoje <= dia do vencimento, o vencimento é este mês.
        // Se hoje > dia do vencimento, o vencimento foi este mês (passado).

        dueDate = thisMonthDue;
    }
    // Se for anual, usa a data exata (ou projeta para este ano se a lógica for essa, mas geralmente anual é data fixa)
    // Se for LEMBRETE, usa a data exata do banco (dueDate) que já foi atualizada na lógica simplificada

    // Calcula diferença em dias
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { label: `Vencido há ${Math.abs(diffDays)} dia(s)`, color: '#FF453A' };
    } else if (diffDays === 0) {
        return { label: 'Vence hoje', color: '#FFD60A' };
    } else if (diffDays === 1) {
        return { label: 'Falta 1 dia', color: '#FF9F0A' };
    } else if (diffDays <= 5) {
        return { label: `Faltam ${diffDays} dias`, color: '#FF9F0A' };
    }

    // Opcional: mostrar data se longe? Não pedido explicitamente, mas clean.
    return null;
};

const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const d = parseInt(parts[2]);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
};

const RecurrenceGroup = ({
    title,
    children,
    isMenuLayerOpen = false,
}: {
    title: string,
    children: React.ReactNode,
    isMenuLayerOpen?: boolean,
}) => {
    const { getCategoryName } = useCategories();
    const displayName = getCategoryName(title);
    const { icon: Icon, color, backgroundColor } = getCategoryConfig(displayName);

    return (
        <Animated.View
            entering={IOS_FADE_IN}
            layout={IOS_CORE_LAYOUT}
            style={[
                styles.groupContainer,
                isMenuLayerOpen && styles.groupOpenLayer,
            ]}
        >
            <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{displayName}</Text>
            </View>
            <View style={styles.groupList}>
                {children}
            </View>
        </Animated.View>
    );
};



// Componente para item da lista (Assinatura ou Lembrete)
const ListItem = ({
    item,
    onPay,
    onEdit,
    onDelete,
    onConfirmDetection,
    onDismissDetection,
    isSelectionMode,
    isSelected,
    onLongPress,
    onToggleSelect,
    showTutorial,
    isActionMenuOpen,
    onToggleActionMenu,
    onCloseActionMenu,
}: {
    item: RecurrenceItem,
    onPay: (item: RecurrenceItem) => void,
    onEdit: (item: RecurrenceItem) => void,
    onDelete: (item: RecurrenceItem) => void,
    onConfirmDetection?: (detection: DetectedSubscription) => void,
    onDismissDetection?: (detection: DetectedSubscription) => void,
    isSelectionMode: boolean,
    isSelected: boolean,
    onLongPress: (item: RecurrenceItem) => void,
    onToggleSelect: (item: RecurrenceItem) => void,
    showTutorial?: boolean,
    isActionMenuOpen: boolean,
    onToggleActionMenu: (item: RecurrenceItem) => void,
    onCloseActionMenu: () => void,
}) => {
    const isDetected = item.isDetected === true;
    const actionMenuOpen = isActionMenuOpen;

    // Fecha o menu de ações quando entra no modo de seleção.
    useEffect(() => {
        if (isSelectionMode && actionMenuOpen) {
            triggerIOSCoreMorph();
            onCloseActionMenu();
        }
    }, [isSelectionMode, actionMenuOpen, onCloseActionMenu]);

    const handlePress = () => {
        triggerIOSCoreMorph();

        if (isSelectionMode) {
            onToggleSelect(item);
        } else if (!isDetected) {
            onToggleActionMenu(item);
        }
    };

    const handleLongPress = () => {
        triggerIOSCoreMorph();

        if (isSelectionMode) {
            // Quando já está em modo de seleção, long press também seleciona/deseleciona
            onToggleSelect(item);
        } else if (!isDetected) {
            onLongPress(item);
        }
    };

    const handleToggleActionMenu = () => {
        triggerIOSCoreMorph();
        onToggleActionMenu(item);
    };

    const handleMenuAction = (action: (target: RecurrenceItem) => void) => {
        triggerIOSCoreMorph();
        onCloseActionMenu();
        action(item);
    };

    // Layout normal (Actions)
    return (
        <Animated.View
            entering={IOS_FADE_IN}
            exiting={IOS_FADE_OUT}
            layout={IOS_CORE_LAYOUT}
            style={[
                { marginBottom: 10 },
                actionMenuOpen && styles.listItemOpenLayer,
            ]}
        >
            <MorphTouchable
                radius={17}
                onPress={handlePress}
                onLongPress={handleLongPress}
                delayLongPress={300}
                style={[
                    styles.listItem,
                    item.status === 'paid' && styles.listItemPaid,
                    actionMenuOpen && !isSelectionMode && styles.listItemExpanded,
                    isSelected && styles.listItemSelected,
                ]}
            >
                <View style={styles.listItemPressContent}>
                {/* Checkbox de seleção */}
                {isSelectionMode && (
                    <View style={[
                        styles.selectionCheckbox,
                        isSelected && styles.selectionCheckboxSelected
                    ]}>
                        {isSelected && <Check size={12} color="#F5F5F7" strokeWidth={3} />}
                    </View>
                )}

                <View style={[styles.listItemLeft, isSelectionMode && { flex: 1 }]}>
                    <View style={{ flex: 1, flexShrink: 1 }}>
                        <Text style={styles.listItemTitle} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
                        <Text style={styles.listItemSubtitle} numberOfLines={1} ellipsizeMode="tail">
                            {item.type === 'subscription'
                                ? (item.frequency === 'monthly' ? 'Mensal' : 'Anual')
                                : formatDate(item.dueDate)}
                        </Text>
                    </View>
                </View>

                {/* Right side with value/status OR actions */}
                {!isSelectionMode && (
                    <View style={styles.listItemRight}>
                        {isDetected ? (
                            // Botões de confirmar/excluir para detecções
                            <View style={styles.detectionActions}>
                                <MorphTouchable
                                    radius={14}
                                    style={styles.dismissButton}
                                    onPress={() => {
                                        console.log('[ListItem] Dismiss clicked, detectedData:', !!item.detectedData);
                                        if (item.detectedData) {
                                            console.log('[ListItem] Calling onDismissDetection with:', item.detectedData.name);
                                            onDismissDetection?.(item.detectedData);
                                        } else {
                                            console.error('[ListItem] No detectedData found!');
                                        }
                                    }}
                                >
                                    <X size={16} color="#FF453A" />
                                    <Text style={styles.dismissButtonText}>Excluir</Text>
                                </MorphTouchable>

                                <MorphTouchable
                                    radius={14}
                                    style={styles.confirmButton}
                                    onPress={() => {
                                        console.log('[ListItem] Confirm clicked, detectedData:', !!item.detectedData);
                                        if (item.detectedData) {
                                            console.log('[ListItem] Calling onConfirmDetection with:', item.detectedData.name);
                                            onConfirmDetection?.(item.detectedData);
                                        } else {
                                            console.error('[ListItem] No detectedData found!');
                                        }
                                    }}
                                >
                                    <Check size={16} color="#F5F5F7" />
                                    <Text style={styles.confirmButtonText}>Confirmar</Text>
                                </MorphTouchable>
                            </View>
                        ) : (
                            // Value when collapsed
                            <View style={styles.listItemMetaRow}>
                                <Text
                                    style={[
                                        styles.listItemAmount,
                                        item.transactionType === 'income'
                                            ? styles.listItemAmountIncome
                                            : styles.listItemAmountExpense,
                                        item.status === 'paid' && styles.listItemAmountPaid,
                                    ]}
                                >
                                    {item.transactionType === 'income' ? '+ ' : '- '}
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
                </View>
            </MorphTouchable>
        </Animated.View>
    );
};

// Empty State
const EmptyState = ({ type }: { type: RecurrenceTab }) => {
    const isSubscription = type === 'subscriptions';

    return (
        <View style={styles.emptyRemindersContainer}>
            <Animated.Text entering={FadeInDown.duration(500).delay(100)} style={styles.emptyRemindersTitle}>
                {isSubscription ? 'Nenhuma assinatura' : 'Nenhum lembrete'}
            </Animated.Text>

            <Animated.Text entering={FadeInDown.duration(500).delay(200)} style={styles.emptyRemindersText}>
                {isSubscription
                    ? 'Você ainda não possui assinaturas cadastradas.'
                    : 'Você não tem lembretes pendentes para este mês.'}
            </Animated.Text>
        </View>
    );
};

const MiniCalendar = ({
    currentMonth,
    onChangeMonth,
    selectedDate,
    onSelectDate,
    items,
    type
}: {
    currentMonth: Date;
    onChangeMonth: (date: Date) => void;
    selectedDate: Date;
    onSelectDate: (date: Date) => void;
    items: RecurrenceItem[];
    type: RecurrenceTab;
}) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const prevMonthDays = [];
    for (let i = firstDay - 1; i >= 0; i--) {
        prevMonthDays.push({ day: daysInPrevMonth - i, isCurrentMonth: false, date: new Date(year, month - 1, daysInPrevMonth - i) });
    }

    const currentMonthDays = [];
    for (let i = 1; i <= daysInMonth; i++) {
        currentMonthDays.push({ day: i, isCurrentMonth: true, date: new Date(year, month, i) });
    }

    const nextMonthDays = [];
    const totalSlots = 42;
    const remainingSlots = totalSlots - (prevMonthDays.length + currentMonthDays.length);
    for (let i = 1; i <= remainingSlots; i++) {
        nextMonthDays.push({ day: i, isCurrentMonth: false, date: new Date(year, month + 1, i) });
    }

    const allDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

    const hasItem = (date: Date) => {
        return items.some(item => {
            const [y, m, d] = item.dueDate.split('-').map(Number);

            if (item.frequency === 'monthly') {
                return d === date.getDate();
            } else {
                // Para anual, checa dia e mês
                // Assumindo que item.dueDate é a data base. 
                return d === date.getDate() && (m - 1) === date.getMonth();
            }
        });
    };

    return (
        <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
                <MorphTouchable
                    radius={16}
                    onPress={() => onChangeMonth(new Date(year, month - 1, 1))}
                    style={styles.calendarArrow}
                >
                    <ChevronLeft size={20} color="#F5F5F7" />
                </MorphTouchable>
                <Text style={styles.calendarMonthTitle}>{months[month]} {year}</Text>
                <MorphTouchable
                    radius={16}
                    onPress={() => onChangeMonth(new Date(year, month + 1, 1))}
                    style={styles.calendarArrow}
                >
                    <ChevronRight size={20} color="#F5F5F7" />
                </MorphTouchable>
            </View>

            <View style={styles.weekDaysRow}>
                {weekDays.map(day => (
                    <Text key={day} style={styles.weekDayText}>{day}</Text>
                ))}
            </View>

            <View style={styles.daysGrid}>
                {allDays.map((dayObj, index) => {
                    const isSelected = selectedDate.getDate() === dayObj.date.getDate() &&
                        selectedDate.getMonth() === dayObj.date.getMonth() &&
                        selectedDate.getFullYear() === dayObj.date.getFullYear();

                    const isToday = new Date().toDateString() === dayObj.date.toDateString();
                    const hasEvent = hasItem(dayObj.date);

                    return (
                        <MorphTouchable
                            key={index}
                            radius={12}
                            style={[
                                styles.dayCell,
                                isSelected && styles.dayCellSelected,
                                !dayObj.isCurrentMonth && { opacity: 0.3 }
                            ]}
                            onPress={() => onSelectDate(dayObj.date)}
                        >
                            <Text style={[
                                styles.dayText,
                                isSelected && styles.dayTextSelected,
                                isToday && !isSelected && { color: '#D97757', fontWeight: '600' }
                            ]}>
                                {dayObj.day}
                            </Text>
                            {hasEvent && (
                                <View style={[
                                    styles.eventDot,
                                    { backgroundColor: '#D97757' }
                                ]} />
                            )}
                        </MorphTouchable>
                    );
                })}
            </View>
        </View>
    );
};

export function RecurrenceView({ initialTab = 'subscriptions' }: { initialTab?: RecurrenceTab }) {
    const { user, profile } = useAuthContext();
    const { showError, showSuccess } = useToast();
    const { getCategoryName } = useCategories();
    const [selectedTab, setSelectedTab] = useState<RecurrenceTab>(initialTab);
    const [items, setItems] = useState<RecurrenceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [reminderModalVisible, setReminderModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<RecurrenceItem | null>(null);
    const [showTutorial, setShowTutorial] = useState(false);
    const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

    // Calendar Mode State
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [displayedMonth, setDisplayedMonth] = useState(new Date());

    // Month Selector State
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const selectedMonthKey = useMemo(() => toMonthKey(selectedMonth), [selectedMonth]);

    const minDate = useMemo(() => addMonths(new Date(), -60), []); // 5 years back
    const maxDate = useMemo(() => addMonths(new Date(), 60), []); // 5 years forward

    // Delete Confirmation State
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<RecurrenceItem | null>(null);

    // Filter State
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [filters, setFilters] = useState<RecurrenceFilterState>({
        search: '',
        status: [],
        transactionType: []
    });

    const activeFilterCount = (filters.search ? 1 : 0) + filters.status.length + filters.transactionType.length;

    // Estados de seleção múltipla
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

    // Estados de detecção de assinaturas
    const [detectedSubscriptions, setDetectedSubscriptions] = useState<DetectedSubscription[]>([]);
    const paymentAlertsEnabled = profile?.preferences?.paymentAlertsEnabled ?? true;

    useEffect(() => {
        if (initialTab === selectedTab) return;

        triggerIOSCoreMorph();
        setSelectedTab(initialTab);
    }, [initialTab, selectedTab]);

    const closeActionMenu = () => {
        setOpenActionMenuId(null);
    };

    const toggleActionMenu = (item: RecurrenceItem) => {
        setOpenActionMenuId((current) => (current === item.id ? null : item.id));
    };

    // Limpa seleção ao trocar de aba
    useEffect(() => {
        setSelectedIds(new Set());
        setIsSelectionMode(false);
        setShowBulkDeleteConfirm(false);
        setOpenActionMenuId(null);
    }, [selectedTab]);

    useEffect(() => {
        setOpenActionMenuId(null);
    }, [viewMode, selectedMonth, calendarDate, filters.search, filters.status, filters.transactionType]);


    useEffect(() => {
        if (!user) return;

        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
        const timer = setTimeout(() => {
            task = InteractionManager.runAfterInteractions(() => {
                if (cancelled) return;

                unsubscribe = databaseService.onRecurrencesChange(user.uid, (data) => {
                    if (cancelled) return;
                    setItems(data as RecurrenceItem[]);
                    setLoading(false);
                    setRefreshing(false);
                });
            });
        }, 180);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            task?.cancel?.();
            unsubscribe?.();
        };
    }, [user]);

    // Reschedule notifications whenever items or preferences change
    useEffect(() => {
        if (!user?.uid || loading || items.length === 0) return;

        let cancelled = false;
        let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
        const timer = setTimeout(() => {
            task = InteractionManager.runAfterInteractions(() => {
                if (cancelled) return;
                notificationService.reschedulePaymentAlerts({
                    userId: user.uid,
                    enabled: paymentAlertsEnabled,
                    recurrences: items,
                    plan: profile?.subscription || null,
                });
            });
        }, 500);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            task?.cancel?.();
        };
    }, [user?.uid, loading, paymentAlertsEnabled, items, profile?.subscription]);

    // Detecta assinaturas automaticamente
    useEffect(() => {
        setDetectedSubscriptions([]);
    }, [user?.uid, selectedTab, items.length]);

    /*
    useEffect(() => {
        const detectSubscriptionsAuto = async () => {
            if (!user || loading || selectedTab !== 'subscriptions') return;

            try {
                console.log('[RecurrenceView] Running auto detection...');

                // Busca transações bancárias
                const accountsResult = await databaseService.getAccounts(user.uid);
                if (!accountsResult.success || !accountsResult.data || accountsResult.data.length === 0) {
                    return;
                }

                // Coleta transações
                const allTransactions: any[] = [];
                for (const account of accountsResult.data) {
                    if (account.type === 'CHECKING_ACCOUNT' && account.transactions) {
                        allTransactions.push(...account.transactions);
                    }
                }

                if (allTransactions.length === 0) return;

                // Formata transações
                const formattedTransactions = allTransactions.map(t => ({
                    id: t.id,
                    description: t.description || t.name || 'Transação',
                    amount: Math.abs(t.amount),
                    date: t.date,
                    type: t.amount < 0 ? 'expense' as const : 'income' as const
                }));

                // Detecta assinaturas
                const detected = detectSubscriptions(formattedTransactions);
                console.log('[RecurrenceView] Detected', detected.length, 'subscriptions');
                const dismissedDetectionKeys = await loadDismissedDetectionKeys(user.uid);

                // Filtra apenas novas (que não existem)
                const existingNames = items
                    .filter(i => i.type === 'subscription' && i.isValidated !== false)
                    .map(i => i.name.toLowerCase().trim());
                const existingDetectionKeys = new Set(
                    items
                        .filter(i => i.type === 'subscription' && i.isValidated !== false)
                        .map(i => getDetectedSubscriptionKey({
                            name: i.name,
                            frequency: i.frequency || 'monthly',
                        }))
                );

                const newDetections = detected.filter((det: DetectedSubscription) => {
                    const detectionKey = getDetectedSubscriptionKey(det);
                    if (dismissedDetectionKeys.has(detectionKey)) return false;
                    if (existingDetectionKeys.has(detectionKey)) return false;

                    const detName = det.name.toLowerCase().trim();
                    return !existingNames.some(name =>
                        detName.includes(name) || name.includes(detName)
                    );
                });

                console.log('[RecurrenceView] New detections:', newDetections.length);
                triggerIOSCoreMorph();
                setDetectedSubscriptions(newDetections);
            } catch (error) {
                console.error('[RecurrenceView] Error detecting:', error);
            }
        };

        let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
        const timer = setTimeout(() => {
            task = InteractionManager.runAfterInteractions(() => {
                void detectSubscriptionsAuto();
            });
        }, 650);

        return () => {
            clearTimeout(timer);
            task?.cancel?.();
        };
    }, [user?.uid, loading, selectedTab, items]);
    */

    const handleOptionPay = async (item: RecurrenceItem) => {
        if (!user) return;

        triggerIOSCoreMorph();

        const nextStatus = item.status === 'paid' ? 'pending' : 'paid';
        const result = item.status === 'paid'
            ? await databaseService.unpayRecurrence(user.uid, item)
            : await databaseService.payRecurrence(user.uid, item);

        if (!result?.success) {
            showError('Não foi possível atualizar o pagamento', result?.error);
            return;
        }

        const paymentMonth = normalizeMonthKey(item.dueDate) || selectedMonthKey;
        setItems(current => current.map(currentItem => {
            if (!isSameRecurrence(currentItem, item)) return currentItem;

            const updatedItem: RecurrenceItem = {
                ...currentItem,
                status: nextStatus,
                paid: nextStatus === 'paid',
            };

            if (currentItem.type === 'subscription') {
                const paidMonths = Array.isArray(currentItem.paidMonths)
                    ? currentItem.paidMonths
                    : [];

                updatedItem.paidMonths = nextStatus === 'paid'
                    ? Array.from(new Set([...paidMonths.map(month => normalizeMonthKey(month) || month), paymentMonth]))
                    : paidMonths.filter(month => normalizeMonthKey(month) !== paymentMonth);
            }

            return updatedItem;
        }));

        showSuccess(
            item.status === 'paid'
                ? 'Pagamento revertido'
                : item.type === 'reminder'
                    ? 'Lembrete concluído'
                    : 'Compra marcada como paga'
        );
    };

    const handleOptionDelete = (item: RecurrenceItem) => {
        triggerIOSCoreMorph();
        setItemToDelete(item);
        setDeleteModalVisible(true);
    };

    const handleCancelDelete = () => {
        triggerIOSCoreMorph();
        setDeleteModalVisible(false);
        setItemToDelete(null);
    };

    const handleConfirmDelete = async () => {
        const target = itemToDelete;
        triggerIOSCoreMorph();
        setDeleteModalVisible(false);
        setItemToDelete(null);

        if (!user || !target) return;

        const result = await databaseService.deleteRecurrence(
            user.uid,
            target.id,
            target.type,
            target.sourceCollection
        );

        if (!result?.success) {
            const errorMessage = result && 'error' in result ? result.error : undefined;
            console.error('[RecurrenceView] Error deleting recurrence:', errorMessage);
            return;
        }

        setItems(current => current.filter(item => !isSameRecurrence(item, target)));
    };

    const handleOptionEdit = (item: RecurrenceItem) => {
        triggerIOSCoreMorph();
        setEditingItem(item);
        setReminderModalVisible(true);
    };

    const handleSaveReminder = async (data: { title: string; amount: number; date: string; frequency: 'monthly' | 'yearly'; cancellationReminder?: boolean; type: 'income' | 'expense'; category: string }) => {
        if (!user) return;

        const [dayRaw, monthRaw, year] = data.date.split('/');
        const day = dayRaw.padStart(2, '0');
        const month = monthRaw.padStart(2, '0');
        const dueDate = `${year}-${month}-${day}`;

        let cancellationDate = null;
        if (data.cancellationReminder) {
            // Calculate cancellation date (1 day before due date)
            // Note: Since dueDate is just a string without time, we treat it as local date.
            const dueObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            dueObj.setDate(dueObj.getDate() - 1); // 1 day before

            const cYear = dueObj.getFullYear();
            const cMonth = String(dueObj.getMonth() + 1).padStart(2, '0');
            const cDay = String(dueObj.getDate()).padStart(2, '0');
            cancellationDate = `${cYear}-${cMonth}-${cDay}`;
        }

        const type = selectedTab === 'subscriptions' ? 'subscription' : 'reminder';

        triggerIOSCoreMorph();

        const recurrenceData = {
            name: data.title,
            amount: data.amount,
            dueDate: dueDate,
            type: type,
            status: 'pending',
            frequency: data.frequency,
            cancellationDate: cancellationDate,
            transactionType: data.type, // Add explicit transaction type (income/expense)
            category: data.category, // Add selected category
            isValidated: true // Assinaturas criadas manualmente são sempre validadas
        };

        if (editingItem) {
            await databaseService.updateRecurrence(user.uid, editingItem.id, recurrenceData, editingItem.type);
            setEditingItem(null);
        } else {
            await databaseService.addRecurrence(user.uid, recurrenceData);
        }
    };

    // Funções de seleção múltipla
    const handleLongPress = (item: RecurrenceItem) => {
        triggerIOSCoreMorph();
        setIsSelectionMode(true);
        setSelectedIds(new Set([item.id]));
        setShowBulkDeleteConfirm(false);
    };

    const handleToggleSelect = (item: RecurrenceItem) => {
        triggerIOSCoreMorph();
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(item.id)) {
                newSet.delete(item.id);
                // Se não tiver mais selecionados, sai do modo seleção
                if (newSet.size === 0) {
                    setIsSelectionMode(false);
                    setShowBulkDeleteConfirm(false);
                }
            } else {
                newSet.add(item.id);
            }
            return newSet;
        });
    };

    const handleCancelSelection = () => {
        triggerIOSCoreMorph();
        setSelectedIds(new Set());
        setIsSelectionMode(false);
        setShowBulkDeleteConfirm(false);
    };

    const handleDeleteSelected = () => {
        triggerIOSCoreMorph();
        setShowBulkDeleteConfirm(true);
    };

    const confirmBulkDelete = async () => {
        if (!user || selectedIds.size === 0) return;

        const idsToDelete = Array.from(selectedIds);
        triggerIOSCoreMorph();
        setSelectedIds(new Set());
        setIsSelectionMode(false);
        setShowBulkDeleteConfirm(false);

        // Deleta todos os itens selecionados
        const promises = idsToDelete.map(async id => {
            const item = items.find(i => i.id === id);
            if (item) {
                const result = await databaseService.deleteRecurrence(
                    user.uid,
                    id,
                    item.type,
                    item.sourceCollection
                );
                return { item, result };
            }
            return { item: null, result: { success: true } };
        });

        const results = await Promise.all(promises);
        const deletedItems = results
            .filter(({ item, result }) => item && result?.success)
            .map(({ item }) => item as RecurrenceItem);

        if (deletedItems.length > 0) {
            setItems(current => current.filter(
                candidate => !deletedItems.some(deleted => isSameRecurrence(candidate, deleted))
            ));
        }

        const failed = results.find(({ result }) => !result?.success);
        if (failed) {
            const errorMessage = 'error' in failed.result ? failed.result.error : undefined;
            console.error('[RecurrenceView] Error deleting selected recurrences:', errorMessage);
        }
    };

    // Handlers para assinaturas detectadas
    const handleConfirmDetection = async (detection: DetectedSubscription) => {
        if (!user) return;

        try {
            console.log('[RecurrenceView] Confirming detection:', detection.name);
            const formattedData = formatDetectedSubscription(detection);
            await databaseService.addRecurrence(user.uid, formattedData);

            // Remove da lista de detecções
            triggerIOSCoreMorph();
            setDetectedSubscriptions(prev => prev.filter(d => d.id !== detection.id));
        } catch (error) {
            console.error('Erro ao confirmar assinatura:', error);
        }
    };

    const handleDismissDetection = async (detection: DetectedSubscription) => {
        console.log('[RecurrenceView] Dismissing detection:', detection.name);
        console.log('[RecurrenceView] Current detections:', detectedSubscriptions.length);

        // Remove da lista de detecções
        triggerIOSCoreMorph();
        setDetectedSubscriptions(prev => {
            const filtered = prev.filter(d => d.id !== detection.id);
            console.log('[RecurrenceView] After dismiss:', filtered.length);
            return filtered;
        });

        if (user?.uid) {
            await saveDismissedDetectionKey(user.uid, getDetectedSubscriptionKey(detection));
        }
    };

    const onRefresh = () => {
        triggerIOSCoreMorph();
        setRefreshing(true);
        // Trigger a re-fetch inside the listener if needed, or just let it be. 
        // For real-time, refresh is usually not needed unless we force a reload.
        // We can force reload by simulating a change or just re-setting the listener.
        // For now, simpliest way is to toggle a refresh trigger but the listener is persistent.
        // Let's just unset refreshing after a timeout since it's real-time.
        setTimeout(() => setRefreshing(false), 1000);
    };

    const filteredItems = useMemo(() => {
        let result = items.filter(item =>
            selectedTab === 'subscriptions'
                ? item.type === 'subscription'
                : item.type === 'reminder'
        );

        // Adiciona detecções como items temporários (apenas para subscriptions)
        // Filter and Project by Month
        result = result.map(item => {
            // Se é uma detecção, não precisa projetar
            if (item.isDetected) {
                return item;
            }

            if (item.type === 'subscription') {
                return projectSubscriptionForMonth(item, selectedMonthKey);
            }

            const [y, m] = item.dueDate.split('-').map(Number);
            const selectedYear = selectedMonth.getFullYear();
            const selectedMonthIndex = selectedMonth.getMonth();

            // REMINDERS: Discrete document model (new doc created on payment).
            // Do NOT project. Strictly filter by stored dueDate.
            // Include past pending reminders in the current month view.
            if ((m - 1) === selectedMonthIndex && y === selectedYear) {
                return item;
            }

            const itemMonthValue = y * 12 + (m - 1);
            const selectedMonthValue = selectedYear * 12 + selectedMonthIndex;

            if (item.status !== 'paid' && itemMonthValue < selectedMonthValue) {
                return item;
            }

            // Fallback for any other cases (should be covered above)
            return null;
        }).filter((item): item is RecurrenceItem => item !== null);

        // Apply Filters
        if (activeFilterCount > 0) {
            result = result.filter(item => {
                let matches = true;

                // Search
                if (filters.search) {
                    matches = matches && item.name.toLowerCase().includes(filters.search.toLowerCase());
                }

                // Status
                if (filters.status.length > 0) {
                    matches = matches && filters.status.includes(item.status);
                }

                // Transaction Type (income/expense)
                if (filters.transactionType.length > 0) {
                    matches = matches && !!item.transactionType && filters.transactionType.includes(item.transactionType);
                }

                return matches;
            });
        }

        // Sort by day
        result.sort((a, b) => {
            const dayA = parseInt(a.dueDate.split('-')[2]);
            const dayB = parseInt(b.dueDate.split('-')[2]);
            return dayA - dayB;
        });

        return result;
    }, [items, filters, activeFilterCount, selectedMonth, selectedMonthKey, selectedTab]);

    const openActionMenuItem = useMemo(() => {
        if (!openActionMenuId) return null;

        return filteredItems.find(item => item.id === openActionMenuId)
            || items.find(item => item.id === openActionMenuId)
            || null;
    }, [filteredItems, items, openActionMenuId]);

    const groupedItems = useMemo(() => {
        if (filteredItems.length === 0) return [];

        const groups: { title: string; items: RecurrenceItem[] }[] = [];

        filteredItems.forEach(item => {
            const categoryKey = item.category || '';
            let group = groups.find(g => g.title === categoryKey);
            if (!group) {
                group = { title: categoryKey, items: [] };
                groups.push(group);
            }
            group.items.push(item);
        });

        // Sort groups alphabetically by display name
        groups.sort((a, b) => {
            const nameA = getCategoryName(a.title);
            const nameB = getCategoryName(b.title);
            return nameA.localeCompare(nameB);
        });

        return groups;
    }, [filteredItems, getCategoryName]);

    const reminderCount = useMemo(() => {
        return items.filter(i => i.type === 'reminder' && i.status !== 'paid').length;
    }, [items]);

    // Check tutorial - Moved here to verify filteredItems availability
    useEffect(() => {
        const checkTutorial = async () => {
            if (loading || filteredItems.length === 0) return;

            try {
                // Key with _v2 to force reset
                const hasShown = await AsyncStorage.getItem('hasShownLongPressTutorial_v3');
                if (!hasShown) {
                    setShowTutorial(true);
                }
            } catch (error) {
                console.error(error);
            }
        };

        checkTutorial();
    }, [loading, filteredItems]);

    const dismissTutorial = async () => {
        setShowTutorial(false);
        await AsyncStorage.setItem('hasShownLongPressTutorial_v3', 'true');
    };

    const totals = useMemo(() => {
        if (selectedTab === 'subscriptions') {
            const subscriptionTotals = summarizeProjectedSubscriptions(filteredItems, selectedMonthKey);

            const yearlyEstimation = items
                .filter(i => i.type === 'subscription' && i.isValidated !== false && i.transactionType !== 'income')
                .reduce((acc, item) => {
                    const amount = Number(item.amount) || 0;
                    if (item.cancellationDate) {
                        const [y, m, d] = item.cancellationDate.split('-').map(Number);
                        const cDate = new Date(y, m - 1, d);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        if (cDate < today) return acc;
                    }

                    if (item.frequency === 'monthly') return acc + (amount * 12);
                    return acc + amount;
                }, 0);

            return {
                monthlyTotal: subscriptionTotals.expenseTotal,
                monthlyPaid: subscriptionTotals.expensePaid,
                monthlyRemaining: subscriptionTotals.expensePending,
                yearlyEstimation,
                incomeTotal: subscriptionTotals.incomeTotal,
                incomeReceived: subscriptionTotals.incomeReceived,
                incomePending: subscriptionTotals.incomePending,
            };
        } else {
            let expensePending = 0;
            let expensePaid = 0;
            let incomePending = 0;
            let incomeReceived = 0;

            // Filtra apenas lembretes validados
            const validatedItems = filteredItems.filter(item => item.isValidated !== false);

            validatedItems.forEach(item => {
                const amount = Number(item.amount) || 0;
                const isIncome = item.transactionType === 'income';
                const isPaid = item.status === 'paid';

                if (isIncome) {
                    if (isPaid) incomeReceived += amount;
                    else incomePending += amount;
                } else {
                    if (isPaid) expensePaid += amount;
                    else expensePending += amount;
                }
            });

            return {
                expenseTotal: expensePending + expensePaid,
                expensePaid,
                expensePending,
                incomeTotal: incomePending + incomeReceived,
                incomeReceived,
                incomePending
            };
        }
    }, [filteredItems, items, selectedMonthKey, selectedTab]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const renderSummaryCard = () => (
        <Animated.View entering={IOS_FADE_IN} layout={IOS_CORE_LAYOUT} style={styles.summaryCard}>
            {selectedTab === 'subscriptions' ? (
                <>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryItemLabel}>Gasto Total</Text>
                            <View style={styles.summaryItemValueRow}>
                                <Text style={styles.summaryItemValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).monthlyTotal || 0)}</Text>
                            </View>
                        </View>
                        <View style={styles.summaryItemDivider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryItemLabel}>Pago</Text>
                            <View style={styles.summaryItemValueRow}>
                                <Text style={styles.summaryItemValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).monthlyPaid || 0)}</Text>
                            </View>
                        </View>
                        <View style={styles.summaryItemDivider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryItemLabel}>A pagar</Text>
                            <View style={styles.summaryItemValueRow}>
                                <Text style={[styles.summaryItemValue, styles.summaryItemValueAccent]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).monthlyRemaining || 0)}</Text>
                            </View>
                        </View>
                    </View>
                    {((totals as any).incomeTotal || 0) > 0 && (
                        <>
                            <View style={styles.summaryRowDivider} />
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryItemLabel}>Receber Total</Text>
                                    <View style={styles.summaryItemValueRow}>
                                        <Text style={styles.summaryItemValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).incomeTotal || 0)}</Text>
                                    </View>
                                </View>
                                <View style={styles.summaryItemDivider} />
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryItemLabel}>Recebido</Text>
                                    <View style={styles.summaryItemValueRow}>
                                        <Text style={styles.summaryItemValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).incomeReceived || 0)}</Text>
                                    </View>
                                </View>
                                <View style={styles.summaryItemDivider} />
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryItemLabel}>A receber</Text>
                                    <View style={styles.summaryItemValueRow}>
                                        <Text style={[styles.summaryItemValue, styles.summaryItemValueIncome]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).incomePending || 0)}</Text>
                                    </View>
                                </View>
                            </View>
                        </>
                    )}
                </>
            ) : (
                <>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryItemLabel}>Gasto Total</Text>
                            <View style={styles.summaryItemValueRow}>
                                <Text style={styles.summaryItemValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).expenseTotal || 0)}</Text>
                            </View>
                        </View>
                        <View style={styles.summaryItemDivider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryItemLabel}>Pago</Text>
                            <View style={styles.summaryItemValueRow}>
                                <Text style={styles.summaryItemValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).expensePaid || 0)}</Text>
                            </View>
                        </View>
                        <View style={styles.summaryItemDivider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryItemLabel}>A pagar</Text>
                            <View style={styles.summaryItemValueRow}>
                                <Text style={[styles.summaryItemValue, styles.summaryItemValueAccent]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).expensePending || 0)}</Text>
                            </View>
                        </View>
                    </View>
                    {((totals as any).incomeTotal || 0) > 0 && (
                        <>
                            <View style={styles.summaryRowDivider} />
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryItemLabel}>Receber Total</Text>
                                    <View style={styles.summaryItemValueRow}>
                                        <Text style={styles.summaryItemValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).incomeTotal || 0)}</Text>
                                    </View>
                                </View>
                                <View style={styles.summaryItemDivider} />
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryItemLabel}>Recebido</Text>
                                    <View style={styles.summaryItemValueRow}>
                                        <Text style={styles.summaryItemValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).incomeReceived || 0)}</Text>
                                    </View>
                                </View>
                                <View style={styles.summaryItemDivider} />
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryItemLabel}>A receber</Text>
                                    <View style={styles.summaryItemValueRow}>
                                        <Text style={[styles.summaryItemValue, styles.summaryItemValueIncome]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency((totals as any).incomePending || 0)}</Text>
                                    </View>
                                </View>
                            </View>
                        </>
                    )}
                </>
            )}
        </Animated.View>
    );

    const renderTutorialBanner = () => {
        if (!showTutorial) return null;

        return (
            <Animated.View
                entering={FadeIn.duration(400)}
                exiting={FadeOut.duration(300)}
                style={styles.tutorialBanner}
            >
                <View style={styles.tutorialBannerContent}>
                    <Info size={16} color="#D97757" style={styles.tutorialBannerIcon} />
                    <Text style={styles.tutorialBannerText}>
                        Segure um item para selecionar e gerenciar múltiplos vencimentos.
                    </Text>
                </View>
                <TouchableOpacity onPress={dismissTutorial} style={styles.tutorialBannerClose}>
                    <X size={14} color="#8E8E93" />
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const handleSelectedMonthChange = (month: Date) => {
        triggerIOSCoreMorph();
        setSelectedMonth(month);
    };

    const handleCalendarOptionChange = (enabled: boolean) => {
        triggerIOSCoreMorph();
        setViewMode(enabled ? 'calendar' : 'list');
    };

    const handleDisplayedMonthChange = (month: Date) => {
        triggerIOSCoreMorph();
        setDisplayedMonth(month);
    };

    const handleCalendarDateSelect = (date: Date) => {
        triggerIOSCoreMorph();
        setCalendarDate(date);
    };

    const handleApplyFilters = (nextFilters: RecurrenceFilterState) => {
        triggerIOSCoreMorph();
        setFilters(nextFilters);
    };


    return (
        <View style={styles.container}>
            <View style={StyleSheet.absoluteFill}>
                <UniversalBackground
                    backgroundColor="#0A0A0A"
                    glowSize={350}
                    showParticles={true}
                    particleCount={15}
                />
            </View>

            <View style={styles.content}>


                <View style={styles.header}>
                    <View style={styles.headerTitleRow}>
                        <Image
                            source={require('@/assets/images/icon.png')}
                            style={styles.headerIcon}
                            resizeMode="contain"
                        />
                        <Text style={styles.screenHeader} numberOfLines={1}>
                            {selectedTab === 'subscriptions' ? 'Assinaturas' : 'Lembretes'}
                        </Text>
                    </View>

                </View>

                <View style={styles.subHeader}>
                    <MonthSelector
                        currentMonth={selectedMonth}
                        onMonthChange={handleSelectedMonthChange}
                        minDate={minDate}
                        maxDate={maxDate}
                        allowFuture={true}
                    />

                    <View style={styles.subHeaderActions}>
                        <MorphTouchable
                            radius={12}
                            style={styles.calendarToggleButton}
                            onPress={() => handleCalendarOptionChange(viewMode !== 'calendar')}
                        >
                            <CalendarDays size={17} color={viewMode === 'calendar' ? '#F5F5F7' : '#A1A1A6'} strokeWidth={2.2} />
                        </MorphTouchable>
                        <MorphTouchable
                            radius={HEADER_CONTROL_HEIGHT / 2}
                            onPress={() => setReminderModalVisible(true)}
                            style={styles.headerButton}
                        >
                            <Plus size={17} color="#FFFFFF" strokeWidth={2.6} />
                            <Text style={styles.headerButtonText}>Novo</Text>
                        </MorphTouchable>
                    </View>
                </View>

                <View style={styles.filterBarRow}>
                    <View style={styles.filterSearchBar}>
                        <Search size={15} color="#555" />
                        <TextInput
                            style={styles.filterSearchInput}
                            value={filters.search}
                            onChangeText={(t) => setFilters(prev => ({ ...prev, search: t }))}
                            placeholder="Buscar..."
                            placeholderTextColor="#555"
                        />
                        {filters.search.length > 0 && (
                            <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, search: '' }))}>
                                <X size={14} color="#8E8E93" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <ArrowSelector
                        options={[
                            { label: 'Status', value: null },
                            { label: 'Pendente', value: 'pending' },
                            { label: 'Pago', value: 'paid' },
                            { label: 'Atrasado', value: 'overdue' },
                        ]}
                        selectedValue={filters.status[0] ?? null}
                        onChange={(value) => {
                            triggerIOSCoreMorph();
                            setFilters(prev => ({ ...prev, status: value ? [value] : [] }));
                        }}
                    />
                </View>

                <OpenFinanceSyncBanner />

                {!loading && renderSummaryCard()}
                {!loading && renderTutorialBanner()}

                <View style={styles.listContainer}>







                    {loading ? (
                        <IosCoreLoader />
                    ) : viewMode === 'calendar' ? (
                        <View style={{ flex: 1 }}>
                            <FlatList
                                extraData={{ isSelectionMode, selectedIds, openActionMenuId }}
                                data={filteredItems.filter(item => {
                                    const parts = item.dueDate.split('-');
                                    if (parts.length < 3) return false;
                                    const d = parseInt(parts[2]);
                                    const m = parseInt(parts[1]) - 1;

                                    const isSameDay = d === calendarDate.getDate();

                                    if (item.frequency === 'monthly') {
                                        return isSameDay;
                                    } else {
                                        return isSameDay && m === calendarDate.getMonth();
                                    }
                                })}
                                CellRendererComponent={({ item, children, style, ...rest }: any) => {
                                    const isOpen = openActionMenuId === item?.id;
                                    return (
                                        <View
                                            {...rest}
                                            style={[style, isOpen && styles.listCellOpenLayer]}
                                        >
                                            {children}
                                        </View>
                                    );
                                }}
                                renderItem={({ item }) => (
                                    <ListItem
                                        item={item}
                                        onPay={handleOptionPay}
                                        onEdit={handleOptionEdit}
                                        onDelete={handleOptionDelete}
                                        isSelectionMode={isSelectionMode}
                                        isSelected={selectedIds.has(item.id)}
                                        onLongPress={handleLongPress}
                                        onToggleSelect={handleToggleSelect}
                                        showTutorial={false}
                                        isActionMenuOpen={openActionMenuId === item.id}
                                        onToggleActionMenu={toggleActionMenu}
                                        onCloseActionMenu={closeActionMenu}
                                    />
                                )}
                                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                                keyExtractor={item => 'cal_' + item.id}
                                contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
                                removeClippedSubviews={false}
                                showsVerticalScrollIndicator={false}
                                ListEmptyComponent={
                                    <View style={{ padding: 20, alignItems: 'center' }}>
                                        <Animated.Text entering={FadeInDown.duration(500).delay(100)} style={{ color: '#6E6E73', fontSize: 14 }}>Nenhum vencimento neste dia</Animated.Text>
                                        <Animated.Text entering={FadeInDown.duration(500).delay(200)} style={{ color: '#555', fontSize: 12, marginTop: 4 }}>
                                            Toque no botão + para adicionar
                                        </Animated.Text>
                                    </View>
                                }
                                ListHeaderComponent={
                                    <>
                                        <MiniCalendar
                                            currentMonth={displayedMonth}
                                            onChangeMonth={handleDisplayedMonthChange}
                                            selectedDate={calendarDate}
                                            onSelectDate={handleCalendarDateSelect}
                                            items={filteredItems}
                                            type={selectedTab}
                                        />
                                        <Text style={[styles.sectionTitle, { marginTop: 24, paddingHorizontal: 4 }]}>
                                            {calendarDate.getDate()} de {calendarDate.toLocaleDateString('pt-BR', { month: 'long' })}
                                        </Text>
                                    </>
                                }
                            />
                        </View>
                    ) : groupedItems.length > 0 ? (
                        <FlatList
                            extraData={{ isSelectionMode, selectedIds, openActionMenuId }}
                            data={groupedItems}
                            CellRendererComponent={({ item, children, style, ...rest }: any) => {
                                const isOpen = item?.items?.some((groupItem: RecurrenceItem) => groupItem.id === openActionMenuId);
                                return (
                                    <View
                                        {...rest}
                                        style={[style, isOpen && styles.listCellOpenLayer]}
                                    >
                                        {children}
                                    </View>
                                );
                            }}
                            renderItem={({ item: group }) => {
                                const isGroupMenuOpen = group.items.some((item) => item.id === openActionMenuId);

                                return (
                                    <RecurrenceGroup title={group.title} isMenuLayerOpen={isGroupMenuOpen}>
                                        {group.items.map((item) => (
                                            <ListItem
                                                key={item.id}
                                                item={item}
                                                onPay={handleOptionPay}
                                                onEdit={handleOptionEdit}
                                                onDelete={handleOptionDelete}
                                                isSelectionMode={isSelectionMode}
                                                isSelected={selectedIds.has(item.id)}
                                                // Se tem tutorial, intercepta o long press para dispensar
                                                onLongPress={(item) => {
                                                    if (showTutorial) {
                                                        dismissTutorial();
                                                    }
                                                    handleLongPress(item);
                                                }}
                                                onToggleSelect={handleToggleSelect}
                                                showTutorial={showTutorial}
                                                isActionMenuOpen={openActionMenuId === item.id}
                                                onToggleActionMenu={toggleActionMenu}
                                                onCloseActionMenu={closeActionMenu}
                                            />
                                        ))}
                                    </RecurrenceGroup>
                                );
                            }}
                            ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
                            keyExtractor={item => item.title}
                            contentContainerStyle={{ paddingBottom: 100 }}
                            removeClippedSubviews={false}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    tintColor="#D97757"
                                />
                            }
                            ListHeaderComponent={null}
                        />
                    ) : (
                        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                            <EmptyState type={selectedTab} />
                        </ScrollView>
                    )}
                </View>
            </View>

            {/* Banner inline - seleção múltipla */}
            <AnimatedInlineBanner
                show={isSelectionMode}
                step={showBulkDeleteConfirm ? 'error' : 'success'}
                statusText={`${selectedIds.size} selecionado${selectedIds.size > 1 ? 's' : ''}`}
                error={`Excluir ${selectedIds.size} ite${selectedIds.size > 1 ? 'ns' : 'm'}?`}
                centerActions={showBulkDeleteConfirm}
                actions={{
                    cancelLabel: showBulkDeleteConfirm ? 'Não' : 'Cancelar',
                    confirmLabel: showBulkDeleteConfirm ? 'Excluir' : 'Remover',
                    onCancel: showBulkDeleteConfirm
                        ? handleCancelSelection
                        : handleCancelSelection,
                    onConfirm: showBulkDeleteConfirm ? confirmBulkDelete : handleDeleteSelected,
                    disabled: selectedIds.size === 0,
                }}
            />
            {/* Banner inline - exclusão individual */}
            <AnimatedInlineBanner
                show={deleteModalVisible && Boolean(itemToDelete) && !isSelectionMode}
                step="error"
                actions={{
                    cancelLabel: 'Não',
                    confirmLabel: 'Excluir',
                    onCancel: handleCancelDelete,
                    onConfirm: handleConfirmDelete,
                }}
                error={`Excluir ${itemToDelete?.type === 'subscription' ? 'assinatura' : 'lembrete'}?`}
                statusText="Esta acao nao pode ser desfeita."
                centerActions
            />

            {/* Modal de Adicionar/Editar */}
            <ReminderModal
                visible={reminderModalVisible}
                onClose={() => {
                    setReminderModalVisible(false);
                    setEditingItem(null);
                }}
                onSave={handleSaveReminder}
                mode={selectedTab}
                initialData={editingItem ? {
                    title: editingItem.name,
                    amount: editingItem.amount,
                    date: editingItem.dueDate,
                    frequency: editingItem.frequency || 'monthly',
                    cancellationDate: editingItem.cancellationDate,
                    transactionType: editingItem.transactionType,
                    category: editingItem.category
                } : null}
            />

            <RecurrenceFilterModal
                visible={filterModalVisible}
                onClose={() => setFilterModalVisible(false)}
                onApply={handleApplyFilters}
                initialFilters={filters}
            />

            <RecurrenceActionsSheet
                visible={openActionMenuId !== null}
                onVisibleChange={(visible) => {
                    if (!visible) closeActionMenu();
                }}
                item={openActionMenuItem}
                onPay={() => {
                    const item = openActionMenuItem;
                    if (item) {
                        setTimeout(() => handleOptionPay(item), 350);
                    }
                }}
                onEdit={() => {
                    const item = openActionMenuItem;
                    if (item) {
                        setTimeout(() => handleOptionEdit(item), 350);
                    }
                }}
                onDelete={() => {
                    const item = openActionMenuItem;
                    if (item) {
                        setTimeout(() => handleOptionDelete(item), 350);
                    }
                }}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0A',
    },
    content: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 58,
        zIndex: 10,
    },
    header: {
        paddingHorizontal: 22,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#F5F5F7',
        letterSpacing: 0,
        flexShrink: 1,
        marginRight: 12,
    },
    headerIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
    },
    screenHeader: {
        fontSize: 18,
        fontFamily: 'AROneSans_400Regular',
        color: '#FFFFFF',
        flexShrink: 1,
    },
    headerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#D97757',
        height: HEADER_CONTROL_HEIGHT,
        paddingHorizontal: 14,
        borderRadius: HEADER_CONTROL_HEIGHT / 2,
        gap: 6,
    },
    headerButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 14,
    },
    subHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 22,
        marginBottom: 12,
        gap: 12,
        minHeight: HEADER_CONTROL_HEIGHT,
    },
    subHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        height: HEADER_CONTROL_HEIGHT,
    },
    filterBarRow: {
        flexDirection: 'row',
        paddingHorizontal: 22,
        gap: 10,
        marginBottom: 12,
    },
    filterSearchBar: {
        flex: 1,
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#101010',
        borderWidth: 1,
        borderColor: '#252525',
        borderRadius: 24,
        paddingHorizontal: 12,
        gap: 8,
    },
    filterSearchInput: {
        flex: 1,
        color: '#F5F5F7',
        fontSize: 13,
        fontWeight: '500',
        padding: 0,
    },
    arrowSelector: {
        width: 146,
        height: 36,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#101010',
        borderWidth: 1,
        borderColor: '#252525',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 6,
    },
    arrowSelectorContent: {
        ...StyleSheet.absoluteFill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 7,
        gap: 4,
        zIndex: 5,
    },
    arrowSelectorBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowSelectorLabelWrapper: {
        overflow: 'hidden',
        width: 76,
        height: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowSelectorLabel: {
        color: '#F5F5F7',
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center',
        position: 'absolute',
    },
    listContainer: {
        flex: 1,
        paddingHorizontal: 22,
        marginTop: 4,
        overflow: 'visible',
    },
    listHeaderCount: {
        fontSize: 13,
        color: '#6E6E73',
        fontWeight: '500',
    },

    // Group Styles
    groupContainer: {
        marginBottom: 4,
        overflow: 'visible',
    },
    groupOpenLayer: {
        position: 'relative',
        zIndex: 2000,
        elevation: 20,
    },
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    groupTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#A1A1A6',
        textTransform: 'capitalize',
    },
    groupList: {
        gap: 10,
        overflow: 'visible',
    },

    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#F5F5F7',
        marginBottom: 16,
    },
    listItem: {
        flexDirection: 'column',
        paddingVertical: 13,
        paddingHorizontal: 14,
        backgroundColor: '#101010',
        borderRadius: 17,
        overflow: 'visible',
        borderWidth: 1,
        borderColor: '#252525',
        position: 'relative',
    },
    listCellOpenLayer: {
        position: 'relative',
        zIndex: 2000,
        elevation: 20,
        overflow: 'visible',
    },
    listItemOpenLayer: {
        position: 'relative',
        zIndex: 2000,
        elevation: 20,
    },
    listItemPressContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    listItemExpanded: {
        borderColor: '#D97757',
        backgroundColor: '#101010',
    },
    listItemSelected: {
        borderColor: '#D97757',
        backgroundColor: '#101010',
    },
    listItemPaid: {
        borderColor: '#32D74B',
    },
    listItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    listItemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F5F7',
        marginBottom: 2,
    },
    listItemSubtitle: {
        fontSize: 12,
        color: '#8E8E93',
    },
    listItemRight: {
        alignItems: 'flex-end',
        gap: 4,
    },
    listItemMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    listItemAmount: {
        fontSize: 13,
        fontWeight: '600',
        color: '#F5F5F7',
    },
    listItemAmountIncome: {
        color: '#32D74B',
    },
    listItemAmountExpense: {
        color: '#FA5C5C',
    },
    listItemAmountPaid: {
        color: '#32D74B',
    },
    itemMenuButton: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemActionDropdown: {
        position: 'absolute',
        top: 42,
        right: 8,
        width: 176,
        zIndex: 1000,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.07)',
        overflow: 'hidden',
        borderRadius: 20,
        backgroundColor: 'rgba(17, 17, 17, 0.94)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 12,
    },
    itemActionDropdownBlur: {
        width: '100%',
    },
    itemActionDropdownOverlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(17, 17, 17, 0.94)',
    },
    itemActionDropdownContent: {
        paddingVertical: 4,
    },
    itemActionDropdownItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    itemActionDropdownText: {
        color: '#E0E0E0',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
    },
    itemActionDropdownTextDestructive: {
        color: '#FF6B6B',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
    },
    itemActionDropdownDivider: {
        height: 1,
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
    statusBadge: {
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
        backgroundColor: '#171717',
        borderWidth: 1,
        borderColor: '#252525',
    },
    statusText: {
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0,
        color: '#8E8E93',
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        marginTop: 40,
        display: 'none', // Deprecated, keeping for safety if referenced elsewhere but shouldn't be
    },
    emptyStateIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#101010',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        display: 'none',
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#F5F5F7',
        marginBottom: 8,
        textAlign: 'center',
        display: 'none',
    },
    emptyStateText: {
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 32,
        display: 'none',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#D97757',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        gap: 8,
        display: 'none',
    },
    addButtonText: {
        color: '#F5F5F7',
        fontWeight: '600',
        fontSize: 14,
        display: 'none',
    },
    actionsOverlay: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
        gap: 10,
    },
    actionsGradient: {
        position: 'absolute',
        left: -40,
        top: 0,
        bottom: 0,
        width: 40,
        backgroundColor: 'transparent',
        // Simulates gradient fade from transparent to dark
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#101010',
        paddingLeft: 8,
        gap: 4,
    },
    actionButton: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    // Estilos do card de confirmação de exclusão
    deleteConfirmCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#101010',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#252525',
    },
    deleteConfirmContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    deleteConfirmText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#F5F5F7',
    },
    // Estilos de seleção múltipla
    selectionCheckbox: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.24)',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    selectionCheckboxSelected: {
        backgroundColor: '#D97757',
        borderColor: '#D97757',
    },
    // Estilos do Tutorial Inline
    cardTutorialOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden', // Importante para o BlurView respeitar o borderRadius do pai
        borderRadius: 16,
        zIndex: 20,
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingLeft: 16,
        backgroundColor: 'rgba(0,0,0,0.78)',
    },
    cardTutorialContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        gap: 8,
    },
    cardTutorialText: {
        color: '#F5F5F7',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
    // Calendar Styles
    calendarContainer: {
        backgroundColor: '#101010',
        borderRadius: 18,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#252525',
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: 8,
    },
    calendarMonthTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#F5F5F7',
        textTransform: 'capitalize',
    },
    calendarArrow: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#101010',
        borderWidth: 1,
        borderColor: '#252525',
        borderRadius: 16,
    },
    weekDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    weekDayText: {
        width: '14.28%',
        textAlign: 'center',
        color: '#6E6E73',
        fontSize: 12,
        fontWeight: '500',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        height: 44,
        justifyContent: 'flex-start',
        alignItems: 'center',
        marginBottom: 4,
        paddingTop: 8,
        borderRadius: 12,
    },
    dayCellSelected: {
        backgroundColor: 'rgba(217, 119, 87, 0.16)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(217, 119, 87, 0.48)',
    },
    dayText: {
        color: '#F5F5F7',
        fontSize: 14,
        fontWeight: '500',
    },
    dayTextSelected: {
        color: '#D97757',
        fontWeight: '700',
    },
    eventDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 6,
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#101010',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#252525',
        justifyContent: 'center',
        alignItems: 'center'
    },
    calendarToggleButton: {
        width: HEADER_CONTROL_HEIGHT,
        height: HEADER_CONTROL_HEIGHT,
        borderRadius: 12,
        backgroundColor: '#101010',
        borderWidth: 1,
        borderColor: '#252525',
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionsModalBody: {
        paddingTop: 20,
        paddingBottom: 18,
        gap: 10,
    },
    optionsSummaryCard: {
        backgroundColor: '#101010',
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#252525',
        overflow: 'hidden',
    },
    optionsCard: {
        backgroundColor: '#101010',
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#252525',
    },
    optionRow: {
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
    },
    optionTextGroup: {
        flex: 1,
        minWidth: 0,
    },
    optionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F5F7',
        marginBottom: 2,
    },
    optionSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8E8E93',
    },
    optionDivider: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 64,
        backgroundColor: '#252525',
    },
    summaryStatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 13,
    },
    summaryStatLabel: {
        fontSize: 14,
        color: '#8E8E93',
        fontWeight: '400',
    },
    summaryStatValue: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F5F7',
    },
    // New Empty State Styles (Reminders)
    emptyRemindersContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingBottom: 96,
        flex: 1,
    },
    emptyRemindersIconWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyRemindersTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F5F7',
        marginTop: 8,
        marginBottom: 4,
        textAlign: 'center',
    },
    emptyRemindersText: {
        fontSize: 13,
        color: '#8E8E93',
        textAlign: 'center',
        maxWidth: 232,
        lineHeight: 18,
    },


    // Summary Card Styles
    summaryCard: {
        backgroundColor: '#101010',
        borderRadius: 18,
        marginHorizontal: 22,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#252525',
        overflow: 'hidden',
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    summaryItem: {
        flex: 1,
        paddingHorizontal: 10,
        paddingVertical: 10,
        minWidth: 0,
    },
    summaryItemLabel: {
        fontSize: 10,
        color: '#6E6E73',
        fontWeight: '500',
        marginBottom: 3,
    },
    summaryItemValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        minWidth: 0,
    },
    summaryItemValue: {
        flexShrink: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#F5F5F7',
    },
    summaryItemValueAccent: {
        color: '#D97757',
    },
    summaryItemValueIncome: {
        color: '#32D74B',
    },
    summaryRowDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#252525',
    },
    summaryItemSub: {
        fontSize: 11,
        color: '#48484A',
    },
    summaryItemDivider: {
        width: StyleSheet.hairlineWidth,
        alignSelf: 'stretch',
        backgroundColor: '#252525',
    },
    summaryLabelSmall: {
        fontSize: 12,
        color: '#8E8E93',
        fontWeight: '500',
    },
    summaryValueSmall: {
        fontSize: 16,
        fontWeight: '700',
        color: '#F5F5F7',
    },
    summarySubLabelSmall: {
        fontSize: 10,
        color: '#6E6E73',
        marginTop: 2,
    },
    summaryDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    summaryHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    summaryCol: {
        flex: 1,
        alignItems: 'flex-start',
    },
    summaryDivider: {
        width: StyleSheet.hairlineWidth,
        height: '100%',
        backgroundColor: '#252525',
        marginHorizontal: 12,
    },
    // Detection Actions Styles
    detectionActions: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    dismissButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 69, 58, 0.11)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255, 69, 58, 0.24)',
    },
    dismissButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FF453A',
    },
    confirmButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: '#D97757',
    },
    confirmButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#F5F5F7',
    },
    tutorialBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(219, 119, 87, 0.12)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(219, 119, 87, 0.28)',
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 16,
        marginHorizontal: 22,
    },
    tutorialBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 12,
        gap: 8,
    },
    tutorialBannerIcon: {
        flexShrink: 0,
    },
    tutorialBannerText: {
        color: '#F5F5F7',
        fontSize: 12.5,
        fontFamily: 'AROneSans_400Regular',
        lineHeight: 16,
        flex: 1,
    },
    tutorialBannerClose: {
        padding: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
