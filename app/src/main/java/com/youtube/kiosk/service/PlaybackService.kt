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
                    MediaControlDispatcher.onPlayAction?.invoke()
                    updatePlaybackState()
                }

                override fun onPause() {
                    isPlayingState = false
                    MediaControlDispatcher.onPauseAction?.invoke()
                    updatePlaybackState()
                }

                override fun onSeekTo(pos: Long) {
                    currentPosition = pos
                    MediaControlDispatcher.onSeekToAction?.invoke(pos)
                    updatePlaybackState()
                }

                override fun onSkipToNext() {
                    MediaControlDispatcher.onNextAction?.invoke()
                }

                override fun onSkipToPrevious() {
                    MediaControlDispatcher.onPreviousAction?.invoke()
                }

                override fun onFastForward() {
                    MediaControlDispatcher.onFastForwardAction?.invoke()
                }

                override fun onRewind() {
                    MediaControlDispatcher.onRewindAction?.invoke()
                }

                override fun onStop() {
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
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_PLAY -> {
                isPlayingState = true
                MediaControlDispatcher.onPlayAction?.invoke()
                updatePlaybackState()
                return START_STICKY
            }
            ACTION_PAUSE -> {
                isPlayingState = false
                MediaControlDispatcher.onPauseAction?.invoke()
                updatePlaybackState()
                return START_STICKY
            }
            ACTION_NEXT -> {
                MediaControlDispatcher.onNextAction?.invoke()
                return START_STICKY
            }
            ACTION_PREV -> {
                MediaControlDispatcher.onPreviousAction?.invoke()
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

        if (!artworkUrl.isNullOrBlank() && (artworkUrl != currentArtworkUrl || currentArtworkBitmap == null)) {
            loadArtworkAsync(artworkUrl)
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

    private fun loadArtworkAsync(url: String) {
        currentArtworkUrl = url
        Thread {
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.doInput = true
                conn.connectTimeout = 6000
                conn.readTimeout = 6000
                conn.connect()
                val input = conn.inputStream
                val bitmap = BitmapFactory.decodeStream(input)
                if (bitmap != null) {
                    currentArtworkBitmap = bitmap
                    updateMetadata()
                    val notification = buildNotification()
                    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    manager.notify(NOTIFICATION_ID, notification)
                    Log.d(TAG, "Thumbnail do vídeo carregada com sucesso na Ilha HyperOS.")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao baixar thumbnail do vídeo: $url", e)
            }
        }.start()
    }

    private fun updateMetadata() {
        val builder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "YouTube")
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, if (currentDuration > 0) currentDuration else -1L)

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
