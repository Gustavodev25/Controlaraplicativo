export interface RefundTransaction {
    id: string;
    description: string;
    amount: number;
    date: string;
    category?: string;
    type: 'income' | 'expense';
    cardId?: string;
    accountId?: string;
}

export interface RefundSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    transaction: RefundTransaction | null;
    onConfirm: (transaction: RefundTransaction, customAmount?: number) => Promise<void>;
}
