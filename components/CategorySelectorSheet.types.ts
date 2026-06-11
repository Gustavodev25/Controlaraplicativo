import { CategoryGroup } from '@/constants/defaultCategories';

export interface CategorySelectorSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    onSelect: (categoryKey: string) => void;
    categories: CategoryGroup[];
    loading?: boolean;
}
