// PrimeYT Video Data — extraction & normalization from YT data/DOM
// No side effects at load time. Deps: PrimeYT.utils

(function() {
  'use strict';

  window.PrimeYT = window.PrimeYT || {};

  const U = window.PrimeYT.utils;

  // In-memory cache for collectVideosFromData to avoid repeated traversal
  let videoDataCache = { key: '', videos: [] };

  // ==========================================
  // Video Renderer Normalizers
  // ==========================================

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

    let channelUrl = '';

    const channelRun = (video.longBylineText?.runs || video.ownerText?.runs || video.shortBylineText?.runs || [])[0];
    if (channelRun?.navigationEndpoint) {
      const endpoint = channelRun.navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }

    if (!channelUrl && video.ownerText?.runs?.[0]?.navigationEndpoint) {
      const endpoint = video.ownerText.runs[0].navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }

    if (!channelUrl && video.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint) {
      const endpoint = video.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }

    if (channelUrl && !channelUrl.startsWith('http')) {
      channelUrl = 'https://www.youtube.com' + channelUrl;
    }

    const publishedText = video.publishedTimeText?.simpleText ||
      (video.publishedTimeText?.runs || []).map(run => run.text).join('').trim() ||
      video.relativeDateText?.accessibility?.accessibilityData?.label ||
      '';

    let duration = '';

    duration = video.lengthText?.simpleText ||
      (video.lengthText?.runs || []).map(run => run.text).join('').trim();

    if (!duration && video.thumbnailOverlays) {
      for (const overlay of video.thumbnailOverlays) {
        if (overlay.thumbnailOverlayTimeStatusRenderer) {
          const renderer = overlay.thumbnailOverlayTimeStatusRenderer;
          duration = renderer.text?.simpleText ||
            (renderer.text?.runs || []).map(run => run.text).join('').trim();
          if (duration) break;
        }
      }
    }

    if (!duration && video.lengthText?.accessibility?.accessibilityData?.label) {
      duration = U.parseDurationFromLabel(video.lengthText.accessibility.accessibilityData.label);
    }

    if (!duration && video.thumbnail?.thumbnails?.[0]) {
      const accessLabel = video.thumbnail?.accessibility?.accessibilityData?.label;
      if (accessLabel) {
        duration = U.parseDurationFromLabel(accessLabel);
      }
    }

    return { title, url, channel, channelUrl, time: publishedText, duration };
  }

  function normalizePlaylistVideoRenderer(video) {
    const videoId = video.videoId;
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
    if (!url) return null;

    const title = video.title?.simpleText ||
      (video.title?.runs || []).map(run => run.text).join('').trim();
    if (!title) return null;

    const ownerRuns = video.shortBylineText?.runs ||
      video.longBylineText?.runs ||
      [];
    const channel = ownerRuns.map(run => run.text).join('').trim();

    let channelUrl = '';

    const channelRun = (video.shortBylineText?.runs || video.longBylineText?.runs || [])[0];
    if (channelRun?.navigationEndpoint) {
      const endpoint = channelRun.navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }

    if (!channelUrl && video.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint) {
      const endpoint = video.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.navigationEndpoint;
      channelUrl = endpoint.browseEndpoint?.canonicalBaseUrl ||
                   endpoint.commandMetadata?.webCommandMetadata?.url ||
                   '';
    }

    if (channelUrl && !channelUrl.startsWith('http')) {
      channelUrl = 'https://www.youtube.com' + channelUrl;
    }

    const publishedText = video.videoInfo?.runs?.map(run => run.text).join('').trim() || '';

    let duration = '';

    duration = video.lengthText?.simpleText ||
      (video.lengthText?.runs || []).map(run => run.text).join('').trim();

    if (!duration && video.thumbnailOverlays) {
      for (const overlay of video.thumbnailOverlays) {
        if (overlay.thumbnailOverlayTimeStatusRenderer) {
          const renderer = overlay.thumbnailOverlayTimeStatusRenderer;
          duration = renderer.text?.simpleText ||
            (renderer.text?.runs || []).map(run => run.text).join('').trim();
          if (duration) break;
        }
      }
    }

    if (!duration && video.lengthText?.accessibility?.accessibilityData?.label) {
      duration = U.parseDurationFromLabel(video.lengthText.accessibility.accessibilityData.label);
    }

    return { title, url, channel, channelUrl, time: publishedText, duration };
  }

  // channelName is passed in by channel.js (was previously read from module-level channelInfo.name)
  function normalizeGridVideoRenderer(video, channelName) {
    const videoId = video.videoId;
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
    if (!url) return null;

    const title = video.title?.simpleText ||
      (video.title?.runs || []).map(run => run.text).join('').trim();
    if (!title) return null;

    const channel = channelName || '';

    const publishedText = video.publishedTimeText?.simpleText ||
      (video.publishedTimeText?.runs || []).map(run => run.text).join('').trim() || '';

    let views = 0;
    const viewCountText = video.viewCountText?.simpleText ||
      (video.viewCountText?.runs || []).map(run => run.text).join('').trim() || '';
    const viewMatch = viewCountText.match(/([\d,.]+)\s*(K|M|B)?\s*view/i);
    if (viewMatch) {
      let num = parseFloat(viewMatch[1].replace(/,/g, ''));
      const multiplier = viewMatch[2]?.toUpperCase();
      if (multiplier === 'K') num *= 1000;
      else if (multiplier === 'M') num *= 1000000;
      else if (multiplier === 'B') num *= 1000000000;
      views = Math.round(num);
    }

    let duration = '';
    duration = video.lengthText?.simpleText ||
      (video.lengthText?.runs || []).map(run => run.text).join('').trim();

    if (!duration && video.thumbnailOverlays) {
      for (const overlay of video.thumbnailOverlays) {
        if (overlay.thumbnailOverlayTimeStatusRenderer) {
          const renderer = overlay.thumbnailOverlayTimeStatusRenderer;
          duration = renderer.text?.simpleText ||
            (renderer.text?.runs || []).map(run => run.text).join('').trim();
          if (duration) break;
        }
      }
    }

    const durationSecs = parseDurationToSeconds(duration);
    const timestamp = parseRelativeDateToTimestamp(publishedText);

    return {
      title,
      url,
      channel,
      time: publishedText,
      duration,
      views,
      viewsFormatted: formatViews(views),
      durationSecs,
      timestamp
    };
  }

  // ==========================================
  // Collect Videos from ytInitialData
  // ==========================================

  function collectVideosFromData() {
    const data = window.ytInitialData || window.ytInitialPlayerResponse || window.__INITIAL_STATE__;
    if (!data) return [];

    const cacheKey = window.location.href;
    if (videoDataCache.key === cacheKey && videoDataCache.videos.length > 0) {
      return videoDataCache.videos;
    }

    const videos = [];
    const stack = [data];
    const MAX_VIDEOS = 100;
    const MAX_NODES = 5000;
    let traversed = 0;
    const seen = new WeakSet();

    while (stack.length && traversed < MAX_NODES && videos.length < MAX_VIDEOS) {
      const node = stack.pop();
      traversed++;

      if (!node || typeof node !== 'object') continue;

      if (seen.has(node)) continue;
      seen.add(node);

      if (node.videoRenderer) {
        const video = normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }

      if (node.richItemRenderer && node.richItemRenderer.content) {
        const content = node.richItemRenderer.content;
        if (content.videoRenderer) {
          const video = normalizeVideoRenderer(content.videoRenderer);
          if (video) videos.push(video);
          if (videos.length >= MAX_VIDEOS) break;
        }
      }

      if (node.playlistVideoRenderer) {
        const video = normalizePlaylistVideoRenderer(node.playlistVideoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }

      if (node.playlistVideoListRenderer && node.playlistVideoListRenderer.contents) {
        for (const item of node.playlistVideoListRenderer.contents) {
          if (item.playlistVideoRenderer) {
            const video = normalizePlaylistVideoRenderer(item.playlistVideoRenderer);
            if (video) videos.push(video);
            if (videos.length >= MAX_VIDEOS) break;
          }
        }
        if (videos.length >= MAX_VIDEOS) break;
      }

      if (Array.isArray(node)) {
        for (const child of node) {
          if (child && typeof child === 'object') {
            stack.push(child);
          }
        }
      } else if (typeof node === 'object') {
        for (const key in node) {
          if (Object.prototype.hasOwnProperty.call(node, key)) {
            const child = node[key];
            if (child && typeof child === 'object') {
              stack.push(child);
            }
          }
        }
      }
    }

    videoDataCache = { key: cacheKey, videos };
    return videos;
  }

  function collectVideosFromDom() {
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

    const uniqueElements = Array.from(new Set(videoElements));

    const videos = [];

    uniqueElements.forEach((el) => {
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
      const watchLinks = element.querySelectorAll('a[href*="/watch"]');

      let url = '';
      let title = '';

      for (const link of watchLinks) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/watch')) continue;

        if (!url) {
          url = href;
          if (url.startsWith('/')) url = 'https://www.youtube.com' + url;
        }

        if (link.id === 'video-title-link' || link.id === 'video-title') {
          title = link.getAttribute('title') || link.textContent || '';
          if (title) break;
        }
      }

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

      title = title.replace(/\s+\d+\s*(hour|minute|second)s?(,?\s*\d+\s*(hour|minute|second)s?)*\s*$/i, '');
      title = title.replace(/\s+by\s+[\w\s]+\s+\d+\s*(hour|minute|second|view|day|week|month|year).*$/i, '');
      title = title.trim();

      if (!title || !url || !url.includes('/watch')) {
        return null;
      }

      try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
          url = `https://www.youtube.com/watch?v=${videoId}`;
        }
      } catch (e) {}

      let channel = '';
      let channelUrl = '';
      const channelSelectors = [
        'ytd-channel-name yt-formatted-string#text a',
        'ytd-channel-name #text a',
        'ytd-channel-name a',
        '#channel-name yt-formatted-string a',
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
            const href = channelEl.href || channelEl.getAttribute('href') || '';
            if (href && (href.includes('/@') || href.includes('/channel/') || href.includes('/c/'))) {
              channelUrl = href.startsWith('/') ? 'https://www.youtube.com' + href : href;
            }
            break;
          }
          channel = '';
        }
      }

      if (!channelUrl) {
        const channelLinks = element.querySelectorAll('a[href*="/@"], a[href*="/channel/"], a[href*="/c/"]');
        for (const link of channelLinks) {
          const href = link.href || link.getAttribute('href') || '';
          if (href) {
            channelUrl = href.startsWith('/') ? 'https://www.youtube.com' + href : href;
            break;
          }
        }
      }

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

      let duration = '';

      const durationSelectors = [
        'ytd-thumbnail-overlay-time-status-renderer #text',
        'ytd-thumbnail-overlay-time-status-renderer span#text',
        'ytd-thumbnail-overlay-time-status-renderer .ytd-thumbnail-overlay-time-status-renderer',
        '#overlays ytd-thumbnail-overlay-time-status-renderer #text',
        'ytd-thumbnail #overlays ytd-thumbnail-overlay-time-status-renderer #text',
        '#thumbnail-container ytd-thumbnail-overlay-time-status-renderer #text'
      ];

      for (const selector of durationSelectors) {
        const durationEl = element.querySelector(selector);
        if (durationEl) {
          const text = durationEl.textContent?.trim() || '';
          if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            duration = text;
            break;
          }
        }
      }

      if (!duration) {
        const thumbnailArea = element.querySelector('ytd-thumbnail, #thumbnail, a#thumbnail');
        if (thumbnailArea) {
          const allTextNodes = thumbnailArea.querySelectorAll('span, div, #text');
          for (const node of allTextNodes) {
            const text = node.textContent?.trim() || '';
            if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
              duration = text;
              break;
            }
          }
        }
      }

      if (!duration) {
        const data = element.__data || element.data || element._data;
        if (data) {
          const paths = [
            'videoRenderer.lengthText.simpleText',
            'content.videoRenderer.lengthText.simpleText',
            'videoRenderer.lengthText.accessibility.accessibilityData.label',
            'content.videoRenderer.lengthText.accessibility.accessibilityData.label',
            'videoRenderer.thumbnailOverlays',
            'content.videoRenderer.thumbnailOverlays'
          ];

          for (const path of paths) {
            const value = U.getNestedValue(data, path);
            if (value) {
              if (typeof value === 'string' && value.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
                duration = value;
                break;
              }
              if (typeof value === 'string' && value.match(/\d+\s*(minute|hour|second)/i)) {
                duration = U.parseDurationFromLabel(value);
                if (duration) break;
              }
              if (Array.isArray(value)) {
                for (const overlay of value) {
                  const timeText = overlay?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText;
                  if (timeText && timeText.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
                    duration = timeText;
                    break;
                  }
                }
                if (duration) break;
              }
            }
          }
        }
      }

      if (!duration) {
        const allEls = element.querySelectorAll('[aria-label]');
        for (const el of allEls) {
          const ariaLabel = el.getAttribute('aria-label') || '';
          const parsed = U.parseDurationFromLabel(ariaLabel);
          if (parsed) {
            duration = parsed;
            break;
          }
        }
      }

      if (!duration) {
        const badges = element.querySelectorAll('[class*="badge"], [class*="time"], [class*="duration"]');
        for (const badge of badges) {
          const text = badge.textContent?.trim() || '';
          if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            duration = text;
            break;
          }
        }
      }

      return { title, url, channel, channelUrl, time, duration };
    } catch (e) {
      console.error('[PrimeYT] Error extracting data from element:', e);
      return null;
    }
  }

  // ==========================================
  // Channel Video Collection
  // ==========================================

  // Returns { videos, continuationToken, channelContinuationApiKey }
  function collectChannelVideosFromData(channelName) {
    const data = window.ytInitialData;
    if (!data) return { videos: [], continuationToken: null, channelContinuationApiKey: null };

    const videos = [];
    const stack = [data];
    const MAX_VIDEOS = 500;
    const MAX_NODES = 15000;
    let traversed = 0;
    const seen = new WeakSet();

    let continuationToken = null;
    let apiKey = null;

    while (stack.length && traversed < MAX_NODES && videos.length < MAX_VIDEOS) {
      const node = stack.pop();
      traversed++;

      if (!node || typeof node !== 'object') continue;
      if (seen.has(node)) continue;
      seen.add(node);

      if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
        continuationToken = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      }

      if (node.token && typeof node.token === 'string' && node.token.length > 50) {
        if (!continuationToken) {
          continuationToken = node.token;
        }
      }

      if (node.gridVideoRenderer) {
        const video = normalizeGridVideoRenderer(node.gridVideoRenderer, channelName);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }

      if (node.richItemRenderer?.content?.videoRenderer) {
        const video = normalizeVideoRenderer(node.richItemRenderer.content.videoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
      }

      if (node.videoRenderer) {
        const video = normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
        if (videos.length >= MAX_VIDEOS) break;
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

    try {
      if (window.ytcfg && window.ytcfg.get) {
        apiKey = window.ytcfg.get('INNERTUBE_API_KEY');
      }
    } catch (e) {}

    if (continuationToken) {
      console.log('[PrimeYT] Found continuation token, will fetch more videos');
    }

    return { videos, continuationToken, channelContinuationApiKey: apiKey };
  }

  function collectChannelVideosFromDom(channelName) {
    const selectors = [
      'ytd-grid-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-video-renderer'
    ];

    const videoElements = [];
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      videoElements.push(...Array.from(elements));
    });

    const uniqueElements = Array.from(new Set(videoElements));
    const videos = [];

    uniqueElements.forEach((el) => {
      if (el.offsetParent === null) return;

      const data = extractChannelVideoData(el, channelName);
      if (data && data.title && data.url) {
        videos.push(data);
      }
    });

    return videos;
  }

  // channelName param replaces module-level channelInfo.name
  function extractChannelVideoData(element, channelName) {
    try {
      const watchLinks = element.querySelectorAll('a[href*="/watch"]');

      let url = '';
      let title = '';

      for (const link of watchLinks) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/watch')) continue;

        if (!url) {
          url = href;
          if (url.startsWith('/')) url = 'https://www.youtube.com' + url;
        }

        if (link.id === 'video-title-link' || link.id === 'video-title') {
          title = link.getAttribute('title') || link.textContent || '';
          if (title) break;
        }
      }

      if (!title) {
        const titleSelectors = ['#video-title', 'a[id*="video-title"]', 'h3 a', 'h3 yt-formatted-string'];
        for (const selector of titleSelectors) {
          const el = element.querySelector(selector);
          if (el) {
            title = el.getAttribute('title') || el.textContent || '';
            if (title) break;
          }
        }
      }

      title = title.trim();
      if (!title || !url || !url.includes('/watch')) return null;

      try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
          url = `https://www.youtube.com/watch?v=${videoId}`;
        }
      } catch (e) {}

      let time = '';
      let views = 0;
      const metaLine = element.querySelector('#metadata-line, #metadata');
      if (metaLine) {
        const spans = metaLine.querySelectorAll('span');
        spans.forEach(span => {
          const text = span.textContent || '';
          if (text.includes('ago')) {
            time = text.trim();
          }
          if (text.includes('view')) {
            const viewMatch = text.match(/([\d,.]+)\s*(K|M|B)?\s*view/i);
            if (viewMatch) {
              let num = parseFloat(viewMatch[1].replace(/,/g, ''));
              const multiplier = viewMatch[2]?.toUpperCase();
              if (multiplier === 'K') num *= 1000;
              else if (multiplier === 'M') num *= 1000000;
              else if (multiplier === 'B') num *= 1000000000;
              views = Math.round(num);
            }
          }
        });
      }

      let duration = '';
      const durationEl = element.querySelector('ytd-thumbnail-overlay-time-status-renderer #text');
      if (durationEl) {
        const text = durationEl.textContent?.trim() || '';
        if (text.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
          duration = text;
        }
      }

      const durationSecs = parseDurationToSeconds(duration);
      const timestamp = parseRelativeDateToTimestamp(time);

      return {
        title,
        url,
        channel: channelName || '',
        time,
        duration,
        views,
        viewsFormatted: formatViews(views),
        durationSecs,
        timestamp
      };
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // Continuation Extraction
  // ==========================================

  // Returns { videos, nextToken }
  function extractVideosFromContinuation(data, channelName) {
    const videos = [];
    let nextToken = null;
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

      if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
        nextToken = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      }

      if (node.gridVideoRenderer) {
        const video = normalizeGridVideoRenderer(node.gridVideoRenderer, channelName);
        if (video) videos.push(video);
      }

      if (node.richItemRenderer?.content?.videoRenderer) {
        const video = normalizeVideoRenderer(node.richItemRenderer.content.videoRenderer);
        if (video) videos.push(video);
      }

      if (node.videoRenderer) {
        const video = normalizeVideoRenderer(node.videoRenderer);
        if (video) videos.push(video);
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

    return { videos, nextToken };
  }

  // ==========================================
  // Sorting & Formatting Helpers
  // ==========================================

  function parseDurationToSeconds(duration) {
    if (!duration) return 0;
    const parts = duration.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  function parseRelativeDateToTimestamp(timeStr) {
    if (!timeStr) return 0;

    timeStr = timeStr.replace(/^Streamed\s+/i, '');

    const match = timeStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
    if (!match) return 0;

    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const now = new Date();
    const date = new Date(now);

    if (unit === 'second') date.setSeconds(now.getSeconds() - val);
    else if (unit === 'minute') date.setMinutes(now.getMinutes() - val);
    else if (unit === 'hour') date.setHours(now.getHours() - val);
    else if (unit === 'day') date.setDate(now.getDate() - val);
    else if (unit === 'week') date.setDate(now.getDate() - (val * 7));
    else if (unit === 'month') date.setMonth(now.getMonth() - val);
    else if (unit === 'year') date.setFullYear(now.getFullYear() - val);

    return date.getTime();
  }

  function formatViews(views) {
    if (!views || views === 0) return '';
    if (views >= 1000000000) return (views / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (views >= 1000000) return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return views.toString();
  }

  function sortChannelVideos(videos, order) {
    const sorted = [...videos];

    switch (order) {
      case 'newest':
        sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        break;
      case 'oldest':
        sorted.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        break;
      case 'views':
        sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
    }

    return sorted;
  }

  function formatChannelVideoDate(timestamp) {
    if (!timestamp || timestamp === 0) return '';

    const date = new Date(timestamp);
    const now = new Date();

    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }

  function invalidateCache() {
    videoDataCache = { key: '', videos: [] };
  }

  // ==========================================
  // Export
  // ==========================================

  window.PrimeYT.videoData = {
    normalizeVideoRenderer,
    normalizePlaylistVideoRenderer,
    normalizeGridVideoRenderer,
    collectVideosFromData,
    collectVideosFromDom,
    extractVideoData,
    collectChannelVideosFromData,
    collectChannelVideosFromDom,
    extractChannelVideoData,
    extractVideosFromContinuation,
    parseDurationToSeconds,
    parseRelativeDateToTimestamp,
    formatViews,
    sortChannelVideos,
    formatChannelVideoDate,
    invalidateCache
  };
})();
