const crypto = require('crypto');
const { Buffer } = require('buffer');

const EXPECTED_APPLE_BUNDLE_ID = 'com.gustavodev25.controlarapp';
const APPLE_PRO_PRODUCT_ID = 'com.gustavodev25.controlarapp.pro.monthly';
const DEFAULT_APPLE_SERVER_API_PRODUCTION_URL = 'https://api.storekit.apple.com';
const DEFAULT_APPLE_SERVER_API_SANDBOX_URL = 'https://api.storekit-sandbox.apple.com';
const VALID_ENVIRONMENTS = new Set(['production', 'sandbox', 'auto']);

function stripWrappingQuotes(value) {
    const raw = String(value || '').trim();
    if (raw.length >= 2) {
        const first = raw[0];
        const last = raw[raw.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return raw.slice(1, -1).trim();
        }
    }
    return raw;
}

function normalizePrivateKey(value) {
    const rawValue = stripWrappingQuotes(value);
    if (!rawValue) return '';

    const withNewlines = rawValue.replace(/\\n/g, '\n');
    if (withNewlines.includes('-----BEGIN')) {
        return withNewlines;
    }

    try {
        const decoded = Buffer.from(withNewlines, 'base64').toString('utf8').trim();
        if (decoded.includes('-----BEGIN')) {
            return decoded.replace(/\\n/g, '\n');
        }
    } catch {
        // Keep the original value so crypto can report the useful parse error.
    }

    return withNewlines;
}

