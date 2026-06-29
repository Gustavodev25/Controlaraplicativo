/* global describe, expect, test */

const {
    deduplicatePluggyConnectors,
    isActionRequiredPluggyError,
    isRetryablePluggyError,
    normalizePluggyError,
} = require('../pluggy.helpers');

describe('pluggy helpers', () => {
    test('marks rate limit and server errors as retryable', () => {
        expect(isRetryablePluggyError(429, 'TOO_MANY_REQUESTS')).toBe(true);
        expect(isRetryablePluggyError(503, 'SERVICE_UNAVAILABLE')).toBe(true);
    });

    test('marks credential and MFA errors as action required', () => {
        expect(isActionRequiredPluggyError('INVALID_CREDENTIALS')).toBe(true);
        expect(isActionRequiredPluggyError('MFA_REQUIRED')).toBe(true);
    });

    test('normalizes details and retry metadata', () => {
        const result = normalizePluggyError({
            status: 409,
            payload: {
                codeDescription: 'ALREADY_UPDATING',
                details: [{ message: 'Item is already updating' }],
            },
            fallbackMessage: 'Fallback',
        });

        expect(result).toMatchObject({
            success: false,
            error: 'Item is already updating',
            errorCode: 'ALREADY_UPDATING',
            retryable: true,
            actionRequired: false,
        });
    });

    test('deduplicates bank connectors by display identity', () => {
        const result = deduplicatePluggyConnectors([
            { id: 1, name: 'Inter', type: 'PERSONAL_BANK', credentials: [] },
            { id: 2, name: 'Inter', type: 'PERSONAL_BANK', credentials: [{ name: 'cpf' }] },
            { id: 3, name: 'Inter Empresas', type: 'BUSINESS_BANK' },
            { id: 4, name: 'Inter Empresas', type: 'BUSINESS_BANK' },
            { id: 5, name: 'Inter Empresas', type: 'PERSONAL_BANK' },
        ]);

        expect(result).toHaveLength(3);
        expect(result.map((connector) => connector.name)).toEqual([
            'Inter',
            'Inter Empresas',
            'Inter Empresas',
        ]);
        expect(result[0].id).toBe(2);
    });
});
