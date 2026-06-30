import { randomBytes, randomInt } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

function dataDir() {
  return process.env.ADB_BRIDGE_DATA_DIR || join(root, 'data');
}

function revertDir() {
  return join(dataDir(), 'revert');
}

function configPath() {
  return join(dataDir(), 'config.json');
}

export async function ensureStore() {
  await mkdir(revertDir(), { recursive: true });
  await ensureBridgeConfig();
}

export async function saveRevertRecord(record) {
  await ensureStore();
  const safeSerial = record.serial.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filePath = join(revertDir(), `${safeSerial}-${record.optimizationId}.json`);
  await writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
  return filePath;
}

export async function listRevertRecords() {
  await ensureStore();
  const files = await readdir(revertDir());
  const records = [];

  for (const file of files.filter((name) => name.endsWith('.json'))) {
    const raw = await readFile(join(revertDir(), file), 'utf8');
    records.push(JSON.parse(raw));
  }

  return records.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
}

export async function readBridgeConfig() {
  await mkdir(dataDir(), { recursive: true });

  try {
    return JSON.parse(await readFile(configPath(), 'utf8'));
  } catch {
    const config = createBridgeConfig();
    await writeBridgeConfig(config);
    return config;
  }
}

export async function writeBridgeConfig(config) {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

export async function ensureBridgeConfig() {
  return readBridgeConfig();
}

export async function rotatePairingCode() {
  const config = await readBridgeConfig();
  const updated = {
    ...config,
    pairingCode: createPairingCode(),
    pairingCodeCreatedAt: new Date().toISOString(),
  };
  await writeBridgeConfig(updated);
  return updated;
}

export async function rotateBridgeToken() {
  const config = await readBridgeConfig();
  const updated = {
    ...config,
    token: createToken(),
    tokenCreatedAt: new Date().toISOString(),
    pairingCode: createPairingCode(),
    pairingCodeCreatedAt: new Date().toISOString(),
  };
  await writeBridgeConfig(updated);
  return updated;
}

function createBridgeConfig() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    token: createToken(),
    tokenCreatedAt: now,
    pairingCode: createPairingCode(),
    pairingCodeCreatedAt: now,
  };
}

function createToken() {
  return randomBytes(24).toString('base64url');
}

function createPairingCode() {
  return String(randomInt(100000, 1000000));
}
