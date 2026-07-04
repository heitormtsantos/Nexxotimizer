import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AppState,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  StatusBar as RNStatusBar,
  View,
} from 'react-native';

import {
  ActivationState,
  isActivationUsable,
  validateActivationKey,
} from './src/services/activationClient';
import {
  loadMobileState,
  MobileHistoryItem,
  MobilePreferences,
  saveActivationState,
  saveMobilePreferences,
} from './src/services/mobileStorage';
import {
  DeviceMetrics,
  canDrawOverlays,
  getDeviceMetrics,
  getInstalledGames,
  getLaunchableApps,
  getNativeAdvancedStatus,
  getPerformanceSnapshot,
  InstalledGame,
  launchGame,
  NativeAdvancedStatus,
  openShizuku,
  openOverlaySettings,
  OptimizerActionResult,
  PerformanceSnapshot,
  PingResult,
  requestShizukuPermission,
  requestNotificationPermission,
  runOptimizerAction,
  runPing,
  startGameOverlay,
} from './src/services/nativeOptimizer';
import { colors } from './src/theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;
type TabId = 'home' | 'performance' | 'games' | 'tools' | 'profile';
type Tone = 'purple' | 'green' | 'red' | 'blue';
type WebSetupPreview = 'android' | 'shizuku' | null;

type QuickAction = {
  id: string;
  icon: IconName;
  title: string;
  subtitle: string;
  tone: Tone;
};

type OptimizationProgress = {
  actionId: string;
  title: string;
  subtitle: string;
  percent: number;
  currentStep: string;
  processedItems: string[];
  done: boolean;
  failed: boolean;
};

const tabs: Array<{ id: TabId; icon: IconName; label: string }> = [
  { id: 'home', icon: 'home', label: 'Início' },
  { id: 'performance', icon: 'speedometer', label: 'Desempenho' },
  { id: 'games', icon: 'game-controller', label: 'Jogos' },
  { id: 'tools', icon: 'construct', label: 'Ferramentas' },
  { id: 'profile', icon: 'person', label: 'Perfil' },
];

const quickActions: QuickAction[] = [
  { id: 'game-boost', icon: 'rocket', title: 'Boost', subtitle: 'Otimizar jogo atual', tone: 'purple' },
  { id: 'ram', icon: 'hardware-chip', title: 'RAM', subtitle: 'Liberar memória', tone: 'purple' },
  { id: 'cache', icon: 'trash', title: 'Cache', subtitle: 'Arquivos temporários', tone: 'green' },
  { id: 'cool', icon: 'thermometer', title: 'Resfriar', subtitle: 'Reduzir uso da CPU', tone: 'blue' },
  { id: 'more', icon: 'apps', title: 'Mais', subtitle: 'Ver tudo', tone: 'blue' },
];

const optimizationTools: QuickAction[] = [
  { id: 'game-boost', icon: 'rocket', title: 'Boost', subtitle: 'Otimizar jogo atual', tone: 'purple' },
  { id: 'ram', icon: 'hardware-chip', title: 'RAM', subtitle: 'Liberar memória', tone: 'purple' },
  { id: 'cache', icon: 'trash', title: 'Cache', subtitle: 'Limpar arquivos temporários', tone: 'green' },
  { id: 'stutter', icon: 'pulse', title: 'Reduzir Travadas', subtitle: 'Animações leves', tone: 'purple' },
];

const systemTools: QuickAction[] = [
  { id: 'cool', icon: 'thermometer', title: 'Resfriar', subtitle: 'Reduzir uso da CPU', tone: 'blue' },
  { id: 'dpi-600', icon: 'scan', title: 'DPI 600', subtitle: 'Sensibilidade gamer', tone: 'blue' },
  { id: 'dpi-900', icon: 'expand', title: 'DPI 900', subtitle: 'Extremo para Free Fire', tone: 'purple' },
  { id: 'dpi-reset', icon: 'contract', title: 'Reverter DPI', subtitle: 'Voltar tamanho padrão', tone: 'green' },
  { id: 'battery', icon: 'battery-charging', title: 'Modo Bateria', subtitle: 'Consumo menor', tone: 'green' },
  { id: 'revert', icon: 'refresh', title: 'Reverter Ajustes', subtitle: 'Voltar padrão', tone: 'blue' },
];

const banners = {
  home: require('./assets/banners/banner-principal.png'),
  performance: require('./assets/banners/Banner2.jpg'),
  games: require('./assets/banners/Jogos.png'),
  gameCarousel1: require('./assets/banners/GameCarousel1.png'),
  gameCarousel2: require('./assets/banners/GameCarousel2.png'),
  gameCarousel3: require('./assets/banners/GameCarousel3.png'),
  gameCarousel4: require('./assets/banners/GameCarousel4.png'),
  freeFire: require('./assets/banners/GameFreeFireShort.png'),
  pubg: require('./assets/banners/GamePubg.png'),
  fortnite: require('./assets/banners/GameFortnite.png'),
  clash: require('./assets/banners/GameClash.png'),
  logo: require('./assets/banners/logo-cropped.png'),
  splashLogo: require('./assets/splash-logo.png'),
};

const gameCarouselImages = [
  banners.gameCarousel1,
  banners.gameCarousel2,
  banners.gameCarousel3,
  banners.gameCarousel4,
];

const actionNames: Record<string, string> = {
  'game-boost': 'Boost geral',
  ram: 'Liberando RAM',
  cache: 'Limpando cache',
  cool: 'Resfriando sistema',
  stutter: 'Reduzindo travadas',
  battery: 'Modo bateria',
  revert: 'Revertendo ajustes',
  'dpi-600': 'Aplicando DPI 600',
  'dpi-720': 'Aplicando DPI 720',
  'dpi-900': 'Aplicando DPI 900',
  'dpi-reset': 'Revertendo DPI',
  'profile-economy': 'Perfil economia',
  'profile-balanced': 'Perfil equilibrado',
  'profile-performance': 'Perfil desempenho',
};

const actionProgressCopy: Record<string, { running: string; done: string; subtitle: string }> = {
  'game-boost': {
    running: 'Otimizando aparelho...',
    done: 'Aparelho otimizado',
    subtitle: 'Aplicando boost, rede, memória e perfil gamer.',
  },
  ram: {
    running: 'Liberando RAM...',
    done: 'RAM liberada',
    subtitle: 'Fechando processos ociosos e atualizando a leitura de memória.',
  },
  cache: {
    running: 'Limpando cache...',
    done: 'Cache limpo',
    subtitle: 'Removendo arquivos temporários e recalculando armazenamento.',
  },
  cool: {
    running: 'Resfriando sistema...',
    done: 'Sistema resfriado',
    subtitle: 'Reduzindo carga em segundo plano para baixar a temperatura.',
  },
  stutter: {
    running: 'Reduzindo travadas...',
    done: 'Travadas reduzidas',
    subtitle: 'Ajustando animações e resposta visual do Android.',
  },
  battery: {
    running: 'Ativando economia...',
    done: 'Economia ativa',
    subtitle: 'Aplicando perfil de menor consumo para uso prolongado.',
  },
  revert: {
    running: 'Revertendo ajustes...',
    done: 'Ajustes revertidos',
    subtitle: 'Restaurando configurações para o padrão do aparelho.',
  },
  'dpi-600': {
    running: 'Aplicando DPI 600...',
    done: 'DPI 600 aplicado',
    subtitle: 'Ajustando densidade da tela para sensibilidade gamer.',
  },
  'dpi-720': {
    running: 'Aplicando DPI 720...',
    done: 'DPI 720 aplicado',
    subtitle: 'Ajustando densidade da tela para resposta mais rápida.',
  },
  'dpi-900': {
    running: 'Aplicando DPI 900...',
    done: 'DPI 900 aplicado',
    subtitle: 'Aplicando densidade extrema para jogos de mira e toque.',
  },
  'dpi-reset': {
    running: 'Revertendo DPI...',
    done: 'DPI restaurado',
    subtitle: 'Voltando a densidade visual original do Android.',
  },
  'profile-economy': {
    running: 'Aplicando economia...',
    done: 'Perfil economia ativo',
    subtitle: 'Priorizando bateria e estabilidade.',
  },
  'profile-balanced': {
    running: 'Aplicando equilíbrio...',
    done: 'Perfil equilibrado ativo',
    subtitle: 'Balanceando desempenho, bateria e temperatura.',
  },
  'profile-performance': {
    running: 'Aplicando desempenho...',
    done: 'Perfil desempenho ativo',
    subtitle: 'Priorizando FPS e resposta do aparelho.',
  },
};

const plannedSteps: Record<string, string[]> = {
  'game-boost': [
    'Finalizando processos em segundo plano',
    'Limpando cache temporário',
    'Aplicando perfil de desempenho',
    'Preparando o jogo selecionado',
    'Ativando overlay gamer',
  ],
  ram: [
    'Analisando processos ativos',
    'Liberando memória ociosa',
    'Atualizando leitura de RAM',
  ],
  cache: [
    'Calculando arquivos temporários',
    'Limpando cache do sistema',
    'Atualizando armazenamento livre',
  ],
  cool: [
    'Reduzindo carga em segundo plano',
    'Aplicando perfil leve',
    'Verificando temperatura',
  ],
  stutter: [
    'Reduzindo animações',
    'Ajustando transições',
    'Aplicando resposta rápida',
  ],
  battery: [
    'Finalizando processos ociosos',
    'Aplicando economia inteligente',
    'Atualizando consumo',
  ],
  revert: [
    'Restaurando animações',
    'Revertendo limites do sistema',
    'Voltando ao padrão',
  ],
  'dpi-600': [
    'Preparando escala gamer',
    'Aplicando DPI 600',
    'Atualizando interface do Android',
  ],
  'dpi-720': [
    'Preparando escala gamer',
    'Aplicando DPI 720',
    'Atualizando interface do Android',
  ],
  'dpi-900': [
    'Preparando escala extrema',
    'Aplicando DPI 900',
    'Atualizando interface do Android',
  ],
  'dpi-reset': [
    'Removendo DPI personalizado',
    'Restaurando densidade padrão',
    'Atualizando interface do Android',
  ],
};

