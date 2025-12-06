// PrimeYT Content Script - Main entry point

(function() {
  'use strict';
  
  let lastPath = '';
  let cursorHideTimer = null;
  
  // ==========================================
  // Force Dark Background Immediately
  // ==========================================
  
  function forceBackground() {
    document.documentElement.style.backgroundColor = '#282c34';
    document.body.style.backgroundColor = '#282c34';
    
    // Remove any skeleton/loading elements
    const skeletons = document.querySelectorAll('ytd-masthead-skeleton, #masthead-skeleton, [class*="skeleton"]');
    skeletons.forEach(el => el.remove());
  }
  
  // Run immediately
  forceBackground();
  
  // ==========================================
  // Remove Popups & Surveys
  // ==========================================
  
  function removePopups() {
    // Remove survey popups and skeletons
    const popupSelectors = [
      'ytd-popup-container',
      'tp-yt-paper-dialog',
      'ytd-single-option-survey-renderer',
      'ytd-multi-option-survey-renderer',
      'ytd-enforcement-message-view-model',
      'ytd-consent-bump-v2-lightbox',
      'iron-overlay-backdrop',
      'tp-yt-iron-overlay-backdrop',
      '#consent-bump',
      'ytd-mealbar-promo-renderer',
      'ytd-masthead-skeleton',
      '#masthead-skeleton'
    ];
    
    popupSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el && !el.closest('.primeyt-overlay') && !el.closest('.primeyt-dialog')) {
          el.remove();
        }
      });
    });
    
    // Also force background
    forceBackground();
    
    // Remove thumbnails from feed pages
    removeThumbnails();
  }
  
  function removeThumbnails() {
    // Only on feed pages, not watch pages
    if (window.location.pathname === '/watch') return;
    
    const thumbnailSelectors = [
      'ytd-rich-item-renderer ytd-thumbnail',
      'ytd-rich-item-renderer #thumbnail',
      'ytd-rich-item-renderer a#thumbnail',
      'ytd-rich-grid-media #thumbnail',
      'ytd-video-renderer ytd-thumbnail',
      'ytd-grid-video-renderer ytd-thumbnail'
    ];
    
    thumbnailSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.width = '0';
        el.style.height = '0';
      });
    });
  }
  
  function setupPopupRemoval() {
    // Initial removal
    removePopups();
    
    // Watch for new popups
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
      }
      if (shouldCheck) {
        removePopups();
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
  // Auto-Hide Cursor on Video
  // ==========================================
  
  function setupCursorHide() {
    const player = document.querySelector('#movie_player');
    if (!player) return;
    
    function showCursor() {
      player.classList.remove('primeyt-hide-cursor');
      clearTimeout(cursorHideTimer);
      cursorHideTimer = setTimeout(() => {
        const video = document.querySelector('video.html5-main-video');
        if (video && !video.paused) {
          player.classList.add('primeyt-hide-cursor');
        }
      }, 2000);
    }
    
    player.addEventListener('mousemove', showCursor);
    player.addEventListener('mousedown', showCursor);
  }
  
  // ==========================================
  // Custom Video List (replaces YouTube's grid)
  // ==========================================
  
  let customListBuilt = false;
  
  let buildAttempts = 0;

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
    // Only on subscription/feed pages
    const path = window.location.pathname;
    if (path !== '/feed/subscriptions' && !path.startsWith('/feed/')) return;
    
    // Check if already built
    if (document.getElementById('primeyt-video-list')) return;
    
    // Wait for videos to load - try multiple selectors
    const videoElements = document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer');
    
    console.log(`[PrimeYT] Build attempt ${buildAttempts + 1}, found ${videoElements.length} video elements`);
    
    if (videoElements.length === 0) {
      buildAttempts++;
      if (buildAttempts < 20) { // Try for 10 seconds
        setTimeout(buildCustomVideoList, 500);
      }
      return;
    }
    
    // Extract video data
    const videos = [];
    videoElements.forEach(el => {
      const data = extractVideoData(el);
      if (data) videos.push(data);
    });
    
    console.log(`[PrimeYT] Extracted ${videos.length} videos with data`);
    
    if (videos.length === 0) {
      buildAttempts++;
      if (buildAttempts < 20) {
        setTimeout(buildCustomVideoList, 500);
      }
      return;
    }
    
    // Create custom list
    const list = document.createElement('div');
    list.id = 'primeyt-video-list';
    
    videos.forEach((video, index) => {
      const row = document.createElement('div');
      row.className = 'primeyt-video-row';
      row.dataset.url = video.url;
      row.dataset.index = index;
      
      // Clean title - remove hashtags and extra whitespace
      const cleanTitle = video.title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
      
      // Format date
      const dateStr = formatRelativeDate(video.time);
      
      // Build structured row
      row.innerHTML = `
        <div class="primeyt-video-left">
          <div class="primeyt-video-title" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</div>
        </div>
        <div class="primeyt-video-right">
          <div class="primeyt-video-channel" title="${escapeHtml(video.channel)}">${escapeHtml(video.channel)}</div>
          <div class="primeyt-video-date">${escapeHtml(dateStr)}</div>
        </div>
      `;
      
      row.addEventListener('click', () => {
        window.location.href = video.url;
      });
      
      list.appendChild(row);
    });
    
    // INSERTION STRATEGY:
    // Find the main content container. YouTube has nested ytd-browse elements.
    // We want to insert into the active one.
    const browse = document.querySelector('ytd-browse[page-subtype="subscriptions"]');
    const container = browse || document.querySelector('#primary') || document.querySelector('#content');
    
    if (container) {
      // Insert at top
      container.insertBefore(list, container.firstChild);
      customListBuilt = true;
      buildAttempts = 0;
      
      // Add a class to body to trigger CSS hiding of original grid
      document.body.classList.add('primeyt-list-active');
      
      console.log(`[PrimeYT] SUCCESS: Built list with ${videos.length} videos`);
    } else {
      console.log('[PrimeYT] Failed to find container to insert list');
    }
  }
  
  function extractVideoData(element) {
    try {
      // Find the video title - it's usually in #video-title or #video-title-link
      const titleEl = element.querySelector('#video-title, #video-title-link');
      if (!titleEl) return null;
      
      // Get title text - might be in yt-formatted-string or directly
      const formattedString = titleEl.querySelector('yt-formatted-string');
      const title = (formattedString?.textContent || titleEl.textContent || '').trim();
      if (!title) return null;
      
      // Get URL from the closest link
      const linkEl = titleEl.closest('a') || titleEl.querySelector('a') || element.querySelector('a[href*="/watch"]');
      const url = linkEl?.href || '';
      if (!url || !url.includes('/watch')) return null;
      
      // Channel name - in ytd-channel-name
      const channelEl = element.querySelector('ytd-channel-name #text, #channel-name #text a, ytd-channel-name a, .ytd-channel-name a');
      const channel = channelEl?.textContent?.trim() || '';
      
      // Metadata line contains views and time
      let time = '';
      const metaLine = element.querySelector('#metadata-line');
      if (metaLine) {
        const text = metaLine.textContent || '';
        // Extract time ago
        const timeMatch = text.match(/(\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago|Streamed\s+\d+\s+\w+\s+ago)/i);
        if (timeMatch) {
          time = timeMatch[0];
        }
      }
      
      // Fallback for time extraction if metadata-line fails (sometimes it's in a separate span)
      if (!time) {
          const timeSpans = element.querySelectorAll('#metadata-line span');
          for (const span of timeSpans) {
              if (span.textContent.match(/ago/i)) {
                  time = span.textContent.trim();
                  break;
              }
          }
      }
      
      // Duration from thumbnail overlay (optional)
      const durationEl = element.querySelector('ytd-thumbnail-overlay-time-status-renderer #text, span#text.ytd-thumbnail-overlay-time-status-renderer');
      const duration = durationEl?.textContent?.trim() || '';
      
      return { title, url, channel, time, duration };
    } catch (e) {
      console.error('[PrimeYT] Error extracting data', e);
      return null;
    }
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function destroyCustomList() {
    const list = document.getElementById('primeyt-video-list');
    if (list) list.remove();
    
    const originalGrid = document.querySelector('ytd-rich-grid-renderer');
    if (originalGrid) {
      originalGrid.style.display = '';
    }
    
    customListBuilt = false;
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
    message.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #5c6370;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 14px;
      z-index: 100;
    `;
    message.innerHTML = `
      <div style="font-size: 32px; margin-bottom: 16px; color: #abb2bf;">PrimeYT</div>
      <div style="margin-bottom: 24px;">Mindful YouTube</div>
      <div style="font-size: 12px; color: #4b5263;">
        <kbd style="background: #2c313a; padding: 4px 8px; border-radius: 4px; margin: 0 2px;">Space</kbd>
        <kbd style="background: #2c313a; padding: 4px 8px; border-radius: 4px; margin: 0 2px;">s</kbd>
        Subscriptions
        <br><br>
        <kbd style="background: #2c313a; padding: 4px 8px; border-radius: 4px; margin: 0 2px;">Space</kbd>
        <kbd style="background: #2c313a; padding: 4px 8px; border-radius: 4px; margin: 0 2px;">f</kbd>
        <kbd style="background: #2c313a; padding: 4px 8px; border-radius: 4px; margin: 0 2px;">f</kbd>
        Search
        <br><br>
        <kbd style="background: #2c313a; padding: 4px 8px; border-radius: 4px; margin: 0 2px;">Space</kbd>
        <kbd style="background: #2c313a; padding: 4px 8px; border-radius: 4px; margin: 0 2px;">?</kbd>
        Help
      </div>
    `;
    
    // Wait for YouTube to load, then append
    const checkInterval = setInterval(() => {
      const content = document.querySelector('#content');
      if (content) {
        clearInterval(checkInterval);
        document.body.appendChild(message);
      }
    }, 100);
    
    // Cleanup after 10 seconds
    setTimeout(() => clearInterval(checkInterval), 10000);
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
    
    // Redirect shorts
    redirectShorts();
    
    // Handle homepage message
    if (path === '/') {
      showHomepageMessage();
      destroyCustomList();
    } else {
      removeHomepageMessage();
    }
    
    // Auto theater mode on watch page
    if (path === '/watch') {
      // Delay to ensure player is loaded
      setTimeout(enableTheaterMode, 500);
      setTimeout(setupCursorHide, 1000);
      destroyCustomList();
    }
    
    // Build custom list on feed pages
    if (path === '/feed/subscriptions' || path.startsWith('/feed/')) {
      buildAttempts = 0;
      // Multiple attempts with increasing delays
      setTimeout(buildCustomVideoList, 500);
      setTimeout(buildCustomVideoList, 1500);
      setTimeout(buildCustomVideoList, 3000);
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
    const observer = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        updatePageState();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
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
    
    // Setup popup removal
    setupPopupRemoval();
    
    // Create stats widget
    createStatsWidget();
    updateStatsWidget();
    setInterval(updateStatsWidget, 5000);
    
    console.log('[PrimeYT] Ready. Press Space + ? for keyboard shortcuts.');
  }
  
  init();
})();

