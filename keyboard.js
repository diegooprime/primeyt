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
    searchOverlay: null,
    filterOverlay: null,
    filterActive: false,
    countBuffer: '',      // For Vim-style count prefix (e.g., "5" in "5j")
    countTimer: null,     // Reset count after timeout
    chapterOverlay: null, // Chapter navigation modal
    chapters: [],         // Cached chapters for current video
    focusedChapter: -1,   // Currently focused chapter in modal
    sortMode: false,      // Sort mode active (for channel pages)
    sortTimer: null       // Reset sort mode after timeout
  };
  
  // ==========================================
  // Key Bindings
  // ==========================================
  
  const bindings = {
    // Direct bindings (no leader) - context aware
    direct: {
      // Watch page controls
      'j': () => isOnWatchPage() ? seekBackward(10) : navigateVideos(1),
      'k': () => isOnWatchPage() ? likeVideo() : navigateVideos(-1),
      'l': () => isOnWatchPage() ? seekForward(10) : null,
      'm': () => isOnWatchPage() ? toggleMute() : null,
      'c': () => isOnWatchPage() ? toggleCaptions() : null,
      't': () => isOnWatchPage() ? toggleTheater() : null,
      'u': () => isOnWatchPage() ? openChapterModal() : null,
      
      // Shift+H to go back - works on ALL pages
      'H': () => goBack(),
      
      // Navigation (non-watch pages)
      'Enter': (e) => openFocusedVideo(e && e.shiftKey),
      'Escape': () => goToHomeRefresh(),
      
      // Vim-style filter search with /
      '/': () => !isOnWatchPage() ? openFilter() : null,
      
      // Navigate filter matches (like Vim n/N)
      'n': () => !isOnWatchPage() ? navigateFilterMatches(1) : null,
      'N': () => openNewYouTubeTab(), // Shift+N opens fresh YouTube in new tab
      
      // Actions
      'w': () => addToWatchLater(),
      's': () => enterSortMode(), // Sort mode on channel pages
      'S': () => shareVideo(), // Shift+S to copy link
      'x': () => removeFromPlaylist(), // Remove focused video from playlist
      'Tab': () => goToChannel(), // Go to channel (works on watch page and list)
    },
    
    // Leader key chords (Space + keys)
    leader: {
      'ff': () => openSearch(),
      'f': null, // Partial match for ff
      's': () => goToSubscriptions(),
      'w': () => goToWatchLater(),
      'p': () => goToStudio(),
      'l': () => goForward(),
      'r': () => goToHomeRefresh(),
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

  function isOnPlaylistsFeedPage() {
    const result = window.location.pathname === '/feed/playlists';
    if (result) console.log('[PrimeYT] On playlists feed page');
    return result;
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
    
    // Handle filter overlay
    if (state.filterOverlay?.classList.contains('active')) {
      if (e.key === 'Escape') {
        closeFilter();
        e.preventDefault();
      }
      return;
    }
    
    // Handle chapter modal
    if (state.chapterOverlay?.classList.contains('active')) {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.key === 'Escape') {
        closeChapterModal();
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        navigateChapters(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        navigateChapters(-1);
      } else if (e.key === 'Enter') {
        jumpToFocusedChapter();
      } else if (e.key === 'u') {
        // Close modal if u pressed again
        closeChapterModal();
      }
      return;
    }
    
    // Handle sort mode (channel pages)
    if (state.sortMode) {
      e.preventDefault();
      e.stopPropagation();
      
      const sortKeys = {
        'n': 'newest',
        'v': 'views',
        'o': 'oldest'
      };
      
      if (e.key === 'Escape') {
        exitSortMode();
      } else if (sortKeys[e.key]) {
        applySortOrder(sortKeys[e.key]);
        exitSortMode();
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
    
    // Leader key pressed - MUST block YouTube's space handler
    if (e.key === LEADER_KEY && !state.leaderActive) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Extra: blur the player to prevent it from receiving the event
      if (isOnWatchPage()) {
        const player = document.querySelector('#movie_player');
        if (player) player.blur();
        document.activeElement?.blur();
      }
      
      activateLeader();
      return false;
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
    
    // Vim-style count buffer: accumulate digits (1-9 to start, then 0-9)
    // On feed pages only, not watch page
    if (!isOnWatchPage()) {
      const isDigit = /^[0-9]$/.test(e.key);
      
      if (isDigit) {
        // Don't start count with 0 (0 could be a command itself)
        if (state.countBuffer === '' && e.key === '0') {
          // Let it fall through to direct bindings
        } else {
          state.countBuffer += e.key;
          showCountIndicator();
          resetCountTimer();
          e.preventDefault();
          return;
        }
      }
    }
    
    // Get count from buffer (default to 1)
    const count = parseInt(state.countBuffer, 10) || 1;
    
    // Clear count buffer before executing action
    const hadCount = state.countBuffer !== '';
    clearCountBuffer();
    
    // Direct bindings
    const directAction = bindings.direct[e.key];
    if (directAction) {
      // Pass count to navigation actions
      let result;
      if (e.key === 'j' && !isOnWatchPage()) {
        result = navigateVideos(count);
      } else if (e.key === 'k' && !isOnWatchPage()) {
        result = navigateVideos(-count);
      } else {
        result = directAction(e);
      }
      
      // Only prevent default if action returned something (not null)
      if (result !== null) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // Prevent YouTube from handling it
        return false;
      }
    }
  }
  
  // ==========================================
  // Count Buffer (Vim-style count prefix)
  // ==========================================
  
  function showCountIndicator() {
    if (!state.leaderIndicator) createLeaderIndicator();
    state.leaderIndicator.classList.add('active');
    const keysSpan = state.leaderIndicator.querySelector('.keys');
    const labelSpan = state.leaderIndicator.querySelector('.label');
    labelSpan.textContent = 'COUNT';
    keysSpan.textContent = state.countBuffer;
  }
  
  function clearCountBuffer() {
    state.countBuffer = '';
    if (state.countTimer) {
      clearTimeout(state.countTimer);
      state.countTimer = null;
    }
    // Only hide if not in leader mode
    if (!state.leaderActive && state.leaderIndicator) {
      state.leaderIndicator.classList.remove('active');
      // Reset label
      const labelSpan = state.leaderIndicator.querySelector('.label');
      if (labelSpan) labelSpan.textContent = 'LEADER';
    }
  }
  
  function resetCountTimer() {
    if (state.countTimer) clearTimeout(state.countTimer);
    state.countTimer = setTimeout(() => {
      clearCountBuffer();
    }, 1500); // Reset after 1.5s of no input
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
  if (!element || !element.tagName) return false;
  const tagName = element.tagName.toLowerCase();
    const isEditable = element.isContentEditable;
    const isInput = tagName === 'input' || tagName === 'textarea';
    const isSearchInput = element.id === 'primeyt-search-input';
    const isFilterInput = element.id === 'primeyt-filter-input';
    
    return isEditable || isInput || isSearchInput || isFilterInput;
  }
  
  function handleEscape() {
    if (state.searchOverlay?.classList.contains('active')) {
      closeSearch();
    } else if (state.filterOverlay?.classList.contains('active')) {
      closeFilter();
    } else {
      // Clear filter highlighting too
      clearVideoFilter();
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
      // Filter out hidden videos (from filter search)
      return Array.from(customRows).filter(row => {
        return !row.classList.contains('primeyt-filter-hidden') &&
               row.style.display !== 'none';
      });
    }

    // On playlists feed page, select all playlist items
    if (isOnPlaylistsFeedPage()) {
      // Try multiple selectors for playlists feed
      const selectors = [
        'ytd-rich-item-renderer',
        'ytd-grid-playlist-renderer',
        'ytd-playlist-renderer'
      ];
      const elements = Array.from(document.querySelectorAll(selectors.join(', ')));
      console.log('[PrimeYT] Playlists feed - found elements:', elements.length);
      return elements;
    }

    // Fallback to YouTube's elements
    const selectors = [
      'ytd-rich-item-renderer:has(#video-title-link)', // Home/Subscriptions
      'ytd-video-renderer', // Search results
      'ytd-grid-video-renderer', // Channel videos
      'ytd-grid-playlist-renderer', // Playlist grid items
      'ytd-playlist-video-renderer', // Playlist items
      'ytd-playlist-panel-video-renderer' // Watch page playlist
    ];

    return Array.from(document.querySelectorAll(selectors.join(', ')))
      .filter(el => el.offsetParent !== null); // Only visible elements
  }
  
  function navigateVideos(direction) {
    const videos = getVideoElements();
    console.log('[PrimeYT] navigateVideos called, direction:', direction, 'videos found:', videos.length);
    if (videos.length === 0) return true;
    
    // Clear previous focus
    if (state.focusedVideo) {
      state.focusedVideo.classList.remove('primeyt-focused');
    }
    
    // Find current position in visible videos array
    let currentVisibleIndex = -1;
    if (state.focusedVideo) {
      currentVisibleIndex = videos.indexOf(state.focusedVideo);
    }
    
    // Calculate new index in visible videos
    let newVisibleIndex;
    if (currentVisibleIndex === -1) {
      newVisibleIndex = direction > 0 ? 0 : videos.length - 1;
    } else {
      newVisibleIndex = currentVisibleIndex + direction;
    }
    
    // Clamp to bounds
    newVisibleIndex = Math.max(0, Math.min(newVisibleIndex, videos.length - 1));
    
    // Focus the video
    const video = videos[newVisibleIndex];
    if (video) {
      state.focusedVideo = video;
      state.focusedIndex = parseInt(video.dataset?.index, 10) || newVisibleIndex;
      video.classList.add('primeyt-focused');
      video.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Update relative line numbers based on focused row
      updateRelativeLineNumbers(video);
    }
    
    return true;
  }
  
  function clearFocus() {
    if (state.focusedVideo) {
      state.focusedVideo.classList.remove('primeyt-focused');
      state.focusedVideo = null;
      state.focusedIndex = -1;
    }
    
    // Reset to absolute line numbers (no focus)
    updateRelativeLineNumbers(null);
  }
  
  function openFocusedVideo(newTab = false) {
    if (!state.focusedVideo) return null;

    // On playlists feed page, always open in new tab
    if (isOnPlaylistsFeedPage()) {
      newTab = true;
    }

    let url = null;

    // Check if it's our custom row
    if (state.focusedVideo.classList.contains('primeyt-video-row')) {
      url = state.focusedVideo.dataset.url;
    } else {
      // Try to find playlist link first (for playlists feed page)
      const playlistLink = state.focusedVideo.querySelector('a[href*="/playlist?list="]');
      if (playlistLink) {
        url = playlistLink.href;
      } else {
        // Fallback: Find the video link
        const link = state.focusedVideo.querySelector('a#video-title-link, a#video-title, a.ytd-playlist-panel-video-renderer');
        if (link) {
          url = link.href;
        }
      }
    }

    if (url) {
      if (newTab) {
        // Create a temporary link and simulate Cmd+Click for proper new tab behavior
        const tempLink = document.createElement('a');
        tempLink.href = url;
        tempLink.style.display = 'none';
        document.body.appendChild(tempLink);

        // Dispatch click with metaKey (Cmd on Mac) to open in new tab properly
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          metaKey: true,  // Cmd key on Mac
          ctrlKey: false
        });
        tempLink.dispatchEvent(clickEvent);
        document.body.removeChild(tempLink);
      } else {
        window.location.href = url;
      }
      return true;
    }

    return null;
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
  // Filter Dialog (Vim-style / search)
  // ==========================================
  
  function createFilterOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'primeyt-filter-overlay';
    overlay.className = 'primeyt-filter-bar';
    overlay.innerHTML = `
      <span class="primeyt-filter-slash">/</span>
      <input type="text" id="primeyt-filter-input" class="primeyt-filter-input" placeholder="Filter videos..." autofocus>
      <span class="primeyt-filter-count" id="primeyt-filter-count"></span>
      <span class="primeyt-filter-hint">Enter to jump · Esc to close · n/N next/prev</span>
    `;
    document.body.appendChild(overlay);
    
    const input = overlay.querySelector('#primeyt-filter-input');
    
    // Filter as you type
    input.addEventListener('input', (e) => {
      filterVideoList(input.value);
    });
    
    // Handle special keys
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // Jump to first match and close
        const firstMatch = document.querySelector('.primeyt-video-row.primeyt-filter-match');
        if (firstMatch) {
          focusVideoRow(firstMatch);
        }
        closeFilter();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        closeFilter();
        e.preventDefault();
      } else if (e.key === 'n' && !e.shiftKey && e.ctrlKey) {
        // Ctrl+n for next match
        navigateFilterMatches(1);
        e.preventDefault();
      } else if (e.key === 'n' && e.shiftKey && e.ctrlKey) {
        // Ctrl+Shift+n for previous match
        navigateFilterMatches(-1);
        e.preventDefault();
      }
    });
    
    state.filterOverlay = overlay;
    return overlay;
  }
  
  function openFilter() {
    // Only works on pages with custom video list
    const videoList = document.getElementById('primeyt-video-list');
    if (!videoList) return null;
    
    if (!state.filterOverlay) createFilterOverlay();
    state.filterOverlay.classList.add('active');
    state.filterActive = true;
    
    const input = state.filterOverlay.querySelector('#primeyt-filter-input');
    input.value = '';
    
    // Reset filter state
    clearVideoFilter();
    
    setTimeout(() => input.focus(), 10);
    return true;
  }
  
  function closeFilter(clearFilter = false) {
    if (state.filterOverlay) {
      state.filterOverlay.classList.remove('active');
      state.filterActive = false;
      
      if (clearFilter) {
        clearVideoFilter();
      }
    }
  }
  
  function clearVideoFilter() {
    const rows = document.querySelectorAll('.primeyt-video-row');
    if (rows.length === 0) return;
    
    rows.forEach(row => {
      row.classList.remove('primeyt-filter-match', 'primeyt-filter-hidden', 'primeyt-filter-current');
      row.style.display = '';
    });
    
    const countEl = document.getElementById('primeyt-filter-count');
    if (countEl) countEl.textContent = '';
    
    // Recalculate line numbers for all visible videos
    updateRelativeLineNumbers(state.focusedVideo);
  }
  
  function filterVideoList(query) {
    const rows = document.querySelectorAll('.primeyt-video-row');
    
    if (!query || query.trim() === '') {
      clearVideoFilter();
      return;
    }
    
    const searchTerms = query.toLowerCase().trim().split(/\s+/);
    let matchCount = 0;
    let firstMatch = null;
    
    rows.forEach(row => {
      const title = row.querySelector('.primeyt-video-title')?.textContent?.toLowerCase() || '';
      const channel = row.querySelector('.primeyt-video-channel')?.textContent?.toLowerCase() || '';
      const fullText = title + ' ' + channel;
      
      // All search terms must match (AND logic)
      const matches = searchTerms.every(term => fullText.includes(term));
      
      if (matches) {
        row.classList.add('primeyt-filter-match');
        row.classList.remove('primeyt-filter-hidden');
        row.style.display = '';
        matchCount++;
        if (!firstMatch) firstMatch = row;
      } else {
        row.classList.remove('primeyt-filter-match', 'primeyt-filter-current', 'primeyt-focused');
        row.classList.add('primeyt-filter-hidden');
        row.style.display = 'none';
      }
    });
    
    // Highlight and focus first match
    if (firstMatch) {
      document.querySelectorAll('.primeyt-filter-current').forEach(el => {
        el.classList.remove('primeyt-filter-current');
      });
      firstMatch.classList.add('primeyt-filter-current');
      firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Also set as focused for j/k navigation
      if (state.focusedVideo) {
        state.focusedVideo.classList.remove('primeyt-focused');
      }
      state.focusedVideo = firstMatch;
      state.focusedIndex = parseInt(firstMatch.dataset.index, 10) || 0;
      firstMatch.classList.add('primeyt-focused');
    }
    
    // Recalculate relative line numbers for visible videos
    updateRelativeLineNumbers(firstMatch);
    
    updateFilterCount(matchCount, rows.length);
  }
  
  function updateFilterCount(matches, total) {
    const countEl = document.getElementById('primeyt-filter-count');
    if (countEl) {
      if (matches === total || matches === 0 && document.getElementById('primeyt-filter-input')?.value === '') {
        countEl.textContent = '';
      } else {
        countEl.textContent = `${matches}/${total}`;
      }
    }
  }
  
  function navigateFilterMatches(direction) {
    // Get visible videos (either filter matches if filtering, or all visible)
    let visibleVideos = Array.from(document.querySelectorAll('.primeyt-video-row.primeyt-filter-match'));
    
    // If no filter matches, use all visible videos
    if (visibleVideos.length === 0) {
      visibleVideos = Array.from(document.querySelectorAll('.primeyt-video-row')).filter(row => {
        return !row.classList.contains('primeyt-filter-hidden') && 
               row.style.display !== 'none';
      });
    }
    
    if (visibleVideos.length === 0) return null; // No videos, don't consume the key
    
    // Find current position
    const currentIndex = visibleVideos.findIndex(m => 
      m.classList.contains('primeyt-filter-current') || m.classList.contains('primeyt-focused')
    );
    
    let newIndex;
    if (currentIndex === -1) {
      newIndex = direction > 0 ? 0 : visibleVideos.length - 1;
    } else {
      newIndex = currentIndex + direction;
      if (newIndex < 0) newIndex = visibleVideos.length - 1;
      if (newIndex >= visibleVideos.length) newIndex = 0;
    }
    
    // Update current marker
    visibleVideos.forEach(m => m.classList.remove('primeyt-filter-current'));
    visibleVideos[newIndex].classList.add('primeyt-filter-current');
    visibleVideos[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Also focus this video for Enter to open it
    focusVideoRow(visibleVideos[newIndex]);
    
    return true;
  }
  
  function focusVideoRow(row) {
    // Clear previous focus
    if (state.focusedVideo) {
      state.focusedVideo.classList.remove('primeyt-focused');
    }
    
    // Focus the row
    row.classList.add('primeyt-focused');
    state.focusedVideo = row;
    state.focusedIndex = parseInt(row.dataset.index, 10) || 0;
    
    // Update relative line numbers based on focused row
    updateRelativeLineNumbers(row);
  }
  
  // ==========================================
  // Relative Line Numbers (Vim-style)
  // ==========================================
  
  function updateRelativeLineNumbers(focusedRow = null) {
    const allRows = document.querySelectorAll('.primeyt-video-row');
    
    // Get only visible rows (not filtered out)
    const visibleRows = Array.from(allRows).filter(row => {
      return !row.classList.contains('primeyt-filter-hidden') && 
             row.style.display !== 'none' &&
             row.offsetParent !== null;
    });
    
    // Find the index of the focused row in visible rows
    let focusedVisibleIndex = -1;
    if (focusedRow) {
      focusedVisibleIndex = visibleRows.indexOf(focusedRow);
    }
    
    // Update all line numbers
    allRows.forEach(row => {
      const lineNumEl = row.querySelector('.primeyt-line-number');
      if (!lineNumEl) return;
      
      // If row is hidden, skip
      if (row.classList.contains('primeyt-filter-hidden') || row.style.display === 'none') {
        return;
      }
      
      const visibleIndex = visibleRows.indexOf(row);
      
      if (focusedVisibleIndex === -1) {
        // No focus - show position in visible list
        lineNumEl.textContent = visibleIndex;
      } else if (visibleIndex === focusedVisibleIndex) {
        // Current line - show its visible index
        lineNumEl.textContent = visibleIndex;
      } else {
        // Show relative distance in visible list
        const distance = Math.abs(visibleIndex - focusedVisibleIndex);
        lineNumEl.textContent = distance;
      }
    });
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
  
  function toggleTheater() {
    const btn = document.querySelector('.ytp-size-button');
    if (btn) btn.click();
    return true;
  }
  
  function toggleMute() {
    const player = getPlayer();
    if (player) {
      if (player.isMuted()) {
        player.unMute();
        showSeekFeedback('🔊');
      } else {
        player.mute();
        showSeekFeedback('🔇');
      }
    }
    return true;
  }
  
  function toggleCaptions() {
    const player = getPlayer();
    if (player) {
      // Toggle using player API
      const tracks = player.getOption('captions', 'tracklist');
      if (tracks && tracks.length > 0) {
        const currentTrack = player.getOption('captions', 'track');
        if (currentTrack && currentTrack.languageCode) {
          // Captions are on, turn them off
          player.setOption('captions', 'track', {});
          showSeekFeedback('CC OFF');
        } else {
          // Captions are off, turn them on
          player.setOption('captions', 'track', tracks[0]);
          showSeekFeedback('CC ON');
        }
      } else {
        showSeekFeedback('No captions');
      }
    }
    return true;
  }
  
  function showSeekFeedback(text) {
    let feedback = document.getElementById('primeyt-seek-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'primeyt-seek-feedback';
      feedback.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.7);
        color: white;
        font-size: 32px;
        font-weight: bold;
        padding: 20px 40px;
        border-radius: 12px;
        z-index: 999999;
        pointer-events: none;
        font-family: system-ui, sans-serif;
      `;
      document.body.appendChild(feedback);
    }
    
    feedback.textContent = text;
    feedback.style.opacity = '1';
    feedback.style.display = 'block';
    
    // Clear existing timeout
    if (feedback._timeout) clearTimeout(feedback._timeout);
    
    feedback._timeout = setTimeout(() => {
      feedback.style.display = 'none';
    }, 600);
  }
  
  function seekForward(seconds) {
    const player = getPlayer();
    if (player && player.getCurrentTime && player.seekTo) {
      const current = player.getCurrentTime();
      player.seekTo(current + seconds, true);
      showSeekFeedback(`+${seconds}s`);
    } else {
      // Fallback: try using the video element directly
      const video = getVideo();
      if (video) {
        video.currentTime += seconds;
        showSeekFeedback(`+${seconds}s`);
      }
    }
    return true;
  }
  
  function seekBackward(seconds) {
    const player = getPlayer();
    if (player && player.getCurrentTime && player.seekTo) {
      const current = player.getCurrentTime();
      player.seekTo(current - seconds, true);
      showSeekFeedback(`-${seconds}s`);
    } else {
      // Fallback: try using the video element directly
      const video = getVideo();
      if (video) {
        video.currentTime -= seconds;
        showSeekFeedback(`-${seconds}s`);
      }
    }
    return true;
  }
  
  function setMaxQuality() {
    const player = getPlayer();
    if (player && player.getAvailableQualityLevels) {
      const qualities = player.getAvailableQualityLevels();
      if (qualities && qualities.length > 0) {
        const maxQuality = qualities[0]; // First is highest
        try {
          if (player.setPlaybackQualityRange) {
            player.setPlaybackQualityRange(maxQuality, maxQuality);
          }
          if (player.setPlaybackQuality) {
            player.setPlaybackQuality(maxQuality);
          }
          console.log('[PrimeYT] Set quality to:', maxQuality);
        } catch (e) {
          console.log('[PrimeYT] Max quality error:', e);
        }
      }
    }
  }
  
  function shareVideo() {
    // Get video ID and create clean URL
    let cleanUrl = window.location.href;
    
    if (isOnWatchPage()) {
      const urlObj = new URL(window.location.href);
      const videoId = urlObj.searchParams.get('v');
      if (videoId) {
        cleanUrl = `https://youtu.be/${videoId}`;
      }
    }
    
    navigator.clipboard.writeText(cleanUrl).then(() => {
      showToast('Link copied!');
    }).catch(() => {
      // Fallback: try share button
      const shareBtn = document.querySelector('button[aria-label*="Share" i]');
      if (shareBtn) shareBtn.click();
    });
    return true;
  }
  
  // ==========================================
  // Chapter Navigation
  // ==========================================
  
  function getChapters() {
    const chapters = [];
    
    // Method 1: Get chapters from the player's internal data (most reliable)
    try {
      const player = getPlayer();
      if (player) {
        // Try to access chapter data through the player
        const progressBar = player.querySelector('.ytp-progress-bar');
        const chapterContainers = player.querySelectorAll('.ytp-chapter-hover-container');
        
        if (chapterContainers.length > 0) {
          chapterContainers.forEach(container => {
            const titleEl = container.querySelector('.ytp-chapter-title-content');
            const title = titleEl?.textContent?.trim() || '';
            // Get time from data attribute or aria-label
            const ariaLabel = container.closest('[aria-label]')?.getAttribute('aria-label') || '';
            const timeMatch = ariaLabel.match(/(\d+:\d+(?::\d+)?)/);
            
            if (title && timeMatch) {
              const time = parseTimeStr(timeMatch[1]);
              chapters.push({ time, title, timeStr: formatChapterTime(time) });
            }
          });
        }
      }
    } catch (e) {
      console.log('[PrimeYT] Error parsing chapters from player:', e);
    }
    
    // Method 2: Parse from video description (timestamps like "0:00 Introduction")
    if (chapters.length === 0) {
      try {
        // Get description from multiple sources
        let description = '';
        
        // From ytInitialPlayerResponse
        if (window.ytInitialPlayerResponse?.videoDetails?.shortDescription) {
          description = window.ytInitialPlayerResponse.videoDetails.shortDescription;
        }
        
        // Fallback: from DOM
        if (!description) {
          const descEl = document.querySelector('#description-inline-expander, ytd-text-inline-expander');
          description = descEl?.textContent || '';
        }
        
        if (description) {
          // Match timestamps: "0:00 Title" or "00:00 Title" or "1:23:45 Title"
          const lines = description.split('\n');
          for (const line of lines) {
            const match = line.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+)$/);
            if (match) {
              const hours = match[1] ? parseInt(match[1]) : 0;
              const minutes = parseInt(match[2]);
              const seconds = parseInt(match[3]);
              const title = match[4].trim();
              const time = hours * 3600 + minutes * 60 + seconds;
              
              chapters.push({ time, title, timeStr: formatChapterTime(time) });
            }
          }
        }
      } catch (e) {
        console.log('[PrimeYT] Error parsing chapters from description:', e);
      }
    }
    
    // Method 3: Get from ytInitialPlayerResponse markers
    if (chapters.length === 0) {
      try {
        // Try different paths in the response
        const paths = [
          window.ytInitialPlayerResponse?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap,
          window.ytInitialPlayerResponse?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap
        ];
        
        for (const data of paths) {
          if (data && Array.isArray(data)) {
            for (const markerGroup of data) {
              const chapterList = markerGroup.value?.chapters || markerGroup.chapters;
              if (chapterList) {
                for (const ch of chapterList) {
                  const chapterRenderer = ch.chapterRenderer;
                  if (chapterRenderer) {
                    const title = chapterRenderer.title?.simpleText || 
                                  chapterRenderer.title?.runs?.[0]?.text || '';
                    const timeMs = parseInt(chapterRenderer.timeRangeStartMillis || 0);
                    const time = Math.floor(timeMs / 1000);
                    if (title) {
                      chapters.push({ time, title, timeStr: formatChapterTime(time) });
                    }
                  }
                }
              }
            }
            if (chapters.length > 0) break;
          }
        }
      } catch (e) {
        console.log('[PrimeYT] Error parsing chapters from playerResponse:', e);
      }
    }
    
    // Method 4: Look for chapters in engagement panels / macro markers
    if (chapters.length === 0) {
      try {
        const panels = document.querySelectorAll('ytd-macro-markers-list-item-renderer');
        panels.forEach(panel => {
          const title = panel.querySelector('#title, .macro-markers-list-item-text')?.textContent?.trim();
          const timeEl = panel.querySelector('#time, .macro-markers-list-item-time');
          const timeText = timeEl?.textContent?.trim();
          
          if (title && timeText) {
            const time = parseTimeStr(timeText);
            chapters.push({ time, title, timeStr: timeText });
          }
        });
      } catch (e) {
        console.log('[PrimeYT] Error parsing chapters from engagement panels:', e);
      }
    }
    
    // Method 5: Check for chapter segments in progress bar
    if (chapters.length === 0) {
      try {
        const segments = document.querySelectorAll('.ytp-progress-bar-container [role="slider"]');
        const chaptersContainer = document.querySelector('.ytp-chapters-container');
        if (chaptersContainer) {
          const chapterEls = chaptersContainer.querySelectorAll('.ytp-chapter-title');
          chapterEls.forEach((el, i) => {
            const title = el.textContent?.trim();
            if (title) {
              // Estimate time based on position (fallback)
              chapters.push({ time: i * 60, title, timeStr: formatChapterTime(i * 60) });
            }
          });
        }
      } catch (e) {
        console.log('[PrimeYT] Error parsing chapters from progress bar:', e);
      }
    }
    
    // Remove duplicates and sort by time
    const seen = new Set();
    const unique = chapters.filter(ch => {
      const key = `${ch.time}-${ch.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    unique.sort((a, b) => a.time - b.time);
    
    console.log('[PrimeYT] Found chapters:', unique.length, unique);
    
    return unique;
  }
  
  function parseTimeStr(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }
  
  function formatChapterTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  
  function createChapterModal() {
    const overlay = document.createElement('div');
    overlay.id = 'primeyt-chapter-overlay';
    overlay.className = 'primeyt-overlay';
    overlay.innerHTML = `
      <div class="primeyt-chapter-modal">
        <div class="primeyt-chapter-header">
          <span class="primeyt-chapter-title">Chapters</span>
          <span class="primeyt-chapter-hint">j/k navigate · Enter jump · Esc close</span>
        </div>
        <div class="primeyt-chapter-list" id="primeyt-chapter-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeChapterModal();
    });
    
    state.chapterOverlay = overlay;
    return overlay;
  }
  
  function openChapterModal() {
    if (!isOnWatchPage()) {
      console.log('[PrimeYT] Not on watch page, skipping chapter modal');
      return null;
    }
    
    console.log('[PrimeYT] Opening chapter modal...');
    const chapters = getChapters();
    
    if (chapters.length === 0) {
      console.log('[PrimeYT] No chapters found');
      showSeekFeedback('No chapters');
      return true;
    }
    
    console.log('[PrimeYT] Found', chapters.length, 'chapters');
    
    state.chapters = chapters;
    
    if (!state.chapterOverlay) createChapterModal();
    
    const list = document.getElementById('primeyt-chapter-list');
    const video = getVideo();
    const currentTime = video?.currentTime || 0;
    
    // Find current chapter based on video time
    let currentChapterIndex = 0;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (chapters[i].time <= currentTime) {
        currentChapterIndex = i;
        break;
      }
    }
    
    // Build chapter list
    list.innerHTML = chapters.map((ch, i) => {
      const isCurrent = i === currentChapterIndex;
      return `
        <div class="primeyt-chapter-row ${isCurrent ? 'primeyt-chapter-current' : ''}" 
             data-index="${i}" data-time="${ch.time}">
          <span class="primeyt-chapter-index">${i}</span>
          <span class="primeyt-chapter-time">${ch.timeStr}</span>
          <span class="primeyt-chapter-name">${escapeHtmlChapter(ch.title)}</span>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    list.querySelectorAll('.primeyt-chapter-row').forEach(row => {
      row.addEventListener('click', () => {
        const time = parseFloat(row.dataset.time);
        seekToTime(time);
        closeChapterModal();
      });
    });
    
    // Focus current chapter
    state.focusedChapter = currentChapterIndex;
    updateChapterFocus();
    
    state.chapterOverlay.classList.add('active');
    
    // Scroll to current chapter
    setTimeout(() => {
      const focused = list.querySelector('.primeyt-chapter-focused');
      if (focused) {
        focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
    
    return true;
  }
  
  function closeChapterModal() {
    if (state.chapterOverlay) {
      state.chapterOverlay.classList.remove('active');
    }
    state.focusedChapter = -1;
  }
  
  function navigateChapters(direction) {
    if (state.chapters.length === 0) return;
    
    let newIndex = state.focusedChapter + direction;
    newIndex = Math.max(0, Math.min(newIndex, state.chapters.length - 1));
    
    state.focusedChapter = newIndex;
    updateChapterFocus();
  }
  
  function navigateChaptersToIndex(index) {
    if (state.chapters.length === 0) return;
    
    state.focusedChapter = Math.max(0, Math.min(index, state.chapters.length - 1));
    updateChapterFocus();
  }
  
  function updateChapterFocus() {
    const list = document.getElementById('primeyt-chapter-list');
    if (!list) return;
    
    // Remove previous focus
    list.querySelectorAll('.primeyt-chapter-focused').forEach(el => {
      el.classList.remove('primeyt-chapter-focused');
    });
    
    // Add new focus
    const row = list.querySelector(`[data-index="${state.focusedChapter}"]`);
    if (row) {
      row.classList.add('primeyt-chapter-focused');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Update relative line numbers
      list.querySelectorAll('.primeyt-chapter-row').forEach(r => {
        const idx = parseInt(r.dataset.index);
        const lineNum = r.querySelector('.primeyt-chapter-index');
        if (idx === state.focusedChapter) {
          lineNum.textContent = idx;
        } else {
          lineNum.textContent = Math.abs(idx - state.focusedChapter);
        }
      });
    }
  }
  
  function jumpToFocusedChapter() {
    if (state.focusedChapter < 0 || state.focusedChapter >= state.chapters.length) return;
    
    const chapter = state.chapters[state.focusedChapter];
    seekToTime(chapter.time);
    closeChapterModal();
    showSeekFeedback(chapter.title.substring(0, 20));
  }
  
  function seekToTime(seconds) {
    const player = getPlayer();
    if (player && player.seekTo) {
      player.seekTo(seconds, true);
    } else {
      const video = getVideo();
      if (video) {
        video.currentTime = seconds;
      }
    }
  }
  
  function escapeHtmlChapter(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function likeVideo() {
    if (!isOnWatchPage()) return null;
    
    // Find the like button
    const likeBtn = document.querySelector('like-button-view-model button, button[aria-label*="like" i]:not([aria-label*="dislike"])');
    
    if (likeBtn) {
      const isLiked = likeBtn.getAttribute('aria-pressed') === 'true';
      likeBtn.click();
      
      if (isLiked) {
        showSeekFeedback('👎 Unliked');
      } else {
        showSeekFeedback('👍 Liked');
      }
    } else {
      showSeekFeedback('Like button not found');
    }
    return true;
  }
  
  function addToWatchLater() {
    if (isOnWatchPage()) {
      // Strategy: Click the Save button directly to open playlist dialog
      addToWatchLaterDirect();
    } else if (state.focusedVideo) {
      // On list page with focused video - click the 3-dot menu
      addToWatchLaterFromList();
    }
    return true;
  }
  
  // ==========================================
  // Remove from Playlist
  // ==========================================
  
  function isOnPlaylistPage() {
    return window.location.pathname.startsWith('/playlist');
  }
  
  function removeFromPlaylist() {
    // Only works on playlist pages with a focused video
    if (!isOnPlaylistPage()) {
      return null; // Don't consume key on non-playlist pages
    }
    
    if (!state.focusedVideo) {
      showToast('No video selected');
      return true;
    }
    
    console.log('[PrimeYT] Removing video from playlist');
    
    // Check if this is a custom PrimeYT row
    if (state.focusedVideo.classList.contains('primeyt-video-row')) {
      const videoUrl = state.focusedVideo.dataset.url;
      if (!videoUrl) {
        showToast('No video URL');
        return true;
      }
      
      const videoId = extractVideoId(videoUrl);
      if (!videoId) {
        showToast('Invalid video URL');
        return true;
      }
      
      // Find the original YouTube playlist item element
      const originalElement = findOriginalPlaylistElement(videoId);
      
      if (originalElement) {
        clickRemoveFromPlaylist(originalElement);
      } else {
        showToast('Playlist item not found');
      }
      return true;
    }
    
    // Standard YouTube element
    clickRemoveFromPlaylist(state.focusedVideo);
    return true;
  }
  
  function findOriginalPlaylistElement(videoId) {
    // Look for playlist video renderer elements
    const elements = document.querySelectorAll('ytd-playlist-video-renderer');
    
    for (const el of elements) {
      const links = el.querySelectorAll('a[href*="watch"]');
      for (const link of links) {
        if (link.href && link.href.includes(videoId)) {
          return el;
        }
      }
    }
    return null;
  }
  
  function clickRemoveFromPlaylist(element) {
    // Find the 3-dot menu button
    const menuSelectors = [
      'ytd-menu-renderer yt-icon-button#button button',
      'ytd-menu-renderer yt-icon-button button',
      'ytd-menu-renderer button[aria-label*="Action" i]',
      '#menu yt-icon-button#button button',
      '#menu yt-icon-button button',
      'ytd-menu-renderer button',
      'yt-icon-button#button button',
      'button[aria-label*="Action" i]',
      'button[aria-label*="More" i]'
    ];
    
    let menuBtn = null;
    for (const selector of menuSelectors) {
      menuBtn = element.querySelector(selector);
      if (menuBtn) {
        console.log('[PrimeYT] Found menu with selector:', selector);
        break;
      }
    }
    
    if (!menuBtn) {
      // Try yt-icon-button fallback
      const iconButtons = element.querySelectorAll('yt-icon-button');
      for (const ib of iconButtons) {
        const btn = ib.querySelector('button') || ib;
        if (btn) {
          menuBtn = btn;
          break;
        }
      }
    }
    
    if (!menuBtn) {
      showToast('Menu not found');
      return;
    }
    
    // Store reference to the row to remove it later
    const rowToRemove = state.focusedVideo;
    
    console.log('[PrimeYT] Clicking menu button');
    menuBtn.click();
    
    // Wait for menu to appear and click "Remove from"
    setTimeout(() => {
      clickRemoveOption(rowToRemove);
    }, 300);
  }
  
  function clickRemoveOption(rowToRemove) {
    let attempts = 0;
    const maxAttempts = 20;
    
    const tryClick = () => {
      attempts++;
      
      // Find visible popup menu
      let menuContainer = null;
      const dropdowns = document.querySelectorAll('tp-yt-iron-dropdown, ytd-popup-container');
      for (const d of dropdowns) {
        const style = window.getComputedStyle(d);
        if (style.display !== 'none' && d.offsetParent !== null) {
          menuContainer = d;
          break;
        }
      }
      
      // Look for menu items
      const menuItemSelectors = [
        'ytd-menu-service-item-renderer',
        'tp-yt-paper-item',
        'ytd-menu-navigation-item-renderer',
        'yt-list-item-view-model'
      ];
      
      let menuItems = [];
      const searchRoot = menuContainer || document;
      
      for (const selector of menuItemSelectors) {
        menuItems = Array.from(searchRoot.querySelectorAll(selector));
        menuItems = menuItems.filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && el.offsetParent !== null;
        });
        if (menuItems.length > 0) break;
      }
      
      console.log('[PrimeYT] Remove menu attempt', attempts, '- found', menuItems.length, 'items');
      
      // Look for "Remove from" option
      for (const item of menuItems) {
        const text = (item.textContent || '').toLowerCase();
        const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();
        
        if (text.includes('remove from') || ariaLabel.includes('remove from') ||
            text.includes('remove') && (text.includes('playlist') || text.includes('watch later'))) {
          console.log('[PrimeYT] Found Remove option, clicking');
          item.click();
          showToast('✓ Removed');
          
          // Remove the row from our custom list and move focus
          if (rowToRemove && rowToRemove.classList.contains('primeyt-video-row')) {
            // Get next video to focus before removing
            const nextVideo = rowToRemove.nextElementSibling || rowToRemove.previousElementSibling;
            
            // Remove the row with animation
            rowToRemove.style.transition = 'opacity 0.2s, transform 0.2s';
            rowToRemove.style.opacity = '0';
            rowToRemove.style.transform = 'translateX(-20px)';
            
            setTimeout(() => {
              rowToRemove.remove();
              
              // Focus next video if available
              if (nextVideo && nextVideo.classList.contains('primeyt-video-row')) {
                state.focusedVideo = nextVideo;
                nextVideo.classList.add('primeyt-focused');
                nextVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });
                updateRelativeLineNumbers(nextVideo);
              } else {
                state.focusedVideo = null;
                state.focusedIndex = -1;
              }
              
              // Re-index remaining rows
              const rows = document.querySelectorAll('.primeyt-video-row');
              rows.forEach((row, idx) => {
                row.dataset.index = idx;
                const lineNum = row.querySelector('.primeyt-line-number');
                if (lineNum) lineNum.dataset.index = idx;
              });
              updateRelativeLineNumbers(state.focusedVideo);
            }, 200);
          }
          
          return;
        }
      }
      
      if (attempts < maxAttempts) {
        setTimeout(tryClick, 100);
      } else {
        console.log('[PrimeYT] Remove option not found');
        showToast('Remove not in menu');
        // Close menu
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    };
    
    tryClick();
  }
  
  function addToWatchLaterFromList() {
    if (!state.focusedVideo) {
      showToast('No video selected');
      return;
    }
    
    console.log('[PrimeYT] Focused video element:', state.focusedVideo.tagName, state.focusedVideo.className);
    
    // Check if this is a custom PrimeYT row (simplified view without menu)
    if (state.focusedVideo.classList.contains('primeyt-video-row')) {
      // Get video URL from custom row and find original YouTube element
      const videoUrl = state.focusedVideo.dataset.url;
      if (!videoUrl) {
        showToast('No video URL');
        return;
      }
      
      // Extract video ID from URL
      const videoId = extractVideoId(videoUrl);
      console.log('[PrimeYT] Custom row - video ID:', videoId);
      
      if (!videoId) {
        showToast('Invalid video URL');
        return;
      }
      
      // Find the original YouTube element by video ID
      const originalElement = findOriginalYouTubeElement(videoId);
      
      if (originalElement) {
        console.log('[PrimeYT] Found original YouTube element:', originalElement.tagName);
        clickMenuOnElement(originalElement);
      } else {
        console.log('[PrimeYT] Original element not found, trying alternate method');
        // Fallback: try to add via URL navigation workaround
        showToast('Menu not found');
      }
      return;
    }
    
    // Standard YouTube element - find menu button directly
    clickMenuOnElement(state.focusedVideo);
  }
  
  function extractVideoId(url) {
    if (!url) return null;
    try {
      const urlObj = new URL(url, window.location.origin);
      // Handle /watch?v=ID format
      if (urlObj.searchParams.has('v')) {
        return urlObj.searchParams.get('v');
      }
      // Handle /shorts/ID format
      const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) return shortsMatch[1];
      // Handle youtu.be/ID format
      const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
      if (shortMatch) return shortMatch[1];
    } catch (e) {
      console.log('[PrimeYT] Error extracting video ID:', e);
    }
    return null;
  }
  
  function findOriginalYouTubeElement(videoId) {
    // Look for YouTube elements that contain this video ID in their links
    const selectors = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer', 
      'ytd-grid-video-renderer',
      'ytd-playlist-video-renderer'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        // Check links inside the element
        const links = el.querySelectorAll('a[href*="watch"]');
        for (const link of links) {
          if (link.href && link.href.includes(videoId)) {
            return el;
          }
        }
      }
    }
    return null;
  }
  
  function clickMenuOnElement(element) {
    // Find the 3-dot menu button on the element
    const menuSelectors = [
      // Modern YouTube (2024+) - subscription/home feed
      'ytd-menu-renderer yt-icon-button#button button',
      'ytd-menu-renderer yt-icon-button button',
      'ytd-menu-renderer button[aria-label*="Action" i]',
      '#menu yt-icon-button#button button',
      '#menu yt-icon-button button',
      // Older/alternative selectors
      'ytd-menu-renderer #button-shape button',
      'ytd-menu-renderer button[aria-label]',
      'ytd-menu-renderer button',
      '#menu button[aria-label]',
      '#menu button',
      'yt-icon-button#button button',
      'yt-icon-button#button',
      'button[aria-label*="Action" i]',
      'button[aria-label*="More" i]'
    ];
    
    let menuBtn = null;
    for (const selector of menuSelectors) {
      menuBtn = element.querySelector(selector);
      if (menuBtn) {
        console.log('[PrimeYT] Found menu with selector:', selector);
        break;
      }
    }
    
    // If still not found, try looking for any yt-icon-button within the element
    if (!menuBtn) {
      const iconButtons = element.querySelectorAll('yt-icon-button');
      console.log('[PrimeYT] Found', iconButtons.length, 'yt-icon-buttons in element');
      for (const ib of iconButtons) {
        const btn = ib.querySelector('button') || ib;
        if (btn) {
          menuBtn = btn;
          console.log('[PrimeYT] Using yt-icon-button as menu');
          break;
        }
      }
    }
    
    // Last resort: find by aria-label pattern
    if (!menuBtn) {
      const allButtons = element.querySelectorAll('button');
      console.log('[PrimeYT] Searching', allButtons.length, 'buttons for menu');
      for (const btn of allButtons) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('action') || label.includes('more') || label.includes('menu')) {
          menuBtn = btn;
          console.log('[PrimeYT] Found menu button by aria-label:', label);
          break;
        }
      }
    }
    
    if (!menuBtn) {
      console.log('[PrimeYT] Menu button not found in element');
      showToast('Menu not found');
      return;
    }
    
    console.log('[PrimeYT] Clicking menu button:', menuBtn.tagName);
    menuBtn.click();
    
    // Wait for menu to appear
    setTimeout(() => {
      clickWatchLaterInMenu();
    }, 300);
  }
  
  function clickWatchLaterInMenu() {
    let attempts = 0;
    const maxAttempts = 20;
    
    const tryClick = () => {
      attempts++;
      
      // Find the visible popup menu - YouTube appends these to body or uses iron-dropdown
      let menuContainer = null;
      
      // Check for tp-yt-iron-dropdown (popup menu container)
      const dropdowns = document.querySelectorAll('tp-yt-iron-dropdown, ytd-popup-container');
      for (const d of dropdowns) {
        const style = window.getComputedStyle(d);
        if (style.display !== 'none' && d.offsetParent !== null) {
          menuContainer = d;
          break;
        }
      }
      
      // Look for menu items - YouTube uses various elements
      const menuItemSelectors = [
        'ytd-menu-service-item-renderer',
        'tp-yt-paper-item',
        'ytd-menu-navigation-item-renderer',
        'yt-list-item-view-model'
      ];
      
      let menuItems = [];
      const searchRoot = menuContainer || document;
      
      for (const selector of menuItemSelectors) {
        menuItems = Array.from(searchRoot.querySelectorAll(selector));
        // Filter to only visible items
        menuItems = menuItems.filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && el.offsetParent !== null;
        });
        if (menuItems.length > 0) break;
      }
      
      console.log('[PrimeYT] Menu attempt', attempts, '- found', menuItems.length, 'visible items');
      
      if (menuItems.length > 0) {
        // Log what options are available
        console.log('[PrimeYT] Menu options:', menuItems.map(i => i.textContent?.trim().substring(0, 30)).join(', '));
      }
      
      // First look for direct "Save to Watch later" option
      for (const item of menuItems) {
        const text = (item.textContent || '').toLowerCase();
        const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();
        
        if ((text.includes('save') && text.includes('watch later')) ||
            (ariaLabel.includes('save') && ariaLabel.includes('watch later'))) {
          console.log('[PrimeYT] Found "Save to Watch later", clicking');
          item.click();
          showToast('✓ Watch Later');
          return;
        }
      }
      
      // Look for just "Watch later" (direct add option)
      for (const item of menuItems) {
        const text = (item.textContent || '').toLowerCase().trim();
        const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();
        
        // Match "Watch later" but not if it's inside a larger phrase (avoid false matches)
        if (text === 'watch later' || text.startsWith('watch later') || ariaLabel.includes('watch later')) {
          console.log('[PrimeYT] Found "Watch later" option, clicking');
          item.click();
          showToast('✓ Watch Later');
          return;
        }
      }
      
      // Look for "Save" option which opens playlist dialog
      for (const item of menuItems) {
        const text = (item.textContent || '').toLowerCase().trim();
        
        // "Save" or "Save to playlist" - but avoid "Save to Watch later" (already handled)
        if ((text === 'save' || text.includes('save to playlist') || text.startsWith('save')) && 
            !text.includes('watch later')) {
          console.log('[PrimeYT] Found "Save" option, clicking to open dialog');
          item.click();
          // Now wait for playlist dialog
          setTimeout(() => clickWatchLaterInDialog(), 400);
          return;
        }
      }
      
      if (attempts < maxAttempts) {
        setTimeout(tryClick, 100);
      } else {
        console.log('[PrimeYT] Timeout - no Watch Later option found');
        showToast('Watch Later not in menu');
        // Try to close menu by pressing Escape
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    };
    
    tryClick();
  }
  
  function addToWatchLaterDirect() {
    // Try Method 1: Use the 3-dot menu which has direct "Save to Watch later"
    const menuBtn = findMenuButton();
    
    if (menuBtn) {
      console.log('[PrimeYT] Found menu button, clicking');
      menuBtn.click();
      
      // Wait for menu to appear and click "Save to Watch later"
      setTimeout(() => {
        const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
        console.log('[PrimeYT] Found', menuItems.length, 'menu items');
        
        for (const item of menuItems) {
          const text = (item.textContent || '').toLowerCase();
          console.log('[PrimeYT] Menu item:', text.substring(0, 40));
          
          if (text.includes('save') && text.includes('watch later')) {
            console.log('[PrimeYT] Found Save to Watch later, clicking');
            item.click();
            showSeekFeedback('✓ Watch Later');
            return;
          }
        }
        
        // Fallback: Look for just "Save" which opens playlist dialog
        for (const item of menuItems) {
          const text = (item.textContent || '').toLowerCase();
          if (text.includes('save') && !text.includes('watch later')) {
            console.log('[PrimeYT] Found Save option, clicking');
            item.click();
            // Now wait for playlist dialog
            setTimeout(() => clickWatchLaterInDialog(), 400);
            return;
          }
        }
        
        showSeekFeedback('Save not in menu');
        // Close menu
        document.body.click();
      }, 300);
      
      return;
    }
    
    // Method 2: Try the Save button directly
    const saveBtn = findSaveButton();
    
    if (!saveBtn) {
      showSeekFeedback('Save btn not found');
      return;
    }
    
    // Click the save button to open playlist dialog
    console.log('[PrimeYT] Clicking Save button');
    saveBtn.click();
    
    // Now poll for the playlist dialog and click Watch Later
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds
    
    const clickWatchLater = () => {
      attempts++;
      
      // YouTube's new UI (2024+) uses different elements
      // Look for the visible dropdown container
      const dropdowns = document.querySelectorAll('tp-yt-iron-dropdown');
      let dropdown = null;
      for (const d of dropdowns) {
        // Find the visible dropdown (not hidden)
        const style = window.getComputedStyle(d);
        if (style.display !== 'none' && d.offsetParent !== null) {
          dropdown = d;
          break;
        }
      }
      
      console.log('[PrimeYT] Dropdown found:', !!dropdown);
      
      let playlistItems = [];
      
      if (dropdown) {
        // Search inside the dropdown for any elements containing playlist text
        // YouTube uses divs with classes like yt-list-item-view-model__*
        const allDivs = dropdown.querySelectorAll('div');
        console.log('[PrimeYT] Total divs in dropdown:', allDivs.length);
        
        // Find container divs that have "Watch later" or playlist names
        for (const div of allDivs) {
          const text = div.textContent?.trim() || '';
          // Look for items that contain playlist names and have a reasonable size
          if (text && text.length < 100 && 
              (text.toLowerCase().includes('watch later') || 
               text.toLowerCase().includes('private') ||
               text.toLowerCase().includes('public'))) {
            // Check if this is a row/item container (not just a label)
            if (div.querySelector('button, yt-icon, svg') || 
                div.classList.toString().includes('item') ||
                div.classList.toString().includes('container')) {
              playlistItems.push(div);
            }
          }
        }
      }
      
      // Fallback to standard selectors
      if (playlistItems.length === 0) {
        const selectors = [
          'yt-list-item-view-model',
          '[class*="yt-list-item-view-model"]',
          'ytd-playlist-add-to-option-renderer',
          'tp-yt-paper-item'
        ];
        for (const sel of selectors) {
          playlistItems = Array.from(document.querySelectorAll(sel));
          if (playlistItems.length > 0) break;
        }
      }
      
      console.log('[PrimeYT] Attempt', attempts, '- Found', playlistItems.length, 'items');
      
      if (playlistItems.length > 0) {
        for (const item of playlistItems) {
          const text = (item.textContent || '').toLowerCase();
          
          if (text.includes('watch later')) {
            console.log('[PrimeYT] Found Watch Later!');
            
            // Click the bookmark icon or the item
            const btn = item.querySelector('button, yt-icon-button, yt-icon, [role="button"]') || item;
            btn.click();
            
            showSeekFeedback('✓ Watch Later');
            setTimeout(closePlaylistDialog, 300);
            return;
          }
        }
        
        // Fallback: click first item
        const first = playlistItems[0];
        const btn = first.querySelector('button, yt-icon-button') || first;
        btn.click();
        showSeekFeedback('✓ Saved');
        setTimeout(closePlaylistDialog, 300);
        return;
      }
      
      if (attempts < maxAttempts) {
        setTimeout(clickWatchLater, 100);
      } else {
        // Text-based fallback
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          { acceptNode: n => n.textContent.trim().toLowerCase() === 'watch later' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
        );
        
        const textNode = walker.nextNode();
        if (textNode) {
          let el = textNode.parentElement;
          for (let i = 0; i < 6 && el; i++) {
            const btn = el.querySelector('button, yt-icon-button, yt-icon');
            if (btn) {
              btn.click();
              showSeekFeedback('✓ Watch Later');
              setTimeout(closePlaylistDialog, 300);
              return;
            }
            el = el.parentElement;
          }
        }
        
        showSeekFeedback('Dialog timeout');
      }
    };
    
    // Start polling after dialog has time to open
    // Give YouTube more time to render the dialog
    setTimeout(clickWatchLater, 400);
  }
  
  function findMenuButton() {
    // Find the 3-dot menu button in the video actions area
    const selectors = [
      '#actions ytd-menu-renderer #button-shape button',
      '#actions ytd-menu-renderer button',
      'ytd-menu-renderer.ytd-watch-metadata button',
      '#top-level-buttons-computed + ytd-menu-renderer button',
      'ytd-watch-metadata ytd-menu-renderer button'
    ];
    
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn) return btn;
    }
    
    // Fallback: look for button with "More actions" label
    const allBtns = document.querySelectorAll('#actions button, ytd-watch-metadata button');
    for (const btn of allBtns) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('more') || label.includes('action') || label.includes('menu')) {
        return btn;
      }
    }
    
    return null;
  }
  
  function findSaveButton() {
    const selectors = [
      'button[aria-label*="Save"]',
      'button[aria-label*="save"]',
      '#actions button[aria-label*="Save"]',
      'ytd-button-renderer button[aria-label*="Save"]',
      'yt-button-shape button[aria-label*="Save"]'
    ];
    
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn) return btn;
    }
    
    // Fallback: search through all buttons
    const actions = document.querySelector('#actions, #top-level-buttons-computed');
    if (actions) {
      const btns = actions.querySelectorAll('button');
      for (const btn of btns) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('save')) {
          return btn;
        }
      }
    }
    
    return null;
  }
  
  function clickWatchLaterInDialog() {
    let attempts = 0;
    const maxAttempts = 25;
    
    // Helper to safely click an element (handles SVGs and custom elements)
    const safeClick = (el) => {
      if (!el) return false;
      
      // If element has .click() method, use it
      if (typeof el.click === 'function') {
        el.click();
        return true;
      }
      
      // Fallback: dispatch a click event
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      el.dispatchEvent(event);
      return true;
    };
    
    const tryClick = () => {
      attempts++;
      
      // Strategy 1: Find yt-list-item-view-model with "Watch later" in aria-label
      // This is the modern YouTube UI (2024+) - the element itself is clickable
      const listItems = document.querySelectorAll('yt-list-item-view-model[aria-label*="Watch later" i]');
      console.log('[PrimeYT] Dialog attempt', attempts, '- list items with aria-label:', listItems.length);
      
      for (const item of listItems) {
        console.log('[PrimeYT] Found Watch Later list item:', item.getAttribute('aria-label'));
        safeClick(item);
        showSeekFeedback('✓ Watch Later');
        setTimeout(closePlaylistDialog, 300);
        return;
      }
      
      // Strategy 2: Find visible dropdown and search inside
      const dropdowns = document.querySelectorAll('tp-yt-iron-dropdown');
      let dropdown = null;
      for (const d of dropdowns) {
        const style = window.getComputedStyle(d);
        if (style.display !== 'none' && d.offsetParent !== null) {
          dropdown = d;
          break;
        }
      }
      
      // Also try yt-sheet-view-model
      if (!dropdown) {
        dropdown = document.querySelector('yt-sheet-view-model');
      }
      
      console.log('[PrimeYT] Dropdown found:', !!dropdown);
      
      if (dropdown) {
        // Look for yt-list-item-view-model inside dropdown
        const items = dropdown.querySelectorAll('yt-list-item-view-model');
        for (const item of items) {
          const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();
          const textContent = (item.textContent || '').toLowerCase();
          
          if (ariaLabel.includes('watch later') || textContent.includes('watch later')) {
            console.log('[PrimeYT] Found Watch Later in dropdown:', item.tagName);
            safeClick(item);
            showSeekFeedback('✓ Watch Later');
            setTimeout(closePlaylistDialog, 300);
            return;
          }
        }
        
        // Fallback: look for any element with Watch Later text
        const allElements = dropdown.querySelectorAll('*');
        for (const el of allElements) {
          const text = (el.textContent || '').toLowerCase();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          
          if ((text.includes('watch later') || ariaLabel.includes('watch later')) && 
              text.length < 100) { // Avoid clicking large containers
            
            // Find the clickable parent (yt-list-item-view-model or element with aria-pressed)
            let clickTarget = el;
            for (let i = 0; i < 6 && clickTarget; i++) {
              if (clickTarget.tagName?.toLowerCase() === 'yt-list-item-view-model' ||
                  clickTarget.hasAttribute?.('aria-pressed') ||
                  clickTarget.getAttribute?.('role') === 'listitem') {
                console.log('[PrimeYT] Clicking clickable parent:', clickTarget.tagName);
                safeClick(clickTarget);
                showSeekFeedback('✓ Watch Later');
                setTimeout(closePlaylistDialog, 300);
                return;
              }
              clickTarget = clickTarget.parentElement;
            }
            
            // If no specific clickable parent found, click the container
            let container = el;
            for (let i = 0; i < 4 && container.parentElement; i++) {
              container = container.parentElement;
            }
            console.log('[PrimeYT] Clicking container:', container.tagName);
            safeClick(container);
            showSeekFeedback('✓ Watch Later');
            setTimeout(closePlaylistDialog, 300);
            return;
          }
        }
      }
      
      // Strategy 3: Old YouTube UI - ytd-playlist-add-to-option-renderer
      const oldStyleItems = document.querySelectorAll('ytd-playlist-add-to-option-renderer');
      for (const item of oldStyleItems) {
        if ((item.textContent || '').toLowerCase().includes('watch later')) {
          console.log('[PrimeYT] Found old-style Watch Later option');
          const checkbox = item.querySelector('#checkbox, tp-yt-paper-checkbox');
          if (checkbox) {
            safeClick(checkbox);
          } else {
            safeClick(item);
          }
          showSeekFeedback('✓ Watch Later');
          setTimeout(closePlaylistDialog, 300);
          return;
        }
      }
      
      if (attempts < maxAttempts) {
        setTimeout(tryClick, 100);
      } else {
        // Ultimate fallback: TreeWalker to find "Watch later" text
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          { acceptNode: n => n.textContent.trim().toLowerCase() === 'watch later' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
        );
        
        const textNode = walker.nextNode();
        if (textNode) {
          console.log('[PrimeYT] Found via TreeWalker');
          let parent = textNode.parentElement;
          
          // Walk up to find clickable element
          for (let i = 0; i < 8 && parent; i++) {
            if (parent.tagName?.toLowerCase() === 'yt-list-item-view-model' ||
                parent.hasAttribute?.('aria-pressed') ||
                parent.getAttribute?.('role') === 'listitem') {
              safeClick(parent);
              showSeekFeedback('✓ Watch Later');
              setTimeout(closePlaylistDialog, 300);
              return;
            }
            parent = parent.parentElement;
          }
          
          // Last resort: click 4 levels up from text
          let clickTarget = textNode.parentElement;
          for (let i = 0; i < 4 && clickTarget?.parentElement; i++) {
            clickTarget = clickTarget.parentElement;
          }
          if (clickTarget) {
            safeClick(clickTarget);
            showSeekFeedback('✓ Watch Later');
            setTimeout(closePlaylistDialog, 300);
            return;
          }
        }
        
        showSeekFeedback('Dialog timeout');
      }
    };
    
    tryClick();
  }
  
  function closePlaylistDialog() {
    // Try multiple ways to close the dialog
    
    // Method 1: Click the X/close button
    const closeSelectors = [
      'ytd-add-to-playlist-renderer #close-button button',
      'ytd-add-to-playlist-renderer button[aria-label*="lose"]',
      '#close-button button',
      'tp-yt-paper-dialog #close-button button',
      'yt-icon-button[aria-label*="lose"]'
    ];
    
    for (const sel of closeSelectors) {
      const closeBtn = document.querySelector(sel);
      if (closeBtn) {
        closeBtn.click();
        return;
      }
    }
    
    // Method 2: Click outside the dialog (on the backdrop)
    const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop, iron-overlay-backdrop');
    if (backdrop) {
      backdrop.click();
      return;
    }
    
    // Method 3: Press Escape key
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
    document.body.dispatchEvent(event);
  }
  
  // ==========================================
  // Navigation Actions
  // ==========================================
  
  function openNewYouTubeTab() {
    window.open('https://www.youtube.com/', '_blank');
    return true;
  }
  
  function goBack() {
    window.history.back();
    return true;
  }
  
  // ==========================================
  // Sort Mode (Channel Pages)
  // ==========================================
  
  function isOnChannelPage() {
    return window.PrimeYTChannel?.isChannelPage?.() || false;
  }
  
  function enterSortMode() {
    // Only on channel pages
    if (!isOnChannelPage()) return null;
    
    state.sortMode = true;
    showSortIndicator();
    
    // Auto-exit after timeout
    if (state.sortTimer) clearTimeout(state.sortTimer);
    state.sortTimer = setTimeout(() => {
      exitSortMode();
    }, 2000);
    
    return true;
  }
  
  function exitSortMode() {
    state.sortMode = false;
    if (state.sortTimer) {
      clearTimeout(state.sortTimer);
      state.sortTimer = null;
    }
    hideSortIndicator();
  }
  
  function applySortOrder(order) {
    if (!window.PrimeYTChannel?.resortChannelVideos) return;
    
    window.PrimeYTChannel.resortChannelVideos(order);
    
    const labels = {
      'newest': 'Newest first',
      'views': 'Most viewed',
      'oldest': 'Oldest first'
    };
    
    showToast(`Sorted: ${labels[order]}`);
  }
  
  function showSortIndicator() {
    if (!state.leaderIndicator) createLeaderIndicator();
    state.leaderIndicator.classList.add('active');
    const keysSpan = state.leaderIndicator.querySelector('.keys');
    const labelSpan = state.leaderIndicator.querySelector('.label');
    labelSpan.textContent = 'SORT';
    keysSpan.textContent = 'n·v·o';
  }
  
  function hideSortIndicator() {
    if (state.leaderIndicator) {
      state.leaderIndicator.classList.remove('active');
      const labelSpan = state.leaderIndicator.querySelector('.label');
      if (labelSpan) labelSpan.textContent = 'LEADER';
    }
  }
  
  // ==========================================
  // Go to Channel
  // ==========================================
  
  function goToChannel() {
    if (isOnWatchPage()) {
      return goToChannelFromWatchPage();
    } else if (state.focusedVideo) {
      return goToChannelFromList();
    }
    return null;
  }
  
  function goToChannelFromWatchPage() {
    // Method 1: Find channel link in video metadata
    const channelSelectors = [
      // Modern YouTube layout (2024+)
      'ytd-watch-metadata ytd-channel-name a',
      'ytd-watch-metadata #channel-name a',
      '#owner ytd-channel-name a',
      '#owner #channel-name a',
      // Channel avatar link
      '#owner a[href*="/@"]',
      '#owner a[href*="/channel/"]',
      '#owner a[href*="/c/"]',
      // Fallback selectors
      'ytd-video-owner-renderer a[href*="/@"]',
      'ytd-video-owner-renderer a[href*="/channel/"]',
      '#upload-info a[href*="/@"]',
      '#upload-info a[href*="/channel/"]',
      // Even more fallbacks
      'a.yt-simple-endpoint[href*="/@"]',
      'a.yt-simple-endpoint[href*="/channel/"]'
    ];
    
    for (const selector of channelSelectors) {
      const link = document.querySelector(selector);
      if (link && link.href) {
        console.log('[PrimeYT] Found channel link:', link.href);
        window.location.href = link.href;
        return true;
      }
    }
    
    // Method 2: Extract from ytInitialPlayerResponse
    try {
      const channelUrl = window.ytInitialPlayerResponse?.videoDetails?.channelId;
      if (channelUrl) {
        window.location.href = `https://www.youtube.com/channel/${channelUrl}`;
        return true;
      }
    } catch (e) {
      console.log('[PrimeYT] Could not get channel from playerResponse:', e);
    }
    
    showSeekFeedback('Channel not found');
    return true;
  }
  
  function goToChannelFromList() {
    if (!state.focusedVideo) {
      showToast('No video selected');
      return null;
    }
    
    let channelUrl = null;
    
    // Check if it's a custom PrimeYT row
    if (state.focusedVideo.classList.contains('primeyt-video-row')) {
      // First, try to get channel URL directly from dataset (fastest)
      channelUrl = state.focusedVideo.dataset.channelUrl;
      console.log('[PrimeYT] Channel URL from dataset:', channelUrl);
      
      if (!channelUrl) {
        // Fallback: try to find from original element or ytInitialData
        const videoUrl = state.focusedVideo.dataset.url;
        console.log('[PrimeYT] Video URL:', videoUrl);
        
        if (!videoUrl) {
          showToast('No video URL');
          return true;
        }
        
        const videoId = extractVideoId(videoUrl);
        console.log('[PrimeYT] Video ID:', videoId);
        
        if (!videoId) {
          showToast('Invalid video URL');
          return true;
        }
        
        // Find the original YouTube element to get channel link
        const originalElement = findOriginalYouTubeElement(videoId);
        console.log('[PrimeYT] Original element found:', !!originalElement);
        
        if (originalElement) {
          channelUrl = extractChannelUrlFromElement(originalElement);
          console.log('[PrimeYT] Channel URL from original element:', channelUrl);
        }
        
        // Fallback: try to get from ytInitialData
        if (!channelUrl) {
          channelUrl = findChannelUrlFromData(videoId);
          console.log('[PrimeYT] Channel URL from ytInitialData:', channelUrl);
        }
      }
    } else {
      // Standard YouTube element - extract channel link directly
      channelUrl = extractChannelUrlFromElement(state.focusedVideo);
    }
    
    if (channelUrl) {
      console.log('[PrimeYT] Navigating to channel:', channelUrl);
      window.location.href = channelUrl;
      return true;
    }
    
    showToast('Channel not found');
    return true;
  }
  
  function extractChannelUrlFromElement(element) {
    // Look for channel link in the element
    const channelSelectors = [
      'ytd-channel-name a',
      '#channel-name a',
      'a[href*="/@"]',
      'a[href*="/channel/"]',
      'a[href*="/c/"]',
      '#text.ytd-channel-name',
      '.ytd-channel-name a'
    ];
    
    for (const selector of channelSelectors) {
      const links = element.querySelectorAll(selector);
      for (const link of links) {
        const href = link.href || link.getAttribute('href');
        if (href && (href.includes('/@') || href.includes('/channel/') || href.includes('/c/'))) {
          // Ensure full URL
          if (href.startsWith('/')) {
            return 'https://www.youtube.com' + href;
          }
          return href;
        }
      }
    }
    
    return null;
  }
  
  function findChannelUrlFromData(videoId) {
    // Search ytInitialData for channel info
    const data = window.ytInitialData;
    if (!data) {
      console.log('[PrimeYT] ytInitialData not available');
      return null;
    }
    
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
      
      // Check for videoRenderer with matching videoId
      if (node.videoRenderer && node.videoRenderer.videoId === videoId) {
        const renderer = node.videoRenderer;
        // Extract channel URL from various paths
        const channelUrl = extractChannelUrlFromRenderer(renderer);
        if (channelUrl) {
          console.log('[PrimeYT] Found channel URL in videoRenderer');
          return channelUrl;
        }
      }
      
      // Check for richItemRenderer content
      if (node.richItemRenderer?.content?.videoRenderer?.videoId === videoId) {
        const renderer = node.richItemRenderer.content.videoRenderer;
        const channelUrl = extractChannelUrlFromRenderer(renderer);
        if (channelUrl) {
          console.log('[PrimeYT] Found channel URL in richItemRenderer');
          return channelUrl;
        }
      }
      
      // Check for playlistVideoRenderer
      if (node.playlistVideoRenderer && node.playlistVideoRenderer.videoId === videoId) {
        const renderer = node.playlistVideoRenderer;
        const channelUrl = extractChannelUrlFromRenderer(renderer);
        if (channelUrl) {
          console.log('[PrimeYT] Found channel URL in playlistVideoRenderer');
          return channelUrl;
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
    
    console.log('[PrimeYT] Channel URL not found in ytInitialData after', traversed, 'nodes');
    return null;
  }
  
  function extractChannelUrlFromRenderer(renderer) {
    // Try multiple paths to get channel URL
    const paths = [
      renderer.ownerText?.runs?.[0]?.navigationEndpoint,
      renderer.longBylineText?.runs?.[0]?.navigationEndpoint,
      renderer.shortBylineText?.runs?.[0]?.navigationEndpoint,
      renderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint
    ];
    
    for (const endpoint of paths) {
      if (endpoint) {
        const url = endpoint.browseEndpoint?.canonicalBaseUrl ||
                    endpoint.commandMetadata?.webCommandMetadata?.url;
        if (url) {
          return url.startsWith('/') ? 'https://www.youtube.com' + url : url;
        }
      }
    }
    
    return null;
  }
  
  function goForward() {
    window.history.forward();
    return true;
  }
  
  function goToSubscriptions() {
    window.location.href = 'https://www.youtube.com/feed/subscriptions';
  }
  
  function goToWatchLater() {
    window.location.href = 'https://www.youtube.com/playlist?list=WL';
  }
  
  function goToStudio() {
    window.location.href = 'https://studio.youtube.com/';
  }
  
  function goToHomeRefresh() {
    // Navigate to homepage - if already there, force reload
    if (window.location.pathname === '/') {
      window.location.reload();
    } else {
      window.location.href = 'https://www.youtube.com/';
    }
  }
  
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    clearFocus();
    return true;
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
            <div class="primeyt-help-title">Video Playback</div>
            <div class="primeyt-help-row"><kbd>j</kbd> <span>Back 10s</span></div>
            <div class="primeyt-help-row"><kbd>l</kbd> <span>Forward 10s</span></div>
            <div class="primeyt-help-row"><kbd>k</kbd> <span>Like/Unlike</span></div>
            <div class="primeyt-help-row"><kbd>m</kbd> <span>Mute/unmute</span></div>
            <div class="primeyt-help-row"><kbd>c</kbd> <span>Captions</span></div>
            <div class="primeyt-help-row"><kbd>t</kbd> <span>Theater mode</span></div>
            <div class="primeyt-help-row"><kbd>u</kbd> <span>Chapters</span></div>
          </div>
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Navigation</div>
            <div class="primeyt-help-row"><kbd>Shift</kbd><kbd>H</kbd> <span>Go back (any page)</span></div>
            <div class="primeyt-help-row"><kbd>Shift</kbd><kbd>N</kbd> <span>New YouTube tab</span></div>
            <div class="primeyt-help-row"><kbd>j</kbd> / <kbd>k</kbd> <span>Next/Prev video</span></div>
            <div class="primeyt-help-row"><kbd>5</kbd><kbd>j</kbd> <span>Down 5 videos</span></div>
            <div class="primeyt-help-row"><kbd>/</kbd> <span>Filter videos</span></div>
            <div class="primeyt-help-row"><kbd>Enter</kbd> <span>Open video</span></div>
            <div class="primeyt-help-row"><kbd>Shift</kbd><kbd>Enter</kbd> <span>Open in new tab</span></div>
            <div class="primeyt-help-row"><kbd>Esc</kbd> <span>Clear/Close</span></div>
          </div>
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Actions</div>
            <div class="primeyt-help-row"><kbd>Tab</kbd> <span>Go to channel</span></div>
            <div class="primeyt-help-row"><kbd>w</kbd> <span>Watch Later</span></div>
            <div class="primeyt-help-row"><kbd>Shift</kbd><kbd>S</kbd> <span>Share (copy link)</span></div>
            <div class="primeyt-help-row"><kbd>x</kbd> <span>Remove from playlist</span></div>
          </div>
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Channel Sort (s + key)</div>
            <div class="primeyt-help-row"><kbd>s</kbd><kbd>n</kbd> <span>Newest</span></div>
            <div class="primeyt-help-row"><kbd>s</kbd><kbd>v</kbd> <span>Most viewed</span></div>
            <div class="primeyt-help-row"><kbd>s</kbd><kbd>o</kbd> <span>Oldest</span></div>
          </div>
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Leader Commands</div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>f</kbd> <kbd>f</kbd> <span>Search</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>s</kbd> <span>Subscriptions</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>w</kbd> <span>Watch Later</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>l</kbd> <span>Forward (history)</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>p</kbd> <span>YouTube Studio</span></div>
            <div class="primeyt-help-row"><kbd>Space</kbd> <kbd>r</kbd> <span>Home (refresh)</span></div>
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
  // Auto Max Quality
  // ==========================================
  
  function setupAutoMaxQuality() {
    // Try to set max quality when video is ready
    function trySetMaxQuality() {
      if (!isOnWatchPage()) return;
      
      const player = getPlayer();
      if (player && player.getAvailableQualityLevels) {
        const qualities = player.getAvailableQualityLevels();
        if (qualities && qualities.length > 0) {
          const maxQuality = qualities[0];
          if (player.setPlaybackQualityRange) {
            player.setPlaybackQualityRange(maxQuality, maxQuality);
            console.log('[PrimeYT] Auto-set max quality:', maxQuality);
            return true;
          }
        }
      }
      return false;
    }
    
    // Try multiple times as player loads
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (trySetMaxQuality() || attempts > 20) {
        clearInterval(interval);
      }
    }, 500);
  }
  
  // ==========================================
  // Initialization
  // ==========================================
  
  function init() {
    // Use capture phase to intercept before YouTube
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('popstate', onPageChange);
    window.addEventListener('yt-navigate-finish', () => {
      onPageChange();
      // Set max quality when navigating to watch page
      if (isOnWatchPage()) {
        setTimeout(setupAutoMaxQuality, 500);
      }
    });
    
    // Set max quality on initial load
    if (isOnWatchPage()) {
      setupAutoMaxQuality();
    }
    
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

