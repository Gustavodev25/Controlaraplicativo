export interface InvoiceActionsSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    showInvoiceCards: boolean;
    onConfigureInvoice: () => void;
    onSearchTransaction: () => void;
    onCreateManualAccount: () => void;
    onCreateManualTransaction: () => void;
    onToggleInvoiceCards: () => void;
}
