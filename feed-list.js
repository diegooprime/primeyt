// PrimeYT Feed List — custom list builder for subscriptions/search/playlist pages
// No side effects at load time. Deps: PrimeYT.utils, PrimeYT.videoData, PrimeYT.cache

(function() {
  'use strict';

  window.PrimeYT = window.PrimeYT || {};

  const U = window.PrimeYT.utils;
  const VD = window.PrimeYT.videoData;
  const Cache = window.PrimeYT.cache;

  // ==========================================
  // Module State
  // ==========================================

  let customListBuilt = false;
  let isBuilding = false;
  let buildAttempts = 0;
  let buildDebounceTimer = null;
  let durationCache = new Map();
  let durationUpdateInterval = null;
  let durationObserver = null;

  // ==========================================
  // Helpers
  // ==========================================

  function getVideoIdFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('v');
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // Build Scheduling & State
  // ==========================================

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
    VD.invalidateCache();
  }

  // ==========================================
  // Build & Render
  // ==========================================

  function buildCustomVideoList(forceRebuild = false) {
    if (!U.isSubscriptionsPage() && !U.isSearchPage() && !U.isPlaylistPage()) return;

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
      const videosFromData = VD.collectVideosFromData();
      const videosFromDom = VD.collectVideosFromDom();

      const combined = [];
      const seen = new Set();
      [...videosFromData, ...videosFromDom].forEach(video => {
        if (!video || !video.url || seen.has(video.url)) return;
        seen.add(video.url);
        combined.push(video);
      });

      const pageType = U.isSearchPage() ? 'search' : U.isPlaylistPage() ? 'playlist' : 'subscriptions';
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
      const durationMin = U.formatDurationToMinutes(duration);
      const dateStr = U.formatRelativeDate(video.time);

      // Watched indicator (checkmark)
      const watchedIndicator = isWatched ? '<span class="primeyt-watched-icon">✓</span>' : '';

      row.innerHTML = `
        <span class="primeyt-line-number" data-index="${index}">${index}</span>
        <div class="primeyt-video-left">
          ${watchedIndicator}
          <div class="primeyt-video-title" title="${U.escapeHtml(video.title)}">${U.escapeHtml(cleanTitle)}</div>
        </div>
        <div class="primeyt-video-right">
          <div class="primeyt-video-channel" title="${U.escapeHtml(video.channel)}">${U.escapeHtml(video.channel)}</div>
          <div class="primeyt-video-duration">${U.escapeHtml(durationMin)}</div>
          <div class="primeyt-video-date">${U.escapeHtml(dateStr)}</div>
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
      Cache.saveVideoListToCache(videos);
    }

    // Start polling for missing durations
    startDurationUpdater();
  }

  // ==========================================
  // Destroy
  // ==========================================

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

  // ==========================================
  // Duration Updater
  // ==========================================

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
  // Export
  // ==========================================

  window.PrimeYT.feedList = {
    buildCustomVideoList,
    scheduleBuildCustomVideoList,
    resetBuildState,
    renderCustomVideoList,
    destroyCustomList,
    isBuilt: () => customListBuilt,
    isCurrentlyBuilding: () => isBuilding,
    setBuilt: (val) => { customListBuilt = val; }
  };
})();
