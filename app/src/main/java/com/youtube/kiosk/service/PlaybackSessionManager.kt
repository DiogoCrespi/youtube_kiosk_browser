package com.youtube.kiosk.service

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.youtube.kiosk.YouTubeKioskApp
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.MediaSession as GeckoMediaSession

object PlaybackSessionManager {

    private const val TAG = "PlaybackSessionManager"
    private val mainHandler = Handler(Looper.getMainLooper())

    var session: GeckoSession? = null
        private set

    var mediaSession: GeckoMediaSession? = null
        private set

    @Volatile
    var userWantsPlayback: Boolean = false

    @Volatile
    var isMediaPlaying: Boolean = false

    var currentTitle: String = "YouTube"
    var currentArtist: String = "YouTube Kiosk"
    var currentPositionMs: Long = 0L
    var currentDurationMs: Long = 0L
    var currentSpeed: Float = 1.0f
    var currentArtworkUrl: String? = null
    var currentUrl: String = "https://m.youtube.com"

    var onPlaybackStateChanged: ((isPlaying: Boolean) -> Unit)? = null
    var onMetadataChanged: ((title: String, artist: String, artworkUrl: String?) -> Unit)? = null
    var onPositionChanged: ((posMs: Long, durMs: Long, speed: Float) -> Unit)? = null

    private fun extractThumbnailUrl(url: String): String? {
        val pattern = "(?:[?&]v=|shorts/|youtu\\.be/)([a-zA-Z0-9_-]{11})".toRegex()
        val videoId = pattern.find(url)?.groupValues?.get(1)
        return if (videoId != null) "https://i.ytimg.com/vi/$videoId/hqdefault.jpg" else null
    }

    fun getOrCreateSession(context: Context): GeckoSession {
        session?.let { return it }

        val app = context.applicationContext as? YouTubeKioskApp
        val runtime = app?.geckoRuntime ?: GeckoRuntime.getDefault(context)

        val settings = GeckoSessionSettings.Builder()
            .usePrivateMode(false)
            .userAgentMode(GeckoSessionSettings.USER_AGENT_MODE_MOBILE)
            .suspendMediaWhenInactive(false)
            .allowJavascript(true)
            .build()

        val newSession = GeckoSession(settings)

        newSession.mediaSessionDelegate = object : GeckoMediaSession.Delegate {
            override fun onActivated(s: GeckoSession, mSession: GeckoMediaSession) {
                Log.d(TAG, "GeckoMediaSession onActivated")
                mediaSession = mSession
            }

            override fun onDeactivated(s: GeckoSession, mSession: GeckoMediaSession) {
                Log.d(TAG, "GeckoMediaSession onDeactivated")
                if (mediaSession === mSession) {
                    mediaSession = null
                }
            }

            override fun onMetadata(s: GeckoSession, mSession: GeckoMediaSession, meta: GeckoMediaSession.Metadata) {
                currentTitle = meta.title?.ifEmpty { "YouTube" } ?: "YouTube"
                currentArtist = meta.artist?.ifEmpty { "YouTube Kiosk" } ?: "YouTube Kiosk"

                val art = extractThumbnailUrl(currentUrl)
                if (!art.isNullOrBlank()) {
                    currentArtworkUrl = art
                }

                onMetadataChanged?.invoke(currentTitle, currentArtist, currentArtworkUrl)
                notifyServiceUpdate(context)
            }

            override fun onPositionState(s: GeckoSession, mSession: GeckoMediaSession, posState: GeckoMediaSession.PositionState) {
                currentPositionMs = (posState.position * 1000).toLong()
                currentDurationMs = (posState.duration * 1000).toLong()
                currentSpeed = posState.playbackRate.toFloat()

                onPositionChanged?.invoke(currentPositionMs, currentDurationMs, currentSpeed)
                notifyServiceUpdate(context)
            }

            override fun onPlay(s: GeckoSession, mSession: GeckoMediaSession) {
                Log.d(TAG, "GeckoMediaSession onPlay -> userWantsPlayback = true")
                mediaSession = mSession
                isMediaPlaying = true
                userWantsPlayback = true

                s.setPriorityHint(GeckoSession.PRIORITY_HIGH)
                onPlaybackStateChanged?.invoke(true)
                notifyServiceUpdate(context)
            }

            override fun onPause(s: GeckoSession, mSession: GeckoMediaSession) {
                Log.d(TAG, "GeckoMediaSession onPause (userWantsPlayback: $userWantsPlayback)")
                if (userWantsPlayback) {
                    // Pausa espúria disparada pelo YouTube/Background enquanto o usuário deseja reprodução
                    Log.w(TAG, "Pausa espúria detectada em segundo plano! Disparando auto-recuperação...")
                    mainHandler.postDelayed({
                        if (userWantsPlayback && !isMediaPlaying) {
                            mediaSession?.play()
                            executePlayerCommand("PLAY")
                        }
                    }, 200)
                } else {
                    // Pausa solicitada legitimamente pelo usuário
                    isMediaPlaying = false
                    onPlaybackStateChanged?.invoke(false)
                    notifyServiceUpdate(context)
                }
            }

            override fun onStop(s: GeckoSession, mSession: GeckoMediaSession) {
                Log.d(TAG, "GeckoMediaSession onStop")
                isMediaPlaying = false
                userWantsPlayback = false
                s.setPriorityHint(GeckoSession.PRIORITY_DEFAULT)
                onPlaybackStateChanged?.invoke(false)
                notifyServiceUpdate(context)
            }
        }

        newSession.open(runtime)
        newSession.setPriorityHint(GeckoSession.PRIORITY_HIGH)
        session = newSession
        return newSession
    }

