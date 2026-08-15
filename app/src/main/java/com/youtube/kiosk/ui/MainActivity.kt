package com.youtube.kiosk.ui

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.Rect
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.Rational
import android.view.View
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.youtube.kiosk.R
import com.youtube.kiosk.service.MediaControlDispatcher
import com.youtube.kiosk.service.PlaybackService
import com.youtube.kiosk.service.PlaybackSessionManager
import org.mozilla.geckoview.*

class MainActivity : AppCompatActivity() {

    private lateinit var geckoView: GeckoView
    private lateinit var geckoSession: GeckoSession
    private lateinit var progressBar: ProgressBar

    private var lastBackPressTime: Long = 0
    private var isVideoFullScreen = false
    private var currentLoadedUrl: String = ""

    private val pipActionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_PIP_AUDIO_ONLY -> {
                    // Modo Fone de Ouvido: Desanexa sessão da View, fecha janela PiP e mantém áudio tocando em background
                    Log.d(TAG, "PiP Action: Fone de Ouvido (Audio-only background)")
                    PlaybackSessionManager.userWantsPlayback = true
                    PlaybackSessionManager.detachFromView(geckoView)
                    moveTaskToBack(true)
                }
                ACTION_PIP_PLAY_PAUSE -> {
                    Log.d(TAG, "PiP Action: Toggle Play/Pause")
                    PlaybackSessionManager.togglePlayPauseFromUser(this@MainActivity)
                    updatePipParams()
                }
                ACTION_PIP_NEXT -> {
                    Log.d(TAG, "PiP Action: Próximo Vídeo")
                    PlaybackSessionManager.nextTrack()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        geckoView = findViewById(R.id.geckoView)
        progressBar = findViewById(R.id.progressBar)

        setupImmersiveMode()
        setupMediaControlDispatcher()
        setupGeckoSession()
        setupBackNavigation()
        updatePipParams()

        val filter = IntentFilter().apply {
            addAction(ACTION_PIP_AUDIO_ONLY)
            addAction(ACTION_PIP_PLAY_PAUSE)
            addAction(ACTION_PIP_NEXT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pipActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(pipActionReceiver, filter)
        }

        if (savedInstanceState == null) {
            handleIntent(intent)
        }
    }

    private fun setupMediaControlDispatcher() {
        MediaControlDispatcher.onPlayAction = {
            PlaybackSessionManager.playFromUser(this)
        }
        MediaControlDispatcher.onPauseAction = {
            PlaybackSessionManager.pauseFromUser(this)
        }
        MediaControlDispatcher.onSeekToAction = { posMs ->
            PlaybackSessionManager.seekTo(posMs)
        }
        MediaControlDispatcher.onNextAction = {
            PlaybackSessionManager.nextTrack()
        }
        MediaControlDispatcher.onPreviousAction = {
            PlaybackSessionManager.previousTrack()
        }
        MediaControlDispatcher.onFastForwardAction = {
            PlaybackSessionManager.seekBy(10)
        }
        MediaControlDispatcher.onRewindAction = {
            PlaybackSessionManager.seekBy(-10)
        }
    }

    private fun togglePipCssMode(enabled: Boolean) {
        val js = "javascript:(function(){ if (window.__kioskExecuteAction) { window.__kioskExecuteAction('SET_PIP_MODE', $enabled); } else { if ($enabled) document.documentElement.classList.add('kiosk-pip-active'); else document.documentElement.classList.remove('kiosk-pip-active'); } })()"
        runOnUiThread {
            try {
                geckoSession.loadUri(js)
            } catch (e: Throwable) {
                Log.e(TAG, "Erro ao alternar CSS PiP", e)
            }
        }
    }

    private fun injectBackgroundFixScript() {
        val js = """
            javascript:(function(){
                try {
                    const props = {
                        'hidden': { get: function() { return false; }, enumerable: true, configurable: true },
                        'visibilityState': { get: function() { return 'visible'; }, enumerable: true, configurable: true },
                        'webkitHidden': { get: function() { return false; }, enumerable: true, configurable: true },
                        'webkitVisibilityState': { get: function() { return 'visible'; }, enumerable: true, configurable: true }
                    };
                    Object.defineProperties(document, props);
                    if (typeof Document !== 'undefined') Object.defineProperties(Document.prototype, props);
                    if (typeof HTMLDocument !== 'undefined') Object.defineProperties(HTMLDocument.prototype, props);
                    Document.prototype.hasFocus = function() { return true; };
                    document.hasFocus = function() { return true; };

                    ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'blur', 'focusout'].forEach(function(evt) {
                        window.addEventListener(evt, function(e) {
                            if (evt === 'blur' || evt === 'focusout') {
                                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
                            }
                            e.stopImmediatePropagation();
                        }, true);
                    });
                } catch(e) {}
            })();
        """.trimIndent()
        runOnUiThread {
            try {
                geckoSession.loadUri(js)
            } catch (e: Throwable) {
                Log.e(TAG, "Erro ao injetar script de background", e)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val newUrl = intent.dataString
        if (!newUrl.isNullOrBlank() && newUrl != currentLoadedUrl && isYouTubeUrl(newUrl)) {
            handleIntent(intent)
        }
    }

    private fun handleIntent(intent: Intent?) {
        val targetUrl = intent?.dataString
        if (!targetUrl.isNullOrBlank() && isYouTubeUrl(targetUrl)) {
            Log.d(TAG, "Carregando URL do Intent: $targetUrl")
            currentLoadedUrl = targetUrl
            PlaybackSessionManager.currentUrl = targetUrl
            geckoSession.loadUri(targetUrl)
        } else if (currentLoadedUrl.isEmpty()) {
            Log.d(TAG, "Carregando Home do YouTube Mobile")
            currentLoadedUrl = DEFAULT_YOUTUBE_URL
            PlaybackSessionManager.currentUrl = DEFAULT_YOUTUBE_URL
            geckoSession.loadUri(DEFAULT_YOUTUBE_URL)
        }
    }

    private fun isYouTubeUrl(url: String): Boolean {
        return url.contains("youtube.com") || url.contains("youtu.be") || url.contains("youtubekids.com")
    }

    private fun setupImmersiveMode() {
        val insetsController = WindowCompat.getInsetsController(window, window.decorView)
        insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insetsController.isAppearanceLightStatusBars = false
    }

    private fun setupGeckoSession() {
        geckoSession = PlaybackSessionManager.getOrCreateSession(this)
        PlaybackSessionManager.attachToView(geckoView)

        PlaybackSessionManager.onPlaybackStateChanged = { isPlaying ->
            runOnUiThread {
                updatePipParams()
            }
        }

        // 1. Delegado de Conteúdo (Fullscreen)
        geckoSession.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onFullScreen(session: GeckoSession, fullScreen: Boolean) {
                isVideoFullScreen = fullScreen
                updatePipParams()
                val insetsController = WindowCompat.getInsetsController(window, window.decorView)
                if (fullScreen) {
                    insetsController.hide(WindowInsetsCompat.Type.systemBars())
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                } else {
                    insetsController.show(WindowInsetsCompat.Type.systemBars())
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
            }
        }

        // 2. Delegado de Progresso
        geckoSession.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStart(session: GeckoSession, url: String) {
                progressBar.visibility = View.VISIBLE
                currentLoadedUrl = url
                PlaybackSessionManager.updateCurrentUrl(url, this@MainActivity)
            }

            override fun onPageStop(session: GeckoSession, success: Boolean) {
                progressBar.visibility = View.GONE
                if (success) {
                    injectBackgroundFixScript()
                }
            }

            override fun onProgressChange(session: GeckoSession, progress: Int) {
                progressBar.progress = progress
            }
        }

        // 3. Delegado de Navegação
        geckoSession.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLoadRequest(session: GeckoSession, request: GeckoSession.NavigationDelegate.LoadRequest): GeckoResult<AllowOrDeny>? {
                val uri = request.uri
                Log.d(TAG, "onLoadRequest: $uri")
                PlaybackSessionManager.updateCurrentUrl(uri, this@MainActivity)
                if (uri.startsWith("intent:") || uri.startsWith("vnd.youtube:") || uri.startsWith("market:")) {
                    Log.d(TAG, "Bloqueando redirecionamento para app externo: $uri")
                    return GeckoResult.fromValue(AllowOrDeny.DENY)
                }
                return GeckoResult.fromValue(AllowOrDeny.ALLOW)
            }
        }



    }

    override fun onStart() {
        super.onStart()
        PlaybackSessionManager.attachToView(geckoView)
        updatePipParams()
    }

    override fun onResume() {
        super.onResume()
        PlaybackSessionManager.attachToView(geckoView)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!isInPictureInPictureMode) {
                togglePipCssMode(false)
            }
        }
        updatePipParams()
    }

    override fun onPause() {
        super.onPause()
        updatePipParams()
    }

    override fun onStop() {
        super.onStop()
        updatePipParams()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (PlaybackSessionManager.isMediaPlaying || isVideoFullScreen) {
            enterPipMode()
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun buildPipActions(): List<RemoteAction> {
        val actions = ArrayList<RemoteAction>()

        // 1. [ Fone de Ouvido ] - Áudio em Segundo Plano
        val audioPendingIntent = PendingIntent.getBroadcast(
            this,
            REQUEST_CODE_AUDIO_ONLY,
            Intent(ACTION_PIP_AUDIO_ONLY).setPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val audioAction = RemoteAction(
            Icon.createWithResource(this, R.drawable.ic_headphones),
            "Áudio em Segundo Plano",
            "Áudio em Segundo Plano",
            audioPendingIntent
        )
        actions.add(audioAction)

        // 2. [ Play / Pause ]
        val isPlaying = PlaybackSessionManager.isMediaPlaying
        val playPausePendingIntent = PendingIntent.getBroadcast(
            this,
            REQUEST_CODE_PLAY_PAUSE,
            Intent(ACTION_PIP_PLAY_PAUSE).setPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val playPauseIcon = if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play
        val playPauseTitle = if (isPlaying) "Pausar" else "Reproduzir"
        val playPauseAction = RemoteAction(
            Icon.createWithResource(this, playPauseIcon),
            playPauseTitle,
            playPauseTitle,
            playPausePendingIntent
        )
        actions.add(playPauseAction)

        // 3. [ Próximo ]
        val nextPendingIntent = PendingIntent.getBroadcast(
            this,
            REQUEST_CODE_NEXT,
            Intent(ACTION_PIP_NEXT).setPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val nextAction = RemoteAction(
            Icon.createWithResource(this, R.drawable.ic_next),
            "Próximo",
            "Próximo",
            nextPendingIntent
        )
        actions.add(nextAction)

        return actions
    }

    private fun enterPipMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                togglePipCssMode(true)
                val pipBuilder = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(16, 9))
                    .setActions(buildPipActions())

                if (isVideoFullScreen) {
                    val displayMetrics = resources.displayMetrics
                    pipBuilder.setSourceRectHint(Rect(0, 0, displayMetrics.widthPixels, displayMetrics.heightPixels))
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    pipBuilder.setAutoEnterEnabled(true)
                    pipBuilder.setSeamlessResizeEnabled(true)
                }

                enterPictureInPictureMode(pipBuilder.build())
            } catch (e: Exception) {
                Log.e(TAG, "Falha ao entrar em Picture-in-Picture", e)
            }
        }
    }

    private fun updatePipParams() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val pipBuilder = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(16, 9))
                    .setActions(buildPipActions())

                if (isVideoFullScreen) {
                    val displayMetrics = resources.displayMetrics
                    pipBuilder.setSourceRectHint(Rect(0, 0, displayMetrics.widthPixels, displayMetrics.heightPixels))
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    pipBuilder.setAutoEnterEnabled(PlaybackSessionManager.isMediaPlaying || isVideoFullScreen)
                    pipBuilder.setSeamlessResizeEnabled(true)
                }

                setPictureInPictureParams(pipBuilder.build())
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao atualizar parâmetros PiP", e)
            }
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        progressBar.visibility = View.GONE
        togglePipCssMode(isInPictureInPictureMode)
        if (isInPictureInPictureMode) {
            updatePipParams()
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isVideoFullScreen) {
                    geckoSession.exitFullScreen()
                    return
                }

                geckoSession.goBack()

                val currentTime = System.currentTimeMillis()
                if (currentTime - lastBackPressTime < 2000) {
                    isEnabled = false
                    finish()
                } else {
                    lastBackPressTime = currentTime
                    Toast.makeText(this@MainActivity, "Pressione voltar novamente para sair", Toast.LENGTH_SHORT).show()
                }
            }
        })
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(pipActionReceiver)
        } catch (e: Exception) {}
        MediaControlDispatcher.onPlayAction = null
        MediaControlDispatcher.onPauseAction = null
        MediaControlDispatcher.onSeekToAction = null
        MediaControlDispatcher.onNextAction = null
        MediaControlDispatcher.onPreviousAction = null
        MediaControlDispatcher.onFastForwardAction = null
        MediaControlDispatcher.onRewindAction = null
        PlaybackSessionManager.onPlaybackStateChanged = null
        PlaybackSessionManager.detachFromView(geckoView)
    }

    companion object {
        private const val TAG = "MainActivity"
        private const val DEFAULT_YOUTUBE_URL = "https://m.youtube.com"

        private const val ACTION_PIP_AUDIO_ONLY = "com.youtube.kiosk.ACTION_PIP_AUDIO_ONLY"
        private const val ACTION_PIP_PLAY_PAUSE = "com.youtube.kiosk.ACTION_PIP_PLAY_PAUSE"
        private const val ACTION_PIP_NEXT = "com.youtube.kiosk.ACTION_PIP_NEXT"

        private const val REQUEST_CODE_AUDIO_ONLY = 101
        private const val REQUEST_CODE_PLAY_PAUSE = 102
        private const val REQUEST_CODE_NEXT = 103
    }
}
