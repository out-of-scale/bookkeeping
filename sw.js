// Service Worker - 计件工资记账应用
// 网络优先策略：有网用最新版，断网用缓存

const CACHE_NAME = 'bookkeeping-v2';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './manifest.json'
];

// 安装时缓存
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// 激活时清除旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 网络优先：先尝试网络，失败则用缓存
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
