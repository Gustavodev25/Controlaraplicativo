import { AuthButton } from '@/components/ui/AuthButton';
import { ModalPadrao } from '@/components/ui/ModalPadrao';
import { ModernSwitch } from '@/components/ui/ModernSwitch';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

/**
 * Maps common title keywords (in Portuguese and English) to category keys.
 * When the user types a title, the system automatically detects the best category.
 */
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
    // Moradia
    'rent': ['aluguel', 'rent', 'alugel'],
    'electricity': ['luz', 'energia', 'eletric', 'cpfl', 'enel', 'cemig', 'celesc', 'copel', 'coelba', 'light'],
    'water': ['água', 'agua', 'saneamento', 'sabesp', 'copasa', 'cagece', 'cedae', 'compesa'],

    // Alimentação
    'eating out': ['restaurante', 'lanchonete', 'pizzaria', 'hamburguer', 'churrascaria', 'sushi', 'jantar', 'almoço', 'almoco', 'café da manhã'],
    'food delivery': ['ifood', 'rappi', 'uber eats', 'delivery', 'entrega comida'],
    'groceries': ['mercado', 'supermercado', 'feira', 'hortifruti', 'atacadão', 'atacadao', 'assaí', 'assai', 'carrefour', 'pão de açúcar', 'extra'],

    // Transporte
    'gas stations': ['gasolina', 'combustível', 'combustivel', 'posto', 'etanol', 'diesel', 'shell', 'ipiranga', 'br distribuidora'],
    'taxi and ride-hailing': ['uber', '99', 'táxi', 'taxi', 'cabify', 'indriver'],
    'public transportation': ['ônibus', 'onibus', 'metrô', 'metro', 'trem', 'brt', 'vlt', 'bilhete único', 'bilhete unico'],
    'parking': ['estacionamento', 'parking', 'zona azul'],
    'vehicle maintenance': ['oficina', 'mecânico', 'mecanico', 'troca de óleo', 'oleo', 'pneu', 'borracharia', 'funilaria', 'revisão carro'],
    'car rental': ['aluguel carro', 'locadora', 'localiza', 'movida', 'unidas'],
    'vehicle insurance': ['seguro auto', 'seguro carro', 'seguro veículo', 'seguro veiculo', 'porto seguro'],

    // Saúde
    'pharmacy': ['farmácia', 'farmacia', 'remédio', 'remedio', 'drogaria', 'droga raia', 'drogasil', 'panvel', 'pague menos'],
    'health insurance': ['plano de saúde', 'plano de saude', 'unimed', 'amil', 'bradesco saúde', 'sulamerica', 'hapvida', 'notredame'],
    'hospital clinics and labs': ['hospital', 'clínica', 'clinica', 'consulta', 'exame', 'laboratório', 'laboratorio', 'médico', 'medico', 'dentista', 'psicólogo', 'psicologo'],
    'gyms and fitness centers': ['academia', 'gym', 'smartfit', 'smart fit', 'musculação', 'musculacao', 'crossfit', 'pilates'],
    'wellness': ['spa', 'massagem', 'terapia', 'meditação', 'meditacao', 'yoga'],

    // Entretenimento
    'video streaming': ['netflix', 'disney+', 'disney plus', 'hbo', 'max', 'amazon prime', 'prime video', 'paramount', 'globoplay', 'star+', 'star plus', 'crunchyroll'],
    'music streaming': ['spotify', 'deezer', 'apple music', 'youtube music', 'tidal', 'amazon music'],
    'cinema, theater and concerts': ['cinema', 'teatro', 'show', 'ingresso', 'concerto', 'musical'],
    'entertainment': ['lazer', 'diversão', 'diversao', 'parque', 'zoológico', 'museu'],
    'lottery': ['loteria', 'mega sena', 'lotofácil', 'lotofacil', 'quina'],
    'gaming': ['game', 'jogo', 'playstation', 'xbox', 'nintendo', 'steam', 'ps plus', 'game pass'],

    // Compras
    'clothing': ['roupa', 'calçado', 'calcado', 'tênis', 'tenis', 'sapato', 'renner', 'riachuelo', 'c&a', 'zara', 'shein'],
    'electronics': ['eletrônico', 'eletronico', 'celular', 'notebook', 'computador', 'tablet', 'fone', 'headphone'],
    'online shopping': ['amazon', 'mercado livre', 'shopee', 'aliexpress', 'magazine luiza', 'magalu', 'americanas', 'casas bahia', 'kabum'],

    // Educação
    'school': ['escola', 'colégio', 'colegio', 'material escolar', 'uniforme'],
    'university': ['faculdade', 'universidade', 'curso', 'pós-graduação', 'pos graduacao', 'mestrado', 'doutorado', 'mba'],

    // Telecom
    'internet': ['internet', 'wifi', 'wi-fi', 'fibra', 'banda larga'],
    'mobile': ['celular', 'telefone', 'vivo', 'claro', 'tim', 'oi'],
    'telecommunications': ['telecom', 'telecomunicação', 'telecomunicacao'],

    // Finanças
    'taxes': ['imposto', 'iptu', 'ipva', 'detran', 'multa'],
    'income taxes': ['imposto de renda', 'irpf', 'irpj', 'darf'],
    'loans': ['empréstimo', 'emprestimo', 'financiamento', 'parcela', 'prestação', 'prestacao', 'consórcio', 'consorcio'],
    'interests charged': ['juros', 'mora', 'multa atraso'],
    'account fees': ['tarifa', 'anuidade', 'taxa bancária', 'taxa bancaria'],
    'credit card': ['cartão de crédito', 'cartao de credito', 'fatura cartão', 'fatura cartao'],

    // Renda
    'salary': ['salário', 'salario', 'holerite', 'contracheque', 'pagamento', 'remuneração', 'remuneracao'],
    'fixed income': ['renda fixa', 'tesouro direto', 'cdb', 'lci', 'lca', 'poupança', 'poupanca'],
    'variable income': ['renda variável', 'renda variavel', 'ações', 'acoes', 'fundo imobiliário', 'fundo imobiliario', 'fii', 'etf', 'bolsa'],
    'proceeds interests and dividends': ['dividendo', 'rendimento', 'provento', 'jcp', 'juros sobre capital'],
    'non-recurring income': ['freelance', 'extra', 'bico', 'comissão', 'comissao', 'bônus', 'bonus', 'prêmio', 'premio'],
    'retirement': ['aposentadoria', 'inss', 'previdência', 'previdencia'],
    'government aid': ['benefício', 'beneficio', 'bolsa família', 'bolsa familia', 'auxílio', 'auxilio', 'bpc'],

    // Transferências
    'transfer - pix': ['pix', 'transferência', 'transferencia', 'ted', 'doc'],
    'bank slip': ['boleto'],
    'credit card payment': ['pagamento cartão', 'pagamento cartao', 'pagar fatura'],

    // Viagem
    'accommodation': ['hotel', 'pousada', 'airbnb', 'hospedagem', 'hostel'],
    'airport and airlines': ['passagem aérea', 'passagem aerea', 'avião', 'aviao', 'voo', 'gol', 'latam', 'azul', 'aeroporto'],

    // Serviços digitais
    'digital services': ['icloud', 'google one', 'dropbox', 'chatgpt', 'canva', 'adobe', 'microsoft 365', 'office'],

    // Outros
    'donation': ['doação', 'doacao', 'caridade', 'ong', 'dízimo', 'dizimo', 'oferta'],
    'alimony': ['pensão', 'pensao', 'pensão alimentícia', 'pensao alimenticia'],
};

