import { API_BASE_URL_CANDIDATES } from '@/services/apiBaseUrl';

const REQUEST_TIMEOUT_MS = 60000;

type ApiResult<T = Record<string, unknown>> = T & {
    success: boolean;
    error?: string;
    remainingSeconds?: number;
    remainingAttempts?: number;
};

type RequestOptions = {
    path: string;
    body: Record<string, unknown>;
};

export type RegisterWithEmailCodeInput = {
    email: string;
    password: string;
    name: string;
    phone?: string | null;
    code: string;
    signupPlatform: 'android' | 'iphone' | 'web' | 'unknown';
    signupSource: 'mobile' | 'web';
    createdFromMobile: boolean;
};

const API_URLS = Array.from(new Set(API_BASE_URL_CANDIDATES));

function isRetryableStatus(status: number): boolean {
    return [408, 502, 504].includes(status);
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal as any,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error: any) {
        clearTimeout(timeoutId);
        const message = String(error?.message || '');
        if (error?.name === 'AbortError' || /abort|cancel/i.test(message)) {
            throw new TypeError('Tempo de conexao esgotado.');
        }
        throw error;
    }
}

async function readPayload(response: Response): Promise<any | null> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

async function postJson<T = Record<string, unknown>>({ path, body }: RequestOptions): Promise<ApiResult<T>> {
    let lastError = 'Nao foi possivel conectar ao servidor.';

    for (const baseUrl of API_URLS) {
        try {
            const response = await fetchWithTimeout(`${baseUrl}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            const payload = await readPayload(response);

            if (response.ok && payload?.success) {
                return payload as ApiResult<T>;
            }

            lastError = payload?.error || `Erro HTTP ${response.status}`;
            if (!isRetryableStatus(response.status)) {
                return {
                    success: false,
                    error: lastError,
                    remainingAttempts: payload?.remainingAttempts,
                    remainingSeconds: payload?.remainingSeconds,
                } as ApiResult<T>;
            }
        } catch (error: any) {
            lastError = error?.message || lastError;
        }
    }

    return {
        success: false,
        error: `Erro de rede: ${lastError}`,
    } as ApiResult<T>;
}

export function requestEmailVerificationCode(input: {
    email: string;
    name?: string;
}): Promise<ApiResult<{ expiresInSeconds?: number; resendAfterSeconds?: number }>> {
    return postJson({
        path: '/api/auth/email-verification/request',
        body: input,
    });
}

export function registerWithEmailCode(input: RegisterWithEmailCodeInput): Promise<ApiResult<{
    user?: {
        uid: string;
        email?: string;
        emailVerified?: boolean;
    };
}>> {
    return postJson({
        path: '/api/auth/register-with-email-code',
        body: input,
    });
}
