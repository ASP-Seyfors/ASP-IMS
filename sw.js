/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: sw.js
 * Author: Thomas Seyfors
 * Date Created: August 2026
 * 
 * Description:
 *   The Service Worker file responsible for Progressive Web App (PWA) 
 *   offline capabilities. Intercepts network requests and caches core 
 *   assets for disconnected warehouse use.
 *
 * Affected Features:
 *   - Offline App Loading
 *   - Cache Management & Versioning
 *   - Network-First vs Cache-First Routing Policies
 *
 * Copyright (c) 2026 Thomas Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const CACHE_NAME = 'asp-ims-demo-v5.1.5';


const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './database.json',
  './ASP_Box_Web_RGB_DEMO.png',
  './ASP_Icon_192_DEMO.png',
  './ASP_Icon_512_DEMO.png',
  
  // CSS
  './css/layout.css',
  './css/component.css',
  './css/utilities.css',
  
  // JavaScript
  './js/config.js',
  './js/componentManager.js',
  './js/app.js',
  './js/auditManager.js',
  './js/authManager.js',
  './js/databaseManager.js',
  './js/inventoryEngine.js',
  './js/reportsManager.js',
  './js/scannerManager.js',
  './js/sessionManager.js',
  './js/uiManager.js',
  
  // HTML Screens
  './screens/login.html',
  './screens/setup.html',
  './screens/manifestEntry.html',
  './screens/manifestReview.html',
  './screens/scanning.html',
  './screens/review.html',
  './screens/summary.html',
  './screens/auditHub.html',
  './screens/archive.html',
  './screens/settings.html',
  './screens/reports.html',
  './screens/dbEditor.html',
  './screens/help.html',
  './screens/devTools.html',
  
  // HTML Modals
  './modals/itemEditModal.html',
  './modals/binViewerModal.html',
  './modals/quickLookupModal.html',
  './modals/qboModal.html',
  './modals/bugReportModal.html',
  './modals/inventoryReportOptionsModal.html',
  './modals/internalReportOptionsModal.html',
  './modals/stockReportEditorModal.html',
  './modals/systemRestoreModal.html',
  
  // External CDNs
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

// Install Event: Cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
