const crypto = require('crypto');
const {
  buildAppleIapDiagnostics,
  EXPECTED_APPLE_BUNDLE_ID,
} = require('../lib/appleIapDiagnostics');

function createEcPrivateKeyPem() {
  const { privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
}

function createRsaPrivateKeyPem() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
}

function validAppleEnv(overrides = {}) {
  return {
    APPLE_SHARED_SECRET: '1234567890abcdef1234567890abcdef',
    APPLE_BUNDLE_ID: EXPECTED_APPLE_BUNDLE_ID,
    APPLE_IAP_KEY_ID: 'ABC123DE45',
    APPLE_IAP_ISSUER_ID: '12345678-1234-1234-1234-1234567890ab',
    APPLE_IAP_PRIVATE_KEY: createEcPrivateKeyPem(),
    APPLE_SERVER_API_ENVIRONMENT: 'auto',
    ...overrides,
  };
}

describe('Apple IAP diagnostics', () => {
  test('passes when Apple IAP and Firebase Admin are configured', () => {
    const diagnostics = buildAppleIapDiagnostics({
      env: validAppleEnv(),
      targetEnvironment: 'sandbox',
      firebaseStatus: { configured: true, error: null },
    });

    expect(diagnostics.status).toBe('ok');
    expect(diagnostics.readyForIosTest).toBe(true);
    expect(diagnostics.canAttemptIosTest).toBe(true);
    expect(diagnostics.summary.fail).toBe(0);
    expect(diagnostics.config.serverApiCredentials.privateKey.asymmetricKeyType).toBe('ec');
    expect(diagnostics.checks.find((check) => check.id === 'appleServerApiJwt').status).toBe('pass');
  });

  test('reports objective failures when required Apple and Firebase config is missing', () => {
    const diagnostics = buildAppleIapDiagnostics({
      env: {},
      targetEnvironment: 'sandbox',
      firebaseStatus: { configured: false, error: 'Firebase Service Account not configured' },
    });

    expect(diagnostics.status).toBe('fail');
    expect(diagnostics.readyForIosTest).toBe(false);
    expect(diagnostics.canAttemptIosTest).toBe(false);
    expect(diagnostics.summary.failingChecks).toEqual(expect.arrayContaining([
      'appleSharedSecret',
      'appleIapKeyId',
      'appleIapIssuerId',
      'appleIapPrivateKey',
      'firebaseAdmin',
      'appleServerApiJwt',
    ]));
  });

  test('warns when production Server API is selected for a sandbox iOS test', () => {
    const diagnostics = buildAppleIapDiagnostics({
      env: validAppleEnv({ APPLE_SERVER_API_ENVIRONMENT: 'production' }),
      targetEnvironment: 'sandbox',
      firebaseStatus: { configured: true, error: null },
    });
    const environmentCheck = diagnostics.checks.find((check) => check.id === 'appleServerApiEnvironment');

    expect(diagnostics.status).toBe('warn');
    expect(diagnostics.readyForIosTest).toBe(false);
    expect(diagnostics.canAttemptIosTest).toBe(true);
    expect(environmentCheck.status).toBe('warn');
    expect(environmentCheck.message).toContain('nao cobre testes sandbox');
  });

  test('fails when the private key is not an EC P-256 App Store key', () => {
    const diagnostics = buildAppleIapDiagnostics({
      env: validAppleEnv({ APPLE_IAP_PRIVATE_KEY: createRsaPrivateKeyPem() }),
      targetEnvironment: 'production',
      firebaseStatus: { configured: true, error: null },
    });
    const privateKeyCheck = diagnostics.checks.find((check) => check.id === 'appleIapPrivateKey');

    expect(diagnostics.status).toBe('fail');
    expect(privateKeyCheck.status).toBe('fail');
    expect(privateKeyCheck.message).toContain('nao e uma chave EC');
  });
});
