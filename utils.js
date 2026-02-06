// PrimeYT Utilities — pure functions + page detection
// No side effects at load time. content.js calls forceBackground() and updateBodyClasses() at init.

(function() {
  'use strict';

  window.PrimeYT = window.PrimeYT || {};

  // ==========================================
  // Page Type Detection
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
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', updateBodyClasses);
      return 'unknown';
    }

    const pageType = getPageType();

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

    document.body.classList.add(`primeyt-page-${pageType}`);
    document.body.classList.add('primeyt-active');

    console.log(`[PrimeYT] Page type: ${pageType}`);

    return pageType;
  }

  function forceBackground() {
    document.documentElement.style.backgroundColor = '#282c34';
    if (document.body) {
      document.body.style.backgroundColor = '#282c34';
    }

    const skeletons = document.querySelectorAll('ytd-masthead-skeleton, #masthead-skeleton');
    skeletons.forEach(el => el.remove());
  }

  function isFeedPage() {
    const path = window.location.pathname;
    return path === '/feed/subscriptions' || path.startsWith('/feed/');
  }

  function isSubscriptionsPage() {
    return window.location.pathname === '/feed/subscriptions';
  }

  function isSearchPage() {
    return window.location.pathname === '/results';
  }

  function isPlaylistPage() {
    return window.location.pathname.startsWith('/playlist');
  }

  function isChannelPage() {
    const path = window.location.pathname;
    return path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/');
  }

  // ==========================================
  // Formatting
  // ==========================================

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatTimeMinutes(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const totalMins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${totalMins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatDurationToMinutes(duration) {
    if (!duration) return '';

    duration = duration.trim();

    const parts = duration.split(':').map(p => parseInt(p, 10));

    let totalMinutes = 0;
    if (parts.length === 2) {
      totalMinutes = parts[0];
    } else if (parts.length === 3) {
      totalMinutes = parts[0] * 60 + parts[1];
    } else {
      return duration;
    }

    return `${totalMinutes} min`;
  }

  function parseDurationFromLabel(label) {
    if (!label) return '';

    let hours = 0, mins = 0, secs = 0;

    const hourMatch = label.match(/(\d+)\s*hours?/i);
    const minMatch = label.match(/(\d+)\s*minutes?/i);
    const secMatch = label.match(/(\d+)\s*seconds?/i);

    if (hourMatch) hours = parseInt(hourMatch[1], 10);
    if (minMatch) mins = parseInt(minMatch[1], 10);
    if (secMatch) secs = parseInt(secMatch[1], 10);

    if (hours === 0 && mins === 0 && secs === 0) return '';

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatRelativeDate(timeStr) {
    if (!timeStr) return '';

    timeStr = timeStr.replace(/^Streamed\s+/, '');

    const now = new Date();
    const match = timeStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);

    if (!match) return timeStr;

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

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ==========================================
  // Misc Helpers
  // ==========================================

  function getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value == null) return undefined;
      value = value[key];
    }
    return value;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function redirectShorts() {
    const path = window.location.pathname;
    if (path.startsWith('/shorts/')) {
      const videoId = path.replace('/shorts/', '');
      window.location.replace(`https://www.youtube.com/watch?v=${videoId}`);
    }
  }

  // ==========================================
  // Export
  // ==========================================

  window.PrimeYT.utils = {
    getPageType,
    updateBodyClasses,
    forceBackground,
    isFeedPage,
    isSubscriptionsPage,
    isSearchPage,
    isPlaylistPage,
    isChannelPage,
    formatTime,
    formatTimeMinutes,
    formatDurationToMinutes,
    parseDurationFromLabel,
    formatRelativeDate,
    getNestedValue,
    escapeHtml,
    redirectShorts
  };
})();
