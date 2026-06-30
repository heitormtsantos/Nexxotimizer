package com.nexxsensi.mobileoptimizer

import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

class NexxsensiShellService : INexxsensiShellService.Stub() {
  override fun exec(command: String): String {
    val process = ProcessBuilder("sh", "-c", command)
      .redirectErrorStream(false)
      .start()

    val finished = process.waitFor(45, TimeUnit.SECONDS)
    if (!finished) {
      process.destroyForcibly()
      return "exit=-1\nstdout=\nstderr=Tempo limite ao executar comando."
    }

    val stdout = BufferedReader(InputStreamReader(process.inputStream)).readText().trim()
    val stderr = BufferedReader(InputStreamReader(process.errorStream)).readText().trim()

    return "exit=${process.exitValue()}\nstdout=$stdout\nstderr=$stderr"
  }
}
