export const packageCatalog = [
  {
    packageName: 'com.facebook.appmanager',
    label: 'Meta App Manager',
    vendor: 'Meta',
    brands: ['general', 'samsung', 'xiaomi', 'motorola', 'oppo', 'realme'],
    category: 'social-services',
    recommendation: 'recommended',
    risk: 'safe',
    reason: 'Gerenciador auxiliar comum em ROMs. Pode ser reativado com pm enable.',
  },
  {
    packageName: 'com.facebook.services',
    label: 'Meta Services',
    vendor: 'Meta',
    brands: ['general', 'samsung', 'xiaomi', 'motorola', 'oppo', 'realme'],
    category: 'social-services',
    recommendation: 'recommended',
    risk: 'safe',
    reason: 'Servico em segundo plano de apps Meta preinstalados.',
  },
  {
    packageName: 'com.facebook.system',
    label: 'Meta App Installer',
    vendor: 'Meta',
    brands: ['general', 'samsung', 'xiaomi', 'motorola', 'oppo', 'realme'],
    category: 'social-services',
    recommendation: 'optional',
    risk: 'safe',
    reason: 'Instalador auxiliar de apps Meta. Geralmente nao e essencial.',
  },
  {
    packageName: 'com.netflix.mediaclient',
    label: 'Netflix',
    vendor: 'General',
    brands: ['general', 'samsung', 'xiaomi', 'motorola', 'oppo', 'realme'],
    category: 'media',
    recommendation: 'optional',
    risk: 'safe',
    reason: 'App de conteudo removivel em muitas ROMs, nao essencial ao sistema.',
  },
  {
    packageName: 'com.samsung.android.game.gamehome',
    label: 'Samsung Game Launcher',
    vendor: 'Samsung',
    brands: ['samsung'],
    category: 'gaming',
    recommendation: 'optional',
    risk: 'moderate',
    reason: 'Pode afetar recursos de jogos da Samsung. Desative apenas se nao usa.',
  },
  {
    packageName: 'com.samsung.android.app.spage',
    label: 'Samsung Free',
    vendor: 'Samsung',
    brands: ['samsung'],
    category: 'content',
    recommendation: 'recommended',
    risk: 'safe',
    reason: 'Feed/conteudo da tela inicial Samsung. Nao e essencial para chamadas ou sistema.',
  },
  {
    packageName: 'com.samsung.android.bixby.agent',
    label: 'Bixby Agent',
    vendor: 'Samsung',
    brands: ['samsung'],
    category: 'assistant',
    recommendation: 'optional',
    risk: 'moderate',
    reason: 'Assistente Samsung. Pode afetar atalhos Bixby em alguns aparelhos.',
  },
  {
    packageName: 'com.miui.analytics',
    label: 'MIUI Analytics',
    vendor: 'Xiaomi',
    brands: ['xiaomi'],
    category: 'analytics',
    recommendation: 'recommended',
    risk: 'moderate',
    reason: 'Telemetria MIUI. Pode reaparecer apos atualizacoes da ROM.',
  },
  {
    packageName: 'com.miui.msa.global',
    label: 'MIUI System Ads',
    vendor: 'Xiaomi',
    brands: ['xiaomi'],
    category: 'ads',
    recommendation: 'recommended',
    risk: 'moderate',
    reason: 'Servico de anuncios da MIUI. Pode reduzir anuncios e processos em segundo plano.',
  },
  {
    packageName: 'com.xiaomi.mipicks',
    label: 'GetApps',
    vendor: 'Xiaomi',
    brands: ['xiaomi'],
    category: 'store',
    recommendation: 'optional',
    risk: 'moderate',
    reason: 'Loja Xiaomi. Desative apenas se usa Play Store ou outra loja principal.',
  },
  {
    packageName: 'com.motorola.moto',
    label: 'Moto App',
    vendor: 'Motorola',
    brands: ['motorola'],
    category: 'oem-experience',
    recommendation: 'optional',
    risk: 'moderate',
    reason: 'Central de recursos Moto. Pode afetar gestos e experiencias da Motorola.',
  },
  {
    packageName: 'com.oplus.statistics.rom',
    label: 'OPlus Statistics',
    vendor: 'Oppo/Realme',
    brands: ['oppo', 'realme'],
    category: 'analytics',
    recommendation: 'recommended',
    risk: 'moderate',
    reason: 'Componente de estatisticas em ROMs Oppo/Realme.',
  },
  {
    packageName: 'com.heytap.market',
    label: 'App Market',
    vendor: 'Oppo/Realme',
    brands: ['oppo', 'realme'],
    category: 'store',
    recommendation: 'optional',
    risk: 'moderate',
    reason: 'Loja OEM. Desative apenas se nao depende dela.',
  },
];

