package com.nexxsensi.mobileoptimizer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.media.MediaScannerConnection
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.File
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import androidx.core.content.FileProvider

private data class SavedReplay(
  val uri: Uri,
  val displayName: String
)

class NexxsensiReplayService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var mediaProjection: MediaProjection? = null
  private var mediaRecorder: MediaRecorder? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var currentSegment: File? = null
  private val segments = ArrayDeque<File>()
  private var isRecording = false
  private var width = 1280
  private var height = 720
  private var density = 1

  private val projectionCallback = object : MediaProjection.Callback() {
    override fun onStop() {
      stopReplay(false)
    }
  }

  private val autoSaveRunnable = object : Runnable {
    override fun run() {
      if (!isRecording) {
        return
      }
      saveReplay()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    updateDisplayMetrics()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      when (intent?.action) {
        ACTION_START -> {
          val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
          val resultData = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
          if (resultCode != 0 && resultData != null) {
            startReplay(resultCode, resultData)
          }
        }
        ACTION_SAVE -> saveReplay()
        ACTION_OPEN_LAST -> openLastReplay()
        ACTION_SHARE_LAST -> shareLastReplay()
        ACTION_STOP -> stopReplay(true)
      }
    } catch (_: Throwable) {
      stopReplay(true)
    }

    return START_STICKY
  }

  override fun onDestroy() {
    stopReplay(false)
    super.onDestroy()
  }

  private fun startReplay(resultCode: Int, data: Intent) {
    if (isRecording) {
      return
    }

    startForegroundCompat(replayNotification("Replay dos ÃƒÂºltimos 3 min ativo"))
    val projectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    mediaProjection = projectionManager.getMediaProjection(resultCode, data)?.apply {
      registerCallback(projectionCallback, handler)
    }
    isRecording = true
    startNewSegment()
    handler.postDelayed(autoSaveRunnable, MAX_REPLAY_MS)
  }

  private fun startNewSegment() {
    val projection = mediaProjection ?: return
    val file = File(tempDir(), "segment_${System.currentTimeMillis()}.mp4")
    file.parentFile?.mkdirs()
    currentSegment = file

    val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      MediaRecorder(this)
    } else {
      @Suppress("DEPRECATION")
      MediaRecorder()
    }

    recorder.apply {
      setVideoSource(MediaRecorder.VideoSource.SURFACE)
      setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      setOutputFile(file.absolutePath)
      setVideoEncoder(MediaRecorder.VideoEncoder.H264)
      setVideoEncodingBitRate(4_500_000)
      setVideoFrameRate(30)
      setVideoSize(width, height)
      prepare()
    }

    mediaRecorder = recorder
    virtualDisplay = projection.createVirtualDisplay(
      "NexxsensiReplay",
      width,
      height,
      density,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      recorder.surface,
      null,
      null
    )
    recorder.start()
  }

  private fun stopCurrentSegment() {
    try {
      mediaRecorder?.stop()
      currentSegment?.takeIf { it.exists() && it.length() > 0L }?.let { segments.addLast(it) }
    } catch (_: Throwable) {
      currentSegment?.delete()
    } finally {
      try {
        mediaRecorder?.reset()
        mediaRecorder?.release()
      } catch (_: Throwable) {
      }
      try {
        virtualDisplay?.release()
      } catch (_: Throwable) {
      }
      mediaRecorder = null
      virtualDisplay = null
      currentSegment = null
    }
  }

  private fun pruneOldSegments() {
    while (segments.size > 1) {
      segments.removeFirstOrNull()?.delete()
    }
  }

  private fun saveReplay() {
    if (!isRecording) {
      return
    }

    stopCurrentSegment()
    pruneOldSegments()
    val sourceFile = segments.lastOrNull()
    if (sourceFile == null || !sourceFile.exists() || sourceFile.length() <= 0L) {
      stopReplay(true)
      return
    }

    val savedReplay = saveReplayToGallery(sourceFile)

    startForegroundCompat(
      replayNotification(
        if (savedReplay != null) {
          "Replay salvo na galeria: ${savedReplay.displayName}"
        } else {
          "Nao foi possivel salvar o replay"
        }
      )
    )
    stopReplay(false)
  }

  private fun saveReplayToGallery(sourceFile: File): SavedReplay? {
    val displayName = "replay_${timestamp()}.mp4"
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      saveReplayWithMediaStore(sourceFile, displayName)
    } else {
      saveReplayToPublicMovies(sourceFile, displayName)
    }
  }

  private fun saveReplayWithMediaStore(sourceFile: File, displayName: String): SavedReplay? {
    val values = ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
      put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
      put(MediaStore.Video.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/Nexxsensi_Replays")
      put(MediaStore.Video.Media.IS_PENDING, 1)
    }
    val collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val uri = contentResolver.insert(collection, values) ?: return null

    return try {
      contentResolver.openOutputStream(uri)?.use { output ->
        sourceFile.inputStream().use { input -> input.copyTo(output) }
      } ?: throw IllegalStateException("Nao foi possivel abrir o arquivo de destino.")

      values.clear()
      values.put(MediaStore.Video.Media.IS_PENDING, 0)
      contentResolver.update(uri, values, null, null)
      saveLastReplay(uri.toString())
      SavedReplay(uri, displayName)
    } catch (_: Throwable) {
      contentResolver.delete(uri, null, null)
      null
    }
  }

  private fun saveReplayToPublicMovies(sourceFile: File, displayName: String): SavedReplay? {
    val directory = File(
      Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES),
      "Nexxsensi_Replays"
    )
    directory.mkdirs()
    val outputFile = File(directory, displayName)

    return try {
      sourceFile.copyTo(outputFile, overwrite = true)
      MediaScannerConnection.scanFile(
        this,
        arrayOf(outputFile.absolutePath),
        arrayOf("video/mp4"),
        null
      )
      saveLastReplay(outputFile.absolutePath)
      SavedReplay(replayUri(outputFile), displayName)
    } catch (_: Throwable) {
      outputFile.delete()
      null
    }
  }

  private fun mergeSegmentsToSingleVideo(inputSegments: List<File>, outputFile: File) {
    val validSegments = inputSegments.filter { it.exists() && it.length() > 0L }
    if (validSegments.isEmpty()) {
      throw IllegalStateException("Nenhum segmento de replay disponÃƒÂ­vel.")
    }

    val firstExtractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    try {
      firstExtractor.setDataSource(validSegments.first().absolutePath)
      val sourceTrack = findVideoTrack(firstExtractor)
      if (sourceTrack < 0) {
        throw IllegalStateException("Replay sem faixa de vÃƒÂ­deo.")
      }

      val format = firstExtractor.getTrackFormat(sourceTrack)
      firstExtractor.release()

      muxer = MediaMuxer(
        outputFile.absolutePath,
        MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
      )
      val outputTrack = muxer.addTrack(format)
      muxer.start()

      var presentationOffsetUs = 0L
      validSegments.forEach { segment ->
        presentationOffsetUs = appendSegment(segment, muxer, outputTrack, presentationOffsetUs)
      }
    } finally {
      try {
        firstExtractor.release()
      } catch (_: Throwable) {
      }
      try {
        muxer?.stop()
      } catch (_: Throwable) {
      }
      try {
        muxer?.release()
      } catch (_: Throwable) {
      }
    }
  }

  private fun appendSegment(
    segment: File,
    muxer: MediaMuxer,
    outputTrack: Int,
    presentationOffsetUs: Long
  ): Long {
    val extractor = MediaExtractor()
    val buffer = ByteBuffer.allocateDirect(2 * 1024 * 1024)
    val info = MediaCodec.BufferInfo()
    var lastSampleTimeUs = presentationOffsetUs

    try {
      extractor.setDataSource(segment.absolutePath)
      val videoTrack = findVideoTrack(extractor)
      if (videoTrack < 0) {
        return presentationOffsetUs
      }

      extractor.selectTrack(videoTrack)
      while (true) {
        info.offset = 0
        info.size = extractor.readSampleData(buffer, 0)
        if (info.size < 0) {
          break
        }

        val sampleTime = extractor.sampleTime.coerceAtLeast(0L)
        info.presentationTimeUs = presentationOffsetUs + sampleTime
        info.flags = extractor.sampleFlags
        muxer.writeSampleData(outputTrack, buffer, info)
        lastSampleTimeUs = info.presentationTimeUs
        extractor.advance()
      }
    } finally {
      extractor.release()
    }

    return lastSampleTimeUs + FRAME_DURATION_US
  }

  private fun findVideoTrack(extractor: MediaExtractor): Int {
    for (index in 0 until extractor.trackCount) {
      val format = extractor.getTrackFormat(index)
      val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
      if (mime.startsWith("video/")) {
        return index
      }
    }

    return -1
  }

  private fun stopReplay(removeTemp: Boolean) {
    isRecording = false
    handler.removeCallbacks(autoSaveRunnable)
    stopCurrentSegment()
    try {
      mediaProjection?.unregisterCallback(projectionCallback)
    } catch (_: Throwable) {
    }
    try {
      mediaProjection?.stop()
    } catch (_: Throwable) {
    }
    mediaProjection = null
    if (removeTemp) {
      segments.forEach { it.delete() }
      segments.clear()
    }
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun replayNotification(text: String): Notification {
    val stopIntent = PendingIntent.getService(
      this,
      1,
      Intent(this, NexxsensiReplayService::class.java).apply { action = ACTION_STOP },
      pendingIntentFlags()
    )
    val saveIntent = PendingIntent.getService(
      this,
      2,
      Intent(this, NexxsensiReplayService::class.java).apply { action = ACTION_SAVE },
      pendingIntentFlags()
    )
    val openIntent = PendingIntent.getService(
      this,
      3,
      Intent(this, NexxsensiReplayService::class.java).apply { action = ACTION_OPEN_LAST },
      pendingIntentFlags()
    )
    val shareIntent = PendingIntent.getService(
      this,
      4,
      Intent(this, NexxsensiReplayService::class.java).apply { action = ACTION_SHARE_LAST },
      pendingIntentFlags()
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Nexxsensi Replay")
      .setContentText(text)
      .setOngoing(true)
      .addAction(applicationInfo.icon, "Salvar", saveIntent)
      .addAction(applicationInfo.icon, "Abrir", openIntent)
      .addAction(applicationInfo.icon, "Compartilhar", shareIntent)
      .addAction(applicationInfo.icon, "Parar", stopIntent)
      .build()
  }

  private fun openLastReplay() {
    val uri = lastReplayUri() ?: return
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "video/mp4")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    startActivity(intent)
  }

  private fun shareLastReplay() {
    val uri = lastReplayUri() ?: return
    val intent = Intent(Intent.ACTION_SEND).apply {
      type = "video/mp4"
      putExtra(Intent.EXTRA_STREAM, uri)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    startActivity(Intent.createChooser(intent, "Compartilhar replay").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  private fun replayUri(file: File) = FileProvider.getUriForFile(
    this,
    "${packageName}.replayprovider",
    file
  )

  private fun saveLastReplay(uriOrPath: String) {
    getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_LAST_REPLAY, uriOrPath)
      .apply()
  }

  private fun lastReplayUri(): Uri? {
    val value = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_LAST_REPLAY, null)
      ?: return null

    if (value.startsWith("content://") || value.startsWith("file://")) {
      return Uri.parse(value)
    }

    val file = File(value).takeIf { it.exists() && it.length() > 0L } ?: return null
    return replayUri(file)
  }

  private fun updateDisplayMetrics() {
    val metrics = DisplayMetrics()
    val manager = getSystemService(WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    manager.defaultDisplay.getRealMetrics(metrics)
    density = metrics.densityDpi
    val longSide = maxOf(metrics.widthPixels, metrics.heightPixels)
    val shortSide = minOf(metrics.widthPixels, metrics.heightPixels)
    width = 1280.coerceAtMost(longSide)
    height = 720.coerceAtMost(shortSide)
    if (width % 2 != 0) width -= 1
    if (height % 2 != 0) height -= 1
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Nexxsensi Replay",
      NotificationManager.IMPORTANCE_LOW
    )
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun tempDir(): File {
    return File(cacheDir, "replay-buffer").apply { mkdirs() }
  }

  private fun timestamp(): String {
    return SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
  }

  private fun pendingIntentFlags(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
  }

  companion object {
    const val ACTION_START = "com.nexxsensi.mobileoptimizer.replay.START"
    const val ACTION_SAVE = "com.nexxsensi.mobileoptimizer.replay.SAVE"
    const val ACTION_OPEN_LAST = "com.nexxsensi.mobileoptimizer.replay.OPEN_LAST"
    const val ACTION_SHARE_LAST = "com.nexxsensi.mobileoptimizer.replay.SHARE_LAST"
    const val ACTION_STOP = "com.nexxsensi.mobileoptimizer.replay.STOP"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    private const val CHANNEL_ID = "nexxsensi_replay"
    private const val NOTIFICATION_ID = 9520
    private const val MAX_REPLAY_MS = 180_000L
    private const val FRAME_DURATION_US = 33_333L
    private const val PREFS = "nexxsensi_replay"
    private const val KEY_LAST_REPLAY = "lastReplay"
  }
}
