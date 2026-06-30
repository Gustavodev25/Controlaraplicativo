#!/usr/bin/env node

const DEFAULT_BACKEND_URL = 'https://backendcontrolarapp-production.up.railway.app';
const DEFAULT_TIMEOUT_MS = 15000;

const fetchImpl = global.fetch || require('node-fetch');

function normalizeBaseUrl(value) {
    return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, '');
}

function getTimeoutMs() {
    const parsed = Number(process.env.IAP_READINESS_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function getBackendUrl() {
    return normalizeBaseUrl(
        process.env.IAP_BACKEND_URL ||
        process.env.EXPO_PUBLIC_IAP_API_URL ||
        process.env.PUBLIC_BASE_URL ||
        DEFAULT_BACKEND_URL
    );
}

async function requestJson(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
    const headers = {
        Accept: 'application/json',
        ...(options.adminToken ? { Authorization: `Bearer ${options.adminToken}` } : {}),
    };

    try {
        const response = await fetchImpl(`${getBackendUrl()}${path}`, {
            method: 'GET',
            headers,
            signal: controller.signal,
        });
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = { raw: text.slice(0, 500) };
        }

        return {
            ok: response.ok,
            statusCode: response.status,
            body,
        };
    } finally {
        clearTimeout(timeout);
    }
}

function result(name, status, message, details = {}) {
    return { name, status, message, details };
}

function evaluateHealth(body) {
    if (!body || body.status !== 'ok') {
        return result('backend_health', 'fail', 'Backend health nao retornou ok.', { body });
    }
    if (body.firebase !== 'connected') {
        return result('firebase_admin', 'fail', 'Firebase Admin nao esta conectado em producao.', {
            firebase: body.firebase,
        });
    }
    if (body.googlePlay !== 'configured') {
        return result('google_play_env', 'fail', 'GOOGLE_PLAY_SERVICE_ACCOUNT nao aparece configurado no backend.', {
            googlePlay: body.googlePlay,
        });
    }

    return result('backend_health', 'pass', 'Backend, Firebase e Google Play basico estao configurados.', {
        firebase: body.firebase,
        googlePlay: body.googlePlay,
    });
}

function evaluateAppleDiagnostics(target, body) {
    const summary = body?.summary || {};
    if (!body) {
        return result(`apple_${target}`, 'fail', `Diagnostico Apple ${target} nao retornou JSON.`);
    }
    if (body.status !== 'ok') {
        return result(
            `apple_${target}`,
            summary.fail > 0 ? 'fail' : 'blocked',
            `Apple ${target} ainda nao esta pronto: status ${body.status}.`,
            {
                pass: summary.pass || 0,
                warn: summary.warn || 0,
                fail: summary.fail || 0,
                warnings: summary.warningChecks || [],
                failures: summary.failingChecks || [],
            }
        );
    }

    return result(`apple_${target}`, 'pass', `Apple ${target} sem falhas ou avisos.`, {
        pass: summary.pass || 0,
    });
}

function evaluateGoogleDiagnostics(response, adminTokenConfigured) {
    if (!adminTokenConfigured) {
        return result(
            'google_android_publisher',
            'blocked',
            'ADMIN_API_TOKEN ausente; nao foi possivel validar permissoes reais da Android Publisher API.',
            {
                fix: 'Defina ADMIN_API_TOKEN localmente e rode novamente.',
            }
        );
    }
    if (!response.ok) {
        return result(
            'google_android_publisher',
            'fail',
            `Diagnostico Google respondeu HTTP ${response.statusCode}.`,
            { body: response.body }
        );
    }

    const body = response.body || {};
    const checks = Array.isArray(body.checks) ? body.checks : [];
    const failedChecks = checks.filter((check) => check.status !== 'pass');

    if (!body.success || failedChecks.length > 0) {
        return result(
            'google_android_publisher',
            'fail',
            'Android Publisher API nao passou todos os checks.',
            {
                serviceAccount: {
                    configured: body.serviceAccount?.configured,
                    clientEmail: body.serviceAccount?.clientEmail,
                    packageName: body.serviceAccount?.packageName,
                    productId: body.serviceAccount?.productId,
                },
                failedChecks,
            }
        );
    }

    return result('google_android_publisher', 'pass', 'Android Publisher API passou OAuth, catalogo e Purchases API.', {
        checks: checks.map((check) => check.name),
        packageName: body.serviceAccount?.packageName,
        productId: body.serviceAccount?.productId,
    });
}

function summarize(results) {
    const totals = results.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
    }, { pass: 0, blocked: 0, fail: 0 });

    return {
        ready: totals.fail === 0 && totals.blocked === 0,
        totals,
    };
}

function printHumanReport(payload) {
    console.log(`IAP readiness backend: ${payload.backendUrl}`);
    console.log(`Ready for traffic: ${payload.ready ? 'YES' : 'NO'}`);
    console.log('');

    for (const item of payload.results) {
        const marker = item.status.toUpperCase().padEnd(7);
        console.log(`${marker} ${item.name}: ${item.message}`);
        if (item.details?.fix) {
            console.log(`        Fix: ${item.details.fix}`);
        }
    }

    if (!payload.ready) {
        console.log('');
        console.log('Nao solte trafego pago ate todos os gates ficarem PASS e as compras reais de teste Apple/Google terminarem o ciclo trial/cancelamento/expiracao.');
    }
}

async function main() {
    const args = new Set(process.argv.slice(2));
    const adminToken = String(process.env.ADMIN_API_TOKEN || '').trim();
    const results = [];

    try {
        const health = await requestJson('/health');
        results.push(evaluateHealth(health.body));

        for (const target of ['production', 'sandbox']) {
            const diagnostics = await requestJson(`/api/diagnostics/apple-iap?target=${target}`);
            results.push(evaluateAppleDiagnostics(target, diagnostics.body));
        }

        const googleDiagnostics = adminToken
            ? await requestJson('/api/google/diagnostics', { adminToken })
            : { ok: false, statusCode: 0, body: null };
        results.push(evaluateGoogleDiagnostics(googleDiagnostics, Boolean(adminToken)));
    } catch (error) {
        results.push(result('iap_readiness_check', 'fail', error.message || String(error)));
    }

    const summary = summarize(results);
    const payload = {
        ready: summary.ready,
        timestamp: new Date().toISOString(),
        backendUrl: getBackendUrl(),
        totals: summary.totals,
        results,
    };

    if (args.has('--json')) {
        console.log(JSON.stringify(payload, null, 2));
    } else {
        printHumanReport(payload);
    }

    if (!payload.ready && !args.has('--soft')) {
        process.exitCode = 1;
    }
}

main();
