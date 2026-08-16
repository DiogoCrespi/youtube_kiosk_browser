package com.youtube.kiosk

import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.os.Process
import android.util.Log
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import java.io.File
import java.io.FileOutputStream

class YouTubeKioskApp : Application() {

    var geckoRuntime: GeckoRuntime? = null
        private set

    override fun onCreate() {
        super.onCreate()

        if (isMainProcess()) {
            try {
                val configFile = setupConfigFile()
                val settings = GeckoRuntimeSettings.Builder()
                    .configFilePath(configFile.absolutePath)
                    .aboutConfigEnabled(true)
                    .build()

                geckoRuntime = GeckoRuntime.create(this, settings)

                val controller = geckoRuntime?.webExtensionController
                controller?.ensureBuiltIn(
                    "resource://android/assets/extensions/youtube_background_fix/",
                    "background-play-fix@kiosk.browser"
                )

                // Desinstala uBlock Origin e SponsorBlock do perfil para isolamento do teste
                controller?.list()?.accept({ extensions ->
                    extensions?.forEach { ext ->
                        if (ext.id == "adblock-youtube@kiosk.browser" || ext.id == "sponsorblock@kiosk.browser") {
                            controller.uninstall(ext)
                            Log.d(TAG, "Extensão removida para teste: ${ext.id}")
                        }
                    }
                }, { error ->
                    Log.e(TAG, "Erro ao consultar extensões", error)
                })
                Log.d(TAG, "GeckoRuntime iniciado em modo de teste sem AdBlock.")

            } catch (e: Throwable) {
                Log.e(TAG, "Erro ao inicializar GeckoRuntime", e)
            }
        } else {
            Log.d(TAG, "Processo secundário do Gecko ignorado.")
        }
    }

    private fun setupConfigFile(): File {
        val configFile = File(filesDir, "geckoview-config.yaml")
        try {
            assets.open("geckoview-config.yaml").use { input ->
                FileOutputStream(configFile).use { output ->
                    input.copyTo(output)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao copiar geckoview-config.yaml", e)
        }
        return configFile
    }

    private fun isMainProcess(): Boolean {
        val pid = Process.myPid()
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (appProcess in am.runningAppProcesses ?: emptyList()) {
            if (appProcess.pid == pid) {
                return appProcess.processName == packageName
            }
        }
        return true
    }

    companion object {
        private const val TAG = "YouTubeKioskApp"
    }
}
