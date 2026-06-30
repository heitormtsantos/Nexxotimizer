package com.nexxsensi.mobileoptimizer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class PairingNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val results = RemoteInput.getResultsFromIntent(intent) ?: return
    val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val currentCode = preferences.getString(KEY_CODE, "").orEmpty()
    val currentPort = preferences.getString(KEY_PORT, "").orEmpty()
    val code = results.getCharSequence(KEY_CODE)?.toString()?.trim()
      ?.takeIf { it.isNotBlank() } ?: currentCode
    val port = results.getCharSequence(KEY_PORT)?.toString()?.trim()
      ?.takeIf { it.isNotBlank() } ?: currentPort

    preferences.edit()
      .putString(KEY_CODE, code)
      .putString(KEY_PORT, port)
      .apply()

    updateNotification(context, code, port)
  }

  private fun updateNotification(context: Context, code: String, port: String) {
    val notificationManager = context.getSystemService(
      Context.NOTIFICATION_SERVICE
    ) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      notificationManager.getNotificationChannel(CHANNEL_ID) == null
    ) {
      notificationManager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Modo Avançado", NotificationManager.IMPORTANCE_HIGH)
      )
    }

    val openAppIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP) }
      ?: Intent(context, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val pendingIntent = PendingIntent.getActivity(context, NOTIFICATION_ID, openAppIntent, flags)
    val text = when {
      code.isNotBlank() && port.isNotBlank() -> "Código e porta recebidos. Volte ao app para autorizar."
      code.isNotBlank() -> "Código recebido. Agora digite a porta pela notificação."
      port.isNotBlank() -> "Porta recebida. Agora digite o código pela notificação."
      else -> "Expanda para digitar código e porta sem sair desta tela."
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }

    notificationManager.notify(
      NOTIFICATION_ID,
      builder
        .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
        .setContentTitle("Game Optimizer pronto para parear")
        .setContentText(text)
        .setStyle(Notification.BigTextStyle().bigText(text))
        .setSubText("Modo Avançado")
        .setOngoing(true)
        .setAutoCancel(false)
        .setContentIntent(pendingIntent)
        .addAction(buildInputAction(context, KEY_CODE, ACTION_SAVE_CODE, "Digitar código", 2410))
        .addAction(buildInputAction(context, KEY_PORT, ACTION_SAVE_PORT, "Digitar porta", 2411))
        .build()
    )
  }

  private fun buildInputAction(
    context: Context,
    key: String,
    action: String,
    title: String,
    requestCode: Int
  ): Notification.Action {
    val inputIntent = Intent(context, PairingNotificationReceiver::class.java).apply {
      this.action = action
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    val pendingIntent = PendingIntent.getBroadcast(context, requestCode, inputIntent, flags)
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

  companion object {
    const val ACTION_SAVE = "com.nexxsensi.mobileoptimizer.SAVE_PAIRING_INPUT"
    const val ACTION_SAVE_CODE = "com.nexxsensi.mobileoptimizer.SAVE_PAIRING_CODE"
    const val ACTION_SAVE_PORT = "com.nexxsensi.mobileoptimizer.SAVE_PAIRING_PORT"
    const val CHANNEL_ID = "advanced_mode_pairing"
    const val KEY_CODE = "pairing_code"
    const val KEY_PORT = "pairing_port"
    const val NOTIFICATION_ID = 2408
    const val PREFS = "pairing_notification"
  }
}
