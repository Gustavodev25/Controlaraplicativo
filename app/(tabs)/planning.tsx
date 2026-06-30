import { InvestmentDetailsModal } from '@/components/InvestmentDetailsModal';
import { InvestmentModal } from '@/components/InvestmentModal';
import { InvestmentStatementModal } from '@/components/InvestmentStatementModal';
import { InvestmentActionsSheet } from '@/components/InvestmentActionsSheet';

import { AnimatedInlineBanner } from '@/components/ui/AnimatedInlineBanner';
import { IosCoreLoader } from '@/components/ui/IosCoreLoader';
import { UniversalBackground } from '@/components/UniversalBackground';
import { MorphTouchable } from '@/components/ui/MorphTouchable';
import { useAuthContext } from '@/contexts/AuthContext';
import { databaseService } from '@/services/firebase';
import { MoreVertical, PiggyBank, Plus } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated as NativeAnimated, Easing as RNEasing, FlatList, Image, InteractionManager, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native-gesture-handler'; // Ensure TextInput is available or use standard RN
import Animated, { Easing, FadeInDown, FadeInUp, runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const HEADER_CONTROL_HEIGHT = 36;


interface Investment {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    color: string;
    icon: string;
    deadline?: string;
    createdAt: string;
    // Campos de sincronização (poupança Pluggy)
    source?: string;
    pluggyAccountId?: string;
    connector?: {
        id: number;
        name: string;
        primaryColor?: string;
        imageUrl?: string;
    };
    lastSyncedAt?: string;
}

const getInvestmentRenderKey = (item: Investment): string => [
    item.id,
    item.name,
    item.currentAmount,
    item.targetAmount,
    item.color,
    item.icon,
    item.deadline || '',
    item.source || '',
    item.pluggyAccountId || '',
    item.connector?.name || '',
    item.connector?.primaryColor || '',
    item.connector?.imageUrl || '',
    item.lastSyncedAt || '',
].join('|');

const areInvestmentListsEqual = (current: Investment[], next: Investment[]): boolean => {
    if (current.length !== next.length) return false;

    return current.every((item, index) => getInvestmentRenderKey(item) === getInvestmentRenderKey(next[index]));
};



const InvestmentCard = React.memo(({ item, onOpenActionsMenu }: {
    item: Investment,
    onOpenActionsMenu: () => void
}) => {

    const percentage = item.targetAmount > 0
        ? Math.min((item.currentAmount / item.targetAmount) * 100, 100)
        : 0;

    // Calculate progress color based on percentage
    let progressColor = '#FF4C4C';
    if (percentage > 70) {
        progressColor = '#04D361';
    } else if (percentage > 30) {
        progressColor = '#FFB800';
    }

    return (
        <Animated.View
            style={{ marginBottom: 10 }}
        >
            <MorphTouchable
                radius={12}
                hitSlop={8}
                style={styles.cardContainer}
            >
                {/* Category Header */}
                <View style={styles.categoryHeader}>
                    <Text style={[styles.categoryHeaderText, item.source === 'pluggy' ? { color: '#04D361' } : { color: '#D97757' }]}>
                        {item.source === 'pluggy' ? 'Poupança • Conta Bancária' : 'Caixinha'}
                    </Text>
                    {item.source !== 'pluggy' && (
                        <Text style={styles.categoryHeaderRight}>
                            {item.deadline
                                ? `Meta: ${new Date(item.deadline).toLocaleDateString('pt-BR')}`
                                : 'Sem prazo definido'}
                        </Text>
                    )}
                </View>

                <View style={styles.cardCategoryDivider} />

                {/* Main Card Content */}
                <View style={styles.cardMainContent}>
                    {/* Header: Name + Menu (zIndex 20 para o dropdown flutuar acima do conteúdo abaixo) */}
                    <View style={styles.cardHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle} numberOfLines={1}>
                                {item.name.includes(' • ') ? (
                                    <>
                                        {item.name.split(' • ')[0]}
                                        <Text style={styles.accountNumberText}> • {item.name.split(' • ')[1]}</Text>
                                    </>
                                ) : (
                                    item.name
                                )}
                            </Text>
                        </View>
                        <MorphTouchable radius={10} style={styles.cardMenuButton} onPress={onOpenActionsMenu}>
                            <MoreVertical size={14} color="#A1A1A6" strokeWidth={2.4} />
                        </MorphTouchable>
                    </View>

                    {/* Amounts */}
                    <View style={styles.amountContainer}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={styles.amountLabel}>{item.source === 'pluggy' ? 'Saldo Poupança' : 'Guardado'}</Text>
                            <Text style={[styles.currentAmount, item.source === 'pluggy' && { color: '#04D361' }]} numberOfLines={1} adjustsFontSizeToFit>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.currentAmount)}
                            </Text>
                        </View>
                        {item.source !== 'pluggy' && (
                            <View style={{ flexShrink: 0, alignItems: 'flex-end' }}>
                                <Text style={styles.amountLabel}>Meta</Text>
                                <Text style={[styles.targetAmount, { textAlign: 'right' }]} numberOfLines={1}>
                                    {item.targetAmount > 0
                                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.targetAmount)
                                        : 'Sem meta'}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Footer: Progress Bar or Sync Info */}
                    {item.source === 'pluggy' ? (
                        item.lastSyncedAt && (
                            <View style={{ marginTop: 4, paddingTop: 0 }}>
                                <Text style={[styles.amountLabel, { fontSize: 9, color: '#606060', marginBottom: 0, textAlign: 'left' }]}>
                                    Última atualização em {new Date(item.lastSyncedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        )
                    ) : (
                        item.targetAmount > 0 && (
                            <View style={styles.progressContainer}>
                                <View style={styles.progressHeader}>
                                    <Text style={styles.progressTextLeft}>{Math.round(percentage)}% concluído</Text>
                                    <Text style={styles.progressTextRight}>
                                        Falta {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, item.targetAmount - item.currentAmount))}
                                    </Text>
                                </View>
                                <View style={styles.progressBarBg}>
                                    <View
                                        style={[
                                            styles.progressBarFill,
                                            { width: `${percentage}%`, backgroundColor: progressColor }
                                        ]}
                                    />
                                </View>
                            </View>
                        )
                    )}
                </View>
            </MorphTouchable>
        </Animated.View>
    );
});

