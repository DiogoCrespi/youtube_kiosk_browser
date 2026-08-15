package com.youtube.kiosk.ui

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.Rational
import android.view.View
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.youtube.kiosk.R
import com.youtube.kiosk.YouTubeKioskApp
import com.youtube.kiosk.service.MediaControlDispatcher
import com.youtube.kiosk.service.PlaybackService
import org.mozilla.geckoview.*

class MainActivity : AppCompatActivity() {

    private lateinit var geckoView: GeckoView
    private lateinit var geckoSession: GeckoSession
    private lateinit var progressBar: ProgressBar

    private var lastBackPressTime: Long = 0
    private var isVideoFullScreen = false
    private var isMediaPlaying = false
    private var currentVideoTitle = "YouTube"
    private var currentArtist = "YouTube Kiosk"
    private var currentPositionMs = 0L
    private var currentDurationMs = 0L
    private var currentPlaybackSpeed = 1.0f
    private var currentLoadedUrl: String = ""
    private var currentArtworkUrl: String? = null
    private var activeMediaSession: MediaSession? = null

    private fun extractThumbnailUrl(url: String): String? {
        val pattern = "(?:[?&]v=|shorts/|youtu\\.be/)([a-zA-Z0-9_-]{11})".toRegex()
        val videoId = pattern.find(url)?.groupValues?.get(1)
        return if (videoId != null) "https://i.ytimg.com/vi/$videoId/hqdefault.jpg" else null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        geckoView = findViewById(R.id.geckoView)
        progressBar = findViewById(R.id.progressBar)

        setupImmersiveMode()
        setupMediaControlDispatcher()
        setupGeckoSession()
        installBuiltInExtensions()
        setupBackNavigation()
        updatePipParams()

        if (savedInstanceState == null) {
            handleIntent(intent)
        }
    }

    private fun setupMediaControlDispatcher() {
        MediaControlDispatcher.onPlayAction = {
            executePlayerCommand("PLAY")
        }
        MediaControlDispatcher.onPauseAction = {
            executePlayerCommand("PAUSE")
        }
        MediaControlDispatcher.onSeekToAction = { posMs ->
            val seconds = posMs / 1000.0
            executePlayerCommand("SEEK_TO", seconds.toString())
        }
        MediaControlDispatcher.onNextAction = {
            executePlayerCommand("NEXT_VIDEO")
        }
        MediaControlDispatcher.onPreviousAction = {
            executePlayerCommand("PREV_VIDEO")
        }
        MediaControlDispatcher.onFastForwardAction = {
            executePlayerCommand("SEEK_BY", "10")
        }
        MediaControlDispatcher.onRewindAction = {
            executePlayerCommand("SEEK_BY", "-10")
        }
    }

