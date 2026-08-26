/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/app.js
 * Author: Thomas Paul Seyfors
 * Date: August 2026
 * 
 * Description:
 *   Main application entry point and global event binding layer. Handles
 *   DOM load initialization, window-level function bridges, and service
 *   worker lifecycle registration.
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
async function checkAppUpdates() {
  // Show an immediate visual feedback loading indicator
  const btn = event ? event.target : null;
  if (btn) btn.textContent = "⏳ Checking...";

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        // Force the browser to re-check sw.js on GitHub Pages
        await registration.update();

        // If a new worker is waiting, activate it immediately
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          alert("🎉 New update found and applied! Reloading application...");
          window.location.reload(true);
          return;
        }

        // Listen for new updates that might be installing right now
        if (registration.installing) {
          alert("⏬ Downloading latest update... The page will refresh once complete.");
          registration.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                alert("✅ Update complete! Reloading app...");
                window.location.reload(true);
              }
            }
          });
          return;
        }
      }
    } catch (err) {
      console.warn("Service worker update check failed:", err);
    }
  }

  // If no new update was detected on the server
  alert("✓ You are already running the latest version of ASP IMS!");
  if (btn) btn.textContent = "🔄 Check for Updates";
}

window.forceAppUpdate = async function() {
    // 1. Circuit Breaker: Prevent infinite loops
    if (sessionStorage.getItem('isUpdating') === 'true') {
        console.warn('Update already in progress. Halting to prevent infinite loop.');
        sessionStorage.removeItem('isUpdating'); // Clear it for the next manual click
        return;
    }
    
    // Set the flag so it doesn't run again if the page reloads mid-process
    sessionStorage.setItem('isUpdating', 'true');
    
    try {
        // 2. Unregister all Service Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
                console.log('Service worker unregistered.');
            }
        }

        // 3. Clear all PWA Caches
        const cacheKeys = await caches.keys();
        for (let key of cacheKeys) {
            await caches.delete(key);
            console.log(`Cache deleted: ${key}`);
        }

        console.log('Local caches cleared successfully. Reloading application...');
        
        // 4. Reload from the server, bypassing the cache
        window.location.reload(true);
        
    } catch (error) {
        console.error('Error during force update:', error);
        // If it fails, remove the lock so the user can try again
        sessionStorage.removeItem('isUpdating');
    }
};

window.onload = async () => { 
  if (typeof ComponentManager !== 'undefined') {
    await ComponentManager.loadAllScreens();
  }

  UIManager.loadSavedTheme(); 
  DatabaseManager.init(); 
  SessionManager.init();
  UIManager.toggleSessionType(); 
  
  if (typeof UIManager.loadSavedAdvancedMode === 'function') {
    UIManager.loadSavedAdvancedMode();
  }

  if (typeof AuthManager !== 'undefined') {
    AuthManager.init();
  }

  // Check for inbound updates from Google Sheets
  if (typeof UIManager.checkForCloudUpdates === 'function') {
    UIManager.checkForCloudUpdates();
  }

  // NEW: Check if we need to show the red dot on load
  if (typeof UIManager.evaluateSyncIndicator === 'function') {
    UIManager.evaluateSyncIndicator();
  }
};

