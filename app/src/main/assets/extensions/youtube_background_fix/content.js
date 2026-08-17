// ==========================================================================
// YouTube Kiosk Browser - Background Playback, PiP & Media Command Engine
// ==========================================================================
(function() {
    'use strict';

    const win = (typeof window.wrappedJSObject !== 'undefined') ? window.wrappedJSObject : window;
    const doc = win.document || document;

    function safeExport(fn) {
        if (typeof exportFunction === 'function' && win !== window) {
            try {
                return exportFunction(fn, win);
            } catch (e) {}
        }
        return fn;
    }

    // 1. Congela Page Visibility API e hasFocus no escopo do documento
    try {
        const falseFn = safeExport(function() { return false; });
        const visibleFn = safeExport(function() { return 'visible'; });
        const trueFn = safeExport(function() { return true; });

        const props = {
            'hidden': { get: falseFn, enumerable: true, configurable: true },
            'visibilityState': { get: visibleFn, enumerable: true, configurable: true },
            'webkitHidden': { get: falseFn, enumerable: true, configurable: true },
            'webkitVisibilityState': { get: visibleFn, enumerable: true, configurable: true }
        };

        if (win.Document && win.Document.prototype) {
            Object.defineProperties(win.Document.prototype, props);
            win.Document.prototype.hasFocus = trueFn;
        }
        if (win.HTMLDocument && win.HTMLDocument.prototype) {
            Object.defineProperties(win.HTMLDocument.prototype, props);
            win.HTMLDocument.prototype.hasFocus = trueFn;
        }
        if (doc) {
            Object.defineProperties(doc, props);
            doc.hasFocus = trueFn;
        }
    } catch (e) {
        console.error('[YouTubeKiosk] Erro ao registrar propriedades de visibilidade:', e);
    }

    // 2. Intercepta e neutraliza eventos de perda de foco e visibilidade
    ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'blur', 'focusout'].forEach(function(evt) {
        const handler = safeExport(function(e) {
            if (evt === 'blur' || evt === 'focusout') {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
                    return;
                }
            }
            e.stopImmediatePropagation();
        });

        win.addEventListener(evt, handler, true);
        doc.addEventListener(evt, handler, true);
    });

    // 3. Sincronização Contínua de Thumbnail e Metadados do Vídeo
    function syncVideoMetadata() {
        try {
            const vMatch = (win.location.href || '').match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (vMatch && vMatch[1]) {
                const thumb = 'https://i.ytimg.com/vi/' + vMatch[1] + '/hqdefault.jpg';
                if (win.navigator && win.navigator.mediaSession && win.navigator.mediaSession.metadata) {
                    const meta = win.navigator.mediaSession.metadata;
                    if (!meta.artwork || meta.artwork.length === 0) {
                        meta.artwork = [{ src: thumb, sizes: '480x360', type: 'image/jpeg' }];
                    }
                }
            }
        } catch (e) {}
    }
    win.addEventListener('yt-navigate-finish', syncVideoMetadata, true);
    win.addEventListener('popstate', syncVideoMetadata, true);
    setInterval(syncVideoMetadata, 2000);

    // 4. Aniquilador de Latência de Anúncios Preroll (0ms) e Estabilizador de Áudio
    try {
        const style = doc.createElement('style');
        style.textContent = 'ytm-promoted-sparkles-web-renderer, ytm-promoted-video-renderer, ytm-companion-ad-renderer { display: none !important; }';
        (doc.head || doc.documentElement).appendChild(style);
    } catch (e) {}

    function eliminateAdPrerollDelay() {
        try {
            const player = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
            const isAdShowing = doc.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay');
            const video = doc.querySelector('video');

            if (isAdShowing || (player && typeof player.getAdState === 'function' && player.getAdState() > 0)) {
                const skipBtn = doc.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytm-ad-skip-button, .ytp-skip-ad-button, button.ytp-ad-skip-button-text');
                if (skipBtn && skipBtn.offsetParent !== null) {
                    skipBtn.click();
                }

                if (video && !isNaN(video.duration) && video.duration > 0 && video.duration < 120) {
                    video.muted = true;
                    video.playbackRate = 16;
                    video.currentTime = video.duration;
                }
            } else if (video) {
                if (video.muted && video.dataset.kioskManuallyMuted !== 'true') {
                    video.muted = false;
                }
                if (video.volume < 1.0 && video.dataset.kioskManuallyVolume !== 'true') {
                    video.volume = 1.0;
                }
            }
        } catch (e) {}
    }

    const adMutationObserver = new MutationObserver(function() {
        eliminateAdPrerollDelay();
    });
    if (doc.documentElement) {
        adMutationObserver.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    setInterval(eliminateAdPrerollDelay, 100);

    // 5. Manutenção de Atividade Contínua (_lact)
    setInterval(function() {
        try {
            win._lact = Date.now();
            const confirmBtn = doc.querySelector('yt-confirm-dialog-renderer button, tp-yt-paper-dialog button, .yt-spec-button-shape-next--filled');
            if (confirmBtn && confirmBtn.offsetParent !== null) {
                confirmBtn.click();
            }
        } catch (e) {}
    }, 3000);

    // 6. Motor SponsorBlock Nativo de Zero Latência
    const sponsorSegmentsCache = {};
    let currentSponsorVideoId = null;

    function fetchSponsorSegments(videoId) {
        if (!videoId || sponsorSegmentsCache[videoId] !== undefined) return;
        sponsorSegmentsCache[videoId] = [];

        const categories = JSON.stringify(['sponsor', 'intro', 'outro', 'selfpromo', 'interaction', 'music_offtopic']);
        const apiUrl = 'https://sponsor.ajay.app/api/skipSegments?videoID=' + encodeURIComponent(videoId) + '&categories=' + encodeURIComponent(categories);

        fetch(apiUrl)
            .then(function(res) {
                if (res.ok) return res.json();
                return [];
            })
            .then(function(data) {
                if (Array.isArray(data)) {
                    sponsorSegmentsCache[videoId] = data.map(function(item) {
                        return {
                            start: item.segment[0],
                            end: item.segment[1],
                            category: item.category
                        };
                    });
                    console.log('[YouTubeKiosk] SponsorBlock carregou ' + sponsorSegmentsCache[videoId].length + ' segmentos para o vídeo ' + videoId);
                }
            })
            .catch(function() {
                sponsorSegmentsCache[videoId] = [];
            });
    }

    function checkAndSkipSponsorSegments() {
        try {
            const vMatch = (win.location.href || '').match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (!vMatch || !vMatch[1]) return;
            const videoId = vMatch[1];

            if (currentSponsorVideoId !== videoId) {
                currentSponsorVideoId = videoId;
                fetchSponsorSegments(videoId);
            }

            const segments = sponsorSegmentsCache[videoId];
            if (!segments || segments.length === 0) return;

            const video = doc.querySelector('video');
            if (!video || isNaN(video.currentTime) || video.currentTime === 0) return;

            const curr = video.currentTime;
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                if (curr >= seg.start && curr < (seg.end - 0.25)) {
                    console.log('[YouTubeKiosk] SponsorBlock pulando segmento ' + seg.category + ' de ' + seg.start + 's até ' + seg.end + 's');
                    video.currentTime = seg.end;
                    break;
                }
            }
        } catch (e) {}
    }

    win.addEventListener('yt-navigate-finish', function() {
        const vMatch = (win.location.href || '').match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (vMatch && vMatch[1]) {
            fetchSponsorSegments(vMatch[1]);
        }
    }, true);

    setInterval(checkAndSkipSponsorSegments, 150);

    // 7. Hub Central de Ações do Kiosk
    let savedScrollY = 0;

    // 8. In-App Floating Miniplayer Engine (Connected Sidebar + Live Native Feed)
    let isMiniplayerActive = false;
    let miniplayerInfoStrip = null;
    let miniplayerMinimizeBtn = null;

    function isWatchPage() {
        return (win.location.pathname === '/watch' || (win.location.href || '').includes('v='));
    }

    function updateMiniplayerMetadata() {
        if (!miniplayerInfoStrip) return;
        const titleEl = miniplayerInfoStrip.querySelector('#kiosk-miniplayer-title');
        const channelEl = miniplayerInfoStrip.querySelector('#kiosk-miniplayer-channel');

        let title = '';
        let channel = '';

        if (win.navigator && win.navigator.mediaSession && win.navigator.mediaSession.metadata) {
            title = win.navigator.mediaSession.metadata.title || '';
            channel = win.navigator.mediaSession.metadata.artist || '';
        }

        if (!title) {
            const domTitle = doc.querySelector('.slim-video-metadata-title, .ytm-video-title, h1.title, .watch-header-title, ytm-slim-video-metadata-section-renderer h2');
            if (domTitle) title = domTitle.textContent.trim();
        }
        if (!title && doc.title) {
            title = doc.title.replace(' - YouTube', '').trim();
        }

        if (!channel) {
            const domChannel = doc.querySelector('.slim-owner-channel-name, .ytm-channel-name, .owner-name');
            if (domChannel) channel = domChannel.textContent.trim();
        }

        if (titleEl) titleEl.textContent = title || 'Reproduzindo vídeo';
        if (channelEl) channelEl.textContent = channel || 'YouTube';
    }

    function createInAppMiniplayerUI() {
        const watchContainer = doc.querySelector('ytm-watch') || doc.querySelector('.watch-page') || doc.body;
        if (!watchContainer) return;

        if (!doc.getElementById('kiosk-miniplayer-info-strip')) {
            miniplayerInfoStrip = doc.createElement('div');
            miniplayerInfoStrip.id = 'kiosk-miniplayer-info-strip';
            miniplayerInfoStrip.innerHTML = `
                <div id="kiosk-miniplayer-text-wrap">
                    <div id="kiosk-miniplayer-title">Reproduzindo vídeo</div>
                    <div id="kiosk-miniplayer-channel">YouTube</div>
                </div>
                <div id="kiosk-miniplayer-controls">
                    <button id="kiosk-mini-btn-playpause" type="button" aria-label="Play/Pause">
                        <svg id="kiosk-mini-icon-pause" viewBox="0 0 24 24" width="22" height="22"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        <svg id="kiosk-mini-icon-play" viewBox="0 0 24 24" width="22" height="22" style="display:none;"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <button id="kiosk-mini-btn-close" type="button" aria-label="Fechar">
                        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                </div>
                <div id="kiosk-miniplayer-progress-bar">
                    <div id="kiosk-miniplayer-progress-fill"></div>
                </div>
            `;

            // Insere a faixa de informações dentro do container Watch logo após o player
            const playerContainer = watchContainer.querySelector('ytm-player, #player-container-id, .player-container');
            if (playerContainer && playerContainer.nextSibling) {
                watchContainer.insertBefore(miniplayerInfoStrip, playerContainer.nextSibling);
            } else {
                watchContainer.appendChild(miniplayerInfoStrip);
            }

            // 1. Toque na faixa de informações expande o miniplayer de volta
            miniplayerInfoStrip.addEventListener('click', function(e) {
                if (e.target.closest('#kiosk-mini-btn-playpause') || e.target.closest('#kiosk-mini-btn-close')) {
                    return;
                }
                e.stopPropagation();
                expandFromMiniplayer();
            }, false);

            // 2. Botão Play / Pause com captura imediata
            const btnPlayPause = miniplayerInfoStrip.querySelector('#kiosk-mini-btn-playpause');
            if (btnPlayPause) {
                const togglePlayback = function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    const video = doc.querySelector('video');
                    const player = doc.getElementById('movie_player') || (win.wrappedJSObject && win.wrappedJSObject.movie_player);
                    if (player && typeof player.getPlayerState === 'function') {
                        const state = player.getPlayerState();
                        if (state === 1) player.pauseVideo();
                        else player.playVideo();
                    } else if (video) {
                        if (video.paused) video.play().catch(function(){});
                        else video.pause();
                    }
                };
                btnPlayPause.addEventListener('click', togglePlayback, true);
                btnPlayPause.addEventListener('touchend', togglePlayback, true);
            }

            // 3. Botão Fechar (X) com captura imediata
            const btnClose = miniplayerInfoStrip.querySelector('#kiosk-mini-btn-close');
            if (btnClose) {
                const closeMini = function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    closeMiniplayerAndPause();
                };
                btnClose.addEventListener('click', closeMini, true);
                btnClose.addEventListener('touchend', closeMini, true);
            }
        }

        // Toque no container Watch em modo miniplayer expande para tela cheia
        watchContainer.addEventListener('click', function(e) {
            if (isMiniplayerActive) {
                if (e.target.closest('#kiosk-mini-btn-playpause') || e.target.closest('#kiosk-mini-btn-close')) {
                    return;
                }
                e.stopPropagation();
                expandFromMiniplayer();
            }
        }, false);
    }

    function createMinimizeButtonOnPlayer() {
        if (doc.getElementById('kiosk-inapp-minimize-btn')) return;
        const playerContainer = doc.getElementById('player-container-id') || doc.querySelector('ytm-player') || doc.querySelector('.player-container');
        if (!playerContainer) return;

        miniplayerMinimizeBtn = doc.createElement('button');
        miniplayerMinimizeBtn.id = 'kiosk-inapp-minimize-btn';
        miniplayerMinimizeBtn.setAttribute('aria-label', 'Minimizar vídeo');
        miniplayerMinimizeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>`;
        
        const onMinClick = function(e) {
            e.stopPropagation();
            e.preventDefault();
            enterInAppMiniplayer();
        };
        miniplayerMinimizeBtn.addEventListener('click', onMinClick, true);
        miniplayerMinimizeBtn.addEventListener('touchend', onMinClick, true);

        playerContainer.style.position = 'relative';
        playerContainer.appendChild(miniplayerMinimizeBtn);
    }

    function enterInAppMiniplayer() {
        if (!isWatchPage()) return;
        isMiniplayerActive = true;
        createInAppMiniplayerUI();
        updateMiniplayerMetadata();
        doc.documentElement.classList.add('kiosk-inapp-miniplayer-active');

        const watch = doc.querySelector('ytm-watch');
        if (watch) watch.style.display = 'flex';

        [30, 100, 250].forEach(function(delay) {
            setTimeout(function() {
                win.dispatchEvent(new Event('resize'));
            }, delay);
        });
    }

    function expandFromMiniplayer() {
        if (!isMiniplayerActive) return;
        isMiniplayerActive = false;
        doc.documentElement.classList.remove('kiosk-inapp-miniplayer-active');

        const watch = doc.querySelector('ytm-watch');
        if (watch) watch.style.display = 'block';

        [30, 100, 250].forEach(function(delay) {
            setTimeout(function() {
                win.dispatchEvent(new Event('resize'));
                const p = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
                if (p && typeof p.setInternalSize === 'function') {
                    try { p.setInternalSize(); } catch(e){}
                }
            }, delay);
        });
    }

    function closeMiniplayerAndPause() {
        isMiniplayerActive = false;
        doc.documentElement.classList.remove('kiosk-inapp-miniplayer-active');
        const video = doc.querySelector('video');
        const player = doc.getElementById('movie_player') || (win.wrappedJSObject && win.wrappedJSObject.movie_player);
        if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
        else if (video) video.pause();

        const watch = doc.querySelector('ytm-watch');
        if (watch) watch.style.display = 'none';
    }

    function interceptHomeAndLogoClicks() {
        doc.addEventListener('click', function(e) {
            if (!isWatchPage() || isMiniplayerActive) return;

            const logo = e.target.closest('a.mobile-topbar-logo, a[href="/"], ytm-home-logo, .mobile-topbar-logo, [tab-content-id="pivot-w2w"], a[href="/feed/subscriptions"], a[href="/feed/library"]');
            if (logo) {
                enterInAppMiniplayer();
            }
        }, true);
    }

    function syncMiniplayerState() {
        if (isWatchPage()) {
            createMinimizeButtonOnPlayer();
        }

        if (!isMiniplayerActive || !miniplayerInfoStrip) return;
        const video = doc.querySelector('video');
        if (!video) return;

        const iconPause = miniplayerInfoStrip.querySelector('#kiosk-mini-icon-pause');
        const iconPlay = miniplayerInfoStrip.querySelector('#kiosk-mini-icon-play');
        if (iconPause && iconPlay) {
            if (video.paused) {
                iconPause.style.display = 'none';
                iconPlay.style.display = 'block';
            } else {
                iconPause.style.display = 'block';
                iconPlay.style.display = 'none';
            }
        }

        const progressFill = miniplayerInfoStrip.querySelector('#kiosk-miniplayer-progress-fill');
        if (progressFill && !isNaN(video.duration) && video.duration > 0) {
            const pct = (video.currentTime / video.duration) * 100;
            progressFill.style.width = pct + '%';
        }
    }

    interceptHomeAndLogoClicks();
    setInterval(syncMiniplayerState, 250);
    win.addEventListener('yt-navigate-finish', function() {
        if (isWatchPage()) {
            setTimeout(createMinimizeButtonOnPlayer, 300);
            updateMiniplayerMetadata();
        }
    }, true);

    const actionHandler = safeExport(function(action, arg) {
        try {
            const video = doc.querySelector('video');
            const player = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');

            switch (action) {
                case 'PLAY':
                    if (player && typeof player.playVideo === 'function') {
                        player.playVideo();
                    } else if (video) {
                        video.play().catch(function() {});
                    }
                    break;

                case 'PAUSE':
                    if (player && typeof player.pauseVideo === 'function') {
                        player.pauseVideo();
                    } else if (video) {
                        video.pause();
                    }
                    break;

                case 'PLAY_PAUSE':
                    if (video) {
                        if (video.paused) {
                            if (player && typeof player.playVideo === 'function') player.playVideo();
                            else video.play().catch(function() {});
                        } else {
                            if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
                            else video.pause();
                        }
                    }
                    break;

                case 'NEXT_VIDEO':
                    if (player && typeof player.nextVideo === 'function') {
                        player.nextVideo();
                        return;
                    }
                    const nextBtn = doc.querySelector('.ytp-next-button, button.next-button, ytm-playlist-controls .next');
                    if (nextBtn && nextBtn.offsetParent !== null) {
                        nextBtn.click();
                        return;
                    }
                    const nextItem = doc.querySelector('ytm-video-with-context-renderer a, ytm-compact-video-renderer a, a.media-item-thumbnail-container, ytm-media-item a');
                    if (nextItem && nextItem.href) {
                        nextItem.click();
                        return;
                    }
                    break;

                case 'PREV_VIDEO':
                    if (player && typeof player.previousVideo === 'function') {
                        player.previousVideo();
                        return;
                    }
                    const prevBtn = doc.querySelector('.ytp-prev-button, button.prev-button, ytm-playlist-controls .previous');
                    if (prevBtn && prevBtn.offsetParent !== null) {
                        prevBtn.click();
                        return;
                    }
                    if (video && video.currentTime > 3) {
                        video.currentTime = 0;
                        video.play().catch(function() {});
                    } else {
                        win.history.back();
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
                        savedScrollY = win.scrollY || doc.documentElement.scrollTop || 0;
                        doc.documentElement.classList.add('kiosk-pip-active');
                    } else {
                        doc.documentElement.classList.remove('kiosk-pip-active');
                        win.scrollTo(0, savedScrollY || 0);
                    }

                    win.dispatchEvent(new Event('resize'));
                    win.dispatchEvent(new Event('orientationchange'));

                    [30, 100, 250, 500].forEach(function(delay) {
                        setTimeout(function() {
                            win.dispatchEvent(new Event('resize'));
                            const p = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
                            if (p && typeof p.setInternalSize === 'function') {
                                try { p.setInternalSize(); } catch(e){}
                            }
                        }, delay);
                    });
                    break;

                case 'BACK_PRESSED':
                    if (isMiniplayerActive) {
                        expandFromMiniplayer();
                    } else if (isWatchPage()) {
                        enterInAppMiniplayer();
                    } else {
                        if (win.history.length > 1) {
                            win.history.back();
                        }
                    }
                    break;

                case 'ENTER_MINIPLAYER':
                    enterInAppMiniplayer();
                    break;

                case 'EXPAND_MINIPLAYER':
                    expandFromMiniplayer();
                    break;

                case 'CLOSE_MINIPLAYER':
                    closeMiniplayerAndPause();
                    break;
            }
        } catch (err) {
            console.error('[YouTubeKiosk] Erro ao executar ação:', action, err);
        }
    });

    win.__kioskExecuteAction = actionHandler;
    window.__kioskExecuteAction = actionHandler;
})();
