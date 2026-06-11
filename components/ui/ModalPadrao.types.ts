import { ModalProps, ScrollViewProps, StyleProp, TextStyle, ViewStyle } from 'react-native';

export interface ModalPadraoProps
    extends Omit<ModalProps, 'visible' | 'transparent' | 'animationType'> {
    visible: boolean;
    onClose: () => void;
    title: string | React.ReactNode;
    children: React.ReactNode;

    headerRight?: React.ReactNode;
    footer?: React.ReactNode;

    closeOnBackdropPress?: boolean;
    enableDragToClose?: boolean;
    showHandle?: boolean;
    scrollable?: boolean;

    maxHeightRatio?: number;
    minHeight?: number;
    size?: 'sm' | 'md' | 'lg' | 'full';
    modalWidth?: number | `${number}%`;
    maxWidth?: number;
    horizontalMargin?: number;

    contentStyle?: StyleProp<ViewStyle>;
    headerStyle?: StyleProp<ViewStyle>;
    bodyStyle?: StyleProp<ViewStyle>;
    titleStyle?: StyleProp<TextStyle>;
    footerStyle?: StyleProp<ViewStyle>;
    closeButtonStyle?: StyleProp<ViewStyle>;
    backdropStyle?: StyleProp<ViewStyle>;
    scrollViewProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle'>;

    titleAlign?: 'center' | 'start';
    presentation?: 'bottom' | 'center';

    hideCloseButton?: boolean;
    canClose?: boolean;
    onBeforeClose?: () => boolean | Promise<boolean>;

    loading?: boolean;
    disableCloseWhenLoading?: boolean;

    footerSafeArea?: boolean;
    footerBorder?: boolean;

    keyboardVerticalOffset?: number;

    onAfterOpen?: () => void;
    onAfterClose?: () => void;
    onDragClose?: () => void;

    closeButtonAccessibilityLabel?: string;
}
