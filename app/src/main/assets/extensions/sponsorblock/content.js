// SponsorBlock Lightweight Segment Skipper Engine
(function() {
    'use strict';

    let currentVideoId = null;
    let segments = [];

    function getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        let id = urlParams.get('v');
        if (!id && window.location.pathname.startsWith('/shorts/')) {
            id = window.location.pathname.split('/')[2];
        }
        return id;
    }

    function fetchSegments(videoId) {
        if (!videoId || videoId === currentVideoId) return;
        currentVideoId = videoId;
        segments = [];

        const apiUrl = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=["sponsor","intro","outro","selfpromo","interaction"]`;
        
        fetch(apiUrl)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    segments = data.map(item => item.segment);
                    console.log(`[SponsorBlock] ${segments.length} segmentos carregados para o vídeo.`);
                }
            })
            .catch(() => {});
    }

    function checkAndSkipSegment() {
        const video = document.querySelector('video');
        if (!video || isNaN(video.currentTime) || segments.length === 0) return;

        const currentTime = video.currentTime;
        for (const segment of segments) {
            const start = segment[0];
            const end = segment[1];

            // Se o tempo atual estiver dentro do segmento de patrocínio
            if (currentTime >= start && currentTime < end - 0.5) {
                console.log(`[SponsorBlock] Pulando segmento de patrocínio de ${start}s até ${end}s`);
                video.currentTime = end;
                break;
            }
        }
    }

    // Monitora mudanças de URL (navegação SPA do YouTube)
    setInterval(() => {
        const videoId = getVideoId();
        if (videoId && videoId !== currentVideoId) {
            fetchSegments(videoId);
        }
        checkAndSkipSegment();
    }, 400);

    console.log("[SponsorBlock] Engine ativa no YouTube Kiosk Browser.");
})();
