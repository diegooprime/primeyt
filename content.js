// PrimeYT Content Script — Orchestrator
// Coordinates all modules. Loaded last after utils, cache, video-data, feed-list, channel, watch.

(function() {
  'use strict';

  const U = window.PrimeYT.utils;
  const Cache = window.PrimeYT.cache;
  const FL = window.PrimeYT.feedList;
  const CH = window.PrimeYT.channel;
  const W = window.PrimeYT.watch;
  const VD = window.PrimeYT.videoData;

  let lastPath = '';

  // Run immediately
  U.forceBackground();

  // Set body class as soon as possible
  if (document.body) {
    U.updateBodyClasses();
  } else {
    document.addEventListener('DOMContentLoaded', U.updateBodyClasses);
  }

  // ==========================================
  // Hide Surveys & Promos (NOT popup containers!)
  // ==========================================

  function hideSurveysAndPromos() {
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
        el.style.display = 'none';
      });
    });

    U.forceBackground();
  }

  function setupPromoHiding() {
    hideSurveysAndPromos();

    let hideTimeout = null;
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
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
  // Homepage Message
  // ==========================================

  function showHomepageMessage() {
    if (window.location.pathname !== '/') return;

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
  // Page State Updates
  // ==========================================

  function updatePageState() {
    const path = window.location.pathname;
    U.updateBodyClasses();

    // Redirect shorts
    U.redirectShorts();

    // Handle homepage message
    if (path === '/') {
      showHomepageMessage();
      FL.destroyCustomList();
      CH.stopChannelAutoplayPrevention();
    } else {
      removeHomepageMessage();
    }

    // Handle watch page
    if (path === '/watch') {
      setTimeout(() => W.enableTheaterMode(), 500);
      setTimeout(() => W.createProgressBar(), 800);
      setTimeout(() => W.setupCaptionStyling(), 1000);
      setTimeout(() => W.setupEndCardHiding(), 500);
      FL.destroyCustomList();
      CH.stopChannelAutoplayPrevention();
    } else {
      W.destroyProgressBar();
      W.destroyCaptionStyling();
      W.stopEndCardHiding();
    }

    // Handle subscriptions, search, playlist pages
    if (U.isSubscriptionsPage() || U.isSearchPage() || U.isPlaylistPage()) {
      CH.stopChannelAutoplayPrevention();
      if (!FL.isBuilt() && !FL.isCurrentlyBuilding()) {
        // Try to show cached list instantly
        const cachedVideos = Cache.showCachedListImmediately();

        if (cachedVideos) {
          FL.renderCustomVideoList(cachedVideos, true);
          FL.setBuilt(true);
          // Refresh with fresh data in background
          FL.scheduleBuildCustomVideoList(600, true);
        } else {
          FL.scheduleBuildCustomVideoList(400);
        }
      }
    } else if (U.isChannelPage()) {
      if (!CH.isBuilt() && !CH.isCurrentlyBuilding()) {
        CH.scheduleBuildChannelVideoList(500);
      }
      CH.setupChannelAutoplayPrevention();
    } else if (path !== '/watch' && path !== '/') {
      CH.stopChannelAutoplayPrevention();
      FL.destroyCustomList();
    }

    // Track video
    if (window.PrimeYTStats) {
      const videoId = window.PrimeYTStats.getVideoId();
      if (videoId) {
        window.PrimeYTStats.trackVideo(videoId);
      }
    }
  }

  // ==========================================
  // Page Detection Setup
  // ==========================================

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
    const feedObserver = new MutationObserver((mutations) => {
      const onChannelPage = U.isChannelPage();
      if (!U.isSubscriptionsPage() && !U.isSearchPage() && !U.isPlaylistPage() && !onChannelPage) return;

      // Only handle infinite scroll if list is already built
      const isBuilt = onChannelPage ? CH.isBuilt() : FL.isBuilt();
      if (!isBuilt) return;

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
          CH.scheduleBuildChannelVideoList(500, true);
        } else {
          VD.invalidateCache();
          FL.scheduleBuildCustomVideoList(800, true);
        }
      }
    });

    feedObserver.observe(document.body, { childList: true, subtree: true });

    // YouTube's custom navigation event — PRIMARY trigger for initial builds
    window.addEventListener('yt-navigate-finish', () => {
      VD.invalidateCache();
      CH.resetNavigationState();

      updatePageState();

      if (U.isSubscriptionsPage() || U.isSearchPage() || U.isPlaylistPage()) {
        FL.resetBuildState();

        const hasFreshPrefetch = U.isSubscriptionsPage() && Cache.getPrefetchedData() && Cache.getPrefetchedData().length > 0;

        const cachedVideos = Cache.showCachedListImmediately();

        if (cachedVideos) {
          FL.renderCustomVideoList(cachedVideos, true);
          FL.setBuilt(true);

          if (hasFreshPrefetch) {
            console.log('[PrimeYT] Using fresh prefetched data - instant load complete');
          } else {
            FL.scheduleBuildCustomVideoList(800, true);
          }
        } else {
          FL.scheduleBuildCustomVideoList(400, true);
        }
      } else if (U.isChannelPage()) {
        CH.resetBuildState();
        CH.scheduleBuildChannelVideoList(500);
      }
    });

    window.addEventListener('popstate', updatePageState);
  }

  // ==========================================
  // Preload on Hover
  // ==========================================

  function setupHoverPreload() {
    const checkAndAttach = () => {
      const subscriptionLinks = document.querySelectorAll('a[href="/feed/subscriptions"]');

      subscriptionLinks.forEach(link => {
        if (link.dataset.primeytPreload) return;
        link.dataset.primeytPreload = 'true';

        link.addEventListener('mouseenter', () => {
          if (!Cache.getPrefetchedData() && !Cache.isPrefetchInProgress() && !U.isSubscriptionsPage()) {
            console.log('[PrimeYT] Hover detected - triggering prefetch');
            Cache.prefetchSubscriptions();
          }
        });
      });
    };

    checkAndAttach();
    setTimeout(checkAndAttach, 2000);
    setTimeout(checkAndAttach, 5000);
  }

  // ==========================================
  // Space Blocker
  // ==========================================

  function setupSpaceBlocker() {
    window.addEventListener('keydown', function(e) {
      if (e.key === ' ' && window.location.pathname === '/watch') {
        const target = e.target;
        const tagName = target.tagName.toLowerCase();

        if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) {
          return;
        }

        e.stopPropagation();
      }
    }, true);
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

    Cache.clearOldCaches();

    Cache.loadBackgroundCache().then(() => {
      console.log('[PrimeYT] Background cache loaded');
    });

    if (window.PrimeYTStats) {
      window.PrimeYTStats.init();
    }

    if (window.PrimeYTKeyboard) {
      window.PrimeYTKeyboard.init();
    }

    setupPageDetection();

    setupPromoHiding();

    createStatsWidget();
    updateStatsWidget();
    setInterval(updateStatsWidget, 5000);

    setupSpaceBlocker();

    W.setupCursorHide();

    setupHoverPreload();

    Cache.clearOldCaches();

    setTimeout(() => {
      if (!Cache.getBackgroundCacheData()) {
        Cache.prefetchSubscriptions();
      }
    }, 2000);

    setTimeout(() => {
      if (!Cache.getBackgroundCacheData()) {
        Cache.triggerBackgroundSync();
      }
    }, 5000);

    setInterval(() => Cache.prefetchSubscriptions(), 5 * 60 * 1000);

    console.log('[PrimeYT] Ready. Press Space + ? for keyboard shortcuts.');
  }

  init();
})();
