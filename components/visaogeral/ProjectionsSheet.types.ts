import type { ProjectionSettings } from '@/components/ProjectionsModal';

export interface ProjectionsSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    currentSettings: ProjectionSettings;
    onSave: (settings: ProjectionSettings) => Promise<void> | void;
    salaryPreview: number;
    valePreview: number;
    includeOpenFinance: boolean;
    onToggleOpenFinance: (value: boolean) => Promise<void> | void;
}