    fun attachToView(geckoView: GeckoView) {
        val currentSession = session ?: return
        if (geckoView.session !== currentSession) {
            geckoView.setSession(currentSession)
        }
        currentSession.setActive(true)
        currentSession.setFocused(true)
    }

    fun detachFromView(geckoView: GeckoView) {
        try {
            geckoView.releaseSession()
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao liberar sessão da View", e)
        }
    }

    fun playFromUser(context: Context? = null) {
        userWantsPlayback = true
        isMediaPlaying = true
        session?.setPriorityHint(GeckoSession.PRIORITY_HIGH)
        mediaSession?.play()
        executePlayerCommand("PLAY")
        if (context != null) notifyServiceUpdate(context)
    }

    fun pauseFromUser(context: Context? = null) {
        userWantsPlayback = false
        isMediaPlaying = false
        mediaSession?.pause()
        executePlayerCommand("PAUSE")
        if (context != null) notifyServiceUpdate(context)
    }

    fun togglePlayPauseFromUser(context: Context? = null) {
        if (isMediaPlaying) {
            pauseFromUser(context)
        } else {
            playFromUser(context)
        }
    }

    fun nextTrack() {
        userWantsPlayback = true
        mediaSession?.nextTrack()
        executePlayerCommand("NEXT_VIDEO")
    }

    fun previousTrack() {
        userWantsPlayback = true
        mediaSession?.previousTrack()
        executePlayerCommand("PREV_VIDEO")
    }

    fun seekTo(positionMs: Long) {
        currentPositionMs = positionMs
        val seconds = positionMs / 1000.0
        mediaSession?.seekTo(seconds, false)
        executePlayerCommand("SEEK_TO", seconds.toString())
    }

    fun seekBy(deltaSeconds: Long) {
        if (deltaSeconds > 0) {
            mediaSession?.seekForward()
        } else {
            mediaSession?.seekBackward()
        }
        executePlayerCommand("SEEK_BY", deltaSeconds.toString())
    }

    fun executePlayerCommand(action: String, arg: String? = null) {
        val argParam = if (arg != null) "'$arg'" else "null"
        val js = "javascript:(function(){ if (window.__kioskExecuteAction) { window.__kioskExecuteAction('$action', $argParam); } else { const v = document.querySelector('video'); const p = document.getElementById('movie_player'); if ('$action' === 'PLAY') { if (p && p.playVideo) p.playVideo(); else if (v) v.play(); } else if ('$action' === 'PAUSE') { if (p && p.pauseVideo) p.pauseVideo(); else if (v) v.pause(); } else if ('$action' === 'PLAY_PAUSE') { if (v && v.paused) { if (p && p.playVideo) p.playVideo(); else v.play(); } else if (v) { if (p && p.pauseVideo) p.pauseVideo(); else v.pause(); } } else if ('$action' === 'NEXT_VIDEO') { if (p && p.nextVideo) p.nextVideo(); else document.querySelector('.ytp-next-button')?.click(); } else if ('$action' === 'PREV_VIDEO') { if (p && p.previousVideo) p.previousVideo(); else if (v && v.currentTime > 3) { v.currentTime = 0; } else { window.history.back(); } } } })()"
        mainHandler.post {
            try {
                session?.loadUri(js)
            } catch (e: Throwable) {
                Log.e(TAG, "Erro ao enviar comando JS: $action", e)
            }
        }
    }

    private fun notifyServiceUpdate(context: Context) {
        PlaybackService.start(
            context,
            title = currentTitle,
            artist = currentArtist,
            isPlaying = isMediaPlaying,
            positionMs = currentPositionMs,
            durationMs = currentDurationMs,
            playbackSpeed = currentSpeed,
            artworkUrl = currentArtworkUrl
        )
    }

    fun closeSession() {
        try {
            session?.close()
            session = null
            mediaSession = null
            userWantsPlayback = false
            isMediaPlaying = false
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao fechar sessão", e)
        }
    }
}
