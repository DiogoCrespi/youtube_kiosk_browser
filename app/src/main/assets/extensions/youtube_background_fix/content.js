// ==========================================================================
// YouTube Kiosk Browser - Background Playback, PiP & Media Command Engine
// ==========================================================================
(function() {
    'use strict';

    // 1. Congela Page Visibility API no escopo da extensão
    try {
        const props = {
            'hidden': { get: function() { return false; }, enumerable: true, configurable: true },
            'visibilityState': { get: function() { return 'visible'; }, enumerable: true, configurable: true },
            'webkitHidden': { get: function() { return false; }, enumerable: true, configurable: true },
            'webkitVisibilityState': { get: function() { return 'visible'; }, enumerable: true, configurable: true }
        };
        if (typeof Document !== 'undefined') Object.defineProperties(Document.prototype, props);
        if (typeof HTMLDocument !== 'undefined') Object.defineProperties(HTMLDocument.prototype, props);
        Object.defineProperties(document, props);
        Document.prototype.hasFocus = function() { return true; };
        document.hasFocus = function() { return true; };
    } catch (e) {}

    // 2. Intercepta e neutraliza eventos de perda de visibilidade e foco
    ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'blur', 'focusout'].forEach(function(evt) {
        const handler = function(e) {
            if (evt === 'blur' || evt === 'focusout') {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
                    return;
                }
            }
            e.stopImmediatePropagation();
        };
        window.addEventListener(evt, handler, true);
        document.addEventListener(evt, handler, true);
    });

    // 3. Injeta script no escopo global da página
    const scriptCode = 
    (function() {
        if (window.__kioskEngineInitialized) return;
        window.__kioskEngineInitialized = true;
        window.__kioskUserPaused = false;

        try {
            const props = {
                'hidden': { get: function() { return false; }, enumerable: true, configurable: true },
                'visibilityState': { get: function() { return 'visible'; }, enumerable: true, configurable: true },
                'webkitHidden': { get: function() { return false; }, enumerable: true, configurable: true },
                'webkitVisibilityState': { get: function() { return 'visible'; }, enumerable: true, configurable: true }
            };
            if (typeof Document !== 'undefined') Object.defineProperties(Document.prototype, props);
            if (typeof HTMLDocument !== 'undefined') Object.defineProperties(HTMLDocument.prototype, props);
            Object.defineProperties(document, props);
            Document.prototype.hasFocus = function() { return true; };
            document.hasFocus = function() { return true; };
        } catch (e) {}

        ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'blur', 'focusout'].forEach(function(evt) {
            const handler = function(e) {
                if (evt === 'blur' || evt === 'focusout') {
                    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
                        return;
                    }
                }
                e.stopImmediatePropagation();
            };
            window.addEventListener(evt, handler, true);
            document.addEventListener(evt, handler, true);
        });

        // Anti-Inatividade
        setInterval(function() {
            try {
                window._lact = Date.now();
                const confirmBtn = document.querySelector('yt-confirm-dialog-renderer button, tp-yt-paper-dialog button, .yt-spec-button-shape-next--filled');
                if (confirmBtn && confirmBtn.offsetParent !== null) {
                    confirmBtn.click();
                }
            } catch (e) {}
        }, 2500);

        // Escudo Anti-Pausa para <video>
        function protectVideo(video) {
            if (!video || video.__kioskShielded) return;
            video.__kioskShielded = true;

            video.addEventListener('pause', function() {
                if (!window.__kioskUserPaused && !video.ended) {
                    setTimeout(function() {
                        if (!window.__kioskUserPaused && video.paused && !video.ended) {
                            video.play().catch(function() {});
                        }
                    }, 25);
                }
            });
        }

        const vObserver = new MutationObserver(function() {
            document.querySelectorAll('video').forEach(protectVideo);
        });
        if (document.documentElement) {
            vObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
        document.querySelectorAll('video').forEach(protectVideo);

        // Hub Central de Comandos
        window.__kioskExecuteAction = function(action, arg) {
            try {
                const video = document.querySelector('video');
                const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');

                switch (action) {
                    case 'PLAY':
                        window.__kioskUserPaused = false;
                        if (player && typeof player.playVideo === 'function') player.playVideo();
                        else if (video) video.play().catch(function() {});
                        break;

                    case 'PAUSE':
                        window.__kioskUserPaused = true;
                        if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
                        else if (video) video.pause();
                        break;

                    case 'NEXT_VIDEO':
                        window.__kioskUserPaused = false;
                        if (player && typeof player.nextVideo === 'function') {
                            player.nextVideo();
                            return;
                        }
                        const nextBtn = document.querySelector('.ytp-next-button, button.next-button, ytm-playlist-controls .next');
                        if (nextBtn && nextBtn.offsetParent !== null) {
                            nextBtn.click();
                            return;
                        }
                        const nextItem = document.querySelector('ytm-video-with-context-renderer a, ytm-compact-video-renderer a, a.media-item-thumbnail-container, ytm-media-item a');
                        if (nextItem && nextItem.href) {
                            nextItem.click();
                            return;
                        }
                        break;

                    case 'PREV_VIDEO':
                        window.__kioskUserPaused = false;
                        if (player && typeof player.previousVideo === 'function') {
                            player.previousVideo();
                            return;
                        }
                        const prevBtn = document.querySelector('.ytp-prev-button, button.prev-button, ytm-playlist-controls .previous');
                        if (prevBtn && prevBtn.offsetParent !== null) {
                            prevBtn.click();
                            return;
                        }
                        if (video && video.currentTime > 3) {
                            video.currentTime = 0;
                            video.play().catch(function() {});
                        } else {
                            window.history.back();
                        }
                        break;

                    case 'SEEK_TO':
                        const pos = parseFloat(arg);
                        if (!isNaN(pos)) {
                            if (player && typeof player.seekTo === 'function') player.seekTo(pos, true);
                            else if (video) video.currentTime = pos;
                        }
                        break;

                    case 'SEEK_BY':
                        const delta = parseFloat(arg);
                        if (video && !isNaN(delta)) {
                            const target = Math.max(0, video.currentTime + delta);
                            if (player && typeof player.seekTo === 'function') player.seekTo(target, true);
                            else video.currentTime = target;
                        }
                        break;

                    case 'SET_PIP_MODE':
                        const enablePip = (arg === true || arg === 'true');
                        if (enablePip) {
                            document.documentElement.classList.add('kiosk-pip-active');
                        } else {
                            document.documentElement.classList.remove('kiosk-pip-active');

                            // Limpa estilos inline calculados durante o PiP
                            const elementsToReset = [
                                document.getElementById('player'),
                                document.querySelector('ytm-player'),
                                document.getElementById('movie_player'),
                                document.querySelector('.html5-video-player'),
                                document.querySelector('.html5-video-container'),
                                document.querySelector('video')
                            ];
                            elementsToReset.forEach(function(el) {
                                if (el && el.style) {
                                    el.style.removeProperty('width');
                                    el.style.removeProperty('height');
                                    el.style.removeProperty('top');
                                    el.style.removeProperty('left');
                                    el.style.removeProperty('position');
                                    el.style.removeProperty('margin');
                                    el.style.removeProperty('padding');
                                }
                            });
                        }

                        // Força recálculo do layout do player
                        window.dispatchEvent(new Event('resize'));
                        window.dispatchEvent(new Event('orientationchange'));

                        // Dispara em múltiplos ticks para acompanhar a animação de transição do Android
                        [50, 150, 300, 500].forEach(function(delay) {
                            setTimeout(function() {
                                window.dispatchEvent(new Event('resize'));
                                const p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
                                if (p && typeof p.setInternalSize === 'function') {
                                    try { p.setInternalSize(); } catch(e){}
                                }
                            }, delay);
                        });
                        break;
                }
            } catch (err) {
                console.error('[YouTubeKiosk] Erro:', action, err);
            }
        };
    })();
    ;

    try {
        const scriptEl = document.createElement('script');
        scriptEl.textContent = scriptCode;
        (document.head || document.documentElement).appendChild(scriptEl);
        scriptEl.remove();
    } catch (e) {}
})();
