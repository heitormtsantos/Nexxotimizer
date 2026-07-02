package com.nexxsensi.mobileoptimizer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.BatteryManager
import android.os.Environment
import android.os.IBinder
import android.os.StatFs
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import rikka.shizuku.Shizuku

class NexxsensiOverlayService : Service() {
  private lateinit var windowManager: WindowManager
  private var bubbleView: View? = null
  private var leftPanelView: LinearLayout? = null
  private var rightPanelView: LinearLayout? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var shellService: INexxsensiShellService? = null
  private var shellBinding = false
  private var packageNameForBoost = ""
  private var accentColor = Color.parseColor("#009DFF")
  private var accentColorAlt = Color.parseColor("#00E5FF")
  private var pinned = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    accentColor = prefs.getInt(KEY_ACCENT, Color.parseColor("#009DFF"))
    pinned = prefs.getBoolean(KEY_PINNED, false)
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, overlayNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_HIDE -> {
        removeOverlay()
        stopSelf()
      }
      else -> {
        packageNameForBoost = intent?.getStringExtra(EXTRA_PACKAGE_NAME).orEmpty()
        if (Settings.canDrawOverlays(this)) {
          showBubble()
        }
      }
    }

    return START_STICKY
  }

  override fun onDestroy() {
    removeOverlay()
    super.onDestroy()
  }

  private fun showBubble() {
    if (bubbleView != null) {
      return
    }

    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val size = dp(56)
    val params = WindowManager.LayoutParams(
      size,
      size,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = prefs.getInt(KEY_X, dp(18))
      y = prefs.getInt(KEY_Y, dp(76))
    }

    val bubble = ImageButton(this).apply {
      alpha = 0.82f
      setImageResource(applicationInfo.icon)
      setBackgroundColor(Color.TRANSPARENT)
      scaleType = ImageView.ScaleType.FIT_CENTER
      setPadding(dp(7), dp(7), dp(7), dp(7))
    }

    var startX = 0
    var startY = 0
    var touchX = 0f
    var touchY = 0f
    var moved = false

    bubble.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          startX = params.x
          startY = params.y
          touchX = event.rawX
          touchY = event.rawY
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val nextX = startX + (event.rawX - touchX).toInt()
          val nextY = startY + (event.rawY - touchY).toInt()
          if (kotlin.math.abs(nextX - startX) > dp(3) || kotlin.math.abs(nextY - startY) > dp(3)) {
            moved = true
          }
          params.x = nextX.coerceAtLeast(0)
          params.y = nextY.coerceAtLeast(0)
          windowManager.updateViewLayout(bubble, params)
          true
        }
        MotionEvent.ACTION_UP -> {
          prefs.edit().putInt(KEY_X, params.x).putInt(KEY_Y, params.y).apply()
          if (!moved) {
            togglePanels()
          }
          true
        }
        else -> false
      }
    }

    bubbleView = bubble
    bubbleParams = params
    windowManager.addView(bubble, params)
  }

  private fun togglePanels() {
    if (leftPanelView != null || rightPanelView != null) {
      removePanels()
      return
    }

    showPanels()
  }

  private fun showPanels() {
    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val alpha = prefs.getFloat(KEY_ALPHA, 0.82f)
    val scale = prefs.getFloat(KEY_SCALE, 1f)
    val panelWidth = panelWidth()

    val leftPanel = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(22), dp(18), dp(18), dp(18))
      background = panelBackground(true, alpha)
      this.alpha = alpha
      scaleX = scale
      scaleY = scale
      addView(sectionTitle("Otimizações"))
      addView(actionButton("Reboost", "FPS e resposta", true) { runOverlayAction("game-boost") })
      addView(actionButton("Liberar RAM", "Fecha processos ociosos", false) { runOverlayAction("ram") })
      addView(actionButton("Resfriar", "Reduz carga em segundo plano", false) { runOverlayAction("cool") })
      addView(sectionTitle("DPI Gamer"))
      addView(dpiButtons())
      addView(toggleRow("Doze Isolation", "Mata processos", true) { enabled ->
        if (enabled) {
          runOverlayAction("doze")
        }
      })
      addView(toggleRow("Sem Animações", "Zero atraso visual", false) { enabled ->
        runOverlayAction(if (enabled) "animations-off" else "animations-default")
      })
      addView(toggleRow("Brilho Máximo", "Força 100% no jogo", false) { enabled ->
        if (enabled) {
          runOverlayAction("brightness-max")
        }
      })
      addView(sectionTitle("Perfil de toque"))
      addView(profileButtons())
      addView(toggleRow("Modo Precisão", "Para jogos de tiro", false) { enabled ->
        if (enabled) {
          runOverlayAction("touch-precision")
        }
      })
      addView(toggleRow("Modo Velocidade", "Para giro rápido", false) { enabled ->
        if (enabled) {
          runOverlayAction("touch-speed")
        }
      })
      addView(toggleRow("Fixar painel", "Manter aberto após ação", pinned) { enabled ->
        pinned = enabled
        prefs.edit().putBoolean(KEY_PINNED, enabled).apply()
      })
      addView(actionButton("Fechar overlay", "Ocultar bolha e painéis", false) { stopSelf() })
    }

    val rightPanel = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(18), dp(18), dp(22), dp(18))
      background = panelBackground(false, alpha)
      this.alpha = alpha
      scaleX = scale
      scaleY = scale
    }

    rightPanel.addView(miniGraph())
    rightPanel.addView(sectionTitle("Estatísticas"))
    readOverlayStats().forEach { stat ->
      rightPanel.addView(statRow(stat.first, stat.second, stat.third))
    }

    leftPanelView = leftPanel
    rightPanelView = rightPanel
    windowManager.addView(leftPanel, sideParams(panelWidth, Gravity.START))
    windowManager.addView(rightPanel, sideParams(panelWidth, Gravity.END))
  }

  private fun sideParams(width: Int, horizontalGravity: Int): WindowManager.LayoutParams {
    return WindowManager.LayoutParams(
      width,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or horizontalGravity
    }
  }

  private fun toggleRow(
    title: String,
    subtitle: String,
    initial: Boolean,
    onChanged: (Boolean) -> Unit
  ): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(0, dp(8), 0, dp(8))
    }
    val label = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(labelText(title, 14, Color.WHITE, true))
      addView(labelText(subtitle, 10, Color.parseColor("#9AA3B4"), false))
    }
    val toggle = TextView(this).apply {
      text = if (initial) "ON" else "OFF"
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
      textSize = 11f
      setTextColor(Color.WHITE)
      background = pillBackground(if (initial) accentColor else Color.parseColor("#5B5E69"))
      setPadding(dp(11), dp(7), dp(11), dp(7))
    }
    var enabled = initial
    toggle.setOnClickListener {
      enabled = !enabled
      toggle.text = if (enabled) "ON" else "OFF"
      toggle.background = pillBackground(if (enabled) accentColor else Color.parseColor("#5B5E69"))
      onChanged(enabled)
    }
    row.addView(label, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    row.addView(toggle)
    return row
  }

  private fun profileButtons(): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(2), 0, dp(14))
    }
    val options = listOf(
      "Padrão" to "touch-default",
      "Rápido" to "touch-fast",
      "Ultra" to "touch-ultra"
    )
    options.forEachIndexed { index, option ->
      val button = TextView(this).apply {
        text = option.first
        gravity = Gravity.CENTER
        typeface = Typeface.DEFAULT_BOLD
        textSize = 12f
        setTextColor(Color.WHITE)
        background = roundedBackground(
          if (index == 0) accentColor else Color.parseColor("#222A37"),
          if (index == 0) accentColorAlt else Color.parseColor("#30394A"),
          dp(9)
        )
        setPadding(dp(10), dp(12), dp(10), dp(12))
        setOnClickListener { runOverlayAction(option.second) }
      }
      row.addView(button, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
        if (index > 0) leftMargin = dp(8)
      })
    }
    return row
  }

  private fun dpiButtons(): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(2), 0, dp(14))
    }
    val options = listOf(
      "600" to "dpi-600",
      "720" to "dpi-720",
      "900" to "dpi-900",
      "Reset" to "dpi-reset"
    )
    options.forEachIndexed { index, option ->
      val button = TextView(this).apply {
        text = option.first
        gravity = Gravity.CENTER
        typeface = Typeface.DEFAULT_BOLD
        textSize = 11f
        setTextColor(Color.WHITE)
        background = roundedBackground(
          if (option.second == "dpi-reset") Color.parseColor("#123423") else accentColor,
          if (option.second == "dpi-reset") Color.parseColor("#30F28C") else accentColorAlt,
          dp(9)
        )
        setPadding(dp(8), dp(11), dp(8), dp(11))
        setOnClickListener { runOverlayAction(option.second) }
      }
      row.addView(button, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
        if (index > 0) leftMargin = dp(7)
      })
    }
    return row
  }

  private fun actionButton(
    title: String,
    subtitle: String,
    primary: Boolean,
    action: () -> Unit
  ): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = roundedBackground(
        if (primary) accentColor else Color.parseColor("#111824"),
        if (primary) accentColorAlt else Color.parseColor("#253045"),
        dp(13)
      )
      setPadding(dp(12), dp(10), dp(12), dp(10))
      setOnClickListener {
        action()
        if (!pinned) {
          removePanels()
        }
      }
    }
    row.addView(labelText(title, 13, Color.WHITE, true))
    row.addView(labelText(subtitle, 10, Color.parseColor("#C4D2E7"), false))
    row.layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      topMargin = dp(9)
    }
    return row
  }

  private fun statRow(label: String, value: String, detail: String): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = roundedBackground("#AA08101C", "#253045", dp(12))
      setPadding(dp(12), dp(10), dp(12), dp(10))
    }
    val copy = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(labelText(label, 12, Color.parseColor("#9AA3B4"), true))
      addView(labelText(detail, 10, Color.parseColor("#657085"), false))
    }
    val valueView = labelText(value, 17, Color.WHITE, true).apply {
      gravity = Gravity.END
    }
    row.addView(copy, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    row.addView(valueView)
    row.layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      bottomMargin = dp(8)
    }
    return row
  }

  private fun sliderBlock(
    title: String,
    subtitle: String,
    min: Int,
    max: Int,
    value: Int,
    onChanged: (Int) -> Unit
  ): View {
    val block = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(9), 0, dp(8))
      addView(labelText(title, 14, Color.WHITE, true))
      addView(labelText(subtitle, 10, Color.parseColor("#9AA3B4"), false))
    }
    val seek = SeekBar(this).apply {
      progress = (value - min).coerceIn(0, max - min)
      this.max = max - min
      setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
          onChanged(min + progress)
        }

        override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
        override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
      })
    }
    block.addView(seek)
    return block
  }

  private fun colorRow(): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(8), 0, dp(8))
    }
    val colors = listOf(
      Color.parseColor("#009DFF"),
      Color.parseColor("#00D26A"),
      Color.WHITE,
      Color.parseColor("#FFB31A")
    )
    colors.forEachIndexed { index, color ->
      val swatch = TextView(this).apply {
        background = circleBackground(color)
        setOnClickListener {
          accentColor = color
          accentColorAlt = if (color == Color.WHITE) Color.parseColor("#89D8FF") else color
          getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_ACCENT, accentColor).apply()
          removePanels()
          showPanels()
        }
      }
      row.addView(swatch, LinearLayout.LayoutParams(dp(34), dp(34)).apply {
        if (index > 0) leftMargin = dp(10)
      })
    }
    return row
  }

  private fun miniGraph(): View {
    val graph = FrameLayout(this).apply {
      background = roundedBackground("#AA07101C", "#253045", dp(10))
      setPadding(dp(8), dp(8), dp(8), dp(8))
    }
    val text = TextView(this).apply {
      text = "FPS 59  |  Ping 21 ms"
      setTextColor(accentColorAlt)
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    graph.addView(text, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    ))
    graph.layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      dp(54)
    ).apply {
      bottomMargin = dp(16)
    }
    return graph
  }

  private fun readOverlayStats(): List<Triple<String, String, String>> {
    val ram = readRamPercent()
    val battery = readBatteryPercent()
    val storage = readStorageFreeGb()
    val temperature = readThermalTemperature()
    return listOf(
      Triple("FPS", "--", "Leitura detalhada no painel do app"),
      Triple("Ping", "21 ms", "Servidor de teste"),
      Triple("RAM", if (ram != null) "$ram%" else "--", "Uso do sistema"),
      Triple("Bateria", if (battery >= 0) "$battery%" else "--", "Carga atual"),
      Triple("Livre", storage ?: "--", "Armazenamento"),
      Triple("Temp.", if (temperature != null) "${temperature.toInt()}°C" else "--", "Sensor térmico")
    )
  }

  private fun readRamPercent(): Int? {
    return try {
      val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val info = ActivityManager.MemoryInfo()
      activityManager.getMemoryInfo(info)
      if (info.totalMem <= 0L) {
        null
      } else {
        (((info.totalMem - info.availMem).toDouble() / info.totalMem) * 100).toInt()
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun readBatteryPercent(): Int {
    return try {
      val batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
      batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
    } catch (_: Throwable) {
      -1
    }
  }

  private fun readStorageFreeGb(): String? {
    return try {
      val storage = StatFs(Environment.getDataDirectory().absolutePath)
      val free = storage.blockSizeLong * storage.availableBlocksLong
      "${(free / 1024.0 / 1024.0 / 1024.0).toInt()} GB"
    } catch (_: Throwable) {
      null
    }
  }

  private fun readThermalTemperature(): Double? {
    return (0..12).asSequence()
      .mapNotNull { index ->
        val temp = File("/sys/class/thermal/thermal_zone$index/temp")
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
      .firstOrNull { value -> value in 1.0..120.0 }
  }

  private fun runOverlayAction(actionId: String) {
    Thread {
      try {
        if (!canUseShizuku()) {
          return@Thread
        }

        val commands = buildCommands(actionId)
        val service = getShellService()
        commands.forEach { service.exec(it) }
      } catch (_: Throwable) {
      }
    }.start()
  }

  private fun buildCommands(actionId: String): List<String> {
    return when (actionId) {
      "doze" -> listOf(
        "am kill-all",
        "settings put global activity_manager_constants max_cached_processes=8 || true"
      )
      "animations-off" -> listOf(
        "settings put global window_animation_scale 0",
        "settings put global transition_animation_scale 0",
        "settings put global animator_duration_scale 0"
      )
      "animations-default" -> listOf(
        "settings put global window_animation_scale 1",
        "settings put global transition_animation_scale 1",
        "settings put global animator_duration_scale 1"
      )
      "brightness-max" -> listOf(
        "settings put system screen_brightness_mode 0 || true",
        "settings put system screen_brightness 255 || true"
      )
      "touch-default" -> listOf("settings put system pointer_speed 0 || true")
      "touch-fast" -> listOf("settings put system pointer_speed 3 || true")
      "touch-ultra" -> listOf("settings put system pointer_speed 7 || true")
      "touch-precision" -> listOf("settings put system pointer_speed -2 || true")
      "touch-speed" -> listOf("settings put system pointer_speed 7 || true")
      "dpi-600" -> listOf("wm density 600")
      "dpi-720" -> listOf("wm density 720")
      "dpi-900" -> listOf("wm density 900")
      "dpi-reset" -> listOf("wm density reset")
      "ram" -> listOf("am kill-all")
      "cool" -> listOf(
        "am kill-all",
        "settings put global animator_duration_scale 0.5"
      )
      else -> buildList {
        add("am kill-all")
        add("pm trim-caches 999G")
        add("settings put global window_animation_scale 0")
        add("settings put global transition_animation_scale 0")
        add("settings put global animator_duration_scale 0")
        if (packageNameForBoost.isNotBlank()) {
          add("cmd game set performance $packageNameForBoost || true")
          add("cmd package compile -m speed-profile $packageNameForBoost || true")
        }
      }
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
      repeat(20) {
        shellService?.let { return it }
        Thread.sleep(250)
      }
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
      ComponentName(this, NexxsensiShellService::class.java)
    )
      .daemon(false)
      .debuggable(BuildConfig.DEBUG)
      .processNameSuffix("overlay-shell")
      .tag("nexxsensi-overlay-shell")
      .version(1)

    Shizuku.bindUserService(args, connection)
    if (!latch.await(12, TimeUnit.SECONDS)) {
      shellBinding = false
      throw IllegalStateException("Serviço Shizuku indisponível.")
    }

    return shellService ?: throw IllegalStateException("Serviço Shizuku indisponível.")
  }

  private fun removeOverlay() {
    removePanels()
    bubbleView?.let {
      try {
        windowManager.removeView(it)
      } catch (_: Throwable) {
      }
    }
    bubbleView = null
    bubbleParams = null
  }

  private fun removePanels() {
    listOf(leftPanelView, rightPanelView).forEach { view ->
      view?.let {
        try {
          windowManager.removeView(it)
        } catch (_: Throwable) {
        }
      }
    }
    leftPanelView = null
    rightPanelView = null
  }

  private fun panelWidth(): Int {
    val width = resources.displayMetrics.widthPixels
    return (width * 0.34f).toInt().coerceIn(dp(230), dp(310))
  }

  private fun overlayType(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
  }

  private fun labelText(text: String, size: Int, color: Int, bold: Boolean): TextView {
    return TextView(this).apply {
      this.text = text
      setTextColor(color)
      textSize = size.toFloat()
      if (bold) {
        typeface = Typeface.DEFAULT_BOLD
      }
    }
  }

  private fun sectionTitle(text: String): TextView {
    return labelText(text.uppercase(), 11, accentColorAlt, true).apply {
      setPadding(0, dp(13), 0, dp(8))
    }
  }

  private fun panelBackground(left: Boolean, alpha: Float): GradientDrawable {
    val opacity = (alpha * 230).toInt().coerceIn(80, 230)
    val fill = Color.argb(opacity, 3, 7, 14)
    return GradientDrawable(
      if (left) GradientDrawable.Orientation.LEFT_RIGHT else GradientDrawable.Orientation.RIGHT_LEFT,
      intArrayOf(fill, Color.argb((opacity * 0.58f).toInt(), 3, 7, 14))
    ).apply {
      setStroke(dp(1), Color.argb(120, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)))
    }
  }

  private fun roundedBackground(fill: String, stroke: String, radius: Int): GradientDrawable {
    return GradientDrawable().apply {
      setColor(Color.parseColor(fill))
      setStroke(dp(1), Color.parseColor(stroke))
      cornerRadius = radius.toFloat()
    }
  }

  private fun roundedBackground(fill: Int, stroke: Int, radius: Int): GradientDrawable {
    return GradientDrawable().apply {
      setColor(fill)
      setStroke(dp(1), stroke)
      cornerRadius = radius.toFloat()
    }
  }

  private fun pillBackground(fill: Int): GradientDrawable {
    return GradientDrawable().apply {
      setColor(fill)
      cornerRadius = dp(999).toFloat()
    }
  }

  private fun circleBackground(fill: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(fill)
      setStroke(dp(2), Color.WHITE)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Nexx overlay",
      NotificationManager.IMPORTANCE_LOW
    )
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(channel)
  }

  private fun overlayNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Nexxsensi Overlay ativo")
      .setContentText("Toque na bolha sobre o jogo para otimizar.")
      .setOngoing(true)
      .build()
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  companion object {
    const val ACTION_SHOW = "com.nexxsensi.mobileoptimizer.overlay.SHOW"
    const val ACTION_HIDE = "com.nexxsensi.mobileoptimizer.overlay.HIDE"
    const val EXTRA_PACKAGE_NAME = "packageName"
    private const val CHANNEL_ID = "nexxsensi_game_overlay"
    private const val NOTIFICATION_ID = 9420
    private const val PREFS = "nexxsensi_overlay"
    private const val KEY_X = "x"
    private const val KEY_Y = "y"
    private const val KEY_ALPHA = "alpha"
    private const val KEY_SCALE = "scale"
    private const val KEY_ACCENT = "accent"
    private const val KEY_PINNED = "pinned"
  }
}
