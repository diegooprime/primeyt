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
  let buildTimeout = null;

  function isFeedPage() {
    const path = window.location.pathname;
    return path === '/feed/subscriptions' || path.startsWith('/feed/');
  }

  function isSubscriptionsPage() {
    return window.location.pathname === '/feed/subscriptions';
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
    if (!isSubscriptionsPage()) return;
    
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

    console.log(`[PrimeYT] Build attempt ${buildAttempts + 1}, found ${combined.length} videos (${videosFromData.length} from data, ${videosFromDom.length} from DOM)`);

    if (combined.length === 0) {
      buildAttempts++;
      if (buildAttempts < 15) {
        scheduleBuildCustomVideoList(500);
      } else {
        console.log('[PrimeYT] Unable to build custom list after multiple attempts');
        console.log('[PrimeYT] Debug: ytInitialData available:', !!window.ytInitialData);
        console.log('[PrimeYT] Debug: DOM elements found:', document.querySelectorAll('ytd-rich-item-renderer').length);
      }
      return;
    }

    renderCustomVideoList(combined);
    customListBuilt = true;
    buildAttempts = 0;
  }

  function renderCustomVideoList(videos) {
    // Remove existing list if present
    const existingList = document.getElementById('primeyt-video-list');
    if (existingList) {
      existingList.remove();
    }
    
    const list = document.createElement('div');
    list.id = 'primeyt-video-list';
    
    videos.forEach((video, index) => {
      const row = document.createElement('div');
      row.className = 'primeyt-video-row';
      row.dataset.url = video.url;
      row.dataset.index = index;
      
      // Clean title and limit to 6 words
      let cleanTitle = video.title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
      const words = cleanTitle.split(' ');
      if (words.length > 6) {
        cleanTitle = words.slice(0, 6).join(' ') + '...';
      }
      
      // Format duration to minutes and get upload date
      const durationMin = formatDurationToMinutes(video.duration);
      const dateStr = formatRelativeDate(video.time);
      
      row.innerHTML = `
        <div class="primeyt-video-left">
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

    const duration = video.lengthText?.simpleText ||
      (video.lengthText?.runs || []).map(run => run.text).join('').trim() ||
      video.thumbnailOverlays?.find(o => o.thumbnailOverlayTimeStatusRenderer)
        ?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText ||
      '';

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
      const durationEl = element.querySelector('ytd-thumbnail-overlay-time-status-renderer #text');
      if (durationEl) {
        const text = durationEl.textContent?.trim() || '';
        if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
          duration = text;
        }
      }
      
      // Method 2: Look for any span with time format inside overlays
      if (!duration) {
        const overlays = element.querySelector('#overlays, ytd-thumbnail #overlays');
        if (overlays) {
          const spans = overlays.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent?.trim() || '';
            if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
              duration = text;
              break;
            }
          }
        }
      }
      
      // Method 3: Parse from thumbnail link aria-label
      if (!duration) {
        const thumbnailLink = element.querySelector('a#thumbnail[aria-label]');
        if (thumbnailLink) {
          const ariaLabel = thumbnailLink.getAttribute('aria-label') || '';
          
          // "X minutes, Y seconds" format
          const minSecMatch = ariaLabel.match(/(\d+)\s*minutes?,?\s*(\d+)?\s*seconds?/i);
          if (minSecMatch) {
            const mins = parseInt(minSecMatch[1], 10);
            const secs = minSecMatch[2] ? parseInt(minSecMatch[2], 10) : 0;
            duration = `${mins}:${secs.toString().padStart(2, '0')}`;
          }
          
          // "X hours, Y minutes" format
          if (!duration) {
            const hourMinMatch = ariaLabel.match(/(\d+)\s*hours?,?\s*(\d+)?\s*minutes?/i);
            if (hourMinMatch) {
              const hrs = parseInt(hourMinMatch[1], 10);
              const mins = hourMinMatch[2] ? parseInt(hourMinMatch[2], 10) : 0;
              duration = `${hrs}:${mins.toString().padStart(2, '0')}:00`;
            }
          }
        }
      }
      
      // Method 4: Try to get from Polymer data
      if (!duration && element.__data) {
        const data = element.__data;
        if (data.videoRenderer?.lengthText?.simpleText) {
          duration = data.videoRenderer.lengthText.simpleText;
        } else if (data.content?.videoRenderer?.lengthText?.simpleText) {
          duration = data.content.videoRenderer.lengthText.simpleText;
        }
      }
      
      // Method 5: Look in aria-label of any element
      if (!duration) {
        const allEls = element.querySelectorAll('[aria-label]');
        for (const el of allEls) {
          const ariaLabel = el.getAttribute('aria-label') || '';
          const durationMatch = ariaLabel.match(/(\d+)\s*minutes?,?\s*(\d+)?\s*seconds?/i);
          if (durationMatch) {
            const mins = parseInt(durationMatch[1], 10);
            const secs = durationMatch[2] ? parseInt(durationMatch[2], 10) : 0;
            duration = `${mins}:${secs.toString().padStart(2, '0')}`;
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
      <div class="primeyt-home-title">PrimeYT</div>
      <div class="primeyt-home-subtitle">Mindful YouTube</div>
      <div class="primeyt-home-keys">
        <div><kbd>Space</kbd> <kbd>s</kbd> Subscriptions</div>
        <div><kbd>Space</kbd> <kbd>f</kbd> <kbd>f</kbd> Search</div>
        <div><kbd>Space</kbd> <kbd>?</kbd> Help</div>
      </div>
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
      setTimeout(setupCursorHide, 1000);
      destroyCustomList();
    }
    
    // Handle subscriptions page
    if (isSubscriptionsPage()) {
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
      if (!isSubscriptionsPage()) return;
      
      let shouldRebuild = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && (
                node.matches('ytd-rich-item-renderer') ||
                node.querySelector?.('ytd-rich-item-renderer')
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
    
    console.log('[PrimeYT] Ready. Press Space + ? for keyboard shortcuts.');
  }
  
  init();
})();
