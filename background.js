// PrimeYT Background Service Worker
// Keeps subscriptions data fresh even when YouTube isn't open

const ALARM_NAME = 'primeyt-sync';
const SYNC_INTERVAL_MINUTES = 15; // Sync every 15 minutes
const CACHE_KEY = 'primeyt_subscriptions_cache';

// ==========================================
// Initialization
// ==========================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[PrimeYT Background] Extension installed');
  setupAlarm();
  syncSubscriptions(); // Initial sync
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[PrimeYT Background] Browser started');
  setupAlarm();
  syncSubscriptions(); // Sync on browser start
});

// ==========================================
// Periodic Sync via Alarms
// ==========================================

function setupAlarm() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: SYNC_INTERVAL_MINUTES
      });
      console.log(`[PrimeYT Background] Alarm set for every ${SYNC_INTERVAL_MINUTES} minutes`);
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[PrimeYT Background] Alarm triggered - syncing subscriptions');
    syncSubscriptions();
  }
});

// ==========================================
// Fetch and Cache Subscriptions
// ==========================================

async function syncSubscriptions() {
  try {
    console.log('[PrimeYT Background] Fetching subscriptions...');
    
    const response = await fetch('https://www.youtube.com/feed/subscriptions', {
      credentials: 'include',
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      console.log('[PrimeYT Background] Fetch failed:', response.status);
      return;
    }
    
    const html = await response.text();
    const videos = parseVideosFromHTML(html);
    
    if (videos && videos.length > 0) {
      const cacheData = {
        timestamp: Date.now(),
        videos: videos.slice(0, 100)
      };
      
      await chrome.storage.local.set({ [CACHE_KEY]: cacheData });
      console.log(`[PrimeYT Background] Cached ${videos.length} subscription videos`);
    } else {
      console.log('[PrimeYT Background] No videos found in response');
    }
  } catch (error) {
    console.log('[PrimeYT Background] Sync error:', error.message);
  }
}

// ==========================================
// Parse Videos from HTML
// ==========================================

function parseVideosFromHTML(html) {
  // Extract ytInitialData from the page HTML
  let match = html.match(/var ytInitialData = ({.+?});<\/script>/s);
  if (!match) {
    match = html.match(/ytInitialData\s*=\s*({.+?});/s);
  }
  
  if (!match) {
    console.log('[PrimeYT Background] Could not find ytInitialData');
    return [];
  }
  
  try {
    const data = JSON.parse(match[1]);
    return extractVideosFromData(data);
  } catch (e) {
    console.log('[PrimeYT Background] Parse error:', e.message);
    return [];
  }
}

function extractVideosFromData(data) {
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
    '';

  // Get duration
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

  return { title, url, channel, time: publishedText, duration };
}

// ==========================================
// Message Handler for Content Script
// ==========================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CACHED_SUBSCRIPTIONS') {
    chrome.storage.local.get([CACHE_KEY], (result) => {
      sendResponse(result[CACHE_KEY] || null);
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'FORCE_SYNC') {
    syncSubscriptions().then(() => {
      chrome.storage.local.get([CACHE_KEY], (result) => {
        sendResponse(result[CACHE_KEY] || null);
      });
    });
    return true;
  }
});