function base64UrlEncode(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function isPlaceholder(value) {
    const normalized = stripWrappingQuotes(value).toLowerCase();
    if (!normalized) return false;
    return (
        normalized === 'todo' ||
        normalized === 'changeme' ||
        normalized === 'change_me' ||
        normalized === 'replace_me' ||
        normalized.includes('...') ||
        normalized.includes('<') ||
        normalized.includes('>') ||
        normalized.includes('seu_') ||
        normalized.includes('your_')
    );
}

function getEnvSetting(env, primaryName, aliases = []) {
    const names = [primaryName, ...aliases];
    for (const name of names) {
        const value = stripWrappingQuotes(env[name]);
        if (value) {
            return {
                configured: true,
                name,
                primaryName,
                usingAlias: name !== primaryName,
                value,
            };
        }
    }

    return {
        configured: false,
        name: null,
        primaryName,
        usingAlias: false,
        value: '',
    };
}

function maskValue(value) {
    const raw = stripWrappingQuotes(value);
    if (!raw) return null;
    if (raw.length <= 8) return '*'.repeat(raw.length);
    return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function createCheck(id, label, status, message, extra = {}) {
    return {
        id,
        label,
        status,
        message,
        ...extra,
    };
}

function countStatuses(checks) {
    return checks.reduce((totals, check) => {
        totals[check.status] = (totals[check.status] || 0) + 1;
        return totals;
    }, { pass: 0, warn: 0, fail: 0 });
}

function getOverallStatus(checks) {
    const counts = countStatuses(checks);
    if (counts.fail > 0) return 'fail';
    if (counts.warn > 0) return 'warn';
    return 'ok';
}

function normalizeTargetEnvironment(value) {
    const normalized = stripWrappingQuotes(value).toLowerCase();
    if (normalized === 'production' || normalized === 'sandbox') return normalized;
    return 'sandbox';
}

function getServerApiCandidates(environment) {
    if (environment === 'auto') return ['production', 'sandbox'];
    if (environment === 'sandbox') return ['sandbox'];
    return ['production'];
}

function getDefaultFirebaseStatus() {
    try {
        // Lazy require keeps this diagnostic module easy to unit test.
        return require('./firebaseAdmin').getFirebaseInitStatus();
    } catch (error) {
        return {
            configured: false,
            error: error.message || 'Firebase Admin status unavailable',
        };
    }
}

function inspectApplePrivateKey(privateKeyValue) {
    const normalizedPrivateKey = normalizePrivateKey(privateKeyValue);
    const result = {
        configured: Boolean(stripWrappingQuotes(privateKeyValue)),
        parseable: false,
        signable: false,
        asymmetricKeyType: null,
        namedCurve: null,
        normalizedNewlines: normalizedPrivateKey.includes('\n'),
        acceptedEncoding: normalizedPrivateKey.includes('-----BEGIN') ? 'pem' : 'unknown',
        error: null,
    };

    try {
        const keyObject = crypto.createPrivateKey(normalizedPrivateKey);
        result.parseable = true;
        result.asymmetricKeyType = keyObject.asymmetricKeyType || null;
        result.namedCurve = keyObject.asymmetricKeyDetails?.namedCurve || null;
        result.keyObject = keyObject;
        return result;
    } catch (error) {
        result.error = error.message;
        return result;
    }
}

function tryCreateAppleServerApiToken({ keyId, issuerId, privateKey, bundleId }) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = {
        alg: 'ES256',
        kid: keyId,
        typ: 'JWT',
    };
    const payload = {
        iss: issuerId,
        iat: nowSeconds,
        exp: nowSeconds + (50 * 60),
        aud: 'appstoreconnect-v1',
        bid: bundleId,
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signer = crypto.createSign('sha256');
    signer.update(signingInput);
    signer.end();

    const signature = signer.sign({
        key: crypto.createPrivateKey(normalizePrivateKey(privateKey)),
        dsaEncoding: 'ieee-p1363',
    });

    return {
        tokenParts: `${signingInput}.${base64UrlEncode(signature)}`.split('.').length,
        expiresAt: new Date((nowSeconds + (50 * 60)) * 1000).toISOString(),
        bundleId: payload.bid,
        audience: payload.aud,
    };
}

function buildUrlCheck(env, urlName, defaultUrl, expectedHostFragment) {
    const value = stripWrappingQuotes(env[urlName]) || defaultUrl;
    const configured = Boolean(stripWrappingQuotes(env[urlName]));

    try {
        const parsed = new URL(value);
        const host = parsed.host.toLowerCase();
        const suspiciousHost = expectedHostFragment && !host.includes(expectedHostFragment);

        if (suspiciousHost) {
            return createCheck(
                urlName,
                urlName,
                'warn',
                `${urlName} aponta para ${parsed.host}; esperado conter "${expectedHostFragment}".`,
                {
                    impact: 'Consultas da App Store Server API podem ir para o ambiente errado.',
                    fix: `Remova o override ou use ${defaultUrl}.`,
                    details: { configured, host: parsed.host },
                }
            );
        }

        return createCheck(
            urlName,
            urlName,
            'pass',
            `${urlName} esta ${configured ? 'configurado' : 'usando o padrao'}: ${parsed.origin}.`,
            { details: { configured, host: parsed.host } }
        );
    } catch (error) {
        return createCheck(
            urlName,
            urlName,
            'fail',
            `${urlName} nao e uma URL valida.`,
            {
                impact: 'O backend nao consegue chamar a App Store Server API.',
                fix: `Use ${defaultUrl} ou remova o override.`,
                details: { configured, error: error.message },
            }
        );
    }
}

function buildAppleIapDiagnostics(options = {}) {
    const env = options.env || process.env;
    const targetEnvironment = normalizeTargetEnvironment(
        options.targetEnvironment ||
        env.APPLE_DIAGNOSTIC_TARGET_ENVIRONMENT ||
        'sandbox'
    );
    const firebaseStatus = options.firebaseStatus || getDefaultFirebaseStatus();
    const checks = [];

    const sharedSecret = getEnvSetting(env, 'APPLE_SHARED_SECRET');
    if (!sharedSecret.configured) {
        checks.push(createCheck(
            'appleSharedSecret',
            'APPLE_SHARED_SECRET',
            'fail',
            'APPLE_SHARED_SECRET ausente.',
            {
                impact: '/api/apple/validate-receipt retorna 500 antes de consultar a Apple.',
                fix: 'Configure o App-Specific Shared Secret da assinatura no backend.',
            }
        ));
    } else if (isPlaceholder(sharedSecret.value)) {
        checks.push(createCheck(
            'appleSharedSecret',
            'APPLE_SHARED_SECRET',
            'fail',
            'APPLE_SHARED_SECRET parece ser placeholder.',
            {
                impact: 'A Apple deve responder 21004 quando o recibo for validado.',
                fix: 'Troque pelo shared secret real do App Store Connect.',
            }
        ));
    } else {
        const hasWhitespace = /\s/.test(sharedSecret.value);
        const looksShort = sharedSecret.value.length < 20;
        checks.push(createCheck(
            'appleSharedSecret',
            'APPLE_SHARED_SECRET',
            hasWhitespace || looksShort ? 'warn' : 'pass',
            hasWhitespace
                ? 'APPLE_SHARED_SECRET contem espacos ou quebras de linha.'
                : looksShort
                    ? 'APPLE_SHARED_SECRET esta configurado, mas parece curto.'
                : 'APPLE_SHARED_SECRET esta configurado.',
            {
                impact: hasWhitespace
                    ? 'O verifyReceipt pode falhar com 21004 se o segredo tiver espacos extras.'
                    : looksShort
                        ? 'Shared secrets reais geralmente sao longos; valor curto pode causar 21004.'
                    : 'O valor exato so e confirmado quando a Apple valida um recibo.',
                fix: hasWhitespace
                    ? 'Remova espacos antes/depois e mantenha o valor em uma unica linha.'
                    : looksShort
                        ? 'Confirme o App-Specific Shared Secret no App Store Connect.'
                    : undefined,
                details: {
                    source: sharedSecret.name,
                    length: sharedSecret.value.length,
                },
            }
        ));
    }

    const keyId = getEnvSetting(env, 'APPLE_IAP_KEY_ID', [
        'APP_STORE_CONNECT_KEY_ID',
        'APPLE_KEY_ID',
    ]);
    const issuerId = getEnvSetting(env, 'APPLE_IAP_ISSUER_ID', [
        'APP_STORE_CONNECT_ISSUER_ID',
        'APPLE_ISSUER_ID',
    ]);
    const privateKey = getEnvSetting(env, 'APPLE_IAP_PRIVATE_KEY', [
        'APP_STORE_CONNECT_PRIVATE_KEY',
        'APPLE_PRIVATE_KEY',
    ]);

    if (!keyId.configured) {
        checks.push(createCheck(
            'appleIapKeyId',
            'APPLE_IAP_KEY_ID',
            'fail',
            'APPLE_IAP_KEY_ID ausente.',
            {
                impact: 'O backend nao consegue assinar JWT para a App Store Server API.',
                fix: 'Configure o Key ID da chave criada em App Store Connect > Users and Access > Integrations.',
            }
        ));
    } else if (isPlaceholder(keyId.value) || !/^[A-Z0-9]{10}$/i.test(keyId.value)) {
        checks.push(createCheck(
            'appleIapKeyId',
            'APPLE_IAP_KEY_ID',
            'fail',
            'APPLE_IAP_KEY_ID nao parece um Key ID valido da Apple.',
            {
                impact: 'A App Store Server API deve rejeitar o JWT.',
                fix: 'Use o Key ID de 10 caracteres da chave .p8.',
                details: { source: keyId.name, valuePreview: maskValue(keyId.value) },
            }
        ));
    } else {
        checks.push(createCheck(
            'appleIapKeyId',
            'APPLE_IAP_KEY_ID',
            keyId.usingAlias ? 'warn' : 'pass',
            keyId.usingAlias
                ? `${keyId.name} esta sendo usado como alias de APPLE_IAP_KEY_ID.`
                : 'APPLE_IAP_KEY_ID esta configurado.',
            {
                fix: keyId.usingAlias ? 'Prefira padronizar como APPLE_IAP_KEY_ID.' : undefined,
                details: { source: keyId.name, valuePreview: maskValue(keyId.value) },
            }
        ));
    }

    if (!issuerId.configured) {
        checks.push(createCheck(
            'appleIapIssuerId',
            'APPLE_IAP_ISSUER_ID',
            'fail',
            'APPLE_IAP_ISSUER_ID ausente.',
            {
                impact: 'O JWT da App Store Server API fica sem iss.',
                fix: 'Configure o Issuer ID de App Store Connect > Users and Access > Integrations.',
            }
        ));
    } else if (
        isPlaceholder(issuerId.value) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId.value)
    ) {
        checks.push(createCheck(
            'appleIapIssuerId',
            'APPLE_IAP_ISSUER_ID',
            'fail',
            'APPLE_IAP_ISSUER_ID nao parece um UUID valido.',
            {
                impact: 'A App Store Server API deve rejeitar o JWT.',
                fix: 'Use o Issuer ID em formato UUID do App Store Connect.',
                details: { source: issuerId.name, valuePreview: maskValue(issuerId.value) },
            }
        ));
    } else {
        checks.push(createCheck(
            'appleIapIssuerId',
            'APPLE_IAP_ISSUER_ID',
            issuerId.usingAlias ? 'warn' : 'pass',
            issuerId.usingAlias
                ? `${issuerId.name} esta sendo usado como alias de APPLE_IAP_ISSUER_ID.`
                : 'APPLE_IAP_ISSUER_ID esta configurado.',
            {
                fix: issuerId.usingAlias ? 'Prefira padronizar como APPLE_IAP_ISSUER_ID.' : undefined,
                details: { source: issuerId.name, valuePreview: maskValue(issuerId.value) },
            }
        ));
    }

    let privateKeyInspection = null;
    if (!privateKey.configured) {
        checks.push(createCheck(
            'appleIapPrivateKey',
            'APPLE_IAP_PRIVATE_KEY',
            'fail',
            'APPLE_IAP_PRIVATE_KEY ausente.',
            {
                impact: 'O backend nao consegue assinar JWT ES256 para a App Store Server API.',
                fix: 'Configure o conteudo da chave .p8, com \\n escapado ou em base64.',
            }
        ));
    } else if (isPlaceholder(privateKey.value)) {
        checks.push(createCheck(
            'appleIapPrivateKey',
            'APPLE_IAP_PRIVATE_KEY',
            'fail',
            'APPLE_IAP_PRIVATE_KEY parece ser placeholder.',
            {
                impact: 'O backend nao consegue criar a chave privada.',
                fix: 'Cole a chave .p8 real do App Store Connect.',
            }
        ));
    } else {
        privateKeyInspection = inspectApplePrivateKey(privateKey.value);
        if (!privateKeyInspection.parseable) {
            checks.push(createCheck(
                'appleIapPrivateKey',
                'APPLE_IAP_PRIVATE_KEY',
                'fail',
                'APPLE_IAP_PRIVATE_KEY nao pode ser lida pelo Node crypto.',
                {
                    impact: 'A geracao do JWT da App Store Server API falha antes de chamar a Apple.',
                    fix: 'Use PEM PKCS8 .p8 com quebras como \\n, ou o PEM completo em base64.',
                    details: {
                        source: privateKey.name,
                        error: privateKeyInspection.error,
                    },
                }
            ));
        } else if (privateKeyInspection.asymmetricKeyType !== 'ec') {
            checks.push(createCheck(
                'appleIapPrivateKey',
                'APPLE_IAP_PRIVATE_KEY',
                'fail',
                'APPLE_IAP_PRIVATE_KEY nao e uma chave EC.',
                {
                    impact: 'A Apple exige JWT ES256 assinado com chave EC P-256.',
                    fix: 'Baixe novamente a chave .p8 de App Store Connect.',
                    details: {
                        source: privateKey.name,
                        asymmetricKeyType: privateKeyInspection.asymmetricKeyType,
                    },
                }
            ));
        } else if (
            privateKeyInspection.namedCurve &&
            !['prime256v1', 'P-256', 'secp256r1'].includes(privateKeyInspection.namedCurve)
        ) {
            checks.push(createCheck(
                'appleIapPrivateKey',
                'APPLE_IAP_PRIVATE_KEY',
                'fail',
                `APPLE_IAP_PRIVATE_KEY usa curva ${privateKeyInspection.namedCurve}, nao P-256.`,
                {
                    impact: 'A assinatura ES256 deve falhar ou ser rejeitada pela Apple.',
                    fix: 'Use a chave .p8 gerada pelo App Store Connect.',
                    details: { source: privateKey.name },
                }
            ));
        } else {
            checks.push(createCheck(
                'appleIapPrivateKey',
                'APPLE_IAP_PRIVATE_KEY',
                privateKey.usingAlias ? 'warn' : 'pass',
                privateKey.usingAlias
                    ? `${privateKey.name} esta sendo usado como alias de APPLE_IAP_PRIVATE_KEY.`
                    : 'APPLE_IAP_PRIVATE_KEY e uma chave EC parseavel.',
                {
                    fix: privateKey.usingAlias ? 'Prefira padronizar como APPLE_IAP_PRIVATE_KEY.' : undefined,
                    details: {
                        source: privateKey.name,
                        asymmetricKeyType: privateKeyInspection.asymmetricKeyType,
                        namedCurve: privateKeyInspection.namedCurve,
                        normalizedNewlines: privateKeyInspection.normalizedNewlines,
                    },
                }
            ));
        }
    }

    const bundleId = stripWrappingQuotes(env.APPLE_BUNDLE_ID) || EXPECTED_APPLE_BUNDLE_ID;
    if (bundleId !== EXPECTED_APPLE_BUNDLE_ID) {
        checks.push(createCheck(
            'appleBundleId',
            'APPLE_BUNDLE_ID',
            'fail',
            `APPLE_BUNDLE_ID esta como ${bundleId}, mas o app espera ${EXPECTED_APPLE_BUNDLE_ID}.`,
            {
                impact: 'Transacoes StoreKit/JWS falham com bundle mismatch e o JWT usa bid errado.',
                fix: `Use APPLE_BUNDLE_ID=${EXPECTED_APPLE_BUNDLE_ID}.`,
                details: { configured: Boolean(env.APPLE_BUNDLE_ID), productId: APPLE_PRO_PRODUCT_ID },
            }
        ));
    } else {
        checks.push(createCheck(
            'appleBundleId',
            'APPLE_BUNDLE_ID',
            'pass',
            `APPLE_BUNDLE_ID esta ${env.APPLE_BUNDLE_ID ? 'configurado' : 'usando o padrao'} como ${bundleId}.`,
            {
                details: {
                    configured: Boolean(env.APPLE_BUNDLE_ID),
                    productId: APPLE_PRO_PRODUCT_ID,
                },
            }
        ));
    }

    const environmentSetting = getEnvSetting(env, 'APPLE_SERVER_API_ENVIRONMENT', [
        'APPLE_IAP_ENVIRONMENT',
    ]);
    const rawEnvironment = environmentSetting.configured ? environmentSetting.value.toLowerCase() : 'production';
    const environment = VALID_ENVIRONMENTS.has(rawEnvironment) ? rawEnvironment : 'invalid';
    if (environment === 'invalid') {
        checks.push(createCheck(
            'appleServerApiEnvironment',
            'APPLE_SERVER_API_ENVIRONMENT',
            'fail',
            `APPLE_SERVER_API_ENVIRONMENT="${environmentSetting.value}" nao e valido.`,
            {
                impact: 'O codigo trata valores desconhecidos como production, o que mascara erro de ambiente.',
                fix: 'Use production, sandbox ou auto.',
                details: { source: environmentSetting.name || 'default', targetEnvironment },
            }
        ));
    } else {
        const candidates = getServerApiCandidates(environment);
        const mismatch =
            environment !== 'auto' &&
            targetEnvironment &&
            !candidates.includes(targetEnvironment);
        const missing = !environmentSetting.configured;
        const usingAlias = environmentSetting.usingAlias;
        let status = 'pass';
        if (mismatch || missing || usingAlias) status = 'warn';

        let message = `APPLE_SERVER_API_ENVIRONMENT=${environment}.`;
        if (missing) {
            message = 'APPLE_SERVER_API_ENVIRONMENT ausente; o backend assume production.';
        } else if (mismatch) {
            message = `APPLE_SERVER_API_ENVIRONMENT=${environment} nao cobre testes ${targetEnvironment}.`;
        } else if (environment === 'auto') {
            message = 'APPLE_SERVER_API_ENVIRONMENT=auto cobre production e sandbox.';
        }

        checks.push(createCheck(
            'appleServerApiEnvironment',
            'APPLE_SERVER_API_ENVIRONMENT',
            status,
            message,
            {
                impact: mismatch
                    ? `Consultas de assinatura ${targetEnvironment} em /api/apple/subscription-status?refresh=true podem falhar.`
                    : 'validate-receipt ja tenta production e, ao receber 21007, repete em sandbox.',
                fix: mismatch || missing
                    ? `Para testar iOS em ${targetEnvironment}, use APPLE_SERVER_API_ENVIRONMENT=auto ou ${targetEnvironment}.`
                    : usingAlias
                        ? 'Prefira padronizar como APPLE_SERVER_API_ENVIRONMENT.'
                        : undefined,
                details: {
                    source: environmentSetting.name || 'default',
                    targetEnvironment,
                    serverApiCandidates: candidates,
                },
            }
        ));
    }

    checks.push(buildUrlCheck(
        env,
        'APPLE_SERVER_API_PRODUCTION_URL',
        DEFAULT_APPLE_SERVER_API_PRODUCTION_URL,
        'storekit.apple.com'
    ));
    checks.push(buildUrlCheck(
        env,
        'APPLE_SERVER_API_SANDBOX_URL',
        DEFAULT_APPLE_SERVER_API_SANDBOX_URL,
        'storekit-sandbox.apple.com'
    ));

    if (firebaseStatus.configured) {
        checks.push(createCheck(
            'firebaseAdmin',
            'Firebase Admin',
            'pass',
            'Firebase Admin inicializou corretamente.',
            { details: { configured: true } }
        ));
    } else {
        checks.push(createCheck(
            'firebaseAdmin',
            'Firebase Admin',
            'fail',
            'Firebase Admin nao esta configurado.',
            {
                impact: 'Rotas Apple retornam 503 ou falham ao validar o token do usuario/gravar Firestore.',
                fix: 'Configure FIREBASE_SERVICE_ACCOUNT ou FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL.',
                details: { configured: false, error: firebaseStatus.error || null },
            }
        ));
    }

    const canTryJwt =
        keyId.configured &&
        issuerId.configured &&
        privateKey.configured &&
        !isPlaceholder(keyId.value) &&
        !isPlaceholder(issuerId.value) &&
        !isPlaceholder(privateKey.value) &&
        privateKeyInspection?.parseable &&
        privateKeyInspection?.asymmetricKeyType === 'ec' &&
        bundleId === EXPECTED_APPLE_BUNDLE_ID;

    let jwtDetails = null;
    if (canTryJwt) {
        try {
            jwtDetails = tryCreateAppleServerApiToken({
                keyId: keyId.value,
                issuerId: issuerId.value,
                privateKey: privateKey.value,
                bundleId,
            });
            checks.push(createCheck(
                'appleServerApiJwt',
                'App Store Server API JWT',
                jwtDetails.tokenParts === 3 ? 'pass' : 'fail',
                jwtDetails.tokenParts === 3
                    ? 'JWT ES256 da App Store Server API assina localmente.'
                    : 'JWT da App Store Server API nao ficou no formato esperado.',
                {
                    impact: 'Isso valida formato/chave local; a Apple ainda pode rejeitar se Key ID e Issuer ID nao pertencem a mesma conta.',
                    details: {
                        tokenParts: jwtDetails.tokenParts,
                        expiresAt: jwtDetails.expiresAt,
                        bundleId: jwtDetails.bundleId,
                        audience: jwtDetails.audience,
                    },
                }
            ));
        } catch (error) {
            checks.push(createCheck(
                'appleServerApiJwt',
                'App Store Server API JWT',
                'fail',
                'Falha ao assinar JWT ES256 da App Store Server API.',
                {
                    impact: 'Refresh de status por App Store Server API falha antes de chamar a Apple.',
                    fix: 'Revise APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID e APPLE_IAP_PRIVATE_KEY.',
                    details: { error: error.message },
                }
            ));
        }
    } else {
        checks.push(createCheck(
            'appleServerApiJwt',
            'App Store Server API JWT',
            'fail',
            'JWT da App Store Server API nao foi testado porque ha credenciais Apple invalidas.',
            {
                impact: 'Corrija os checks Apple acima primeiro.',
            }
        ));
    }

    const status = getOverallStatus(checks);
    const counts = countStatuses(checks);
    const failingChecks = checks.filter((check) => check.status === 'fail').map((check) => check.id);
    const warningChecks = checks.filter((check) => check.status === 'warn').map((check) => check.id);

    return {
        status,
        readyForIosTest: status === 'ok',
        canAttemptIosTest: counts.fail === 0,
        timestamp: new Date().toISOString(),
        targetEnvironment,
        summary: {
            pass: counts.pass || 0,
            warn: counts.warn || 0,
            fail: counts.fail || 0,
            failingChecks,
            warningChecks,
        },
        config: {
            bundleId: {
                value: bundleId,
                expected: EXPECTED_APPLE_BUNDLE_ID,
                source: env.APPLE_BUNDLE_ID ? 'APPLE_BUNDLE_ID' : 'default',
            },
            productId: APPLE_PRO_PRODUCT_ID,
            sharedSecret: {
                configured: sharedSecret.configured,
                source: sharedSecret.name,
                length: sharedSecret.configured ? sharedSecret.value.length : 0,
            },
            serverApiCredentials: {
                keyId: {
                    configured: keyId.configured,
                    source: keyId.name,
                    valuePreview: maskValue(keyId.value),
                },
                issuerId: {
                    configured: issuerId.configured,
                    source: issuerId.name,
                    valuePreview: maskValue(issuerId.value),
                },
                privateKey: privateKeyInspection
                    ? {
                        configured: true,
                        source: privateKey.name,
                        parseable: privateKeyInspection.parseable,
                        asymmetricKeyType: privateKeyInspection.asymmetricKeyType,
                        namedCurve: privateKeyInspection.namedCurve,
                        normalizedNewlines: privateKeyInspection.normalizedNewlines,
                    }
                    : {
                        configured: privateKey.configured,
                        source: privateKey.name,
                        parseable: false,
                    },
            },
            serverApiEnvironment: {
                value: environment,
                rawValue: environmentSetting.configured ? environmentSetting.value : null,
                source: environmentSetting.name || 'default',
                targetEnvironment,
                candidates: environment === 'invalid' ? [] : getServerApiCandidates(environment),
            },
            firebaseAdmin: {
                configured: Boolean(firebaseStatus.configured),
                error: firebaseStatus.error || null,
            },
        },
        checks,
        notes: [
            'Sandbox, TestFlight e App Review usam ambiente sandbox para compras de teste.',
            'A rota /api/apple/validate-receipt chama production primeiro e repete em sandbox quando a Apple retorna 21007.',
            'A App Store Server API usa APPLE_SERVER_API_ENVIRONMENT; auto e o modo mais seguro durante testes mistos.',
            'Segredos nao sao retornados neste diagnostico, apenas presenca, formato e metadados mascarados.',
        ],
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderAppleIapDiagnosticsHtml(diagnostics) {
    const statusClass = diagnostics.status === 'ok'
        ? 'ok'
        : diagnostics.status === 'warn'
            ? 'warn'
            : 'fail';
    const checksHtml = diagnostics.checks.map((check) => `
        <article class="check ${escapeHtml(check.status)}">
            <div>
                <strong>${escapeHtml(check.label)}</strong>
                <span>${escapeHtml(check.status.toUpperCase())}</span>
            </div>
            <p>${escapeHtml(check.message)}</p>
            ${check.impact ? `<p class="muted"><b>Impacto:</b> ${escapeHtml(check.impact)}</p>` : ''}
            ${check.fix ? `<p class="muted"><b>Como corrigir:</b> ${escapeHtml(check.fix)}</p>` : ''}
        </article>
    `).join('');

    return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Apple IAP Diagnostics</title>
    <style>
        :root {
            color-scheme: light dark;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #f6f7f9;
            color: #17202a;
        }
        body {
            margin: 0;
            padding: 32px;
        }
        main {
            max-width: 980px;
            margin: 0 auto;
        }
        header {
            margin-bottom: 22px;
        }
        h1 {
            margin: 0 0 8px;
            font-size: clamp(1.7rem, 3vw, 2.4rem);
            letter-spacing: 0;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
            margin: 18px 0;
        }
        .metric, .check {
            background: #ffffff;
            border: 1px solid #dde3ea;
            border-radius: 8px;
            padding: 14px 16px;
        }
        .metric strong {
            display: block;
            font-size: 1.35rem;
        }
        .status {
            display: inline-flex;
            border-radius: 999px;
            padding: 6px 10px;
            font-weight: 700;
            font-size: 0.85rem;
        }
        .status.ok, .check.pass span { background: #dff7ea; color: #0f6b3a; }
        .status.warn, .check.warn span { background: #fff4cc; color: #7a5400; }
        .status.fail, .check.fail span { background: #ffe1df; color: #9d2018; }
        .check {
            margin: 10px 0;
        }
        .check div {
            display: flex;
            gap: 12px;
            justify-content: space-between;
            align-items: center;
        }
        .check span {
            border-radius: 999px;
            padding: 4px 8px;
            font-size: 0.72rem;
            font-weight: 800;
        }
        p {
            line-height: 1.5;
        }
        .muted {
            color: #56616f;
            margin-bottom: 0;
        }
        code {
            background: #edf1f5;
            border-radius: 5px;
            padding: 2px 5px;
        }
        @media (prefers-color-scheme: dark) {
            :root { background: #101418; color: #e8eef5; }
            .metric, .check { background: #171d23; border-color: #2a3440; }
            .muted { color: #aab6c3; }
            code { background: #252f3a; }
        }
    </style>
</head>
<body>
    <main>
        <header>
            <h1>Apple IAP Diagnostics</h1>
            <span class="status ${escapeHtml(statusClass)}">${escapeHtml(diagnostics.status.toUpperCase())}</span>
            <p>Target: <code>${escapeHtml(diagnostics.targetEnvironment)}</code> &middot; ${escapeHtml(diagnostics.timestamp)}</p>
        </header>
        <section class="summary">
            <div class="metric"><strong>${diagnostics.summary.fail}</strong> falhas</div>
            <div class="metric"><strong>${diagnostics.summary.warn}</strong> avisos</div>
            <div class="metric"><strong>${diagnostics.summary.pass}</strong> ok</div>
            <div class="metric"><strong>${diagnostics.readyForIosTest ? 'Sim' : 'Nao'}</strong> pronto para teste iOS</div>
        </section>
        <section>
            ${checksHtml}
        </section>
        <section>
            <h2>Notas</h2>
            ${diagnostics.notes.map((note) => `<p class="muted">${escapeHtml(note)}</p>`).join('')}
        </section>
    </main>
</body>
</html>`;
}

module.exports = {
    APPLE_PRO_PRODUCT_ID,
    EXPECTED_APPLE_BUNDLE_ID,
    buildAppleIapDiagnostics,
    inspectApplePrivateKey,
    normalizePrivateKey,
    renderAppleIapDiagnosticsHtml,
};
