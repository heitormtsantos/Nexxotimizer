import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  buildOptimization,
  catalog,
  getPackageRecommendations,
  packageCatalog,
  supportedBrands,
} from './catalog.mjs';
import {
  captureDeviceSnapshot,
  connectWifi,
  disconnectWifi,
  enableTcpIp,
  getAdbStatus,
  listInstalledPackages,
  listDevices,
  pairWifi,
  runDeviceAdb,
} from './adb.mjs';
import { ensureStore, listRevertRecords, saveRevertRecord } from './store.mjs';
import {
  readBridgeConfig,
  rotateBridgeToken,
  rotatePairingCode,
} from './store.mjs';
import { getPlatformToolsStatus, installPlatformTools } from './platformTools.mjs';

const port = Number(process.env.ADB_BRIDGE_PORT ?? 4545);
const realApplyConfirmation = 'APPLY_REAL_ADB_COMMANDS';
const realRevertConfirmation = 'REVERT_REAL_ADB_COMMANDS';

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body, null, 2));
}

function html(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(body);
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function getPairingStatus(request) {
  const config = await readBridgeConfig();
  const canShowCode = isLocalRequest(request);

  return {
    pairingCode: canShowCode ? config.pairingCode : null,
    pairingCodeCreatedAt: config.pairingCodeCreatedAt,
    tokenCreatedAt: config.tokenCreatedAt,
    codeVisible: canShowCode,
  };
}

async function authorize(request, response) {
  const config = await readBridgeConfig();
  const token = request.headers['x-bridge-token'];

  if (token === config.token) {
    return true;
  }

  json(response, 401, {
    error: 'bridge token required',
    pairing: await getPairingStatus(request),
  });
  return false;
}

function getLanUrls() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${port}`);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function resolveSnapshotToken(value, snapshot) {
  if (typeof value !== 'string' || !value.startsWith('{{snapshot.')) {
    return value;
  }

  const path = value.replace('{{snapshot.', '').replace('}}', '').split('.');
  return path.reduce((current, part) => current?.[part], snapshot) ?? '1';
}

async function applyOptimization(body) {
  const { optimizationId, dryRun = true } = body;
  const serial = body.serial || (dryRun ? 'PREVIEW' : '');
  const item = buildOptimization(optimizationId, {
    selectedPackages: body.selectedPackages,
  });

  if (!serial) {
    return { status: 400, body: { error: 'serial is required' } };
  }

  if (!item) {
    return { status: 404, body: { error: 'optimization not found' } };
  }

  if (!dryRun && body.confirmation !== realApplyConfirmation) {
    return {
      status: 409,
      body: {
        error: 'real execution requires explicit confirmation',
        requiredConfirmation: realApplyConfirmation,
      },
    };
  }

  if (!dryRun && serial === 'PREVIEW') {
    return { status: 400, body: { error: 'real execution requires a real device serial' } };
  }

  const snapshot = await captureDeviceSnapshot(serial, item);
  const executed = [];

  for (const command of item.commands) {
    if (dryRun) {
      executed.push({
        id: command.id,
        title: command.title,
        dryRun: true,
        command: ['adb', '-s', serial, ...command.apply].join(' '),
      });
      continue;
    }

    const result = await runDeviceAdb(serial, command.apply);
    executed.push({ id: command.id, title: command.title, ...result });

    if (!result.ok) {
      break;
    }
  }

  const record = {
    schemaVersion: 1,
    serial,
    optimizationId,
    optimizationName: item.name,
    dryRun,
    appliedAt: new Date().toISOString(),
    snapshot,
    commands: item.commands.map((command) => ({
      id: command.id,
      title: command.title,
      apply: command.apply,
      revert: command.revert?.map((part) => resolveSnapshotToken(part, snapshot)) ?? null,
    })),
    results: executed,
  };

  const path = dryRun ? null : await saveRevertRecord(record);
  return { status: 200, body: { ...record, persisted: !dryRun, path } };
}

async function revertOptimization(body) {
  const { serial, optimizationId, dryRun = true } = body;
  const records = await listRevertRecords();
  const record = records.find(
    (item) => item.serial === serial && item.optimizationId === optimizationId
  );

  if (!record) {
    return { status: 404, body: { error: 'revert record not found' } };
  }

  if (!dryRun && body.confirmation !== realRevertConfirmation) {
    return {
      status: 409,
      body: {
        error: 'real revert requires explicit confirmation',
        requiredConfirmation: realRevertConfirmation,
      },
    };
  }

  const results = [];
  const revertCommands = record.commands.filter((command) => command.revert).reverse();

  for (const command of revertCommands) {
    if (dryRun) {
      results.push({
        id: command.id,
        title: command.title,
        dryRun: true,
        command: ['adb', '-s', serial, ...command.revert].join(' '),
      });
      continue;
    }

    const result = await runDeviceAdb(serial, command.revert);
    results.push({ id: command.id, title: command.title, ...result });

    if (!result.ok) {
      break;
    }
  }

  return { status: 200, body: { dryRun, serial, optimizationId, results } };
}

export function createBridgeServer() {
  return createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      return json(response, 204, {});
    }

    const url = new URL(request.url ?? '/', `http://localhost:${port}`);

    if (request.method === 'GET' && url.pathname === '/') {
      const pairing = await getPairingStatus(request);
      return html(
        response,
        200,
        `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexxsensi ADB Bridge</title>
  <style>
    body{margin:0;background:#07090D;color:#F7F8FB;font-family:Segoe UI,Arial,sans-serif}
    main{max-width:760px;margin:0 auto;padding:32px}
    .card{background:#11151C;border:1px solid #232934;border-radius:8px;padding:24px}
    .code{font-size:44px;font-weight:900;color:#30F28C;letter-spacing:4px;margin:16px 0}
    .muted{color:#9CA3AF;line-height:1.5}
    .url{background:#171B23;border:1px solid #232934;border-radius:8px;padding:12px;margin-top:10px}
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>Nexxsensi ADB Bridge</h1>
      <p class="muted">Digite este codigo no app mobile para autorizar comandos ADB neste PC.</p>
      <div class="code">${pairing.pairingCode ?? 'LOCAL'}</div>
      <p class="muted">URLs disponiveis:</p>
      ${[`http://localhost:${port}`, ...getLanUrls()]
        .map((item) => `<div class="url">${item}</div>`)
        .join('')}
    </section>
  </main>
</body>
</html>`
      );
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, {
        ok: true,
        name: 'Nexxsensi ADB Bridge',
        urls: [`http://localhost:${port}`, ...getLanUrls()],
        adb: await getAdbStatus(),
        safety: {
          defaultDryRun: true,
          realApplyConfirmation,
          realRevertConfirmation,
        },
        platformTools: await getPlatformToolsStatus(),
        pairing: await getPairingStatus(request),
      });
    }

    if (request.method === 'GET' && url.pathname === '/pairing/status') {
      return json(response, 200, await getPairingStatus(request));
    }

    if (request.method === 'POST' && url.pathname === '/pairing/refresh') {
      const config = await rotatePairingCode();
      return json(response, 200, {
        pairingCode: config.pairingCode,
        pairingCodeCreatedAt: config.pairingCodeCreatedAt,
      });
    }

    if (request.method === 'POST' && url.pathname === '/pairing/claim') {
      const body = await readBody(request);
      const config = await readBridgeConfig();
      if (body.code !== config.pairingCode) {
        return json(response, 403, { error: 'invalid pairing code' });
      }

      return json(response, 200, {
        token: config.token,
        tokenCreatedAt: config.tokenCreatedAt,
      });
    }

    if (request.method === 'POST' && url.pathname === '/pairing/reset') {
      if (!(await authorize(request, response))) {
        return;
      }

      const config = await rotateBridgeToken();
      return json(response, 200, {
        token: config.token,
        tokenCreatedAt: config.tokenCreatedAt,
        pairingCode: config.pairingCode,
      });
    }

    if (request.method === 'GET' && url.pathname === '/devices') {
      return json(response, 200, await listDevices());
    }

    if (request.method === 'GET' && url.pathname === '/platform-tools/status') {
      return json(response, 200, await getPlatformToolsStatus());
    }

    if (request.method === 'POST' && url.pathname === '/platform-tools/install') {
      if (!(await authorize(request, response))) {
        return;
      }

      return json(response, 200, await installPlatformTools());
    }

    if (request.method === 'GET' && url.pathname === '/catalog') {
      return json(response, 200, { catalog, packageCatalog, supportedBrands });
    }

    if (request.method === 'GET' && url.pathname === '/catalog/recommendations') {
      return json(
        response,
        200,
        getPackageRecommendations(url.searchParams.get('brand') ?? 'general')
      );
    }

    if (request.method === 'GET' && url.pathname === '/packages') {
      if (!(await authorize(request, response))) {
        return;
      }

      const serial = url.searchParams.get('serial');
      if (!serial) {
        return json(response, 400, { error: 'serial is required' });
      }

      return json(response, 200, await listInstalledPackages(serial));
    }

    if (request.method === 'POST' && url.pathname === '/wifi/tcpip') {
      if (!(await authorize(request, response))) {
        return;
      }

      const body = await readBody(request);
      if (!body.serial) {
        return json(response, 400, { error: 'serial is required' });
      }

      return json(response, 200, await enableTcpIp(body.serial, body.port ?? 5555));
    }

    if (request.method === 'POST' && url.pathname === '/wifi/pair') {
      if (!(await authorize(request, response))) {
        return;
      }

      const body = await readBody(request);
      if (!body.host || !body.code) {
        return json(response, 400, { error: 'host and code are required' });
      }

      return json(response, 200, await pairWifi(body.host, body.code));
    }

    if (request.method === 'POST' && url.pathname === '/wifi/connect') {
      if (!(await authorize(request, response))) {
        return;
      }

      const body = await readBody(request);
      if (!body.host) {
        return json(response, 400, { error: 'host is required' });
      }

      return json(response, 200, await connectWifi(body.host));
    }

    if (request.method === 'POST' && url.pathname === '/wifi/disconnect') {
      if (!(await authorize(request, response))) {
        return;
      }

      const body = await readBody(request);
      if (!body.host) {
        return json(response, 400, { error: 'host is required' });
      }

      return json(response, 200, await disconnectWifi(body.host));
    }

    if (request.method === 'GET' && url.pathname === '/reverts') {
      if (!(await authorize(request, response))) {
        return;
      }

      return json(response, 200, { records: await listRevertRecords() });
    }

    if (request.method === 'POST' && url.pathname === '/apply') {
      if (!(await authorize(request, response))) {
        return;
      }

      const result = await applyOptimization(await readBody(request));
      return json(response, result.status, result.body);
    }

    if (request.method === 'POST' && url.pathname === '/revert') {
      if (!(await authorize(request, response))) {
        return;
      }

      const result = await revertOptimization(await readBody(request));
      return json(response, result.status, result.body);
    }

    return json(response, 404, { error: 'not found' });
  } catch (error) {
    return json(response, 500, { error: error.message, stack: error.stack });
  }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await ensureStore();
  const server = createBridgeServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Nexxsensi ADB Bridge listening on http://localhost:${port}`);
    for (const url of getLanUrls()) {
      console.log(`LAN: ${url}`);
    }
  });
}
