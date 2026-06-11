export interface ClosingDateItem {
    id: string;
    monthKey?: string;
    label: string;
    subLabel?: string;
    currentDate: string;
}

export interface ClosingDateSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    onSave: (updates: { id: string, exactDate: string }[]) => Promise<void>;
    items: ClosingDateItem[];
    bankName?: string;
    originalCloseDate?: string | null;
    originalDueDate?: string | null;
}
