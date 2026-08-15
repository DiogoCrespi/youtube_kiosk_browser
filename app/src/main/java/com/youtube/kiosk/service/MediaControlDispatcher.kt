package com.youtube.kiosk.service

object MediaControlDispatcher {
    var onPlayAction: (() -> Unit)? = null
    var onPauseAction: (() -> Unit)? = null
    var onSeekToAction: ((positionMs: Long) -> Unit)? = null
    var onNextAction: (() -> Unit)? = null
    var onPreviousAction: (() -> Unit)? = null
    var onFastForwardAction: (() -> Unit)? = null
    var onRewindAction: (() -> Unit)? = null
}
