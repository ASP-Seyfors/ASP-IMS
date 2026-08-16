/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/app.js
 * Author: Thomas Paul Seyfors
 * Version: 3.0.0
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
  // 1. STITCH THE UI TOGETHER FIRST
  if (typeof ComponentManager !== 'undefined') {
    await ComponentManager.loadAllScreens();
  }

  // 2. BOOT THE APP LOGIC
  UIManager.loadSavedTheme(); 
  DatabaseManager.init(); 
  SessionManager.init();
  UIManager.toggleSessionType(); 
  
  // LOAD ADVANCED MODE STATE
  if (typeof UIManager.loadSavedAdvancedMode === 'function') {
    UIManager.loadSavedAdvancedMode();
  }

  // TRIGGER AUTHENTICATION GATEKEEPER
  if (typeof AuthManager !== 'undefined') {
    AuthManager.init();
  }
};

window.masterSystemSync = async (event) => {
  const btn = event ? event.target : null;
  const originalText = btn ? btn.textContent : "🔄 Sync System";
  if (btn) { btn.textContent = "⏳ Syncing All..."; btn.disabled = true; btn.style.opacity = "0.7"; }
  
  try {
    // Add 'true' as a silent flag to prevent these sub-functions from throwing individual alerts
    if (typeof SessionManager.pushLegacySessionsToCloud === 'function') await SessionManager.pushLegacySessionsToCloud(null, true);
    if (typeof DatabaseManager.syncMasterDatabase === 'function') await DatabaseManager.syncMasterDatabase(null, true);
    if (typeof SessionManager.syncCloudArchive === 'function') await SessionManager.syncCloudArchive(null, true);
    
    if(btn) alert("✅ System fully synchronized! Master catalog and session archives are up to date.");
  } catch(err) {
    if(btn) alert("Sync error: " + err.message);
  } finally {
    if(btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; }
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