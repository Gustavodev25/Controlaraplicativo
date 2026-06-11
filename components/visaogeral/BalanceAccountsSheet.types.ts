export interface BalanceAccountsSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    userId: string;
    accounts: any[];
    selectedAccountIds: string[];
    onSave: (selectedIds: string[]) => void;
}
