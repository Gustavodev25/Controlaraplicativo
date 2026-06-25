export interface BankActionsSheetProps {
    visible: boolean;
    bankName: string;
    syncDisabled: boolean;
    onVisibleChange: (visible: boolean) => void;
    onSync: () => void;
    onDisconnect: () => void;
    isManual?: boolean;
    onCreateCard?: () => void;
    onCreateSavings?: () => void;
}