interface ReminderModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (data: { title: string; amount: number; date: string; frequency: 'monthly' | 'yearly'; cancellationReminder?: boolean; type: 'income' | 'expense'; category: string }) => void;
    title?: string;
    mode?: 'subscriptions' | 'reminders';
    initialData?: {
        title: string;
        amount: number;
        date: string;
        frequency: 'monthly' | 'yearly';
        cancellationDate?: string;
        transactionType?: 'income' | 'expense';
        category?: string;
    } | null;
}

/**
 * Detects the best category key based on the title text.
 * Matches title words against the CATEGORY_KEYWORD_MAP.
 */
function detectCategory(title: string): string {
    if (!title || title.trim().length === 0) return 'n/a';

    const normalizedTitle = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let bestMatch = '';
    let longestKeywordLength = 0;

    for (const [categoryKey, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
        for (const keyword of keywords) {
            const normalizedKeyword = keyword.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (normalizedTitle.includes(normalizedKeyword) && normalizedKeyword.length > longestKeywordLength) {
                bestMatch = categoryKey;
                longestKeywordLength = normalizedKeyword.length;
            }
        }
    }

    return bestMatch || 'n/a';
}

export function ReminderModal({ visible, onClose, onSave, title, initialData, mode = 'reminders' }: ReminderModalProps) {
    const [titleInput, setTitle] = useState('');
    const [amountStr, setAmountStr] = useState('');
    const [dateStr, setDateStr] = useState('');
    const [isYearly, setIsYearly] = useState(false);
    const [type, setType] = useState<'income' | 'expense'>('expense');

    // Auto-detect category from title
    const category = useMemo(() => {
        if (initialData?.category) return initialData.category;
        return detectCategory(titleInput);
    }, [titleInput, initialData?.category]);

    useEffect(() => {
        if (visible) {
            if (initialData) {
                setTitle(initialData.title);
                const formattedAmount = initialData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                setAmountStr(formattedAmount);

                let formattedDate = initialData.date;
                if (initialData.date.includes('-')) {
                    const parts = initialData.date.split('-');
                    if (parts.length === 3) {
                        const year = parts[0].trim();
                        const month = parts[1].trim();
                        const day = parts[2].trim();
                        formattedDate = `${day}/${month}/${year}`;
                    }
                }
                setDateStr(formattedDate);
                setIsYearly(initialData.frequency === 'yearly');
                setType(initialData.transactionType || 'expense');
            } else {
                setTitle('');
                setAmountStr('');
                setDateStr('');
                setIsYearly(false);
                setType('expense');
            }

            if (mode === 'subscriptions' && !initialData) {
                const today = new Date();
                const d = String(today.getDate()).padStart(2, '0');
                const m = String(today.getMonth() + 1).padStart(2, '0');
                const y = today.getFullYear();
                setDateStr(`${d}/${m}/${y}`);
            }
        }
    }, [visible, initialData, mode]);

    const handleSave = () => {
        const rawAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.') || '0');
        if (!titleInput || rawAmount <= 0 || !dateStr) return;

        onSave({
            title: titleInput,
            amount: rawAmount,
            date: dateStr,
            frequency: isYearly ? 'yearly' : 'monthly',
            type,
            category: category
        });
        onClose();
    };

    const formatInputCurrency = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        if (!numbers) return '';
        const amount = parseInt(numbers) / 100;
        return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    };

    const handleChangeAmount = (text: string) => {
        setAmountStr(formatInputCurrency(text));
    };

    const handleChangeDate = (text: string) => {
        if (text.length < dateStr.length) {
            setDateStr(text);
            return;
        }

        const cleaned = text.replace(/\D/g, '');
        let formatted = cleaned;

        if (cleaned.length > 2) {
            formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
        }
        if (cleaned.length > 4) {
            formatted = `${formatted}/${cleaned.slice(4, 8)}`;
        }

        if (formatted.length > 10) formatted = formatted.slice(0, 10);
        setDateStr(formatted);
    };

    const isSaveDisabled = !titleInput || !amountStr || dateStr.length < 10;

    const Footer = () => (
        <AuthButton
            title="Salvar"
            onPress={handleSave}
            isLoading={false}
            disabled={isSaveDisabled}
        />
    );

    return (
        <ModalPadrao
            visible={visible}
            onClose={onClose}
            title={title || (initialData ? `Editar ${mode === 'subscriptions' ? 'Assinatura' : 'Lembrete'}` : (mode === 'subscriptions' ? 'Nova Assinatura' : 'Novo Lembrete'))}
            titleAlign="start"
            presentation="bottom"
            showHandle={true}
            enableDragToClose={true}
            maxHeightRatio={0.86}
            footer={<Footer />}
        >
            <View style={styles.container}>
                <Text style={styles.sectionTitle}>INFORMAÇÕES</Text>
                <View style={styles.groupCard}>
                    <View style={styles.itemContent}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>Natureza</Text>
                        </View>
                        <View style={styles.typeToggleContainer}>
                            <TouchableOpacity
                                onPress={() => setType('expense')}
                                style={[styles.typeButton, type === 'expense' && styles.typeButtonActiveExpense]}
                            >
                                <Text style={[styles.typeButtonText, type === 'expense' && styles.typeButtonTextActiveExpense]}>Despesa</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setType('income')}
                                style={[styles.typeButton, type === 'income' && styles.typeButtonActiveIncome]}
                            >
                                <Text style={[styles.typeButtonText, type === 'income' && styles.typeButtonTextActiveIncome]}>Receita</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.separator} />

                    {/* Título */}
                    <View style={styles.itemContent}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>Título</Text>
                        </View>
                        <TextInput
                            style={styles.inputRight}
                            value={titleInput}
                            onChangeText={setTitle}
                            placeholder="Ex: Aluguel"
                            placeholderTextColor="#6E6E73"
                            textAlign="right"
                        />
                    </View>
                    <View style={styles.separator} />

                    {/* Valor */}
                    <View style={styles.itemContent}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>Valor</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ color: amountStr ? '#F5F5F7' : '#6E6E73', fontSize: 16, marginRight: 4 }}>R$</Text>
                            <TextInput
                                style={styles.inputRight}
                                value={amountStr}
                                onChangeText={handleChangeAmount}
                                placeholder="0,00"
                                placeholderTextColor="#6E6E73"
                                keyboardType="numeric"
                                textAlign="right"
                            />
                        </View>
                    </View>

                    {/* Vencimento - Hidden for subscriptions */}
                    {mode !== 'subscriptions' && (
                        <>
                            <View style={styles.separator} />
                            <View style={styles.itemContent}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.itemTitle}>Vencimento</Text>
                                </View>
                                <TextInput
                                    style={styles.inputRight}
                                    value={dateStr}
                                    onChangeText={handleChangeDate}
                                    placeholder="DD/MM/AAAA"
                                    placeholderTextColor="#6E6E73"
                                    keyboardType="numeric"
                                    textAlign="right"
                                    maxLength={10}
                                />
                            </View>
                        </>
                    )}

                    {/* Frequência - Only for subscriptions */}
                    {mode === 'subscriptions' && (
                        <>
                            <View style={styles.separator} />
                            <View style={styles.itemContent}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.itemTitle}>Frequência</Text>
                                    <Text style={styles.itemSubtitle}>{isYearly ? 'Anual' : 'Mensal'}</Text>
                                </View>
                                <ModernSwitch
                                    value={isYearly}
                                    onValueChange={setIsYearly}
                                    width={46}
                                    height={26}
                                />
                            </View>
                        </>
                    )}
                </View>
            </View>
        </ModalPadrao>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingTop: 4,
        paddingBottom: 0,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8E8E93',
        marginTop: 16,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontFamily: 'AROneSans_500Medium',
    },
    groupCard: {
        backgroundColor: '#171717',
        borderRadius: 14,
        marginBottom: 24,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
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
        fontFamily: 'AROneSans_400Regular',
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
    inputRight: {
        color: '#F4F1EF',
        fontSize: 16,
        minWidth: 100,
        padding: 0,
        fontFamily: 'AROneSans_400Regular',
    },
    typeToggleContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 2,
    },
    typeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    typeButtonActiveExpense: {
        backgroundColor: 'rgba(255, 69, 58, 0.2)',
    },
    typeButtonActiveIncome: {
        backgroundColor: 'rgba(48, 209, 88, 0.18)',
    },
    typeButtonText: {
        fontSize: 13,
        color: '#8E8E93',
        fontWeight: '500',
    },
    typeButtonTextActiveExpense: {
        color: '#FF453A',
        fontWeight: '700',
    },
    typeButtonTextActiveIncome: {
        color: '#30D158',
        fontWeight: '700',
    },
});
