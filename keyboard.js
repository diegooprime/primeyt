// PrimeYT Keyboard Module - Vim-like navigation and leader key

const PrimeYTKeyboard = (function() {
  const LEADER_KEY = ' '; // Space
  const LEADER_TIMEOUT = 1500; // ms to complete chord after leader
  
  let state = {
    leaderActive: false,
    leaderBuffer: '',
    leaderTimer: null,
    focusedVideo: null,
    focusedIndex: -1,
    leaderIndicator: null,
    searchOverlay: null
  };
  
  // ==========================================
  // Key Bindings
  // ==========================================
  
  const bindings = {
    // Direct bindings (no leader) - context aware
    direct: {
      'j': () => isOnWatchPage() ? null : navigateVideos(1), // YouTube handles j on watch page
      'k': () => isOnWatchPage() ? null : navigateVideos(-1), // k = play/pause on watch page
      'h': () => goBack(),
      'l': () => likeVideo(),
      'Enter': () => openFocusedVideo(),
      'Escape': () => handleEscape(),
      'f': () => isOnWatchPage() ? toggleFullscreen() : null,
      't': () => isOnWatchPage() ? toggleTheater() : null,
      'm': () => isOnWatchPage() ? toggleMute() : null,
      'c': () => isOnWatchPage() ? toggleCaptions() : null,
      's': () => shareVideo(),
      'b': () => addToWatchLater(),
    },
    
    // Leader key chords (Space + keys)
    leader: {
      'ff': () => openSearch(),
      'f': null, // Partial match for ff
      's': () => goToSubscriptions(),
      'w': () => goToWatchLater(),
      'p': () => goToPlaylists(),
      'gg': () => scrollToTop(),
      'g': null, // Partial match for gg
      'G': () => scrollToBottom(),
      'H': () => goToHome(),
      '?': () => showHelp(),
    }
  };
  
  // ==========================================
  // Page Detection
  // ==========================================
  
  function isOnWatchPage() {
    return window.location.pathname === '/watch';
  }
  
  function isOnFeedPage() {
    const path = window.location.pathname;
    return path === '/feed/subscriptions' || 
           path === '/playlist' ||
           path.startsWith('/feed/') ||
           path === '/' ||
           path === '/results';
  }
  
  // ==========================================
  // Leader Key System
  // ==========================================
  
  function handleKeyDown(e) {
    // Handle search overlay
    if (state.searchOverlay?.classList.contains('active')) {
      if (e.key === 'Escape') {
        closeSearch();
        e.preventDefault();
      }
      return;
    }
    
    // Ignore if typing in input
    if (isTyping(e.target)) {
      if (e.key === 'Escape') {
        e.target.blur();
        e.preventDefault();
      }
      return;
    }
    
    // Leader key pressed
    if (e.key === LEADER_KEY && !state.leaderActive) {
      e.preventDefault();
      activateLeader();
      return;
    }
    
    // If leader is active, buffer the key
    if (state.leaderActive) {
      // Ignore modifier keys - they don't count as part of the chord
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }
      
      e.preventDefault();
      state.leaderBuffer += e.key;
      updateLeaderIndicator();
      
      // Check if buffer matches a binding
      const action = bindings.leader[state.leaderBuffer];
      if (action) {
        action();
        deactivateLeader();
        return;
      }
      
      // Check if buffer could still match something
      const couldMatch = Object.keys(bindings.leader).some(
        key => key.startsWith(state.leaderBuffer) && key !== state.leaderBuffer
      );
      
      if (!couldMatch) {
        deactivateLeader();
      }
      return;
    }
    
    // Direct bindings
    const directAction = bindings.direct[e.key];
    if (directAction) {
      const result = directAction();
      // Only prevent default if action returned something (not null)
      if (result !== null) {
        e.preventDefault();
      }
    }
  }
  
  function activateLeader() {
    state.leaderActive = true;
    state.leaderBuffer = '';
    showLeaderIndicator();
    
    state.leaderTimer = setTimeout(() => {
      deactivateLeader();
    }, LEADER_TIMEOUT);
  }
  
  function deactivateLeader() {
    state.leaderActive = false;
    state.leaderBuffer = '';
    if (state.leaderTimer) {
      clearTimeout(state.leaderTimer);
      state.leaderTimer = null;
    }
    hideLeaderIndicator();
  }
  
  function isTyping(element) {
    const tagName = element.tagName.toLowerCase();
    const isEditable = element.isContentEditable;
    const isInput = tagName === 'input' || tagName === 'textarea';
    const isSearchInput = element.id === 'primeyt-search-input';
    
    return isEditable || isInput || isSearchInput;
  }
  
  function handleEscape() {
    if (state.searchOverlay?.classList.contains('active')) {
      closeSearch();
    } else {
      clearFocus();
    }
  }
  
  // ==========================================
  // Leader Indicator UI
  // ==========================================
  
  function createLeaderIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'primeyt-leader';
    indicator.innerHTML = '<span class="label">LEADER</span> <span class="keys"></span>';
    document.body.appendChild(indicator);
    state.leaderIndicator = indicator;
  }
  
  function showLeaderIndicator() {
    if (!state.leaderIndicator) createLeaderIndicator();
    state.leaderIndicator.classList.add('active');
    updateLeaderIndicator();
  }
  
  function hideLeaderIndicator() {
    if (state.leaderIndicator) {
      state.leaderIndicator.classList.remove('active');
    }
  }
  
  function updateLeaderIndicator() {
    if (state.leaderIndicator) {
      const keysSpan = state.leaderIndicator.querySelector('.keys');
      keysSpan.textContent = state.leaderBuffer || '_';
    }
  }
  
  // ==========================================
  // Video Navigation
  // ==========================================
  
  function getVideoElements() {
    // Check for custom PrimeYT list first
    const customRows = document.querySelectorAll('.primeyt-video-row');
    if (customRows.length > 0) {
      return Array.from(customRows);
    }
    
    // Fallback to YouTube's elements
    const selectors = [
      'ytd-rich-item-renderer:has(#video-title-link)', // Home/Subscriptions
      'ytd-video-renderer', // Search results
      'ytd-grid-video-renderer', // Channel videos
      'ytd-playlist-video-renderer', // Playlist items
      'ytd-playlist-panel-video-renderer' // Watch page playlist
    ];
    
    return Array.from(document.querySelectorAll(selectors.join(', ')))
      .filter(el => el.offsetParent !== null); // Only visible elements
  }
  
  function navigateVideos(direction) {
    const videos = getVideoElements();
    if (videos.length === 0) return true;
    
    // Clear previous focus
    if (state.focusedVideo) {
      state.focusedVideo.classList.remove('primeyt-focused');
    }
    
    // Calculate new index
    if (state.focusedIndex === -1) {
      state.focusedIndex = direction > 0 ? 0 : videos.length - 1;
    } else {
      state.focusedIndex += direction;
    }
    
    // Clamp to bounds
    state.focusedIndex = Math.max(0, Math.min(state.focusedIndex, videos.length - 1));
    
    // Focus the video
    const video = videos[state.focusedIndex];
    if (video) {
      state.focusedVideo = video;
      video.classList.add('primeyt-focused');
      video.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    return true;
  }
  
  function clearFocus() {
    if (state.focusedVideo) {
      state.focusedVideo.classList.remove('primeyt-focused');
      state.focusedVideo = null;
      state.focusedIndex = -1;
    }
  }
  
  function openFocusedVideo() {
    if (!state.focusedVideo) return;
    
    // Check if it's our custom row
    if (state.focusedVideo.classList.contains('primeyt-video-row')) {
      const url = state.focusedVideo.dataset.url;
      if (url) {
        window.location.href = url;
        return;
      }
    }
    
    // Fallback: Find the link in the focused video
    const link = state.focusedVideo.querySelector('a#video-title-link, a#video-title, a.ytd-playlist-panel-video-renderer');
    if (link) {
      link.click();
    }
  }
  
  // ==========================================
  // Search Dialog
  // ==========================================
  
  function createSearchOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'primeyt-search-overlay';
    overlay.className = 'primeyt-overlay';
    overlay.innerHTML = `
      <div class="primeyt-dialog">
        <input type="text" id="primeyt-search-input" class="primeyt-dialog-input" placeholder="Search YouTube..." autofocus>
        <div class="primeyt-dialog-hint">Enter to search · Esc to close</div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
    
    const input = overlay.querySelector('#primeyt-search-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const query = encodeURIComponent(input.value.trim());
        window.location.href = `https://www.youtube.com/results?search_query=${query}`;
      }
    });
    
    state.searchOverlay = overlay;
    return overlay;
  }
  
  function openSearch() {
    if (!state.searchOverlay) createSearchOverlay();
    state.searchOverlay.classList.add('active');
    const input = state.searchOverlay.querySelector('#primeyt-search-input');
    input.value = '';
    setTimeout(() => input.focus(), 10);
  }
  
  function closeSearch() {
    if (state.searchOverlay) {
      state.searchOverlay.classList.remove('active');
    }
  }
  
  // ==========================================
  // Video Player Actions
  // ==========================================
  
  function getPlayer() {
    return document.querySelector('#movie_player');
  }
  
  function getVideo() {
    return document.querySelector('video.html5-main-video');
  }
  
  function toggleFullscreen() {
    const player = getPlayer();
    if (player) {
      const btn = document.querySelector('.ytp-fullscreen-button');
      if (btn) btn.click();
    }
    return true;
  }
  
  function toggleTheater() {
    const btn = document.querySelector('.ytp-size-button');
    if (btn) btn.click();
    return true;
  }
  
  function toggleMute() {
    const video = getVideo();
    if (video) {
      video.muted = !video.muted;
    }
    return true;
  }
  
  function toggleCaptions() {
    const btn = document.querySelector('.ytp-subtitles-button');
    if (btn) btn.click();
    return true;
  }
  
  function likeVideo() {
    // Works on watch page
    const likeBtn = document.querySelector('#segmented-like-button button, ytd-toggle-button-renderer#button[aria-label*="like" i]');
    if (likeBtn) {
      likeBtn.click();
      showToast('Liked!');
    }
    return true;
  }
  
  function shareVideo() {
    // Copy current URL to clipboard
    const url = window.location.href;
    // Clean tracking params
    const cleanUrl = url.split('&')[0]; // Simple clean - keeps just ?v=xxx
    
    navigator.clipboard.writeText(cleanUrl).then(() => {
      showToast('Link copied!');
    }).catch(() => {
      // Fallback: try share button
      const shareBtn = document.querySelector('button[aria-label*="Share" i]');
      if (shareBtn) shareBtn.click();
    });
    return true;
  }
  
  function addToWatchLater() {
    // Try the save button first (3-dot menu alternative)
    const saveBtn = document.querySelector('#button-shape button[aria-label*="Save"]');
    if (saveBtn) {
      saveBtn.click();
      setTimeout(() => {
        // Click "Watch Later" in the menu
        const watchLaterItem = document.querySelector('tp-yt-paper-item:has(yt-formatted-string)');
        const items = document.querySelectorAll('ytd-menu-service-item-renderer, ytd-playlist-add-to-option-renderer');
        for (const item of items) {
          if (item.textContent.toLowerCase().includes('watch later')) {
            item.click();
            showToast('Added to Watch Later!');
            return;
          }
        }
      }, 200);
    }
    return true;
  }
  
  // ==========================================
  // Navigation Actions
  // ==========================================
  
  function goBack() {
    window.history.back();
    return true;
  }
  
  function goToSubscriptions() {
    window.location.href = 'https://www.youtube.com/feed/subscriptions';
  }
  
  function goToWatchLater() {
    window.location.href = 'https://www.youtube.com/playlist?list=WL';
  }
  
  function goToPlaylists() {
    window.location.href = 'https://www.youtube.com/feed/playlists';
  }
  
  function goToHome() {
    window.location.href = 'https://www.youtube.com/';
  }
  
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    clearFocus();
  }
  
  function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  
  // ==========================================
  // Toast Notifications
  // ==========================================
  
  function showToast(message) {
    let toast = document.getElementById('primeyt-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'primeyt-toast';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add('active');
    
    setTimeout(() => {
      toast.classList.remove('active');
    }, 2000);
  }
  
  // ==========================================
  // Help Dialog
  // ==========================================
  
  function showHelp() {
    // Remove existing help if open
    const existing = document.getElementById('primeyt-help-overlay');
    if (existing) {
      existing.remove();
      return;
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'primeyt-help-overlay';
    overlay.className = 'primeyt-overlay active';
    overlay.innerHTML = `
      <div class="primeyt-help-dialog">
        <div class="primeyt-help-header">
          <span>Keyboard Shortcuts</span>
          <span class="primeyt-help-close">Esc to close</span>
        </div>
        <div class="primeyt-help-content">
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Navigation</div>
            <div class="primeyt-help-row"><kbd>j</kbd> <span>Next video</span></div>
            <div class="primeyt-help-row"><kbd>k</kbd> <span>Previous video</span></div>
            <div class="primeyt-help-row"><kbd>h</kbd> <span>Go back</span></div>
            <div class="primeyt-help-row"><kbd>Enter</kbd> <span>Open video</span></div>
            <div class="primeyt-help-row"><kbd>Esc</kbd> <span>Clear focus</span></div>
          </div>
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Video Controls</div>
            <div class="primeyt-help-row"><kbd>f</kbd> <span>Fullscreen</span></div>
            <div class="primeyt-help-row"><kbd>t</kbd> <span>Theater mode</span></div>
            <div class="primeyt-help-row"><kbd>m</kbd> <span>Mute/unmute</span></div>
            <div class="primeyt-help-row"><kbd>c</kbd> <span>Captions</span></div>
            <div class="primeyt-help-row"><kbd>l</kbd> <span>Like</span></div>
            <div class="primeyt-help-row"><kbd>s</kbd> <span>Share (copy link)</span></div>
            <div class="primeyt-help-row"><kbd>b</kbd> <span>Watch Later</span></div>
          </div>
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Leader Commands</div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>f</kbd> <kbd>f</kbd> <span>Search</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>s</kbd> <span>Subscriptions</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>w</kbd> <span>Watch Later</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>p</kbd> <span>Playlists</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>g</kbd> <kbd>g</kbd> <span>Scroll to top</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>G</kbd> <span>Scroll to bottom</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>H</kbd> <span>Home</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>?</kbd> <span>Show help</span></div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Close on click outside or Escape
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    
    const closeOnEscape = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', closeOnEscape);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
  }
  
  // ==========================================
  // Page Change Handler
  // ==========================================
  
  function onPageChange() {
    // Clear focus when navigating
    clearFocus();
  }
  
  // ==========================================
  // Initialization
  // ==========================================
  
  function init() {
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', onPageChange);
    window.addEventListener('yt-navigate-finish', onPageChange);
    
    // Watch for DOM changes that might remove focused element
    const observer = new MutationObserver(() => {
      if (state.focusedVideo && !document.contains(state.focusedVideo)) {
        state.focusedVideo = null;
        state.focusedIndex = -1;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    console.log('[PrimeYT] Keyboard shortcuts active. Press Space + ? for help.');
  }
  
  return {
    init,
    clearFocus,
    showToast
  };
})();

window.PrimeYTKeyboard = PrimeYTKeyboard;