export const supportedBrands = [
  { id: 'general', label: 'Geral' },
  { id: 'samsung', label: 'Samsung' },
  { id: 'xiaomi', label: 'Xiaomi/POCO' },
  { id: 'motorola', label: 'Motorola' },
  { id: 'oppo', label: 'Oppo' },
  { id: 'realme', label: 'Realme' },
];

export const catalog = [
  {
    id: 'balanced',
    name: 'Balanceado',
    risk: 'safe',
    description:
      'Ajustes conservadores para animacoes, cache e diagnostico sem remover pacotes.',
    commands: [
      {
        id: 'animation-window',
        title: 'Reduzir animacao de janelas',
        apply: ['shell', 'settings', 'put', 'global', 'window_animation_scale', '0.5'],
        revert: ['shell', 'settings', 'put', 'global', 'window_animation_scale', '{{snapshot.global.window_animation_scale}}'],
        snapshot: { namespace: 'global', key: 'window_animation_scale' },
      },
      {
        id: 'animation-transition',
        title: 'Reduzir animacao de transicao',
        apply: ['shell', 'settings', 'put', 'global', 'transition_animation_scale', '0.5'],
        revert: ['shell', 'settings', 'put', 'global', 'transition_animation_scale', '{{snapshot.global.transition_animation_scale}}'],
        snapshot: { namespace: 'global', key: 'transition_animation_scale' },
      },
      {
        id: 'animation-animator',
        title: 'Reduzir escala de animador',
        apply: ['shell', 'settings', 'put', 'global', 'animator_duration_scale', '0.5'],
        revert: ['shell', 'settings', 'put', 'global', 'animator_duration_scale', '{{snapshot.global.animator_duration_scale}}'],
        snapshot: { namespace: 'global', key: 'animator_duration_scale' },
      },
      {
        id: 'trim-caches',
        title: 'Limpar caches de apps',
        apply: ['shell', 'pm', 'trim-caches', '999G'],
        revert: null,
      },
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming boost',
    risk: 'advanced',
    description:
      'Prepara o aparelho para jogo com menor animacao e compilacao de pacotes. Pode aquecer.',
    commands: [
      {
        id: 'animation-window-off',
        title: 'Desligar animacao de janelas',
        apply: ['shell', 'settings', 'put', 'global', 'window_animation_scale', '0'],
        revert: ['shell', 'settings', 'put', 'global', 'window_animation_scale', '{{snapshot.global.window_animation_scale}}'],
        snapshot: { namespace: 'global', key: 'window_animation_scale' },
      },
      {
        id: 'animation-transition-off',
        title: 'Desligar animacao de transicao',
        apply: ['shell', 'settings', 'put', 'global', 'transition_animation_scale', '0'],
        revert: ['shell', 'settings', 'put', 'global', 'transition_animation_scale', '{{snapshot.global.transition_animation_scale}}'],
        snapshot: { namespace: 'global', key: 'transition_animation_scale' },
      },
      {
        id: 'compile-speed-profile',
        title: 'Compilar apps para perfil de velocidade',
        apply: ['shell', 'cmd', 'package', 'compile', '-m', 'speed-profile', '-a'],
        revert: ['shell', 'cmd', 'package', 'compile', '--reset', '-a'],
      },
    ],
  },
  {
    id: 'debloat-safe',
    name: 'Debloat seguro',
    risk: 'moderate',
    description:
      'Desativa pacotes selecionados pelo usuario com pm disable-user --user 0.',
    commands: [],
    packageDriven: true,
  },
];

export function buildOptimization(optimizationId, options = {}) {
  const item = catalog.find((entry) => entry.id === optimizationId);
  if (!item) {
    return null;
  }

  if (item.id !== 'debloat-safe') {
    return item;
  }

  const selectedPackages = new Set(options.selectedPackages ?? []);
  const packages = packageCatalog.filter((entry) => selectedPackages.has(entry.packageName));

  return {
    ...item,
    commands: packages.map((entry) => ({
      id: `disable-${entry.packageName}`,
      title: `Desativar ${entry.label}`,
      packageName: entry.packageName,
      apply: ['shell', 'pm', 'disable-user', '--user', '0', entry.packageName],
      revert: ['shell', 'pm', 'enable', entry.packageName],
      metadata: entry,
    })),
  };
}

export function getPackageRecommendations(brand = 'general') {
  const normalizedBrand = String(brand).toLowerCase();
  const packages = packageCatalog.filter(
    (entry) => entry.brands.includes('general') || entry.brands.includes(normalizedBrand)
  );

  return {
    brand: normalizedBrand,
    supportedBrands,
    packages,
    recommendedPackageNames: packages
      .filter((entry) => entry.recommendation === 'recommended')
      .map((entry) => entry.packageName),
  };
}
