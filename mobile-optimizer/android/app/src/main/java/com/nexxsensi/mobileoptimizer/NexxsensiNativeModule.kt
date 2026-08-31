package com.nexxsensi.mobileoptimizer

import android.Manifest
import android.app.ActivityManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.os.StatFs
import android.provider.Settings
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import rikka.shizuku.Shizuku

class NexxsensiNativeModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private val shizukuPermissionRequestCode = 777
  private val notificationPermissionRequestCode = 778
  private var shellService: INexxsensiShellService? = null
  private var shellBinding = false
  private var pendingShizukuPermissionPromise: Promise? = null
  private var pendingNotificationPermissionPromise: Promise? = null
  private val notificationPermissionListener = PermissionListener { requestCode, _, grantResults ->
    if (requestCode != notificationPermissionRequestCode) {
      return@PermissionListener false
    }

    val promise = pendingNotificationPermissionPromise ?: return@PermissionListener true
    pendingNotificationPermissionPromise = null
    promise.resolve(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
    true
  }
  private val shizukuPermissionListener =
    Shizuku.OnRequestPermissionResultListener { requestCode, grantResult ->
      if (requestCode != shizukuPermissionRequestCode) {
        return@OnRequestPermissionResultListener
      }

      val promise = pendingShizukuPermissionPromise ?: return@OnRequestPermissionResultListener
      pendingShizukuPermissionPromise = null
      promise.resolve(grantResult == PackageManager.PERMISSION_GRANTED)
    }

  override fun getName(): String = "NexxsensiNative"

  override fun initialize() {
    super.initialize()
    try {
      Shizuku.addRequestPermissionResultListener(shizukuPermissionListener)
    } catch (_: Throwable) {
    }
  }

  override fun invalidate() {
    try {
      Shizuku.removeRequestPermissionResultListener(shizukuPermissionListener)
    } catch (_: Throwable) {
    }
    pendingShizukuPermissionPromise?.reject(
      "shizuku_permission_cancelled",
      "Solicitação de permissão cancelada."
    )
    pendingShizukuPermissionPromise = null
    pendingNotificationPermissionPromise?.reject(
      "notification_permission_cancelled",
      "Solicitação de notificação cancelada."
    )
    pendingNotificationPermissionPromise = null
    super.invalidate()
  }

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
        .distinctBy { it.activityInfo.packageName }
        .filter { isGameApp(it.activityInfo.applicationInfo, packageManager) }
        .sortedBy { appLabel(it, packageManager).lowercase() }
        .forEach { resolveInfo ->
          games.pushMap(appMap(resolveInfo, packageManager))
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
        .distinctBy { it.activityInfo.packageName }
        .filter { it.activityInfo.packageName != reactContext.packageName }
        .sortedWith(
          compareByDescending<ResolveInfo> { isGameApp(it.activityInfo.applicationInfo, packageManager) }
            .thenBy { appLabel(it, packageManager).lowercase() }
        )
        .forEach { resolveInfo ->
          apps.pushMap(appMap(resolveInfo, packageManager))
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
  fun copyTextToClipboard(text: String, promise: Promise) {
    try {
      val clipboard = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("Código do HUD", text))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("clipboard_failed", error.message, error)
    }
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    try {
      promise.resolve(Settings.canDrawOverlays(reactContext))
    } catch (error: Exception) {
      promise.reject("overlay_status_failed", error.message, error)
    }
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        android.net.Uri.parse("package:${reactContext.packageName}")
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("overlay_settings_failed", error.message, error)
    }
  }

  @ReactMethod
  fun startGameOverlay(packageName: String?, promise: Promise) {
    try {
      if (!Settings.canDrawOverlays(reactContext)) {
        promise.reject("overlay_permission_required", "Permita sobrepor a outros apps.")
        return
      }

      val intent = Intent(reactContext, NexxsensiOverlayService::class.java).apply {
        action = NexxsensiOverlayService.ACTION_SHOW
        putExtra(NexxsensiOverlayService.EXTRA_PACKAGE_NAME, packageName.orEmpty())
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("overlay_start_failed", error.message, error)
    }
  }

  @ReactMethod
  fun stopGameOverlay(promise: Promise) {
    try {
      val intent = Intent(reactContext, NexxsensiOverlayService::class.java).apply {
        action = NexxsensiOverlayService.ACTION_HIDE
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("overlay_stop_failed", error.message, error)
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

      pendingShizukuPermissionPromise?.reject(
        "shizuku_permission_replaced",
        "Uma nova solicitação de permissão foi iniciada."
      )
      pendingShizukuPermissionPromise = promise
      Shizuku.requestPermission(shizukuPermissionRequestCode)
    } catch (error: Throwable) {
      if (pendingShizukuPermissionPromise === promise) {
        pendingShizukuPermissionPromise = null
      }
      promise.reject("shizuku_permission_failed", error.message, error)
    }
  }

  @ReactMethod
  fun requestNotificationPermission(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.resolve(true)
        return
      }

      if (
        reactContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
      ) {
        promise.resolve(true)
        return
      }

      val activity = reactContext.currentActivity
      if (activity !is PermissionAwareActivity) {
        promise.resolve(false)
        return
      }

      pendingNotificationPermissionPromise?.reject(
        "notification_permission_replaced",
        "Uma nova solicitação de notificação foi iniciada."
      )
      pendingNotificationPermissionPromise = promise
      activity.requestPermissions(
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        notificationPermissionRequestCode,
        notificationPermissionListener
      )
    } catch (error: Throwable) {
      if (pendingNotificationPermissionPromise === promise) {
        pendingNotificationPermissionPromise = null
      }
      promise.reject("notification_permission_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getDeviceMetrics(promise: Promise) {
    try {
      val metrics = WritableNativeMap()
      val memoryInfo = try {
        val activityManager = reactContext.getSystemService(
          Context.ACTIVITY_SERVICE
        ) as ActivityManager
        ActivityManager.MemoryInfo().also { activityManager.getMemoryInfo(it) }
      } catch (_: Throwable) {
        null
      }
      val storageInfo = try {
        val storage = StatFs(Environment.getDataDirectory().absolutePath)
        val totalStorage = storage.blockSizeLong * storage.blockCountLong
        val freeStorage = storage.blockSizeLong * storage.availableBlocksLong
        totalStorage to freeStorage
      } catch (_: Throwable) {
        0L to 0L
      }
      val batteryPercent = try {
        val batteryManager = reactContext.getSystemService(
          Context.BATTERY_SERVICE
        ) as BatteryManager
        batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
      } catch (_: Throwable) {
        0
      }
      val temperature = readThermalTemperature()

      metrics.putDouble("ramTotalBytes", (memoryInfo?.totalMem ?: 0L).toDouble())
      metrics.putDouble("ramAvailableBytes", (memoryInfo?.availMem ?: 0L).toDouble())
      metrics.putDouble(
        "ramUsedPercent",
        usedPercent(memoryInfo?.totalMem ?: 0L, memoryInfo?.availMem ?: 0L)
      )
      metrics.putDouble("storageTotalBytes", storageInfo.first.toDouble())
      metrics.putDouble("storageFreeBytes", storageInfo.second.toDouble())
      metrics.putDouble("storageUsedPercent", usedPercent(storageInfo.first, storageInfo.second))
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
        val target = host.ifBlank { "1.1.1.1" }
        val started = System.nanoTime()
        Socket().use { socket ->
          socket.connect(InetSocketAddress(target, 443), 2500)
        }
        val elapsedMs = (System.nanoTime() - started) / 1_000_000
        val result = WritableNativeMap()
        result.putBoolean("ok", true)
        result.putInt("latencyMs", elapsedMs.toInt())
        result.putString("host", target)
        promise.resolve(result)
    } catch (error: Exception) {
        val result = WritableNativeMap()
        result.putBoolean("ok", false)
        result.putInt("latencyMs", 0)
        result.putString("host", host.ifBlank { "1.1.1.1" })
        promise.resolve(result)
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

  private fun isPackageInstalled(packageName: String): Boolean {
    return try {
      reactContext.packageManager.getPackageInfo(packageName, 0)
      true
    } catch (_: PackageManager.NameNotFoundException) {
      false
    }
  }

  private fun appMap(resolveInfo: ResolveInfo, packageManager: PackageManager): WritableNativeMap {
    val appInfo = resolveInfo.activityInfo.applicationInfo
    val item = WritableNativeMap()
    item.putString("packageName", appInfo.packageName)
    item.putString("label", appLabel(resolveInfo, packageManager))
    item.putString("category", categoryName(appInfo))
    item.putBoolean("system", (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
    item.putBoolean("game", isGameApp(appInfo, packageManager))
    item.putString("icon", iconDataUri(resolveInfo.loadIcon(packageManager)))
    return item
  }

  private fun appLabel(resolveInfo: ResolveInfo, packageManager: PackageManager): String {
    val loadedLabel = resolveInfo.loadLabel(packageManager)?.toString()?.trim()
    if (!loadedLabel.isNullOrBlank()) {
      return loadedLabel
    }

    val appLabel = packageManager.getApplicationLabel(resolveInfo.activityInfo.applicationInfo)
      ?.toString()
      ?.trim()
    return appLabel?.takeIf { it.isNotBlank() } ?: resolveInfo.activityInfo.packageName
  }

  private fun iconDataUri(drawable: Drawable?): String? {
    if (drawable == null) {
      return null
    }

    return try {
      val bitmap = when (drawable) {
        is BitmapDrawable -> drawable.bitmap
        else -> {
          val width = drawable.intrinsicWidth.takeIf { it > 0 } ?: 96
          val height = drawable.intrinsicHeight.takeIf { it > 0 } ?: 96
          val created = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          val canvas = Canvas(created)
          drawable.setBounds(0, 0, canvas.width, canvas.height)
          drawable.draw(canvas)
          created
        }
      }
      val scaled = Bitmap.createScaledBitmap(bitmap, 96, 96, true)
      val stream = ByteArrayOutputStream()
      scaled.compress(Bitmap.CompressFormat.PNG, 90, stream)
      "data:image/png;base64,${Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)}"
    } catch (_: Throwable) {
      null
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
    val freeFireSafeMode = isFreeFirePackage(safePackage)
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
      "dpi-600" -> listOf(
        ActionCommand("Aplicando DPI 600", densityForSmallestWidthCommand(600))
      )
      "dpi-720" -> listOf(
        ActionCommand("Aplicando DPI 720", densityForSmallestWidthCommand(720))
      )
      "dpi-900" -> listOf(
        ActionCommand("Aplicando DPI 900", densityForSmallestWidthCommand(900))
      )
      "dpi-reset" -> listOf(
        ActionCommand("Restaurando DPI padrão", "wm density reset")
      )
      "profile-economy" -> buildEconomyProfileCommands()
      "profile-balanced" -> buildBalancedProfileCommands(safePackage)
      "profile-performance" -> buildPerformanceProfileCommands(safePackage)
      "game-boost" -> buildList {
        add(ActionCommand("Finalizando processos", "am kill-all"))
        add(ActionCommand("Limpando cache temporario", "pm trim-caches 999G"))
        if (freeFireSafeMode) {
          add(ActionCommand("Modo seguro Free Fire ativo", "true"))
          return@buildList
        }
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

  private fun densityForSmallestWidthCommand(targetDp: Int): String {
    return "sh -c 'size=\$(wm size | sed -n \"s/.*Physical size: //p\" | head -n 1); " +
      "w=\${size%x*}; h=\${size#*x}; short=\$w; " +
      "if [ \"\$h\" -lt \"\$w\" ]; then short=\$h; fi; " +
      "density=\$((short * 160 / $targetDp)); " +
      "if [ \"\$density\" -lt 120 ]; then density=120; fi; " +
      "if [ \"\$density\" -gt 640 ]; then density=640; fi; " +
      "wm density \$density'"
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
      if (packageName != null && !isFreeFirePackage(packageName)) {
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
      if (packageName != null && !isFreeFirePackage(packageName)) {
        add(ActionCommand("Aplicando modo jogo", "cmd game set performance $packageName || true"))
        add(ActionCommand("Compilando jogo para resposta", "cmd package compile -m speed-profile $packageName || true"))
      }
    }
  }

  private fun isFreeFirePackage(packageName: String?): Boolean {
    val normalized = packageName?.lowercase().orEmpty()
    return normalized == "com.dts.freefireth" ||
      normalized == "com.dts.freefiremax" ||
      normalized.contains("freefire")
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
          try {
            temp.readText().trim().toDoubleOrNull()
          } catch (_: Throwable) {
            null
          }
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


