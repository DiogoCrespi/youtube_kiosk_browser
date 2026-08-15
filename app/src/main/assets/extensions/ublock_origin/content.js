// Auto-Skip & Anti-Ad Engine para Player do YouTube Mobile
(function() {
    'use strict';

    function skipAds() {
        // 1. Detecta vídeo de anúncio em execução
        const video = document.querySelector('video');
        const adContainer = document.querySelector('.ad-showing, .ad-interrupting, .ytp-ad-player-overlay');

        if (adContainer && video && !isNaN(video.duration) && video.duration > 0) {
            try {
                // Acelera o anúncio para o final imediatamente
                video.playbackRate = 16.0;
                video.muted = true;
                video.currentTime = video.duration;
            } catch (e) {}
        }

        // 2. Clica automaticamente em qualquer botão de pular anúncio
        const skipButtons = document.querySelectorAll(
            '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-slot, [id*="skip-button"], button.ytp-ad-overlay-close-button'
        );
        skipButtons.forEach(btn => {
            if (btn && typeof btn.click === 'function') {
                btn.click();
            }
        });

        // 3. Fecha diálogos de promoção do YouTube Premium / App
        const dismissButtons = document.querySelectorAll(
            'ytm-mealbar-promo-renderer button[aria-label="Dismiss"], ytm-mealbar-promo-renderer button.cbox-cancel, .yt-spec-button-shape-next--tonal'
        );
        dismissButtons.forEach(btn => {
            if (btn && typeof btn.click === 'function') {
                btn.click();
            }
        });
    }

    // Executa em alta frequência no início
    setInterval(skipAds, 250);

    // Observador de mutações do DOM
    const observer = new MutationObserver(skipAds);
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
})();
