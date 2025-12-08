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
      // Watch page controls
      'j': () => isOnWatchPage() ? seekBackward(10) : navigateVideos(1),
      'k': () => isOnWatchPage() ? likeVideo() : navigateVideos(-1),
      'l': () => isOnWatchPage() ? seekForward(10) : null,
      'm': () => isOnWatchPage() ? toggleMute() : null,
      'c': () => isOnWatchPage() ? toggleCaptions() : null,
      '7': () => isOnWatchPage() ? setQuality720() : null,
      't': () => isOnWatchPage() ? toggleTheater() : null,
      
      // Shift+H to go back - works on ALL pages
      'H': () => goBack(),
      
      // Navigation (non-watch pages)
      'g': () => { scrollToTop(); return true; },
      'G': () => { scrollToBottom(); return true; },
      'Enter': (e) => openFocusedVideo(e && e.shiftKey),
      'Escape': () => handleEscape(),
      
      // Actions
      'w': () => addToWatchLater(),
      's': () => shareVideo(),
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
    
    // Direct bindings
    const directAction = bindings.direct[e.key];
    if (directAction) {
      const result = directAction(e);
      // Only prevent default if action returned something (not null)
      if (result !== null) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // Prevent YouTube from handling it
        return false;
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
  
  function openFocusedVideo(newTab = false) {
    if (!state.focusedVideo) return null;
    
    let url = null;
    
    // Check if it's our custom row
    if (state.focusedVideo.classList.contains('primeyt-video-row')) {
      url = state.focusedVideo.dataset.url;
    } else {
      // Fallback: Find the link in the focused video
      const link = state.focusedVideo.querySelector('a#video-title-link, a#video-title, a.ytd-playlist-panel-video-renderer');
      if (link) {
        url = link.href;
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
  
  function togglePlayPause() {
    const player = getPlayer();
    if (player) {
      // Use YouTube's player API
      const state = player.getPlayerState();
      if (state === 1) { // Playing
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    }
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
  
  function goToChannel() {
    // Try multiple selectors for channel link
    const selectors = [
      '#owner a.yt-simple-endpoint',
      '#channel-name a.yt-simple-endpoint',
      'ytd-video-owner-renderer a.yt-simple-endpoint',
      '#owner ytd-channel-name a',
      '#upload-info a[href*="/@"]',
      '#upload-info a[href*="/channel/"]',
      'a[href*="/@"]'
    ];
    
    for (const selector of selectors) {
      const link = document.querySelector(selector);
      if (link && link.href && (link.href.includes('/@') || link.href.includes('/channel/'))) {
        window.location.href = link.href;
        return true;
      }
    }
    
    showSeekFeedback('Channel not found');
    return true;
  }
  
  function setQuality720() {
    const player = getPlayer();
    if (player) {
      try {
        // Try using setPlaybackQualityRange (works on some versions)
        if (player.setPlaybackQualityRange) {
          player.setPlaybackQualityRange('hd720', 'hd720');
        }
        // Also try setPlaybackQuality
        if (player.setPlaybackQuality) {
          player.setPlaybackQuality('hd720');
        }
        showSeekFeedback('720p');
      } catch (e) {
        console.log('[PrimeYT] Quality change error:', e);
        showSeekFeedback('720p (may need manual)');
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
      const menuBtn = state.focusedVideo.querySelector('ytd-menu-renderer button, #menu button, yt-icon-button button');
      
      if (menuBtn) {
        menuBtn.click();
        setTimeout(() => {
          const items = document.querySelectorAll('ytd-menu-service-item-renderer');
          for (const item of items) {
            if (item.textContent.toLowerCase().includes('watch later')) {
              item.click();
              showToast('✓ Watch Later');
              return;
            }
          }
          showToast('WL not in menu');
        }, 400);
      }
    }
    return true;
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
  
  function goBack() {
    window.history.back();
    return true;
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
    window.location.href = 'https://studio.youtube.com/channel/UC_wSmKfzko25UQOgki3jOjw/videos/upload?filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D';
  }
  
  function goToHome() {
    window.location.href = 'https://www.youtube.com/';
  }
  
  function refreshFeed() {
    window.location.reload();
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
  
  function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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
            <div class="primeyt-help-row"><kbd>7</kbd> <span>720p quality</span></div>
            <div class="primeyt-help-row"><kbd>t</kbd> <span>Theater mode</span></div>
          </div>
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Navigation</div>
            <div class="primeyt-help-row"><kbd>Shift</kbd><kbd>H</kbd> <span>Go back (any page)</span></div>
            <div class="primeyt-help-row"><kbd>j</kbd> / <kbd>k</kbd> <span>Next/Prev video</span></div>
            <div class="primeyt-help-row"><kbd>Enter</kbd> <span>Open video</span></div>
            <div class="primeyt-help-row"><kbd>Shift</kbd><kbd>Enter</kbd> <span>Open in new tab</span></div>
            <div class="primeyt-help-row"><kbd>g</kbd> <span>Scroll to top</span></div>
            <div class="primeyt-help-row"><kbd>G</kbd> <span>Scroll to bottom</span></div>
            <div class="primeyt-help-row"><kbd>Esc</kbd> <span>Clear/Close</span></div>
          </div>
          <div class="primeyt-help-section">
            <div class="primeyt-help-title">Actions</div>
            <div class="primeyt-help-row"><kbd>w</kbd> <span>Watch Later</span></div>
            <div class="primeyt-help-row"><kbd>s</kbd> <span>Share (copy link)</span></div>
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