const topInset = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;
const bottomInset = Platform.OS === 'android' ? 22 : 0;
const bottomNavHeight = 98 + bottomInset;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [manualGames, setManualGames] = useState<InstalledGame[]>([]);
  const [appCandidates, setAppCandidates] = useState<InstalledGame[]>([]);
  const [appSearch, setAppSearch] = useState('');
  const [isPickingApp, setIsPickingApp] = useState(false);
  const [showOverlayPreview, setShowOverlayPreview] = useState(false);
  const [webSetupPreview, setWebSetupPreview] = useState<WebSetupPreview>(null);
  const [selectedGame, setSelectedGame] = useState<InstalledGame | null>(null);
  const [selectedGamePackage, setSelectedGamePackage] = useState<string | null>(null);
  const [favoriteGamePackages, setFavoriteGamePackages] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<DeviceMetrics | null>(null);
  const [performance, setPerformance] = useState<PerformanceSnapshot | null>(null);
  const [lastPerformanceReading, setLastPerformanceReading] = useState<MobilePreferences['lastPerformance'] | null>(null);
  const [ping, setPing] = useState<PingResult | null>(null);
  const [advanced, setAdvanced] = useState<NativeAdvancedStatus | null>(null);
  const [overlayAllowed, setOverlayAllowed] = useState(Platform.OS !== 'android');
  const [notificationAllowed, setNotificationAllowed] = useState(Platform.OS !== 'android');
  const [startupPermissionsLoaded, setStartupPermissionsLoaded] = useState(false);
  const [lastAction, setLastAction] = useState<OptimizerActionResult | null>(null);
  const [appliedActionCount, setAppliedActionCount] = useState(0);
  const [history, setHistory] = useState<MobileHistoryItem[]>([]);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState('profile-balanced');
  const [gameCarouselIndex, setGameCarouselIndex] = useState(0);
  const [optimizationProgress, setOptimizationProgress] = useState<OptimizationProgress | null>(null);
  const [activation, setActivation] = useState<ActivationState | null>(null);
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [activationLoaded, setActivationLoaded] = useState(false);
  const [splashElapsed, setSplashElapsed] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [activationMessage, setActivationMessage] = useState('Para usar o app, ative sua key.');
  const [notice, setNotice] = useState('Ative o Modo Avançado para liberar boost real.');
  const optimizationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const ready = !!advanced?.canRunPrivilegedActions;
  const startupPermissionsReady =
    Platform.OS !== 'android' || (overlayAllowed && notificationAllowed && ready);
  const activationReady = Platform.OS === 'web' || isActivationUsable(activation);

  useEffect(() => {
    if (Platform.OS === 'web' || !activationLoaded || !activation?.valid || !activation.expiresAt) {
      return;
    }

    const checkExpiration = () => {
      if (new Date(activation.expiresAt!).getTime() > Date.now()) {
        return;
      }

      const expiredActivation: ActivationState = {
        ...activation,
        valid: false,
        message: 'Sua key expirou.',
      };
      setActivation(expiredActivation);
      setActivationMessage('Sua key expirou. Insira uma nova key para continuar.');
      saveActivationState(expiredActivation).catch(() => undefined);
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 5000);
    return () => clearInterval(interval);
  }, [activation, activationLoaded]);

  useEffect(() => {
    return () => {
      if (optimizationTimer.current) {
        clearInterval(optimizationTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    loadStoredActivation();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashElapsed(true);
    }, 2400);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    refreshAll();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshAll();
        refreshPerformanceSnapshot();
      }
    });

    return () => subscription.remove();
  }, []);

  async function loadStoredActivation() {
    try {
      const state = await loadMobileState();
      if (isActivationUsable(state.activation)) {
        setActivation(state.activation ?? null);
        setActivationMessage('Key ativa.');
      } else {
        setActivation(state.activation ?? null);
        setActivationMessage(state.activation?.message ?? 'Para usar o app, ative sua key.');
      }
      if (state.preferences) {
        setSelectedGamePackage(state.preferences.selectedGamePackage ?? null);
        setSelectedProfile(state.preferences.selectedProfile ?? 'profile-balanced');
        setFavoriteGamePackages(state.preferences.favoriteGamePackages ?? []);
        setLastPerformanceReading(state.preferences.lastPerformance ?? null);
        setHistory(state.preferences.history ?? []);
        setAppliedActionCount(state.preferences.history?.filter((item) => item.ok).length ?? 0);
      }
    } catch {
      setActivationMessage('Não foi possível carregar a ativação.');
    } finally {
      setActivationLoaded(true);
    }
  }

  useEffect(() => {
    refreshPerformanceSnapshot();
  }, [selectedGame?.packageName, ready]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGameCarouselIndex((index) => (index + 1) % gameCarouselImages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activationLoaded) {
      return;
    }

    saveMobilePreferences({
      selectedGamePackage: selectedGamePackage ?? undefined,
      selectedProfile,
      favoriteGamePackages,
      lastPerformance: lastPerformanceReading ?? undefined,
      history,
    }).catch(() => undefined);
  }, [
    activationLoaded,
    favoriteGamePackages,
    history,
    lastPerformanceReading,
    selectedGamePackage,
    selectedProfile,
  ]);

  async function refreshAll() {
    const [
      gamesResult,
      metricsResult,
      pingResult,
      advancedResult,
      overlayResult,
      notificationResult,
    ] = await Promise.allSettled([
      getInstalledGames(),
      getDeviceMetrics(),
      runPing(),
      getNativeAdvancedStatus(),
      canDrawOverlays(),
      requestNotificationPermission(),
    ]);
    const nextAdvanced =
      advancedResult.status === 'fulfilled' ? advancedResult.value : advanced;
    const nextGames =
      gamesResult.status === 'fulfilled' ? gamesResult.value : games;
    const nextMetrics =
      metricsResult.status === 'fulfilled' ? metricsResult.value : metrics;
    const nextPing =
      pingResult.status === 'fulfilled' ? pingResult.value : ping;
    const nextOverlayAllowed =
      overlayResult.status === 'fulfilled' ? overlayResult.value : overlayAllowed;
    const nextNotificationAllowed =
      notificationResult.status === 'fulfilled' ? notificationResult.value : notificationAllowed;
    const mergedGames = mergeByPackage(nextGames, manualGames);
    const savedSelected = selectedGamePackage
      ? mergedGames.find((game) => game.packageName === selectedGamePackage) ?? null
      : null;
    const currentSelected =
      selectedGame && mergedGames.some((game) => game.packageName === selectedGame.packageName)
        ? selectedGame
        : null;
    const nextSelected = savedSelected ?? currentSelected ?? mergedGames[0] ?? null;
    const hasFailure = [
      gamesResult,
      metricsResult,
      pingResult,
      advancedResult,
      overlayResult,
      notificationResult,
    ]
      .some((result) => result.status === 'rejected');

    setGames(mergedGames);
    setSelectedGame(nextSelected);
    if (nextSelected && nextSelected.packageName !== selectedGamePackage) {
      setSelectedGamePackage(nextSelected.packageName);
    }
    if (nextMetrics) {
      setMetrics(normalizeMetrics(nextMetrics));
    }
    if (nextPing) {
      setPing(nextPing);
    }
    if (nextAdvanced) {
      setAdvanced(nextAdvanced);
    }
    setOverlayAllowed(nextOverlayAllowed);
    setNotificationAllowed(nextNotificationAllowed);
    setStartupPermissionsLoaded(true);

    try {
      const nextPerformance = await getPerformanceSnapshot(nextSelected ?? undefined);
      setPerformance(nextPerformance);
      updateLastPerformanceReading(nextPerformance, nextSelected);
    } catch {
      setPerformance(null);
    }

    if (nextAdvanced?.canRunPrivilegedActions) {
      setNotice('Modo Avançado pronto.');
    } else if (nextAdvanced?.shizukuAlive) {
      setNotice('Shizuku está ativo. Toque em Autorizar este app.');
    } else if (hasFailure) {
      setNotice('Alguns dados não foram lidos, mas o status foi atualizado.');
    } else {
      setNotice('Ative o Modo Avançado para liberar boost real.');
    }
  }

  function selectGame(game: InstalledGame | null) {
    setSelectedGame(game);
    setSelectedGamePackage(game?.packageName ?? null);
  }

  function toggleFavoriteGame(game: InstalledGame) {
    setFavoriteGamePackages((current) =>
      current.includes(game.packageName)
        ? current.filter((packageName) => packageName !== game.packageName)
        : [game.packageName, ...current].slice(0, 20)
    );
  }

  function recordHistory(actionId: string, result: OptimizerActionResult) {
    const item: MobileHistoryItem = {
      id: `${Date.now()}-${actionId}`,
      actionId,
      title: actionNames[actionId] ?? actionId,
      ok: result.ok,
      gameLabel: selectedGame?.label,
      createdAt: new Date().toISOString(),
    };
    setHistory((current) => [item, ...current].slice(0, 30));
  }

  function updateLastPerformanceReading(snapshot: PerformanceSnapshot | null, game?: InstalledGame | null) {
    if (!snapshot) {
      return;
    }

    setLastPerformanceReading({
      fps: snapshot.fpsAvailable ? Math.round(snapshot.fps) : undefined,
      fpsAvailable: snapshot.fpsAvailable,
      fpsSource: snapshot.fpsSource,
      gameLabel: game?.label,
      capturedAt: new Date().toISOString(),
    });
  }

  async function runAction(actionId: string) {
    if (actionId === 'more') {
      setActiveTab('tools');
      return;
    }

    if (!activationReady) {
      setActivationMessage('Para usar esta função, ative sua key.');
      return;
    }

    if (!ready) {
      setNotice('Conclua o Modo Avançado antes de executar otimizações.');
      return;
    }

    setRunningAction(actionId);
    setLastAction(null);
    startOptimizationProgress(actionId);
    if (actionId.startsWith('profile-')) {
      setSelectedProfile(actionId);
    }
    setNotice('Executando otimização...');

    try {
      const result = await runOptimizerAction(actionId, selectedGame ?? undefined);
      setLastAction(result);
      recordHistory(actionId, result);
      finishOptimizationProgress(result, actionId);
      if (result.ok) {
        setAppliedActionCount((count) => count + 1);
      }
      setNotice(result.ok ? 'Otimização concluída.' : 'Algumas etapas falharam.');
      const [nextMetrics, nextPing, nextAdvanced] = await Promise.all([
        getDeviceMetrics(),
        runPing(),
        getNativeAdvancedStatus(),
      ]);
      setMetrics(normalizeMetrics(nextMetrics));
      setPing(nextPing);
      setAdvanced(nextAdvanced);
      const nextPerformance = await getPerformanceSnapshot(selectedGame ?? undefined);
      setPerformance(nextPerformance);
      updateLastPerformanceReading(nextPerformance, selectedGame);
    } catch (error) {
      failOptimizationProgress(actionId);
      setNotice(error instanceof Error ? error.message : 'Ative o Modo Avançado para continuar.');
    } finally {
      setRunningAction(null);
    }
  }

  function startOptimizationProgress(actionId: string) {
    const steps = plannedSteps[actionId] ?? plannedSteps['game-boost'];
    const copy = actionProgressCopy[actionId] ?? {
      running: actionNames[actionId] ?? 'Otimizando...',
      done: 'Concluído',
      subtitle: 'Aplicando ajustes no aparelho.',
    };
    if (optimizationTimer.current) {
      clearInterval(optimizationTimer.current);
    }

    setOptimizationProgress({
      actionId,
      title: actionId === 'game-boost' && selectedGame ? 'Otimizando jogo...' : copy.running,
      subtitle: copy.subtitle,
      percent: 6,
      currentStep: steps[0],
      processedItems: [selectedGame?.label ?? 'Sistema Android'],
      done: false,
      failed: false,
    });

    optimizationTimer.current = setInterval(() => {
      setOptimizationProgress((current) => {
        if (!current || current.done) {
          return current;
        }

        const actionSteps = plannedSteps[current.actionId] ?? steps;
        const nextPercent = Math.min(88, current.percent + 7);
        const stepIndex = Math.min(
          actionSteps.length - 1,
          Math.floor((nextPercent / 100) * actionSteps.length)
        );
        const nextItems = current.processedItems.length >= actionSteps.length
          ? current.processedItems
          : [...current.processedItems, actionSteps[stepIndex]];

        return {
          ...current,
          percent: nextPercent,
          currentStep: actionSteps[stepIndex],
          processedItems: Array.from(new Set(nextItems)).slice(-5),
        };
      });
    }, 420);
  }

  function finishOptimizationProgress(result: OptimizerActionResult, actionId: string) {
    if (optimizationTimer.current) {
      clearInterval(optimizationTimer.current);
      optimizationTimer.current = null;
    }

    const completedSteps = result.steps
      .map((step) => step.title)
      .filter(Boolean)
      .slice(-5);
    const copy = actionProgressCopy[actionId] ?? {
      running: actionNames[actionId] ?? 'Otimização',
      done: 'Concluído',
      subtitle: 'Ajustes aplicados no aparelho.',
    };
    setOptimizationProgress((current) => ({
      actionId,
      title: result.ok
        ? actionId === 'game-boost' && current?.processedItems?.[0] !== 'Sistema Android'
          ? 'Jogo otimizado'
          : copy.done
        : 'Algumas etapas falharam',
      subtitle: copy.subtitle,
      percent: 100,
      currentStep: result.ok ? copy.done : 'Algumas etapas falharam',
      processedItems: completedSteps.length > 0 ? completedSteps : current?.processedItems ?? [],
      done: true,
      failed: !result.ok,
    }));

    setTimeout(() => {
      setOptimizationProgress(null);
    }, 1300);
  }

  function failOptimizationProgress(actionId: string) {
    if (optimizationTimer.current) {
      clearInterval(optimizationTimer.current);
      optimizationTimer.current = null;
    }

    const copy = actionProgressCopy[actionId] ?? {
      running: actionNames[actionId] ?? 'Otimização',
      done: 'Falhou',
      subtitle: 'Não foi possível aplicar os ajustes.',
    };
    setOptimizationProgress((current) => ({
      actionId,
      title: 'Não foi possível concluir',
      subtitle: copy.subtitle,
      percent: current?.percent ?? 0,
      currentStep: 'Não foi possível concluir',
      processedItems: current?.processedItems ?? [],
      done: true,
      failed: true,
    }));

    setTimeout(() => {
      setOptimizationProgress(null);
    }, 1600);
  }

  async function boostAndOpen() {
    if (!activationReady) {
      setActivationMessage('Para iniciar o jogo com boost, ative sua key.');
      return;
    }

    if (!ready) {
      setNotice('Ative o Modo Avançado antes de iniciar o boost.');
      return;
    }

    if (!selectedGame) {
      setNotice('Nenhum jogo detectado. Toque em Buscar app para adicionar manualmente.');
      return;
    }

    await runAction('game-boost');

    try {
      const overlayAllowed = await canDrawOverlays();
      if (overlayAllowed) {
        await startGameOverlay(selectedGame);
      } else {
        setNotice('Permita o overlay para usar a bolha de boost durante o jogo.');
        await openOverlaySettings();
        return;
      }
    } catch {
      setNotice('Não foi possível iniciar o overlay. O jogo será aberto sem a bolha.');
    }

    await launchGame(selectedGame);
  }

  async function refreshPerformanceSnapshot() {
    try {
      const snapshot = await getPerformanceSnapshot(selectedGame ?? undefined);
      setPerformance(snapshot);
      updateLastPerformanceReading(snapshot, selectedGame);
    } catch {
      setPerformance(null);
    }
  }

  async function openAppPicker() {
    try {
      setIsPickingApp(true);
      setNotice('Buscando aplicativos instalados...');
      const apps = await getLaunchableApps();
      setAppCandidates(apps);
      setNotice(apps.length > 0 ? 'Escolha um app para adicionar como jogo.' : 'Nenhum aplicativo abrível encontrado.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível listar os aplicativos.');
    }
  }

  function addManualGame(app: InstalledGame) {
    const taggedApp = { ...app, category: app.category === 'game' ? app.category : 'manual' };
    setManualGames((current) => mergeByPackage(current, [taggedApp]));
    setGames((current) => mergeByPackage(current, [taggedApp]));
    selectGame(taggedApp);
    setIsPickingApp(false);
    setAppSearch('');
    setNotice(`${app.label} adicionado para otimização.`);
  }

  async function installPermissionComponent() {
    try {
      setNotice('Abrindo Shizuku...');
      const opened = await openShizuku();
      setNotice(
        opened
          ? 'No Shizuku, use Começar pela Depuração via Wireless. Depois volte para autorizar este app.'
          : 'Não foi possível abrir o Shizuku.'
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível abrir o Shizuku.');
    }
  }

  async function requestOverlayAndRefresh() {
    try {
      setNotice('Abrindo permissão de sobreposição...');
      await openOverlaySettings();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível abrir a permissão de overlay.');
    } finally {
      await refreshAll();
    }
  }

  async function requestPermissionAndRefresh() {
    try {
      const granted = await requestShizukuPermission();
      await refreshAll();
      setNotice(granted ? 'Permissão do Shizuku autorizada.' : 'Verifique a autorização no Shizuku e toque em atualizar.');
    } catch (error) {
      await refreshAll();
      setNotice(error instanceof Error ? error.message : 'Modo Avançado ainda não está ativo.');
    }
  }

  async function requestNotificationAndRefresh() {
    try {
      const granted = await requestNotificationPermission();
      await refreshAll();
      setNotice(granted ? 'Notificações autorizadas.' : 'Autorize notificações para overlay e replay.');
    } catch (error) {
      await refreshAll();
      setNotice(error instanceof Error ? error.message : 'Não foi possível solicitar notificações.');
    }
  }

  async function activateKey() {
    const key = activationKeyInput.trim();
    if (!key) {
      setActivationMessage('Informe sua key de acesso.');
      return;
    }

    setIsActivating(true);
    setActivationMessage('Validando key...');
    try {
      const result = await validateActivationKey(key);
      setActivation(result);
      setActivationMessage(result.message);
      if (result.valid) {
        await saveActivationState(result);
        setActivationKeyInput('');
      }
    } catch {
      setActivationMessage('Não foi possível validar a key no momento.');
    } finally {
      setIsActivating(false);
    }
  }

  function openPurchasePage() {
    Linking.openURL('https://nexxsensi.com/').catch(() => {
      setActivationMessage('Não foi possível abrir a página de compra.');
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.app}>
        {!activationLoaded || !splashElapsed ? (
          <SplashScreen />
        ) : !activationReady ? (
          <ActivationScreen
            activationLoaded={activationLoaded}
            activationKeyInput={activationKeyInput}
            activationMessage={activationMessage}
            isActivating={isActivating}
            setActivationKeyInput={setActivationKeyInput}
            activateKey={activateKey}
            openPurchasePage={openPurchasePage}
          />
        ) : !startupPermissionsReady ? (
          <StartupPermissionScreen
            advanced={advanced}
            overlayAllowed={overlayAllowed}
            notificationAllowed={notificationAllowed}
            startupPermissionsLoaded={startupPermissionsLoaded}
            installPermissionComponent={installPermissionComponent}
            requestPermissionAndRefresh={requestPermissionAndRefresh}
            requestOverlayAndRefresh={requestOverlayAndRefresh}
            requestNotificationAndRefresh={requestNotificationAndRefresh}
            refreshAll={refreshAll}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeScreen
                selectedGame={selectedGame}
                games={games}
                metrics={metrics}
                ping={ping}
                advanced={advanced}
                ready={ready}
                notice={notice}
                runningAction={runningAction}
                setSelectedGame={selectGame}
                runAction={runAction}
                selectedProfile={selectedProfile}
                refreshAll={refreshAll}
                openAppPicker={openAppPicker}
                installPermissionComponent={installPermissionComponent}
                requestPermissionAndRefresh={requestPermissionAndRefresh}
                setWebSetupPreview={setWebSetupPreview}
              />
            )}
            {activeTab === 'performance' && (
              <PerformanceScreen
                metrics={metrics}
                performance={performance}
                ping={ping}
                lastAction={lastAction}
                lastPerformanceReading={lastPerformanceReading}
                refreshAll={refreshAll}
                runAction={runAction}
                runningAction={runningAction}
                ready={ready}
                selectedGame={selectedGame}
                selectedProfile={selectedProfile}
                goHome={() => setActiveTab('home')}
              />
            )}
            {activeTab === 'games' && (
              <GamesScreen
                games={games}
                selectedGame={selectedGame}
                ready={ready}
                runningAction={runningAction}
                setSelectedGame={selectGame}
                favoriteGamePackages={favoriteGamePackages}
                toggleFavoriteGame={toggleFavoriteGame}
                runAction={runAction}
                boostAndOpen={boostAndOpen}
                refreshAll={refreshAll}
                openAppPicker={openAppPicker}
                appCandidates={appCandidates}
                appSearch={appSearch}
                isPickingApp={isPickingApp}
                setAppSearch={setAppSearch}
                setIsPickingApp={setIsPickingApp}
                addManualGame={addManualGame}
                carouselIndex={gameCarouselIndex}
                setCarouselIndex={setGameCarouselIndex}
                showOverlayPreview={showOverlayPreview}
                setShowOverlayPreview={setShowOverlayPreview}
                goHome={() => setActiveTab('home')}
              />
            )}
            {activeTab === 'tools' && (
              <ToolsScreen
                ready={ready}
                runningAction={runningAction}
                runAction={runAction}
                goHome={() => setActiveTab('home')}
              />
            )}
            {activeTab === 'profile' && (
              <ProfileScreen
                advanced={advanced}
                refreshAll={refreshAll}
                installPermissionComponent={installPermissionComponent}
                requestPermissionAndRefresh={requestPermissionAndRefresh}
                appliedActionCount={appliedActionCount}
                activation={activation}
                history={history}
                lastPerformanceReading={lastPerformanceReading}
                goHome={() => setActiveTab('home')}
              />
            )}
            {optimizationProgress && <OptimizationOverlay progress={optimizationProgress} />}
            {Platform.OS === 'web' && webSetupPreview && (
              <View style={styles.setupPreviewLayer}>
                <StartupPermissionScreen
                  advanced={
                    webSetupPreview === 'shizuku'
                      ? {
                          platform: 'web',
                          sdk: null,
                          androidVersion: 'Preview Web',
                          supportsWirelessDebugging: true,
                          shizukuInstalled: true,
                          shizukuAlive: false,
                          shizukuPermission: false,
                          canRunPrivilegedActions: false,
                        }
                      : advanced
                  }
                  overlayAllowed={webSetupPreview === 'shizuku'}
                  notificationAllowed={webSetupPreview === 'shizuku'}
                  startupPermissionsLoaded
                  installPermissionComponent={() => undefined}
                  requestPermissionAndRefresh={() => undefined}
                  requestOverlayAndRefresh={() => undefined}
                  requestNotificationAndRefresh={() => undefined}
                  refreshAll={() => undefined}
                  onClose={() => setWebSetupPreview(null)}
                />
              </View>
            )}
            {showOverlayPreview && (
              <GameOverlayPreview
                selectedGame={selectedGame}
                setShowOverlayPreview={setShowOverlayPreview}
                runAction={runAction}
              />
            )}
            <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  selectedGame,
  games,
  metrics,
  ping,
  advanced,
  ready,
  notice,
  runningAction,
  setSelectedGame,
  runAction,
  selectedProfile,
  refreshAll,
  openAppPicker,
  installPermissionComponent,
  requestPermissionAndRefresh,
  setWebSetupPreview,
}: {
  selectedGame: InstalledGame | null;
  games: InstalledGame[];
  metrics: DeviceMetrics | null;
  ping: PingResult | null;
  advanced: NativeAdvancedStatus | null;
  ready: boolean;
  notice: string;
  runningAction: string | null;
  setSelectedGame: (game: InstalledGame | null) => void;
  runAction: (actionId: string) => void;
  selectedProfile: string;
  refreshAll: () => void;
  openAppPicker: () => void;
  installPermissionComponent: () => void;
  requestPermissionAndRefresh: () => void;
  setWebSetupPreview: (preview: WebSetupPreview) => void;
}) {
  return (
    <Screen>
      <AppHeader refreshAll={refreshAll} />
      {/* <HomeBanner source={banners.home} /> */}

      <View style={styles.hero}>
        <View style={styles.heroBeam} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroLabel}>MODO</Text>
          <Text numberOfLines={2} adjustsFontSizeToFit style={styles.gameName}>
            Otimização{'\n'}Geral
          </Text>
          <Text numberOfLines={2} style={styles.heroText}>
            {ready ? 'Modo Avançado pronto para otimizar o aparelho.' : notice}
          </Text>
          <Pressable style={[styles.primaryButton, !ready && styles.disabled]} onPress={() => runAction('game-boost')}>
            <AppIcon name="rocket" size={15} color={colors.text} />
            <Text style={styles.primaryButtonText}>
              {runningAction === 'game-boost' ? 'OTIMIZANDO...' : 'OTIMIZAR AGORA'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.heroSymbol}>
          <AppIcon name="game-controller" size={34} color={colors.text} />
        </View>
      </View>

      {!ready && (
        <ConnectionCard
          advanced={advanced}
          installPermissionComponent={installPermissionComponent}
          requestPermissionAndRefresh={requestPermissionAndRefresh}
        />
      )}

      {Platform.OS === 'web' && (
        <View style={styles.webPreviewPanel}>
          <Text style={styles.webPreviewTitle}>Prévia de configuração</Text>
          <Text style={styles.webPreviewText}>
            Use estes botões para revisar as telas que aparecem no Android depois da key.
          </Text>
          <View style={styles.webPreviewActions}>
            <Pressable style={styles.webPreviewButton} onPress={() => setWebSetupPreview('android')}>
              <AppIcon name="phone-portrait" size={15} color={colors.text} />
              <Text style={styles.webPreviewButtonText}>Permissões Android</Text>
            </Pressable>
            <Pressable style={styles.webPreviewButton} onPress={() => setWebSetupPreview('shizuku')}>
              <AppIcon name="flash" size={15} color={colors.text} />
              <Text style={styles.webPreviewButtonText}>Explicação Shizuku</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.roundActions}>
        {quickActions.map((action) => (
          <RoundAction
            key={action.id}
            action={action}
            locked={!ready && action.id !== 'more'}
            running={runningAction === action.id}
            onPress={() => runAction(action.id)}
          />
        ))}
      </View>

      <DeviceCard metrics={metrics} ping={ping} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Jogos detectados</Text>
        <Text style={styles.sectionHint}>{games.length} encontrados</Text>
      </View>
      {games.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gameList}
          style={styles.gameScroller}
        >
          {games.map((game) => (
            <Pressable
              key={game.packageName}
              style={[styles.gamePill, selectedGame?.packageName === game.packageName && styles.gamePillActive]}
              onPress={() => setSelectedGame(game)}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.gamePillText,
                  selectedGame?.packageName === game.packageName && styles.gamePillTextActive,
                ]}
              >
                {game.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <EmptyState
          icon="search"
          title="Nenhum jogo detectado"
          text="Instale um jogo ou toque em Atualizar para ler os apps do aparelho."
          action="Atualizar"
          onPress={openAppPicker}
        />
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Perfis de Desempenho</Text>
      </View>
      <View style={styles.profileGrid}>
        <ProfileTile
          icon="leaf"
          title="Economia"
          subtitle="Mais bateria"
          tone="green"
          selected={selectedProfile === 'profile-economy'}
          running={runningAction === 'profile-economy'}
          onPress={() => runAction('profile-economy')}
        />
        <ProfileTile
          icon="flag"
          title="Equilibrado"
          subtitle="Padrão"
          tone="purple"
          selected={selectedProfile === 'profile-balanced'}
          running={runningAction === 'profile-balanced'}
          onPress={() => runAction('profile-balanced')}
        />
        <ProfileTile
          icon="flash"
          title="Desempenho"
          subtitle="Máximo FPS"
          tone="red"
          selected={selectedProfile === 'profile-performance'}
          running={runningAction === 'profile-performance'}
          onPress={() => runAction('profile-performance')}
        />
      </View>
    </Screen>
  );
}

function SplashScreen() {
  const logoScale = useRef(new Animated.Value(0.86)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0.16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        damping: 11,
        stiffness: 95,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.timing(ringRotation, {
          toValue: 1,
          duration: 2200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.timing(progress, {
        toValue: 0.86,
        duration: 2100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [logoOpacity, logoScale, progress, ringRotation]);

  const spin = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.splashScreen}>
      <View style={styles.splashDiagonalOne} />
      <View style={styles.splashDiagonalTwo} />
      <View style={styles.splashCenter}>
        <View style={styles.splashLogoShell}>
          <Animated.View style={[styles.splashRing, { transform: [{ rotate: spin }] }]} />
          <Animated.Image
            source={banners.splashLogo}
            resizeMode="contain"
            style={[
              styles.splashLogo,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
          />
        </View>
        <View style={styles.splashTag}>
          <Text style={styles.splashTagText}>GAME BOOSTER ANDROID</Text>
        </View>
        <Text style={styles.splashTitle}>Nexxsensi</Text>
        <Text style={styles.splashText}>
          Preparando modo avançado, dados reais e painel gamer.
        </Text>
      </View>

      <View style={styles.splashBottom}>
        <View style={styles.splashLoaderCard}>
          <View style={styles.splashLoaderHead}>
            <Text style={styles.splashLoaderLabel}>Inicializando otimizações</Text>
            <Text style={styles.splashLoaderValue}>72%</Text>
          </View>
          <View style={styles.splashProgressTrack}>
            <Animated.View style={[styles.splashProgressFill, { width: progressWidth }]} />
          </View>
        </View>
        <View style={styles.splashChecks}>
          <View style={styles.splashCheck}>
            <Text style={styles.splashCheckText}>Perfil{'\n'}gamer</Text>
          </View>
          <View style={styles.splashCheck}>
            <Text style={styles.splashCheckText}>Dados{'\n'}reais</Text>
          </View>
          <View style={styles.splashCheck}>
            <Text style={styles.splashCheckText}>Overlay{'\n'}pronto</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function StartupPermissionScreen({
  advanced,
  overlayAllowed,
  notificationAllowed,
  startupPermissionsLoaded,
  installPermissionComponent,
  requestPermissionAndRefresh,
  requestOverlayAndRefresh,
  requestNotificationAndRefresh,
  refreshAll,
  onClose,
}: {
  advanced: NativeAdvancedStatus | null;
  overlayAllowed: boolean;
  notificationAllowed: boolean;
  startupPermissionsLoaded: boolean;
  installPermissionComponent: () => void;
  requestPermissionAndRefresh: () => void;
  requestOverlayAndRefresh: () => void;
  requestNotificationAndRefresh: () => void;
  refreshAll: () => void;
  onClose?: () => void;
}) {
  const shizukuInstalled = !!advanced?.shizukuInstalled;
  const shizukuAlive = !!advanced?.shizukuAlive;
  const shizukuPermission = !!advanced?.shizukuPermission;
  const androidPermissionsReady = overlayAllowed && notificationAllowed;
  const shizukuPrimaryAction = !shizukuInstalled || !shizukuAlive
    ? installPermissionComponent
    : requestPermissionAndRefresh;
  const shizukuPrimaryText = !shizukuInstalled
    ? 'Instalar Shizuku'
    : !shizukuAlive
      ? 'Abrir Shizuku'
      : 'Autorizar Nexxsensi';

  if (!androidPermissionsReady) {
    return (
      <ScrollView
        contentContainerStyle={styles.permissionGateScreen}
        style={styles.permissionGateScroll}
      >
        <View style={styles.permissionGateCard}>
          {onClose && (
            <Pressable style={styles.permissionGateClose} onPress={onClose}>
              <AppIcon name="close" size={18} color={colors.text} />
            </Pressable>
          )}
          <Image source={banners.splashLogo} resizeMode="contain" style={styles.permissionGateLogo} />
          <Text style={styles.permissionGateKicker}>CONFIGURAÇÃO INICIAL</Text>
          <Text style={styles.permissionGateTitle}>Permissões do Android</Text>
          <Text style={styles.permissionGateText}>
            Primeiro libere o que o Android exige para manter a bolha, o painel e o replay funcionando.
          </Text>

          <View style={styles.permissionChecklist}>
            <PermissionGateRow
              done={overlayAllowed}
              title="Sobrepor a outros apps"
              text="Mostra a bolha e o painel por cima do jogo sem fechar a partida."
              action="Permitir overlay"
              onPress={requestOverlayAndRefresh}
            />
            <PermissionGateRow
              done={notificationAllowed}
              title="Notificações"
              text="Mantém overlay e replay ativos em segundo plano."
              action="Permitir"
              onPress={requestNotificationAndRefresh}
            />
            <PermissionGateRow
              done
              title="Replay de tela"
              text="Será solicitado pelo Android somente quando você tocar em Gravar 3 min."
              action="Depois"
              disabled
            />
          </View>

          <Pressable style={styles.permissionGateRefresh} onPress={refreshAll}>
            <AppIcon name="refresh" size={16} color={colors.text} />
            <Text style={styles.permissionGateRefreshText}>
              {startupPermissionsLoaded ? 'Verificar novamente' : 'Verificando...'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.permissionGateScreen}
      style={styles.permissionGateScroll}
    >
      <View style={styles.permissionGateCard}>
        {onClose && (
          <Pressable style={styles.permissionGateClose} onPress={onClose}>
            <AppIcon name="close" size={18} color={colors.text} />
          </Pressable>
        )}
        <Image source={banners.splashLogo} resizeMode="contain" style={styles.permissionGateLogo} />
        <Text style={styles.permissionGateKicker}>MODO AVANÇADO</Text>
        <Text style={styles.permissionGateTitle}>Ativar Shizuku</Text>
        <Text style={styles.permissionGateText}>
          O Shizuku faz a depuração Wi-Fi para o Nexxsensi executar otimizações reais sem computador.
          Você configura no Shizuku uma vez e depois autoriza este app.
        </Text>

        <View style={styles.shizukuGuideBox}>
          <Text style={styles.shizukuGuideTitle}>Como ativar</Text>
          <Text style={styles.shizukuGuideText}>1. Instale e abra o Shizuku.</Text>
          <Text style={styles.shizukuGuideText}>2. Toque em Começar pela Depuração via Wireless.</Text>
          <Text style={styles.shizukuGuideText}>3. Faça o pareamento no próprio Shizuku e volte para o Nexxsensi.</Text>
          <Text style={styles.shizukuGuideText}>4. Toque em Autorizar Nexxsensi.</Text>
        </View>

        <View style={styles.permissionChecklist}>
          <PermissionGateRow
            done={shizukuInstalled}
            title="Shizuku instalado"
            text="Aplicativo responsável pela permissão avançada."
            action={shizukuInstalled ? 'Abrir Shizuku' : 'Instalar Shizuku'}
            onPress={installPermissionComponent}
          />
          <PermissionGateRow
            done={shizukuAlive}
            title="Shizuku rodando"
            text="Depois do pareamento Wi-Fi, o status precisa ficar ativo."
            action="Abrir Shizuku"
            onPress={installPermissionComponent}
          />
          <PermissionGateRow
            done={shizukuPermission}
            title="Nexxsensi autorizado"
            text="Libera boost, DPI, cache, RAM e comandos reais."
            action="Autorizar"
            onPress={requestPermissionAndRefresh}
          />
        </View>

        <Pressable style={styles.permissionGatePrimary} onPress={shizukuPrimaryAction}>
          <AppIcon name={shizukuPermission ? 'checkmark-circle' : 'flash'} size={18} color={colors.text} />
          <Text style={styles.permissionGatePrimaryText}>{shizukuPermission ? 'Shizuku pronto' : shizukuPrimaryText}</Text>
        </Pressable>

        <Pressable style={styles.permissionGateRefresh} onPress={refreshAll}>
          <AppIcon name="refresh" size={16} color={colors.text} />
          <Text style={styles.permissionGateRefreshText}>
            {startupPermissionsLoaded ? 'Verificar novamente' : 'Verificando...'}
          </Text>
        </Pressable>

        {!shizukuPermission && (
          <Text style={styles.permissionGateWarning}>
            O app não usa conexão ADB própria. O pareamento Wi-Fi fica no Shizuku; aqui você só verifica e autoriza.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function PermissionGateRow({
  done,
  title,
  text,
  action,
  onPress,
  disabled = false,
}: {
  done: boolean;
  title: string;
  text: string;
  action: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.permissionGateRow}>
      <View style={[styles.permissionGateStatus, done ? styles.permissionGateStatusOk : styles.permissionGateStatusPending]}>
        <AppIcon name={done ? 'checkmark' : 'alert'} size={13} color={done ? '#031D13' : colors.amber} />
      </View>
      <View style={styles.permissionGateCopy}>
        <Text style={styles.permissionGateRowTitle}>{title}</Text>
        <Text style={styles.permissionGateRowText}>{text}</Text>
      </View>
      <Pressable
        style={[
          styles.permissionGateAction,
          done && styles.permissionGateActionDone,
          disabled && styles.disabled,
        ]}
        disabled={disabled}
        onPress={onPress}
      >
        <Text style={styles.permissionGateActionText}>{done ? 'OK' : action}</Text>
      </Pressable>
    </View>
  );
}

function ActivationScreen({
  activationLoaded,
  activationKeyInput,
  activationMessage,
  isActivating,
  setActivationKeyInput,
  activateKey,
  openPurchasePage,
}: {
  activationLoaded: boolean;
  activationKeyInput: string;
  activationMessage: string;
  isActivating: boolean;
  setActivationKeyInput: (value: string) => void;
  activateKey: () => void;
  openPurchasePage: () => void;
}) {
  return (
    <View style={styles.activationScreen}>
      <View style={styles.activationCard}>
        <Image source={banners.logo} resizeMode="contain" style={styles.activationLogo} />
        <Text style={styles.activationTitle}>Ativar Nexxsensi</Text>
        <Text style={styles.activationText}>
          Insira sua key de acesso para liberar o otimizador mobile.
        </Text>
        <TextInput
          value={activationKeyInput}
          onChangeText={(value) => setActivationKeyInput(value.toUpperCase())}
          editable={activationLoaded && !isActivating}
          autoCapitalize="characters"
          placeholder="SUA-KEY-DE-ACESSO"
          placeholderTextColor={colors.dim}
          style={styles.activationInput}
        />
        <Text style={styles.activationMessage}>
          {activationLoaded ? activationMessage : 'Carregando ativação...'}
        </Text>
        <Pressable
          style={[styles.activationPrimary, (!activationLoaded || isActivating) && styles.disabled]}
          disabled={!activationLoaded || isActivating}
          onPress={activateKey}
        >
          <AppIcon name="key" size={17} color={colors.text} />
          <Text style={styles.activationPrimaryText}>
            {isActivating ? 'Validando...' : 'Ativar key'}
          </Text>
        </Pressable>
        <Pressable style={styles.activationSecondary} onPress={openPurchasePage}>
          <AppIcon name="bag" size={16} color={colors.text} />
          <Text style={styles.activationSecondaryText}>Comprar key</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AppHeader({ refreshAll }: { refreshAll: () => void }) {
  return (
    <View style={styles.topHeader}>
      <View style={styles.headerSideSpacer} />
      <View style={styles.brandBlock}>
        <Image source={banners.logo} resizeMode="contain" style={styles.brandLogo} />
      </View>
      <Pressable style={styles.headerIcon} onPress={refreshAll}>
        <View style={styles.redDot} />
        <AppIcon name="notifications" size={21} color={colors.text} />
      </Pressable>
    </View>
  );
}

function OptimizationOverlay({ progress }: { progress: OptimizationProgress }) {
  const statusColor = progress.failed ? colors.red : progress.done ? colors.green : colors.purple;
  const percent = Math.max(0, Math.min(100, progress.percent));
  const orbitAngle = (percent / 100) * Math.PI * 2 - Math.PI / 2;
  const orbitRadius = 101;
  const orbitCenter = 115;
  const badgeSize = 58;
  const ringSegments = 56;
  const activeSegments = Math.round((percent / 100) * ringSegments);
  const percentBadgePosition = {
    left: orbitCenter + Math.cos(orbitAngle) * orbitRadius - badgeSize / 2,
    top: orbitCenter + Math.sin(orbitAngle) * orbitRadius - badgeSize / 2,
  };
  const progressWidth = `${Math.max(6, Math.min(100, progress.percent))}%` as `${number}%`;
  const visibleItems = progress.processedItems.slice(-5);

  return (
    <View style={styles.optimizationLayer}>
      <View style={styles.optimizationDiagonalOne} />
      <View style={styles.optimizationDiagonalTwo} />

      <View style={styles.optimizationStage}>
        <View style={styles.optimizationRingWrap}>
          <View style={styles.optimizationRingTrack} />
          {Array.from({ length: ringSegments }).map((_, index) => {
            const angle = (index / ringSegments) * Math.PI * 2 - Math.PI / 2;
            const segmentRadius = 102;
            const segmentLeft = orbitCenter + Math.cos(angle) * segmentRadius - 3;
            const segmentTop = orbitCenter + Math.sin(angle) * segmentRadius - 9;
            const active = index < activeSegments;
            return (
              <View
                key={`ring-${index}`}
                style={[
                  styles.optimizationRingSegment,
                  {
                    backgroundColor: active ? statusColor : '#1A2233',
                    left: segmentLeft,
                    top: segmentTop,
                    transform: [{ rotate: `${(index / ringSegments) * 360}deg` }],
                  },
                ]}
              />
            );
          })}
          <View style={styles.optimizationRingInner}>
            <Image source={banners.splashLogo} resizeMode="contain" style={styles.optimizationRingLogo} />
          </View>
          <View style={styles.optimizationPercentOrbit}>
            <View style={[styles.optimizationPercentBadge, percentBadgePosition, { borderColor: statusColor }]}>
              <Text style={styles.optimizationPercent}>{percent}%</Text>
            </View>
          </View>
        </View>

        <Text style={styles.optimizationTitle}>{progress.title}</Text>
        <Text style={styles.optimizationSubtitle}>{progress.subtitle}</Text>

        <View style={styles.optimizationCurrentCard}>
          <Text style={styles.optimizationEyebrow}>
            {progress.done ? (progress.failed ? 'ATENÇÃO' : 'FINALIZADO') : 'ETAPA ATUAL'}
          </Text>
          <Text numberOfLines={2} style={styles.optimizationStep}>{progress.currentStep}</Text>
          <View style={styles.optimizationTrack}>
            <View style={[styles.optimizationFill, { width: progressWidth, backgroundColor: statusColor }]} />
          </View>
        </View>

        <View style={styles.optimizationList}>
          {visibleItems.map((item, index) => {
            const isLast = index === visibleItems.length - 1;
            const isActive = !progress.done && isLast;
            const isFailed = progress.failed && isLast;
            return (
            <View
              key={`${item}-${index}`}
              style={[styles.optimizationItem, isActive && styles.optimizationItemActive]}
            >
              <View
                style={[
                  styles.optimizationItemBadge,
                  isActive && styles.optimizationItemBadgeActive,
                  isFailed && styles.optimizationItemBadgeFailed,
                ]}
              >
                <AppIcon
                  name={isFailed ? 'alert-circle' : isActive ? 'sync' : 'checkmark'}
                  size={isActive ? 13 : 12}
                  color={isFailed ? colors.red : isActive ? '#22BDFF' : '#031D13'}
                />
              </View>
              <Text numberOfLines={1} style={styles.optimizationItemText}>{item}</Text>
            </View>
          );})}
        </View>
      </View>

      <View style={styles.optimizationFooter}>
        <View style={styles.optimizationCancel}>
          <Text style={styles.optimizationCancelText}>Cancelar</Text>
        </View>
        <Text style={styles.optimizationHint}>
          A otimização continua apenas enquanto esta tela estiver aberta.
        </Text>
      </View>
    </View>
  );
}

function GameOverlayPreview({
  selectedGame,
  setShowOverlayPreview,
}: {
  selectedGame: InstalledGame | null;
  setShowOverlayPreview: (value: boolean) => void;
  runAction: (actionId: string) => void;
}) {
  const gameName = selectedGame?.label ?? 'Jogo selecionado';
  const [overlayNotice, setOverlayNotice] = useState('');

  function simulateOverlayAction(message: string, doneMessage = 'Ajuste aplicado no overlay.') {
    setOverlayNotice(message);
    setTimeout(() => setOverlayNotice(doneMessage), 650);
    setTimeout(() => setOverlayNotice(''), 1900);
  }

  return (
    <View style={styles.gameOverlayPreviewLayer}>
      <View style={styles.gameOverlayStage}>
        <View style={styles.gameOverlayBackdrop}>
          <View style={styles.gameOverlayTopBadge}>
            <View style={styles.overlayLiveDot} />
            <Text style={styles.gameOverlayTopText}>NEXXSENSI BOOST ATIVO</Text>
            <Text style={styles.gameOverlayTopMuted}>120 FPS • 1.04 MB/s • 78%</Text>
          </View>
          {!!overlayNotice && (
            <View style={styles.overlayPreviewNotice}>
              <AppIcon name="flash" size={14} color="#06131D" />
              <Text style={styles.overlayPreviewNoticeText}>{overlayNotice}</Text>
            </View>
          )}

          <View style={[styles.overlaySidePanel, styles.overlayLeftPanel]}>
            <View style={[styles.overlayWingSpine, styles.overlayWingSpineLeft]} />
            <View style={[styles.overlayWingClaw, styles.overlayWingClawLeft]} />
            <OverlayHudHeader
              title="Desempenho"
              subtitle="Modo extremo"
              onMinimize={() => setShowOverlayPreview(false)}
            />
            <Pressable
              style={styles.overlayBoostActionCard}
              onPress={() => simulateOverlayAction('Aplicando Reboost...')}
            >
              <View style={styles.overlayBoostActionIcon}>
                <AppIcon name="rocket" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.overlayBoostActionCopy}>
                <Text style={styles.overlayBoostActionTitle}>Reboost agora</Text>
                <Text style={styles.overlayBoostActionSub}>Prioriza o jogo, RAM, cache e resposta.</Text>
              </View>
              <Text style={styles.overlayBoostActionStatus}>ATIVO</Text>
            </Pressable>
            <OverlayMetric label="CPU" value="82%" detail="Uso alto" compact />
            <OverlayMetric label="RAM" value="5.1 GB" detail="Livre" compact />
            <OverlayMetric label="Temp." value="33°C" detail="Resfriamento" compact />
            <Text style={styles.overlayKicker}>Ações</Text>
            <Pressable
              style={styles.overlayPrimaryButton}
              onPress={() => simulateOverlayAction('Reotimizando jogo...')}
            >
              <Text style={styles.overlayPrimaryText}>Reotimizar agora</Text>
            </Pressable>
            <OverlayMiniAction
              title="Liberar RAM"
              subtitle="Processos ociosos"
              onPress={() => simulateOverlayAction('Liberando RAM...')}
            />
            <OverlayMiniAction
              title="Resfriar"
              subtitle="Reduzir carga da CPU"
              onPress={() => simulateOverlayAction('Reduzindo carga da CPU...')}
            />
            <Text style={styles.overlayKicker}>DPI Gamer</Text>
            <View style={styles.overlayButtonRow}>
              <OverlayMiniButton label="600" onPress={() => simulateOverlayAction('Aplicando DPI 600...')} />
              <OverlayMiniButton label="900" onPress={() => simulateOverlayAction('Aplicando DPI 900...')} />
              <OverlayMiniButton label="Reset" onPress={() => simulateOverlayAction('Restaurando DPI...')} />
            </View>
          </View>

          <View style={styles.overlayCenter}>
            <Text style={styles.overlayGameText}>{gameName}</Text>
            <Text style={styles.overlayGameSub}>Área transparente simulando o jogo aberto</Text>
          </View>

          <View style={[styles.overlaySidePanel, styles.overlayRightPanel]}>
            <View style={[styles.overlayWingSpine, styles.overlayWingSpineRight]} />
            <View style={[styles.overlayWingClaw, styles.overlayWingClawRight]} />
            <OverlayHudHeader
              title="Ferramentas"
              subtitle="Controle ao vivo"
              onMinimize={() => setShowOverlayPreview(false)}
            />
            <View style={styles.overlayToolGrid}>
              <OverlayToolTile title="Toque" subtitle="Resposta ultra" icon="locate" onPress={() => simulateOverlayAction('Otimizando resposta ao toque...')} />
              <OverlayToolTile title="Sensi" subtitle="Máxima" icon="finger-print" onPress={() => simulateOverlayAction('Aplicando sensibilidade...')} />
              <OverlayToolTile title="Visual" subtitle="Sem animação" icon="pulse" onPress={() => simulateOverlayAction('Reduzindo travadas visuais...')} />
              <OverlayToolTile title="Brilho" subtitle="Máximo" icon="sunny" onPress={() => simulateOverlayAction('Ajuste visual acionado.')} />
            </View>
            <Text style={styles.overlayKicker}>Gravação</Text>
            <OverlayMiniAction
              title="Gravar 3 min"
              subtitle="1080p • 60 FPS"
              icon="radio-button-on"
              onPress={() => simulateOverlayAction('Solicitando gravação...', 'Replay ativo no overlay.')}
            />
            <OverlayMiniAction
              title="Salvar e parar"
              subtitle="Gerar vídeo único"
              icon="download"
              onPress={() => simulateOverlayAction('Salvando replay...', 'Replay salvo.')}
            />
            <Text style={styles.overlayKicker}>Rede</Text>
            <OverlayMetric label="Ping" value="22 ms" detail="Baixa latência" compact />
            <OverlayMetric label="Bateria" value="86%" detail="Carga atual" compact />
            <OverlayMetric label="Livre" value="81 GB" detail="Armazenamento" compact />
          </View>

          <Pressable style={styles.overlayFloatingBubble} onPress={() => setShowOverlayPreview(false)}>
            <Text style={styles.overlayBubbleText}>N</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function OverlayToggle({
  title,
  subtitle,
  active,
}: {
  title: string;
  subtitle: string;
  active: boolean;
}) {
  return (
    <View style={styles.overlayToggle}>
      <View style={styles.overlayToggleCopy}>
        <Text style={styles.overlayToggleTitle}>{title}</Text>
        <Text style={styles.overlayToggleSub}>{subtitle}</Text>
      </View>
      <View style={[styles.overlaySwitch, active && styles.overlaySwitchActive]}>
        <View style={[styles.overlaySwitchKnob, active && styles.overlaySwitchKnobActive]} />
      </View>
    </View>
  );
}

function OverlayHudHeader({
  title,
  subtitle,
  onMinimize,
}: {
  title: string;
  subtitle: string;
  onMinimize?: () => void;
}) {
  return (
    <View style={styles.overlayHudHeader}>
      <Image source={banners.logo} style={styles.overlayHudLogo} />
      <View style={styles.overlayHudCopy}>
        <Text style={styles.overlayKicker}>{title}</Text>
        <Text style={styles.overlayHudSubtitle}>{subtitle}</Text>
      </View>
      {onMinimize && (
        <Pressable style={styles.overlayHudMinimize} onPress={onMinimize}>
          <Text style={styles.overlayHudMinimizeText}>MIN</Text>
        </Pressable>
      )}
    </View>
  );
}

function OverlayMiniAction({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon?: IconName;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.overlayMiniAction} onPress={onPress}>
      {icon && <AppIcon name={icon} size={17} color="#22BDFF" />}
      <View style={styles.overlayMiniActionCopy}>
        <Text style={styles.overlayMiniActionTitle}>{title}</Text>
        <Text style={styles.overlayMiniActionSub}>{subtitle}</Text>
      </View>
      <AppIcon name="chevron-forward" size={16} color="#7CA1C6" />
    </Pressable>
  );
}

function OverlayToolTile({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.overlayToolTile} onPress={onPress}>
      <AppIcon name={icon} size={22} color="#22BDFF" />
      <Text style={styles.overlayToolTitle}>{title}</Text>
      <Text style={styles.overlayToolSub}>{subtitle}</Text>
    </Pressable>
  );
}

function OverlayMiniButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.overlayMiniButton} onPress={onPress}>
      <Text style={styles.overlayMiniButtonText}>{label}</Text>
    </Pressable>
  );
}

function OverlayMetric({
  label,
  value,
  detail,
  compact = false,
}: {
  label: string;
  value: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.overlayMetric, compact && styles.overlayMetricCompact]}>
      <View>
        <Text style={styles.overlayMetricLabel}>{label}</Text>
        {detail && <Text style={styles.overlayMetricDetail}>{detail}</Text>}
      </View>
      <Text style={[styles.overlayMetricValue, compact && styles.overlayMetricValueCompact]}>{value}</Text>
    </View>
  );
}

function AppBadge({ app, size = 40 }: { app: InstalledGame; size?: number }) {
  if (app.icon) {
    return (
      <Image
        source={{ uri: app.icon }}
        resizeMode="cover"
        style={[
          styles.appIconImage,
          {
            borderRadius: size / 2,
            height: size,
            width: size,
          },
        ]}
      />
    );
  }

  return (
    <View style={[styles.gameCardIcon, { height: size, width: size }]}>
      <AppIcon name={app.game || app.category === 'game' ? 'game-controller' : 'apps'} size={Math.round(size * 0.52)} color={colors.purple} />
    </View>
  );
}

function ConnectionCard({
  advanced,
  installPermissionComponent,
  requestPermissionAndRefresh,
  compact = false,
}: {
  advanced: NativeAdvancedStatus | null;
  installPermissionComponent: () => void;
  requestPermissionAndRefresh: () => void;
  compact?: boolean;
}) {
  const hasPermissionTool = !!advanced?.shizukuInstalled;
  const alive = !!advanced?.shizukuAlive;
  const permission = !!advanced?.shizukuPermission;
  const statusText = permission ? 'Pronto' : alive ? 'Autorizar' : hasPermissionTool ? 'Abrir' : 'Instalar';
  const helpText = permission
    ? 'Modo Avançado ativo. O app já pode executar otimizações reais.'
    : alive
      ? 'Shizuku está rodando. Toque em autorizar para liberar este app.'
      : hasPermissionTool
        ? 'Abra o Shizuku e toque em Começar pela Depuração via Wireless.'
        : 'Instale o Shizuku para ativar permissões avançadas sem computador.';
  const primaryLabel = permission
    ? 'Atualizar status'
    : alive
      ? 'Autorizar este app'
      : hasPermissionTool
        ? 'Abrir Shizuku'
        : 'Instalar Shizuku';
  const primaryAction = alive || permission ? requestPermissionAndRefresh : installPermissionComponent;

  return (
    <View style={styles.connectCard}>
      <View style={styles.connectTop}>
        <View>
          <Text style={styles.connectKicker}>CONFIGURAÇÃO RÁPIDA</Text>
          <Text style={styles.connectTitle}>Ativar Modo Avançado</Text>
        </View>
        <Text style={[styles.readyBadge, permission ? styles.readyOk : styles.readyPending]}>
          {statusText}
        </Text>
      </View>
      <View style={styles.compactSteps}>
        <SetupStep done={hasPermissionTool} label="Shizuku instalado" />
        <SetupStep done={alive} label="Shizuku rodando" />
        <SetupStep done={permission} label="Permissão do app" />
      </View>
      <Text style={styles.connectHelp}>{helpText}</Text>
      <Pressable style={styles.primaryButtonFull} onPress={primaryAction}>
        <AppIcon name={alive && !permission ? 'shield-checkmark' : 'flash'} size={16} color={colors.text} />
        <Text style={[styles.primaryButtonText, styles.primaryButtonTextBright]}>
          {primaryLabel}
        </Text>
      </Pressable>
      <Pressable style={styles.permissionLink} onPress={requestPermissionAndRefresh}>
        <Text style={styles.permissionText}>Já configurei no Shizuku, verificar permissão</Text>
      </Pressable>
    </View>
  );
}

function PerformanceScreen({
  metrics,
  performance,
  ping,
  lastAction,
  lastPerformanceReading,
  refreshAll,
  runAction,
  runningAction,
  ready,
  selectedGame,
  selectedProfile,
  goHome,
}: {
  metrics: DeviceMetrics | null;
  performance: PerformanceSnapshot | null;
  ping: PingResult | null;
  lastAction: OptimizerActionResult | null;
  lastPerformanceReading: MobilePreferences['lastPerformance'] | null;
  refreshAll: () => void;
  runAction: (actionId: string) => void;
  runningAction: string | null;
  ready: boolean;
  selectedGame: InstalledGame | null;
  selectedProfile: string;
  goHome: () => void;
}) {
  const ramPercent = safePercent(metrics?.ramUsedPercent);
  const temp = metrics?.temperatureCelsius ? Math.round(metrics.temperatureCelsius) : null;
  const pingLabel = ping?.ok && ping.latencyMs > 0 ? `${ping.latencyMs} ms` : 'Sem leitura';
  const fpsAvailable = !!performance?.fpsAvailable;
  const fpsValue = fpsAvailable
    ? Math.round(performance.fps).toString()
    : lastPerformanceReading?.fpsAvailable && lastPerformanceReading.fps
      ? lastPerformanceReading.fps.toString()
      : '--';
  const fpsStatus = fpsAvailable
    ? 'Leitura real'
    : lastPerformanceReading?.fpsAvailable
      ? 'Última leitura'
      : 'Sem leitura';
  const cpuValue =
    typeof performance?.cpuUsedPercent === 'number'
      ? `${Math.round(performance.cpuUsedPercent)}%`
      : '--';
  const cpuProgress =
    typeof performance?.cpuUsedPercent === 'number'
      ? Math.min(100, Math.round(performance.cpuUsedPercent))
      : 0;

  return (
    <Screen>
      <PageHeader
        title="Desempenho"
        icon="chevron-back"
        onBack={goHome}
        actionIcon="refresh"
        onAction={refreshAll}
      />
      {/* <PerformanceBanner profile={profileLabel(selectedProfile)} game={selectedGame?.label ?? 'Nenhum jogo selecionado'} /> */}
      <View style={styles.fpsCard}>
        <View style={styles.connectTop}>
          <View>
            <Text style={styles.miniLabel}>FPS em tempo real</Text>
            <View style={styles.fpsValueRow}>
              <Text style={styles.fpsValue}>{fpsValue}</Text>
              <Text style={styles.fpsUnit}>FPS</Text>
            </View>
          </View>
          <Text style={[styles.readyBadge, fpsAvailable ? styles.readyOk : styles.readyPending]}>{fpsStatus}</Text>
        </View>
        <FpsGraph performance={performance} />
      </View>
      <Pressable
        style={[styles.primaryButtonFull, !ready && styles.disabled]}
        onPress={() => runAction(selectedProfile)}
      >
        <AppIcon name="rocket" size={16} color={colors.text} />
        <Text style={styles.primaryButtonText}>
          {runningAction?.startsWith('profile-') ? 'OTIMIZANDO...' : 'Otimizar agora'}
        </Text>
      </Pressable>
      <View style={styles.panelGrid}>
        <PanelCard
          label="CPU"
          value={cpuValue}
          status={cpuProgress > 0 ? 'Processo do jogo' : 'Sem leitura'}
          tone="purple"
          progress={cpuProgress}
        />
        <PanelCard label="GPU" value="--" status="Sem leitura" tone="purple" progress={0} />
        <PanelCard label="RAM" value={`${ramPercent}%`} status={ramStatus(ramPercent)} tone="purple" progress={ramPercent} />
        <PanelCard
          label="Temperatura"
          value={temp !== null ? `${temp}°C` : '--'}
          status={temperatureStatus(temp)}
          tone={temperatureTone(temp)}
          progress={temp !== null ? Math.min(100, temp * 2) : 0}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status do Jogo</Text>
        <InfoRow label="Boosts ativos" value={lastAction ? `${lastAction.steps.length} ativos` : 'Nenhuma ativa'} />
        <InfoRow label="RAM livre" value={formatBytes(metrics?.ramAvailableBytes)} />
        <InfoRow label="Latência (Ping)" value={pingLabel} />
      </View>
    </Screen>
  );
}

function GamesScreen({
  games,
  selectedGame,
  ready,
  runningAction,
  setSelectedGame,
  favoriteGamePackages,
  toggleFavoriteGame,
  runAction,
  boostAndOpen,
  refreshAll,
  openAppPicker,
  appCandidates,
  appSearch,
  isPickingApp,
  setAppSearch,
  setIsPickingApp,
  addManualGame,
  carouselIndex,
  setCarouselIndex,
  showOverlayPreview,
  setShowOverlayPreview,
  goHome,
}: {
  games: InstalledGame[];
  selectedGame: InstalledGame | null;
  ready: boolean;
  runningAction: string | null;
  setSelectedGame: (game: InstalledGame | null) => void;
  favoriteGamePackages: string[];
  toggleFavoriteGame: (game: InstalledGame) => void;
  runAction: (actionId: string) => void;
  boostAndOpen: () => void;
  refreshAll: () => void;
  openAppPicker: () => void;
  appCandidates: InstalledGame[];
  appSearch: string;
  isPickingApp: boolean;
  setAppSearch: (value: string) => void;
  setIsPickingApp: (value: boolean) => void;
  addManualGame: (app: InstalledGame) => void;
  carouselIndex: number;
  setCarouselIndex: (index: number) => void;
  showOverlayPreview: boolean;
  setShowOverlayPreview: (value: boolean) => void;
  goHome: () => void;
}) {
  const normalizedSearch = appSearch.trim().toLowerCase();
  const gamePackageNames = new Set(games.map((game) => game.packageName));
  const filteredApps = appCandidates
    .filter((app) => !gamePackageNames.has(app.packageName))
    .filter((app) => {
      if (!normalizedSearch) {
        return true;
      }

      return `${app.label} ${app.packageName}`.toLowerCase().includes(normalizedSearch);
    })
    .slice(0, 40);
  const sortedGames = [...games].sort((left, right) => {
    const leftFavorite = favoriteGamePackages.includes(left.packageName) ? 0 : 1;
    const rightFavorite = favoriteGamePackages.includes(right.packageName) ? 0 : 1;
    return leftFavorite - rightFavorite || left.label.localeCompare(right.label);
  });

  return (
    <Screen>
      <PageHeader
        title="Jogos"
        icon="chevron-back"
        onBack={goHome}
        actionIcon="refresh"
        onAction={refreshAll}
      />
      {/* <GameCarousel index={carouselIndex} setIndex={setCarouselIndex} /> */}
      <Pressable style={styles.searchGamesButton} onPress={openAppPicker}>
        <AppIcon name="search" size={15} color={colors.text} />
        <Text style={styles.searchGamesText}>Buscar app</Text>
      </Pressable>
      {Platform.OS === 'web' && (
        <Pressable
          style={styles.overlayPreviewButton}
          onPress={() => setShowOverlayPreview(!showOverlayPreview)}
        >
          <AppIcon name="phone-landscape" size={16} color={colors.text} />
          <Text style={styles.overlayPreviewButtonText}>Prévia do overlay</Text>
        </Pressable>
      )}
      {isPickingApp && (
        <View style={styles.appPickerCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Adicionar aplicativo</Text>
            <Pressable onPress={() => setIsPickingApp(false)}>
              <Text style={styles.linkText}>Fechar</Text>
            </Pressable>
          </View>
          <TextInput
            value={appSearch}
            onChangeText={setAppSearch}
            placeholder="Buscar por nome do app"
            placeholderTextColor={colors.dim}
            style={styles.searchInput}
          />
          <View style={styles.appPickerList}>
            {filteredApps.length > 0 ? (
              filteredApps.map((app) => (
                <View key={app.packageName} style={styles.appPickerRow}>
                  <AppBadge app={app} />
                  <View style={styles.gameCardCopy}>
                    <Text numberOfLines={1} style={styles.gameCardTitle}>{app.label}</Text>
                    <Text numberOfLines={1} style={styles.gameCardSub}>
                      {app.game || app.category === 'game' ? 'Jogo detectado' : app.packageName}
                    </Text>
                  </View>
                  <Pressable style={styles.addAppButton} onPress={() => addManualGame(app)}>
                    <Text style={styles.addAppButtonText}>Adicionar</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Nenhum app encontrado para essa busca.</Text>
            )}
          </View>
        </View>
      )}
      {selectedGame ? (
      <View style={styles.featuredGame}>
        {/* <ImageBackground source={gameBannerFor(selectedGame)} resizeMode="cover" style={styles.featuredGameImage}> */}
        <View style={styles.featuredGameImage}>
          <View style={styles.featuredOverlay}>
            <View style={styles.featuredTopRow}>
              <AppBadge app={selectedGame} size={44} />
              <View style={styles.featuredCopy}>
                <Text style={styles.featuredLabel}>Selecionado</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit style={styles.featuredTitle}>
                  {selectedGame.label}
                </Text>
                <Text style={styles.featuredProfile}>Perfil ativo: Equilibrado</Text>
              </View>
            </View>
            <View style={styles.featuredActions}>
              <Pressable style={[styles.primaryButton, !ready && styles.disabled]} onPress={boostAndOpen}>
                <AppIcon name="rocket" size={15} color={colors.text} />
                <Text style={[styles.primaryButtonText, styles.primaryButtonTextBright]}>
                  {runningAction === 'game-boost' ? 'OTIMIZANDO...' : 'Boost e abrir'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButtonWide, !ready && styles.disabled]}
                onPress={() => runAction('profile-performance')}
              >
                <AppIcon name={ready ? 'flash' : 'lock-closed'} size={15} color={colors.text} />
                <Text style={styles.secondaryButtonText}>Perfil FPS</Text>
              </Pressable>
            </View>
          </View>
        </View>
        {/* </ImageBackground> */}
      </View>
      ) : (
        <EmptyState
          icon="game-controller"
          title="Nenhum jogo selecionado"
          text="Toque em Buscar app para escolher um aplicativo instalado neste aparelho."
          action="Buscar app"
          onPress={openAppPicker}
        />
      )}
      <Text style={[styles.groupTitle, styles.gamesGroupTitle]}>Jogos detectados</Text>
      {games.length > 0 ? (
      <View style={styles.gameGrid}>
        {sortedGames.map((game) => {
          const isFavorite = favoriteGamePackages.includes(game.packageName);
          return (
          <Pressable
            key={game.packageName}
            style={[
              styles.gameCard,
              selectedGame?.packageName === game.packageName && styles.gameCardSelected,
            ]}
            onPress={() => setSelectedGame(game)}
          >
            <AppBadge app={game} />
            <View style={styles.gameCardCopy}>
              <Text numberOfLines={1} style={styles.gameCardTitle}>{game.label}</Text>
              <Text style={styles.gameCardSub}>
                {isFavorite ? 'Favorito' : selectedGame?.packageName === game.packageName ? 'Selecionado' : game.game ? 'Jogo detectado' : 'Adicionado'}
              </Text>
            </View>
            <Pressable style={styles.favoriteButton} onPress={() => toggleFavoriteGame(game)}>
              <AppIcon name={isFavorite ? 'star' : 'star-outline'} size={18} color={isFavorite ? colors.amber : '#667085'} />
            </Pressable>
            {selectedGame?.packageName === game.packageName && (
              <AppIcon name="checkmark-circle" size={19} color={colors.green} />
            )}
          </Pressable>
        );})}
      </View>
      ) : (
        <EmptyState
          icon="search"
          title="Nenhum jogo detectado"
          text="Adicione manualmente qualquer app instalado para usar o boost."
          action="Buscar app"
          onPress={openAppPicker}
        />
      )}
    </Screen>
  );
}

function ToolsScreen({
  ready,
  runningAction,
  runAction,
  goHome,
}: {
  ready: boolean;
  runningAction: string | null;
  runAction: (actionId: string) => void;
  goHome: () => void;
}) {
  return (
    <Screen>
      <PageHeader title="Ferramentas" icon="chevron-back" onBack={goHome} />
      <Pressable
        style={[styles.revertAllCard, !ready && styles.lockedRow]}
        onPress={() => runAction('revert')}
      >
        <View style={styles.revertAllIcon}>
          <AppIcon name="refresh" size={22} color={colors.green} />
        </View>
        <View style={styles.revertAllCopy}>
          <Text style={styles.revertAllTitle}>Reverter tudo</Text>
          <Text style={styles.revertAllText}>
            Restaura DPI, animações e ajustes aplicados para o padrão do aparelho.
          </Text>
        </View>
        <Text style={styles.revertAllAction}>
          {runningAction === 'revert' ? 'Revertendo...' : 'Executar'}
        </Text>
      </Pressable>
      <ToolSection title="Otimização" actions={optimizationTools} ready={ready} runningAction={runningAction} runAction={runAction} />
      <ToolSection title="Sistema" actions={systemTools} ready={ready} runningAction={runningAction} runAction={runAction} />
    </Screen>
  );
}

function ToolSection({
  title,
  actions,
  ready,
  runningAction,
  runAction,
}: {
  title: string;
  actions: QuickAction[];
  ready: boolean;
  runningAction: string | null;
  runAction: (actionId: string) => void;
}) {
  return (
    <View style={styles.toolSection}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.toolList}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            style={[styles.toolRow, !ready && styles.lockedRow]}
            onPress={() => runAction(action.id)}
          >
            <View style={[styles.toolIcon, toneSoftStyle(action.tone)]}>
              <AppIcon name={action.icon} size={19} color={toneColor(action.tone)} />
            </View>
            <View style={styles.toolCopy}>
              <Text style={styles.toolTitle}>{action.title}</Text>
              <Text style={styles.toolSubtitle}>{runningAction === action.id ? 'Executando...' : action.subtitle}</Text>
            </View>
            <AppIcon name="chevron-forward" size={20} color="#A3AAB8" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ProfileScreen({
  advanced,
  appliedActionCount,
  activation,
  history,
  lastPerformanceReading,
  goHome,
  refreshAll,
  installPermissionComponent,
  requestPermissionAndRefresh,
}: {
  advanced: NativeAdvancedStatus | null;
  appliedActionCount: number;
  activation: ActivationState | null;
  history: MobileHistoryItem[];
  lastPerformanceReading: MobilePreferences['lastPerformance'] | null;
  goHome: () => void;
  refreshAll: () => void;
  installPermissionComponent: () => void;
  requestPermissionAndRefresh: () => void;
}) {
  const shizukuLabel = advanced?.shizukuPermission
    ? 'Autorizado'
    : advanced?.shizukuAlive
      ? 'Ativo'
      : advanced?.shizukuInstalled
        ? 'Instalado'
        : 'Não instalado';
  const wirelessStatus = advanced?.supportsWirelessDebugging ? 'Disponível' : 'Indisponível';
  const lastHistory = history.slice(0, 4);
  const keyStartedAt = formatDateTime(activation?.startsAt);
  const keyExpiresAt = formatDateTime(activation?.expiresAt);
  const keyTimeLeft = formatTimeLeft(activation?.expiresAt);

  return (
    <Screen>
      <PageHeader
        title="Perfil"
        icon="chevron-back"
        onBack={goHome}
        actionIcon="refresh"
        onAction={refreshAll}
      />
      <View style={styles.avatar}>
        <AppIcon name="person" size={32} color={colors.text} />
        <View style={styles.avatarEdit}>
          <AppIcon name="pencil" size={12} color={colors.text} />
        </View>
      </View>
      <Text style={styles.profileName}>Conta local</Text>
      <Text style={styles.profileSubtitle}>Perfil do dispositivo</Text>
      <View style={styles.profileStats}>
        <ProfileStat icon="rocket" value={`${appliedActionCount}`} label="Otimizações executadas" />
        <ProfileStat icon="hardware-chip" value="Indisponível" label="RAM economizada" />
      </View>
      <Text style={styles.profileSectionTitle}>Key de acesso</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status da key</Text>
        <StatusInfoRow label="Produto" value={activation?.product ?? 'Otimização Android'} tone="ok" />
        <StatusInfoRow label="Início" value={keyStartedAt} tone={activation?.startsAt ? 'ok' : 'neutral'} />
        <StatusInfoRow label="Final" value={keyExpiresAt} tone={activation?.expiresAt ? 'ok' : 'neutral'} />
        <StatusInfoRow label="Tempo restante" value={keyTimeLeft} tone={activation?.expiresAt ? 'pending' : 'neutral'} />
      </View>
      <Text style={styles.profileSectionTitle}>Configuração rápida</Text>
      <ConnectionCard
        advanced={advanced}
        installPermissionComponent={installPermissionComponent}
        requestPermissionAndRefresh={requestPermissionAndRefresh}
        compact
      />
      <Text style={styles.profileSectionTitle}>Diagnóstico técnico</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Detalhes técnicos</Text>
        <StatusInfoRow label="Android" value={advanced?.androidVersion ?? 'Indisponível'} tone={advanced?.androidVersion ? 'ok' : 'neutral'} />
        <StatusInfoRow label="Depuração sem fio" value={wirelessStatus} tone={advanced?.supportsWirelessDebugging ? 'ok' : 'neutral'} />
        <StatusInfoRow label="Componente Shizuku" value={shizukuLabel} tone={advanced?.shizukuPermission ? 'ok' : advanced?.shizukuInstalled ? 'pending' : 'neutral'} />
        <StatusInfoRow label="Último FPS" value={lastPerformanceReading?.fps ? `${lastPerformanceReading.fps} FPS` : 'Sem leitura'} tone={lastPerformanceReading?.fps ? 'ok' : 'neutral'} />
      </View>
      <Text style={styles.profileSectionTitle}>Histórico recente</Text>
      <View style={styles.card}>
        {lastHistory.length > 0 ? (
          lastHistory.map((item) => (
            <InfoRow
              key={item.id}
              label={item.gameLabel ? `${item.title} • ${item.gameLabel}` : item.title}
              value={item.ok ? 'OK' : 'Falhou'}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>Nenhuma otimização executada ainda.</Text>
        )}
      </View>
    </Screen>
  );
}

function PageHeader({
  title,
  icon,
  onBack,
  actionIcon,
  onAction,
}: {
  title: string;
  icon?: IconName;
  onBack?: () => void;
  actionIcon?: IconName;
  onAction?: () => void;
}) {
  return (
    <View style={styles.pageHeader}>
      {icon && onBack ? (
        <Pressable style={styles.headerIcon} onPress={onBack}>
          <AppIcon name={icon} size={22} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.headerSideSpacer} />
      )}
      <Text style={styles.pageTitle}>{title}</Text>
      {actionIcon && onAction ? (
        <Pressable style={styles.headerIcon} onPress={onAction}>
          <AppIcon name={actionIcon} size={21} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.headerSideSpacer} />
      )}
    </View>
  );
}

function BottomNav({
  activeTab,
  setActiveTab,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const isCenter = tab.id === 'games';
        const isActive = activeTab === tab.id;
        return (
        <Pressable
          key={tab.id}
          style={[styles.navItem, isCenter && styles.navItemCenter]}
          onPress={() => setActiveTab(tab.id)}
        >
          <View
            style={[
              styles.navIconWrap,
              isActive && styles.navIconWrapActive,
              isCenter && styles.navIconWrapCenter,
              isCenter && isActive && styles.navIconWrapCenterActive,
            ]}
          >
            <AppIcon
              name={tab.icon}
              size={isCenter ? 24 : 19}
              color={isCenter ? '#FFFFFF' : isActive ? colors.text : '#8F98AD'}
            />
          </View>
          {!isCenter && (
            <Text style={[styles.navText, isActive && styles.navTextActive]}>{tab.label}</Text>
          )}
        </Pressable>
      );})}
    </View>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

function PureBanner({ source }: { source: number }) {
  return (
    <View style={styles.bannerFrame}>
      <Image source={source} resizeMode="stretch" style={styles.bannerImage} />
    </View>
  );
}

function PerformanceBanner({ profile, game }: { profile: string; game: string }) {
  return (
    <View style={styles.performanceBannerFrame}>
      <Image source={banners.performance} resizeMode="stretch" style={styles.bannerImage} />
      <View style={styles.performanceBadge}>
        <Text style={styles.performanceBadgeText}>Perfil: {profile}</Text>
        <Text numberOfLines={1} style={styles.performanceBadgeSub}>{game}</Text>
      </View>
    </View>
  );
}

function HomeBanner({ source }: { source: number }) {
  return (
    <View style={styles.homeBannerFrame}>
      <Image source={source} resizeMode="stretch" style={styles.homeBannerImage} />
    </View>
  );
}

function GameCarousel({
  index,
  setIndex,
}: {
  index: number;
  setIndex: (index: number) => void;
}) {
  return (
    <View>
      <View style={styles.carouselFrame}>
        <Image source={gameCarouselImages[index]} resizeMode="stretch" style={styles.carouselImage} />
      </View>
      <View style={styles.carouselDots}>
        {gameCarouselImages.map((_, dotIndex) => (
          <Pressable
            key={dotIndex}
            style={[styles.carouselDot, dotIndex === index && styles.carouselDotActive]}
            onPress={() => setIndex(dotIndex)}
          />
        ))}
      </View>
    </View>
  );
}

function gameBannerFor(game: InstalledGame) {
  const signal = `${game.label} ${game.packageName}`.toLowerCase();
  if (signal.includes('pubg')) {
    return banners.pubg;
  }

  return banners.freeFire;
}

function DeviceCard({ metrics, ping }: { metrics: DeviceMetrics | null; ping: PingResult | null }) {
  const hasMetrics = !!metrics && (metrics.ramTotalBytes > 0 || metrics.storageTotalBytes > 0 || metrics.batteryPercent > 0);
  const pingValue = ping?.ok && ping.latencyMs > 0 ? ping.latencyMs : 0;

  return (
    <View style={styles.deviceCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.cardTitle}>Informações do dispositivo</Text>
        <Text style={styles.linkText}>Ver tudo &gt;</Text>
      </View>
      <ProgressRow
        label="RAM"
        value={hasMetrics ? safePercent(metrics?.ramUsedPercent) : 0}
        right={hasMetrics ? formatBytes(metrics?.ramAvailableBytes) : '--'}
        tone="purple"
      />
      <ProgressRow
        label="Armazenamento"
        value={hasMetrics ? safePercent(metrics?.storageUsedPercent) : 0}
        right={hasMetrics ? formatBytes(metrics?.storageFreeBytes) : '--'}
        tone="purple"
      />
      <ProgressRow
        label="Bateria"
        value={hasMetrics ? safeBattery(metrics?.batteryPercent) : 0}
        right={hasMetrics ? `${safeBattery(metrics?.batteryPercent)}%` : '--'}
        tone="green"
      />
      <ProgressRow
        label="Ping"
        value={Math.min(100, pingValue)}
        right={pingValue > 0 ? `${pingValue} ms` : 'Sem leitura'}
        tone={pingTone(pingValue)}
      />
    </View>
  );
}

function FpsGraph({ performance }: { performance: PerformanceSnapshot | null }) {
  const message = performance?.fpsAvailable
    ? `Fonte: ${performance.fpsSource}`
    : performance?.fpsSource ?? 'Selecione um jogo e ative o Modo Avançado.';

  return (
    <View style={styles.graph}>
      <View style={styles.gridLineTop} />
      <View style={styles.gridLineMiddle} />
      <View style={styles.gridLineBottom} />
      <View style={styles.graphUnavailable}>
        <AppIcon
          name={performance?.fpsAvailable ? 'pulse' : 'analytics'}
          size={22}
          color={performance?.fpsAvailable ? colors.green : '#7F8898'}
        />
        <Text style={styles.graphUnavailableText}>{message}</Text>
      </View>
      <View style={styles.graphFooter}>
        <Text style={styles.graphLabel}>Últimos 60s</Text>
        <Text style={styles.graphLabel}>Agora</Text>
      </View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  text,
  action,
  onPress,
}: {
  icon: IconName;
  title: string;
  text: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <AppIcon name={icon} size={22} color={colors.purple} />
      </View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{text}</Text>
      </View>
      <Pressable style={styles.emptyButton} onPress={onPress}>
        <Text style={styles.emptyButtonText}>{action}</Text>
      </Pressable>
    </View>
  );
}

function ProgressRow({
  label,
  value,
  right,
  tone,
}: {
  label: string;
  value: number;
  right: string;
  tone: Tone;
}) {
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTop}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{right}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, toneStyle(tone), { width: `${Math.max(0, value)}%` }]} />
      </View>
    </View>
  );
}

function RoundAction({
  action,
  locked,
  running,
  onPress,
}: {
  action: QuickAction;
  locked: boolean;
  running: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.roundAction, locked && styles.lockedAction]} onPress={onPress}>
      <View style={[styles.roundIcon, toneSoftStyle(action.tone)]}>
        <AppIcon name={running ? 'ellipsis-horizontal' : action.icon} size={19} color={toneColor(action.tone)} />
      </View>
      <Text style={styles.roundTitle}>{action.title}</Text>
      <View style={styles.roundMeta}>
        {locked && <AppIcon name="lock-closed" size={9} color="#7F8898" />}
        <Text style={styles.roundSub}>{locked ? 'Bloq.' : action.subtitle}</Text>
      </View>
    </Pressable>
  );
}

function PanelCard({
  label,
  value,
  status,
  tone,
  progress,
}: {
  label: string;
  value: string;
  status: string;
  tone: Tone;
  progress: number;
}) {
  return (
    <View style={styles.panelCard}>
      <Text style={styles.panelLabel}>{label}</Text>
      <Text style={styles.panelValue}>{value}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, toneStyle(tone), { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
      </View>
      <Text style={[styles.panelStatus, { color: toneColor(tone) }]}>{status}</Text>
    </View>
  );
}

function ProfileTile({
  icon,
  title,
  subtitle,
  tone,
  selected,
  running,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  tone: Tone;
  selected?: boolean;
  running?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.profileTile, selected && styles.profileTileSelected]} onPress={onPress}>
      <View style={styles.profileTileTop}>
        <AppIcon name={running ? 'ellipsis-horizontal' : icon} size={19} color={toneColor(tone)} />
        {selected && <AppIcon name="checkmark-circle" size={17} color={colors.text} />}
      </View>
      <Text style={styles.profileTileTitle}>{title}</Text>
      <Text style={styles.profileTileSub}>{running ? 'Aplicando...' : subtitle}</Text>
    </Pressable>
  );
}

function ProfileStat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <View style={styles.profileStat}>
      <AppIcon name={icon} size={19} color={colors.purple} />
      <Text style={styles.profileStatValue}>{value}</Text>
      <Text style={styles.profileStatLabel}>{label}</Text>
    </View>
  );
}

function StepBadge({ done, value }: { done: boolean; value: string }) {
  return (
    <View style={[styles.stepBadge, done && styles.stepBadgeDone]}>
      {done ? (
        <AppIcon name="checkmark" size={13} color={colors.text} />
      ) : (
        <Text style={styles.stepBadgeText}>{value}</Text>
      )}
    </View>
  );
}

function SetupStep({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.stepRow}>
      <StepBadge done={done} value="!" />
      <Text style={styles.stepText}>{label}</Text>
      <Text style={[styles.stepStatus, done ? styles.stepStatusOk : styles.stepStatusPending]}>
        {done ? 'ok' : 'pendente'}
      </Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StatusInfoRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'pending' | 'neutral' | 'danger';
}) {
  const color =
    tone === 'ok'
      ? colors.green
      : tone === 'pending'
        ? colors.amber
        : tone === 'danger'
          ? colors.red
          : '#AEB6C5';

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, { color }]}>{value}</Text>
    </View>
  );
}

