// PrimeYT Channel — channel page features (autoplay prevention, video list, sorting)
// No side effects at load time. Deps: PrimeYT.utils, PrimeYT.videoData

(function() {
  'use strict';

  window.PrimeYT = window.PrimeYT || {};

  const U = window.PrimeYT.utils;
  const VD = window.PrimeYT.videoData;

  // ==========================================
  // Module State
  // ==========================================

  let customListBuilt = false;
  let isBuilding = false;
  let buildAttempts = 0;
  let buildDebounceTimer = null;
  let channelSortOrder = 'newest';
  let channelVideosCache = [];
  let channelInfo = { name: '', subscribers: '', handle: '' };
  let channelVideosDisplayed = 25;
  const CHANNEL_VIDEOS_INCREMENT = 25;
  let channelAutoplayObserver = null;
  let continuationToken = null;
  let isFetchingContinuation = false;
  let channelContinuationApiKey = null;
  let lastLazyLoadTrigger = 0;
  let durationCache = new Map();
  let durationUpdateInterval = null;
  let durationObserver = null;

  // ==========================================
  // Helpers
  // ==========================================

  function getVideoIdFromUrl(url) {
    try { return new URL(url).searchParams.get('v'); } catch (e) { return null; }
  }

  // ==========================================
  // Channel Page Autoplay Prevention
  // ==========================================

  function setupChannelAutoplayPrevention() {
    if (!U.isChannelPage()) return;

    // Stop any currently playing videos
    pauseAllVideos();

    // Watch for new videos that might start playing
    if (channelAutoplayObserver) {
      channelAutoplayObserver.disconnect();
    }

    channelAutoplayObserver = new MutationObserver(() => {
      if (U.isChannelPage()) {
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
    if (!U.isChannelPage()) return;

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

  // ==========================================
  // Channel Info
  // ==========================================

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

  // ==========================================
  // Build / Render
  // ==========================================

  async function buildChannelVideoList(forceRebuild = false) {
    if (!U.isChannelPage()) return;

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
      const result = VD.collectChannelVideosFromData(channelInfo.name);
      const videosFromData = result.videos;
      continuationToken = result.continuationToken;
      channelContinuationApiKey = result.channelContinuationApiKey;

      const videosFromDom = VD.collectChannelVideosFromDom(channelInfo.name);

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
      const sorted = VD.sortChannelVideos(combined, channelSortOrder);
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

  function scheduleBuildChannelVideoList(delay = 400, forceRebuild = false) {
    if (buildDebounceTimer) {
      clearTimeout(buildDebounceTimer);
    }
    buildDebounceTimer = setTimeout(() => {
      buildDebounceTimer = null;
      buildChannelVideoList(forceRebuild);
    }, delay);
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
          const sorted = VD.sortChannelVideos(channelVideosCache, channelSortOrder);
          renderChannelVideoList(sorted, false); // Don't reset display count
        }
      }
    } catch (e) {
      console.log('[PrimeYT] Error in fetchContinuationAndUpdate:', e);
    }
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
        const { videos, nextToken } = VD.extractVideosFromContinuation(data, channelInfo.name);

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

  // ==========================================
  // Render
  // ==========================================

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
        <span class="primeyt-channel-name">${U.escapeHtml(channelInfo.name)}</span>
        <span class="primeyt-channel-subs">${U.escapeHtml(channelInfo.subscribers)}</span>
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
        const sorted = VD.sortChannelVideos(channelVideosCache, newOrder);
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

      const durationMin = U.formatDurationToMinutes(video.duration);
      const dateStr = VD.formatChannelVideoDate(video.timestamp);
      const watchedIndicator = isWatched ? '<span class="primeyt-watched-icon">✓</span>' : '';

      row.innerHTML = `
        <span class="primeyt-line-number" data-index="${index}">${index}</span>
        <div class="primeyt-video-left">
          ${watchedIndicator}
          <div class="primeyt-video-title" title="${U.escapeHtml(video.title)}">${U.escapeHtml(cleanTitle)}</div>
        </div>
        <div class="primeyt-video-right">
          <div class="primeyt-video-views">${U.escapeHtml(video.viewsFormatted)}</div>
          <div class="primeyt-video-duration">${U.escapeHtml(durationMin)}</div>
          <div class="primeyt-video-date">${U.escapeHtml(dateStr)}</div>
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

  // ==========================================
  // Scroll / Lazy Load
  // ==========================================

  function handleChannelScroll(e) {
    const wrapper = e.target;
    const scrollBottom = wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight;

    // Load more when within 200px of bottom
    if (scrollBottom < 200) {
      const sortedVideos = VD.sortChannelVideos(channelVideosCache, channelSortOrder);

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

  function resortChannelVideos(order) {
    if (!U.isChannelPage() || channelVideosCache.length === 0) return;

    channelSortOrder = order;
    const sorted = VD.sortChannelVideos(channelVideosCache, order);
    renderChannelVideoList(sorted, true); // Reset to 25 videos when sorting changes
  }

  // ==========================================
  // Duration Updater
  // ==========================================

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
              durationEl.textContent = U.formatDurationToMinutes(duration);
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
  // Reset / Cleanup
  // ==========================================

  function resetBuildState() {
    buildAttempts = 0;
    if (buildDebounceTimer) {
      clearTimeout(buildDebounceTimer);
      buildDebounceTimer = null;
    }
  }

  function destroyCustomList() {
    const list = document.getElementById('primeyt-list-wrapper');
    if (list) list.remove();
    const oldList = document.getElementById('primeyt-video-list');
    if (oldList) oldList.remove();
    document.body.classList.remove('primeyt-list-active');
    resetBuildState();
    customListBuilt = false;
    if (durationUpdateInterval) {
      clearInterval(durationUpdateInterval);
      durationUpdateInterval = null;
    }
    stopDurationObserver();
  }

  function resetNavigationState() {
    channelVideosCache = [];
    channelInfo = { name: '', subscribers: '', handle: '' };
    continuationToken = null;
    isFetchingContinuation = false;
    channelContinuationApiKey = null;
  }

  // ==========================================
  // Export
  // ==========================================

  window.PrimeYT.channel = {
    isChannelPage: U.isChannelPage,
    buildChannelVideoList,
    scheduleBuildChannelVideoList,
    renderChannelVideoList,
    resortChannelVideos,
    getChannelSortOrder: () => channelSortOrder,
    setChannelSortOrder: (order) => { channelSortOrder = order; },
    getChannelVideosCache: () => channelVideosCache,
    setupChannelAutoplayPrevention,
    stopChannelAutoplayPrevention,
    isBuilt: () => customListBuilt,
    isCurrentlyBuilding: () => isBuilding,
    setBuilt: (val) => { customListBuilt = val; },
    destroyCustomList,
    resetBuildState,
    resetNavigationState
  };
})();
