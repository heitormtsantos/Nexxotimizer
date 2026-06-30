import { createWriteStream } from 'node:fs';
import { access, mkdir, rm, stat } from 'node:fs/promises';
import { get } from 'node:https';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));
const toolsRoot = join(root, 'tools');
const downloadRoot = join(root, 'data', 'downloads');
const platformToolsRoot = join(toolsRoot, 'platform-tools');
const windowsAdbPath = join(platformToolsRoot, 'adb.exe');
const windowsDownloadUrl =
  'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';
const officialPageUrl = 'https://developer.android.com/tools/releases/platform-tools';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function getBundledAdbPath() {
  return process.platform === 'win32' ? windowsAdbPath : join(platformToolsRoot, 'adb');
}

export async function getPreferredAdbPath() {
  if (process.env.ADB_PATH) {
    return { source: 'env', path: process.env.ADB_PATH };
  }

  const bundled = getBundledAdbPath();
  if (await exists(bundled)) {
    return { source: 'bundled', path: bundled };
  }

  return { source: 'path', path: 'adb' };
}

export async function getPlatformToolsStatus() {
  const bundled = getBundledAdbPath();
  const bundledExists = await exists(bundled);
  const preferred = await getPreferredAdbPath();
  let bundledVersion = null;

  if (bundledExists) {
    try {
      const result = await execFileAsync(bundled, ['version'], {
        timeout: 10000,
        windowsHide: true,
      });
      bundledVersion = result.stdout.trim().split('\n')[0].trim();
    } catch {
      bundledVersion = null;
    }
  }

  return {
    supportedInstaller: process.platform === 'win32',
    officialPageUrl,
    downloadUrl: process.platform === 'win32' ? windowsDownloadUrl : null,
    bundledPath: bundled,
    bundledExists,
    bundledVersion,
    preferred,
  };
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const redirect = response.headers.location;
        if (!redirect) {
          reject(new Error(`Redirect without location for ${url}`));
          return;
        }
        downloadFile(redirect, destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const file = createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    request.on('error', reject);
  });
}

export async function installPlatformTools() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: 'Automatic Platform Tools install is currently implemented for Windows only.',
      officialPageUrl,
    };
  }

  await mkdir(downloadRoot, { recursive: true });
  await mkdir(toolsRoot, { recursive: true });

  const zipPath = join(downloadRoot, 'platform-tools-latest-windows.zip');
  await downloadFile(windowsDownloadUrl, zipPath);

  const downloaded = await stat(zipPath);
  if (downloaded.size < 1024 * 1024) {
    throw new Error('Downloaded Platform Tools archive is unexpectedly small.');
  }

  await rm(platformToolsRoot, { recursive: true, force: true });
  await execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${toolsRoot.replace(/'/g, "''")}' -Force`,
    ],
    { timeout: 120000, windowsHide: true }
  );

  const status = await getPlatformToolsStatus();
  return {
    ok: status.bundledExists,
    path: status.bundledPath,
    version: status.bundledVersion,
    officialPageUrl,
  };
}
