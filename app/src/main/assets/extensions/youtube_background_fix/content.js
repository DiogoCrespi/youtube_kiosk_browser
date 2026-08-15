// Video Background Play Fix - GeckoView Native Visibility Engine
(function() {
    'use strict';

    const scriptCode = `
        (function() {
            // 1. Congela Page Visibility API como 'visible' permanente
            try {
                Object.defineProperties(document, {
                    'hidden': { value: false, writable: false, configurable: true },
                    'visibilityState': { value: 'visible', writable: false, configurable: true },
                    'webkitHidden': { value: false, writable: false, configurable: true },
                    'webkitVisibilityState': { value: 'visible', writable: false, configurable: true }
                });
                if (typeof Document !== 'undefined') {
                    Object.defineProperties(Document.prototype, {
                        'hidden': { value: false, writable: false, configurable: true },
                        'visibilityState': { value: 'visible', writable: false, configurable: true },
                        'webkitHidden': { value: false, writable: false, configurable: true },
                        'webkitVisibilityState': { value: 'visible', writable: false, configurable: true }
                    });
                }
            } catch (e) {}

            // 2. Silencia eventos de perda de visibilidade e foco
            ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'freeze', 'blur'].forEach(function(evt) {
                window.addEventListener(evt, function(e) { e.stopImmediatePropagation(); }, true);
                document.addEventListener(evt, function(e) { e.stopImmediatePropagation(); }, true);
            });

            console.log("[BackgroundFix] Visibility API spoofing ativa.");
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
