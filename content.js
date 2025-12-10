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
    const timeStats = document.createElement('div');
    timeStats.id = 'primeyt-video-time-stats';
    timeStats.innerHTML = `
      <span id="primeyt-elapsed">0:00</span>
      <span class="primeyt-time-sep">/</span>
      <span id="primeyt-remaining">0:00</span>
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
      const elapsedEl = document.getElementById('primeyt-elapsed');
      const remainingEl = document.getElementById('primeyt-remaining');
      const percentEl = document.getElementById('primeyt-percent');
      
      if (elapsedEl && remainingEl && percentEl) {
        const elapsed = video.currentTime;
        const remaining = video.duration - video.currentTime;
        const percent = Math.round(playedPercent);
        
        elapsedEl.textContent = formatTimeMinutes(elapsed);
        remainingEl.textContent = formatTimeMinutes(remaining);
        percentEl.textContent = `${percent}%`;
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
  let buildTimeout = null;
  let durationCache = new Map(); // videoId -> duration
  let durationUpdateInterval = null;

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

  function scheduleBuildCustomVideoList(delay = 500) {
    if (buildTimeout) {
      clearTimeout(buildTimeout);
      buildTimeout = null;
    }
    buildTimeout = setTimeout(() => {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildCustomVideoList);
      } else {
        buildCustomVideoList();
      }
    }, delay);
  }

  function resetBuildState() {
    buildAttempts = 0;
    if (buildTimeout) {
      clearTimeout(buildTimeout);
      buildTimeout = null;
    }
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
  
  function buildCustomVideoList() {
    if (!isSubscriptionsPage() && !isSearchPage() && !isPlaylistPage()) return;
    
    // Don't rebuild if list already exists and has videos
    const existingList = document.getElementById('primeyt-video-list');
    if (existingList && existingList.querySelectorAll('.primeyt-video-row').length > 0) {
      return;
    }

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
      if (buildAttempts < 15) {
        scheduleBuildCustomVideoList(500);
      } else {
        console.log('[PrimeYT] Unable to build custom list after multiple attempts');
        console.log('[PrimeYT] Debug: ytInitialData available:', !!window.ytInitialData);
        console.log('[PrimeYT] Debug: DOM rich-item elements:', document.querySelectorAll('ytd-rich-item-renderer').length);
        console.log('[PrimeYT] Debug: DOM video-renderer elements:', document.querySelectorAll('ytd-video-renderer').length);
      }
      return;
    }

    renderCustomVideoList(combined);
    customListBuilt = true;
    buildAttempts = 0;
  }

  function getVideoIdFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('v');
    } catch (e) {
      return null;
    }
  }

  function renderCustomVideoList(videos) {
    // Remove existing list if present
    const existingList = document.getElementById('primeyt-video-list');
    if (existingList) {
      existingList.remove();
    }
    
    // Get set of watched video IDs for quick lookup
    const watchedIds = window.PrimeYTStats ? window.PrimeYTStats.getWatchedVideoIds() : new Set();
    
    const list = document.createElement('div');
    list.id = 'primeyt-video-list';
    
    videos.forEach((video, index) => {
      const row = document.createElement('div');
      row.className = 'primeyt-video-row';
      row.dataset.url = video.url;
      row.dataset.index = index;
      
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
    
    console.log(`[PrimeYT] SUCCESS: Built list with ${videos.length} videos`);
    console.log('[PrimeYT] Sample videos:', videos.slice(0, 3).map(v => ({
      title: v.title?.substring(0, 30),
      channel: v.channel || '(none)',
      duration: v.duration || '(none)',
      time: v.time || '(none)'
    })));
    
    // Start polling for missing durations
    startDurationUpdater();
  }

  function collectVideosFromData() {
    // Try multiple data sources
    const data = window.ytInitialData || window.ytInitialPlayerResponse || window.__INITIAL_STATE__;
    if (!data) return [];

    const videos = [];

    const stack = [data];
    const maxNodes = 20000;
    let traversed = 0;
    const seen = new Set();

    while (stack.length && traversed < maxNodes) {
      const node = stack.pop();
      traversed++;

      if (!node || typeof node !== 'object') continue;
      
      // Avoid infinite loops
      if (seen.has(node)) continue;
      seen.add(node);

      // Direct videoRenderer
      if (node.videoRenderer) {
        const video = normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
      }
      
      // Also check for richItemRenderer (used in subscriptions feed)
      if (node.richItemRenderer && node.richItemRenderer.content) {
        const content = node.richItemRenderer.content;
        if (content.videoRenderer) {
          const video = normalizeVideoRenderer(content.videoRenderer);
          if (video) videos.push(video);
        }
      }
      
      // Check for playlistVideoRenderer (used in playlist pages)
      if (node.playlistVideoRenderer) {
        const video = normalizePlaylistVideoRenderer(node.playlistVideoRenderer);
        if (video) videos.push(video);
      }
      
      // Also check for playlistVideoListRenderer contents
      if (node.playlistVideoListRenderer && node.playlistVideoListRenderer.contents) {
        for (const item of node.playlistVideoListRenderer.contents) {
          if (item.playlistVideoRenderer) {
            const video = normalizePlaylistVideoRenderer(item.playlistVideoRenderer);
            if (video) videos.push(video);
          }
        }
      }

      if (Array.isArray(node)) {
        for (const child of node) {
          if (child && typeof child === 'object' && !seen.has(child)) {
            stack.push(child);
          }
        }
      } else if (typeof node === 'object') {
        for (const key in node) {
          if (Object.prototype.hasOwnProperty.call(node, key)) {
            const child = node[key];
            if (child && typeof child === 'object' && !seen.has(child)) {
              stack.push(child);
            }
          }
        }
      }
    }

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

    return { title, url, channel, time: publishedText, duration };
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

    return { title, url, channel, time: publishedText, duration };
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
      
      // STEP 3: Get channel name
      let channel = '';
      const channelSelectors = [
        'ytd-channel-name yt-formatted-string#text',
        'ytd-channel-name #text',
        'ytd-channel-name a',
        '#channel-name yt-formatted-string',
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
            break;
          }
          channel = '';
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
      
      return { title, url, channel, time, duration };
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
    } else {
      removeHomepageMessage();
    }
    
    // Handle watch page
    if (path === '/watch') {
      // Delay to ensure player is loaded
      setTimeout(enableTheaterMode, 500);
      setTimeout(createProgressBar, 800);
      setTimeout(setupCaptionStyling, 1000);
      destroyCustomList();
    } else {
      destroyProgressBar();
      destroyCaptionStyling();
    }
    
    // Handle subscriptions page, search page, and playlist pages
    if (isSubscriptionsPage() || isSearchPage() || isPlaylistPage()) {
      resetBuildState();
      scheduleBuildCustomVideoList(800);
    } else if (path !== '/watch' && path !== '/') {
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
    
    // Watch for new videos being added to the feed (infinite scroll)
    const feedObserver = new MutationObserver((mutations) => {
      if (!isSubscriptionsPage() && !isSearchPage() && !isPlaylistPage()) return;
      
      let shouldRebuild = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && (
                node.matches('ytd-rich-item-renderer') ||
                node.matches('ytd-video-renderer') ||
                node.matches('ytd-playlist-video-renderer') ||
                node.querySelector?.('ytd-rich-item-renderer') ||
                node.querySelector?.('ytd-video-renderer') ||
                node.querySelector?.('ytd-playlist-video-renderer')
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
        clearTimeout(buildTimeout);
        scheduleBuildCustomVideoList(1000);
      }
    });
    
    feedObserver.observe(document.body, { childList: true, subtree: true });
    
    // YouTube's custom navigation event
    window.addEventListener('yt-navigate-finish', updatePageState);
    window.addEventListener('popstate', updatePageState);
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
