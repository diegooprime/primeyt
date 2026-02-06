(function() {
  'use strict';
  window.PrimeYT = window.PrimeYT || {};
  const U = window.PrimeYT.utils;

  // ==========================================
  // State
  // ==========================================

  let progressBarCreated = false;
  let progressAnimationFrame = null;
  let customCaptionContainer = null;
  let lastCaptionText = '';
  let displayedPhrases = [];
  let captionPollInterval = null;
  let endCardObserver = null;
  let endCardInterval = null;
  let cursorHideSetup = false;
  let cursorHideTimer = null;

  // ==========================================
  // Hide End Cards
  // ==========================================

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
        timeDisplay.textContent = U.formatTime(time);
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

        elapsedEl.textContent = U.formatTime(elapsed);
        totalEl.textContent = U.formatTime(total);
        remainingEl.textContent = U.formatTime(adjustedRemaining);
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
  // Custom Caption System (Clean & Simple)
  // ==========================================

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
        .replace(/["""']/g, '')
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
  // Export
  // ==========================================

  window.PrimeYT.watch = {
    enableTheaterMode,
    createProgressBar,
    updateProgressBar,
    destroyProgressBar,
    setupCaptionStyling,
    destroyCaptionStyling,
    hideEndCards,
    setupEndCardHiding,
    stopEndCardHiding,
    setupCursorHide
  };
})();
