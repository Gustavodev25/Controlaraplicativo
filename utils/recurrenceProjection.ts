export interface RecurrenceProjectionInput {
  id?: string;
  type?: string;
  name?: string;
  amount?: number | string | null;
  dueDate?: string | null;
  date?: string | null;
  cancellationDate?: string | null;
  frequency?: string | null;
  recurrence?: string | null;
  cycle?: string | null;
  status?: string | null;
  paid?: boolean | null;
  paidMonths?: string[] | null;
  transactionType?: string | null;
  isValidated?: boolean;
}

export type ProjectedSubscription<T extends RecurrenceProjectionInput> = T & {
  dueDate: string;
  status: 'paid' | 'pending';
};

export interface SubscriptionProjectionTotals {
  expenseTotal: number;
  expensePaid: number;
  expensePending: number;
  incomeTotal: number;
  incomeReceived: number;
  incomePending: number;
}

const MONTH_PATTERN = /^(\d{4})-(\d{1,2})/;
const DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

export const normalizeMonthKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';

  const match = MONTH_PATTERN.exec(value.trim());
  if (!match) return '';

  return `${match[1]}-${match[2].padStart(2, '0')}`;
};

const parseDateParts = (value: unknown): { year: number; month: number; day: number } | null => {
  if (typeof value !== 'string') return null;

  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
};

const parseMonthParts = (monthKey: string): { year: number; month: number } | null => {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return null;

  const [yearRaw, monthRaw] = normalized.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
};

const getSubscriptionFrequency = (item: RecurrenceProjectionInput): string => {
  return String(item.frequency || item.recurrence || item.cycle || 'monthly').trim().toLowerCase();
};

export const isSubscriptionPaidInMonth = (
  item: RecurrenceProjectionInput,
  selectedMonthKey: string
): boolean => {
  const normalizedSelectedMonth = normalizeMonthKey(selectedMonthKey);
  if (!normalizedSelectedMonth) return false;

  const paidMonths = Array.isArray(item.paidMonths) ? item.paidMonths : [];
  if (paidMonths.length > 0) {
    return paidMonths.some(month => normalizeMonthKey(month) === normalizedSelectedMonth);
  }

  const status = String(item.status || '').trim().toLowerCase();
  const isMarkedPaid = status === 'paid' || item.paid === true;
  if (!isMarkedPaid) return false;

  return normalizeMonthKey(item.dueDate || item.date || '') === normalizedSelectedMonth;
};

export const projectSubscriptionForMonth = <T extends RecurrenceProjectionInput>(
  item: T,
  selectedMonthKey: string
): ProjectedSubscription<T> | null => {
  if (item.type !== 'subscription') return null;

  const selectedParts = parseMonthParts(selectedMonthKey);
  const dueParts = parseDateParts(item.dueDate || item.date || '');
  if (!selectedParts || !dueParts) return null;

  const normalizedSelectedMonth = normalizeMonthKey(selectedMonthKey);
  const startMonthKey = normalizeMonthKey(item.dueDate || item.date || '');
  if (!startMonthKey || startMonthKey > normalizedSelectedMonth) return null;

  const cancellationMonthKey = normalizeMonthKey(item.cancellationDate || '');
  if (cancellationMonthKey && cancellationMonthKey <= normalizedSelectedMonth) {
    return null;
  }

  const frequency = getSubscriptionFrequency(item);
  if (frequency === 'yearly' && dueParts.month !== selectedParts.month) {
    return null;
  }
  if (frequency !== 'monthly' && frequency !== 'yearly') {
    return null;
  }

  const daysInSelectedMonth = new Date(selectedParts.year, selectedParts.month, 0).getDate();
  const projectedDay = Math.min(dueParts.day, daysInSelectedMonth);
  const projectedDueDate = [
    selectedParts.year,
    String(selectedParts.month).padStart(2, '0'),
    String(projectedDay).padStart(2, '0'),
  ].join('-');

  return {
    ...item,
    frequency,
    dueDate: projectedDueDate,
    status: isSubscriptionPaidInMonth(item, normalizedSelectedMonth) ? 'paid' : 'pending',
  };
};

export const summarizeProjectedSubscriptions = (
  recurrences: RecurrenceProjectionInput[],
  selectedMonthKey: string
): SubscriptionProjectionTotals => {
  return recurrences.reduce<SubscriptionProjectionTotals>((totals, item) => {
    if (item.isValidated === false) return totals;

    const projected = projectSubscriptionForMonth(item, selectedMonthKey);
    if (!projected) return totals;

    const amount = Number(projected.amount) || 0;
    const isIncome = projected.transactionType === 'income';
    const isPaid = projected.status === 'paid';

    if (isIncome) {
      if (isPaid) totals.incomeReceived += amount;
      else totals.incomePending += amount;
      totals.incomeTotal += amount;
      return totals;
    }

    if (isPaid) totals.expensePaid += amount;
    else totals.expensePending += amount;
    totals.expenseTotal += amount;

    return totals;
  }, {
    expenseTotal: 0,
    expensePaid: 0,
    expensePending: 0,
    incomeTotal: 0,
    incomeReceived: 0,
    incomePending: 0,
  });
};
