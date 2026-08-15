// Video Background Play Fix - GeckoView Native Visibility Engine
(function() {
    'use strict';

    const scriptCode = `
        (function() {
            // 1. Congela Page Visibility API como 'visible' permanente em todos os níveis
            try {
                const props = {
                    'hidden': { get: function() { return false; }, enumerable: true, configurable: true },
                    'visibilityState': { get: function() { return 'visible'; }, enumerable: true, configurable: true },
                    'webkitHidden': { get: function() { return false; }, enumerable: true, configurable: true },
                    'webkitVisibilityState': { get: function() { return 'visible'; }, enumerable: true, configurable: true }
                };
                Object.defineProperties(document, props);
                if (typeof Document !== 'undefined') Object.defineProperties(Document.prototype, props);
                if (typeof HTMLDocument !== 'undefined') Object.defineProperties(HTMLDocument.prototype, props);
                Document.prototype.hasFocus = function() { return true; };
            } catch (e) {}

            // 2. Silencia eventos de perda de visibilidade e foco
            ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'blur'].forEach(function(evt) {
                window.addEventListener(evt, function(e) { e.stopImmediatePropagation(); }, true);
                document.addEventListener(evt, function(e) { e.stopImmediatePropagation(); }, true);
            });

            // 3. Garante que IntersectionObserver considere o player sempre 100% visível
            try {
                const OrigIO = window.IntersectionObserver;
                window.IntersectionObserver = function(callback, options) {
                    const proxiedCallback = function(entries, observer) {
                        entries.forEach(function(entry) {
                            try {
                                Object.defineProperty(entry, 'isIntersecting', { value: true, configurable: true });
                                Object.defineProperty(entry, 'intersectionRatio', { value: 1.0, configurable: true });
                            } catch (e) {}
                        });
                        return callback(entries, observer);
                    };
                    return new OrigIO(proxiedCallback, options);
                };
                window.IntersectionObserver.prototype = OrigIO.prototype;
            } catch (e) {}

            // 4. Auto-dismiss de diálogos de inatividade ("Continuar assistindo?")
            setInterval(function() {
                try {
                    const confirmBtn = document.querySelector('yt-confirm-dialog-renderer button') ||
                                      document.querySelector('tp-yt-paper-dialog button') ||
                                      document.querySelector('.yt-spec-button-shape-next--filled');
                    if (confirmBtn && confirmBtn.offsetParent !== null) {
                        confirmBtn.click();
                    }
                } catch (e) {}
            }, 3000);

            console.log("[BackgroundFix] Visibility, Focus, Intersection e Inactivity Protections ativas.");
        })();
    `;

    try {
        const scriptEl = document.createElement('script');
        scriptEl.textContent = scriptCode;
        (document.head || document.documentElement).appendChild(scriptEl);
        scriptEl.remove();
    } catch (e) {
        console.error("[BackgroundFix] Erro ao injetar script no DOM", e);
    }
})();
