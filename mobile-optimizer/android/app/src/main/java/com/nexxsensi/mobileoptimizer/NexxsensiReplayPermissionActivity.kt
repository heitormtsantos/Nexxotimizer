package com.nexxsensi.mobileoptimizer

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle

class NexxsensiReplayPermissionActivity : Activity() {
  private lateinit var projectionManager: MediaProjectionManager
  private var returnPackage: String = ""

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    returnPackage = intent.getStringExtra(EXTRA_RETURN_PACKAGE).orEmpty()
    projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_CAPTURE)
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == REQUEST_CAPTURE && resultCode == RESULT_OK && data != null) {
      val serviceIntent = Intent(this, NexxsensiReplayService::class.java).apply {
        action = NexxsensiReplayService.ACTION_START
        putExtra(NexxsensiReplayService.EXTRA_RESULT_CODE, resultCode)
        putExtra(NexxsensiReplayService.EXTRA_RESULT_DATA, data)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(serviceIntent)
      } else {
        startService(serviceIntent)
      }
      launchReturnPackage()
    }
    finish()
  }

  private fun launchReturnPackage() {
    if (returnPackage.isBlank()) {
      return
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(returnPackage) ?: return
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    try {
      startActivity(launchIntent)
    } catch (_: Throwable) {
    }
  }

  companion object {
    const val EXTRA_RETURN_PACKAGE = "returnPackage"
    private const val REQUEST_CAPTURE = 3110
  }
}
