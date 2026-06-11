export interface BankActionsSheetProps {
    visible: boolean;
    bankName: string;
    syncDisabled: boolean;
    onVisibleChange: (visible: boolean) => void;
    onSync: () => void;
    onDisconnect: () => void;
}
