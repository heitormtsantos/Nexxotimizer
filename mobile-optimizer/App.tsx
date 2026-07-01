import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AppState,
  Image,
  ImageBackground,
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
  DeviceMetrics,
  getDeviceMetrics,
  getInstalledGames,
  getLaunchableApps,
  getNativeAdvancedStatus,
  getPerformanceSnapshot,
  InstalledGame,
  launchGame,
  NativeAdvancedStatus,
  openShizuku,
  OptimizerActionResult,
  PerformanceSnapshot,
  PingResult,
  requestShizukuPermission,
  runOptimizerAction,
  runPing,
} from './src/services/nativeOptimizer';
import { colors } from './src/theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;
type TabId = 'home' | 'performance' | 'games' | 'tools' | 'profile';
type Tone = 'purple' | 'green' | 'red' | 'blue';

type QuickAction = {
  id: string;
  icon: IconName;
  title: string;
  subtitle: string;
  tone: Tone;
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
};

const gameCarouselImages = [
  banners.gameCarousel1,
  banners.gameCarousel2,
  banners.gameCarousel3,
  banners.gameCarousel4,
];

const topInset = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;
const bottomInset = Platform.OS === 'android' ? 22 : 0;
const bottomNavHeight = 78 + bottomInset;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [manualGames, setManualGames] = useState<InstalledGame[]>([]);
  const [appCandidates, setAppCandidates] = useState<InstalledGame[]>([]);
  const [appSearch, setAppSearch] = useState('');
  const [isPickingApp, setIsPickingApp] = useState(false);
  const [selectedGame, setSelectedGame] = useState<InstalledGame | null>(null);
  const [metrics, setMetrics] = useState<DeviceMetrics | null>(null);
  const [performance, setPerformance] = useState<PerformanceSnapshot | null>(null);
  const [ping, setPing] = useState<PingResult | null>(null);
  const [advanced, setAdvanced] = useState<NativeAdvancedStatus | null>(null);
  const [lastAction, setLastAction] = useState<OptimizerActionResult | null>(null);
  const [appliedActionCount, setAppliedActionCount] = useState(0);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState('profile-balanced');
  const [gameCarouselIndex, setGameCarouselIndex] = useState(0);
  const [notice, setNotice] = useState('Ative o Modo Avançado para liberar boost real.');

  const ready = !!advanced?.canRunPrivilegedActions;
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

  useEffect(() => {
    refreshPerformanceSnapshot();
  }, [selectedGame?.packageName, ready]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGameCarouselIndex((index) => (index + 1) % gameCarouselImages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  async function refreshAll() {
    try {
      const [nextGames, nextMetrics, nextPing, nextAdvanced] = await Promise.all([
        getInstalledGames(),
        getDeviceMetrics(),
        runPing(),
        getNativeAdvancedStatus(),
      ]);
      const mergedGames = mergeByPackage(nextGames, manualGames);
      const nextSelected =
        selectedGame && mergedGames.some((game) => game.packageName === selectedGame.packageName)
          ? selectedGame
          : mergedGames[0] ?? null;
      setGames(mergedGames);
      setSelectedGame(nextSelected);
      setMetrics(normalizeMetrics(nextMetrics));
      setPing(nextPing);
      setAdvanced(nextAdvanced);
      setPerformance(await getPerformanceSnapshot(nextSelected ?? undefined));
      setNotice(nextAdvanced.canRunPrivilegedActions ? 'Modo Avançado pronto.' : 'Ative o Modo Avançado para liberar boost real.');
    } catch {
      setNotice('Não foi possível ler todos os dados. Tente atualizar.');
    }
  }

  async function runAction(actionId: string) {
    if (actionId === 'more') {
      setActiveTab('tools');
      return;
    }

    if (!ready) {
      setNotice('Conclua o Modo Avançado antes de executar otimizações.');
      return;
    }

    setRunningAction(actionId);
    setLastAction(null);
    if (actionId.startsWith('profile-')) {
      setSelectedProfile(actionId);
    }
    setNotice('Executando otimização...');

    try {
      const result = await runOptimizerAction(actionId, selectedGame ?? undefined);
      setLastAction(result);
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
      setPerformance(await getPerformanceSnapshot(selectedGame ?? undefined));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ative o Modo Avançado para continuar.');
    } finally {
      setRunningAction(null);
    }
  }

  async function boostAndOpen() {
    if (!ready) {
      setNotice('Ative o Modo Avançado antes de iniciar o boost.');
      return;
    }

    if (!selectedGame) {
      setNotice('Nenhum jogo detectado. Toque em Buscar app para adicionar manualmente.');
      return;
    }

    await runAction('game-boost');
    await launchGame(selectedGame);
  }

  async function refreshPerformanceSnapshot() {
    try {
      setPerformance(await getPerformanceSnapshot(selectedGame ?? undefined));
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
    setSelectedGame(taggedApp);
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

  async function requestPermissionAndRefresh() {
    try {
      await requestShizukuPermission();
      await refreshAll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Modo Avançado ainda não está ativo.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.app}>
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
            setSelectedGame={setSelectedGame}
            runAction={runAction}
            selectedProfile={selectedProfile}
            boostAndOpen={boostAndOpen}
            refreshAll={refreshAll}
            openAppPicker={openAppPicker}
            installPermissionComponent={installPermissionComponent}
            requestPermissionAndRefresh={requestPermissionAndRefresh}
          />
        )}
        {activeTab === 'performance' && (
          <PerformanceScreen
            metrics={metrics}
            performance={performance}
            ping={ping}
            lastAction={lastAction}
            refreshAll={refreshAll}
            runAction={runAction}
            runningAction={runningAction}
            ready={ready}
            selectedGame={selectedGame}
            selectedProfile={selectedProfile}
          />
        )}
        {activeTab === 'games' && (
          <GamesScreen
            games={games}
            selectedGame={selectedGame}
            ready={ready}
            runningAction={runningAction}
            setSelectedGame={setSelectedGame}
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
          />
        )}
        {activeTab === 'tools' && (
          <ToolsScreen ready={ready} runningAction={runningAction} runAction={runAction} />
        )}
        {activeTab === 'profile' && (
          <ProfileScreen
            advanced={advanced}
            refreshAll={refreshAll}
            installPermissionComponent={installPermissionComponent}
            requestPermissionAndRefresh={requestPermissionAndRefresh}
            appliedActionCount={appliedActionCount}
          />
        )}
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
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
  boostAndOpen,
  refreshAll,
  openAppPicker,
  installPermissionComponent,
  requestPermissionAndRefresh,
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
  boostAndOpen: () => void;
  refreshAll: () => void;
  openAppPicker: () => void;
  installPermissionComponent: () => void;
  requestPermissionAndRefresh: () => void;
}) {
  return (
    <Screen>
      <AppHeader refreshAll={refreshAll} />
      <HomeBanner source={banners.home} />

      <View style={styles.hero}>
        <View style={styles.heroBeam} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroLabel}>MODO</Text>
          <Text numberOfLines={2} adjustsFontSizeToFit style={styles.gameName}>
            {selectedGame ? `${selectedGame.label}\nTURBO` : 'Nenhum jogo\nselecionado'}
          </Text>
          <Text numberOfLines={2} style={styles.heroText}>{notice}</Text>
          <Pressable style={[styles.primaryButton, (!ready || !selectedGame) && styles.disabled]} onPress={boostAndOpen}>
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
  refreshAll,
  runAction,
  runningAction,
  ready,
  selectedGame,
  selectedProfile,
}: {
  metrics: DeviceMetrics | null;
  performance: PerformanceSnapshot | null;
  ping: PingResult | null;
  lastAction: OptimizerActionResult | null;
  refreshAll: () => void;
  runAction: (actionId: string) => void;
  runningAction: string | null;
  ready: boolean;
  selectedGame: InstalledGame | null;
  selectedProfile: string;
}) {
  const ramPercent = safePercent(metrics?.ramUsedPercent);
  const temp = metrics?.temperatureCelsius ? Math.round(metrics.temperatureCelsius) : null;
  const pingLabel = ping?.ok && ping.latencyMs > 0 ? `${ping.latencyMs} ms` : 'Sem leitura';
  const fpsAvailable = !!performance?.fpsAvailable;
  const fpsValue = fpsAvailable ? Math.round(performance.fps).toString() : '--';
  const fpsStatus = fpsAvailable ? 'Leitura real' : 'Sem leitura';
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
      <PageHeader title="Desempenho" icon="chevron-back" actionIcon="settings" onAction={refreshAll} />
      <PerformanceBanner profile={profileLabel(selectedProfile)} game={selectedGame?.label ?? 'Nenhum jogo selecionado'} />
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
}: {
  games: InstalledGame[];
  selectedGame: InstalledGame | null;
  ready: boolean;
  runningAction: string | null;
  setSelectedGame: (game: InstalledGame | null) => void;
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

  return (
    <Screen>
      <PageHeader title="Jogos" icon="chevron-back" actionIcon="refresh" onAction={refreshAll} />
      <GameCarousel index={carouselIndex} setIndex={setCarouselIndex} />
      <Pressable style={styles.searchGamesButton} onPress={openAppPicker}>
        <AppIcon name="search" size={15} color={colors.text} />
        <Text style={styles.searchGamesText}>Buscar app</Text>
      </Pressable>
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
                  <View style={styles.gameCardIcon}>
                    <AppIcon name="apps" size={20} color={colors.purple} />
                  </View>
                  <View style={styles.gameCardCopy}>
                    <Text numberOfLines={1} style={styles.gameCardTitle}>{app.label}</Text>
                    <Text numberOfLines={1} style={styles.gameCardSub}>{app.packageName}</Text>
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
        <ImageBackground source={gameBannerFor(selectedGame)} resizeMode="cover" style={styles.featuredGameImage}>
          <View style={styles.featuredOverlay}>
            <View style={styles.featuredTopRow}>
              <View style={styles.featuredGameIcon}>
                <AppIcon name="game-controller" size={22} color={colors.text} />
              </View>
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
        </ImageBackground>
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
        {games.map((game) => (
          <Pressable
            key={game.packageName}
            style={[
              styles.gameCard,
              selectedGame?.packageName === game.packageName && styles.gameCardSelected,
            ]}
            onPress={() => setSelectedGame(game)}
          >
            <View style={styles.gameCardIcon}>
              <AppIcon name="game-controller" size={22} color={colors.purple} />
            </View>
            <View style={styles.gameCardCopy}>
              <Text numberOfLines={1} style={styles.gameCardTitle}>{game.label}</Text>
              <Text style={styles.gameCardSub}>
                {selectedGame?.packageName === game.packageName ? 'Selecionado' : 'Detectado'}
              </Text>
            </View>
            {selectedGame?.packageName === game.packageName && (
              <AppIcon name="checkmark-circle" size={19} color={colors.green} />
            )}
          </Pressable>
        ))}
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
}: {
  ready: boolean;
  runningAction: string | null;
  runAction: (actionId: string) => void;
}) {
  return (
    <Screen>
      <PageHeader title="Ferramentas" icon="chevron-back" actionIcon="help-circle" />
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
  refreshAll,
  installPermissionComponent,
  requestPermissionAndRefresh,
}: {
  advanced: NativeAdvancedStatus | null;
  appliedActionCount: number;
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

  return (
    <Screen>
      <PageHeader title="Perfil" icon="person" actionIcon="refresh" onAction={refreshAll} />
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
      </View>
    </Screen>
  );
}

function PageHeader({
  title,
  icon,
  actionIcon,
  onAction,
}: {
  title: string;
  icon: IconName;
  actionIcon: IconName;
  onAction?: () => void;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.headerIcon}>
        <AppIcon name={icon} size={22} color={colors.text} />
      </View>
      <Text style={styles.pageTitle}>{title}</Text>
      <Pressable style={styles.headerIcon} onPress={onAction}>
        <AppIcon name={actionIcon} size={21} color={colors.text} />
      </Pressable>
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
      {tabs.map((tab) => (
        <Pressable key={tab.id} style={styles.navItem} onPress={() => setActiveTab(tab.id)}>
          <View style={[styles.navIconWrap, activeTab === tab.id && styles.navIconWrapActive]}>
            <AppIcon
              name={tab.icon}
              size={19}
              color={activeTab === tab.id ? colors.text : '#858B99'}
            />
          </View>
          <Text style={[styles.navText, activeTab === tab.id && styles.navTextActive]}>{tab.label}</Text>
        </Pressable>
      ))}
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
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: bottomNavHeight + 50,
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
  primaryButtonTextBright: {
    color: '#FFFFFF',
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
    backgroundColor: '#120D22',
    borderTopColor: '#241842',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    height: bottomNavHeight,
    left: 0,
    paddingBottom: 7 + bottomInset,
    position: 'absolute',
    right: 0,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  navIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 40,
  },
  navIconWrapActive: {
    backgroundColor: '#2A164B',
  },
  navText: {
    color: '#A3AAB8',
    fontSize: 10,
    fontWeight: '800',
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
