package com.youtube.kiosk.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.youtube.kiosk.R
import com.youtube.kiosk.ui.MainActivity
import java.net.HttpURLConnection
import java.net.URL

class PlaybackService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private var mediaSession: MediaSessionCompat? = null

    private var currentTitle: String = "YouTube"
    private var currentArtist: String = "YouTube Kiosk"
    private var isPlayingState: Boolean = false
    private var currentPosition: Long = 0L
    private var currentDuration: Long = 0L
    private var currentSpeed: Float = 1.0f
    private var currentArtworkUrl: String? = null
    private var currentArtworkBitmap: Bitmap? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
        initMediaSession()
    }

    private fun initMediaSession() {
        mediaSession = MediaSessionCompat(this, "YouTubeKioskMediaSession").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    isPlayingState = true
                    PlaybackSessionManager.playFromUser(this@PlaybackService)
                    updatePlaybackState()
                    val notif = buildNotification()
                    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    manager.notify(NOTIFICATION_ID, notif)
                }

                override fun onPause() {
                    isPlayingState = false
                    PlaybackSessionManager.pauseFromUser(this@PlaybackService)
                    updatePlaybackState()
                    val notif = buildNotification()
                    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    manager.notify(NOTIFICATION_ID, notif)
                }

                override fun onSeekTo(pos: Long) {
                    currentPosition = pos
                    PlaybackSessionManager.seekTo(pos)
                    updatePlaybackState()
                }

                override fun onSkipToNext() {
                    PlaybackSessionManager.nextTrack()
                }

                override fun onSkipToPrevious() {
                    PlaybackSessionManager.previousTrack()
                }

                override fun onFastForward() {
                    PlaybackSessionManager.seekBy(10)
                }

                override fun onRewind() {
                    PlaybackSessionManager.seekBy(-10)
                }

                override fun onStop() {
                    PlaybackSessionManager.pauseFromUser(this@PlaybackService)
                    stopSelf()
                }
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        when (action) {
            ACTION_STOP -> {
                PlaybackSessionManager.pauseFromUser(this)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_PLAY -> {
                isPlayingState = true
                PlaybackSessionManager.playFromUser(this)
                updatePlaybackState()
                val notif = buildNotification()
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIFICATION_ID, notif)
                return START_STICKY
            }
            ACTION_PAUSE -> {
                isPlayingState = false
                PlaybackSessionManager.pauseFromUser(this)
                updatePlaybackState()
                val notif = buildNotification()
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIFICATION_ID, notif)
                return START_STICKY
            }
            ACTION_NEXT -> {
                PlaybackSessionManager.nextTrack()
                return START_STICKY
            }
            ACTION_PREV -> {
                PlaybackSessionManager.previousTrack()
                return START_STICKY
            }
        }



        val title = intent?.getStringExtra(EXTRA_TITLE) ?: currentTitle
        val artist = intent?.getStringExtra(EXTRA_ARTIST) ?: currentArtist
        val isPlaying = intent?.getBooleanExtra(EXTRA_IS_PLAYING, isPlayingState) ?: isPlayingState
        val positionMs = intent?.getLongExtra(EXTRA_POSITION_MS, currentPosition) ?: currentPosition
        val durationMs = intent?.getLongExtra(EXTRA_DURATION_MS, currentDuration) ?: currentDuration
        val speed = intent?.getFloatExtra(EXTRA_SPEED, currentSpeed) ?: currentSpeed
        val artworkUrl = intent?.getStringExtra(EXTRA_ARTWORK_URL)

        val metadataChanged = (title != currentTitle || artist != currentArtist || durationMs != currentDuration)

        currentTitle = title
        currentArtist = artist
        isPlayingState = isPlaying
        currentPosition = positionMs
        currentDuration = durationMs
        currentSpeed = speed

        if (!artworkUrl.isNullOrBlank()) {
            val cached = bitmapCache.get(artworkUrl)
            if (cached != null) {
                currentArtworkBitmap = cached
                currentArtworkUrl = artworkUrl
            } else if (artworkUrl != currentArtworkUrl || currentArtworkBitmap == null) {
                loadArtworkAsync(artworkUrl)
            }
        }

        if (metadataChanged) {
            updateMetadata()
        }
        updatePlaybackState()

        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        return START_STICKY
    }

    private var isDownloadingArtwork = false

    private fun loadArtworkAsync(url: String) {
        val cached = bitmapCache.get(url)
        if (cached != null) {
            currentArtworkBitmap = cached
            currentArtworkUrl = url
            updateMetadata()
            val notification = buildNotification()
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, notification)
            return
        }

        if (isDownloadingArtwork && url == currentArtworkUrl) return
        isDownloadingArtwork = true
        currentArtworkUrl = url
        Thread {
            try {
                val candidates = ArrayList<String>()
                val videoIdMatch = "(?:[?&]v=|shorts/|youtu\\.be/|/vi/)([a-zA-Z0-9_-]{11})".toRegex().find(url)
                val videoId = videoIdMatch?.groupValues?.get(1)
                if (videoId != null) {
                    // hqdefault.jpg é garantido para 100% dos vídeos e responde em <40ms
                    candidates.add("https://i.ytimg.com/vi/$videoId/hqdefault.jpg")
                    candidates.add("https://i.ytimg.com/vi/$videoId/mqdefault.jpg")
                    candidates.add("https://i.ytimg.com/vi/$videoId/maxresdefault.jpg")
                    candidates.add("https://i.ytimg.com/vi/$videoId/sddefault.jpg")
                } else {
                    candidates.add(url)
                }

                var downloadedBmp: Bitmap? = null
                for (candUrl in candidates) {
                    try {
                        val conn = (URL(candUrl).openConnection() as HttpURLConnection).apply {
                            doInput = true
                            connectTimeout = 3000
                            readTimeout = 3000
                            instanceFollowRedirects = true
                            setRequestProperty("User-Agent", "Mozilla/5.0 (Android)")
                        }
                        conn.connect()
                        if (conn.responseCode == 200) {
                            val bmp = BitmapFactory.decodeStream(conn.inputStream)
                            if (bmp != null && bmp.width > 120) {
                                downloadedBmp = bmp
                                bitmapCache.put(url, bmp)
                                if (videoId != null) {
                                    bitmapCache.put("https://i.ytimg.com/vi/$videoId/hqdefault.jpg", bmp)
                                }
                                Log.d(TAG, "Thumbnail baixada com sucesso de $candUrl (${bmp.width}x${bmp.height})")
                                break
                            }
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "Falha ao tentar URL candidata: $candUrl")
                    }
                }

                if (downloadedBmp != null) {
                    currentArtworkBitmap = downloadedBmp
                    updateMetadata()
                    val notification = buildNotification()
                    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    manager.notify(NOTIFICATION_ID, notification)
                    Log.d(TAG, "Thumbnail do vídeo carregada com sucesso na Ilha HyperOS: ${downloadedBmp.width}x${downloadedBmp.height}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao baixar thumbnail do vídeo: $url", e)
            } finally {
                isDownloadingArtwork = false
            }
        }.start()
    }


    private fun updateMetadata() {
        val builder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "YouTube")
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, if (currentDuration > 0) currentDuration else -1L)

        currentArtworkUrl?.let { uri ->
            builder.putString(MediaMetadataCompat.METADATA_KEY_ART_URI, uri)
            builder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, uri)
            builder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, uri)
        }

        currentArtworkBitmap?.let { bmp ->
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, bmp)
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bmp)
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, bmp)
        }

        mediaSession?.setMetadata(builder.build())
    }


    private fun updatePlaybackState() {
        val stateInt = if (isPlayingState) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        val actions = (
            PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_STOP or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_FAST_FORWARD or
            PlaybackStateCompat.ACTION_REWIND
        )

        val playbackState = PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(stateInt, currentPosition, if (isPlayingState) currentSpeed else 0f)
            .build()
        mediaSession?.setPlaybackState(playbackState)
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "YouTubeKiosk:PlaybackWakeLock")
            wakeLock?.acquire(3 * 60 * 60 * 1000L)
            Log.d(TAG, "WakeLock adquirido para reprodução com tela desligada.")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao adquirir WakeLock", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d(TAG, "WakeLock liberado.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao liberar WakeLock", e)
        }
    }

    private fun getActionPendingIntent(action: String, requestCode: Int): PendingIntent {
        val intent = Intent(this, PlaybackService::class.java).apply { this.action = action }
        return PendingIntent.getService(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingOpen = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val sessionToken = mediaSession?.sessionToken

        val prevPending = getActionPendingIntent(ACTION_PREV, 10)
        val playPausePending = if (isPlayingState) getActionPendingIntent(ACTION_PAUSE, 11) else getActionPendingIntent(ACTION_PLAY, 11)
        val nextPending = getActionPendingIntent(ACTION_NEXT, 12)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingOpen)
            .setOngoing(isPlayingState)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "Anterior", prevPending)
            .addAction(
                if (isPlayingState) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlayingState) "Pausar" else "Reproduzir",
                playPausePending
            )
            .addAction(android.R.drawable.ic_media_next, "Próximo", nextPending)

        currentArtworkBitmap?.let { bmp ->
            builder.setLargeIcon(bmp)
        }

        if (sessionToken != null) {
            builder.setStyle(
                MediaStyle()
                    .setMediaSession(sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
        }

        return builder.build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Reprodução em Segundo Plano",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Controles de mídia na ilha dinâmica e tela de bloqueio do HyperOS"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        mediaSession?.isActive = false
        mediaSession?.release()
        Log.d(TAG, "PlaybackService destruído.")
    }

    companion object {
        private const val TAG = "PlaybackService"
        private const val CHANNEL_ID = "youtube_playback_channel"
        private const val NOTIFICATION_ID = 1001

        val bitmapCache = androidx.collection.LruCache<String, Bitmap>(20)

        fun preloadArtwork(url: String?) {
            if (url.isNullOrBlank()) return
            if (bitmapCache.get(url) != null) return
            Thread {
                try {
                    val candidates = ArrayList<String>()
                    val videoIdMatch = "(?:[?&]v=|shorts/|youtu\\.be/|/vi/)([a-zA-Z0-9_-]{11})".toRegex().find(url)
                    val videoId = videoIdMatch?.groupValues?.get(1)
                    if (videoId != null) {
                        candidates.add("https://i.ytimg.com/vi/$videoId/hqdefault.jpg")
                        candidates.add("https://i.ytimg.com/vi/$videoId/mqdefault.jpg")
                    } else {
                        candidates.add(url)
                    }

                    for (candUrl in candidates) {
                        try {
                            val conn = (URL(candUrl).openConnection() as HttpURLConnection).apply {
                                doInput = true
                                connectTimeout = 2500
                                readTimeout = 2500
                                instanceFollowRedirects = true
                                setRequestProperty("User-Agent", "Mozilla/5.0 (Android)")
                            }
                            conn.connect()
                            if (conn.responseCode == 200) {
                                val bmp = BitmapFactory.decodeStream(conn.inputStream)
                                if (bmp != null && bmp.width > 120) {
                                    bitmapCache.put(url, bmp)
                                    if (videoId != null) {
                                        bitmapCache.put("https://i.ytimg.com/vi/$videoId/hqdefault.jpg", bmp)
                                    }
                                    Log.d(TAG, "Preload de thumbnail concluído com sucesso: $candUrl")
                                    break
                                }
                            }
                        } catch (e: Exception) {}
                    }
                } catch (e: Exception) {}
            }.start()
        }

        const val ACTION_STOP = "com.youtube.kiosk.STOP_PLAYBACK"
        const val ACTION_PLAY = "com.youtube.kiosk.ACTION_PLAY"
        const val ACTION_PAUSE = "com.youtube.kiosk.ACTION_PAUSE"
        const val ACTION_NEXT = "com.youtube.kiosk.ACTION_NEXT"
        const val ACTION_PREV = "com.youtube.kiosk.ACTION_PREV"

        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_ARTIST = "extra_artist"
        const val EXTRA_IS_PLAYING = "extra_is_playing"
        const val EXTRA_POSITION_MS = "extra_position_ms"
        const val EXTRA_DURATION_MS = "extra_duration_ms"
        const val EXTRA_SPEED = "extra_speed"
        const val EXTRA_ARTWORK_URL = "extra_artwork_url"

        fun start(
            context: Context,
            title: String = "YouTube",
            artist: String = "YouTube Kiosk",
            isPlaying: Boolean = true,
            positionMs: Long = 0L,
            durationMs: Long = 0L,
            playbackSpeed: Float = 1.0f,
            artworkUrl: String? = null
        ) {
            val intent = Intent(context, PlaybackService::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_ARTIST, artist)
                putExtra(EXTRA_IS_PLAYING, isPlaying)
                putExtra(EXTRA_POSITION_MS, positionMs)
                putExtra(EXTRA_DURATION_MS, durationMs)
                putExtra(EXTRA_SPEED, playbackSpeed)
                if (artworkUrl != null) {
                    putExtra(EXTRA_ARTWORK_URL, artworkUrl)
                }
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao iniciar PlaybackService", e)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, PlaybackService::class.java)
            context.stopService(intent)
        }
    }
}
