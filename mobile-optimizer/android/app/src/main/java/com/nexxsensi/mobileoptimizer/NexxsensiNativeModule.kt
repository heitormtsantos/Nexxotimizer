package com.nexxsensi.mobileoptimizer

import android.Manifest
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.os.StatFs
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import java.io.File
import java.net.InetAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import rikka.shizuku.Shizuku

class NexxsensiNativeModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private val pairingNotificationId = 2408
  private val pairingChannelId = "advanced_mode_pairing"
  private var shellService: INexxsensiShellService? = null
  private var shellBinding = false

  override fun getName(): String = "NexxsensiNative"

  @ReactMethod
  fun getInstalledGames(promise: Promise) {
    try {
      val packageManager = reactContext.packageManager
      val intent = Intent(Intent.ACTION_MAIN, null).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }
      val launchableApps = packageManager.queryIntentActivities(intent, 0)
      val games = WritableNativeArray()

      launchableApps
        .map { it.activityInfo.applicationInfo }
        .distinctBy { it.packageName }
        .filter { isGameApp(it, packageManager) }
        .sortedBy { packageManager.getApplicationLabel(it).toString().lowercase() }
        .forEach { appInfo ->
          val item = WritableNativeMap()
          item.putString("packageName", appInfo.packageName)
          item.putString("label", packageManager.getApplicationLabel(appInfo).toString())
          item.putString("category", categoryName(appInfo))
          item.putBoolean("system", (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
          games.pushMap(item)
        }

      promise.resolve(games)
    } catch (error: Exception) {
      promise.reject("games_list_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getLaunchableApps(promise: Promise) {
    try {
      val packageManager = reactContext.packageManager
      val intent = Intent(Intent.ACTION_MAIN, null).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }
      val apps = WritableNativeArray()

      packageManager.queryIntentActivities(intent, 0)
        .map { it.activityInfo.applicationInfo }
        .distinctBy { it.packageName }
        .filter { it.packageName != reactContext.packageName }
        .sortedBy { packageManager.getApplicationLabel(it).toString().lowercase() }
        .forEach { appInfo ->
          val item = WritableNativeMap()
          item.putString("packageName", appInfo.packageName)
          item.putString("label", packageManager.getApplicationLabel(appInfo).toString())
          item.putString("category", categoryName(appInfo))
          item.putBoolean("system", (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
          apps.pushMap(item)
        }

      promise.resolve(apps)
    } catch (error: Exception) {
      promise.reject("apps_list_failed", error.message, error)
    }
  }

  @ReactMethod
  fun launchApp(packageName: String, promise: Promise) {
    try {
      val launchIntent = reactContext.packageManager.getLaunchIntentForPackage(packageName)
      if (launchIntent == null) {
        promise.reject("app_not_launchable", "App não pode ser aberto: $packageName")
        return
      }

      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(launchIntent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("app_launch_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getAdvancedStatus(promise: Promise) {
    val status = WritableNativeMap()
    val supportsWirelessDebugging = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    val shizukuInstalled = isPackageInstalled("moe.shizuku.privileged.api")
    val shizukuAlive = try {
      Shizuku.pingBinder()
    } catch (_: Throwable) {
      false
    }
    val shizukuPermission = try {
      shizukuAlive && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
    } catch (_: Throwable) {
      false
    }

    status.putString("platform", "android")
    status.putInt("sdk", Build.VERSION.SDK_INT)
    status.putString("androidVersion", Build.VERSION.RELEASE)
    status.putBoolean("supportsWirelessDebugging", supportsWirelessDebugging)
    status.putBoolean("shizukuInstalled", shizukuInstalled)
    status.putBoolean("shizukuAlive", shizukuAlive)
    status.putBoolean("shizukuPermission", shizukuPermission)
    status.putBoolean("canRunPrivilegedActions", shizukuAlive && shizukuPermission)
    promise.resolve(status)
  }

  @ReactMethod
  fun openDeveloperOptions(promise: Promise) {
    openIntent(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS), promise)
  }

  @ReactMethod
  fun requestNotificationPermission(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.resolve(true)
        return
      }

      if (reactContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
      ) {
        promise.resolve(true)
        return
      }

      val activity = getCurrentActivity()
      if (activity == null) {
        promise.resolve(false)
        return
      }

      activity.requestPermissions(
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        778
      )
      promise.resolve(false)
    } catch (error: Exception) {
      promise.reject("notification_permission_failed", error.message, error)
    }
  }

  @ReactMethod
  fun startPairingNotification(promise: Promise) {
    try {
      createPairingChannel()
      val notificationManager = reactContext.getSystemService(
        Context.NOTIFICATION_SERVICE
      ) as NotificationManager

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        reactContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        promise.resolve(false)
        return
      }

      notificationManager.notify(pairingNotificationId, buildPairingNotification())
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("pairing_notification_failed", error.message, error)
    }
  }

  @ReactMethod
  fun stopPairingNotification(promise: Promise) {
    try {
      val notificationManager = reactContext.getSystemService(
        Context.NOTIFICATION_SERVICE
      ) as NotificationManager
      notificationManager.cancel(pairingNotificationId)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("pairing_notification_cancel_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getPairingInput(promise: Promise) {
    try {
      val preferences = reactContext.getSharedPreferences(
        PairingNotificationReceiver.PREFS,
        Context.MODE_PRIVATE
      )
      val input = WritableNativeMap()
      input.putString(
        "code",
        preferences.getString(PairingNotificationReceiver.KEY_CODE, "").orEmpty()
      )
      input.putString(
        "port",
        preferences.getString(PairingNotificationReceiver.KEY_PORT, "").orEmpty()
      )
      promise.resolve(input)
    } catch (error: Exception) {
      promise.reject("pairing_input_failed", error.message, error)
    }
  }

  @ReactMethod
  fun openShizuku(promise: Promise) {
    val launchIntent = reactContext.packageManager.getLaunchIntentForPackage(
      "moe.shizuku.privileged.api"
    )

    if (launchIntent != null) {
      openIntent(launchIntent, promise)
      return
    }

    val marketIntent = Intent(
      Intent.ACTION_VIEW,
      android.net.Uri.parse("market://details?id=moe.shizuku.privileged.api")
    )
    try {
      marketIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(marketIntent)
      promise.resolve(true)
    } catch (_: Exception) {
      val browserIntent = Intent(
        Intent.ACTION_VIEW,
        android.net.Uri.parse("https://shizuku.rikka.app/download/")
      )
      openIntent(browserIntent, promise)
    }
  }

  @ReactMethod
  fun requestShizukuPermission(promise: Promise) {
    try {
      if (!Shizuku.pingBinder()) {
        promise.reject("shizuku_not_running", "Shizuku não está ativo.")
        return
      }

      if (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED) {
        promise.resolve(true)
        return
      }

      Shizuku.requestPermission(777)
      promise.resolve(false)
    } catch (error: Throwable) {
      promise.reject("shizuku_permission_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getDeviceMetrics(promise: Promise) {
    try {
      val activityManager = reactContext.getSystemService(
        Context.ACTIVITY_SERVICE
      ) as ActivityManager
      val memoryInfo = ActivityManager.MemoryInfo()
      activityManager.getMemoryInfo(memoryInfo)

      val storage = StatFs(Environment.getDataDirectory().absolutePath)
      val totalStorage = storage.blockSizeLong * storage.blockCountLong
      val freeStorage = storage.blockSizeLong * storage.availableBlocksLong
      val batteryManager = reactContext.getSystemService(
        Context.BATTERY_SERVICE
      ) as BatteryManager
      val rawBatteryPercent = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
      val batteryPercent = rawBatteryPercent.coerceIn(0, 100)
      val temperature = readThermalTemperature()

      val metrics = WritableNativeMap()
      metrics.putDouble("ramTotalBytes", memoryInfo.totalMem.toDouble())
      metrics.putDouble("ramAvailableBytes", memoryInfo.availMem.toDouble())
      metrics.putDouble("ramUsedPercent", usedPercent(memoryInfo.totalMem, memoryInfo.availMem))
      metrics.putDouble("storageTotalBytes", totalStorage.toDouble())
      metrics.putDouble("storageFreeBytes", freeStorage.toDouble())
      metrics.putDouble("storageUsedPercent", usedPercent(totalStorage, freeStorage))
      metrics.putInt("batteryPercent", batteryPercent)
      if (temperature != null) {
        metrics.putDouble("temperatureCelsius", temperature)
      } else {
        metrics.putNull("temperatureCelsius")
      }

      promise.resolve(metrics)
    } catch (error: Exception) {
      promise.reject("metrics_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getPerformanceSnapshot(packageName: String?, promise: Promise) {
    Thread {
      try {
        val result = WritableNativeMap()
        result.putDouble("fps", 0.0)
        result.putBoolean("fpsAvailable", false)
        result.putString("fpsSource", "Selecione um jogo e ative o Modo Avançado.")
        result.putNull("cpuUsedPercent")
        result.putNull("gpuUsedPercent")

        val safePackage = packageName
          ?.takeIf { it.matches(Regex("[A-Za-z0-9._]+")) }
          ?.takeIf { it.isNotBlank() }

        if (safePackage == null) {
          promise.resolve(result)
          return@Thread
        }

        if (!canUseShizuku()) {
          result.putString("fpsSource", "FPS real exige Shizuku autorizado.")
          promise.resolve(result)
          return@Thread
        }

        val service = getShellService()
        val gfxInfo = parseShellResult(service.exec("dumpsys gfxinfo $safePackage framestats"))
        if (gfxInfo.exitCode == 0) {
          val fps = parseFpsFromFrameStats(gfxInfo.stdout)
          if (fps != null && fps > 0.0) {
            result.putDouble("fps", fps)
            result.putBoolean("fpsAvailable", true)
            result.putString("fpsSource", "dumpsys gfxinfo")
          } else {
            result.putString("fpsSource", "Abra o jogo uma vez para gerar histórico de frames.")
          }
        } else {
          result.putString("fpsSource", gfxInfo.stderr.ifBlank { "Android não retornou dados de FPS." })
        }

        val cpuInfo = parseShellResult(
          service.exec("top -b -n 1 -o CPU,ARGS 2>/dev/null | grep $safePackage | head -n 1 || true")
        )
        parseCpuFromTop(cpuInfo.stdout)?.let { result.putDouble("cpuUsedPercent", it) }

        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("performance_snapshot_failed", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun runPing(host: String, promise: Promise) {
    Thread {
      try {
        val started = System.nanoTime()
        val reachable = InetAddress.getByName(host.ifBlank { "8.8.8.8" }).isReachable(2500)
        val elapsedMs = (System.nanoTime() - started) / 1_000_000
        val result = WritableNativeMap()
        result.putBoolean("ok", reachable)
        result.putInt("latencyMs", elapsedMs.toInt())
        result.putString("host", host.ifBlank { "8.8.8.8" })
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("ping_failed", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun runOptimizerAction(actionId: String, packageName: String?, promise: Promise) {
    Thread {
      try {
        if (!canUseShizuku()) {
          promise.reject(
            "advanced_mode_required",
            "Ative e autorize o Shizuku para executar otimizações reais."
          )
          return@Thread
        }

        val commands = buildActionCommands(actionId, packageName.orEmpty())
        if (commands.isEmpty()) {
          promise.reject("unknown_action", "Ação não reconhecida: $actionId")
          return@Thread
        }

        val service = getShellService()
        val steps = WritableNativeArray()
        var allOk = true

        commands.forEach { command ->
          val raw = service.exec(command.command)
          val parsed = parseShellResult(raw)
          if (parsed.exitCode != 0) {
            allOk = false
          }

          val step = WritableNativeMap()
          step.putString("title", command.title)
          step.putString("command", command.command)
          step.putInt("exitCode", parsed.exitCode)
          step.putBoolean("ok", parsed.exitCode == 0)
          step.putString("stdout", parsed.stdout)
          step.putString("stderr", parsed.stderr)
          steps.pushMap(step)
        }

        val result = WritableNativeMap()
        result.putString("actionId", actionId)
        result.putBoolean("ok", allOk)
        result.putArray("steps", steps)
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("action_failed", error.message, error)
      }
    }.start()
  }

  private fun openIntent(intent: Intent, promise: Promise) {
    try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("open_intent_failed", error.message, error)
    }
  }

  private fun createPairingChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val notificationManager = reactContext.getSystemService(
      Context.NOTIFICATION_SERVICE
    ) as NotificationManager
    val channel = NotificationChannel(
      pairingChannelId,
      "Modo Avançado",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Ajuda a voltar ao Game Optimizer durante a configuração."
      setShowBadge(false)
    }
    notificationManager.createNotificationChannel(channel)
  }

  private fun buildPairingNotification(): Notification {
    val openAppIntent = reactContext.packageManager.getLaunchIntentForPackage(
      reactContext.packageName
    )?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: Intent(reactContext, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val pendingIntent = PendingIntent.getActivity(
      reactContext,
      2408,
      openAppIntent,
      flags
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(reactContext, pairingChannelId)
    } else {
      Notification.Builder(reactContext)
    }

    return builder
      .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
      .setContentTitle("Game Optimizer aguardando pareamento")
      .setContentText("Expanda e use os botões para digitar código e porta.")
      .setStyle(Notification.BigTextStyle().bigText("Expanda e use os botões para digitar código e porta sem sair da tela de depuração Wi-Fi."))
      .setSubText("Modo Avançado")
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(pendingIntent)
      .addAction(
        buildPairingInputAction(
          PairingNotificationReceiver.KEY_CODE,
          PairingNotificationReceiver.ACTION_SAVE_CODE,
          "Digitar código",
          2410
        )
      )
      .addAction(
        buildPairingInputAction(
          PairingNotificationReceiver.KEY_PORT,
          PairingNotificationReceiver.ACTION_SAVE_PORT,
          "Digitar porta",
          2411
        )
      )
      .build()
  }

  private fun buildPairingInputAction(
    key: String,
    actionName: String,
    title: String,
    requestCode: Int
  ): Notification.Action {
    val inputIntent = Intent(
      reactContext,
      PairingNotificationReceiver::class.java
    ).apply {
      action = actionName
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_MUTABLE
      } else {
        0
      }
    val pendingIntent = PendingIntent.getBroadcast(
      reactContext,
      requestCode,
      inputIntent,
      flags
    )
    val input = RemoteInput.Builder(key)
      .setLabel(title)
      .build()

    return Notification.Action.Builder(
      android.R.drawable.ic_menu_edit,
      title,
      pendingIntent
    )
      .addRemoteInput(input)
      .build()
  }

  private fun isPackageInstalled(packageName: String): Boolean {
    return try {
      reactContext.packageManager.getPackageInfo(packageName, 0)
      true
    } catch (_: PackageManager.NameNotFoundException) {
      false
    }
  }

  private fun canUseShizuku(): Boolean {
    return try {
      Shizuku.pingBinder() && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
    } catch (_: Throwable) {
      false
    }
  }

  private fun getShellService(): INexxsensiShellService {
    shellService?.let { return it }

    if (shellBinding) {
      waitForShellService()?.let { return it }
    }

    shellBinding = true
    val latch = CountDownLatch(1)
    val connection = object : ServiceConnection {
      override fun onServiceConnected(name: ComponentName, service: IBinder) {
        shellService = INexxsensiShellService.Stub.asInterface(service)
        latch.countDown()
      }

      override fun onServiceDisconnected(name: ComponentName) {
        shellService = null
        shellBinding = false
      }
    }

    val args = Shizuku.UserServiceArgs(
      ComponentName(reactContext, NexxsensiShellService::class.java)
    )
      .daemon(false)
      .debuggable(BuildConfig.DEBUG)
      .processNameSuffix("shell")
      .tag("nexxsensi-shell")
      .version(1)

    Shizuku.bindUserService(args, connection)
    if (!latch.await(12, TimeUnit.SECONDS)) {
      shellBinding = false
      throw IllegalStateException("Não foi possível conectar ao serviço Shizuku.")
    }

    return shellService ?: throw IllegalStateException("Serviço Shizuku indisponível.")
  }

  private fun waitForShellService(): INexxsensiShellService? {
    repeat(20) {
      shellService?.let { return it }
      Thread.sleep(250)
    }

    return null
  }

  private fun buildActionCommands(actionId: String, packageName: String): List<ActionCommand> {
    val safePackage = packageName.takeIf { it.isNotBlank() }
    return when (actionId) {
      "cache" -> listOf(
        ActionCommand("Limpeza de cache", "pm trim-caches 999G")
      )
      "ram" -> listOf(
        ActionCommand("Finalizando processos em segundo plano", "am kill-all")
      )
      "cool" -> listOf(
        ActionCommand("Reduzindo processos em segundo plano", "am kill-all"),
        ActionCommand("Aplicando perfil leve de animação", "settings put global animator_duration_scale 0.5")
      )
      "stutter" -> listOf(
        ActionCommand("Reduzindo animação de janelas", "settings put global window_animation_scale 0.5"),
        ActionCommand("Reduzindo transições", "settings put global transition_animation_scale 0.5"),
        ActionCommand("Reduzindo animador", "settings put global animator_duration_scale 0.5")
      )
      "battery" -> listOf(
        ActionCommand("Finalizando processos ociosos", "am kill-all"),
        ActionCommand("Reduzindo animacoes", "settings put global window_animation_scale 0.5; settings put global transition_animation_scale 0.5; settings put global animator_duration_scale 0.5")
      )
      "profile-economy" -> buildEconomyProfileCommands()
      "profile-balanced" -> buildBalancedProfileCommands(safePackage)
      "profile-performance" -> buildPerformanceProfileCommands(safePackage)
      "game-boost" -> buildList {
        add(ActionCommand("Finalizando processos", "am kill-all"))
        add(ActionCommand("Limpando cache temporario", "pm trim-caches 999G"))
        add(ActionCommand("Reduzindo animacoes", "settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0"))
        if (safePackage != null) {
          add(ActionCommand("Aplicando modo jogo", "cmd game set performance $safePackage || true"))
          add(ActionCommand("Preparando jogo", "cmd package compile -m speed-profile $safePackage || true"))
        }
      }
      "revert" -> listOf(
        ActionCommand("Restaurando animação de janelas", "settings put global window_animation_scale 1"),
        ActionCommand("Restaurando transições", "settings put global transition_animation_scale 1"),
        ActionCommand("Restaurando animador", "settings put global animator_duration_scale 1"),
        ActionCommand("Restaurando bateria adaptativa", "settings put global adaptive_battery_management_enabled 1 || true"),
        ActionCommand("Restaurando apps em espera", "settings put global app_standby_enabled 1 || true"),
        ActionCommand("Restaurando limite de processos", "settings delete global activity_manager_constants || true"),
        ActionCommand("Desativando performance fixa", "cmd power set-fixed-performance-mode-enabled false || true")
      )
      else -> emptyList()
    }
  }

  private fun buildEconomyProfileCommands(): List<ActionCommand> {
    return listOf(
      ActionCommand("Finalizando processos ociosos", "am kill-all"),
      ActionCommand("Limpando cache temporario", "pm trim-caches 999G"),
      ActionCommand("Reduzindo animacoes", "settings put global window_animation_scale 0.5; settings put global transition_animation_scale 0.5; settings put global animator_duration_scale 0.5"),
      ActionCommand("Ativando bateria adaptativa", "settings put global adaptive_battery_management_enabled 1 || true"),
      ActionCommand("Ativando apps em espera", "settings put global app_standby_enabled 1 || true"),
      ActionCommand("Limitando processos em cache", "settings put global activity_manager_constants max_cached_processes=20 || true"),
      ActionCommand("Desativando performance fixa", "cmd power set-fixed-performance-mode-enabled false || true")
    )
  }

  private fun buildBalancedProfileCommands(packageName: String?): List<ActionCommand> {
    return buildList {
      add(ActionCommand("Finalizando processos ociosos", "am kill-all"))
      add(ActionCommand("Limpando cache temporario", "pm trim-caches 999G"))
      add(ActionCommand("Ajustando animacoes", "settings put global window_animation_scale 0.5; settings put global transition_animation_scale 0.5; settings put global animator_duration_scale 0.5"))
      add(ActionCommand("Mantendo bateria adaptativa", "settings put global adaptive_battery_management_enabled 1 || true"))
      add(ActionCommand("Mantendo apps em espera", "settings put global app_standby_enabled 1 || true"))
      add(ActionCommand("Equilibrando cache de processos", "settings put global activity_manager_constants max_cached_processes=32 || true"))
      add(ActionCommand("Desativando performance fixa", "cmd power set-fixed-performance-mode-enabled false || true"))
      if (packageName != null) {
        add(ActionCommand("Otimizando perfil do jogo", "cmd package compile -m speed-profile $packageName || true"))
      }
    }
  }

  private fun buildPerformanceProfileCommands(packageName: String?): List<ActionCommand> {
    return buildList {
      add(ActionCommand("Finalizando processos", "am kill-all"))
      add(ActionCommand("Limpando cache temporario", "pm trim-caches 999G"))
      add(ActionCommand("Removendo animacoes", "settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0"))
      add(ActionCommand("Reduzindo espera de apps", "settings put global app_standby_enabled 0 || true"))
      add(ActionCommand("Reduzindo bateria adaptativa", "settings put global adaptive_battery_management_enabled 0 || true"))
      add(ActionCommand("Priorizando processos ativos", "settings put global activity_manager_constants max_cached_processes=16 || true"))
      add(ActionCommand("Tentando modo performance", "cmd power set-fixed-performance-mode-enabled true || true"))
      if (packageName != null) {
        add(ActionCommand("Aplicando modo jogo", "cmd game set performance $packageName || true"))
        add(ActionCommand("Compilando jogo para resposta", "cmd package compile -m speed-profile $packageName || true"))
      }
    }
  }

  private fun parseShellResult(raw: String): ShellResult {
    val exit = raw.lineSequence()
      .firstOrNull { it.startsWith("exit=") }
      ?.removePrefix("exit=")
      ?.toIntOrNull() ?: -1
    val stdout = raw.substringAfter("stdout=", "").substringBefore("\nstderr=", "")
    val stderr = raw.substringAfter("\nstderr=", "")
    return ShellResult(exit, stdout, stderr)
  }

  private fun parseFpsFromFrameStats(output: String): Double? {
    val frameTimes = output
      .lineSequence()
      .map { line -> line.trim() }
      .filter { line -> line.firstOrNull()?.isDigit() == true }
      .mapNotNull { line ->
        val columns = line.split(",")
        if (columns.size < 14) {
          null
        } else {
          val flags = columns[0].toLongOrNull()
          val intendedVsync = columns[1].toLongOrNull()
          val frameCompleted = columns[13].toLongOrNull()
          if (flags == 0L && intendedVsync != null && frameCompleted != null && frameCompleted > 0L) {
            intendedVsync
          } else {
            null
          }
        }
      }
      .toList()
      .takeLast(120)

    if (frameTimes.size < 2) {
      return null
    }

    val elapsedNanos = frameTimes.last() - frameTimes.first()
    if (elapsedNanos <= 0L) {
      return null
    }

    val fps = ((frameTimes.size - 1).toDouble() * 1_000_000_000.0) / elapsedNanos.toDouble()
    return fps.takeIf { it.isFinite() && it in 1.0..240.0 }
  }

  private fun parseCpuFromTop(output: String): Double? {
    val firstNumber = Regex("""\d+(\.\d+)?""").find(output)?.value?.toDoubleOrNull()
    return firstNumber?.takeIf { it.isFinite() && it in 0.0..1000.0 }
  }

  private fun readThermalTemperature(): Double? {
    val thermalRoot = File("/sys/class/thermal")
    val zones = thermalRoot.listFiles { file -> file.name.startsWith("thermal_zone") } ?: return null

    return zones.asSequence()
      .mapNotNull { zone ->
        val temp = File(zone, "temp")
        if (!temp.exists()) {
          null
        } else {
          temp.readText().trim().toDoubleOrNull()
        }
      }
      .map { value -> if (value > 1000) value / 1000.0 else value }
      .filter { value -> value in 5.0..120.0 }
      .minOrNull()
  }

  private fun usedPercent(total: Long, free: Long): Double {
    if (total <= 0) {
      return 0.0
    }

    return ((total - free).toDouble() / total.toDouble()) * 100.0
  }

  private fun isGameApp(appInfo: ApplicationInfo, packageManager: PackageManager): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && appInfo.category == ApplicationInfo.CATEGORY_GAME) {
      return true
    }

    val label = packageManager.getApplicationLabel(appInfo).toString().lowercase()
    val packageName = appInfo.packageName.lowercase()
    val blockedSignals = listOf(
      "google play jogos",
      "google play games",
      "play games",
      "game launcher",
      "game booster",
      "gaming hub",
      "games hub"
    )
    val blockedPackages = listOf(
      "com.google.android.play.games",
      "com.samsung.android.game.gamehome",
      "com.samsung.android.game.gametools"
    )
    if (blockedSignals.any { signal -> label.contains(signal) } ||
      blockedPackages.any { signal -> packageName == signal }
    ) {
      return false
    }

    val signals = listOf(
      "freefire",
      "pubg",
      "callofduty",
      "cod",
      "roblox",
      "minecraft",
      "fortnite",
      "genshin",
      "mihoyo",
      "hoyoverse",
      "riotgames",
      "tencent",
      "supercell",
      "clash",
      "asphalt",
      "ea.gp",
      "konami",
      "pokemon"
    )

    return signals.any { signal -> label.contains(signal) || packageName.contains(signal) }
  }

  private fun categoryName(appInfo: ApplicationInfo): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return "unknown"
    }

    return when (appInfo.category) {
      ApplicationInfo.CATEGORY_GAME -> "game"
      ApplicationInfo.CATEGORY_AUDIO -> "audio"
      ApplicationInfo.CATEGORY_VIDEO -> "video"
      ApplicationInfo.CATEGORY_IMAGE -> "image"
      ApplicationInfo.CATEGORY_SOCIAL -> "social"
      ApplicationInfo.CATEGORY_NEWS -> "news"
      ApplicationInfo.CATEGORY_MAPS -> "maps"
      ApplicationInfo.CATEGORY_PRODUCTIVITY -> "productivity"
      else -> "unknown"
    }
  }

  private data class ActionCommand(val title: String, val command: String)

  private data class ShellResult(
    val exitCode: Int,
    val stdout: String,
    val stderr: String
  )
}
