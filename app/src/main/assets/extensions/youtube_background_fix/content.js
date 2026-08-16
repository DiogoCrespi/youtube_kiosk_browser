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

    // 4. Aniquilador de Latência de Anúncios Preroll (0ms)
    function eliminateAdPrerollDelay() {
        try {
            const player = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
            const isAdShowing = doc.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay, ytm-promoted-sparkles-web-renderer');
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
            }
        } catch (err) {
            console.error('[YouTubeKiosk] Erro ao executar ação:', action, err);
        }
    });

    win.__kioskExecuteAction = actionHandler;
    window.__kioskExecuteAction = actionHandler;
})();