function AppIcon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function normalizeMetrics(metrics: DeviceMetrics): DeviceMetrics {
  return {
    ...metrics,
    ramUsedPercent: safePercent(metrics.ramUsedPercent),
    storageUsedPercent: safePercent(metrics.storageUsedPercent),
    batteryPercent: safeBattery(metrics.batteryPercent),
  };
}

function mergeByPackage(primary: InstalledGame[], additions: InstalledGame[]) {
  const byPackage = new Map<string, InstalledGame>();
  [...primary, ...additions].forEach((app) => {
    byPackage.set(app.packageName, app);
  });

  return Array.from(byPackage.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function safePercent(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeBattery(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatBytes(value?: number) {
  if (!value || value <= 0 || !Number.isFinite(value)) {
    return '--';
  }

  const gb = value / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(value / 1024 / 1024)} MB`;
}

function formatDateTime(value?: string) {
  if (!value) {
    return 'Indisponível';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Indisponível';
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeLeft(value?: string) {
  if (!value) {
    return 'Indisponível';
  }

  const expiresAt = new Date(value).getTime();
  if (!Number.isFinite(expiresAt)) {
    return 'Indisponível';
  }

  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) {
    return 'Expirada';
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  return `${minutes}min`;
}

function toneColor(tone: Tone) {
  return tone === 'green'
    ? colors.green
    : tone === 'red'
      ? colors.red
      : tone === 'blue'
        ? colors.blue
        : colors.purple;
}

function pingTone(latency?: number): Tone {
  if (typeof latency !== 'number' || !Number.isFinite(latency) || latency <= 0) {
    return 'blue';
  }

  if (latency <= 60) {
    return 'green';
  }

  if (latency <= 120) {
    return 'blue';
  }

  return 'red';
}

function profileLabel(profileId: string) {
  if (profileId === 'profile-economy') {
    return 'Economia';
  }

  if (profileId === 'profile-performance') {
    return 'Desempenho';
  }

  return 'Equilibrado';
}

function ramStatus(percent: number) {
  if (percent < 55) {
    return 'Uso normal';
  }

  if (percent < 80) {
    return 'Atencao';
  }

  return 'Alto uso';
}

function temperatureStatus(temp: number | null) {
  if (temp === null) {
    return 'Sem leitura';
  }

  if (temp < 38) {
    return 'Normal';
  }

  if (temp < 45) {
    return 'Aquecendo';
  }

  return 'Critica';
}

function temperatureTone(temp: number | null): Tone {
  if (temp === null || temp < 38) {
    return 'green';
  }

  if (temp < 45) {
    return 'blue';
  }

  return 'red';
}

function toneStyle(tone: Tone) {
  return {
    backgroundColor: toneColor(tone),
  };
}

function toneSoftStyle(tone: Tone) {
  return {
    backgroundColor:
      tone === 'green'
        ? colors.greenSoft
        : tone === 'red'
          ? colors.redSoft
          : tone === 'blue'
            ? '#10243A'
            : colors.purpleDark,
  };
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#05060A',
    flex: 1,
    paddingTop: topInset,
  },
  app: {
    backgroundColor: '#05060A',
    flex: 1,
    width: '100%',
  },
  optimizationLayer: {
    alignItems: 'center',
    backgroundColor: '#02050B',
    bottom: 0,
    justifyContent: 'space-between',
    left: 0,
    overflow: 'hidden',
    paddingBottom: 28 + bottomInset,
    paddingHorizontal: 22,
    paddingTop: 34 + topInset,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 80,
  },
  optimizationGlow: {
    backgroundColor: 'rgba(34, 189, 255, 0.045)',
    borderColor: 'rgba(34, 189, 255, 0.16)',
    borderRadius: 150,
    borderWidth: 1,
    height: 300,
    left: '50%',
    marginLeft: -150,
    opacity: 1,
    position: 'absolute',
    top: '10%',
    width: 300,
  },
  optimizationDiagonalOne: {
    backgroundColor: 'rgba(34, 189, 255, 0.12)',
    height: 2,
    left: -48,
    position: 'absolute',
    top: '32%',
    transform: [{ rotate: '-55deg' }],
    width: 520,
  },
  optimizationDiagonalTwo: {
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
    height: 2,
    position: 'absolute',
    right: -86,
    top: '58%',
    transform: [{ rotate: '-55deg' }],
    width: 520,
  },
  optimizationLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    width: '100%',
  },
  optimizationLogo: {
    height: 62,
    width: 132,
  },
  optimizationStage: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  optimizationRingWrap: {
    alignItems: 'center',
    height: 230,
    justifyContent: 'center',
    marginBottom: 26,
    position: 'relative',
    width: 230,
  },
  optimizationPulse: {
    backgroundColor: 'rgba(34, 189, 255, 0.08)',
    borderColor: 'rgba(34, 189, 255, 0.18)',
    borderWidth: 1,
    borderRadius: 107,
    height: 214,
    position: 'absolute',
    width: 214,
  },
  optimizationRocket: {
    alignItems: 'center',
    backgroundColor: 'rgba(34, 189, 255, 0.12)',
    borderColor: 'rgba(34, 189, 255, 0.22)',
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    right: 30,
    top: 14,
    width: 42,
  },
  optimizationRing: {
    borderBottomColor: '#1A2233',
    borderLeftColor: '#1A2233',
    borderRadius: 999,
    borderRightColor: '#22BDFF',
    borderTopColor: '#22BDFF',
    borderWidth: 10,
    height: 190,
    position: 'absolute',
    width: 190,
  },
  optimizationRingTrack: {
    borderColor: '#1A2233',
    borderRadius: 999,
    borderWidth: 10,
    height: 204,
    position: 'absolute',
    width: 204,
  },
  optimizationRingProgress: {
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRadius: 999,
    borderRightColor: '#9B38FF',
    borderTopColor: '#9B38FF',
    borderWidth: 10,
    height: 204,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: 204,
  },
  optimizationRingSegment: {
    borderRadius: 999,
    height: 18,
    position: 'absolute',
    width: 6,
  },
  optimizationRingInner: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 9, 18, 0.97)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 999,
    borderWidth: 1,
    height: 162,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 162,
  },
  optimizationRingLogo: {
    height: 124,
    width: 124,
  },
  optimizationPercentOrbit: {
    height: 230,
    position: 'absolute',
    width: 230,
  },
  optimizationPercentBadge: {
    alignItems: 'center',
    backgroundColor: '#06101E',
    borderRadius: 999,
    borderWidth: 2,
    height: 58,
    justifyContent: 'center',
    position: 'absolute',
    width: 58,
  },
  optimizationPercent: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  optimizationEyebrow: {
    color: '#00F0FF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  optimizationTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
    textAlign: 'center',
  },
  optimizationSubtitle: {
    color: '#92A7BD',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 9,
    maxWidth: 290,
    textAlign: 'center',
  },
  optimizationCurrentCard: {
    backgroundColor: 'rgba(8, 15, 28, 0.78)',
    borderColor: 'rgba(34, 189, 255, 0.24)',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 22,
    padding: 15,
    width: '100%',
  },
  optimizationStep: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginTop: 5,
  },
  optimizationTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    height: 9,
    marginTop: 13,
    overflow: 'hidden',
  },
  optimizationFill: {
    borderRadius: 999,
    height: '100%',
  },
  optimizationList: {
    backgroundColor: 'rgba(8, 15, 28, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 9,
    marginTop: 18,
    padding: 16,
    width: '100%',
  },
  optimizationItem: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    minHeight: 34,
  },
  optimizationItemActive: {
    backgroundColor: 'rgba(34, 189, 255, 0.08)',
    paddingHorizontal: 8,
  },
  optimizationItemBadge: {
    alignItems: 'center',
    backgroundColor: '#00F7A1',
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  optimizationItemBadgeActive: {
    backgroundColor: 'transparent',
    borderColor: '#22BDFF',
    borderTopColor: 'transparent',
    borderWidth: 2,
  },
  optimizationItemBadgeFailed: {
    backgroundColor: 'transparent',
    borderColor: colors.red,
    borderWidth: 1,
  },
  optimizationItemText: {
    color: '#D7DCE7',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  optimizationFooter: {
    gap: 12,
    width: '100%',
  },
  optimizationCancel: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 63, 109, 0.05)',
    borderColor: 'rgba(255, 63, 109, 0.55)',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    width: '100%',
  },
  optimizationCancelText: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  optimizationHint: {
    color: 'rgba(245, 251, 255, 0.58)',
    fontSize: 11,
    textAlign: 'center',
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: bottomNavHeight + 50,
  },
  splashScreen: {
    backgroundColor: '#02050B',
    flex: 1,
    overflow: 'hidden',
    paddingBottom: 34 + bottomInset,
    paddingHorizontal: 30,
    paddingTop: 58 + topInset,
  },
  splashGlow: {
    backgroundColor: 'rgba(34, 189, 255, 0.045)',
    borderColor: 'rgba(34, 189, 255, 0.16)',
    borderRadius: 150,
    borderWidth: 1,
    height: 300,
    left: '50%',
    marginLeft: -150,
    opacity: 1,
    position: 'absolute',
    top: '20%',
    width: 300,
  },
  splashDiagonalOne: {
    backgroundColor: 'rgba(34, 189, 255, 0.13)',
    height: 2,
    left: -50,
    position: 'absolute',
    top: '34%',
    transform: [{ rotate: '-55deg' }],
    width: 520,
  },
  splashDiagonalTwo: {
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    height: 2,
    position: 'absolute',
    right: -90,
    top: '52%',
    transform: [{ rotate: '-55deg' }],
    width: 520,
  },
  splashCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    transform: [{ translateY: -10 }],
  },
  splashLogoShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(3, 8, 17, 0.28)',
    borderColor: 'rgba(34, 189, 255, 0.12)',
    borderRadius: 116,
    borderWidth: 1,
    height: 232,
    justifyContent: 'center',
    position: 'relative',
    width: 232,
  },
  splashRing: {
    borderColor: 'rgba(0, 247, 161, 0.14)',
    borderRadius: 104,
    borderRightColor: 'transparent',
    borderTopColor: '#22BDFF',
    borderWidth: 1,
    height: 208,
    position: 'absolute',
    width: 208,
  },
  splashLogo: {
    height: 210,
    width: 210,
  },
  splashTag: {
    backgroundColor: 'rgba(5, 13, 25, 0.72)',
    borderColor: 'rgba(41, 185, 255, 0.26)',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 20,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  splashTagText: {
    color: '#00F0FF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  splashTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 14,
  },
  splashText: {
    color: '#90A7BE',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    maxWidth: 280,
    textAlign: 'center',
  },
  splashBottom: {
    gap: 16,
  },
  splashLoaderCard: {
    backgroundColor: 'rgba(7, 15, 29, 0.72)',
    borderColor: 'rgba(34, 189, 255, 0.2)',
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  splashLoaderHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splashLoaderLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  splashLoaderValue: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '900',
  },
  splashProgressTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    height: 9,
    marginTop: 13,
    overflow: 'hidden',
  },
  splashProgressFill: {
    backgroundColor: colors.blue,
    borderRadius: 999,
    height: '100%',
  },
  splashChecks: {
    flexDirection: 'row',
    gap: 8,
  },
  splashCheck: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 15, 29, 0.62)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    padding: 8,
  },
  splashCheckText: {
    color: '#C8D8E8',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
    textAlign: 'center',
  },
  permissionGateScreen: {
    alignItems: 'center',
    backgroundColor: '#02050B',
    flexGrow: 1,
    justifyContent: 'center',
    padding: 18,
  },
  permissionGateScroll: {
    backgroundColor: '#02050B',
    flex: 1,
  },
  setupPreviewLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 180,
  },
  permissionGateCard: {
    backgroundColor: '#0B0F19',
    borderColor: 'rgba(154, 53, 255, 0.46)',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    maxWidth: 520,
    padding: 18,
    position: 'relative',
    width: '100%',
  },
  permissionGateClose: {
    alignItems: 'center',
    backgroundColor: '#101522',
    borderColor: '#222B3F',
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    top: 14,
    width: 38,
    zIndex: 2,
  },
  permissionGateLogo: {
    alignSelf: 'center',
    height: 72,
    width: 150,
  },
  permissionGateKicker: {
    color: colors.purple,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 2,
    textAlign: 'center',
  },
  permissionGateTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  permissionGateText: {
    color: '#AEB6C5',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  shizukuGuideBox: {
    backgroundColor: '#070B14',
    borderColor: '#1A2538',
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 13,
  },
  shizukuGuideTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 2,
  },
  shizukuGuideText: {
    color: '#B7C2D2',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  permissionChecklist: {
    gap: 9,
    marginTop: 4,
  },
  permissionGateRow: {
    alignItems: 'center',
    backgroundColor: '#090D16',
    borderColor: '#171F30',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 70,
    padding: 10,
  },
  permissionGateStatus: {
    alignItems: 'center',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  permissionGateStatusOk: {
    backgroundColor: colors.green,
  },
  permissionGateStatusPending: {
    backgroundColor: '#2A2414',
    borderColor: colors.amber,
    borderWidth: 1,
  },
  permissionGateCopy: {
    flex: 1,
  },
  permissionGateRowTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  permissionGateRowText: {
    color: '#99A4B6',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  permissionGateAction: {
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 92,
    paddingHorizontal: 12,
  },
  permissionGateActionDone: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
    borderWidth: 1,
  },
  permissionGateActionText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  permissionGatePrimary: {
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    height: 50,
    justifyContent: 'center',
    marginTop: 2,
  },
  permissionGatePrimaryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  permissionGateRefresh: {
    alignItems: 'center',
    backgroundColor: '#101522',
    borderColor: '#222B3F',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 46,
    justifyContent: 'center',
    marginTop: 4,
  },
  permissionGateRefreshText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  permissionGateWarning: {
    color: colors.amber,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  webPreviewPanel: {
    backgroundColor: '#0B0F19',
    borderColor: '#1B2740',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 13,
  },
  webPreviewTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  webPreviewText: {
    color: '#AEB6C5',
    fontSize: 12,
    lineHeight: 17,
  },
  webPreviewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  webPreviewButton: {
    alignItems: 'center',
    backgroundColor: colors.purpleDark,
    borderColor: colors.purple,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 13,
  },
  webPreviewButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  activationScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  activationCard: {
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderColor: colors.purple,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    width: '100%',
  },
  activationLogo: {
    height: 72,
    marginBottom: 16,
    width: 120,
  },
  activationTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  activationText: {
    color: '#AEB6C5',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 9,
    textAlign: 'center',
  },
  activationInput: {
    backgroundColor: '#070B12',
    borderColor: '#202A3D',
    borderRadius: 13,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    height: 52,
    marginTop: 22,
    paddingHorizontal: 14,
    textAlign: 'center',
    width: '100%',
  },
  activationMessage: {
    color: colors.amber,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    minHeight: 34,
    textAlign: 'center',
  },
  activationPrimary: {
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderRadius: 13,
    flexDirection: 'row',
    gap: 8,
    height: 48,
    justifyContent: 'center',
    marginTop: 8,
    width: '100%',
  },
  activationPrimaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  activationSecondary: {
    alignItems: 'center',
    borderColor: '#273147',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 46,
    justifyContent: 'center',
    marginTop: 10,
    width: '100%',
  },
  activationSecondaryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  topHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 66,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#0A0E17',
    borderColor: '#161E2E',
    borderRadius: 20,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    position: 'relative',
    width: 42,
  },
  headerSideSpacer: {
    height: 42,
    width: 42,
  },
  redDot: {
    backgroundColor: colors.red,
    borderRadius: 5,
    height: 8,
    position: 'absolute',
    right: 9,
    top: 7,
    width: 8,
    zIndex: 2,
  },
  brandBlock: {
    alignItems: 'center',
    flex: 1,
  },
  brandLogo: {
    height: 54,
    width: 220,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  brandSub: {
    color: colors.purple,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },
  bannerFrame: {
    borderRadius: 14,
    backgroundColor: '#05060A',
    height: 96,
    overflow: 'hidden',
  },
  bannerImage: {
    height: '100%',
    width: '100%',
  },
  homeBannerFrame: {
    backgroundColor: '#05060A',
    borderRadius: 14,
    height: 96,
    overflow: 'hidden',
  },
  homeBannerImage: {
    height: '100%',
    width: '100%',
  },
  carouselFrame: {
    borderRadius: 14,
    height: 96,
    overflow: 'hidden',
    position: 'relative',
  },
  carouselImage: {
    height: '100%',
    width: '100%',
  },
  carouselDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingTop: 9,
  },
  carouselDot: {
    backgroundColor: '#626A7B',
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  carouselDotActive: {
    backgroundColor: colors.purple,
    width: 18,
  },
  connectCard: {
    backgroundColor: '#0B0F19',
    borderColor: '#4E2B7C',
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  connectTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  connectKicker: {
    color: colors.purple,
    fontSize: 10,
    fontWeight: '900',
  },
  connectTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  readyBadge: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  readyOk: {
    backgroundColor: colors.greenSoft,
    color: colors.green,
  },
  readyWarn: {
    backgroundColor: colors.redSoft,
    color: colors.red,
  },
  readyPending: {
    backgroundColor: '#392A12',
    color: colors.amber,
  },
  compactSteps: {
    backgroundColor: '#090D16',
    borderColor: '#171F30',
    borderRadius: 11,
    borderWidth: 1,
    gap: 9,
    padding: 10,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  stepBadge: {
    alignItems: 'center',
    backgroundColor: '#171D2B',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  stepBadgeDone: {
    backgroundColor: colors.green,
  },
  stepBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  stepText: {
    color: '#C2C8D4',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  stepStatus: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  stepStatusOk: {
    color: colors.green,
  },
  stepStatusPending: {
    color: colors.amber,
  },
  connectHelp: {
    color: '#AEB6C5',
    fontSize: 11,
    lineHeight: 15,
  },
  primaryButtonFull: {
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderRadius: 11,
    flexDirection: 'row',
    gap: 8,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  permissionLink: {
    alignItems: 'center',
    minHeight: 34,
    justifyContent: 'center',
  },
  permissionText: {
    color: '#C8CEDA',
    fontSize: 12,
    fontWeight: '900',
  },
  hero: {
    backgroundColor: '#0B0F19',
    borderColor: '#1B2333',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 170,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  heroBeam: {
    backgroundColor: colors.purple,
    height: 230,
    opacity: 0.35,
    position: 'absolute',
    right: 92,
    top: -34,
    transform: [{ rotate: '-29deg' }],
    width: 2,
  },
  heroCopy: {
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    zIndex: 2,
  },
  heroLabel: {
    color: '#B6BECC',
    fontSize: 11,
    fontWeight: '900',
  },
  gameName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 27,
  },
  heroText: {
    color: '#B7BFCE',
    fontSize: 12,
    lineHeight: 17,
    maxWidth: 210,
  },
  heroSymbol: {
    alignItems: 'center',
    backgroundColor: '#1B102C',
    borderColor: colors.purple,
    borderRadius: 999,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    marginLeft: 12,
    marginTop: 28,
    width: 84,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 45,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButtonWide: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderColor: '#2A3347',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 45,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  roundActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roundAction: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    minWidth: 58,
  },
  lockedAction: {
    opacity: 0.58,
  },
  roundIcon: {
    alignItems: 'center',
    borderColor: '#233047',
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  roundTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  roundSub: {
    color: '#9AA3B4',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  roundMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    minHeight: 13,
  },
  deviceCard: {
    backgroundColor: '#0B0F19',
    borderColor: '#182133',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionHint: {
    color: '#9AA3B4',
    fontSize: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  linkText: {
    color: '#AEB6C5',
    fontSize: 10,
    fontWeight: '800',
  },
  progressRow: {
    gap: 6,
  },
  progressTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: '#B6BECC',
    fontSize: 12,
    fontWeight: '800',
  },
  progressValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  progressTrack: {
    backgroundColor: '#192131',
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
  },
  gameList: {
    gap: 8,
    paddingTop: 2,
    paddingRight: 16,
  },
  gameScroller: {
    marginTop: 2,
  },
  gamePill: {
    backgroundColor: '#101522',
    borderColor: '#20283A',
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    maxWidth: 190,
    paddingHorizontal: 15,
  },
  gamePillActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  gamePillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  gamePillTextActive: {
    color: colors.text,
  },
  profileGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  profileTile: {
    backgroundColor: '#0B0F19',
    borderColor: '#1B2333',
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    gap: 11,
    minHeight: 92,
    padding: 11,
  },
  profileTileSelected: {
    borderColor: colors.purple,
  },
  profileTileTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileTileTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  profileTileSub: {
    color: '#9AA3B4',
    fontSize: 10,
  },
  pageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
    minHeight: 54,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  fpsCard: {
    backgroundColor: '#0B0F19',
    borderColor: '#141C2C',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 218,
    padding: 15,
  },
  performanceBannerFrame: {
    backgroundColor: '#05060A',
    borderRadius: 14,
    height: 96,
    overflow: 'hidden',
    position: 'relative',
  },
  performanceBadge: {
    backgroundColor: 'rgba(5, 6, 10, 0.7)',
    borderColor: '#263047',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 8,
    left: 10,
    maxWidth: 210,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
  },
  performanceBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  performanceBadgeSub: {
    color: '#AEB6C5',
    fontSize: 10,
    marginTop: 2,
  },
  fpsValueRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
  },
  fpsValue: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '900',
    marginTop: 4,
  },
  fpsUnit: {
    color: colors.purple,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 5,
  },
  graph: {
    height: 118,
    marginTop: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  gridLineTop: {
    backgroundColor: '#192131',
    height: 1,
    left: 0,
    opacity: 0.65,
    position: 'absolute',
    right: 0,
    top: 12,
  },
  gridLineMiddle: {
    backgroundColor: '#29334A',
    height: 1,
    left: 0,
    opacity: 0.85,
    position: 'absolute',
    right: 0,
    top: 52,
  },
  gridLineBottom: {
    backgroundColor: '#192131',
    height: 1,
    left: 0,
    opacity: 0.65,
    position: 'absolute',
    right: 0,
    top: 92,
  },
  graphColumns: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 5,
    height: 95,
  },
  graphColumn: {
    flex: 1,
    height: 95,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  graphGlow: {
    backgroundColor: colors.purple,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    opacity: 0.26,
    width: '100%',
  },
  graphPoint: {
    backgroundColor: colors.purple,
    borderColor: '#C89BFF',
    borderRadius: 999,
    borderWidth: 1,
    height: 7,
    left: '50%',
    marginLeft: -3,
    position: 'absolute',
    width: 7,
  },
  graphFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  graphLabel: {
    color: '#9AA3B4',
    fontSize: 10,
    fontWeight: '800',
  },
  graphUnavailable: {
    alignItems: 'center',
    height: 95,
    justifyContent: 'center',
    gap: 8,
  },
  graphUnavailableText: {
    color: '#9AA3B4',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderColor: '#182133',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 13,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.purpleDark,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  emptyCopy: {
    flex: 1,
    gap: 3,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    color: '#AEB6C5',
    fontSize: 11,
    lineHeight: 15,
  },
  emptyButton: {
    backgroundColor: colors.purple,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyButtonText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  miniLabel: {
    color: '#B6BECC',
    fontSize: 11,
    fontWeight: '800',
  },
  panelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  panelCard: {
    backgroundColor: '#0B0F19',
    borderColor: '#141C2C',
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 9,
    minHeight: 98,
    padding: 13,
  },
  panelLabel: {
    color: '#B6BECC',
    fontSize: 11,
    fontWeight: '800',
  },
  panelValue: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
  },
  panelStatus: {
    fontSize: 10,
    fontWeight: '900',
  },
  card: {
    backgroundColor: '#0B0F19',
    borderColor: '#182133',
    borderRadius: 13,
    borderWidth: 1,
    padding: 14,
  },
  infoRow: {
    alignItems: 'center',
    borderBottomColor: '#161E2E',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  infoLabel: {
    color: '#B6BECC',
    flex: 1,
    fontSize: 13,
  },
  infoValue: {
    color: colors.green,
    fontSize: 13,
    fontWeight: '900',
  },
  groupTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  gamesGroupTitle: {
    marginLeft: 2,
    marginTop: 2,
  },
  searchGamesButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#101522',
    borderColor: '#222B3F',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 13,
  },
  searchGamesText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  overlayPreviewButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.purpleDark,
    borderColor: colors.purple,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 14,
  },
  overlayPreviewButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  appPickerCard: {
    backgroundColor: '#0B0F19',
    borderColor: '#182133',
    borderRadius: 13,
    borderWidth: 1,
    gap: 12,
    padding: 13,
  },
  searchInput: {
    backgroundColor: '#070A11',
    borderColor: '#252E42',
    borderRadius: 11,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  appPickerList: {
    gap: 9,
  },
  appPickerRow: {
    alignItems: 'center',
    backgroundColor: '#090D16',
    borderColor: '#171F30',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    padding: 10,
  },
  addAppButton: {
    backgroundColor: colors.purple,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addAppButtonText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  featuredGame: {
    backgroundColor: '#0B0F19',
    borderColor: '#182133',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  featuredGameImage: {
    minHeight: 178,
  },
  featuredOverlay: {
    backgroundColor: 'rgba(5, 6, 10, 0.55)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 15,
  },
  featuredTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  featuredGameIcon: {
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderRadius: 999,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  featuredCopy: {
    flex: 1,
  },
  featuredLabel: {
    color: colors.purple,
    fontSize: 10,
    fontWeight: '900',
  },
  featuredTitle: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
    marginTop: 5,
  },
  featuredProfile: {
    color: '#C0C7D4',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  featuredActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  gameGrid: {
    gap: 10,
  },
  gameCard: {
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderColor: '#182133',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 66,
    padding: 12,
  },
  gameCardSelected: {
    borderColor: '#7D38D6',
  },
  gameCardIcon: {
    alignItems: 'center',
    backgroundColor: colors.purpleDark,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  appIconImage: {
    backgroundColor: '#151B29',
    borderColor: '#252E42',
    borderWidth: 1,
  },
  gameCardCopy: {
    flex: 1,
  },
  gameCardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  gameCardSub: {
    color: '#B6BECC',
    fontSize: 11,
    marginTop: 4,
  },
  favoriteButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  primaryButtonTextBright: {
    color: '#FFFFFF',
  },
  gameOverlayPreviewLayer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.84)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 120,
  },
  gameOverlayStage: {
    aspectRatio: 16 / 9,
    maxHeight: '82%',
    maxWidth: 980,
    width: '100%',
  },
  gameOverlayBackdrop: {
    backgroundColor: '#020B17',
    borderColor: 'rgba(34, 189, 255, 0.26)',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  gameOverlayTopBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(3, 8, 17, 0.82)',
    borderColor: 'rgba(34, 189, 255, 0.28)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 13,
    position: 'absolute',
    top: 14,
    zIndex: 3,
  },
  overlayLiveDot: {
    backgroundColor: colors.green,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  gameOverlayTopText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  gameOverlayTopMuted: {
    color: '#92A7BD',
    fontSize: 11,
    fontWeight: '800',
  },
  overlayPreviewNotice: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.blue,
    borderColor: '#77E2FF',
    borderRadius: 999,
    borderWidth: 1,
    elevation: 8,
    flexDirection: 'row',
    gap: 7,
    minHeight: 32,
    paddingHorizontal: 13,
    position: 'absolute',
    top: 54,
    zIndex: 6,
  },
  overlayPreviewNoticeText: {
    color: '#06131D',
    fontSize: 11,
    fontWeight: '900',
  },
  overlaySidePanel: {
    backgroundColor: 'rgba(3, 12, 28, 0.94)',
    borderColor: 'rgba(34, 189, 255, 0.45)',
    borderWidth: 1,
    bottom: 22,
    overflow: 'hidden',
    padding: 14,
    position: 'absolute',
    top: 52,
    width: '32%',
    zIndex: 2,
  },
  overlayLeftPanel: {
    borderBottomRightRadius: 26,
    borderTopRightRadius: 26,
    left: 18,
    paddingRight: 50,
  },
  overlayRightPanel: {
    borderBottomLeftRadius: 26,
    borderTopLeftRadius: 26,
    paddingLeft: 50,
    right: 18,
  },
  overlayWingSpine: {
    bottom: 34,
    opacity: 0.72,
    position: 'absolute',
    top: 34,
    width: 52,
    zIndex: 0,
  },
  overlayWingSpineLeft: {
    backgroundColor: 'rgba(34, 189, 255, 0.18)',
    right: 24,
    transform: [{ skewX: '-22deg' }],
  },
  overlayWingSpineRight: {
    backgroundColor: 'rgba(34, 189, 255, 0.18)',
    left: 24,
    transform: [{ skewX: '22deg' }],
  },
  overlayWingClaw: {
    backgroundColor: 'rgba(34, 189, 255, 0.16)',
    borderColor: 'rgba(34, 189, 255, 0.36)',
    borderRadius: 24,
    borderWidth: 1,
    height: 116,
    position: 'absolute',
    top: '40%',
    width: 74,
    zIndex: 0,
  },
  overlayWingClawLeft: {
    right: 4,
    transform: [{ rotate: '45deg' }, { skewX: '-12deg' }],
  },
  overlayWingClawRight: {
    left: 4,
    transform: [{ rotate: '45deg' }, { skewX: '12deg' }],
  },
  overlayKicker: {
    color: '#22BDFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  overlayHudHeader: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 18, 39, 0.92)',
    borderColor: 'rgba(34, 189, 255, 0.32)',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginBottom: 10,
    padding: 9,
    position: 'relative',
    zIndex: 2,
  },
  overlayHudLogo: {
    borderRadius: 15,
    height: 30,
    width: 30,
  },
  overlayHudCopy: {
    flex: 1,
  },
  overlayHudSubtitle: {
    color: '#9FDFFF',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  overlayHudMinimize: {
    alignItems: 'center',
    backgroundColor: '#163A66',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 9,
  },
  overlayHudMinimizeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '900',
  },
  overlayBoostDial: {
    display: 'none',
  },
  overlayBoostRing: {
    display: 'none',
  },
  overlayBoostCaption: {
    display: 'none',
  },
  overlayBoostActionCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 25, 55, 0.82)',
    borderColor: 'rgba(34, 189, 255, 0.34)',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 9,
    minHeight: 76,
    padding: 12,
    position: 'relative',
    zIndex: 2,
  },
  overlayBoostActionIcon: {
    alignItems: 'center',
    backgroundColor: '#0C86FF',
    borderColor: '#22E7FF',
    borderRadius: 22,
    borderWidth: 2,
    height: 44,
    justifyContent: 'center',
    shadowColor: '#22BDFF',
    shadowOpacity: 0.55,
    shadowRadius: 20,
    width: 44,
  },
  overlayBoostActionCopy: {
    flex: 1,
  },
  overlayBoostActionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  overlayBoostActionSub: {
    color: '#9AB4CE',
    fontSize: 10,
    lineHeight: 13,
    marginTop: 3,
  },
  overlayBoostActionStatus: {
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
    borderRadius: 999,
    color: '#00F0FF',
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  overlayPanelTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 4,
  },
  overlayPanelText: {
    color: '#92A7BD',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  overlayPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#22BDFF',
    borderRadius: 13,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 40,
    position: 'relative',
    zIndex: 2,
  },
  overlayPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  overlayToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
    minHeight: 48,
    padding: 10,
  },
  overlayToggleCopy: {
    flex: 1,
  },
  overlayToggleTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  overlayToggleSub: {
    color: '#92A7BD',
    fontSize: 10,
    marginTop: 2,
  },
  overlaySwitch: {
    backgroundColor: '#5B5E69',
    borderRadius: 999,
    height: 24,
    padding: 3,
    width: 44,
  },
  overlaySwitchActive: {
    backgroundColor: '#22BDFF',
  },
  overlaySwitchKnob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  overlaySwitchKnobActive: {
    marginLeft: 20,
  },
  overlayButtonRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 8,
    marginTop: 8,
    position: 'relative',
    zIndex: 2,
  },
  overlayMiniButton: {
    alignItems: 'center',
    backgroundColor: '#111824',
    borderColor: '#253045',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  overlayMiniButtonText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '900',
  },
  overlayMiniAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(13, 27, 47, 0.94)',
    borderColor: 'rgba(34, 189, 255, 0.22)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'relative',
    zIndex: 2,
  },
  overlayMiniActionCopy: {
    flex: 1,
  },
  overlayMiniActionTitle: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  overlayMiniActionSub: {
    color: '#91A9C2',
    fontSize: 9,
    marginTop: 2,
  },
  overlayToolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
    marginTop: 8,
    position: 'relative',
    zIndex: 2,
  },
  overlayToolTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 28, 62, 0.82)',
    borderColor: 'rgba(34, 189, 255, 0.26)',
    borderRadius: 13,
    borderWidth: 1,
    minHeight: 82,
    justifyContent: 'center',
    padding: 8,
    width: '47%',
  },
  overlayToolTitle: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 7,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  overlayToolSub: {
    color: '#22BDFF',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
  },
  overlayCenter: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: '31%',
    position: 'absolute',
    right: '31%',
    top: 0,
  },
  overlayGameText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  overlayGameSub: {
    color: '#92A7BD',
    fontSize: 12,
    marginTop: 7,
    textAlign: 'center',
  },
  overlayMetric: {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 13,
    borderWidth: 1,
    marginTop: 10,
    padding: 11,
    position: 'relative',
    zIndex: 2,
  },
  overlayMetricCompact: {
    alignItems: 'center',
    borderColor: 'rgba(34, 189, 255, 0.22)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 9,
  },
  overlayMetricLabel: {
    color: '#92A7BD',
    fontSize: 11,
    fontWeight: '800',
  },
  overlayMetricValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 3,
  },
  overlayMetricValueCompact: {
    fontSize: 18,
    marginTop: 0,
  },
  overlayMetricDetail: {
    color: '#6F8AA6',
    fontSize: 9,
    marginTop: 2,
  },
  overlayFloatingBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(6, 14, 28, 0.76)',
    borderColor: '#22BDFF',
    borderRadius: 28,
    borderWidth: 1,
    bottom: 18,
    height: 56,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -28,
    position: 'absolute',
    width: 56,
    zIndex: 4,
  },
  overlayBubbleText: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
  },
  overlayCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 15, 28, 0.92)',
    borderColor: '#253045',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    top: 14,
    width: 36,
    zIndex: 5,
  },
  revertAllCard: {
    alignItems: 'center',
    backgroundColor: '#0B1410',
    borderColor: 'rgba(48, 242, 140, 0.35)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 86,
    padding: 14,
  },
  revertAllIcon: {
    alignItems: 'center',
    backgroundColor: colors.greenSoft,
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  revertAllCopy: {
    flex: 1,
  },
  revertAllTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  revertAllText: {
    color: '#AEB6C5',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  revertAllAction: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '900',
  },
  toolList: {
    gap: 10,
  },
  toolSection: {
    gap: 10,
  },
  toolRow: {
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderColor: '#182133',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    padding: 13,
  },
  lockedRow: {
    opacity: 0.6,
  },
  toolIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  toolCopy: {
    flex: 1,
  },
  toolTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  toolSubtitle: {
    color: '#AEB6C5',
    fontSize: 11,
    marginTop: 4,
  },
  avatar: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.purple,
    borderColor: '#C28BFF',
    borderRadius: 999,
    borderWidth: 2,
    height: 72,
    justifyContent: 'center',
    position: 'relative',
    width: 72,
  },
  avatarEdit: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderColor: '#2A3347',
    borderRadius: 999,
    borderWidth: 1,
    bottom: -2,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 24,
  },
  profileName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  profileSubtitle: {
    color: '#AEB6C5',
    fontSize: 12,
    fontWeight: '800',
    marginTop: -10,
    textAlign: 'center',
  },
  profileSectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  profileStats: {
    flexDirection: 'row',
    gap: 10,
  },
  profileStat: {
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    borderColor: '#141C2C',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 88,
    padding: 12,
  },
  profileStatValue: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 4,
  },
  profileStatLabel: {
    color: '#AEB6C5',
    fontSize: 10,
    marginTop: 5,
    textAlign: 'center',
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 13, 34, 0.96)',
    borderColor: 'rgba(154, 53, 255, 0.28)',
    borderRadius: 28,
    borderWidth: 1,
    bottom: 14 + bottomInset,
    flexDirection: 'row',
    height: 72,
    justifyContent: 'space-between',
    left: 12,
    paddingHorizontal: 10,
    position: 'absolute',
    right: 12,
    shadowColor: '#9A35FF',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  navItem: {
    alignItems: 'center',
    flexDirection: 'column',
    flex: 1,
    gap: 3,
    height: '100%',
    justifyContent: 'center',
    minWidth: 58,
  },
  navItemCenter: {
    flex: 0.78,
    minWidth: 62,
  },
  navIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 34,
  },
  navIconWrapActive: {
    backgroundColor: 'rgba(154, 53, 255, 0.18)',
  },
  navIconWrapCenter: {
    backgroundColor: colors.purple,
    borderColor: '#2A164B',
    borderRadius: 999,
    borderWidth: 4,
    height: 58,
    marginTop: -30,
    shadowColor: '#5D43FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    width: 58,
  },
  navIconWrapCenterActive: {
    backgroundColor: colors.purple,
  },
  navText: {
    color: '#8F98AD',
    fontSize: 8,
    fontWeight: '800',
    maxWidth: 58,
    textAlign: 'center',
  },
  navTextActive: {
    color: colors.text,
  },
  rocketDock: {
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderColor: '#C999FF',
    borderRadius: 999,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -28,
    position: 'absolute',
    top: -22,
    width: 56,
  },
});
