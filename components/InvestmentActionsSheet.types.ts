export interface InvestmentActionsSheetProps {
    visible: boolean;
    investmentName: string;
    onVisibleChange: (visible: boolean) => void;
    onExtract: () => void;
    onMove: () => void;
    onEdit: () => void;
    onDelete: () => void;
}
