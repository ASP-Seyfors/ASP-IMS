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
  alert("✓ You are already running the latest version of ASP Scanner!");
  if (btn) btn.textContent = "🔄 Check for Updates";
}

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
      <div id="syncStep3" style="margin-bottom:10px; font-weight:bold; color:#555;">⏳ 3. Syncing Cloud Vault...</div>
      <div id="syncStep4" style="margin-bottom:15px; font-weight:bold; color:#555;">⏳ 4. Fetching Orders & QBO Feed...</div>
      <div style="width:100%; background:#eee; border-radius:4px; height:8px; overflow:hidden;">
        <div id="syncProgressBar" style="width:0%; height:100%; background:#2e7d32; transition:width 0.3s ease;"></div>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  
  const updateStep = (stepNum, text, progress) => {
    let el = document.getElementById(`syncStep${stepNum}`);
    if (el) {
      el.innerHTML = `✅ <span style="color:#2e7d32;">${text}</span>`;
    }
    document.getElementById('syncProgressBar').style.width = `${progress}%`;
  };

  try {
    if (typeof SessionManager.pushLegacySessionsToCloud === 'function') {
      await SessionManager.pushLegacySessionsToCloud(null, true);
    }
    updateStep(1, "Local History Uploaded", 25);

    if (typeof DatabaseManager.syncMasterDatabase === 'function') {
      await DatabaseManager.syncMasterDatabase(null, true);
    }
    updateStep(2, "Master Database Synced", 50);

    // NEW: Sync the Cloud Archive directory
    if (typeof SessionManager.syncCloudArchive === 'function') {
      await SessionManager.syncCloudArchive(null, true);
    }
    updateStep(3, "Cloud Vault Directory Synced", 75);

    // NEW: Trigger QBO if admin, otherwise just fetch staged sessions
    let isAdmin = typeof AuthManager !== 'undefined' && AuthManager.currentUser && AuthManager.currentUser.isAdmin;
    if (isAdmin && typeof SessionManager.triggerQboSync === 'function') {
      await SessionManager.triggerQboSync(null, true);
    } else if (typeof SessionManager.fetchStagedSessions === 'function') {
      await SessionManager.fetchStagedSessions(true);
    }
    updateStep(4, "Orders & QBO Feed Fetched", 100);

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
window.handlePartnerSelect = (val, type) => DatabaseManager.handlePartnerSelect(val, type);
window.startSession = () => SessionManager.startSession();
window.rescueLastSession = () => SessionManager.rescueLastSession();
window.openAuditHub = () => UIManager.openAuditHub();
window.scanDocumentOCR = (e) => ScannerManager.scanDocumentOCR(e);
window.processPastedSpreadsheet = () => SessionManager.processPastedSpreadsheet();
window.addManifestRow = () => SessionManager.addManifestRow();
window.cancelManifestEntry = () => SessionManager.cancelManifestEntry();
window.goToManifestReview = () => SessionManager.goToManifestReview();
window.returnToManifestEdit = () => SessionManager.returnToManifestEdit();
window.confirmManifestAndStart = () => SessionManager.confirmManifestAndStart();
window.toggleManifestResRow = (idx) => SessionManager.toggleManifestResRow(idx);
window.goToSummaryScreen = () => SessionManager.goToSummaryScreen();
window.resetScanLinesAndFields = () => ScannerManager.resetScanLinesAndFields();
window.toggleCameraScanner = () => ScannerManager.toggleCameraScanner();
window.scanImageFile = (e) => ScannerManager.scanImageFile(e);
window.processAllScans = () => ScannerManager.processAllScans();
window.addScanLine = () => ScannerManager.addScanLine();
window.runMasterLookup = () => DatabaseManager.runMasterLookup();
window.setItemAction = (act) => UIManager.setItemAction(act);
window.toggleItemNote = () => UIManager.toggleItemNote();
window.handleVendorSelect = (val) => DatabaseManager.handleVendorSelect(val);
window.toggleNA = (field, chk) => UIManager.toggleNA(field, chk);
window.formatExpDate = (el) => UIManager.formatExpDate(el);
window.evaluateFieldAttention = () => UIManager.evaluateFieldAttention();
window.goToReviewStage = () => SessionManager.goToReviewStage();
window.confirmFieldUpdate = (field) => SessionManager.confirmFieldUpdate(field);
window.returnToEdit = () => SessionManager.returnToEdit();
window.cancelScannedItem = () => SessionManager.cancelScannedItem();
window.saveItemLog = () => SessionManager.saveItemLog();
window.executeAction = () => AuditManager.executeSessionAction();
window.toggleSessionNote = () => UIManager.toggleSessionNote();
window.closeAuditHub = () => UIManager.closeAuditHub();
window.processAuditFiles = (e) => AuditManager.processAuditFiles(e);
window.clearAuditSessions = () => AuditManager.clearAuditSessions();
window.executeAuditExport = () => AuditManager.executeAuditExport();
window.exportThriveCreates = () => AuditManager.exportThriveCreates();
window.exportThriveEdits = () => AuditManager.exportThriveEdits();
window.exportUpdatedDatabaseJSON = () => AuditManager.exportUpdatedDatabaseJSON();
window.clearManifestList = () => SessionManager.clearManifestList();
window.handleItemCustomerSelect = (val) => DatabaseManager.handleItemCustomerSelect(val);
window.loadCustomerReportData = () => AuditManager.loadCustomerReportData();
window.toggleAdvancedMode = () => UIManager.toggleAdvancedMode();
// ... existing bridges ...
window.openReportsHub = () => UIManager.openReportsHub();
window.closeReportsHub = () => UIManager.closeReportsHub();
window.openDbEditor = () => UIManager.openDbEditor();
window.closeDbEditor = () => UIManager.closeDbEditor();
window.openHelpScreen = () => UIManager.openHelpScreen();
window.closeHelpScreen = () => UIManager.closeHelpScreen();
window.batchPushLegacyLogs = (e) => AuditManager.batchPushLegacyLogs(e);
window.triggerQboSync = () => SessionManager.triggerQboSync();
window.openQboModal = () => UIManager.openQboModal();
window.offloadAndPurgeHistory = (e) => SessionManager.offloadAndPurgeHistory(e);
window.openBinViewerModal = () => UIManager.openBinViewerModal(); // NEW LINE

window.exportThriveCreates = () => AuditManager.exportThriveCreates();
window.exportThriveVariants = () => AuditManager.exportThriveVariants();
window.exportThriveProducts = () => AuditManager.exportThriveProducts();