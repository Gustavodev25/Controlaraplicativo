export interface ProfileActionsSheetProps {
    visible: boolean;
    displayName: string;
    email: string;
    avatarValue: string;
    onVisibleChange: (visible: boolean) => void;
    onSettings: () => void;
    onSignOut: () => void | Promise<void>;
}
