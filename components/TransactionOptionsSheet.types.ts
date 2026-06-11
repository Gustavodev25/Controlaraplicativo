import type { InvoiceItem } from '@/services/invoiceBuilder';

export interface TransactionOptionsSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    transaction: InvoiceItem | null;
    onMoveInvoice: (target: 'prev' | 'next' | 'current' | 'custom', date?: string) => void;
    onDelete: (item: InvoiceItem) => void;
    onRefund?: (item: InvoiceItem) => void;
    moveOptions?: { target: 'prev' | 'next' | 'current' | 'custom'; label: string; date?: string; icon?: 'prev' | 'next' }[];
    onChangeCategory?: (item: InvoiceItem) => void;
    loading?: boolean;
}
