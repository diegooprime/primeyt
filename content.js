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
    if (!document.body.classList.contains('primeyt-list-active')) return;
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
  let buildTimeout = null;

  function isFeedPage() {
    const path = window.location.pathname;
    return path === '/feed/subscriptions' || path.startsWith('/feed/');
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
    if (!isFeedPage()) return;
    
    // Don't rebuild if list already exists and has videos
    const existingList = document.getElementById('primeyt-video-list');
    if (existingList && existingList.children.length > 0) {
      return;
    }

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
        // Don't add the class if we can't build the list - this prevents hiding the grid
        // The user will see the normal YouTube grid, which is better than broken empty blocks
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
      
      // Apply inline styles to ensure visibility
      row.style.cssText = `
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 10px 16px !important;
        border-bottom: 1px solid #3e4451 !important;
        cursor: pointer !important;
        background: transparent !important;
        visibility: visible !important;
        opacity: 1 !important;
      `;
      
      const cleanTitle = video.title.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
      const dateStr = formatRelativeDate(video.time);
      
      // Use inline styles to guarantee visibility
      row.innerHTML = `
        <div class="primeyt-video-left" style="flex:1;min-width:0;margin-right:24px;">
          <div class="primeyt-video-title" style="color:#abb2bf;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</div>
        </div>
        <div class="primeyt-video-right" style="display:flex;align-items:center;gap:24px;flex-shrink:0;">
          <div class="primeyt-video-channel" style="color:#5c6370;font-size:13px;width:180px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(video.channel)}">${escapeHtml(video.channel)}</div>
          <div class="primeyt-video-date" style="color:#4b5263;font-size:13px;width:60px;text-align:right;white-space:nowrap;">${escapeHtml(dateStr)}</div>
        </div>
      `;
      
      row.addEventListener('click', () => {
        window.location.href = video.url;
      });
      
      // Add hover effect
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = '#21252b';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = 'transparent';
      });
      
      list.appendChild(row);
    });

    // Find the right container - prioritize #content or #page-manager for better visibility
    let container = document.querySelector('#content');
    if (!container) {
      container = document.querySelector('#page-manager');
    }
    if (!container) {
      container = document.querySelector('ytd-browse[page-subtype="subscriptions"]');
    }
    if (!container) {
      container = document.body;
    }
    
    // Hide the grid FIRST before inserting our list
    const grid = document.querySelector('ytd-browse[page-subtype="subscriptions"] ytd-rich-grid-renderer');
    const contents = document.querySelector('ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer');
    
    if (grid) {
      grid.style.display = 'none';
      grid.style.visibility = 'hidden';
      grid.style.height = '0';
      grid.style.overflow = 'hidden';
    }
    
    if (contents) {
      contents.style.display = 'none';
      contents.style.visibility = 'hidden';
      contents.style.height = '0';
      contents.style.overflow = 'hidden';
    }
    
    // Hide all rich item renderers
    const richItems = document.querySelectorAll('ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer');
    richItems.forEach(item => {
      item.style.display = 'none';
      item.style.visibility = 'hidden';
      item.style.height = '0';
      item.style.overflow = 'hidden';
    });
    
    // Hide duration overlays that might be floating
    const durationOverlays = document.querySelectorAll('ytd-browse[page-subtype="subscriptions"] ytd-thumbnail-overlay-time-status-renderer, ytd-browse[page-subtype="subscriptions"] span#text.ytd-thumbnail-overlay-time-status-renderer');
    durationOverlays.forEach(overlay => {
      overlay.style.display = 'none';
      overlay.style.visibility = 'hidden';
      overlay.style.opacity = '0';
    });
    
    // NUCLEAR OPTION: Hide the ENTIRE page content except our list
    const elementsToHide = [
      '#page-manager',
      '#content',
      'ytd-browse',
      'ytd-rich-grid-renderer',
      'ytd-section-list-renderer',
      'ytd-rich-item-renderer',
      'ytd-thumbnail-overlay-time-status-renderer',
      '[class*="thumbnail"]',
      '[id*="thumbnail"]'
    ];
    
    elementsToHide.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (el.id !== 'primeyt-video-list' && !el.closest('#primeyt-video-list')) {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
        }
      });
    });
    
    // Create an inner container for centered content
    const innerContainer = document.createElement('div');
    innerContainer.style.cssText = `
      max-width: 900px;
      margin: 0 auto;
      padding: 20px 24px;
    `;
    
    // Add top border to first row
    const firstRow = list.firstChild;
    if (firstRow) {
      firstRow.style.borderTop = '1px solid #3e4451';
    }
    
    // Move all rows into the inner container
    while (list.firstChild) {
      innerContainer.appendChild(list.firstChild);
    }
    list.appendChild(innerContainer);
    
    // Set final styles on the list - fixed position overlay that covers EVERYTHING
    list.style.cssText = `
      display: block !important;
      visibility: visible !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      overflow-y: auto !important;
      z-index: 999999 !important;
      background: #282c34 !important;
      opacity: 1 !important;
      padding-top: 60px !important;
    `;
    
    // Insert into body
    document.body.appendChild(list);
    
    // Add class and hide the original grid
    document.body.classList.add('primeyt-list-active');
    
    // Keep YouTube content hidden (they might restore it)
    const keepHidden = () => {
      const hideSelectors = ['#page-manager', '#content', 'ytd-browse', 'ytd-rich-grid-renderer'];
      hideSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          if (el.id !== 'primeyt-video-list' && !el.closest('#primeyt-video-list')) {
            el.style.setProperty('display', 'none', 'important');
          }
        });
      });
    };
    
    // Run multiple times to ensure it stays hidden
    setTimeout(keepHidden, 100);
    setTimeout(keepHidden, 300);
    setTimeout(keepHidden, 500);
    setTimeout(keepHidden, 1000);
    setTimeout(keepHidden, 2000);
    
    // Debug: log first 3 video titles and verify list content
    console.log(`[PrimeYT] SUCCESS: Built list with ${videos.length} videos`);
    console.log('[PrimeYT] Sample videos:', videos.slice(0, 3));
    
    // Log the actual HTML of first row
    const firstRowCheck = innerContainer.querySelector('.primeyt-video-row');
    if (firstRowCheck) {
      console.log('[PrimeYT] First row HTML:', firstRowCheck.innerHTML.substring(0, 300));
    }
  }

  function collectVideosFromData() {
    // Try multiple data sources
    const data = window.ytInitialData || window.ytInitialPlayerResponse || window.__INITIAL_STATE__;
    if (!data) return [];

    const videos = [];

    const stack = [data];
    const maxNodes = 20000; // avoid runaway traversal
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
      (video.lengthText?.runs || []).map(run => run.text).join('').trim() || '';

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
    let extractedCount = 0;
    let failedCount = 0;
    
    uniqueElements.forEach((el, index) => {
      // Only process visible elements
      if (el.offsetParent === null) return;
      
      // Quick check: does this element look like a video container?
      const hasVideoIndicators = el.querySelector('#video-title, #video-title-link, a[href*="/watch"], ytd-rich-grid-media');
      if (!hasVideoIndicators && el.tagName !== 'YTD-RICH-ITEM-RENDERER') {
        // Skip elements that don't look like video containers
        return;
      }
      
      const data = extractVideoData(el);
      if (data && data.title && data.url) {
        videos.push(data);
        extractedCount++;
      } else {
        failedCount++;
        // Log first few failures for debugging
        if (failedCount <= 3 && buildAttempts > 5) {
          const watchLinks = el.querySelectorAll('a[href*="/watch"]');
          const linkInfo = [];
          watchLinks.forEach((link, i) => {
            if (i < 3) {
              linkInfo.push({
                id: link.id,
                title: link.getAttribute('title')?.substring(0, 30),
                ariaLabel: link.getAttribute('aria-label')?.substring(0, 30),
                href: link.href?.substring(0, 50)
              });
            }
          });
          console.log(`[PrimeYT] Failed to extract from element ${index}:`, {
            tagName: el.tagName,
            watchLinksCount: watchLinks.length,
            linkInfo: linkInfo
          });
        }
      }
    });
    
    if (extractedCount === 0 && uniqueElements.length > 0) {
      console.log(`[PrimeYT] Debug: Found ${uniqueElements.length} elements but extracted 0 videos. Sample element:`, uniqueElements[0]);
    }
    
    return videos;
  }
  
  function extractVideoData(element) {
    try {
      // SIMPLE APPROACH: Find the watch link and get title from its attributes
      const watchLinks = element.querySelectorAll('a[href*="/watch"]');
      
      let url = '';
      let title = '';
      
      for (const link of watchLinks) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/watch')) continue;
        
        // Skip thumbnail links (they don't have title info)
        if (link.id === 'thumbnail' || link.closest('#thumbnail')) continue;
        
        // Get URL
        if (!url) {
          url = href;
          if (url.startsWith('/')) url = 'https://www.youtube.com' + url;
        }
        
        // Get title from this link's attributes
        const linkTitle = link.getAttribute('title') || link.getAttribute('aria-label') || '';
        if (linkTitle && !linkTitle.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
          title = linkTitle;
          break;
        }
        
        // Try getting title from yt-formatted-string inside this link
        const formattedStr = link.querySelector('yt-formatted-string');
        if (formattedStr) {
          const fsTitle = formattedStr.getAttribute('title') || 
                          formattedStr.getAttribute('aria-label') || 
                          formattedStr.textContent || '';
          if (fsTitle && !fsTitle.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            title = fsTitle;
            break;
          }
        }
      }
      
      // If still no title, try finding it anywhere in the element (excluding thumbnails)
      if (!title) {
        // Look for any element with id containing "title" 
        const titleEls = element.querySelectorAll('[id*="title"]');
        for (const el of titleEls) {
          if (el.closest('#thumbnail') || el.closest('ytd-thumbnail')) continue;
          
          const t = el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '';
          if (t && t.length > 5 && !t.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            title = t;
            break;
          }
        }
      }
      
      // Fallback: look for h3 or any heading
      if (!title) {
        const headings = element.querySelectorAll('h3, h2, h1');
        for (const h of headings) {
          if (h.closest('#thumbnail') || h.closest('ytd-thumbnail')) continue;
          const t = h.textContent || h.innerText || '';
          if (t && t.length > 5 && !t.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            title = t;
            break;
          }
        }
      }
      
      title = title.trim();
      
      // Clean the title - remove duration suffix like "4 minutes, 3 seconds" or "1 hour, 57 minutes"
      // YouTube aria-labels often end with duration info
      title = title.replace(/\s+\d+\s*(hour|minute|second)s?(,?\s*\d+\s*(hour|minute|second)s?)*\s*$/i, '');
      title = title.replace(/\s+by\s+[\w\s]+\s+\d+\s*(hour|minute|second|view|day|week|month|year).*$/i, ''); // Remove "by Channel X views Y ago"
      title = title.trim();
      
      // Must have both title and URL
      if (!title || !url || !url.includes('/watch')) {
        return null;
      }
      
      // Clean the URL - remove tracking parameters
      try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
          url = `https://www.youtube.com/watch?v=${videoId}`;
        }
      } catch (e) {
        // If URL parsing fails, use as-is
      }
      
      // Channel name - try multiple selectors
      let channel = '';
      const channelSelectors = [
        '#channel-name #text a',
        '#channel-name a',
        '#channel-name #text',
        'ytd-channel-name #text a',
        'ytd-channel-name a',
        'ytd-channel-name #text',
        '#text.ytd-channel-name',
        'ytd-channel-name yt-formatted-string',
        'ytd-channel-name',
        '#channel-name',
        '#byline a',
        '.ytd-video-meta-block a'
      ];
      
      for (const selector of channelSelectors) {
        const channelEl = element.querySelector(selector);
        if (channelEl) {
          // Try various ways to get the channel name
          channel = channelEl.getAttribute('aria-label') ||
                    channelEl.getAttribute('title') ||
                    channelEl.textContent || 
                    channelEl.innerText || '';
          channel = channel.trim();
          // Skip if it looks like a duration or view count
          if (channel && !channel.match(/^\d|views|ago|hour|minute|second/i)) {
            break;
          }
          channel = '';
        }
      }
      
      // Metadata line contains views and time
      let time = '';
      const metaLine = element.querySelector('#metadata-line');
      if (metaLine) {
        const text = metaLine.textContent || metaLine.innerText || '';
        // Extract upload time - must contain "ago"
        const timeMatch = text.match(/(\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago|Streamed\s+\d+\s+\w+\s+ago)/i);
        if (timeMatch) {
          time = timeMatch[0];
        }
      }
      
      // Fallback: look for spans with "ago" text
      if (!time) {
        const allSpans = element.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent || span.innerText || '';
          // Must contain "ago" to be an upload time
          if (text.includes('ago')) {
            const match = text.match(/(\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago|Streamed\s+\d+\s+\w+\s+ago)/i);
            if (match) {
              time = match[0];
              break;
            }
          }
        }
      }
      
      // Duration from thumbnail overlay (optional)
      const durationEl = element.querySelector('ytd-thumbnail-overlay-time-status-renderer #text, span#text.ytd-thumbnail-overlay-time-status-renderer');
      const duration = durationEl?.textContent?.trim() || '';
      
      // Try to get data from YouTube's internal properties (Polymer components)
      if ((!title || !url) && element.__data) {
        const data = element.__data;
        if (data && !title && data.title) {
          title = typeof data.title === 'string' ? data.title : (data.title?.text || data.title?.simpleText || '');
        }
        if (data && !url && data.videoId) {
          url = `https://www.youtube.com/watch?v=${data.videoId}`;
        }
        if (data && !channel && data.channelName) {
          channel = typeof data.channelName === 'string' ? data.channelName : (data.channelName?.text || '');
        }
      }
      
      // Final validation
      if (!title || !url) return null;
      
      return { title, url, channel, time, duration };
    } catch (e) {
      console.error('[PrimeYT] Error extracting data from element:', e, element);
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
    
    if (isFeedPage()) {
      resetBuildState();
      // Wait a bit longer for YouTube to render the feed
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
      if (!isFeedPage()) return;
      
      let shouldRebuild = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          // Check if new video elements were added
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && (
                node.matches('ytd-rich-item-renderer') ||
                node.querySelector('ytd-rich-item-renderer')
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
        // Debounce rebuilds
        clearTimeout(buildTimeout);
        scheduleBuildCustomVideoList(1000);
      }
    });
    
    // Observe the feed container for new videos
    const feedContainer = document.querySelector('ytd-rich-grid-renderer, ytd-browse[page-subtype="subscriptions"]');
    if (feedContainer) {
      feedObserver.observe(feedContainer, { childList: true, subtree: true });
    }
    
    // Also observe the whole page for when feed container appears
    feedObserver.observe(document.body, { childList: true, subtree: false });
    
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
