const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const firstString = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
};

const getPluggyErrorCode = (payload = {}) => {
    const details = Array.isArray(payload.details) ? payload.details : [];
    const firstDetail = details.find((detail) => detail && typeof detail === 'object') || {};

    return firstString(
        payload.code,
        payload.codeDescription,
        payload.error?.code,
        payload.errorCode,
        firstDetail.code,
        firstDetail.codeDescription
    );
};

const getPluggyErrorMessage = (payload = {}, fallback = 'Falha na comunicacao com a Pluggy') => {
    const details = Array.isArray(payload.details) ? payload.details : [];
    const detailMessages = details
        .map((detail) => firstString(detail?.message, detail?.description))
        .filter(Boolean);

    return firstString(
        ...detailMessages,
        payload.error?.providerMessage,
        payload.error?.message,
        payload.message,
        payload.description,
        fallback
    );
};

const normalizeConnectorSearchKey = (value) => {
    const text = String(value || '');
    const normalizedText = typeof text.normalize === 'function' ? text.normalize('NFD') : text;

    return normalizedText
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
};

const getConnectorDedupeKey = (connector = {}) => {
    const name = normalizeConnectorSearchKey(connector.name);
    const type = normalizeConnectorSearchKey(connector.type);

    if (name) return `${type || 'bank'}:${name}`;
    if (connector.id) return `id:${String(connector.id)}`;

    return null;
};

const getConnectorQualityScore = (connector = {}) => {
    let score = 0;

    if (connector.id) score += 4;
    if (
        connector.imageUrl ||
        connector.logoUrl ||
        connector.iconUrl ||
        connector.image ||
        connector.logo ||
        connector.icon
    ) {
        score += 3;
    }
    if (connector.primaryColor) score += 1;
    if (Array.isArray(connector.credentials)) score += connector.credentials.length;

    return score;
};

const deduplicatePluggyConnectors = (connectors = []) => {
    if (!Array.isArray(connectors)) return [];

    const result = [];
    const keyToIndex = new Map();

    connectors.forEach((connector) => {
        if (!connector || typeof connector !== 'object') return;

        const keys = [
            connector.id ? `id:${String(connector.id)}` : null,
            getConnectorDedupeKey(connector),
        ].filter(Boolean);

        const existingIndex = keys
            .map((key) => keyToIndex.get(key))
            .find((index) => index !== undefined);

        if (existingIndex === undefined) {
            const nextIndex = result.length;
            result.push(connector);
            keys.forEach((key) => keyToIndex.set(key, nextIndex));
            return;
        }

        const current = result[existingIndex];
        if (getConnectorQualityScore(connector) > getConnectorQualityScore(current)) {
            result[existingIndex] = connector;
        }

        keys.forEach((key) => keyToIndex.set(key, existingIndex));
    });

    return result;
};

const isRetryablePluggyError = (status, errorCode) => {
    const code = normalizeCode(errorCode);
    if (RETRYABLE_HTTP_STATUSES.has(Number(status))) return true;

    return (
        code.includes('ALREADY_UPDATING') ||
        code.includes('CONNECTION_ERROR') ||
        code.includes('INSTITUTION_UNAVAILABLE') ||
        code.includes('SITE_NOT_AVAILABLE') ||
        code.includes('TIMEOUT') ||
        code.includes('TEMPORARY') ||
        code.includes('TOO_MANY_REQUESTS')
    );
};

const isActionRequiredPluggyError = (errorCode, message = '') => {
    const normalized = `${normalizeCode(errorCode)} ${normalizeCode(message)}`;

    return (
        normalized.includes('INVALID_CREDENTIAL') ||
        normalized.includes('LOGIN_ERROR') ||
        normalized.includes('MFA') ||
        normalized.includes('OTP') ||
        normalized.includes('USER_AUTHORIZATION') ||
        normalized.includes('ACCOUNT_NEEDS_ACTION') ||
        normalized.includes('PARAMETER') ||
        normalized.includes('CREDENTIAL')
    );
};

const normalizePluggyError = ({
    status = 502,
    payload = {},
    fallbackMessage = 'Servico temporariamente indisponivel',
    fallbackCode = null,
} = {}) => {
    const errorCode = getPluggyErrorCode(payload) || fallbackCode;
    const error = getPluggyErrorMessage(payload, fallbackMessage);

    return {
        success: false,
        error,
        errorCode,
        retryable: isRetryablePluggyError(status, errorCode),
        actionRequired: isActionRequiredPluggyError(errorCode, error),
    };
};

const readResponseBody = async (response) => {
    if (!response) return null;

    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();

    try {
        if (contentType.includes('application/json')) {
            return await response.json();
        }

        const text = await response.text();
        if (!text) return null;

        try {
            return JSON.parse(text);
        } catch {
            return { message: text };
        }
    } catch {
        return null;
    }
};

module.exports = {
    deduplicatePluggyConnectors,
    getPluggyErrorCode,
    getPluggyErrorMessage,
    isActionRequiredPluggyError,
    isRetryablePluggyError,
    normalizePluggyError,
    readResponseBody,
};
