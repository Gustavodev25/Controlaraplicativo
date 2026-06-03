import { resolveApiBaseUrl, resolveApiBaseUrlCandidates } from '../apiBaseUrl';

const PRODUCTION_URL = 'https://prod.example.com';

describe('apiBaseUrl', () => {
    test('keeps normal Android development fallback', () => {
        expect(resolveApiBaseUrl({
            isDev: true,
            platform: 'android',
            productionUrl: PRODUCTION_URL,
        })).toBe('http://10.0.2.2:3001');
    });

    test('infers LAN API URL from Expo host for normal physical-device start', () => {
        expect(resolveApiBaseUrlCandidates({
            isDev: true,
            platform: 'ios',
            expoHostUri: '192.168.15.42:8081',
            productionUrl: PRODUCTION_URL,
        })).toEqual([
            'http://192.168.15.42:3001',
            'http://localhost:3001',
            PRODUCTION_URL,
        ]);
    });

    test('uses the injected API tunnel before local and production fallbacks', () => {
        expect(resolveApiBaseUrlCandidates({
            envApiUrl: ' https://api-controlar.trycloudflare.com/// ',
            isDev: true,
            platform: 'ios',
            expoHostUri: 'metro-controlar.trycloudflare.com:8081',
            productionUrl: PRODUCTION_URL,
        })).toEqual([
            'https://api-controlar.trycloudflare.com',
            'http://localhost:3001',
            PRODUCTION_URL,
        ]);
    });

    test('does not treat a Metro tunnel host as the API host when no API env is injected', () => {
        expect(resolveApiBaseUrlCandidates({
            isDev: true,
            platform: 'ios',
            expoHostUri: 'https://metro-controlar.trycloudflare.com',
            productionUrl: PRODUCTION_URL,
        })).toEqual([
            'http://localhost:3001',
            PRODUCTION_URL,
        ]);
    });
});
