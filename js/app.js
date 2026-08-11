// ============================================================================
// 6. GLOBAL HTML EVENT BINDINGS (Maintains exact compatibility with index.html)
// ============================================================================
async function checkAppUpdates() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        // Force the browser to re-check sw.js on GitHub Pages
        await registration.update();
        
        if (registration.waiting) {
          // Tell the waiting worker to activate immediately
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } catch (err) {
      console.warn("Service worker update check failed:", err);
    }
  }
  
  // Hard reload the browser window to load new JS/CSS from server
  window.location.reload(true);
}

window.onload = () => { 
  UIManager.loadSavedTheme(); 
  DatabaseManager.init(); 
  SessionManager.init(); // <--- Loads last used user name into field
  UIManager.toggleSessionType(); 
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
