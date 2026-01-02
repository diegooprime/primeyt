// PrimeYT Content Script - Main entry point

(function() {
  'use strict';
  
  let lastPath = '';
  let cursorHideTimer = null;
  
  // ==========================================
  // Page Type Detection & Body Classes
  // ==========================================
  
  function getPageType() {
    const path = window.location.pathname;
    if (path === '/watch') return 'watch';
    if (path === '/feed/subscriptions') return 'subscriptions';
    if (path.startsWith('/feed/')) return 'feed';
    if (path === '/results') return 'search';
    if (path === '/') return 'home';
    if (path.startsWith('/shorts/')) return 'shorts';
    if (path.startsWith('/playlist')) return 'playlist';
    if (path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/')) return 'channel';
    return 'other';
  }
  
  function updateBodyClasses() {
    // Wait for body to exist
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', updateBodyClasses);
      return 'unknown';
    }
    
    const pageType = getPageType();
    
    // Remove all page type classes
    document.body.classList.remove(
      'primeyt-page-watch',
      'primeyt-page-subscriptions',
      'primeyt-page-feed',
      'primeyt-page-search',
      'primeyt-page-home',
      'primeyt-page-shorts',
      'primeyt-page-playlist',
      'primeyt-page-channel',
      'primeyt-page-other'
    );
    
    // Add current page type class
    document.body.classList.add(`primeyt-page-${pageType}`);
    
    // Add extension active marker
    document.body.classList.add('primeyt-active');
    
    console.log(`[PrimeYT] Page type: ${pageType}`);
    
    return pageType;
  }
  
  // ==========================================
  // Force Dark Background Immediately
  // ==========================================
  
  function forceBackground() {
    document.documentElement.style.backgroundColor = '#282c34';
    if (document.body) {
      document.body.style.backgroundColor = '#282c34';
    }
    
    // Remove skeleton/loading elements ONLY
    const skeletons = document.querySelectorAll('ytd-masthead-skeleton, #masthead-skeleton');
    skeletons.forEach(el => el.remove());
  }
  
  // Run immediately
  forceBackground();
  
  // Set body class as soon as possible
  if (document.body) {
    updateBodyClasses();
  } else {
    document.addEventListener('DOMContentLoaded', updateBodyClasses);
  }
  
  // ==========================================
  // Hide Surveys & Promos (NOT popup containers!)
  // ==========================================
  
  function hideSurveysAndPromos() {
    // IMPORTANT: We do NOT remove or hide ytd-popup-container, tp-yt-paper-dialog,
    // or iron-overlay-backdrop because YouTube's player needs them for menus, 
    // subtitles, quality settings, etc.
    
    // Only hide/remove actual survey and promo content
    const promoSelectors = [
      'ytd-single-option-survey-renderer',
      'ytd-multi-option-survey-renderer',
      'ytd-enforcement-message-view-model',
      'ytd-consent-bump-v2-lightbox',
      '#consent-bump',
      'ytd-mealbar-promo-renderer',
      'ytd-background-promo-renderer',
      'ytd-statement-banner-renderer',
      '#masthead-ad'
    ];
    
    promoSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        // Hide instead of remove to be less destructive
        el.style.display = 'none';
      });
    });
    
    // Also force background
    forceBackground();
  }
  
  function setupPromoHiding() {
    // Initial hide
    hideSurveysAndPromos();
    
    // Watch for new promos (debounced)
    let hideTimeout = null;
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Only check if it looks like a promo/survey
              const tagName = node.tagName?.toLowerCase() || '';
              if (tagName.includes('survey') || 
                  tagName.includes('promo') || 
                  tagName.includes('consent') ||
                  tagName.includes('mealbar')) {
                shouldCheck = true;
                break;
              }
            }
          }
        }
        if (shouldCheck) break;
      }
      
      if (shouldCheck) {
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(hideSurveysAndPromos, 100);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }
  
  // ==========================================
  // Stats Widget
  // ==========================================
  
  function createStatsWidget() {
    const widget = document.createElement('div');
    widget.id = 'primeyt-stats';
    widget.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">24h</span>
        <span class="stat-value" id="primeyt-time-24h">0m</span>
        <span class="stat-videos" id="primeyt-videos-24h">0 videos</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">7d</span>
        <span class="stat-value" id="primeyt-time-7d">0m</span>
        <span class="stat-videos" id="primeyt-videos-7d">0 videos</span>
      </div>
    `;
    document.body.appendChild(widget);
    return widget;
  }
  
  function updateStatsWidget() {
    if (!window.PrimeYTStats) return;
    
    const timeStats = window.PrimeYTStats.getTimeStats();
    const videoCounts = window.PrimeYTStats.getWatchedVideosCount();
    
    const time24h = document.getElementById('primeyt-time-24h');
    const time7d = document.getElementById('primeyt-time-7d');
    const videos24h = document.getElementById('primeyt-videos-24h');
    const videos7d = document.getElementById('primeyt-videos-7d');
    
    if (time24h) {
      time24h.textContent = timeStats.last24h;
      time24h.className = 'stat-value';
      // Color based on time spent (2h+ = bad, 1-2h = warning)
      if (timeStats.last24hRaw > 7200) {
        time24h.classList.add('bad');
      } else if (timeStats.last24hRaw > 3600) {
        time24h.classList.add('warning');
      } else {
        time24h.classList.add('good');
      }
    }
    
    if (time7d) {
      time7d.textContent = timeStats.last7d;
    }
    
    if (videos24h) {
      videos24h.textContent = `${videoCounts.last24h} videos`;
    }
    
    if (videos7d) {
      videos7d.textContent = `${videoCounts.last7d} videos`;
    }
  }
  
  // ==========================================
  // Hide End Cards
  // ==========================================
  
  let endCardObserver = null;
  let endCardInterval = null;
  
  function hideEndCards() {
    const selectors = [
      '.ytp-ce-element',
      '.ytp-ce-video',
      '.ytp-ce-channel',
      '.ytp-ce-playlist',
      '.ytp-ce-covering-overlay',
      '.ytp-endscreen-content',
      '.ytp-videowall-still',
      '.ytp-suggestion-set',
      '.html5-endscreen',
      '.videowall-endscreen'
    ];
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.style.display = 'none';
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      });
    });
  }
  
  function setupEndCardHiding() {
    if (endCardObserver) return;
    
    // Initial hide
    hideEndCards();
    
    // Watch for end cards being added
    endCardObserver = new MutationObserver((mutations) => {
      let shouldHide = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const className = node.className || '';
              if (className.includes('ytp-ce') || 
                  className.includes('endscreen') ||
                  className.includes('videowall') ||
                  node.querySelector?.('[class*="ytp-ce"]') ||
                  node.querySelector?.('[class*="endscreen"]')) {
                shouldHide = true;
                break;
              }
            }
          }
        }
        if (shouldHide) break;
      }
      
      if (shouldHide) {
        hideEndCards();
      }
    });
    
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (player) {
      endCardObserver.observe(player, { childList: true, subtree: true });
    }
    
    // Also hide when video ends
    const video = document.querySelector('video.html5-main-video');
    if (video) {
      video.addEventListener('ended', hideEndCards);
      video.addEventListener('timeupdate', () => {
        // Hide near end of video (last 20 seconds)
        if (video.duration && video.currentTime > video.duration - 20) {
          hideEndCards();
        }
      });
    }
    
    // Periodic hiding as fallback (every 2 seconds)
    if (!endCardInterval) {
      endCardInterval = setInterval(hideEndCards, 2000);
    }
  }
  
  function stopEndCardHiding() {
    if (endCardObserver) {
      endCardObserver.disconnect();
      endCardObserver = null;
    }
    if (endCardInterval) {
      clearInterval(endCardInterval);
      endCardInterval = null;
    }
  }
  
  // ==========================================
  // Auto Theater Mode
  // ==========================================
  
  function enableTheaterMode() {
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (!watchFlexy) return;
    
    // Check if already in theater mode
    if (watchFlexy.hasAttribute('theater')) return;
    
    // Click the theater button
    const theaterBtn = document.querySelector('.ytp-size-button');
    if (theaterBtn) {
      theaterBtn.click();
      console.log('[PrimeYT] Theater mode enabled');
    }
  }
  
  // ==========================================
  // Custom Progress Bar
  // ==========================================
  
  let progressBarCreated = false;
  let progressAnimationFrame = null;
  
  function createProgressBar() {
    if (progressBarCreated) return;
    if (!document.body.classList.contains('primeyt-page-watch')) return;
    
    const existing = document.getElementById('primeyt-progress-container');
    if (existing) existing.remove();
    
    // Remove existing time stats if present
    const existingStats = document.getElementById('primeyt-video-time-stats');
    if (existingStats) existingStats.remove();
    
    const container = document.createElement('div');
    container.id = 'primeyt-progress-container';
    container.innerHTML = `
      <div id="primeyt-progress-bar">
        <div id="primeyt-progress-buffered"></div>
        <div id="primeyt-progress-played"></div>
        <div id="primeyt-progress-hover"></div>
      </div>
      <div id="primeyt-progress-time"></div>
    `;
    
    // Create time stats display (top right)
    // Format: 1:23 / 10:00 | 4:32 @ 1.5x | 14%
    const timeStats = document.createElement('div');
    timeStats.id = 'primeyt-video-time-stats';
    timeStats.innerHTML = `
      <span id="primeyt-elapsed-secs">0:00</span>
      <span class="primeyt-time-sep">/</span>
      <span id="primeyt-total-secs">0:00</span>
      <span class="primeyt-time-sep">|</span>
      <span id="primeyt-remaining-secs">0:00</span>
      <span id="primeyt-speed-indicator">@ 1x</span>
      <span class="primeyt-time-sep">|</span>
      <span id="primeyt-percent">0%</span>
    `;
    document.body.appendChild(timeStats);
    
    document.body.appendChild(container);
    progressBarCreated = true;
    
    const bar = document.getElementById('primeyt-progress-bar');
    
    // Dragging support
    let isDragging = false;
    
    bar.addEventListener('mousedown', (e) => {
      isDragging = true;
      seek(e);
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        seek(e);
      }
      // Show time on hover when over bar
      const rect = bar.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        showTimePreview(e, rect);
      }
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
    
    function seek(e) {
      const rect = bar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const video = document.querySelector('video.html5-main-video');
      if (video && video.duration) {
        video.currentTime = percent * video.duration;
      }
    }
    
    function showTimePreview(e, rect) {
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const video = document.querySelector('video.html5-main-video');
      const timeDisplay = document.getElementById('primeyt-progress-time');
      const hoverBar = document.getElementById('primeyt-progress-hover');
      
      if (video && video.duration && timeDisplay) {
        const time = percent * video.duration;
        timeDisplay.textContent = formatTime(time);
        timeDisplay.style.left = `${e.clientX}px`;
        timeDisplay.style.opacity = '1';
        hoverBar.style.width = `${percent * 100}%`;
        hoverBar.style.opacity = '1';
      }
    }
    
    // Show time on hover
    bar.addEventListener('mousemove', (e) => {
      const rect = bar.getBoundingClientRect();
      showTimePreview(e, rect);
    });
    
    bar.addEventListener('mouseleave', () => {
      const timeDisplay = document.getElementById('primeyt-progress-time');
      const hoverBar = document.getElementById('primeyt-progress-hover');
      if (timeDisplay) timeDisplay.style.opacity = '0';
      if (hoverBar) hoverBar.style.opacity = '0';
    });
    
    // Start updating
    updateProgressBar();
  }
  
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  
  function formatTimeMinutes(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const totalMins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${totalMins}:${secs.toString().padStart(2, '0')}`;
  }
  
  function updateProgressBar() {
    if (!document.body.classList.contains('primeyt-page-watch')) {
      progressAnimationFrame = null;
      return;
    }
    
    const video = document.querySelector('video.html5-main-video');
    const playedBar = document.getElementById('primeyt-progress-played');
    const bufferedBar = document.getElementById('primeyt-progress-buffered');
    
    if (video && playedBar && video.duration) {
      // Update played progress
      const playedPercent = (video.currentTime / video.duration) * 100;
      playedBar.style.width = `${playedPercent}%`;
      
      // Update buffered progress
      if (video.buffered.length > 0 && bufferedBar) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const bufferedPercent = (bufferedEnd / video.duration) * 100;
        bufferedBar.style.width = `${bufferedPercent}%`;
      }
      
      // Update time stats display
      // Format: 1:23 / 10:00 | 4:32 @ 1.5x | 14%
      const elapsedEl = document.getElementById('primeyt-elapsed-secs');
      const totalEl = document.getElementById('primeyt-total-secs');
      const remainingEl = document.getElementById('primeyt-remaining-secs');
      let speedEl = document.getElementById('primeyt-speed-indicator');
      const percentEl = document.getElementById('primeyt-percent');
      
      if (elapsedEl && totalEl && remainingEl && percentEl) {
        const elapsed = video.currentTime;
        const total = video.duration;
        const remaining = video.duration - video.currentTime;
        const playbackRate = video.playbackRate || 1;
        // Remaining time adjusted for playback speed
        const adjustedRemaining = remaining / playbackRate;
        const percent = Math.round(playedPercent);
        
        elapsedEl.textContent = formatTime(elapsed);
        totalEl.textContent = formatTime(total);
        remainingEl.textContent = formatTime(adjustedRemaining);
        percentEl.textContent = `${percent}%`;
        
        // Ensure speed indicator exists (in case old HTML is cached)
        if (!speedEl) {
          // Find the separator after remaining time and insert before it
          const timeStats = document.getElementById('primeyt-video-time-stats');
          if (timeStats && remainingEl.nextElementSibling) {
            speedEl = document.createElement('span');
            speedEl.id = 'primeyt-speed-indicator';
            timeStats.insertBefore(speedEl, remainingEl.nextElementSibling);
          }
        }
        
        // Update speed indicator
        if (speedEl) {
          const speedStr = playbackRate === 1 ? '1x' : `${playbackRate}x`;
          speedEl.textContent = ` @ ${speedStr}`;
          // Highlight when not at 1x speed
          speedEl.classList.toggle('primeyt-speed-active', playbackRate !== 1);
        }
      }
    }
    
    progressAnimationFrame = requestAnimationFrame(updateProgressBar);
  }
  
  function destroyProgressBar() {
    const container = document.getElementById('primeyt-progress-container');
    if (container) container.remove();
    const timeStats = document.getElementById('primeyt-video-time-stats');
    if (timeStats) timeStats.remove();
    progressBarCreated = false;
    if (progressAnimationFrame) {
      cancelAnimationFrame(progressAnimationFrame);
      progressAnimationFrame = null;
    }
  }
  
  // ==========================================
  // Shorts Redirect
  // ==========================================
  
  function redirectShorts() {
    const path = window.location.pathname;
    if (path.startsWith('/shorts/')) {
      const videoId = path.replace('/shorts/', '');
      window.location.replace(`https://www.youtube.com/watch?v=${videoId}`);
    }
  }
  
  // ==========================================
  // Custom Caption System (Clean & Simple)
  // ==========================================
  
  let customCaptionContainer = null;
  let lastCaptionText = '';
  let displayedPhrases = [];
  let captionPollInterval = null;
  
  function setupCaptionStyling() {
    // Hide YouTube's default captions
    hideYouTubeCaptions();
    
    // Create custom caption container
    if (!customCaptionContainer) {
      customCaptionContainer = document.createElement('div');
      customCaptionContainer.id = 'primeyt-captions';
      document.body.appendChild(customCaptionContainer);
    }
    
    // Reset state
    displayedPhrases = [];
    lastCaptionText = '';
    
    // Poll for caption changes
    if (captionPollInterval) clearInterval(captionPollInterval);
    captionPollInterval = setInterval(updateCustomCaptions, 150);
  }
  
  function hideYouTubeCaptions() {
    const style = document.createElement('style');
    style.id = 'primeyt-hide-yt-captions';
    style.textContent = `
      .caption-window,
      .ytp-caption-window-container,
      .ytp-caption-window-bottom,
      .ytp-caption-window-top {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    if (!document.getElementById('primeyt-hide-yt-captions')) {
      document.head.appendChild(style);
    }
  }
  
  function updateCustomCaptions() {
    if (!customCaptionContainer) return;
    
    // Get current caption from YouTube
    const captionSegments = document.querySelectorAll('.ytp-caption-segment');
    let currentText = '';
    captionSegments.forEach(seg => {
      currentText += seg.textContent + ' ';
    });
    currentText = currentText.trim();
    
    // Don't update if same text
    if (currentText === lastCaptionText) return;
    lastCaptionText = currentText;
    
    if (currentText) {
      // Remove overlapping text from previous captions
      let cleanText = removeOverlap(currentText);
      
      if (cleanText) {
        customCaptionContainer.textContent = cleanText;
        customCaptionContainer.classList.add('active');
        
        // Track displayed phrases (keep last 5)
        displayedPhrases.push(cleanText);
        if (displayedPhrases.length > 5) {
          displayedPhrases.shift();
        }
      }
    } else {
      customCaptionContainer.classList.remove('active');
    }
  }
  
  function removeOverlap(newText) {
    if (displayedPhrases.length === 0) return newText;
    
    const lastDisplayed = displayedPhrases[displayedPhrases.length - 1];
    if (!lastDisplayed) return newText;
    
    // Normalize helper
    const normalize = (str) =>
      str
        .toLowerCase()
        .replace(/[“”"']/g, '')
        .replace(/[.,!?]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    const lastNorm = normalize(lastDisplayed);
    const newNorm = normalize(newText);
    
    if (!newNorm) return null;
    
    // If the new caption is wholly contained in the last one, skip
    if (lastNorm.includes(newNorm)) return null;
    
    const lastTokens = lastNorm.split(' ');
    const newTokens = newNorm.split(' ');
    
    // Find the longest suffix of lastTokens that matches a prefix of newTokens
    const maxOverlap = Math.min(12, lastTokens.length, newTokens.length - 1);
    for (let len = maxOverlap; len >= 2; len--) {
      const suffix = lastTokens.slice(-len).join(' ');
      const prefix = newTokens.slice(0, len).join(' ');
      if (suffix === prefix) {
        // Remove overlap from original newText using token count
        const originalTokens = newText.split(/\s+/);
        const cleaned = originalTokens.slice(len).join(' ').trim();
        return cleaned || null;
      }
    }
    
    return newText;
  }
  
  function destroyCaptionStyling() {
    if (captionPollInterval) {
      clearInterval(captionPollInterval);
      captionPollInterval = null;
    }
    if (customCaptionContainer) {
      customCaptionContainer.remove();
      customCaptionContainer = null;
    }
    const hideStyle = document.getElementById('primeyt-hide-yt-captions');
    if (hideStyle) hideStyle.remove();
    lastCaptionText = '';
    displayedPhrases = [];
  }
  
  // ==========================================
  // Auto-Hide Cursor (Entire Page)
  // ==========================================
  
  let cursorHideSetup = false;
  
  function setupCursorHide() {
    if (cursorHideSetup) return;
    cursorHideSetup = true;
    
    function showCursor() {
      document.body.classList.remove('primeyt-hide-cursor');
      clearTimeout(cursorHideTimer);
      cursorHideTimer = setTimeout(() => {
        document.body.classList.add('primeyt-hide-cursor');
      }, 2000);
    }
    
    // Show cursor on any mouse movement
    document.addEventListener('mousemove', showCursor);
    document.addEventListener('mousedown', showCursor);
    
    // Start with cursor hidden after initial delay
    cursorHideTimer = setTimeout(() => {
      document.body.classList.add('primeyt-hide-cursor');
    }, 2000);
  }
  
  // ==========================================
  // Custom Video List (replaces YouTube's grid)
  // ==========================================
  
  let customListBuilt = false;
  let buildAttempts = 0;
  let buildDebounceTimer = null;
  let isBuilding = false;
  let durationCache = new Map(); // videoId -> duration
  let durationUpdateInterval = null;
  
  // Cache for collectVideosFromData to avoid repeated traversal
  let videoDataCache = { key: '', videos: [] };
  
  // LocalStorage cache keys
  const CACHE_KEY_SUBSCRIPTIONS = 'primeyt_cache_subscriptions';
  const CACHE_KEY_SEARCH = 'primeyt_cache_search';
  const CACHE_KEY_PLAYLIST = 'primeyt_cache_playlist';
  const CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes
  const CACHE_VERSION = 'primeyt_cache_version';
  const CURRENT_CACHE_VERSION = 2; // Bump this to invalidate all caches
  
  // ==========================================
  // Persistent Video List Cache (localStorage)
  // ==========================================
  
  function getCacheKey() {
    if (isSubscriptionsPage()) return CACHE_KEY_SUBSCRIPTIONS;
    if (isSearchPage()) return CACHE_KEY_SEARCH + '_' + window.location.search;
    if (isPlaylistPage()) return CACHE_KEY_PLAYLIST + '_' + window.location.search;
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
    if (!isSubscriptionsPage() && !isSearchPage() && !isPlaylistPage()) return false;
    
    // Don't show cached if list already exists
    if (document.getElementById('primeyt-video-list')) return false;
    
    // For subscriptions, try in-memory prefetched data first (fastest)
    let cachedVideos = null;
    if (isSubscriptionsPage()) {
      cachedVideos = loadPrefetchedData();
    } else {
      cachedVideos = loadVideoListFromCache();
    }
    
    if (!cachedVideos || cachedVideos.length === 0) return false;
    
    console.log(`[PrimeYT] Showing ${cachedVideos.length} cached videos instantly`);
    renderCustomVideoList(cachedVideos, true); // true = isCached
    return true;
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
  
  let backgroundCacheData = null; // Cache from background worker
  let backgroundCacheLoaded = false;
  
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
  
  let prefetchInProgress = false;
  let prefetchedData = null; // In-memory cache for instant access
  
  function prefetchSubscriptions() {
    // Don't prefetch if already on subscriptions or if prefetch in progress
    if (isSubscriptionsPage() || prefetchInProgress) return;
    
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
        return extractVideosFromData(data);
      } catch (e) {
        return [];
      }
    }
    
    try {
      const data = JSON.parse(match[1]);
      return extractVideosFromData(data);
    } catch (e) {
      return [];
    }
  }
  
  function extractVideosFromData(data) {
    // Simplified version of collectVideosFromData for prefetched data
    // Uses the same normalizeVideoRenderer which now includes channelUrl
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
        const video = normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }
      
      if (node.richItemRenderer && node.richItemRenderer.content) {
        const content = node.richItemRenderer.content;
        if (content.videoRenderer) {
          const video = normalizeVideoRenderer(content.videoRenderer);
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

  function isFeedPage() {
    const path = window.location.pathname;
    return path === '/feed/subscriptions' || path.startsWith('/feed/');
  }

  function isSubscriptionsPage() {
    return window.location.pathname === '/feed/subscriptions';
  }

  function isSearchPage() {
    return window.location.pathname === '/results';
  }

  function isPlaylistPage() {
    return window.location.pathname.startsWith('/playlist');
  }

  function isChannelPage() {
    const path = window.location.pathname;
    return path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/');
  }

  function scheduleBuildCustomVideoList(delay = 300, forceRebuild = false) {
    // Debounce: cancel any pending build and schedule a new one
    if (buildDebounceTimer) {
      clearTimeout(buildDebounceTimer);
    }
    buildDebounceTimer = setTimeout(() => {
      buildDebounceTimer = null;
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => buildCustomVideoList(forceRebuild));
      } else {
        buildCustomVideoList(forceRebuild);
      }
    }, delay);
  }

  function resetBuildState() {
    buildAttempts = 0;
    if (buildDebounceTimer) {
      clearTimeout(buildDebounceTimer);
      buildDebounceTimer = null;
    }
    // Clear video data cache on reset
    videoDataCache = { key: '', videos: [] };
  }

  function formatDurationToMinutes(duration) {
    if (!duration) return '';
    
    // Clean up the duration string
    duration = duration.trim();
    
    // Duration format: "4:03" (mm:ss) or "1:57:16" (h:mm:ss)
    const parts = duration.split(':').map(p => parseInt(p, 10));
    
    let totalMinutes = 0;
    if (parts.length === 2) {
      // mm:ss
      totalMinutes = parts[0];
    } else if (parts.length === 3) {
      // h:mm:ss
      totalMinutes = parts[0] * 60 + parts[1];
    } else {
      return duration; // Unknown format, return as-is
    }
    
    return `${totalMinutes} min`;
  }

  function getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value == null) return undefined;
      value = value[key];
    }
    return value;
  }

  function parseDurationFromLabel(label) {
    if (!label) return '';
    
    // "X hours, Y minutes, Z seconds" or variations
    let hours = 0, mins = 0, secs = 0;
    
    const hourMatch = label.match(/(\d+)\s*hours?/i);
    const minMatch = label.match(/(\d+)\s*minutes?/i);
    const secMatch = label.match(/(\d+)\s*seconds?/i);
    
    if (hourMatch) hours = parseInt(hourMatch[1], 10);
    if (minMatch) mins = parseInt(minMatch[1], 10);
    if (secMatch) secs = parseInt(secMatch[1], 10);
    
    // Need at least minutes or hours to form a valid duration
    if (hours === 0 && mins === 0 && secs === 0) return '';
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatRelativeDate(timeStr) {
    if (!timeStr) return '';
    
    // Clean up "Streamed" prefix
    timeStr = timeStr.replace(/^Streamed\s+/, '');
    
    const now = new Date();
    const match = timeStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
    
    if (!match) return timeStr; // Fallback
    
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    let date = new Date(now);
    
    if (unit === 'second') date.setSeconds(now.getSeconds() - val);
    else if (unit === 'minute') date.setMinutes(now.getMinutes() - val);
    else if (unit === 'hour') date.setHours(now.getHours() - val);
    else if (unit === 'day') date.setDate(now.getDate() - val);
    else if (unit === 'week') date.setDate(now.getDate() - (val * 7));
    else if (unit === 'month') date.setMonth(now.getMonth() - val);
    else if (unit === 'year') date.setFullYear(now.getFullYear() - val);
    
    // Format: "Dec 6"
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  
  function buildCustomVideoList(forceRebuild = false) {
    if (!isSubscriptionsPage() && !isSearchPage() && !isPlaylistPage()) return;
    
    // Prevent concurrent builds
    if (isBuilding) return;
    
    // Don't rebuild if list already exists and has videos (unless forced)
    if (!forceRebuild) {
      const existingList = document.getElementById('primeyt-video-list');
      if (existingList && existingList.querySelectorAll('.primeyt-video-row').length > 0) {
        return;
      }
    }

    isBuilding = true;
    
    try {
      // Collect videos from BOTH sources
      const videosFromData = collectVideosFromData();
      const videosFromDom = collectVideosFromDom();

      const combined = [];
      const seen = new Set();
      [...videosFromData, ...videosFromDom].forEach(video => {
        if (!video || !video.url || seen.has(video.url)) return;
        seen.add(video.url);
        combined.push(video);
      });

      const pageType = isSearchPage() ? 'search' : isPlaylistPage() ? 'playlist' : 'subscriptions';
      console.log(`[PrimeYT] Build attempt ${buildAttempts + 1} (${pageType}), found ${combined.length} videos (${videosFromData.length} from data, ${videosFromDom.length} from DOM)`);

      if (combined.length === 0) {
        buildAttempts++;
        if (buildAttempts < 10) {
          scheduleBuildCustomVideoList(400);
        } else {
          console.log('[PrimeYT] Unable to build custom list after multiple attempts');
        }
        return;
      }

      renderCustomVideoList(combined);
      customListBuilt = true;
      buildAttempts = 0;
    } finally {
      isBuilding = false;
    }
  }

  function getVideoIdFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('v');
    } catch (e) {
      return null;
    }
  }

  function renderCustomVideoList(videos, isCached = false) {
    // Remove existing list if present
    const existingList = document.getElementById('primeyt-video-list');
    const existingWrapper = document.getElementById('primeyt-list-wrapper');
    if (existingList) existingList.remove();
    if (existingWrapper) existingWrapper.remove();
    
    // Get set of watched video IDs for quick lookup
    const watchedIds = window.PrimeYTStats ? window.PrimeYTStats.getWatchedVideoIds() : new Set();
    
    const list = document.createElement('div');
    list.id = 'primeyt-video-list';
    if (isCached) list.classList.add('primeyt-cached');
    
    videos.forEach((video, index) => {
      const row = document.createElement('div');
      row.className = 'primeyt-video-row';
      row.dataset.url = video.url;
      row.dataset.index = index;
      if (video.channelUrl) {
        row.dataset.channelUrl = video.channelUrl;
      } else if (index < 3) {
        // Debug: log first few videos without channelUrl
        console.log(`[PrimeYT] Video ${index} missing channelUrl:`, video.title, video.channel);
      }
      
      // Check if video is watched
      const videoId = getVideoIdFromUrl(video.url);
      const isWatched = videoId && watchedIds.has(videoId);
      
      if (isWatched) {
        row.classList.add('primeyt-watched');
      }
      
      // Clean title and limit to 6 words
      let cleanTitle = video.title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
      const words = cleanTitle.split(' ');
      if (words.length > 6) {
        cleanTitle = words.slice(0, 6).join(' ') + '...';
      }
      
      // Try to get duration from cache first, then from video data
      let duration = video.duration;
      if (!duration && videoId && durationCache.has(videoId)) {
        duration = durationCache.get(videoId);
      }
      if (duration && videoId) {
        durationCache.set(videoId, duration);
      }
      
      // Format duration to minutes and get upload date
      const durationMin = formatDurationToMinutes(duration);
      const dateStr = formatRelativeDate(video.time);
      
      // Watched indicator (checkmark)
      const watchedIndicator = isWatched ? '<span class="primeyt-watched-icon">✓</span>' : '';
      
      row.innerHTML = `
        <span class="primeyt-line-number" data-index="${index}">${index}</span>
        <div class="primeyt-video-left">
          ${watchedIndicator}
          <div class="primeyt-video-title" title="${escapeHtml(video.title)}">${escapeHtml(cleanTitle)}</div>
        </div>
        <div class="primeyt-video-right">
          <div class="primeyt-video-channel" title="${escapeHtml(video.channel)}">${escapeHtml(video.channel)}</div>
          <div class="primeyt-video-duration">${escapeHtml(durationMin)}</div>
          <div class="primeyt-video-date">${escapeHtml(dateStr)}</div>
        </div>
      `;
      
      row.addEventListener('click', () => {
        window.location.href = video.url;
      });
      
      list.appendChild(row);
    });

    // Create wrapper for proper layout
    const wrapper = document.createElement('div');
    wrapper.id = 'primeyt-list-wrapper';
    wrapper.appendChild(list);
    
    // Insert into body
    document.body.appendChild(wrapper);
    
    // Add class to body to trigger CSS hiding of YouTube grid
    document.body.classList.add('primeyt-list-active');
    
    const cacheStatus = isCached ? ' (from cache)' : '';
    const videosWithChannelUrl = videos.filter(v => v.channelUrl).length;
    console.log(`[PrimeYT] SUCCESS: Built list with ${videos.length} videos${cacheStatus}, ${videosWithChannelUrl} have channelUrl`);
    
    // Save to localStorage cache (only if not from cache - fresh data)
    if (!isCached) {
      saveVideoListToCache(videos);
    }
    
    // Start polling for missing durations
    startDurationUpdater();
  }

  function collectVideosFromData() {
    // Try multiple data sources
    const data = window.ytInitialData || window.ytInitialPlayerResponse || window.__INITIAL_STATE__;
    if (!data) return [];

    // Check cache - return cached videos if URL matches and we have videos
    const cacheKey = window.location.href;
    if (videoDataCache.key === cacheKey && videoDataCache.videos.length > 0) {
      return videoDataCache.videos;
    }

    const videos = [];
    const stack = [data];
    const MAX_VIDEOS = 100;  // Stop once we have enough videos
    const MAX_NODES = 5000;  // Reduced from 20,000 for faster traversal
    let traversed = 0;
    const seen = new WeakSet();  // WeakSet for better GC

    while (stack.length && traversed < MAX_NODES && videos.length < MAX_VIDEOS) {
      const node = stack.pop();
      traversed++;

      if (!node || typeof node !== 'object') continue;
      
      // Avoid infinite loops (WeakSet only works with objects)
      if (seen.has(node)) continue;
      seen.add(node);

      // Direct videoRenderer
      if (node.videoRenderer) {
        const video = normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }
      
      // Also check for richItemRenderer (used in subscriptions feed)
      if (node.richItemRenderer && node.richItemRenderer.content) {
        const content = node.richItemRenderer.content;
        if (content.videoRenderer) {
          const video = normalizeVideoRenderer(content.videoRenderer);
          if (video) videos.push(video);
          if (videos.length >= MAX_VIDEOS) break;
        }
      }
      
      // Check for playlistVideoRenderer (used in playlist pages)
      if (node.playlistVideoRenderer) {
        const video = normalizePlaylistVideoRenderer(node.playlistVideoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }
      
      // Also check for playlistVideoListRenderer contents
      if (node.playlistVideoListRenderer && node.playlistVideoListRenderer.contents) {
        for (const item of node.playlistVideoListRenderer.contents) {
          if (item.playlistVideoRenderer) {
            const video = normalizePlaylistVideoRenderer(item.playlistVideoRenderer);
            if (video) videos.push(video);
            if (videos.length >= MAX_VIDEOS) break;
          }
        }
        if (videos.length >= MAX_VIDEOS) break;
      }

      if (Array.isArray(node)) {
        for (const child of node) {
          if (child && typeof child === 'object') {
            stack.push(child);
          }
        }
      } else if (typeof node === 'object') {
        for (const key in node) {
          if (Object.prototype.hasOwnProperty.call(node, key)) {
            const child = node[key];
            if (child && typeof child === 'object') {
              stack.push(child);
            }
          }
        }
      }
    }

    // Cache the result
    videoDataCache = { key: cacheKey, videos };
    return videos;
  }

  function normalizePlaylistVideoRenderer(video) {
    const videoId = video.videoId;
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
    if (!url) return null;

    const title = video.title?.simpleText ||
      (video.title?.runs || []).map(run => run.text).join('').trim();
    if (!title) return null;

    const ownerRuns = video.shortBylineText?.runs ||
      video.longBylineText?.runs ||
      [];
    const channel = ownerRuns.map(run => run.text).join('').trim();
    
    // Extract channel URL from navigation endpoint - try multiple sources
    let channelUrl = '';
    
    // Try from runs navigation endpoint
    const channelRun = (video.shortBylineText?.runs || video.longBylineText?.runs || [])[0];
    if (channelRun?.navigationEndpoint) {
      const endpoint = channelRun.navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }
    
    // Try from channelThumbnailSupportedRenderers
    if (!channelUrl && video.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint) {
      const endpoint = video.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }
    
    // Ensure full URL
    if (channelUrl && !channelUrl.startsWith('http')) {
      channelUrl = 'https://www.youtube.com' + channelUrl;
    }

    // Playlist videos often don't have publish date, but might have video info
    const publishedText = video.videoInfo?.runs?.map(run => run.text).join('').trim() || '';

    // Get duration
    let duration = '';
    
    // Direct lengthText
    duration = video.lengthText?.simpleText ||
      (video.lengthText?.runs || []).map(run => run.text).join('').trim();
    
    // From thumbnailOverlays
    if (!duration && video.thumbnailOverlays) {
      for (const overlay of video.thumbnailOverlays) {
        if (overlay.thumbnailOverlayTimeStatusRenderer) {
          const renderer = overlay.thumbnailOverlayTimeStatusRenderer;
          duration = renderer.text?.simpleText ||
            (renderer.text?.runs || []).map(run => run.text).join('').trim();
          if (duration) break;
        }
      }
    }
    
    // From accessibility data
    if (!duration && video.lengthText?.accessibility?.accessibilityData?.label) {
      duration = parseDurationFromLabel(video.lengthText.accessibility.accessibilityData.label);
    }

    return { title, url, channel, channelUrl, time: publishedText, duration };
  }

  function normalizeVideoRenderer(video) {
    const videoId = video.videoId;
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
    if (!url) return null;

    const title = video.title?.simpleText ||
      (video.title?.runs || []).map(run => run.text).join('').trim();
    if (!title) return null;

    const ownerRuns = video.longBylineText?.runs ||
      video.ownerText?.runs ||
      video.shortBylineText?.runs ||
      [];
    const channel = ownerRuns.map(run => run.text).join('').trim();
    
    // Extract channel URL from navigation endpoint - try multiple sources
    let channelUrl = '';
    
    // Try from runs navigation endpoint
    const channelRun = (video.longBylineText?.runs || video.ownerText?.runs || video.shortBylineText?.runs || [])[0];
    if (channelRun?.navigationEndpoint) {
      const endpoint = channelRun.navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }
    
    // Try from ownerText directly
    if (!channelUrl && video.ownerText?.runs?.[0]?.navigationEndpoint) {
      const endpoint = video.ownerText.runs[0].navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }
    
    // Try from channelThumbnailSupportedRenderers
    if (!channelUrl && video.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint) {
      const endpoint = video.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }
    
    // Ensure full URL
    if (channelUrl && !channelUrl.startsWith('http')) {
      channelUrl = 'https://www.youtube.com' + channelUrl;
    }

    const publishedText = video.publishedTimeText?.simpleText ||
      (video.publishedTimeText?.runs || []).map(run => run.text).join('').trim() ||
      video.relativeDateText?.accessibility?.accessibilityData?.label ||
      '';

    // Try multiple paths for duration
    let duration = '';
    
    // Direct lengthText
    duration = video.lengthText?.simpleText ||
      (video.lengthText?.runs || []).map(run => run.text).join('').trim();
    
    // From thumbnailOverlays
    if (!duration && video.thumbnailOverlays) {
      for (const overlay of video.thumbnailOverlays) {
        if (overlay.thumbnailOverlayTimeStatusRenderer) {
          const renderer = overlay.thumbnailOverlayTimeStatusRenderer;
          duration = renderer.text?.simpleText ||
            (renderer.text?.runs || []).map(run => run.text).join('').trim();
          if (duration) break;
        }
      }
    }
    
    // From accessibility data
    if (!duration && video.lengthText?.accessibility?.accessibilityData?.label) {
      duration = parseDurationFromLabel(video.lengthText.accessibility.accessibilityData.label);
    }
    
    // From thumbnail accessibility
    if (!duration && video.thumbnail?.thumbnails?.[0]) {
      const accessLabel = video.thumbnail?.accessibility?.accessibilityData?.label;
      if (accessLabel) {
        duration = parseDurationFromLabel(accessLabel);
      }
    }

    return { title, url, channel, channelUrl, time: publishedText, duration };
  }

  function collectVideosFromDom() {
    // Try multiple selectors to catch all video types
    const selectors = [
      'ytd-rich-item-renderer',
      'ytd-grid-video-renderer', 
      'ytd-video-renderer',
      'ytd-playlist-video-renderer'
    ];
    
    const videoElements = [];
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      videoElements.push(...Array.from(elements));
    });
    
    // Remove duplicates
    const uniqueElements = Array.from(new Set(videoElements));
    
    const videos = [];
    
    uniqueElements.forEach((el) => {
      // Only process visible elements
      if (el.offsetParent === null) return;
      
      const data = extractVideoData(el);
      if (data && data.title && data.url) {
        videos.push(data);
      }
    });
    
    return videos;
  }
  
  function extractVideoData(element) {
    try {
      // STEP 1: Find the watch link and get URL
      const watchLinks = element.querySelectorAll('a[href*="/watch"]');
      
      let url = '';
      let title = '';
      
      for (const link of watchLinks) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/watch')) continue;
        
        // Get URL
        if (!url) {
          url = href;
          if (url.startsWith('/')) url = 'https://www.youtube.com' + url;
        }
        
        // Try to get title from link with id="video-title-link" or id="video-title"
        if (link.id === 'video-title-link' || link.id === 'video-title') {
          title = link.getAttribute('title') || link.textContent || '';
          if (title) break;
        }
      }
      
      // STEP 2: If no title yet, look for title elements
      if (!title) {
        const titleSelectors = [
          '#video-title-link',
          '#video-title',
          'a[id*="video-title"]',
          'h3 a',
          'h3 yt-formatted-string'
        ];
        
        for (const selector of titleSelectors) {
          const el = element.querySelector(selector);
          if (el) {
            title = el.getAttribute('title') || el.textContent || '';
            if (title) break;
          }
        }
      }
      
      title = title.trim();
      
      // Clean the title - remove duration suffix patterns from aria-labels
      title = title.replace(/\s+\d+\s*(hour|minute|second)s?(,?\s*\d+\s*(hour|minute|second)s?)*\s*$/i, '');
      title = title.replace(/\s+by\s+[\w\s]+\s+\d+\s*(hour|minute|second|view|day|week|month|year).*$/i, '');
      title = title.trim();
      
      // Must have both title and URL
      if (!title || !url || !url.includes('/watch')) {
        return null;
      }
      
      // Clean the URL
      try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
          url = `https://www.youtube.com/watch?v=${videoId}`;
        }
      } catch (e) {}
      
      // STEP 3: Get channel name and URL
      let channel = '';
      let channelUrl = '';
      const channelSelectors = [
        'ytd-channel-name yt-formatted-string#text a',
        'ytd-channel-name #text a',
        'ytd-channel-name a',
        '#channel-name yt-formatted-string a',
        '#channel-name a',
        'a[href*="/@"]',
        'a[href*="/channel/"]'
      ];
      
      for (const selector of channelSelectors) {
        const channelEl = element.querySelector(selector);
        if (channelEl) {
          channel = channelEl.textContent || '';
          channel = channel.trim();
          if (channel && channel.length > 1 && !channel.match(/^[\d:,.\s]+$/)) {
            // Also get channel URL
            const href = channelEl.href || channelEl.getAttribute('href') || '';
            if (href && (href.includes('/@') || href.includes('/channel/') || href.includes('/c/'))) {
              channelUrl = href.startsWith('/') ? 'https://www.youtube.com' + href : href;
            }
            break;
          }
          channel = '';
        }
      }
      
      // If we still don't have channel URL, try finding any channel link
      if (!channelUrl) {
        const channelLinks = element.querySelectorAll('a[href*="/@"], a[href*="/channel/"], a[href*="/c/"]');
        for (const link of channelLinks) {
          const href = link.href || link.getAttribute('href') || '';
          if (href) {
            channelUrl = href.startsWith('/') ? 'https://www.youtube.com' + href : href;
            break;
          }
        }
      }
      
      // STEP 4: Get upload time
      let time = '';
      const metaLine = element.querySelector('#metadata-line');
      if (metaLine) {
        const text = metaLine.textContent || '';
        const timeMatch = text.match(/(\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago|Streamed\s+\d+\s+\w+\s+ago)/i);
        if (timeMatch) {
          time = timeMatch[0];
        }
      }
      
      if (!time) {
        const allSpans = element.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent || '';
          if (text.includes('ago')) {
            const match = text.match(/(\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago|Streamed\s+\d+\s+\w+\s+ago)/i);
            if (match) {
              time = match[0];
              break;
            }
          }
        }
      }
      
      // STEP 5: Get duration - THIS IS CRITICAL
      let duration = '';
      
      // Method 1: Look in the thumbnail overlay (most reliable)
      const durationSelectors = [
        'ytd-thumbnail-overlay-time-status-renderer #text',
        'ytd-thumbnail-overlay-time-status-renderer span#text',
        'ytd-thumbnail-overlay-time-status-renderer .ytd-thumbnail-overlay-time-status-renderer',
        '#overlays ytd-thumbnail-overlay-time-status-renderer #text',
        'ytd-thumbnail #overlays ytd-thumbnail-overlay-time-status-renderer #text',
        '#thumbnail-container ytd-thumbnail-overlay-time-status-renderer #text'
      ];
      
      for (const selector of durationSelectors) {
        const durationEl = element.querySelector(selector);
        if (durationEl) {
          const text = durationEl.textContent?.trim() || '';
          if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            duration = text;
            break;
          }
        }
      }
      
      // Method 2: Look for any span/div with time format inside the thumbnail area
      if (!duration) {
        const thumbnailArea = element.querySelector('ytd-thumbnail, #thumbnail, a#thumbnail');
        if (thumbnailArea) {
          const allTextNodes = thumbnailArea.querySelectorAll('span, div, #text');
          for (const node of allTextNodes) {
            const text = node.textContent?.trim() || '';
            if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
              duration = text;
              break;
            }
          }
        }
      }
      
      // Method 3: Try to get from Polymer data (multiple paths)
      if (!duration) {
        // Check for data property on element
        const data = element.__data || element.data || element._data;
        if (data) {
          const paths = [
            'videoRenderer.lengthText.simpleText',
            'content.videoRenderer.lengthText.simpleText',
            'videoRenderer.lengthText.accessibility.accessibilityData.label',
            'content.videoRenderer.lengthText.accessibility.accessibilityData.label',
            'videoRenderer.thumbnailOverlays',
            'content.videoRenderer.thumbnailOverlays'
          ];
          
          for (const path of paths) {
            const value = getNestedValue(data, path);
            if (value) {
              if (typeof value === 'string' && value.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
                duration = value;
                break;
              }
              // Handle accessibility label like "4 minutes, 3 seconds"
              if (typeof value === 'string' && value.match(/\d+\s*(minute|hour|second)/i)) {
                duration = parseDurationFromLabel(value);
                if (duration) break;
              }
              // Handle thumbnailOverlays array
              if (Array.isArray(value)) {
                for (const overlay of value) {
                  const timeText = overlay?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText;
                  if (timeText && timeText.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
                    duration = timeText;
                    break;
                  }
                }
                if (duration) break;
              }
            }
          }
        }
      }
      
      // Method 4: Parse from any aria-label containing duration info
      if (!duration) {
        const allEls = element.querySelectorAll('[aria-label]');
        for (const el of allEls) {
          const ariaLabel = el.getAttribute('aria-label') || '';
          const parsed = parseDurationFromLabel(ariaLabel);
          if (parsed) {
            duration = parsed;
            break;
          }
        }
      }
      
      // Method 5: Look for badge-style duration display
      if (!duration) {
        const badges = element.querySelectorAll('[class*="badge"], [class*="time"], [class*="duration"]');
        for (const badge of badges) {
          const text = badge.textContent?.trim() || '';
          if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            duration = text;
            break;
          }
        }
      }
      
      return { title, url, channel, channelUrl, time, duration };
    } catch (e) {
      console.error('[PrimeYT] Error extracting data from element:', e);
      return null;
    }
  }
  
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function destroyCustomList() {
    const list = document.getElementById('primeyt-list-wrapper');
    if (list) list.remove();
    
    const oldList = document.getElementById('primeyt-video-list');
    if (oldList) oldList.remove();
    
    document.body.classList.remove('primeyt-list-active');
    resetBuildState();
    customListBuilt = false;
    
    // Clear duration update interval
    if (durationUpdateInterval) {
      clearInterval(durationUpdateInterval);
      durationUpdateInterval = null;
    }
    
    // Stop duration observer
    stopDurationObserver();
  }

  // Scan YouTube's DOM for durations and update our list
  function updateMissingDurations() {
    const listRows = document.querySelectorAll('.primeyt-video-row');
    if (!listRows.length) return;

    // Scan YouTube's video elements for duration data
    const ytVideoElements = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-playlist-video-renderer');
    
    ytVideoElements.forEach(el => {
      // Get video URL from element
      const link = el.querySelector('a[href*="/watch"]');
      if (!link) return;
      
      const href = link.href || link.getAttribute('href') || '';
      const videoId = getVideoIdFromUrl(href.startsWith('/') ? 'https://www.youtube.com' + href : href);
      if (!videoId) return;
      
      // Check if we already have duration cached
      if (durationCache.has(videoId) && durationCache.get(videoId)) return;
      
      // Try to extract duration
      let duration = '';
      
      // From overlay
      const durationEl = el.querySelector('ytd-thumbnail-overlay-time-status-renderer #text');
      if (durationEl) {
        const text = durationEl.textContent?.trim() || '';
        if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
          duration = text;
        }
      }
      
      // From polymer data
      if (!duration) {
        const data = el.__data || el.data;
        if (data) {
          const videoRenderer = data.videoRenderer || data.content?.videoRenderer || data.playlistVideoRenderer;
          if (videoRenderer) {
            duration = videoRenderer.lengthText?.simpleText ||
              (videoRenderer.lengthText?.runs || []).map(r => r.text).join('').trim();
            
            if (!duration && videoRenderer.thumbnailOverlays) {
              for (const overlay of videoRenderer.thumbnailOverlays) {
                if (overlay.thumbnailOverlayTimeStatusRenderer) {
                  duration = overlay.thumbnailOverlayTimeStatusRenderer.text?.simpleText || '';
                  if (duration) break;
                }
              }
            }
          }
        }
      }
      
      if (duration) {
        durationCache.set(videoId, duration);
        
        // Update our list row
        listRows.forEach(row => {
          const rowUrl = row.dataset.url;
          const rowVideoId = getVideoIdFromUrl(rowUrl);
          if (rowVideoId === videoId) {
            const durationEl = row.querySelector('.primeyt-video-duration');
            if (durationEl && !durationEl.textContent) {
              durationEl.textContent = formatDurationToMinutes(duration);
            }
          }
        });
      }
    });
  }

  // Start polling for missing durations
  function startDurationUpdater() {
    if (durationUpdateInterval) return;
    
    // Update immediately
    setTimeout(updateMissingDurations, 1000);
    
    // Then poll every 2 seconds for 30 seconds
    let pollCount = 0;
    durationUpdateInterval = setInterval(() => {
      updateMissingDurations();
      pollCount++;
      if (pollCount > 15) {
        clearInterval(durationUpdateInterval);
        durationUpdateInterval = null;
      }
    }, 2000);
    
    // Also observe YouTube's DOM for duration element additions
    observeDurationElements();
  }
  
  let durationObserver = null;
  
  function observeDurationElements() {
    if (durationObserver) return;
    
    durationObserver = new MutationObserver((mutations) => {
      let foundNew = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if it's a duration element or contains one
              const isDuration = node.matches?.('ytd-thumbnail-overlay-time-status-renderer') ||
                                 node.matches?.('ytd-playlist-video-renderer') ||
                                 node.querySelector?.('ytd-thumbnail-overlay-time-status-renderer') ||
                                 node.querySelector?.('ytd-playlist-video-renderer');
              if (isDuration) {
                foundNew = true;
                break;
              }
            }
          }
        }
        if (foundNew) break;
      }
      
      if (foundNew) {
        // Debounce the update
        clearTimeout(durationObserver._updateTimeout);
        durationObserver._updateTimeout = setTimeout(updateMissingDurations, 300);
      }
    });
    
    // Observe the body for any new duration elements
    durationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  function stopDurationObserver() {
    if (durationObserver) {
      durationObserver.disconnect();
      durationObserver = null;
    }
  }

  // ==========================================
  // Channel Page Video List
  // ==========================================

  let channelSortOrder = 'newest'; // newest, views, oldest
  let channelVideosCache = []; // Cache of all channel videos for sorting
  let channelInfo = { name: '', subscribers: '', handle: '' };
  let channelVideosDisplayed = 25; // Number of videos currently displayed
  const CHANNEL_VIDEOS_INCREMENT = 25; // Load this many more when scrolling
  let channelAutoplayObserver = null; // Observer to prevent autoplay on channel pages

  // ==========================================
  // Channel Page Autoplay Prevention
  // ==========================================

  function setupChannelAutoplayPrevention() {
    if (!isChannelPage()) return;
    
    // Stop any currently playing videos
    pauseAllVideos();
    
    // Watch for new videos that might start playing
    if (channelAutoplayObserver) {
      channelAutoplayObserver.disconnect();
    }
    
    channelAutoplayObserver = new MutationObserver(() => {
      if (isChannelPage()) {
        pauseAllVideos();
      }
    });
    
    channelAutoplayObserver.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    // Also listen for play events on any video element
    document.addEventListener('play', handleVideoPlay, true);
    
    console.log('[PrimeYT] Channel autoplay prevention enabled');
  }
  
  function stopChannelAutoplayPrevention() {
    if (channelAutoplayObserver) {
      channelAutoplayObserver.disconnect();
      channelAutoplayObserver = null;
    }
    document.removeEventListener('play', handleVideoPlay, true);
  }
  
  function handleVideoPlay(e) {
    if (!isChannelPage()) return;
    
    const video = e.target;
    if (video && video.tagName === 'VIDEO') {
      video.pause();
      console.log('[PrimeYT] Prevented video autoplay on channel page');
    }
  }
  
  function pauseAllVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (!video.paused) {
        video.pause();
        console.log('[PrimeYT] Paused autoplaying video on channel page');
      }
    });
  }

  function getChannelSortOrder() {
    return channelSortOrder;
  }

  function setChannelSortOrder(order) {
    channelSortOrder = order;
  }

  function getChannelVideosCache() {
    return channelVideosCache;
  }

  async function buildChannelVideoList(forceRebuild = false) {
    if (!isChannelPage()) return;

    // Prevent concurrent builds
    if (isBuilding) return;

    // Don't rebuild if list already exists (unless forced)
    if (!forceRebuild) {
      const existingList = document.getElementById('primeyt-video-list');
      if (existingList && existingList.querySelectorAll('.primeyt-video-row').length > 0) {
        return;
      }
    }

    isBuilding = true;

    try {
      // Extract channel info
      extractChannelInfo();

      // Collect videos from both sources
      const videosFromData = collectChannelVideosFromData();
      const videosFromDom = collectChannelVideosFromDom();

      const combined = [];
      const seen = new Set();
      [...videosFromData, ...videosFromDom].forEach(video => {
        if (!video || !video.url || seen.has(video.url)) return;
        seen.add(video.url);
        combined.push(video);
      });

      console.log(`[PrimeYT] Channel build: found ${combined.length} videos (${videosFromData.length} from data, ${videosFromDom.length} from DOM)`);

      if (combined.length === 0) {
        buildAttempts++;
        if (buildAttempts < 15) {
          scheduleBuildChannelVideoList(500);
        } else {
          console.log('[PrimeYT] Unable to build channel list after multiple attempts');
        }
        return;
      }

      // Cache videos for sorting
      channelVideosCache = combined;

      // Sort and render initial list
      const sorted = sortChannelVideos(combined, channelSortOrder);
      renderChannelVideoList(sorted);
      customListBuilt = true;
      buildAttempts = 0;

      // Now fetch continuation videos in background
      if (continuationToken) {
        fetchContinuationAndUpdate();
      }
    } finally {
      isBuilding = false;
    }
  }

  async function fetchContinuationAndUpdate() {
    try {
      const moreVideos = await fetchChannelContinuation();
      
      if (moreVideos.length > 0) {
        console.log(`[PrimeYT] Adding ${moreVideos.length} continuation videos to cache`);
        
        // Add new videos to cache, avoiding duplicates
        const seen = new Set(channelVideosCache.map(v => v.url));
        let addedCount = 0;
        
        for (const video of moreVideos) {
          if (video && video.url && !seen.has(video.url)) {
            seen.add(video.url);
            channelVideosCache.push(video);
            addedCount++;
          }
        }
        
        if (addedCount > 0) {
          console.log(`[PrimeYT] Added ${addedCount} new unique videos (total: ${channelVideosCache.length})`);
          
          // Re-render with all videos
          const sorted = sortChannelVideos(channelVideosCache, channelSortOrder);
          renderChannelVideoList(sorted, false); // Don't reset display count
        }
      }
    } catch (e) {
      console.log('[PrimeYT] Error in fetchContinuationAndUpdate:', e);
    }
  }

  function scheduleBuildChannelVideoList(delay = 400, forceRebuild = false) {
    if (buildDebounceTimer) {
      clearTimeout(buildDebounceTimer);
    }
    buildDebounceTimer = setTimeout(() => {
      buildDebounceTimer = null;
      buildChannelVideoList(forceRebuild);
    }, delay);
  }

  function extractChannelInfo() {
    // Try to get channel info from ytInitialData
    try {
      const data = window.ytInitialData;
      if (data) {
        // Channel metadata
        const metadata = data.metadata?.channelMetadataRenderer;
        if (metadata) {
          channelInfo.name = metadata.title || '';
          channelInfo.handle = metadata.vanityChannelUrl?.split('/').pop() || '';
        }

        // Header for subscriber count
        const header = data.header?.c4TabbedHeaderRenderer || data.header?.pageHeaderRenderer;
        if (header) {
          channelInfo.name = channelInfo.name || header.title || '';
          channelInfo.subscribers = header.subscriberCountText?.simpleText || '';
        }

        // Try pageHeaderViewModel for newer layout
        const pageHeader = data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
        if (pageHeader) {
          channelInfo.name = pageHeader.title?.dynamicTextViewModel?.text?.content || channelInfo.name;
          channelInfo.subscribers = pageHeader.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || channelInfo.subscribers;
        }
      }
    } catch (e) {
      console.log('[PrimeYT] Error extracting channel info:', e);
    }

    // Fallback: get from DOM
    if (!channelInfo.name) {
      const nameEl = document.querySelector('yt-formatted-string#channel-name, #channel-name yt-formatted-string, ytd-channel-name yt-formatted-string');
      channelInfo.name = nameEl?.textContent?.trim() || '';
    }

    if (!channelInfo.subscribers) {
      const subsEl = document.querySelector('#subscriber-count, yt-formatted-string#subscriber-count');
      channelInfo.subscribers = subsEl?.textContent?.trim() || '';
    }

    console.log('[PrimeYT] Channel info:', channelInfo);
  }

  // Track continuation fetching state
  let continuationToken = null;
  let isFetchingContinuation = false;
  let channelContinuationApiKey = null;

  function collectChannelVideosFromData() {
    const data = window.ytInitialData;
    if (!data) return [];

    const videos = [];
    const stack = [data];
    const MAX_VIDEOS = 500; // Increased to handle more videos
    const MAX_NODES = 15000;
    let traversed = 0;
    const seen = new WeakSet();

    // Also look for continuation token and API key
    continuationToken = null;
    channelContinuationApiKey = null;

    while (stack.length && traversed < MAX_NODES && videos.length < MAX_VIDEOS) {
      const node = stack.pop();
      traversed++;

      if (!node || typeof node !== 'object') continue;
      if (seen.has(node)) continue;
      seen.add(node);

      // Look for continuation token
      if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
        continuationToken = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      }
      
      // Also check for token in different locations
      if (node.token && typeof node.token === 'string' && node.token.length > 50) {
        if (!continuationToken) {
          continuationToken = node.token;
        }
      }

      // gridVideoRenderer (channel videos tab)
      if (node.gridVideoRenderer) {
        const video = normalizeGridVideoRenderer(node.gridVideoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }

      // richItemRenderer with videoRenderer (channel home tab)
      if (node.richItemRenderer?.content?.videoRenderer) {
        const video = normalizeVideoRenderer(node.richItemRenderer.content.videoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }

      // Direct videoRenderer
      if (node.videoRenderer) {
        const video = normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
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

    // Try to get API key from ytcfg
    try {
      if (window.ytcfg && window.ytcfg.get) {
        channelContinuationApiKey = window.ytcfg.get('INNERTUBE_API_KEY');
      }
    } catch (e) {}

    if (continuationToken) {
      console.log('[PrimeYT] Found continuation token, will fetch more videos');
    }

    return videos;
  }

  async function fetchChannelContinuation() {
    if (!continuationToken || isFetchingContinuation) return [];
    
    isFetchingContinuation = true;
    const allNewVideos = [];
    let currentToken = continuationToken;
    let fetchCount = 0;
    const MAX_FETCHES = 20; // Limit to prevent infinite loops
    
    try {
      // Get API key
      let apiKey = channelContinuationApiKey;
      if (!apiKey) {
        try {
          if (window.ytcfg && window.ytcfg.get) {
            apiKey = window.ytcfg.get('INNERTUBE_API_KEY');
          }
        } catch (e) {}
      }
      
      if (!apiKey) {
        console.log('[PrimeYT] No API key found, cannot fetch continuation');
        return [];
      }
      
      while (currentToken && fetchCount < MAX_FETCHES) {
        fetchCount++;
        console.log(`[PrimeYT] Fetching continuation ${fetchCount}...`);
        
        const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20240101.00.00'
              }
            },
            continuation: currentToken
          })
        });
        
        if (!response.ok) {
          console.log('[PrimeYT] Continuation fetch failed:', response.status);
          break;
        }
        
        const data = await response.json();
        const { videos, nextToken } = extractVideosFromContinuation(data);
        
        if (videos.length === 0) {
          console.log('[PrimeYT] No more videos in continuation');
          break;
        }
        
        allNewVideos.push(...videos);
        console.log(`[PrimeYT] Got ${videos.length} more videos (total: ${allNewVideos.length})`);
        
        currentToken = nextToken;
        
        // Small delay between requests to be nice to YouTube's servers
        if (currentToken) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (e) {
      console.log('[PrimeYT] Error fetching continuation:', e);
    } finally {
      isFetchingContinuation = false;
      continuationToken = null; // Clear token after fetching
    }
    
    return allNewVideos;
  }

  function extractVideosFromContinuation(data) {
    const videos = [];
    let nextToken = null;
    const stack = [data];
    const MAX_NODES = 5000;
    let traversed = 0;
    const seen = new WeakSet();
    
    while (stack.length && traversed < MAX_NODES) {
      const node = stack.pop();
      traversed++;
      
      if (!node || typeof node !== 'object') continue;
      if (seen.has(node)) continue;
      seen.add(node);
      
      // Look for next continuation token
      if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
        nextToken = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      }
      
      // gridVideoRenderer
      if (node.gridVideoRenderer) {
        const video = normalizeGridVideoRenderer(node.gridVideoRenderer);
        if (video) videos.push(video);
      }
      
      // richItemRenderer with videoRenderer
      if (node.richItemRenderer?.content?.videoRenderer) {
        const video = normalizeVideoRenderer(node.richItemRenderer.content.videoRenderer);
        if (video) videos.push(video);
      }
      
      // Direct videoRenderer
      if (node.videoRenderer) {
        const video = normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
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
    
    return { videos, nextToken };
  }

  function normalizeGridVideoRenderer(video) {
    const videoId = video.videoId;
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
    if (!url) return null;

    const title = video.title?.simpleText ||
      (video.title?.runs || []).map(run => run.text).join('').trim();
    if (!title) return null;

    // For channel videos, channel name is the current channel
    const channel = channelInfo.name || '';

    const publishedText = video.publishedTimeText?.simpleText ||
      (video.publishedTimeText?.runs || []).map(run => run.text).join('').trim() || '';

    // View count
    let views = 0;
    const viewCountText = video.viewCountText?.simpleText || 
      (video.viewCountText?.runs || []).map(run => run.text).join('').trim() || '';
    const viewMatch = viewCountText.match(/([\d,.]+)\s*(K|M|B)?\s*view/i);
    if (viewMatch) {
      let num = parseFloat(viewMatch[1].replace(/,/g, ''));
      const multiplier = viewMatch[2]?.toUpperCase();
      if (multiplier === 'K') num *= 1000;
      else if (multiplier === 'M') num *= 1000000;
      else if (multiplier === 'B') num *= 1000000000;
      views = Math.round(num);
    }

    // Duration
    let duration = '';
    duration = video.lengthText?.simpleText ||
      (video.lengthText?.runs || []).map(run => run.text).join('').trim();

    if (!duration && video.thumbnailOverlays) {
      for (const overlay of video.thumbnailOverlays) {
        if (overlay.thumbnailOverlayTimeStatusRenderer) {
          const renderer = overlay.thumbnailOverlayTimeStatusRenderer;
          duration = renderer.text?.simpleText ||
            (renderer.text?.runs || []).map(run => run.text).join('').trim();
          if (duration) break;
        }
      }
    }

    // Parse duration to seconds for sorting
    const durationSecs = parseDurationToSeconds(duration);

    // Parse relative date to timestamp for sorting
    const timestamp = parseRelativeDateToTimestamp(publishedText);

    return { 
      title, 
      url, 
      channel, 
      time: publishedText, 
      duration, 
      views,
      viewsFormatted: formatViews(views),
      durationSecs,
      timestamp
    };
  }

  function collectChannelVideosFromDom() {
    // Try multiple selectors for channel video elements
    const selectors = [
      'ytd-grid-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-video-renderer'
    ];

    const videoElements = [];
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      videoElements.push(...Array.from(elements));
    });

    const uniqueElements = Array.from(new Set(videoElements));
    const videos = [];

    uniqueElements.forEach((el) => {
      if (el.offsetParent === null) return;

      const data = extractChannelVideoData(el);
      if (data && data.title && data.url) {
        videos.push(data);
      }
    });

    return videos;
  }

  function extractChannelVideoData(element) {
    try {
      const watchLinks = element.querySelectorAll('a[href*="/watch"]');

      let url = '';
      let title = '';

      for (const link of watchLinks) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/watch')) continue;

        if (!url) {
          url = href;
          if (url.startsWith('/')) url = 'https://www.youtube.com' + url;
        }

        if (link.id === 'video-title-link' || link.id === 'video-title') {
          title = link.getAttribute('title') || link.textContent || '';
          if (title) break;
        }
      }

      if (!title) {
        const titleSelectors = ['#video-title', 'a[id*="video-title"]', 'h3 a', 'h3 yt-formatted-string'];
        for (const selector of titleSelectors) {
          const el = element.querySelector(selector);
          if (el) {
            title = el.getAttribute('title') || el.textContent || '';
            if (title) break;
          }
        }
      }

      title = title.trim();
      if (!title || !url || !url.includes('/watch')) return null;

      // Clean URL
      try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
          url = `https://www.youtube.com/watch?v=${videoId}`;
        }
      } catch (e) {}

      // Get time and views
      let time = '';
      let views = 0;
      const metaLine = element.querySelector('#metadata-line, #metadata');
      if (metaLine) {
        const spans = metaLine.querySelectorAll('span');
        spans.forEach(span => {
          const text = span.textContent || '';
          if (text.includes('ago')) {
            time = text.trim();
          }
          if (text.includes('view')) {
            const viewMatch = text.match(/([\d,.]+)\s*(K|M|B)?\s*view/i);
            if (viewMatch) {
              let num = parseFloat(viewMatch[1].replace(/,/g, ''));
              const multiplier = viewMatch[2]?.toUpperCase();
              if (multiplier === 'K') num *= 1000;
              else if (multiplier === 'M') num *= 1000000;
              else if (multiplier === 'B') num *= 1000000000;
              views = Math.round(num);
            }
          }
        });
      }

      // Get duration
      let duration = '';
      const durationEl = element.querySelector('ytd-thumbnail-overlay-time-status-renderer #text');
      if (durationEl) {
        const text = durationEl.textContent?.trim() || '';
        if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
          duration = text;
        }
      }

      const durationSecs = parseDurationToSeconds(duration);
      const timestamp = parseRelativeDateToTimestamp(time);

      return { 
        title, 
        url, 
        channel: channelInfo.name || '', 
        time, 
        duration, 
        views,
        viewsFormatted: formatViews(views),
        durationSecs,
        timestamp
      };
    } catch (e) {
      return null;
    }
  }

  function parseDurationToSeconds(duration) {
    if (!duration) return 0;
    const parts = duration.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  function parseRelativeDateToTimestamp(timeStr) {
    if (!timeStr) return 0;

    // Clean up "Streamed" prefix
    timeStr = timeStr.replace(/^Streamed\s+/i, '');

    const match = timeStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
    if (!match) return 0;

    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const now = new Date();
    const date = new Date(now);

    // Use proper date methods for accurate calculation
    if (unit === 'second') date.setSeconds(now.getSeconds() - val);
    else if (unit === 'minute') date.setMinutes(now.getMinutes() - val);
    else if (unit === 'hour') date.setHours(now.getHours() - val);
    else if (unit === 'day') date.setDate(now.getDate() - val);
    else if (unit === 'week') date.setDate(now.getDate() - (val * 7));
    else if (unit === 'month') date.setMonth(now.getMonth() - val);
    else if (unit === 'year') date.setFullYear(now.getFullYear() - val);

    return date.getTime();
  }

  function formatViews(views) {
    if (!views || views === 0) return '';
    if (views >= 1000000000) return (views / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (views >= 1000000) return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return views.toString();
  }

  function sortChannelVideos(videos, order) {
    const sorted = [...videos];

    switch (order) {
      case 'newest':
        sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        break;
      case 'oldest':
        sorted.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        break;
      case 'views':
        sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
    }

    return sorted;
  }

  function renderChannelVideoList(videos, resetDisplayCount = true) {
    // Remove existing list
    const existingList = document.getElementById('primeyt-video-list');
    const existingWrapper = document.getElementById('primeyt-list-wrapper');
    if (existingList) existingList.remove();
    if (existingWrapper) existingWrapper.remove();

    // Reset display count when sorting changes
    if (resetDisplayCount) {
      channelVideosDisplayed = 25;
    }

    // Get watched video IDs
    const watchedIds = window.PrimeYTStats ? window.PrimeYTStats.getWatchedVideoIds() : new Set();

    const list = document.createElement('div');
    list.id = 'primeyt-video-list';
    list.classList.add('primeyt-channel-list');

    // Create header with channel info and sort controls
    const header = document.createElement('div');
    header.id = 'primeyt-channel-header';
    
    const showingCount = Math.min(channelVideosDisplayed, videos.length);
    const hasMore = videos.length > channelVideosDisplayed;
    
    header.innerHTML = `
      <div class="primeyt-channel-info">
        <span class="primeyt-channel-name">${escapeHtml(channelInfo.name)}</span>
        <span class="primeyt-channel-subs">${escapeHtml(channelInfo.subscribers)}</span>
        <span class="primeyt-channel-count">${showingCount} of ${videos.length} videos</span>
      </div>
      <div class="primeyt-sort-controls">
        <span class="primeyt-sort-label">Sort:</span>
        <span class="primeyt-sort-option ${channelSortOrder === 'newest' ? 'active' : ''}" data-sort="newest" title="s then n">Newest</span>
        <span class="primeyt-sort-option ${channelSortOrder === 'views' ? 'active' : ''}" data-sort="views" title="s then v">Views</span>
        <span class="primeyt-sort-option ${channelSortOrder === 'oldest' ? 'active' : ''}" data-sort="oldest" title="s then o">Oldest</span>
        <span class="primeyt-sort-hint">/ to filter · s+key to sort</span>
      </div>
    `;

    // Add click handlers for sort options
    header.querySelectorAll('.primeyt-sort-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const newOrder = opt.dataset.sort;
        channelSortOrder = newOrder;
        const sorted = sortChannelVideos(channelVideosCache, newOrder);
        renderChannelVideoList(sorted, true);
      });
    });

    // Only show up to channelVideosDisplayed
    const videosToShow = videos.slice(0, channelVideosDisplayed);

    // Get current channel URL from page path (for channel videos)
    const currentChannelUrl = 'https://www.youtube.com' + window.location.pathname.split('/').slice(0, 2).join('/');

    videosToShow.forEach((video, index) => {
      const row = document.createElement('div');
      row.className = 'primeyt-video-row';
      row.dataset.url = video.url;
      row.dataset.index = index;
      row.dataset.channelUrl = video.channelUrl || currentChannelUrl;

      const videoId = getVideoIdFromUrl(video.url);
      const isWatched = videoId && watchedIds.has(videoId);

      if (isWatched) {
        row.classList.add('primeyt-watched');
      }

      // Clean title - limit to 8 words for channel page
      let cleanTitle = video.title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
      const words = cleanTitle.split(' ');
      if (words.length > 8) {
        cleanTitle = words.slice(0, 8).join(' ') + '...';
      }

      const durationMin = formatDurationToMinutes(video.duration);
      const dateStr = formatChannelVideoDate(video.timestamp);
      const watchedIndicator = isWatched ? '<span class="primeyt-watched-icon">✓</span>' : '';

      row.innerHTML = `
        <span class="primeyt-line-number" data-index="${index}">${index}</span>
        <div class="primeyt-video-left">
          ${watchedIndicator}
          <div class="primeyt-video-title" title="${escapeHtml(video.title)}">${escapeHtml(cleanTitle)}</div>
        </div>
        <div class="primeyt-video-right">
          <div class="primeyt-video-views">${escapeHtml(video.viewsFormatted)}</div>
          <div class="primeyt-video-duration">${escapeHtml(durationMin)}</div>
          <div class="primeyt-video-date">${escapeHtml(dateStr)}</div>
        </div>
      `;

      row.addEventListener('click', () => {
        window.location.href = video.url;
      });

      list.appendChild(row);
    });

    // Add "load more" indicator if there are more videos
    if (hasMore) {
      const loadMore = document.createElement('div');
      loadMore.id = 'primeyt-load-more';
      loadMore.className = 'primeyt-load-more';
      loadMore.innerHTML = `<span>Scroll for more (${videos.length - channelVideosDisplayed} remaining)</span>`;
      list.appendChild(loadMore);
    }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'primeyt-list-wrapper';
    wrapper.appendChild(header);
    wrapper.appendChild(list);

    // Add scroll handler for loading more
    wrapper.addEventListener('scroll', handleChannelScroll);

    document.body.appendChild(wrapper);
    document.body.classList.add('primeyt-list-active');

    console.log(`[PrimeYT] Channel list: showing ${showingCount}/${videos.length} videos, sorted by ${channelSortOrder}`);

    // Start duration updater
    startDurationUpdater();
  }

  function handleChannelScroll(e) {
    const wrapper = e.target;
    const scrollBottom = wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight;
    
    // Load more when within 200px of bottom
    if (scrollBottom < 200) {
      const sortedVideos = sortChannelVideos(channelVideosCache, channelSortOrder);
      
      if (channelVideosDisplayed < sortedVideos.length) {
        channelVideosDisplayed += CHANNEL_VIDEOS_INCREMENT;
        renderChannelVideoList(sortedVideos, false);
      }
      
      // Also trigger YouTube's lazy loading to fetch more videos
      triggerYouTubeLazyLoad();
      
      // If we've shown all cached videos and have a continuation token, fetch more
      if (channelVideosDisplayed >= sortedVideos.length && continuationToken && !isFetchingContinuation) {
        fetchContinuationAndUpdate();
      }
    }
  }
  
  // Track last time we triggered lazy load to debounce
  let lastLazyLoadTrigger = 0;
  
  function triggerYouTubeLazyLoad() {
    // Debounce - don't trigger more than once per second
    const now = Date.now();
    if (now - lastLazyLoadTrigger < 1000) return;
    lastLazyLoadTrigger = now;
    
    // Find YouTube's scrollable container and scroll it to trigger lazy loading
    // YouTube typically loads more content when you scroll to the bottom
    const scrollableContainers = [
      document.querySelector('ytd-page-manager'),
      document.querySelector('#page-manager'),
      document.querySelector('ytd-browse'),
      document.documentElement,
      document.body
    ];
    
    for (const container of scrollableContainers) {
      if (container) {
        // Scroll to bottom to trigger YouTube's infinite scroll
        const currentScroll = container.scrollTop;
        const maxScroll = container.scrollHeight - container.clientHeight;
        
        if (maxScroll > currentScroll) {
          container.scrollTop = maxScroll;
          console.log('[PrimeYT] Triggered lazy load scroll on', container.tagName || 'element');
        }
      }
    }
    
    // Also dispatch scroll event to trigger any scroll listeners
    window.dispatchEvent(new Event('scroll'));
  }

  function formatChannelVideoDate(timestamp) {
    if (!timestamp || timestamp === 0) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    
    // Calculate difference in days
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) {
      // Show month and day for this year
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    // Show month, day, year for older videos
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }

  function resortChannelVideos(order) {
    if (!isChannelPage() || channelVideosCache.length === 0) return;
    
    channelSortOrder = order;
    const sorted = sortChannelVideos(channelVideosCache, order);
    renderChannelVideoList(sorted, true); // Reset to 25 videos when sorting changes
  }

  // Expose functions globally for keyboard module
  window.PrimeYTChannel = {
    isChannelPage,
    getChannelSortOrder,
    setChannelSortOrder,
    resortChannelVideos,
    getChannelVideosCache
  };

  // ==========================================
  // Homepage Message
  // ==========================================
  
  function showHomepageMessage() {
    if (window.location.pathname !== '/') return;
    
    // Check if message already exists
    if (document.getElementById('primeyt-home-message')) return;
    
    const message = document.createElement('div');
    message.id = 'primeyt-home-message';
    message.innerHTML = `
      <div class="primeyt-home-intent">Be intentional</div>
    `;
    
    document.body.appendChild(message);
  }
  
  function removeHomepageMessage() {
    const message = document.getElementById('primeyt-home-message');
    if (message) message.remove();
  }
  
  // ==========================================
  // Page Detection & Updates
  // ==========================================
  
  function updatePageState() {
    const path = window.location.pathname;
    const pageType = updateBodyClasses();
    
    // Redirect shorts
    redirectShorts();
    
    // Handle homepage message
    if (path === '/') {
      showHomepageMessage();
      destroyCustomList();
      stopChannelAutoplayPrevention();
    } else {
      removeHomepageMessage();
    }
    
    // Handle watch page
    if (path === '/watch') {
      // Delay to ensure player is loaded
      setTimeout(enableTheaterMode, 500);
      setTimeout(createProgressBar, 800);
      setTimeout(setupCaptionStyling, 1000);
      setTimeout(setupEndCardHiding, 500);
      destroyCustomList();
      stopChannelAutoplayPrevention();
    } else {
      destroyProgressBar();
      destroyCaptionStyling();
      stopEndCardHiding();
    }
    
    // Handle subscriptions page, search page, and playlist pages
    // Show cached list immediately, then refresh with fresh data
    if (isSubscriptionsPage() || isSearchPage() || isPlaylistPage()) {
      stopChannelAutoplayPrevention();
      if (!customListBuilt && !isBuilding) {
        // Try to show cached list instantly
        const showedCache = showCachedListImmediately();
        
        if (showedCache) {
          customListBuilt = true;
          // Refresh with fresh data in background
          scheduleBuildCustomVideoList(600, true);
        } else {
          scheduleBuildCustomVideoList(400);
        }
      }
    } else if (isChannelPage()) {
      // Handle channel pages with custom video list
      if (!customListBuilt && !isBuilding) {
        scheduleBuildChannelVideoList(500);
      }
      // Prevent autoplay on channel pages
      setupChannelAutoplayPrevention();
    } else if (path !== '/watch' && path !== '/') {
      // Stop autoplay prevention when leaving channel pages
      stopChannelAutoplayPrevention();
      destroyCustomList();
    }
    
    // Track video
    if (window.PrimeYTStats) {
      const videoId = window.PrimeYTStats.getVideoId();
      if (videoId) {
        window.PrimeYTStats.trackVideo(videoId);
      }
    }
  }
  
  function setupPageDetection() {
    updatePageState();
    lastPath = window.location.pathname;
    
    // Watch for navigation changes (YouTube is SPA)
    const pathObserver = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        updatePageState();
      }
    });
    
    pathObserver.observe(document.body, { childList: true, subtree: true });
    
    // Watch for new videos being added to the feed (infinite scroll ONLY)
    // This observer only handles incremental updates when list already exists
    const feedObserver = new MutationObserver((mutations) => {
      const onChannelPage = isChannelPage();
      if (!isSubscriptionsPage() && !isSearchPage() && !isPlaylistPage() && !onChannelPage) return;
      
      // Only handle infinite scroll if list is already built
      // Initial build is handled by yt-navigate-finish
      if (!customListBuilt) return;
      
      let shouldRebuild = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && (
                node.matches('ytd-rich-item-renderer') ||
                node.matches('ytd-video-renderer') ||
                node.matches('ytd-playlist-video-renderer') ||
                node.matches('ytd-grid-video-renderer') ||
                node.querySelector?.('ytd-rich-item-renderer') ||
                node.querySelector?.('ytd-video-renderer') ||
                node.querySelector?.('ytd-playlist-video-renderer') ||
                node.querySelector?.('ytd-grid-video-renderer')
              )) {
                shouldRebuild = true;
                break;
              }
            }
          }
          if (shouldRebuild) break;
        }
      }
      
      if (shouldRebuild) {
        if (onChannelPage) {
          // For channel pages, rebuild the channel video list
          scheduleBuildChannelVideoList(500, true);
        } else {
          // Invalidate cache for infinite scroll (new videos added)
          videoDataCache = { key: '', videos: [] };
          // Longer debounce for scroll-based updates, force rebuild to add new videos
          scheduleBuildCustomVideoList(800, true);
        }
      }
    });
    
    feedObserver.observe(document.body, { childList: true, subtree: true });
    
    // YouTube's custom navigation event - PRIMARY trigger for initial builds
    window.addEventListener('yt-navigate-finish', () => {
      // Clear in-memory cache on navigation (not localStorage cache)
      videoDataCache = { key: '', videos: [] };
      
      // Reset channel cache on navigation
      channelVideosCache = [];
      channelInfo = { name: '', subscribers: '', handle: '' };
      continuationToken = null;
      isFetchingContinuation = false;
      channelContinuationApiKey = null;

      // Update page state
      updatePageState();

      // For relevant pages: show cached list instantly, then refresh in background
      if (isSubscriptionsPage() || isSearchPage() || isPlaylistPage()) {
        resetBuildState();

        // Check if we have fresh prefetched data (for subscriptions)
        const hasFreshPrefetch = isSubscriptionsPage() && prefetchedData && prefetchedData.length > 0;
        
        // Show cached list immediately for instant perceived load
        const showedCache = showCachedListImmediately();

        if (showedCache) {
          customListBuilt = true;
          
          if (hasFreshPrefetch) {
            // We used fresh prefetched data - no need to refresh!
            // The data is already current (prefetched in background)
            console.log('[PrimeYT] Using fresh prefetched data - instant load complete');
          } else {
            // localStorage cache might be stale, refresh in background
            scheduleBuildCustomVideoList(800, true);
          }
        } else {
          // No cache available, build normally
          // Use forceRebuild=true to handle case where old list exists from previous page
          scheduleBuildCustomVideoList(400, true);
        }
      } else if (isChannelPage()) {
        // Handle channel page navigation
        resetBuildState();
        scheduleBuildChannelVideoList(500);
      }
    });
    
    window.addEventListener('popstate', updatePageState);
  }
  
  // ==========================================
  // Preload on Hover (anticipatory loading)
  // ==========================================

  function setupHoverPreload() {
    // Find the subscriptions link in the sidebar
    const checkAndAttach = () => {
      const subscriptionLinks = document.querySelectorAll('a[href="/feed/subscriptions"]');

      subscriptionLinks.forEach(link => {
        if (link.dataset.primeytPreload) return; // Already attached
        link.dataset.primeytPreload = 'true';

        link.addEventListener('mouseenter', () => {
          // If we don't have prefetched data yet, trigger immediate prefetch
          if (!prefetchedData && !prefetchInProgress && !isSubscriptionsPage()) {
            console.log('[PrimeYT] Hover detected - triggering prefetch');
            prefetchSubscriptions();
          }
        });
      });
    };

    // Check now and periodically (YouTube's sidebar loads dynamically)
    checkAndAttach();
    setTimeout(checkAndAttach, 2000);
    setTimeout(checkAndAttach, 5000);
  }
  
  // ==========================================
  // Initialization
  // ==========================================
  
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }
  
  function onReady() {
    console.log('[PrimeYT] Initializing...');
    
    // Clear old caches immediately (before anything else)
    clearOldCaches();

    // FIRST: Load background worker cache immediately (available before page loads)
    loadBackgroundCache().then(() => {
      console.log('[PrimeYT] Background cache loaded');
    });

    // Initialize stats module
    if (window.PrimeYTStats) {
      window.PrimeYTStats.init();
    }

    // Initialize keyboard module
    if (window.PrimeYTKeyboard) {
      window.PrimeYTKeyboard.init();
    }

    // Setup page detection
    setupPageDetection();

    // Setup promo hiding (NOT popup removal!)
    setupPromoHiding();

    // Create stats widget
    createStatsWidget();
    updateStatsWidget();
    setInterval(updateStatsWidget, 5000);

    // Block space key from reaching YouTube player
    setupSpaceBlocker();

    // Setup cursor auto-hide (entire page)
    setupCursorHide();

    // Setup hover preload for subscriptions
    setupHoverPreload();

    // Clean up old caches periodically
    clearOldCaches();

    // FALLBACK PREFETCH: Only if background cache isn't available
    // Background worker handles the main syncing now
    setTimeout(() => {
      if (!backgroundCacheData) {
        prefetchSubscriptions();
      }
    }, 2000);

    // Trigger background sync if cache is stale (> 10 minutes old)
    setTimeout(() => {
      if (!backgroundCacheData) {
        triggerBackgroundSync();
      }
    }, 5000);

    // Re-prefetch every 5 minutes as fallback
    setInterval(prefetchSubscriptions, 5 * 60 * 1000);
    
    console.log('[PrimeYT] Ready. Press Space + ? for keyboard shortcuts.');
  }
  
  // Block space from YouTube's player when we're using leader key
  function setupSpaceBlocker() {
    // Capture phase, highest priority
    window.addEventListener('keydown', function(e) {
      if (e.key === ' ' && window.location.pathname === '/watch') {
        const target = e.target;
        const tagName = target.tagName.toLowerCase();
        
        // Allow space in inputs
        if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) {
          return;
        }
        
        // Block it
        e.stopPropagation();
      }
    }, true);
  }
  
  init();
})();
