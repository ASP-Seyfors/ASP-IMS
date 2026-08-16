/* =======================================================================
 * File: js/componentManager.js
 * Description: UI Stitcher for Componentized HTML Architecture
 * Author: Thomas Paul Seyfors
 * Version: 3.0.3
 * Date: August 2026
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