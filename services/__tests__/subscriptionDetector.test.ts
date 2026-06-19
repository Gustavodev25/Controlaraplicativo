/// <reference types="jest" />

import {
    detectSubscriptions,
    getDetectedSubscriptionKey,
} from '../subscriptionDetector';

describe('subscription detector', () => {
    test('creates a stable id for the same detected subscription', () => {
        const transactions = [
            {
                id: 'tx_1',
                description: 'NETFLIX 123',
                amount: 39.9,
                date: '2026-01-10',
                type: 'expense' as const,
            },
            {
                id: 'tx_2',
                description: 'Netflix',
                amount: 39.9,
                date: '2026-02-10',
                type: 'expense' as const,
            },
        ];

        const firstRun = detectSubscriptions(transactions);
        const secondRun = detectSubscriptions(transactions);

        expect(firstRun).toHaveLength(1);
        expect(secondRun).toHaveLength(1);
        expect(firstRun[0].id).toBe(secondRun[0].id);
        expect(firstRun[0].id).toBe('detected_netflix_monthly');
    });

    test('normalizes detection keys by name and frequency', () => {
        expect(getDetectedSubscriptionKey({
            name: 'OpenAI / ChatGPT 2026',
            frequency: 'monthly',
        })).toBe('openai_chatgpt:monthly');
    });
});