InvestmentCard.displayName = 'InvestmentCard';

export default function PlanningScreen() {
    const { user } = useAuthContext();
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [loading, setLoading] = useState(true);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [detailsInitialView, setDetailsInitialView] = useState<'menu' | 'movement'>('menu');
    const [statementModalVisible, setStatementModalVisible] = useState(false);
    const [selectedInvestment, setSelectedInvestment] = useState<Investment | null>(null);

    // Delete Confirmation State
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [investmentToDelete, setInvestmentToDelete] = useState<Investment | null>(null);

    // Action menu (bottom sheet) state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);

    const handleActionsSheetDismiss = (visible: boolean) => {
        setActionSheetVisible(visible);
        if (!visible) {
            setTimeout(() => {
                setActionSheetVisible(currVisible => {
                    if (!currVisible) {
                        setStatementModalVisible(currStatement => {
                            setDetailsModalVisible(currDetails => {
                                setEditModalVisible(currEdit => {
                                    setDeleteModalVisible(currDelete => {
                                        if (!currStatement && !currDetails && !currEdit && !currDelete) {
                                            setSelectedInvestment(null);
                                        }
                                        return currDelete;
                                    });
                                    return currEdit;
                                });
                                return currDetails;
                            });
                            return currStatement;
                        });
                    }
                    return currVisible;
                });
            }, 350);
        }
    };

    useEffect(() => {
        if (!user) return;

        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

        const timer = setTimeout(() => {
            task = InteractionManager.runAfterInteractions(() => {
                if (cancelled) return;

                unsubscribe = databaseService.onInvestmentsChange(user.uid, (data) => {
                    if (cancelled) return;
                    const nextInvestments = data as Investment[];
                    setInvestments(current => areInvestmentListsEqual(current, nextInvestments)
                        ? current
                        : nextInvestments
                    );
                    setLoading(false);
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

    const [isSaving, setIsSaving] = useState(false);

    const handleCreateInvestment = async (data: { name: string; targetAmount: number; deadline?: string }) => {
        if (!user || isSaving) return;

        setIsSaving(true);
        try {
            const result = await databaseService.addInvestment(user.uid, {
                name: data.name,
                targetAmount: data.targetAmount,
                currentAmount: 0.01, // Começa com 0.01 para ser visível no filtro de "apenas com movimentação"
                deadline: data.deadline,
                color: '#D97757', // Default color
                icon: 'piggy-bank'
            });

            if (result.success && result.id) {
                // Registrar essa pequena movimentação inicial
                await databaseService.addInvestmentTransaction(user.uid, result.id, {
                    amount: 0.01,
                    type: 'deposit',
                    date: new Date().toISOString(),
                });
            }

            setCreateModalVisible(false);
        } catch (error) {
            console.error('[Planning] Error creating investment:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateBalance = async (amount: number, type: 'deposit' | 'withdraw') => {
        if (!user || !selectedInvestment) return;

        const newAmount = type === 'deposit'
            ? selectedInvestment.currentAmount + amount
            : selectedInvestment.currentAmount - amount;

        // 1. Update Balance
        await databaseService.updateInvestment(user.uid, selectedInvestment.id, {
            currentAmount: newAmount
        });

        // 2. Add Transaction History (subcoleção) + Transaction to main collection (sincronização Web/App)
        // Agora addInvestmentTransaction já cria automaticamente na coleção principal
        await databaseService.addInvestmentTransaction(user.uid, selectedInvestment.id, {
            amount: amount,
            type: type,
            date: new Date().toISOString(),
        });

        setDetailsModalVisible(false);
        setSelectedInvestment(null);
    };

    const handleRequestDelete = (investment: Investment) => {
        setInvestmentToDelete(investment);
        setDeleteModalVisible(true);
    };

    const handleConfirmDelete = async () => {
        if (!user || !investmentToDelete) return;

        // Close modal
        setDeleteModalVisible(false);

        await databaseService.deleteInvestment(user.uid, investmentToDelete.id);

        // Also close details modal if it's open (e.g. if deleted from details)
        if (detailsModalVisible) {
            setDetailsModalVisible(false);
        }

        setSelectedInvestment(null);
        setInvestmentToDelete(null);
    };

    const handleEditInvestment = async (data: { name: string; targetAmount: number; deadline?: string }) => {
        if (!user || !selectedInvestment || isSaving) return;

        setIsSaving(true);
        try {
            await databaseService.updateInvestment(user.uid, selectedInvestment.id, {
                name: data.name,
                targetAmount: data.targetAmount,
                deadline: data.deadline || null
            });

            setEditModalVisible(false);
            setSelectedInvestment(null);
        } catch (error) {
            console.error('[Planning] Error updating investment:', error);
        } finally {
            setIsSaving(false);
        }
    };



    return (
        <View style={styles.mainContainer}>
            <View pointerEvents="none">
                <UniversalBackground
                    backgroundColor="#0C0C0C"
                    glowSize={350}
                    height={280}
                    showParticles={true}
                    particleCount={15}
                />
            </View>

            <View style={styles.contentWrapper}>
                {/* Header Fixo */}
                <View style={styles.header}>
                    <View style={styles.headerTitleRow}>
                        <Image
                            source={require('../../assets/images/icon.png')}
                            style={styles.headerIcon}
                            resizeMode="contain"
                        />
                        <Text style={styles.screenHeader} numberOfLines={1}>
                            Patrimônio
                        </Text>
                    </View>

                    <MorphTouchable
                        radius={HEADER_CONTROL_HEIGHT / 2}
                        style={styles.headerButton}
                        onPress={() => setCreateModalVisible(true)}
                    >
                        <Plus size={17} color="#FFFFFF" strokeWidth={2.6} />
                        <Text style={styles.headerButtonText}>Criar</Text>
                    </MorphTouchable>
                </View>



                {loading ? (
                    <IosCoreLoader />
                ) : investments.length > 0 ? (
                    <FlatList
                        data={investments}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <InvestmentCard
                                item={item}
                                onOpenActionsMenu={() => {
                                    setSelectedInvestment(item);
                                    setActionSheetVisible(true);
                                }}
                            />
                        )}
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.listContainer}
                        showsVerticalScrollIndicator={false}
                    />
                ) : (
                    <View style={styles.emptyContainer}>
                        <Animated.Text entering={FadeInDown.duration(500).delay(100)} style={styles.emptyTitle}>
                            Nenhuma caixinha
                        </Animated.Text>

                        <Animated.Text entering={FadeInDown.duration(500).delay(200)} style={styles.emptyText}>
                            Crie caixinhas para organizar seus objetivos financeiros.
                        </Animated.Text>
                    </View>
                )}
            </View>



            <AnimatedInlineBanner
                show={deleteModalVisible && Boolean(investmentToDelete)}
                step="error"
                error={investmentToDelete ? `Excluir ${investmentToDelete.name}?` : ''}
                actions={{
                    cancelLabel: 'Cancelar',
                    confirmLabel: 'Excluir',
                    onCancel: () => {
                        setDeleteModalVisible(false);
                        setInvestmentToDelete(null);
                    },
                    onConfirm: handleConfirmDelete,
                }}
            />

            <InvestmentModal
                visible={createModalVisible}
                onClose={() => setCreateModalVisible(false)}
                onSave={handleCreateInvestment}
                loading={isSaving}
            />

            {selectedInvestment && (
                <InvestmentDetailsModal
                    visible={detailsModalVisible}
                    initialView={detailsInitialView}
                    onClose={() => {
                        setDetailsModalVisible(false);
                        setDetailsInitialView('menu');
                        setTimeout(() => setSelectedInvestment(null), 350);
                    }}
                    onSaveMovement={handleUpdateBalance}
                    onDeleteRequest={() => {
                        // Close details modal first
                        setDetailsModalVisible(false);
                        // Open delete confirmation manually
                        handleRequestDelete(selectedInvestment);
                    }}
                    onEditRequest={() => {
                        setDetailsModalVisible(false);
                        setTimeout(() => {
                            setEditModalVisible(true);
                        }, 300);
                    }}
                    onExtractRequest={() => {
                        setDetailsModalVisible(false);
                        setTimeout(() => {
                            setStatementModalVisible(true);
                        }, 300);
                    }}
                    investmentName={selectedInvestment.name}
                    currentAmount={selectedInvestment.currentAmount}
                />
            )}

            {selectedInvestment && (
                <InvestmentStatementModal
                    visible={statementModalVisible}
                    onClose={() => {
                        setStatementModalVisible(false);
                        setSelectedInvestment(null);
                    }}
                    investmentId={selectedInvestment.id}
                    investmentName={selectedInvestment.name}
                />
            )}

            {selectedInvestment && (
                <InvestmentActionsSheet
                    visible={actionSheetVisible}
                    investmentName={selectedInvestment.name}
                    onVisibleChange={handleActionsSheetDismiss}
                    onExtract={() => {
                        setStatementModalVisible(true);
                    }}
                    onMove={() => {
                        setDetailsInitialView('movement');
                        setDetailsModalVisible(true);
                    }}
                    onEdit={() => {
                        setEditModalVisible(true);
                    }}
                    onDelete={() => {
                        handleRequestDelete(selectedInvestment);
                    }}
                />
            )}

            {/* Modal de Edição */}
            {selectedInvestment && (
                <InvestmentModal
                    visible={editModalVisible}
                    onClose={() => {
                        setEditModalVisible(false);
                        setSelectedInvestment(null);
                    }}
                    onSave={handleEditInvestment}
                    title="Editar Caixinha"
                    loading={isSaving}
                    initialData={{
                        name: selectedInvestment.name,
                        targetAmount: selectedInvestment.targetAmount,
                        deadline: selectedInvestment.deadline
                    }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: '#0C0C0C',
    },
    contentWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 58,
        zIndex: 10,
    },
    listContainer: {
        paddingTop: 0,
        paddingHorizontal: 22,
        paddingBottom: 100,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 22,
        marginBottom: 12,
        zIndex: 10,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
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
    // Card Styles
    cardContainer: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#222222',
        backgroundColor: '#101010',
        overflow: 'hidden',
    },
    cardMainContent: {
        padding: 10,
        paddingTop: 8,
    },
    categoryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: '#141414',
    },
    categoryHeaderText: {
        fontSize: 8.5,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
    categoryHeaderRight: {
        fontSize: 8.5,
        color: '#909090',
        fontFamily: 'AROneSans_400Regular',
    },
    cardCategoryDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#202020',
        width: '100%',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 8,
        position: 'relative',
        zIndex: 20,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#D97757',
    },
    cardTitle: {
        fontSize: 13.5,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 1,
    },
    accountNumberText: {
        fontSize: 11,
        fontWeight: '400',
        color: '#909090',
    },
    amountContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 4,
    },
    amountLabel: {
        fontSize: 9,
        color: '#909090',
        marginBottom: 2,
    },
    currentAmount: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    targetAmount: {
        fontSize: 12,
        fontWeight: '600',
        color: '#909090',
    },
    progressContainer: {
        marginTop: 0,
        gap: 4,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    progressTextLeft: {
        fontSize: 9,
        color: '#909090',
        fontWeight: '500',
    },
    progressTextRight: {
        fontSize: 9,
        color: '#909090',
        fontWeight: '500',
    },
    progressBarBg: {
        width: '100%',
        height: 4,
        backgroundColor: '#252525',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    // Empty State Styles
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingBottom: 96,
        flex: 1,
    },
    emptyIconWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F5F7',
        marginTop: 8,
        marginBottom: 4,
        textAlign: 'center',
    },
    emptyText: {
        fontSize: 13,
        color: '#8E8E93',
        textAlign: 'center',
        maxWidth: 232,
        lineHeight: 18,
    },
    // Open Finance Pill Styles
    openFinancePill: {
        backgroundColor: 'rgba(4, 211, 97, 0.15)',
        paddingHorizontal: 5,
        paddingVertical: 1.5,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginTop: 1.5,
        borderWidth: 1,
        borderColor: 'rgba(4, 211, 97, 0.3)',
    },
    openFinancePillText: {
        fontSize: 8,
        fontWeight: '600',
        color: '#04D361',
        letterSpacing: 0.2,
    },
    // Hold Pill Styles
    holdPillContainer: {
        position: 'absolute',
        top: 110,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 9999,
        elevation: 50,
    },
    holdPill: {
        backgroundColor: '#101010',
        borderRadius: 14,
        height: 28, // Ultra compact
        width: 120, // Very small width
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: '#252525',
        overflow: 'hidden',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    holdPillFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: '#FF4C4C',
        zIndex: 0,
        borderRadius: 14, // Match parent
    },
    holdPillText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '600',
        zIndex: 1,
    },
    holdPillTimer: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
        padding: 0,
        margin: 0,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    cardMenuButton: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Dropdown do card de investimento
    investmentDropdown: {
        position: 'absolute',
        top: 44,
        right: 8,
        width: 160,
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
    investmentDropdownOverlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(17, 17, 17, 0.94)',
    },
    investmentDropdownContent: {
        paddingVertical: 4,
    },
    investmentDropdownItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    investmentDropdownText: {
        color: '#E0E0E0',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
    },
    investmentDropdownTextDestructive: {
        color: '#FF6B6B',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
    },
    investmentDropdownDivider: {
        height: 1,
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
});
