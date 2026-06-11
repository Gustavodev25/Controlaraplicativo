export interface CalendarioEventsSheetProps {
    visible: boolean;
    onVisibleChange: (visible: boolean) => void;
    selectedDate: Date;
    selectedEvents: any[];
}