    private fun executePlayerCommand(action: String, arg: String? = null) {
        val argParam = if (arg != null) "'$arg'" else "null"
        val js = "javascript:(function(){ if (window.__kioskExecuteAction) { window.__kioskExecuteAction('$action', $argParam); } else { const v = document.querySelector('video'); const p = document.getElementById('movie_player'); if ('$action' === 'PLAY') { if (p && p.playVideo) p.playVideo(); else if (v) v.play(); } else if ('$action' === 'PAUSE') { if (p && p.pauseVideo) p.pauseVideo(); else if (v) v.pause(); } else if ('$action' === 'NEXT_VIDEO') { if (p && p.nextVideo) p.nextVideo(); else document.querySelector('.ytp-next-button')?.click(); } else if ('$action' === 'PREV_VIDEO') { if (p && p.previousVideo) p.previousVideo(); else if (v && v.currentTime > 3) { v.currentTime = 0; } else { window.history.back(); } } } })()"
        runOnUiThread {
            try {
                geckoSession.loadUri(js)
            } catch (e: Throwable) {
                Log.e(TAG, "Erro ao enviar comando JS: $action", e)
            }
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
            geckoSession.loadUri(targetUrl)
        } else if (currentLoadedUrl.isEmpty()) {
            Log.d(TAG, "Carregando Home do YouTube Mobile")
            currentLoadedUrl = DEFAULT_YOUTUBE_URL
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
        val runtime = (application as YouTubeKioskApp).geckoRuntime ?: GeckoRuntime.getDefault(this)
        val settings = GeckoSessionSettings.Builder()
            .usePrivateMode(false)
            .userAgentMode(GeckoSessionSettings.USER_AGENT_MODE_MOBILE)
            .suspendMediaWhenInactive(false)
            .build()
        geckoSession = GeckoSession(settings)

        // 1. Delegado de Conteúdo (Fullscreen & Immersive Video Mode)
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

        // 2. Delegado de Sessão de Mídia (Segundo Plano & Sincronização da Ilha HyperOS)
        geckoSession.mediaSessionDelegate = object : MediaSession.Delegate {
            override fun onActivated(session: GeckoSession, mediaSession: MediaSession) {
                activeMediaSession = mediaSession
                isMediaPlaying = true
                val art = currentArtworkUrl ?: extractThumbnailUrl(currentLoadedUrl)
                PlaybackService.start(
                    this@MainActivity,
                    title = currentVideoTitle,
                    artist = currentArtist,
                    isPlaying = true,
                    positionMs = currentPositionMs,
                    durationMs = currentDurationMs,
                    playbackSpeed = currentPlaybackSpeed,
                    artworkUrl = art
                )
                updatePipParams()
            }

            override fun onDeactivated(session: GeckoSession, mediaSession: MediaSession) {
                // Mantém o serviço ativo para evitar interrupções
            }

            override fun onMetadata(session: GeckoSession, mediaSession: MediaSession, meta: MediaSession.Metadata) {
                activeMediaSession = mediaSession
                val title = meta.title?.ifEmpty { "YouTube" } ?: "YouTube"
                val artist = meta.artist?.ifEmpty { "YouTube Kiosk" } ?: "YouTube Kiosk"
                currentVideoTitle = title
                currentArtist = artist

                val art = extractThumbnailUrl(currentLoadedUrl)
                if (!art.isNullOrBlank()) {
                    currentArtworkUrl = art
                }

                PlaybackService.start(
                    this@MainActivity,
                    title = currentVideoTitle,
                    artist = currentArtist,
                    isPlaying = isMediaPlaying,
                    positionMs = currentPositionMs,
                    durationMs = currentDurationMs,
                    playbackSpeed = currentPlaybackSpeed,
                    artworkUrl = currentArtworkUrl
                )
            }

            override fun onPositionState(session: GeckoSession, mediaSession: MediaSession, state: MediaSession.PositionState) {
                activeMediaSession = mediaSession
                val posMs = (state.position * 1000).toLong()
                val durMs = (state.duration * 1000).toLong()
                val speed = state.playbackRate.toFloat()
                currentPositionMs = posMs
                currentDurationMs = durMs
                currentPlaybackSpeed = speed
                PlaybackService.start(
                    this@MainActivity,
                    title = currentVideoTitle,
                    artist = currentArtist,
                    isPlaying = isMediaPlaying,
                    positionMs = posMs,
                    durationMs = durMs,
                    playbackSpeed = speed,
                    artworkUrl = currentArtworkUrl ?: extractThumbnailUrl(currentLoadedUrl)
                )
            }

            override fun onPlay(session: GeckoSession, mediaSession: MediaSession) {
                activeMediaSession = mediaSession
                isMediaPlaying = true
                PlaybackService.start(
                    this@MainActivity,
                    title = currentVideoTitle,
                    artist = currentArtist,
                    isPlaying = true,
                    positionMs = currentPositionMs,
                    durationMs = currentDurationMs,
                    playbackSpeed = currentPlaybackSpeed,
                    artworkUrl = currentArtworkUrl ?: extractThumbnailUrl(currentLoadedUrl)
                )
                updatePipParams()
            }

            override fun onPause(session: GeckoSession, mediaSession: MediaSession) {
                // Ignora micropausas automáticas
            }

            override fun onStop(session: GeckoSession, mediaSession: MediaSession) {
                isMediaPlaying = false
                PlaybackService.start(
                    this@MainActivity,
                    title = currentVideoTitle,
                    artist = currentArtist,
                    isPlaying = false,
                    positionMs = currentPositionMs,
                    durationMs = currentDurationMs,
                    playbackSpeed = currentPlaybackSpeed,
                    artworkUrl = currentArtworkUrl ?: extractThumbnailUrl(currentLoadedUrl)
                )
                updatePipParams()
            }
        }

        // 3. Delegado de Progresso
        geckoSession.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStart(session: GeckoSession, url: String) {
                progressBar.visibility = View.VISIBLE
                currentLoadedUrl = url
            }

            override fun onPageStop(session: GeckoSession, success: Boolean) {
                progressBar.visibility = View.GONE
            }

            override fun onProgressChange(session: GeckoSession, progress: Int) {
                progressBar.progress = progress
            }
        }

        // 4. Delegado de Navegação
        geckoSession.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
                hasUserGesture: Boolean
            ) {
                if (!url.isNullOrBlank()) {
                    Log.d(TAG, "onLocationChange: $url")
                    currentLoadedUrl = url
                    val art = extractThumbnailUrl(url)
                    if (art != null) {
                        currentArtworkUrl = art
                        PlaybackService.start(
                            this@MainActivity,
                            title = currentVideoTitle,
                            artist = currentArtist,
                            isPlaying = isMediaPlaying,
                            positionMs = currentPositionMs,
                            durationMs = currentDurationMs,
                            playbackSpeed = currentPlaybackSpeed,
                            artworkUrl = art
                        )
                    }
                }
            }

