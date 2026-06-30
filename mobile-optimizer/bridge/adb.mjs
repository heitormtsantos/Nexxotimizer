import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getPreferredAdbPath } from './platformTools.mjs';

const execFileAsync = promisify(execFile);
const timeout = Number(process.env.ADB_BRIDGE_TIMEOUT_MS ?? 120000);

export async function runAdb(args, options = {}) {
  const preferred = await getPreferredAdbPath();
  const adbPath = preferred.path;
  const finalArgs = process.env.ADB_SCRIPT ? [process.env.ADB_SCRIPT, ...args] : args;
  const commandLabel = process.env.ADB_SCRIPT ? 'adb' : adbPath;

  try {
    const result = await execFileAsync(adbPath, finalArgs, {
      timeout: options.timeout ?? timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    });

    return {
      ok: true,
      command: [commandLabel, ...args].join(' '),
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      exitCode: 0,
    };
  } catch (error) {
    return {
      ok: false,
      command: [commandLabel, ...args].join(' '),
      stdout: error.stdout?.trim?.() ?? '',
      stderr: error.stderr?.trim?.() || error.message,
      exitCode: typeof error.code === 'number' ? error.code : -1,
    };
  }
}

export async function getAdbStatus() {
  const version = await runAdb(['version'], { timeout: 10000 });
  return {
    available: version.ok,
    version: version.ok ? version.stdout.split('\n')[0].trim() : null,
    error: version.ok ? null : version.stderr,
  };
}

export async function listDevices() {
  const status = await getAdbStatus();
  if (!status.available) {
    return { status, devices: [] };
  }

  const result = await runAdb(['devices', '-l'], { timeout: 10000 });
  const devices = result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/);
      return { serial, state, details: details.join(' ') };
    });

  return { status, devices };
}

export async function runDeviceAdb(serial, args, options = {}) {
  return runAdb(['-s', serial, ...args], options);
}

export async function listInstalledPackages(serial) {
  const result = await runDeviceAdb(serial, ['shell', 'pm', 'list', 'packages'], {
    timeout: 30000,
  });

  return {
    ok: result.ok,
    error: result.ok ? null : result.stderr,
    packages: result.ok
      ? result.stdout
          .split('\n')
          .map((line) => line.replace(/^package:/, '').trim())
          .filter(Boolean)
      : [],
  };
}

export async function enableTcpIp(serial, port = 5555) {
  return runDeviceAdb(serial, ['tcpip', String(port)], { timeout: 15000 });
}

export async function pairWifi(host, code) {
  return runAdb(['pair', host, code], { timeout: 30000 });
}

export async function connectWifi(host) {
  return runAdb(['connect', host], { timeout: 30000 });
}

export async function disconnectWifi(host) {
  return runAdb(['disconnect', host], { timeout: 15000 });
}

export async function readDeviceProperty(serial, property) {
  const result = await runDeviceAdb(serial, ['shell', 'getprop', property], { timeout: 10000 });
  return result.ok ? result.stdout : '';
}

export async function captureDeviceSnapshot(serial, catalogItem) {
  const snapshot = {
    capturedAt: new Date().toISOString(),
    serial,
    fingerprint: await readDeviceProperty(serial, 'ro.build.fingerprint'),
    brand: await readDeviceProperty(serial, 'ro.product.brand'),
    model: await readDeviceProperty(serial, 'ro.product.model'),
    androidVersion: await readDeviceProperty(serial, 'ro.build.version.release'),
    sdk: await readDeviceProperty(serial, 'ro.build.version.sdk'),
    global: {},
    secure: {},
    system: {},
  };

  for (const command of catalogItem.commands) {
    if (!command.snapshot) {
      continue;
    }

    const { namespace, key } = command.snapshot;
    const result = await runDeviceAdb(
      serial,
      ['shell', 'settings', 'get', namespace, key],
      { timeout: 10000 }
    );

    snapshot[namespace][key] = result.ok && result.stdout !== 'null' ? result.stdout : '1';
  }

  return snapshot;
}
