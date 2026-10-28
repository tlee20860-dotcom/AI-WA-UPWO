const SW_VERSION = 'v1.0.0';
const CACHE_NAME = `upgrade-wo-cache-${SW_VERSION}`;

// 安裝階段：跳過等待，立即啟用
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 啟用階段：清理舊版快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截請求：Network First, fallback to Cache
self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 排除跨域請求（如 Firebase API）與 Chrome 擴充功能
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 若請求成功，將結果存入快取
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 若網路失敗，嘗試從快取讀取
        return caches.match(event.request);
      })
  );
});

/* ═══ EOF ═══
F: AI-WA-UPWO/public/sw.js
V: 1792916300
W: UPGRADE-002
═══ */