            override fun onLoadRequest(session: GeckoSession, request: GeckoSession.NavigationDelegate.LoadRequest): GeckoResult<AllowOrDeny>? {
                val uri = request.uri
                Log.d(TAG, "onLoadRequest: $uri")

                if (uri.startsWith("intent:") || uri.startsWith("vnd.youtube:") || uri.startsWith("market:")) {
                    Log.d(TAG, "Bloqueando redirecionamento para app externo: $uri")
                    return GeckoResult.fromValue(AllowOrDeny.DENY)
                }

                return GeckoResult.fromValue(AllowOrDeny.ALLOW)
            }
        }

        geckoSession.open(runtime)
        geckoView.setSession(geckoSession)
    }

    private fun installBuiltInExtensions() {
        try {
            val runtime = (application as YouTubeKioskApp).geckoRuntime ?: GeckoRuntime.getDefault(this)
            val controller = runtime.webExtensionController

            // 1. Instala AdBlocker Nativo para YouTube
            controller.ensureBuiltIn(
                "resource://android/assets/extensions/ublock_origin/",
                "adblock-youtube@kiosk.browser"
            ).accept(
                { ext -> Log.i(TAG, "AdBlocker ativado com sucesso: ${ext?.id}") },
                { err -> Log.e(TAG, "Erro ao carregar AdBlocker", err) }
            )

            // 2. Instala Background Playback Fix
            controller.ensureBuiltIn(
                "resource://android/assets/extensions/youtube_background_fix/",
                "background-play-fix@kiosk.browser"
            ).accept(
                { ext -> Log.i(TAG, "Background Playback Fix ativado com sucesso: ${ext?.id}") },
                { err -> Log.e(TAG, "Erro ao carregar Background Fix", err) }
            )

            // 3. Instala SponsorBlock (Pular patrocínios)
            controller.ensureBuiltIn(
                "resource://android/assets/extensions/sponsorblock/",
                "sponsorblock@kiosk.browser"
            ).accept(
                { ext -> Log.i(TAG, "SponsorBlock ativado com sucesso: ${ext?.id}") },
                { err -> Log.e(TAG, "Erro ao carregar SponsorBlock", err) }
            )
        } catch (e: Throwable) {
            Log.e(TAG, "Erro ao registrar WebExtensions", e)
        }
    }

    override fun onStart() {
        super.onStart()
        geckoSession.setActive(true)
        geckoSession.setFocused(true)
        updatePipParams()
    }

    override fun onResume() {
        super.onResume()
        geckoSession.setActive(true)
        geckoSession.setFocused(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!isInPictureInPictureMode) {
                togglePipCssMode(false)
            }
        }
        updatePipParams()
    }

    override fun onPause() {
        super.onPause()
        geckoSession.setActive(true)
        geckoSession.setFocused(true)
        PlaybackService.start(
            this,
            title = currentVideoTitle,
            artist = currentArtist,
            isPlaying = isMediaPlaying,
            positionMs = currentPositionMs,
            durationMs = currentDurationMs,
            playbackSpeed = currentPlaybackSpeed,
            artworkUrl = currentArtworkUrl ?: extractThumbnailUrl(currentLoadedUrl)
        )
    }

    override fun onStop() {
        super.onStop()
        geckoSession.setActive(true)
        geckoSession.setFocused(true)
        PlaybackService.start(
            this,
            title = currentVideoTitle,
            artist = currentArtist,
            isPlaying = isMediaPlaying,
            positionMs = currentPositionMs,
            durationMs = currentDurationMs,
            playbackSpeed = currentPlaybackSpeed,
            artworkUrl = currentArtworkUrl ?: extractThumbnailUrl(currentLoadedUrl)
        )
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (isMediaPlaying || isVideoFullScreen) {
            enterPipMode()
        }
    }

    private fun enterPipMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                togglePipCssMode(true)
                val pipBuilder = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(16, 9))

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

                if (isVideoFullScreen) {
                    val displayMetrics = resources.displayMetrics
                    pipBuilder.setSourceRectHint(Rect(0, 0, displayMetrics.widthPixels, displayMetrics.heightPixels))
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    pipBuilder.setAutoEnterEnabled(isMediaPlaying || isVideoFullScreen)
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
        geckoSession.setActive(true)
        geckoSession.setFocused(true)
        togglePipCssMode(isInPictureInPictureMode)
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
        MediaControlDispatcher.onPlayAction = null
        MediaControlDispatcher.onPauseAction = null
        MediaControlDispatcher.onSeekToAction = null
        MediaControlDispatcher.onNextAction = null
        MediaControlDispatcher.onPreviousAction = null
        MediaControlDispatcher.onFastForwardAction = null
        MediaControlDispatcher.onRewindAction = null
        PlaybackService.stop(this)
        try {
            geckoSession.close()
        } catch (e: Throwable) {
            Log.e(TAG, "Erro ao fechar sessão Gecko", e)
        }
    }

    companion object {
        private const val TAG = "MainActivity"
        private const val DEFAULT_YOUTUBE_URL = "https://m.youtube.com"
    }
}
