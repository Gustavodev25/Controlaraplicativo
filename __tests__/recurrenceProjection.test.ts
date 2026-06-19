/// <reference types="jest" />

import {
  projectSubscriptionForMonth,
  summarizeProjectedSubscriptions,
} from '../utils/recurrenceProjection';

describe('recurrence subscription projection', () => {
  test('projects monthly subscriptions into the selected month and clamps long days', () => {
    const projected = projectSubscriptionForMonth({
      type: 'subscription',
      name: 'Streaming',
      amount: 39.9,
      dueDate: '2026-01-31',
      frequency: 'monthly',
      transactionType: 'expense',
    }, '2026-02');

    expect(projected?.dueDate).toBe('2026-02-28');
    expect(projected?.status).toBe('pending');
  });

  test('only includes yearly subscriptions in their due month', () => {
    const yearly = {
      type: 'subscription',
      name: 'Annual app',
      amount: 120,
      dueDate: '2026-03-15',
      frequency: 'yearly',
      transactionType: 'expense',
    };

    expect(projectSubscriptionForMonth(yearly, '2026-03')?.dueDate).toBe('2026-03-15');
    expect(projectSubscriptionForMonth(yearly, '2026-04')).toBeNull();
  });

  test('excludes subscriptions before start month and from cancellation month onward', () => {
    const subscription = {
      type: 'subscription',
      name: 'Gym',
      amount: 99,
      dueDate: '2026-02-05',
      cancellationDate: '2026-04-01',
      frequency: 'monthly',
      transactionType: 'expense',
    };

    expect(projectSubscriptionForMonth(subscription, '2026-01')).toBeNull();
    expect(projectSubscriptionForMonth(subscription, '2026-03')?.dueDate).toBe('2026-03-05');
    expect(projectSubscriptionForMonth(subscription, '2026-04')).toBeNull();
  });

  test('summarizes paid, pending, income, and unvalidated suggestions consistently', () => {
    const totals = summarizeProjectedSubscriptions([
      {
        type: 'subscription',
        name: 'Pending expense',
        amount: 20,
        dueDate: '2026-06-10',
        frequency: 'monthly',
        transactionType: 'expense',
      },
      {
        type: 'subscription',
        name: 'Paid expense',
        amount: 10,
        dueDate: '2026-06-12',
        frequency: 'monthly',
        paidMonths: ['2026-6'],
        transactionType: 'expense',
      },
      {
        type: 'subscription',
        name: 'Income',
        amount: 100,
        dueDate: '2026-06-15',
        frequency: 'monthly',
        transactionType: 'income',
      },
      {
        type: 'subscription',
        name: 'Detected only',
        amount: 999,
        dueDate: '2026-06-20',
        frequency: 'monthly',
        transactionType: 'expense',
        isValidated: false,
      },
    ], '2026-06');

    expect(totals).toEqual({
      expenseTotal: 30,
      expensePaid: 10,
      expensePending: 20,
      incomeTotal: 100,
      incomeReceived: 0,
      incomePending: 100,
    });
  });
});
