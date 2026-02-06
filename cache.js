(function() {
  'use strict';
  window.PrimeYT = window.PrimeYT || {};
  const U = window.PrimeYT.utils;
  const VD = window.PrimeYT.videoData;

  // ==========================================
  // Cache Constants
  // ==========================================

  const CACHE_KEY_SUBSCRIPTIONS = 'primeyt_cache_subscriptions';
  const CACHE_KEY_SEARCH = 'primeyt_cache_search';
  const CACHE_KEY_PLAYLIST = 'primeyt_cache_playlist';
  const CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes
  const CACHE_VERSION = 'primeyt_cache_version';
  const CURRENT_CACHE_VERSION = 2; // Bump this to invalidate all caches

  // ==========================================
  // Module State
  // ==========================================

  let backgroundCacheData = null; // Cache from background worker
  let backgroundCacheLoaded = false;
  let prefetchInProgress = false;
  let prefetchedData = null; // In-memory cache for instant access

  // ==========================================
  // Persistent Video List Cache (localStorage)
  // ==========================================

  function getCacheKey() {
    if (U.isSubscriptionsPage()) return CACHE_KEY_SUBSCRIPTIONS;
    if (U.isSearchPage()) return CACHE_KEY_SEARCH + '_' + window.location.search;
    if (U.isPlaylistPage()) return CACHE_KEY_PLAYLIST + '_' + window.location.search;
    return null;
  }

  function saveVideoListToCache(videos) {
    const key = getCacheKey();
    if (!key || !videos || videos.length === 0) return;

    try {
      const cacheData = {
        timestamp: Date.now(),
        videos: videos.slice(0, 100) // Limit to 100 videos to save space
      };
      localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (e) {
      // localStorage might be full or disabled
      console.log('[PrimeYT] Could not cache video list:', e.message);
    }
  }

  function loadVideoListFromCache() {
    const key = getCacheKey();
    if (!key) return null;

    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);

      // Check if cache is still valid (within max age)
      if (Date.now() - cacheData.timestamp > CACHE_MAX_AGE) {
        localStorage.removeItem(key);
        return null;
      }

      return cacheData.videos;
    } catch (e) {
      return null;
    }
  }

  function showCachedListImmediately() {
    if (!U.isSubscriptionsPage() && !U.isSearchPage() && !U.isPlaylistPage()) return null;

    // Don't show cached if list already exists
    if (document.getElementById('primeyt-video-list')) return null;

    // For subscriptions, try in-memory prefetched data first (fastest)
    let cachedVideos = null;
    if (U.isSubscriptionsPage()) {
      cachedVideos = loadPrefetchedData();
    } else {
      cachedVideos = loadVideoListFromCache();
    }

    if (!cachedVideos || cachedVideos.length === 0) return null;

    console.log(`[PrimeYT] Found ${cachedVideos.length} cached videos`);
    return cachedVideos;
  }

  function clearOldCaches() {
    // Check cache version - if outdated, clear everything
    try {
      const storedVersion = parseInt(localStorage.getItem(CACHE_VERSION) || '0', 10);
      if (storedVersion < CURRENT_CACHE_VERSION) {
        console.log('[PrimeYT] Cache version outdated, clearing all caches');
        // Clear all PrimeYT caches
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('primeyt_cache')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        localStorage.setItem(CACHE_VERSION, String(CURRENT_CACHE_VERSION));
        console.log('[PrimeYT] Cleared', keysToRemove.length, 'cache entries');
        return;
      }
    } catch (e) {}

    // Clean up old search/playlist caches to prevent localStorage bloat
    // Also clear caches that don't have channelUrl (outdated format)
    try {
      const keysToCheck = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(CACHE_KEY_SEARCH) || key.startsWith(CACHE_KEY_PLAYLIST) || key === CACHE_KEY_SUBSCRIPTIONS)) {
          keysToCheck.push(key);
        }
      }

      keysToCheck.forEach(key => {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const data = JSON.parse(cached);
            // Clear if too old
            if (Date.now() - data.timestamp > CACHE_MAX_AGE) {
              localStorage.removeItem(key);
              console.log('[PrimeYT] Cleared old cache:', key);
              return;
            }
            // Clear if videos don't have channelUrl (outdated format)
            if (data.videos && data.videos.length > 0 && !data.videos[0].channelUrl) {
              localStorage.removeItem(key);
              console.log('[PrimeYT] Cleared cache without channelUrl:', key);
            }
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  // ==========================================
  // Background Worker Cache Integration
  // ==========================================

  // Load cache from background worker immediately
  function loadBackgroundCache() {
    if (backgroundCacheLoaded) return Promise.resolve(backgroundCacheData);

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_CACHED_SUBSCRIPTIONS' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[PrimeYT] Background cache unavailable:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }

          if (response && response.videos && response.videos.length > 0) {
            // Check if cache is still valid (within 30 minutes)
            if (Date.now() - response.timestamp < 30 * 60 * 1000) {
              backgroundCacheData = response.videos;
              console.log(`[PrimeYT] Loaded ${response.videos.length} videos from background cache`);
            }
          }
          backgroundCacheLoaded = true;
          resolve(backgroundCacheData);
        });
      } catch (e) {
        console.log('[PrimeYT] Background cache error:', e.message);
        resolve(null);
      }
    });
  }

  // Trigger background sync if needed
  function triggerBackgroundSync() {
    try {
      chrome.runtime.sendMessage({ type: 'FORCE_SYNC' }, (response) => {
        if (response && response.videos) {
          backgroundCacheData = response.videos;
          console.log(`[PrimeYT] Background sync complete: ${response.videos.length} videos`);
        }
      });
    } catch (e) {}
  }

  // ==========================================
  // In-Page Prefetch (Fallback)
  // ==========================================

  function prefetchSubscriptions() {
    // Don't prefetch if already on subscriptions or if prefetch in progress
    if (U.isSubscriptionsPage() || prefetchInProgress) return;

    // Check if we already have fresh background cache
    if (backgroundCacheData && backgroundCacheData.length > 0) {
      prefetchedData = backgroundCacheData;
      console.log('[PrimeYT] Using background worker cache');
      return;
    }

    // Check if we already have fresh localStorage cache
    try {
      const cached = localStorage.getItem(CACHE_KEY_SUBSCRIPTIONS);
      if (cached) {
        const data = JSON.parse(cached);
        // If cache is less than 5 minutes old, skip prefetch
        if (Date.now() - data.timestamp < 5 * 60 * 1000) {
          prefetchedData = data.videos;
          console.log('[PrimeYT] Subscriptions cache still fresh, skipping prefetch');
          return;
        }
      }
    } catch (e) {}

    prefetchInProgress = true;
    console.log('[PrimeYT] Background prefetching subscriptions...');

    fetch('/feed/subscriptions', {
      credentials: 'include',
      cache: 'no-cache' // Get fresh data
    })
    .then(response => response.text())
    .then(html => {
      // Extract ytInitialData from the HTML
      const videos = parseVideosFromHTML(html);

      if (videos && videos.length > 0) {
        // Save to localStorage
        const cacheData = {
          timestamp: Date.now(),
          videos: videos.slice(0, 100)
        };
        localStorage.setItem(CACHE_KEY_SUBSCRIPTIONS, JSON.stringify(cacheData));

        // Keep in memory for even faster access
        prefetchedData = videos;

        console.log(`[PrimeYT] Prefetched ${videos.length} subscription videos`);
      }
    })
    .catch(err => {
      console.log('[PrimeYT] Prefetch failed:', err.message);
    })
    .finally(() => {
      prefetchInProgress = false;
    });
  }

  function parseVideosFromHTML(html) {
    // Extract ytInitialData from the page HTML
    const match = html.match(/var ytInitialData = ({.+?});<\/script>/s);
    if (!match) {
      // Try alternative pattern
      const altMatch = html.match(/ytInitialData\s*=\s*({.+?});/s);
      if (!altMatch) return [];
      try {
        const data = JSON.parse(altMatch[1]);
        return extractVideosFromPrefetch(data);
      } catch (e) {
        return [];
      }
    }

    try {
      const data = JSON.parse(match[1]);
      return extractVideosFromPrefetch(data);
    } catch (e) {
      return [];
    }
  }

  function extractVideosFromPrefetch(data) {
    const videos = [];
    const stack = [data];
    const MAX_VIDEOS = 100;
    const MAX_NODES = 5000;
    let traversed = 0;
    const seen = new WeakSet();

    while (stack.length && traversed < MAX_NODES && videos.length < MAX_VIDEOS) {
      const node = stack.pop();
      traversed++;
      if (!node || typeof node !== 'object') continue;
      if (seen.has(node)) continue;
      seen.add(node);

      if (node.videoRenderer) {
        const video = VD.normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }

      if (node.richItemRenderer && node.richItemRenderer.content) {
        const content = node.richItemRenderer.content;
        if (content.videoRenderer) {
          const video = VD.normalizeVideoRenderer(content.videoRenderer);
          if (video) videos.push(video);
          if (videos.length >= MAX_VIDEOS) break;
        }
      }

      if (Array.isArray(node)) {
        for (const child of node) {
          if (child && typeof child === 'object') stack.push(child);
        }
      } else {
        for (const key in node) {
          if (Object.prototype.hasOwnProperty.call(node, key)) {
            const child = node[key];
            if (child && typeof child === 'object') stack.push(child);
          }
        }
      }
    }
    return videos;
  }

  function loadPrefetchedData() {
    // Priority: background cache > in-memory > localStorage
    if (backgroundCacheData && backgroundCacheData.length > 0) {
      return backgroundCacheData;
    }
    if (prefetchedData && prefetchedData.length > 0) {
      return prefetchedData;
    }
    // Fall back to localStorage
    return loadVideoListFromCache();
  }

  // ==========================================
  // Public API
  // ==========================================

  window.PrimeYT.cache = {
    getCacheKey,
    saveVideoListToCache,
    loadVideoListFromCache,
    showCachedListImmediately,
    clearOldCaches,
    loadBackgroundCache,
    triggerBackgroundSync,
    prefetchSubscriptions,
    parseVideosFromHTML,
    loadPrefetchedData,
    getBackgroundCacheData: () => backgroundCacheData,
    isPrefetchInProgress: () => prefetchInProgress,
    getPrefetchedData: () => prefetchedData
  };
})();
