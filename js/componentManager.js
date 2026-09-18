/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/componentManager.js
 * Author: Thomas Seyfors
 * Date Created: August 2026
 * 
 * Description:
 *   UI Component Stitcher. Asynchronously fetches multiple standalone HTML 
 *   files and injects them into the main index document to maintain a clean, 
 *   modular Single Page Application (SPA) architecture.
 *
 * Affected Features:
 *   - Single Page Application Loading
 *   - HTML Component Injection
 *
 * Copyright (c) 2026 Thomas Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const ComponentManager = {
  async loadAllScreens() {
    const screens = [
      'login.html', 'setup.html', 'manifestEntry.html', 'manifestReview.html',
      'scanning.html', 'review.html', 'summary.html', 'auditHub.html',
      'archive.html', 'settings.html', 'reports.html', 'dbEditor.html',
      'help.html', 'devTools.html' 
    ];

    const modals = [
      'itemEditModal.html',
      'binViewerModal.html',
      'quickLookupModal.html',
      'qboModal.html',
      'bugReportModal.html',
      'inventoryReportOptionsModal.html',
      'internalReportOptionsModal.html',
      'stockReportEditorModal.html',
      'systemRestoreModal.html'
    ];

    const appRoot = document.getElementById('app-root');
    
    // 1. Load Screens
    for (let file of screens) {
      try {
        let res = await fetch(`screens/${file}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        let html = await res.text();
        appRoot.insertAdjacentHTML('beforeend', html);
      } catch (err) {
        console.error(`Failed to load screen: ${file}`, err);
      }
    }

    // 2. Load Modals
    for (let file of modals) {
      try {
        let res = await fetch(`modals/${file}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        let html = await res.text();
        document.body.insertAdjacentHTML('beforeend', html);
      } catch (err) {
        console.error(`Failed to load modal: ${file}`, err);
      }
    }
  }
};