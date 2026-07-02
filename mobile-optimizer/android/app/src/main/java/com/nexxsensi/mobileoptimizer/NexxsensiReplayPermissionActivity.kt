package com.nexxsensi.mobileoptimizer

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle

class NexxsensiReplayPermissionActivity : Activity() {
  private lateinit var projectionManager: MediaProjectionManager

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
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
    }
    finish()
  }

  companion object {
    private const val REQUEST_CAPTURE = 3110
  }
}
