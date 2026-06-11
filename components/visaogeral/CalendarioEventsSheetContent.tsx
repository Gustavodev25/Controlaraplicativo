import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useCategories } from '@/hooks/use-categories';
import { AnimatedCurrency } from '../AnimatedCurrency';

interface CalendarioEventsSheetContentProps {
    selectedDate: Date;
    selectedEvents: any[];
}

const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function EventRow({
    item,
    index,
    isLast,
    getCategoryName,
}: {
    item: any;
    index: number;
    isLast: boolean;
    getCategoryName: (id: string) => string;
}) {
    const pressProgress = useSharedValue(0);
    const morphProgress = useSharedValue(0);
    const cappedDelay = Math.min(index, 12) * 45;

    const rowAnimatedStyle = useAnimatedStyle(() => {
        const pressed = pressProgress.value;
        const morph = morphProgress.value;

        return {
            borderRadius: 14 + morph * 3 - pressed * 0.8,
            transform: [
                { translateY: pressed * 1.1 },
                { scaleX: 1 + morph * 0.006 - pressed * 0.006 },
                { scaleY: 1 + morph * 0.008 + pressed * 0.004 },
            ],
        };
    });

    const contentAnimatedStyle = useAnimatedStyle(() => {
        const pressed = pressProgress.value;
        const morph = morphProgress.value;

        return {
            transform: [
                { scaleX: 1 + morph * 0.003 - pressed * 0.002 },
                { scaleY: 1 - morph * 0.002 + pressed * 0.002 },
            ],
        };
    });

    return (
        <Animated.View
            entering={FadeInUp.delay(cappedDelay).duration(420)}
            style={[styles.itemContainer, rowAnimatedStyle]}
        >
            <AnimatedTouchableOpacity
                activeOpacity={1}
                style={styles.itemTouchable}
                onPressIn={() => {
                    pressProgress.value = withSpring(1, {
                        damping: 16,
                        stiffness: 250,
                        mass: 0.42,
                    });

                    morphProgress.value = withSpring(1, {
                        damping: 13,
                        stiffness: 190,
                        mass: 0.48,
                    });
                }}
                onPressOut={() => {
                    pressProgress.value = withSpring(0, {
                        damping: 15,
                        stiffness: 215,
                        mass: 0.45,
                    });

                    morphProgress.value = withSpring(0, {
                        damping: 11,
                        stiffness: 145,
                        mass: 0.52,
                    });
                }}
            >
                <Animated.View style={[styles.itemRightContainer, contentAnimatedStyle]}>
                    <View style={styles.itemContent}>
                        <View style={styles.itemTextBlock}>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                                {item.title || 'Sem descrição'}
                            </Text>

                            <Text style={styles.itemSubtitle}>
                                {item.category ? getCategoryName(item.category) : (
                                    item.type === 'credit_card' ? 'Cartão de Crédito' :
                                        item.type === 'subscription' ? 'Assinatura' :
                                            item.type === 'reminder' ? 'Lembrete' : 'Lançamento'
                                )}
                            </Text>
                        </View>

                        <View style={styles.itemAmountBlock}>
                            <AnimatedCurrency
                                value={item.amount}
                                style={[
                                    styles.itemAmount,
                                    {
                                        color: (item.type === 'checking_income' || item.transactionType === 'income')
                                            ? '#34C759'
                                            : '#FF453A'
                                    }
                                ]}
                                prefix="R$ "
                                prefixStyle={styles.itemAmountPrefix}
                            />

                            {item.status && (
                                <Text
                                    style={[
                                        styles.itemStatus,
                                        {
                                            color: item.status === 'paid' ? '#34C759' : '#8E8E93'
                                        }
                                    ]}
                                >
                                    {item.status === 'paid' ? 'Pago' : 'Pendente'}
                                </Text>
                            )}
                        </View>
                    </View>
                </Animated.View>

                {!isLast && <View style={styles.itemSeparator} />}
            </AnimatedTouchableOpacity>
        </Animated.View>
    );
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function CalendarioEventsSheetContent({
    selectedDate,
    selectedEvents,
}: CalendarioEventsSheetContentProps) {
    const { getCategoryName } = useCategories();

    const formattedDate = `${selectedDate.getDate()} de ${months[selectedDate.getMonth()]}`;
    const dayOfWeek = weekDays[selectedDate.getDay()];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    {formattedDate}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                    {dayOfWeek}
                </Text>
            </View>

            {selectedEvents.length > 0 ? (
                <View style={styles.eventsList}>
                    {selectedEvents.map((item, index) => {
                        const isLast = index === selectedEvents.length - 1;
                        return (
                            <EventRow
                                key={item.id + item.type + index}
                                item={item}
                                index={index}
                                isLast={isLast}
                                getCategoryName={getCategoryName}
                            />
                        );
                    })}
                </View>
            ) : (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Nenhum evento</Text>
                    <Text style={styles.emptyDescription}>
                        Este dia ainda não tem lançamentos, faturas ou recorrências.
                    </Text>
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
    eventsList: {
        overflow: 'hidden',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        backgroundColor: '#171717',
    },
    itemContainer: {
        position: 'relative',
        overflow: 'hidden',
    },
    itemTouchable: {
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    itemRightContainer: {
        flex: 1,
    },
    itemContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemTextBlock: {
        flex: 1,
        marginRight: 8,
    },
    itemTitle: {
        fontSize: 15,
        color: '#FFFFFF',
        fontFamily: 'AROneSans_400Regular',
    },
    itemSubtitle: {
        fontSize: 12,
        color: '#707070',
        marginTop: 2,
        fontFamily: 'AROneSans_400Regular',
    },
    itemAmountBlock: {
        alignItems: 'flex-end',
    },
    itemAmount: {
        fontSize: 16,
        fontFamily: 'AROneSans_500Medium',
        letterSpacing: -0.5,
    },
    itemAmountPrefix: {
        fontSize: 12,
        fontFamily: 'AROneSans_400Regular',
        color: '#8E8E93',
    },
    itemStatus: {
        fontSize: 10,
        marginTop: 1,
        fontFamily: 'AROneSans_400Regular',
        textAlign: 'right',
        opacity: 0.8,
    },
    itemSeparator: {
        position: 'absolute',
        bottom: 0,
        left: 16,
        right: 16,
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(255,255,255,0.07)',
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
