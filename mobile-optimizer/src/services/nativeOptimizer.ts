import { NativeModules, Platform } from 'react-native';

export type InstalledGame = {
  packageName: string;
  label: string;
  category: string;
  system: boolean;
  game?: boolean;
  icon?: string | null;
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

type NexxsensiNativeModule = {
  getInstalledGames(): Promise<InstalledGame[]>;
  getLaunchableApps(): Promise<InstalledGame[]>;
  launchApp(packageName: string): Promise<boolean>;
  getAdvancedStatus(): Promise<NativeAdvancedStatus>;
  getDeviceMetrics(): Promise<DeviceMetrics>;
  getPerformanceSnapshot(packageName?: string): Promise<PerformanceSnapshot>;
  runPing(host: string): Promise<PingResult>;
  runOptimizerAction(actionId: string, packageName?: string): Promise<OptimizerActionResult>;
  openShizuku(): Promise<boolean>;
  requestShizukuPermission(): Promise<boolean>;
  canDrawOverlays(): Promise<boolean>;
  openOverlaySettings(): Promise<boolean>;
  startGameOverlay(packageName?: string): Promise<boolean>;
  stopGameOverlay(): Promise<boolean>;
};

const nativeModule = NativeModules.NexxsensiNative as NexxsensiNativeModule | undefined;
const isWebDemo = Platform.OS === 'web';

export async function getInstalledGames(): Promise<InstalledGame[]> {
  if (isWebDemo) {
    return demoGames;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return [];
  }

  return nativeModule.getInstalledGames();
}

export async function getLaunchableApps(): Promise<InstalledGame[]> {
  if (isWebDemo) {
    return demoLaunchableApps;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return [];
  }

  return nativeModule.getLaunchableApps();
}

export async function launchGame(game: InstalledGame): Promise<boolean> {
  if (isWebDemo) {
    return !!game;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.launchApp(game.packageName);
}

export async function getDeviceMetrics(): Promise<DeviceMetrics> {
  if (isWebDemo) {
    return demoMetrics();
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return unavailableMetrics;
  }

  return nativeModule.getDeviceMetrics();
}

export async function getPerformanceSnapshot(game?: InstalledGame): Promise<PerformanceSnapshot> {
  if (isWebDemo) {
    const offset = game?.packageName.length ?? 0;
    const pulse = Math.round((Math.sin(Date.now() / 1200) + 1) * 3);
    return {
      fps: 57 + pulse,
      fpsAvailable: true,
      fpsSource: 'Simulação web para preview.',
      cpuUsedPercent: 24 + Math.min(10, offset),
      gpuUsedPercent: 31 + pulse,
    };
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return unavailablePerformance('Disponível apenas no Android.');
  }

  return nativeModule.getPerformanceSnapshot(game?.packageName);
}

export async function runPing(host = '1.1.1.1'): Promise<PingResult> {
  if (isWebDemo) {
    return { ok: true, latencyMs: 22, host };
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return { ok: false, latencyMs: 0, host };
  }

  return nativeModule.runPing(host);
}

export async function runOptimizerAction(
  actionId: string,
  game?: InstalledGame
): Promise<OptimizerActionResult> {
  if (isWebDemo) {
    await sleep(1600);
    return demoActionResult(actionId, game);
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('Otimização real disponível apenas no Android.');
  }

  return nativeModule.runOptimizerAction(actionId, game?.packageName);
}

export async function getNativeAdvancedStatus(): Promise<NativeAdvancedStatus> {
  if (isWebDemo) {
    return {
      platform: 'web',
      sdk: null,
      androidVersion: 'Demo Web',
      supportsWirelessDebugging: true,
      shizukuInstalled: true,
      shizukuAlive: true,
      shizukuPermission: true,
      canRunPrivilegedActions: true,
    };
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return {
      platform: Platform.OS === 'ios' ? 'ios' : 'unknown',
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

export async function openShizuku(): Promise<boolean> {
  if (isWebDemo) {
    return true;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.openShizuku();
}

export async function requestShizukuPermission(): Promise<boolean> {
  if (isWebDemo) {
    return true;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.requestShizukuPermission();
}

export async function canDrawOverlays(): Promise<boolean> {
  if (isWebDemo) {
    return true;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.canDrawOverlays();
}

export async function openOverlaySettings(): Promise<boolean> {
  if (isWebDemo) {
    return true;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.openOverlaySettings();
}

export async function startGameOverlay(game?: InstalledGame): Promise<boolean> {
  if (isWebDemo) {
    return !!game;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.startGameOverlay(game?.packageName);
}

export async function stopGameOverlay(): Promise<boolean> {
  if (isWebDemo) {
    return true;
  }

  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.stopGameOverlay();
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

const demoGames: InstalledGame[] = [
  {
    packageName: 'com.dts.freefireth',
    label: 'Free Fire',
    category: 'game',
    system: false,
    game: true,
    icon: null,
  },
  {
    packageName: 'com.tencent.ig',
    label: 'PUBG Mobile',
    category: 'game',
    system: false,
    game: true,
    icon: null,
  },
  {
    packageName: 'com.activision.callofduty.shooter',
    label: 'COD Mobile',
    category: 'game',
    system: false,
    game: true,
    icon: null,
  },
  {
    packageName: 'com.roblox.client',
    label: 'Roblox',
    category: 'game',
    system: false,
    game: true,
    icon: null,
  },
];

const demoLaunchableApps: InstalledGame[] = [
  ...demoGames,
  {
    packageName: 'com.supercell.clashroyale',
    label: 'Clash Royale',
    category: 'app',
    system: false,
    game: false,
    icon: null,
  },
  {
    packageName: 'com.epicgames.fortnite',
    label: 'Fortnite',
    category: 'app',
    system: false,
    game: false,
    icon: null,
  },
];

function unavailablePerformance(reason: string): PerformanceSnapshot {
  return {
    fps: 0,
    fpsAvailable: false,
    fpsSource: reason,
    cpuUsedPercent: null,
    gpuUsedPercent: null,
  };
}

function demoMetrics(): DeviceMetrics {
  const pulse = Math.round((Math.sin(Date.now() / 1600) + 1) * 4);
  const totalRam = 8 * 1024 * 1024 * 1024;
  const availableRam = (4.7 + pulse / 10) * 1024 * 1024 * 1024;
  const totalStorage = 128 * 1024 * 1024 * 1024;
  const freeStorage = 81 * 1024 * 1024 * 1024;

  return {
    ramTotalBytes: totalRam,
    ramAvailableBytes: availableRam,
    ramUsedPercent: 38 - pulse,
    storageTotalBytes: totalStorage,
    storageFreeBytes: freeStorage,
    storageUsedPercent: 37,
    batteryPercent: 86,
    temperatureCelsius: 32 + pulse,
  };
}

function demoActionResult(actionId: string, game?: InstalledGame): OptimizerActionResult {
  const target = game?.label ?? 'Sistema Android';
  const stepTitles = demoActionSteps(actionId, target);

  return {
    actionId,
    ok: true,
    steps: stepTitles.map((title, index) => ({
      title,
      command: `demo:${actionId}:${index + 1}`,
      exitCode: 0,
      ok: true,
      stdout: 'Simulado no navegador.',
      stderr: '',
    })),
  };
}

function demoActionSteps(actionId: string, target: string) {
  switch (actionId) {
    case 'ram':
      return [
        'Analisando processos ativos',
        'Liberando memória ociosa',
        'Atualizando leitura de RAM',
      ];
    case 'cache':
      return [
        'Calculando arquivos temporários',
        'Limpando cache do sistema',
        'Atualizando armazenamento livre',
      ];
    case 'cool':
      return [
        'Reduzindo carga em segundo plano',
        'Aplicando perfil leve',
        'Verificando temperatura',
      ];
    case 'dpi-600':
      return ['Preparando escala gamer', 'Aplicando DPI 600', 'Atualizando interface'];
    case 'dpi-900':
      return ['Preparando escala extrema', 'Aplicando DPI 900', 'Atualizando interface'];
    case 'dpi-reset':
      return ['Removendo DPI personalizado', 'Restaurando densidade padrão'];
    default:
      return [
        'Finalizando processos em segundo plano',
        'Liberando memória RAM',
        'Limpando cache temporário',
        `Preparando ${target}`,
        'Aplicando perfil gamer ao sistema',
      ];
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
