import { NativeModules, Platform } from 'react-native';

export type InstalledGame = {
  packageName: string;
  label: string;
  category: string;
  system: boolean;
};

export type NativeAdvancedStatus = {
  platform: 'android' | 'web' | 'ios' | 'unknown';
  sdk: number | null;
  androidVersion: string | null;
  supportsWirelessDebugging: boolean;
  shizukuInstalled: boolean;
  shizukuAlive: boolean;
  shizukuPermission: boolean;
  canRunPrivilegedActions: boolean;
};

export type DeviceMetrics = {
  ramTotalBytes: number;
  ramAvailableBytes: number;
  ramUsedPercent: number;
  storageTotalBytes: number;
  storageFreeBytes: number;
  storageUsedPercent: number;
  batteryPercent: number;
  temperatureCelsius: number | null;
};

export type PerformanceSnapshot = {
  fps: number;
  fpsAvailable: boolean;
  fpsSource: string;
  cpuUsedPercent: number | null;
  gpuUsedPercent: number | null;
};

export type PingResult = {
  ok: boolean;
  latencyMs: number;
  host: string;
};

export type OptimizerActionResult = {
  actionId: string;
  ok: boolean;
  steps: Array<{
    title: string;
    command: string;
    exitCode: number;
    ok: boolean;
    stdout: string;
    stderr: string;
  }>;
};

export type PairingInput = {
  code: string;
  port: string;
};

type NexxsensiNativeModule = {
  getInstalledGames(): Promise<InstalledGame[]>;
  getLaunchableApps(): Promise<InstalledGame[]>;
  launchApp(packageName: string): Promise<boolean>;
  getAdvancedStatus(): Promise<NativeAdvancedStatus>;
  getDeviceMetrics(): Promise<DeviceMetrics>;
  getPerformanceSnapshot(packageName?: string): Promise<PerformanceSnapshot>;
  runPing(host: string): Promise<PingResult>;
  runOptimizerAction(actionId: string, packageName?: string): Promise<OptimizerActionResult>;
  openDeveloperOptions(): Promise<boolean>;
  openShizuku(): Promise<boolean>;
  requestShizukuPermission(): Promise<boolean>;
  requestNotificationPermission(): Promise<boolean>;
  startPairingNotification(): Promise<boolean>;
  stopPairingNotification(): Promise<boolean>;
  getPairingInput(): Promise<PairingInput>;
};

const nativeModule = NativeModules.NexxsensiNative as NexxsensiNativeModule | undefined;

export async function getInstalledGames(): Promise<InstalledGame[]> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return [];
  }

  return nativeModule.getInstalledGames();
}

export async function getLaunchableApps(): Promise<InstalledGame[]> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return [];
  }

  return nativeModule.getLaunchableApps();
}

export async function launchGame(game: InstalledGame): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.launchApp(game.packageName);
}

export async function getDeviceMetrics(): Promise<DeviceMetrics> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return unavailableMetrics;
  }

  return nativeModule.getDeviceMetrics();
}

export async function getPerformanceSnapshot(game?: InstalledGame): Promise<PerformanceSnapshot> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return unavailablePerformance('Disponível apenas no Android.');
  }

  return nativeModule.getPerformanceSnapshot(game?.packageName);
}

export async function runPing(host = '8.8.8.8'): Promise<PingResult> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return { ok: false, latencyMs: 0, host };
  }

  return nativeModule.runPing(host);
}

export async function runOptimizerAction(
  actionId: string,
  game?: InstalledGame
): Promise<OptimizerActionResult> {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('Otimização real disponível apenas no Android.');
  }

  return nativeModule.runOptimizerAction(actionId, game?.packageName);
}

export async function getNativeAdvancedStatus(): Promise<NativeAdvancedStatus> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return {
      platform: Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'unknown',
      sdk: null,
      androidVersion: null,
      supportsWirelessDebugging: false,
      shizukuInstalled: false,
      shizukuAlive: false,
      shizukuPermission: false,
      canRunPrivilegedActions: false,
    };
  }

  return nativeModule.getAdvancedStatus();
}

export async function openDeveloperOptions(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.openDeveloperOptions();
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.requestNotificationPermission();
}

export async function startPairingNotification(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.startPairingNotification();
}

export async function stopPairingNotification(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.stopPairingNotification();
}

export async function getPairingInput(): Promise<PairingInput> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return { code: '', port: '' };
  }

  return nativeModule.getPairingInput();
}

export async function openShizuku(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.openShizuku();
}

export async function requestShizukuPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.requestShizukuPermission();
}

const unavailableMetrics: DeviceMetrics = {
  ramTotalBytes: 0,
  ramAvailableBytes: 0,
  ramUsedPercent: 0,
  storageTotalBytes: 0,
  storageFreeBytes: 0,
  storageUsedPercent: 0,
  batteryPercent: 0,
  temperatureCelsius: null,
};

function unavailablePerformance(reason: string): PerformanceSnapshot {
  return {
    fps: 0,
    fpsAvailable: false,
    fpsSource: reason,
    cpuUsedPercent: null,
    gpuUsedPercent: null,
  };
}
