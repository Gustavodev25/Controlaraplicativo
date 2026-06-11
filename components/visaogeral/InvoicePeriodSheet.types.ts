import type { InvoicePeriod } from './types';

export interface InvoicePeriodSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    cardName: string;
    selectedPeriod: InvoicePeriod;
    pastTotal: number;
    currentTotal: number;
    totalUsed: number;
    onPeriodChange: (period: InvoicePeriod) => void;
}
