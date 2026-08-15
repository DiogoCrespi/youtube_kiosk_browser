// Bloqueador de Requisições de Anúncios no Nível de Rede
const AD_URL_PATTERNS = [
  "*://*.youtube.com/api/stats/ads*",
  "*://*.youtube.com/pagead/*",
  "*://*.youtube.com/ptracking*",
  "*://*.youtube.com/youtubei/v1/player/ad_break*",
  "*://*.youtube.com/youtubei/v1/log_event*",
  "*://*.googlevideo.com/videoplayback*adformat*",
  "*://*.doubleclick.net/*",
  "*://googleads.g.doubleclick.net/*",
  "*://static.doubleclick.net/*",
  "*://ad.doubleclick.net/*",
  "*://*.google-analytics.com/*",
  "*://*.googletagmanager.com/*"
];

browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    return { cancel: true };
  },
  { urls: AD_URL_PATTERNS },
  ["blocking"]
);

console.log("[AdBlocker] Motor de bloqueio de anúncios ativo no nível de rede GeckoView.");