window.masterSystemSync = async (event) => {
  let modal = document.getElementById('syncProgressModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'syncProgressModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background:#fff; border-radius:8px; width:100%; max-width:400px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
      <h3 style="margin:0 0 15px 0; color:#0277bd; text-align:center;">🔄 Master System Sync</h3>
      <div id="syncStep1" style="margin-bottom:10px; font-weight:bold; color:#555;">⏳ 1. Uploading Local History...</div>
      <div id="syncStep2" style="margin-bottom:10px; font-weight:bold; color:#555;">⏳ 2. Syncing Master Database...</div>
      <div id="syncStep3" style="margin-bottom:15px; font-weight:bold; color:#555;">⏳ 3. Syncing Cloud Vault...</div>
      <div style="width:100%; background:#eee; border-radius:4px; height:8px; overflow:hidden;">
        <div id="syncProgressBar" style="width:0%; height:100%; background:#2e7d32; transition:width 0.3s ease;"></div>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  
  const updateStep = (stepNum, text, progress) => {
    let el = document.getElementById(`syncStep${stepNum}`);
    if (el) el.innerHTML = `✅ <span style="color:#2e7d32;">${text}</span>`;
    document.getElementById('syncProgressBar').style.width = `${progress}%`;
  };

  try {
    if (typeof SessionManager.pushLegacySessionsToCloud === 'function') {
      await SessionManager.pushLegacySessionsToCloud(null, true);
    }
    updateStep(1, "Local History Uploaded", 33);

    // FIX: Download fresh items from the cloud using the correct function name
    if (typeof DatabaseManager.downloadCloudDatabase === 'function') {
      await DatabaseManager.downloadCloudDatabase(null, true);
    }
    updateStep(2, "Master Database Synced", 66);

    if (typeof SessionManager.syncCloudArchive === 'function') {
      await SessionManager.syncCloudArchive(null, true);
    }
    updateStep(3, "Cloud Vault Directory Synced", 100);

    setTimeout(() => {
      modal.style.display = 'none';
      localStorage.setItem('asp_last_cloud_sync', Date.now().toString());
      if (typeof UIManager.evaluateSyncIndicator === 'function') {
        UIManager.evaluateSyncIndicator();
        let ind = document.getElementById('syncIndicator');
        if (ind) ind.style.display = 'none';
      }
    }, UIManager.printTimeout);

  } catch(err) {
    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:400px; padding:20px; text-align:center;">
        <h3 style="color:#c62828;">❌ Sync Error</h3>
        <p style="color:#555; font-size:0.9rem;">${err.message}</p>
        <button onclick="document.getElementById('syncProgressModal').style.display='none'" style="background:#0277bd; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold;">Close</button>
      </div>`;
  }
};
window.changeAppTheme = (val) => UIManager.changeAppTheme(val);
window.toggleSessionType = () => UIManager.toggleSessionType();
window.togglePreloadFeed = () => UIManager.togglePreloadFeed();
window.openAuditHub = () => UIManager.openAuditHub();
window.setItemAction = (act) => UIManager.setItemAction(act);
window.toggleItemNote = () => UIManager.toggleItemNote();
window.toggleNA = (field, chk) => UIManager.toggleNA(field, chk);
window.formatExpDate = (el) => UIManager.formatExpDate(el);
window.evaluateFieldAttention = () => UIManager.evaluateFieldAttention();
window.toggleSessionNote = () => UIManager.toggleSessionNote();
window.closeAuditHub = () => UIManager.closeAuditHub();
window.toggleAdvancedMode = () => UIManager.toggleAdvancedMode();
window.openReportsHub = () => UIManager.openReportsHub();
window.closeReportsHub = () => UIManager.closeReportsHub();
window.openDbEditor = () => UIManager.openDbEditor();
window.closeDbEditor = () => UIManager.closeDbEditor();
window.openHelpScreen = () => UIManager.openHelpScreen();
window.closeHelpScreen = () => UIManager.closeHelpScreen();
window.openQboModal = () => UIManager.openQboModal();
window.openBinViewerModal = () => UIManager.openBinViewerModal(); // NEW LINE
window.handleSandboxToggle = (el) => UIManager.handleSandboxToggle(el);

window.handlePartnerSelect = (val, type) => DatabaseManager.handlePartnerSelect(val, type);
window.runMasterLookup = () => DatabaseManager.runMasterLookup();
window.handleVendorSelect = (val) => DatabaseManager.handleVendorSelect(val);
window.handleItemCustomerSelect = (val) => DatabaseManager.handleItemCustomerSelect(val);

window.startSession = () => SessionManager.startSession();
window.rescueLastSession = () => SessionManager.rescueLastSession();
window.processPastedSpreadsheet = () => SessionManager.processPastedSpreadsheet();
window.addManifestRow = () => SessionManager.addManifestRow();
window.cancelManifestEntry = () => SessionManager.cancelManifestEntry();
window.goToManifestReview = () => SessionManager.goToManifestReview();
window.returnToManifestEdit = () => SessionManager.returnToManifestEdit();
window.confirmManifestAndStart = () => SessionManager.confirmManifestAndStart();
window.toggleManifestResRow = (idx) => SessionManager.toggleManifestResRow(idx);
window.goToSummaryScreen = () => SessionManager.goToSummaryScreen();
window.goToReviewStage = () => SessionManager.goToReviewStage();
window.confirmFieldUpdate = (field) => SessionManager.confirmFieldUpdate(field);
window.returnToEdit = () => SessionManager.returnToEdit();
window.cancelScannedItem = () => SessionManager.cancelScannedItem();
window.saveItemLog = () => SessionManager.saveItemLog();
window.clearManifestList = () => SessionManager.clearManifestList();
window.triggerQboSync = () => SessionManager.triggerQboSync();
window.offloadAndPurgeHistory = (e) => SessionManager.offloadAndPurgeHistory(e);

window.scanDocumentOCR = (e) => ScannerManager.scanDocumentOCR(e);
window.resetScanLinesAndFields = () => ScannerManager.resetScanLinesAndFields();
window.toggleCameraScanner = () => ScannerManager.toggleCameraScanner();
window.scanImageFile = (e) => ScannerManager.scanImageFile(e);
window.processAllScans = () => ScannerManager.processAllScans();
window.addScanLine = () => ScannerManager.addScanLine();

window.executeAction = () => AuditManager.executeSessionAction();
window.processAuditFiles = (e) => AuditManager.processAuditFiles(e);
window.clearAuditSessions = () => AuditManager.clearAuditSessions();
window.executeAuditExport = () => AuditManager.executeAuditExport();
window.exportThriveCreates = () => AuditManager.exportThriveCreates();
window.exportThriveEdits = () => AuditManager.exportThriveEdits();
window.exportUpdatedDatabaseJSON = () => AuditManager.exportUpdatedDatabaseJSON();
window.loadCustomerReportData = () => AuditManager.loadCustomerReportData();
window.batchPushLegacyLogs = (e) => AuditManager.batchPushLegacyLogs(e);
window.exportThriveCreates = () => AuditManager.exportThriveCreates();
window.exportThriveVariants = () => AuditManager.exportThriveVariants();
window.exportThriveProducts = () => AuditManager.exportThriveProducts();
window.exportShopifyProducts = () => AuditManager.exportShopifyProducts();
window.exportShopifyInventory = () => AuditManager.exportShopifyInventory();

window.forceAppUpdate = forceAppUpdate;