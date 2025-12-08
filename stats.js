// PrimeYT Stats Module - Watch time tracking and video count

const PrimeYTStats = (function() {
  const STORAGE_KEY = 'primeyt_stats';
  const TICK_INTERVAL = 1000; // Update every second
  const SAVE_INTERVAL = 10000; // Save to storage every 10 seconds
  const MIN_WATCH_TIME = 30; // Minimum seconds to count as "watched"
  
  let state = {
    sessions: [], // Array of { date: ISO string, seconds: number }
    watchedVideos: [], // Array of { id: string, timestamp: number }
    currentSessionStart: null,
    currentSessionSeconds: 0,
    isActive: true,
    currentVideoId: null,
    currentVideoWatchTime: 0
  };
  
  let tickTimer = null;
  let saveTimer = null;
  
  // ==========================================
  // Storage
  // ==========================================
  
  async function loadStats() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        const saved = result[STORAGE_KEY];
        state.sessions = saved.sessions || [];
        state.watchedVideos = saved.watchedVideos || [];
        cleanOldData();
      }
    } catch (e) {
      console.log('[PrimeYT] Storage not available, using memory only');
    }
  }
  
  async function saveStats() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          sessions: state.sessions,
          watchedVideos: state.watchedVideos.slice(-500) // Keep last 500
        }
      });
    } catch (e) {
      // Silent fail if storage unavailable
    }
  }
  
  function cleanOldData() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    state.sessions = state.sessions.filter(s => new Date(s.date).getTime() > sevenDaysAgo);
    state.watchedVideos = state.watchedVideos.filter(v => v.timestamp > sevenDaysAgo);
  }
  
  // ==========================================
  // Time Tracking
  // ==========================================
  
  function startSession() {
    state.currentSessionStart = new Date().toISOString();
    state.currentSessionSeconds = 0;
    state.isActive = true;
    
    tickTimer = setInterval(tick, TICK_INTERVAL);
    saveTimer = setInterval(saveStats, SAVE_INTERVAL);
    
    // Track visibility and video state
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', () => state.isActive = false);
    window.addEventListener('focus', () => state.isActive = true);
  }
  
  function tick() {
    // Only count time if tab is visible and video is playing
    if (state.isActive && !document.hidden && isVideoPlaying()) {
      state.currentSessionSeconds++;
      state.currentVideoWatchTime++;
      
      // Check if we should mark video as watched
      if (state.currentVideoWatchTime === MIN_WATCH_TIME) {
        markVideoWatched();
      }
    }
  }
  
  function isVideoPlaying() {
    const video = document.querySelector('video.html5-main-video');
    return video && !video.paused && !video.ended;
  }
  
  function handleVisibility() {
    state.isActive = !document.hidden;
  }
  
  function endSession() {
    if (tickTimer) clearInterval(tickTimer);
    if (saveTimer) clearInterval(saveTimer);
    
    if (state.currentSessionSeconds > 0) {
      state.sessions.push({
        date: state.currentSessionStart,
        seconds: state.currentSessionSeconds
      });
      saveStats();
    }
  }
  
  function getTimeStats() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    let last24h = state.currentSessionSeconds;
    let last7d = state.currentSessionSeconds;
    
    for (const session of state.sessions) {
      const sessionTime = new Date(session.date).getTime();
      if (sessionTime > oneDayAgo) {
        last24h += session.seconds;
      }
      if (sessionTime > sevenDaysAgo) {
        last7d += session.seconds;
      }
    }
    
    return {
      last24h: formatTime(last24h),
      last7d: formatTime(last7d),
      last24hRaw: last24h,
      last7dRaw: last7d
    };
  }
  
  function formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  
  // ==========================================
  // Video Tracking
  // ==========================================
  
  function trackVideo(videoId) {
    if (videoId && videoId !== state.currentVideoId) {
      // Reset watch time for new video
      state.currentVideoId = videoId;
      state.currentVideoWatchTime = 0;
    }
  }
  
  function markVideoWatched() {
    if (!state.currentVideoId) return;
    
    // Check if already tracked
    const exists = state.watchedVideos.some(v => v.id === state.currentVideoId);
    if (!exists) {
      state.watchedVideos.push({
        id: state.currentVideoId,
        timestamp: Date.now()
      });
    }
  }
  
  function getVideoId() {
    // Get video ID from URL
    const url = new URL(window.location.href);
    return url.searchParams.get('v');
  }
  
  function getWatchedVideosCount() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    let last24h = 0;
    let last7d = 0;
    
    for (const video of state.watchedVideos) {
      if (video.timestamp > oneDayAgo) {
        last24h++;
      }
      if (video.timestamp > sevenDaysAgo) {
        last7d++;
      }
    }
    
    return { last24h, last7d };
  }
  
  function isVideoWatched(videoId) {
    if (!videoId) return false;
    return state.watchedVideos.some(v => v.id === videoId);
  }
  
  function getWatchedVideoIds() {
    return new Set(state.watchedVideos.map(v => v.id));
  }
  
  // ==========================================
  // Page Change Detection
  // ==========================================
  
  function setupPageChangeDetection() {
    // YouTube uses soft navigation
    let lastUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        onPageChange();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also listen for YouTube's custom navigation event
    window.addEventListener('yt-navigate-finish', onPageChange);
  }
  
  function onPageChange() {
    const videoId = getVideoId();
    if (videoId) {
      trackVideo(videoId);
    }
  }
  
  // ==========================================
  // Public API
  // ==========================================
  
  async function init() {
    await loadStats();
    startSession();
    setupPageChangeDetection();
    
    // Track current video if on watch page
    const videoId = getVideoId();
    if (videoId) {
      trackVideo(videoId);
    }
    
    window.addEventListener('beforeunload', endSession);
    console.log('[PrimeYT] Stats module initialized');
  }
  
  return {
    init,
    getTimeStats,
    getWatchedVideosCount,
    trackVideo,
    getVideoId,
    isVideoWatched,
    getWatchedVideoIds
  };
})();

// Export for use in other modules
window.PrimeYTStats = PrimeYTStats;

