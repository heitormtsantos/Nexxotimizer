export type BridgeHealth = {
  ok: boolean;
  name: string;
  urls: string[];
  adb: {
    available: boolean;
    version: string | null;
    error: string | null;
  };
  safety: {
    defaultDryRun: boolean;
    realApplyConfirmation: string;
    realRevertConfirmation: string;
  };
  platformTools: PlatformToolsStatus;
  pairing: PairingStatus;
};

export type PairingStatus = {
  pairingCode: string | null;
  pairingCodeCreatedAt: string;
  tokenCreatedAt: string;
  codeVisible: boolean;
};

export type PairingClaimResult = {
  token: string;
  tokenCreatedAt: string;
};

export type PlatformToolsStatus = {
  supportedInstaller: boolean;
  officialPageUrl: string;
  downloadUrl: string | null;
  bundledPath: string;
  bundledExists: boolean;
  bundledVersion: string | null;
  preferred: {
    source: 'env' | 'bundled' | 'path';
    path: string;
  };
};

export type PlatformToolsInstallResult = {
  ok: boolean;
  path?: string;
  version?: string | null;
  error?: string;
  officialPageUrl: string;
};

export type BridgeDevice = {
  serial: string;
  state: string;
  details: string;
};

export type BridgeCatalogItem = {
  id: string;
  name: string;
  risk: 'safe' | 'moderate' | 'advanced';
  description: string;
  commands: unknown[];
  packageDriven?: boolean;
};

export type BridgePackageItem = {
  packageName: string;
  label: string;
  vendor: string;
  brands: string[];
  category: string;
  recommendation: 'recommended' | 'optional';
  risk: 'safe' | 'moderate';
  reason: string;
};

export type SupportedBrand = {
  id: string;
  label: string;
};

export type BridgeRevertRecord = {
  serial: string;
  optimizationId: string;
  optimizationName: string;
  dryRun: boolean;
  persisted: boolean;
  path: string | null;
  appliedAt: string;
};

export type ApplyResult = {
  serial: string;
  optimizationId: string;
  optimizationName: string;
  dryRun: boolean;
  appliedAt: string;
  results: Array<{
    id: string;
    title: string;
    ok?: boolean;
    dryRun?: boolean;
    command?: string;
    stderr?: string;
  }>;
};

export class BridgeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly bridgeToken = ''
  ) {}

  async health(): Promise<BridgeHealth> {
    return this.get('/health');
  }

  async devices(): Promise<{ devices: BridgeDevice[] }> {
    return this.get('/devices');
  }

  async platformToolsStatus(): Promise<PlatformToolsStatus> {
    return this.get('/platform-tools/status');
  }

  async installPlatformTools(): Promise<PlatformToolsInstallResult> {
    return this.post('/platform-tools/install', {});
  }

  async pairingStatus(): Promise<PairingStatus> {
    return this.get('/pairing/status');
  }

  async claimPairing(code: string): Promise<PairingClaimResult> {
    return this.post('/pairing/claim', { code });
  }

  async catalog(): Promise<{
    catalog: BridgeCatalogItem[];
    packageCatalog: BridgePackageItem[];
    supportedBrands: SupportedBrand[];
  }> {
    return this.get('/catalog');
  }

  async packageRecommendations(brand: string): Promise<{
    brand: string;
    supportedBrands: SupportedBrand[];
    packages: BridgePackageItem[];
    recommendedPackageNames: string[];
  }> {
    return this.get(`/catalog/recommendations?brand=${encodeURIComponent(brand)}`);
  }

  async reverts(): Promise<{ records: BridgeRevertRecord[] }> {
    return this.get('/reverts');
  }

  async apply(
    serial: string,
    optimizationId: string,
    dryRun: boolean,
    selectedPackages: string[] = [],
    confirmation?: string
  ): Promise<ApplyResult> {
    return this.post('/apply', {
      serial,
      optimizationId,
      dryRun,
      selectedPackages,
      confirmation,
    });
  }

  async revert(
    serial: string,
    optimizationId: string,
    dryRun: boolean,
    confirmation?: string
  ): Promise<CommandBatchResult> {
    return this.post('/revert', { serial, optimizationId, dryRun, confirmation });
  }

  async enableTcpIp(serial: string, port = 5555): Promise<CommandResult> {
    return this.post('/wifi/tcpip', { serial, port });
  }

  async pairWifi(host: string, code: string): Promise<CommandResult> {
    return this.post('/wifi/pair', { host, code });
  }

  async connectWifi(host: string): Promise<CommandResult> {
    return this.post('/wifi/connect', { host });
  }

  async disconnectWifi(host: string): Promise<CommandResult> {
    return this.post('/wifi/disconnect', { host });
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Bridge returned ${response.status}`);
    }

    return response.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Bridge returned ${response.status}`);
    }

    return response.json();
  }

  private authHeaders(): Record<string, string> {
    return this.bridgeToken ? { 'X-Bridge-Token': this.bridgeToken } : {};
  }
}

export type CommandResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type CommandBatchResult = {
  dryRun: boolean;
  serial: string;
  optimizationId: string;
  results: CommandResult[];
};
