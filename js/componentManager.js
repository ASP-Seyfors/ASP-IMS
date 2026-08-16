/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/componentManager.js
 * Author: Thomas Paul Seyfors
 * Date: August 2026
 * 
 * Description: UI Stitcher for Componentized HTML Architecture
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */

const ComponentManager = {
  async loadAllScreens() {
    const screens = [
      'login.html',
      'setup.html',
      'manifestEntry.html',
      'manifestReview.html',
      'scanning.html',
      'review.html',
      'summary.html',
      'auditHub.html',
      'archive.html',
      'settings.html',
      'reports.html',
      'dbEditor.html',
      'help.html'
    ];

    const appRoot = document.getElementById('app-root');
    
    for (let file of screens) {
      try {
        let res = await fetch(`screens/${file}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        let html = await res.text();
        appRoot.insertAdjacentHTML('beforeend', html);
      } catch (err) {
        console.error(`Failed to load component: ${file}`, err);
      }
    }
  }
};