const bridgeUrl = process.env.BRIDGE_URL ?? 'http://localhost:4545';
const webUrl = process.env.WEB_URL ?? 'http://localhost:8084';

async function readJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body };
}

function ok(label, details = '') {
  console.log(`OK ${label}${details ? ` - ${details}` : ''}`);
}

function fail(label, details = '') {
  throw new Error(`${label}${details ? ` - ${details}` : ''}`);
}

async function verifyBridge() {
  const health = await readJson(`${bridgeUrl}/health`);
  if (!health.response.ok || !health.body?.ok) {
    fail('bridge health', `HTTP ${health.response.status}`);
  }

  ok('bridge health', health.body.name);

  if (!health.body.safety?.defaultDryRun) {
    fail('bridge safety', 'defaultDryRun must be true');
  }

  if (health.body.safety.realApplyConfirmation !== 'APPLY_REAL_ADB_COMMANDS') {
    fail('bridge safety', 'unexpected real apply confirmation');
  }

  ok('bridge safety', 'dry-run default and real confirmation exposed');

  const catalog = await readJson(`${bridgeUrl}/catalog`);
  if (!catalog.response.ok || !Array.isArray(catalog.body?.catalog)) {
    fail('catalog', `HTTP ${catalog.response.status}`);
  }

  const profileIds = catalog.body.catalog.map((item) => item.id);
  for (const requiredId of ['balanced', 'gaming', 'debloat-safe']) {
    if (!profileIds.includes(requiredId)) {
      fail('catalog', `missing ${requiredId}`);
    }
  }

  ok('catalog', `${catalog.body.catalog.length} profiles`);

  const samsung = await readJson(`${bridgeUrl}/catalog/recommendations?brand=samsung`);
  if (!samsung.response.ok || !samsung.body?.recommendedPackageNames?.length) {
    fail('recommendations', `HTTP ${samsung.response.status}`);
  }

  ok('recommendations', `${samsung.body.recommendedPackageNames.length} Samsung recommended`);

  const protectedApply = await readJson(`${bridgeUrl}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serial: 'PREVIEW',
      optimizationId: 'balanced',
      dryRun: true,
    }),
  });

  if (protectedApply.response.status !== 401) {
    fail('protected endpoints', `expected 401, got ${protectedApply.response.status}`);
  }

  ok('protected endpoints', 'token required');
}

async function verifyWeb() {
  try {
    const response = await fetch(webUrl);
    const html = await response.text();

    if (!response.ok) {
      fail('web app', `HTTP ${response.status}`);
    }

    if (!html.includes('Nexxsensi Mobile Optimizer')) {
      fail('web app', 'expected title not found');
    }

    ok('web app', webUrl);
  } catch (error) {
    console.warn(`WARN web app - ${error.message}`);
    console.warn('WARN web app - start it with: npm run web:dev');
  }
}

await verifyBridge();
await verifyWeb();
