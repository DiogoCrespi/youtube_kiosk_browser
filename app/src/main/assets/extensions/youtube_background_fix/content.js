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

    // 8. In-App Floating Miniplayer Engine
    let isMiniplayerActive = false;
    let miniplayerBar = null;
    let miniplayerMinimizeBtn = null;
    let feedOverlay = null;
    let cachedHomeFeedHtml = null;
    let lastWatchUrl = '';

    function isWatchPage() {
        return (win.location.pathname === '/watch' || (win.location.href || '').includes('v='));
    }

    function updateMiniplayerMetadata() {
        if (!miniplayerBar) return;
        const titleEl = miniplayerBar.querySelector('#kiosk-miniplayer-title');
        const authorEl = miniplayerBar.querySelector('#kiosk-miniplayer-author');

        let title = '';
        let author = '';

        if (win.navigator && win.navigator.mediaSession && win.navigator.mediaSession.metadata) {
            title = win.navigator.mediaSession.metadata.title || '';
            author = win.navigator.mediaSession.metadata.artist || '';
        }

        if (!title) {
            const domTitle = doc.querySelector('.slim-video-metadata-title, .ytm-video-title, h1.title, .watch-header-title, ytm-slim-video-metadata-section-renderer h2');
            if (domTitle) title = domTitle.textContent.trim();
        }
        if (!title && doc.title) {
            title = doc.title.replace(' - YouTube', '').trim();
        }

        if (!author) {
            const domAuthor = doc.querySelector('.slim-owner-channel-name, .ytm-channel-name, .owner-name');
            if (domAuthor) author = domAuthor.textContent.trim();
        }

        if (titleEl) titleEl.textContent = title || 'Reproduzindo vídeo';
        if (authorEl) authorEl.textContent = author || 'YouTube';
    }

    function createInAppMiniplayerUI() {
        if (doc.getElementById('kiosk-inapp-miniplayer-bar')) return;

        miniplayerBar = doc.createElement('div');
        miniplayerBar.id = 'kiosk-inapp-miniplayer-bar';
        miniplayerBar.innerHTML = `
            <div id="kiosk-miniplayer-click-target">
                <div id="kiosk-miniplayer-text-group">
                    <div id="kiosk-miniplayer-title">Reproduzindo vídeo</div>
                    <div id="kiosk-miniplayer-author">YouTube</div>
                </div>
            </div>
            <div id="kiosk-miniplayer-actions">
                <button id="kiosk-miniplayer-btn-playpause" aria-label="Play/Pause">
                    <svg id="kiosk-miniplayer-icon-pause" viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    <svg id="kiosk-miniplayer-icon-play" viewBox="0 0 24 24" width="22" height="22" fill="#fff" style="display:none;"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <button id="kiosk-miniplayer-btn-close" aria-label="Fechar">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
            <div id="kiosk-miniplayer-progress-track">
                <div id="kiosk-miniplayer-progress-fill"></div>
            </div>
        `;

        feedOverlay = doc.createElement('div');
        feedOverlay.id = 'kiosk-browse-feed-overlay';

        (doc.body || doc.documentElement).appendChild(miniplayerBar);
        (doc.body || doc.documentElement).appendChild(feedOverlay);

        const clickTarget = miniplayerBar.querySelector('#kiosk-miniplayer-click-target');
        if (clickTarget) {
            clickTarget.addEventListener('click', function(e) {
                e.stopPropagation();
                expandFromMiniplayer();
            });
        }

        const btnPlayPause = miniplayerBar.querySelector('#kiosk-miniplayer-btn-playpause');
        if (btnPlayPause) {
            btnPlayPause.addEventListener('click', function(e) {
                e.stopPropagation();
                const video = doc.querySelector('video');
                const player = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
                if (video) {
                    if (video.paused) {
                        if (player && typeof player.playVideo === 'function') player.playVideo();
                        else video.play().catch(function(){});
                    } else {
                        if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
                        else video.pause();
                    }
                }
            });
        }

        const btnClose = miniplayerBar.querySelector('#kiosk-miniplayer-btn-close');
        if (btnClose) {
            btnClose.addEventListener('click', function(e) {
                e.stopPropagation();
                closeMiniplayerAndPause();
            });
        }

        const playerContainer = doc.getElementById('player-container-id') || doc.querySelector('ytm-player') || doc.querySelector('.player-container');
        if (playerContainer) {
            playerContainer.addEventListener('click', function(e) {
                if (isMiniplayerActive) {
                    e.stopPropagation();
                    expandFromMiniplayer();
                }
            });
        }
    }

    function createMinimizeButtonOnPlayer() {
        if (doc.getElementById('kiosk-inapp-minimize-btn')) return;
        const playerContainer = doc.getElementById('player-container-id') || doc.querySelector('ytm-player') || doc.querySelector('.player-container');
        if (!playerContainer) return;

        miniplayerMinimizeBtn = doc.createElement('button');
        miniplayerMinimizeBtn.id = 'kiosk-inapp-minimize-btn';
        miniplayerMinimizeBtn.setAttribute('aria-label', 'Minimizar vídeo');
        miniplayerMinimizeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>`;
        miniplayerMinimizeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            enterInAppMiniplayer();
        });

        playerContainer.style.position = 'relative';
        playerContainer.appendChild(miniplayerMinimizeBtn);
    }

    function enterInAppMiniplayer() {
        if (!isWatchPage()) return;
        lastWatchUrl = win.location.href;
        isMiniplayerActive = true;
        createInAppMiniplayerUI();
        updateMiniplayerMetadata();
        doc.documentElement.classList.add('kiosk-inapp-miniplayer-active');
        loadHomeFeedIntoOverlay();

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
        const player = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
        if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
        else if (video) video.pause();
    }

    function loadHomeFeedIntoOverlay() {
        if (!feedOverlay) return;
        if (cachedHomeFeedHtml) {
            feedOverlay.innerHTML = cachedHomeFeedHtml;
            attachFeedCardClickListeners();
            return;
        }

        feedOverlay.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: #888888; font-family: Roboto, Arial, sans-serif; font-size: 14px;">Carregando recomendações...</div>';

        fetch('https://m.youtube.com/')
            .then(function(res) { return res.text(); })
            .then(function(html) {
                const parser = new DOMParser();
                const dom = parser.parseFromString(html, 'text/html');
                const mediaItems = dom.querySelectorAll('ytm-media-item, ytm-rich-item-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer');
                
                if (mediaItems.length > 0) {
                    feedOverlay.innerHTML = '';
                    mediaItems.forEach(function(item) {
                        const link = item.querySelector('a[href*="watch"]');
                        const img = item.querySelector('img');
                        const titleEl = item.querySelector('.media-item-headline, .compact-media-item-headline, h3, .ytm-media-item-title');
                        const metaEl = item.querySelector('.media-item-byline, .compact-media-item-byline, .small-text');
                        const durationEl = item.querySelector('.badge-shape-wiz__text, ytm-thumbnail-overlay-time-status-renderer');

                        if (link && link.getAttribute('href')) {
                            const card = doc.createElement('div');
                            card.className = 'kiosk-feed-card';
                            const href = link.getAttribute('href');
                            const fullHref = href.startsWith('http') ? href : ('https://m.youtube.com' + href);
                            
                            const title = titleEl ? titleEl.textContent.trim() : 'Vídeo';
                            const meta = metaEl ? metaEl.textContent.trim() : 'YouTube';
                            const thumbSrc = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
                            const duration = durationEl ? durationEl.textContent.trim() : '';

                            card.innerHTML = `
                                <div class="kiosk-feed-thumbnail-wrapper">
                                    ${thumbSrc ? `<img class="kiosk-feed-thumbnail" src="${thumbSrc}" loading="lazy" />` : ''}
                                    ${duration ? `<span class="kiosk-feed-duration">${duration}</span>` : ''}
                                </div>
                                <div class="kiosk-feed-details">
                                    <div class="kiosk-feed-info">
                                        <div class="kiosk-feed-title">${title}</div>
                                        <div class="kiosk-feed-meta">${meta}</div>
                                    </div>
                                </div>
                            `;

                            card.addEventListener('click', function(e) {
                                e.stopPropagation();
                                playNewVideoFromFeed(fullHref);
                            });

                            feedOverlay.appendChild(card);
                        }
                    });
                    cachedHomeFeedHtml = feedOverlay.innerHTML;
                } else {
                    feedOverlay.innerHTML = dom.body.innerHTML;
                    attachFeedCardClickListeners();
                }
            })
            .catch(function(e) {
                console.error('[YouTubeKiosk] Erro ao carregar feed da Home:', e);
            });
    }

    function attachFeedCardClickListeners() {
        if (!feedOverlay) return;
        feedOverlay.querySelectorAll('a[href*="watch"], .kiosk-feed-card').forEach(function(el) {
            el.addEventListener('click', function(e) {
                const link = el.tagName === 'A' ? el : el.querySelector('a');
                if (link && link.href) {
                    e.preventDefault();
                    e.stopPropagation();
                    playNewVideoFromFeed(link.href);
                }
            });
        });
    }

    function playNewVideoFromFeed(videoUrl) {
        expandFromMiniplayer();
        const vMatch = videoUrl.match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const player = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
        if (vMatch && vMatch[1] && player && typeof player.loadVideoById === 'function') {
            player.loadVideoById(vMatch[1]);
            win.history.pushState(null, '', videoUrl);
        } else {
            win.location.href = videoUrl;
        }
    }

    function interceptHomeAndLogoClicks() {
        doc.addEventListener('click', function(e) {
            if (!isWatchPage() || isMiniplayerActive) return;

            const logo = e.target.closest('a.mobile-topbar-logo, a[href="/"], ytm-home-logo, .mobile-topbar-logo, [tab-content-id="pivot-w2w"], a[href="/feed/subscriptions"], a[href="/feed/library"]');
            if (logo) {
                e.preventDefault();
                e.stopPropagation();
                enterInAppMiniplayer();
            }
        }, true);
    }

    function syncMiniplayerState() {
        if (isWatchPage()) {
            createMinimizeButtonOnPlayer();
        }

        if (!isMiniplayerActive || !miniplayerBar) return;
        const video = doc.querySelector('video');
        if (!video) return;

        const iconPause = miniplayerBar.querySelector('#kiosk-miniplayer-icon-pause');
        const iconPlay = miniplayerBar.querySelector('#kiosk-miniplayer-icon-play');
        if (iconPause && iconPlay) {
            if (video.paused) {
                iconPause.style.display = 'none';
                iconPlay.style.display = 'block';
            } else {
                iconPause.style.display = 'block';
                iconPlay.style.display = 'none';
            }
        }

        const progressFill = miniplayerBar.querySelector('#kiosk-miniplayer-progress-fill');
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
