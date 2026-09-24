/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/app.js
 * Author: Thomas Seyfors
 * Date Created: August 2026
 * 
 * Description:
 *   Main application entry point and global event binding layer. Handles
 *   DOM load initialization, window-level function bridges, and Service
 *   Worker lifecycle registration.
 *
 * Affected Features:
 *   - Application Load & Screen Initialization
 *   - Service Worker / PWA Offline Caching
 *   - PWA Version Updating (Force Clear Cache)
 *   - Global Javascript Window Bridging
 *   - Master Auto-Sync
 *
 * Copyright (c) 2026 Thomas Seyfors / Allied Surgical Products.
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

async function sendDeploymentBlast() {
    let oldVer = document.getElementById('blastOldVer').value.trim();
    let newVer = document.getElementById('blastNewVer').value.trim();
    let notes = document.getElementById('blastNotes').value.trim();

    if (!newVer || !notes) {
        alert("Please provide the New Version number and Release Notes.");
        return;
    }

    let btn = document.getElementById('btnSendBlast');
    let origHtml = btn.innerHTML;
    btn.innerHTML = "⏳ Sending Blast...";
    btn.disabled = true;

    let payload = {
        action: "SEND_UPDATE_EMAIL",
        payload: {
            oldVersion: oldVer,
            newVersion: newVer,
            notes: notes
        }
    };

    try {
        // FIXED: Using the correct URL method (getActiveArchiveUrl)
        let res = await fetch(SessionManager.getActiveArchiveUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        
        let data = await res.json();
        
        if (data.status === "success") {
            alert("Success! Deployment email has been sent to the team.");
            document.getElementById('blastOldVer').value = newVer;
            document.getElementById('blastNewVer').value = "";
            document.getElementById('blastNotes').value = "";
        } else {
            alert("Error sending email: " + data.message);
        }
    } catch (err) {
        alert("Network Error: " + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

async function sendPreDeploymentBlast() {
    let tDate = document.getElementById('preDeployDate').value;
    let tTime = document.getElementById('preDeployTime').value;

    if (!tDate || !tTime) {
        alert("Please select a target Date and Time for the deployment.");
        return;
    }

    // Strict-mode compliant date splitting
    let dateParts = tDate.split('-');
    let formattedDate = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`;

    // Strict-mode compliant time math
    let timeParts = tTime.split(':');
    let hourNum = parseInt(timeParts[0], 10);
    let ampm = hourNum >= 12 ? 'PM' : 'AM';
    let displayHour = hourNum % 12 || 12;
    let formattedTime = `${displayHour}:${timeParts[1]} ${ampm}`;

    let btn = document.getElementById('btnSendPreDeploy');
    let origHtml = btn.innerHTML;
    btn.innerHTML = "⏳ Sending Warning...";
    btn.disabled = true;

    let payload = {
        action: "SEND_PRE_DEPLOY_EMAIL",
        payload: {
            targetDate: formattedDate,
            targetTime: formattedTime
        }
    };

    try {
        let res = await fetch(SessionManager.getActiveArchiveUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        
        let data = await res.json();
        
        if (data.status === "success") {
            alert("Success! Pre-deployment warning email has been sent to the team.");
            document.getElementById('preDeployDate').value = "";
            document.getElementById('preDeployTime').value = "";
        } else {
            alert("Error sending email: " + data.message);
        }
    } catch (err) {
        alert("Network Error: " + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

window.forceAppUpdate = async function() {
    // Circuit Breaker: Prevent infinite loops
    if (sessionStorage.getItem('isUpdating') === 'true') {
        console.warn('Update already in progress. Halting to prevent infinite loop.');
        sessionStorage.removeItem('isUpdating'); // Clear it for the next manual click
        return;
    }
    
    // Set the flag so it doesn't run again if the page reloads mid-process
    sessionStorage.setItem('isUpdating', 'true');
    
    try {
        // Unregister all Service Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
                console.log('Service worker unregistered.');
            }
        }

        // Clear all PWA Caches
        const cacheKeys = await caches.keys();
        for (let key of cacheKeys) {
            await caches.delete(key);
            console.log(`Cache deleted: ${key}`);
        }

        console.log('Local caches cleared successfully. Reloading application...');
        
        // Reload from the server, bypassing the cache
        window.location.reload(true);
        
    } catch (error) {
        console.error('Error during force update:', error);
        // If it fails, remove the lock so the user can try again
        sessionStorage.removeItem('isUpdating');
    }
};

async function exportAppsScriptFiles(event) {
    let btn = event ? event.target : document.activeElement;
    let origHtml = btn.innerHTML;
    
    if (!confirm("Are you sure you want to backup all backend source code files to your Google Drive?\n\nThis will take a few moments.")) return;

    btn.innerHTML = "⏳ Backing Up Code...";
    btn.disabled = true;

    try {
        let res = await fetch(SessionManager.getActiveArchiveUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: "EXPORT_APPS_SCRIPT" })
        });
        
        let data = await res.json();
        
        if (data.status === "success") {
            alert(`✅ Success! Backed up ${data.count} code files to your Google Drive.`);
            window.open(data.url, '_blank'); // Opens the new Google Drive folder automatically
        } else {
            alert("Export Error: " + data.message);
        }
    } catch (err) {
        alert("Network Error: " + err.message);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

window.onload = async () => { 
  // 1. Fetch and inject all HTML components FIRST
  if (typeof ComponentManager !== 'undefined') {
    await ComponentManager.loadAllScreens();
  }

  // 2. Now it is safe to interact with the DOM elements
  let loginLogo = document.getElementById('loginLogo');
  if (loginLogo) loginLogo.src = ENV_CONFIG.LOGO_URL;

  let versionDisplay = document.getElementById('appVersionDisplay');
  if (versionDisplay) versionDisplay.textContent = "App Version: " + ENV_CONFIG.APP_VERSION;

  let blastNew = document.getElementById('blastNewVer');
  if (blastNew && typeof ENV_CONFIG !== 'undefined') {
      blastNew.value = ENV_CONFIG.APP_VERSION;
  }

  // 3. Initialize remaining systems
  UIManager.loadSavedTheme(); 
  DatabaseManager.init(); 
  SessionManager.init();
  UIManager.toggleSessionType(); 
  
  if (typeof UIManager.loadSavedAdvancedMode === 'function') {
    UIManager.loadSavedAdvancedMode();
  }
  
  if (typeof UIManager.initDebugConsole === 'function') {
    UIManager.initDebugConsole();
  }

  if (typeof AuthManager !== 'undefined') {
    AuthManager.init();
  }

  if (typeof UIManager.checkForCloudUpdates === 'function') {
    UIManager.checkForCloudUpdates();
  }

  if (typeof UIManager.evaluateSyncIndicator === 'function') {
    UIManager.evaluateSyncIndicator();
  }

  setInterval(() => {
    if (typeof UIManager.checkForCloudUpdates === 'function') {
      UIManager.checkForCloudUpdates();
    }
  }, 180000);

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
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
      <div id="syncStep2" style="margin-bottom:15px; font-weight:bold; color:#555;">⏳ 2. Syncing Master Database...</div>
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
    updateStep(1, "Local History Uploaded", 50);

    if (typeof DatabaseManager.downloadCloudDatabase === 'function') {
      await DatabaseManager.downloadCloudDatabase(null, true);
    }
    
    // ✨ FIX: Must pull the fresh ledger so ghost data is wiped and the upload gate unlocks!
    if (typeof SessionManager.fetchAllocationsFromCloud === 'function') {
      await SessionManager.fetchAllocationsFromCloud();
    }
    
    updateStep(2, "Master Database Synced", 100);

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
window.openDevTools = () => UIManager.openDevTools();
window.closeDevTools = () => UIManager.closeDevTools();
window.toggleDebugConsole = () => UIManager.toggleDebugConsole();
window.openDamagedBinViewerModal = () => UIManager.openDamagedBinViewerModal();

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
window.triggerQboSync = (e) => SessionManager.triggerQboSync(e);
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
window.exportEcommerceData = (platform, isNew) => AuditManager.exportEcommerceData(platform, isNew);
window.executeShopifySeedTest = () => AuditManager.executeShopifySeedTest();
window.executeShopifySandboxSync = () => AuditManager.executeShopifySandboxSync();
window.generateRevMedPDF = (mode) => ReportsManager.generateRevMedPDF(mode);

window.sendDeploymentBlast = sendDeploymentBlast;
window.sendPreDeploymentBlast = sendPreDeploymentBlast;
window.exportAppsScriptFiles = exportAppsScriptFiles; 

window.forceAppUpdate = forceAppUpdate;