/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/sessionManager.js
 * Author: Thomas Paul Seyfors
 * Date: August 2026
 * 
 * Description:
 *   Core session lifecycle engine for the ASP Scanner application. Handles
 *   session initialization, workflow state management, real-time scanning
 *   memory storage, pre-load manifest verification, and local storage archiving.
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const SessionManager = {
  scannedObjects: JSON.parse(localStorage.getItem('asp_session_scanned_objects')) || [],
  pendingNewItems: JSON.parse(localStorage.getItem('asp_pending_new_items')) || [],
  pendingUpdates: {},
  pendingFieldUpdates: JSON.parse(localStorage.getItem('asp_pending_updates')) || [],
  isManifestEnabled: false,
  expectedManifest: JSON.parse(localStorage.getItem('asp_active_manifest')) || [],
  
  currentItemAction: "Inventory",
  isSessionActive: false,
  currentUserName: localStorage.getItem('asp_user_name') || "",
  currentSessionName: localStorage.getItem('asp_session_name') || "",
  currentOrderNum: localStorage.getItem('asp_order_num') || "",
  currentWorkflowType: localStorage.getItem('asp_workflow_type') || "Receiving",
  sessionStartStr: localStorage.getItem('asp_session_start_str') || "",
  sessionDateStr: localStorage.getItem('asp_session_date_str') || "",
  currentMatchedItem: null,

  sessionId: localStorage.getItem('asp_session_id') || "",

  // Paste your Web App URL here
  googleFeederUrl: "https://script.google.com/macros/s/AKfycbxccIizG_pkX6ARslZCv4ElewSCRz_HUtsn0R8CKpCAFgVKPj972RLrL5eUsTNArq6IeA/exec",
  fetchedStagedData: {},

  // --- NEW CLOUD ARCHIVE CONFIGURATION ---
  cloudArchiveUrl: "https://script.google.com/macros/s/AKfycbzJw6P78vbvpYVOAqBqkAJezLpk1SXxwF1ndSs3my6ZeF3pJh1tBHvyGwWcuYsB63uG/exec",

  pushToCloudArchive(sessionObj) {
    if (!this.googleFeederUrl) return;
    
    let payload = {
      action: "ARCHIVE_SESSION",
      payload: sessionObj
    };

    fetch(this.googleFeederUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(err => console.warn("Background Cloud Archive push failed:", err));
  },

  async syncCloudArchive(event, silent = false) {
    const btn = event ? event.target : null;
    const originalText = btn ? btn.textContent : "☁️ Sync Cloud";
    if (btn) { btn.textContent = "⏳ Syncing..."; btn.disabled = true; btn.style.opacity = "0.7"; }

    try {
      let res = await fetch(this.cloudArchiveUrl);
      let data = await res.json();
      
      if (data.status === "success" && data.archive) {
        let localArchive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
        let newCount = 0;
        
        // Intelligently merge cloud data into local memory
        data.archive.forEach(remoteSess => {
          let existingIdx = localArchive.findIndex(local => local.id === remoteSess.id);
          if (existingIdx === -1) {
            localArchive.push(remoteSess);
            newCount++;
          } else if (remoteSess.lastUpdated > localArchive[existingIdx].lastUpdated) {
            localArchive[existingIdx] = remoteSess;
            newCount++;
          }
        });
        
        // Sort by newest first
        localArchive.sort((a,b) => b.lastUpdated - a.lastUpdated);
        localStorage.setItem('asp_session_archive', JSON.stringify(localArchive));
        
        this.renderArchiveList();

       // NEW: Also import the Master Database silently while syncing the archive
        if (data.db && typeof DatabaseManager !== 'undefined') {
          DatabaseManager.importCloudDatabase(data.db);
        }

        // Wrap the alert
        if (!silent) alert(`Cloud Sync Complete! Retrieved ${data.archive.length} global sessions.\n${newCount} new/updated sessions merged into your device.`);
      } else {
        alert("Sync failed: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      alert("Error connecting to Cloud Archive: " + err.message);
    } finally {
      if (btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; }
    }
  },

  // ---------------------------------------
  async pushLegacySessionsToCloud(event, silent = false) {
    const btn = event ? event.target : null;
    const originalText = btn ? btn.textContent : "⬆️ Upload Local History";
    if (btn) { btn.textContent = "⏳ Uploading..."; btn.disabled = true; btn.style.opacity = "0.7"; }

    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let completedSessions = archive.filter(s => s.status === 'Completed');

    if (completedSessions.length === 0) {
      if (!silent) alert("No completed sessions found in local memory to upload.");
      if (btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; }
      return;
    }

    let successCount = 0;
    for (let session of completedSessions) {
      try {
        let payload = {
          action: "ARCHIVE_SESSION",
          payload: session
        };

        // TARGET: ASP_SCANNER_DATABASE (Cloud_Archive tab)
        await fetch(this.cloudArchiveUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        
        successCount++;
      } catch (err) {
        console.warn(`Failed to push session: ${session.sessionName}`, err);
      }
    }

    if (!silent) alert(`Successfully pushed ${successCount} legacy session(s) to the Cloud Archive!`);
    if (btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; }
  },

  async fetchStagedSessions(silent = false) {
    if (!this.googleFeederUrl || this.googleFeederUrl.includes("YOUR_COPIED")) {
      if (!silent) alert("Please paste your Google Apps Script Web App URL into sessionManager.js first!");
      return;
    }

    try {
      let res = await fetch(this.googleFeederUrl);
      let data = await res.json();
      
      this.fetchedStagedData = data.stagedSessions || {};
      
      if (data.customerAnalytics) {
        localStorage.setItem('asp_remote_analytics', JSON.stringify(data.customerAnalytics));
        localStorage.setItem('asp_remote_customers', JSON.stringify(data.customerList));
      }
      
      let select = document.getElementById('stagedOrdersSelect');
      if (select) {
        select.innerHTML = '<option value="">-- Select Staged Order --</option>';

        let count = 0;
        for (let sessionName in this.fetchedStagedData) {
          let sessionObj = this.fetchedStagedData[sessionName];
          let items = Array.isArray(sessionObj) ? sessionObj : (sessionObj.items || []);
          let isDone = sessionObj.isCompleted === true || sessionObj.status === 'COMPLETED';

          if (isDone) continue;

          let opt = document.createElement('option');
          opt.value = sessionName;
          opt.textContent = `📦 ${sessionName} (${items.length} items)`;
          select.appendChild(opt);
          count++;
        }

        if (typeof UIManager !== 'undefined' && UIManager.populateCustomerDropdown) {
          UIManager.populateCustomerDropdown();
        }

        if (!silent) {
          if (count > 0) alert(`Successfully synced! Found ${count} staged orders and updated Customer Analytics.`);
          else alert("Synced successfully, but no staged orders found on the ASP_Scanner_Feed tab.");
        }
      }
    } catch (err) {
      if (!silent) alert("Error syncing feed: " + err.message);
    }
  },

  loadSelectedStagedOrder(sessionName) {
    if (!sessionName || !this.fetchedStagedData[sessionName]) return;
    
    let sessionObj = this.fetchedStagedData[sessionName];
    let items = Array.isArray(sessionObj) ? sessionObj : (sessionObj.items || []);
    let isDone = sessionObj.isCompleted === true;

    if (isDone) {
      let confirmRescan = confirm(`Notice: "${sessionName}" is already marked as COMPLETED in your logs.\n\nDo you want to re-load this order into the Pre-Load Manifest for a re-scan?`);
      if (!confirmRescan) {
        document.getElementById('stagedOrdersSelect').value = "";
        return;
      }
    }

    let chk = document.getElementById('chkPreloadManifest');
    if (chk) chk.checked = true;
    
    let detailsInput = document.getElementById('orderDetailsInput');
    if (detailsInput) detailsInput.value = sessionName;
    
    this.expectedManifest = [];
    items.forEach(item => {
      let isRes = item.customerTag && !item.customerTag.toUpperCase().includes('SHELF');
      this.expectedManifest.push({
        ref: item.sku,
        expectedQty: item.qty,
        isReserved: isRes,
        customerTag: item.customerTag || '',
        reservedQty: item.qty,
        allocations: isRes ? [{ customerTag: item.customerTag, reservedQty: item.qty }] : []
      });
    });

    localStorage.setItem('asp_active_manifest', JSON.stringify(this.expectedManifest));
    alert(`Loaded "${sessionName}" with ${items.length} items into Pre-Load Manifest!`);
  },

  init() {
    let lastUser = localStorage.getItem('asp_user_name') || "";
    let userInput = document.getElementById('userNameInput');
    if (userInput && lastUser) userInput.value = lastUser;

    ['supplierSelect', 'customerSelect'].forEach(id => {
      let sel = document.getElementById(id);
      if (sel && sel.options.length > 1) {
        let opts = Array.from(sel.options);
        let first = opts.shift();
        opts.sort((a, b) => a.text.localeCompare(b.text));
        sel.innerHTML = '';
        sel.add(first);
        opts.forEach(o => sel.add(o));
      }
    });

    if (typeof UIManager !== 'undefined' && UIManager.loadFontPreference) UIManager.loadFontPreference();
  },

  startStocktakeSession(mode) {
    const uName = document.getElementById('userNameInput').value.trim();
    
    this.currentUserName = uName || "Operator";
    this.currentSessionName = mode + " Stocktake";
    this.currentOrderNum = mode === "Full" ? "FULL-INV" : "SEL-INV";
    this.currentWorkflowType = mode + " Stocktake";
    this.isSessionActive = true;
    this.isManifestEnabled = false;

    const nowObj = new Date();
    this.sessionDateStr = `${nowObj.getFullYear()}.${String(nowObj.getMonth() + 1).padStart(2, '0')}.${String(nowObj.getDate()).padStart(2, '0')}`;
    this.sessionStartStr = nowObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    this.sessionId = Date.now().toString();
    localStorage.setItem('asp_session_id', this.sessionId);

    localStorage.setItem('asp_session_is_active', 'true');
    localStorage.setItem('asp_manifest_enabled', 'false');
    localStorage.setItem('asp_user_name', this.currentUserName);
    localStorage.setItem('asp_session_name', this.currentSessionName);
    localStorage.setItem('asp_order_num', this.currentOrderNum);
    localStorage.setItem('asp_workflow_type', this.currentWorkflowType);
    localStorage.setItem('asp_session_start_str', this.sessionStartStr);
    localStorage.setItem('asp_session_date_str', this.sessionDateStr);
    
    this.scannedObjects = [];
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));

    this.updateHeaderBanners();
    
    if (typeof UIManager !== 'undefined' && UIManager.closeStocktakeModal) UIManager.closeStocktakeModal();
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';

    let destRow = document.getElementById('rowItemDestination');
    let tagRow = document.getElementById('rowCustomerTag');
    if (destRow) destRow.style.display = 'none';
    if (tagRow) tagRow.style.display = 'none';
    
    this.currentItemAction = 'Inventory';
    ScannerManager.resetScanLinesAndFields();
  },

  startSession() {
    try {
      const uName = document.getElementById('userNameInput').value.trim();
      const type = document.querySelector('input[name="sessionType"]:checked').value;
      let partner = type === 'Shipment' ? document.getElementById('supplierSelect').value : document.getElementById('customerSelect').value;
      const oDetails = document.getElementById('orderDetailsInput').value.trim();
      const wType = type === 'Shipment' ? 'Receiving & Reserving' : document.getElementById('workflowTypeSelect').value;
      const chkManifest = document.getElementById('chkPreloadManifest').checked;

      if (!partner || partner === '+ Add Supplier' || partner === '+ Add Customer') {
        alert("Please select a valid Supplier or Customer.");
        return;
      }

      this.currentUserName = uName || "N/A";
      this.currentSessionName = partner + (oDetails ? ` (${oDetails})` : '');
      this.currentOrderNum = oDetails;
      this.currentWorkflowType = wType;
      this.isSessionActive = true;
      this.isManifestEnabled = chkManifest;

      const nowObj = new Date();
      this.sessionDateStr = `${nowObj.getFullYear()}.${String(nowObj.getMonth() + 1).padStart(2, '0')}.${String(nowObj.getDate()).padStart(2, '0')}`;
      this.sessionStartStr = nowObj.toLocaleTimeString();

      this.sessionId = Date.now().toString();
      localStorage.setItem('asp_session_id', this.sessionId);
      localStorage.setItem('asp_session_is_active', 'true');
      localStorage.setItem('asp_manifest_enabled', this.isManifestEnabled ? 'true' : 'false');
      localStorage.setItem('asp_user_name', this.currentUserName);
      localStorage.setItem('asp_session_name', this.currentSessionName);
      localStorage.setItem('asp_order_num', this.currentOrderNum);
      localStorage.setItem('asp_workflow_type', this.currentWorkflowType);
      localStorage.setItem('asp_session_start_str', this.sessionStartStr);
      localStorage.setItem('asp_session_date_str', this.sessionDateStr);
      
      this.scannedObjects = [];
      localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));

      this.updateHeaderBanners();

      // UI SCREEN ROUTING
      document.getElementById('screenSetup').style.display = 'none';

      if (this.isManifestEnabled) {
        const container = document.getElementById('manifestRowsContainer');
        if (container) container.innerHTML = '';
        
        if (this.expectedManifest && this.expectedManifest.length > 0) {
          this.expectedManifest.forEach(item => {
            let hasAlloc = item.allocations && item.allocations.length > 0;
            let tagVal = hasAlloc ? item.allocations[0].customerTag : (item.customerTag || '');
            let resQtyVal = hasAlloc ? item.allocations[0].reservedQty : (item.reservedQty || item.expectedQty || 1);
            this.addManifestRow(item.ref || item.sku || '', item.expectedQty || item.qty || 1, hasAlloc, tagVal, resQtyVal);
          });
        } else {
          this.addManifestRow();
        }
        
        document.getElementById('screenManifestEntry').style.display = 'block';
      } else {
        this.expectedManifest = [];
        localStorage.setItem('asp_active_manifest', JSON.stringify([]));
        document.getElementById('screenScanning').style.display = 'block';
        this.updateManifestProgressUI();
      }

      let destRow = document.getElementById('rowItemDestination');
      let tagRow = document.getElementById('rowCustomerTag');
      if (this.currentWorkflowType.includes('Receiving & Reserving')) {
        if (destRow) destRow.style.display = 'flex';
        if (tagRow) tagRow.style.display = this.currentItemAction === 'Reserved' ? 'flex' : 'none';
      } else if (this.currentWorkflowType.includes('Reserving')) {
        if (destRow) destRow.style.display = 'none';
        if (tagRow) tagRow.style.display = 'flex';
        this.currentItemAction = 'Reserved';
      } else if (this.currentWorkflowType.includes('Packing')) {
        if (destRow) destRow.style.display = 'none';
        if (tagRow) tagRow.style.display = 'none';
        this.currentItemAction = 'Pack & Ship';
      } else {
        if (destRow) destRow.style.display = 'none';
        if (tagRow) tagRow.style.display = 'none';
        this.currentItemAction = 'Inventory';
      }

      ScannerManager.resetScanLinesAndFields();

    } catch (err) {
      console.error("Error during startSession:", err);
      alert("Encountered an issue starting session: " + err.message);
      // Emergency recovery: Restore home screen so it never stays black
      document.getElementById('screenSetup').style.display = 'block';
      if (document.getElementById('screenManifestEntry')) document.getElementById('screenManifestEntry').style.display = 'none';
      if (document.getElementById('screenScanning')) document.getElementById('screenScanning').style.display = 'none';
    }
  },

  launchAIVisionBridge() {
    const platform = document.getElementById('aiPlatformSelect') ? document.getElementById('aiPlatformSelect').value : 'gemini';
    
    const promptText = `Analyze these attached medical inventory box photos. Group the items by REF/SKU, Quantity, Lot Number, and Expiration Date. For any item where the Lot or Expiration is unreadable or not visible, put 'N/A'.

Return ONLY a raw tab-separated table with NO extra introductory text, headers, or explanations, formatted in these exact columns:
REF [Tab] Quantity [Tab] Lot [Tab] Exp`;

    let targetUrl = 'https://gemini.google.com/app';
    let platformName = 'Gemini';

    if (platform === 'chatgpt') {
      targetUrl = 'https://chatgpt.com';
      platformName = 'ChatGPT';
    }

    navigator.clipboard.writeText(promptText).then(() => {
      alert(`AI Vision Prompt copied to your clipboard!\n\nOpening ${platformName}... Just paste (Ctrl+V) into the chat and attach your shipment photos.`);
      window.open(targetUrl, '_blank');
    }).catch(err => {
      console.error('Failed to copy prompt: ', err);
      window.open(targetUrl, '_blank');
    });
  },

  updateHeaderBanners() {
    ['hdrTitle', 'hdrTitleRev', 'hdrTitleSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.currentSessionName; });
    ['hdrWorkflow', 'hdrWorkflowRev', 'hdrWorkflowSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.currentWorkflowType; });
    ['hdrUser', 'hdrUserRev', 'hdrUserSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.currentUserName || 'N/A'; });
    ['hdrDate', 'hdrDateRev', 'hdrDateSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.sessionDateStr; });
    ['hdrTime', 'hdrTimeRev', 'hdrTimeSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.sessionStartStr; });
  },

  rescueLastSession() {
    if (this.scannedObjects.length === 0) { alert("No scanned items found in memory to rescue."); return; }
    this.isManifestEnabled = localStorage.getItem('asp_manifest_enabled') === 'true';
    this.updateHeaderBanners();
    this.goToSummaryScreen();
  },

  addManifestRow(refVal = '', qtyVal = 1, isRes = false, tagVal = '', resQtyVal = 1) {
    const container = document.getElementById('manifestRowsContainer');
    if (!container) return;
    const rowIdx = container.children.length;
    const div = document.createElement('div'); div.className = 'manifest-row'; div.id = `manifestRow_${rowIdx}`;
    
    let allocHtml = isRes ? `
      <div class="manifest-subrow flex-between" style="display:flex; gap:6px; margin-top:4px;">
        <input type="text" class="manifest-tag-input" placeholder="Customer Tag" value="${tagVal}" style="flex:2;">
        <input type="number" class="manifest-resqty-input" placeholder="Res Qty" value="${resQtyVal}" min="1" style="flex:1;">
        <button class="btn-small btn-cancel" onclick="this.parentElement.remove()" style="padding:4px 8px;">✕</button>
      </div>` : '';

    div.innerHTML = `
      <div style="display:flex; gap:6px; align-items:center;">
        <input type="text" class="manifest-ref-input" placeholder="REF / SKU" value="${refVal}" oninput="this.value = this.value.toUpperCase();" style="flex:2;">
        <input type="number" class="manifest-qty-input" placeholder="Total Expected Qty" value="${qtyVal}" min="1" style="flex:1;">
        <button class="btn-small btn-cancel" onclick="this.parentElement.parentElement.remove()" style="padding:4px 8px;">✕</button>
      </div>
      <div id="allocContainer_${rowIdx}">${allocHtml}</div>
      <div style="margin-top:6px;">
        <button class="btn-small btn-auto" style="font-size:0.75rem; padding:2px 8px; background-color:#0277bd;" onclick="SessionManager.addManifestAllocation(${rowIdx})">+ Add Customer Allocation</button>
      </div>
    `;
    container.appendChild(div);
  },

  addManifestAllocation(rowIdx) {
    const container = document.getElementById(`allocContainer_${rowIdx}`);
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'manifest-subrow flex-between';
    div.style.display = 'flex'; div.style.gap = '6px'; div.style.marginTop = '4px';
    div.innerHTML = `
      <input type="text" class="manifest-tag-input" placeholder="Customer Tag" style="flex:2;">
      <input type="number" class="manifest-resqty-input" placeholder="Res Qty" value="1" min="1" style="flex:1;">
      <button class="btn-small btn-cancel" onclick="this.parentElement.remove()" style="padding:4px 8px;">✕</button>
    `;
    container.appendChild(div);
  },

  toggleManifestResRow(idx) {
    const row = document.getElementById(`manifestRow_${idx}`);
    if (!row) return;
    const chk = row.querySelector('.manifest-res-chk');
    const subrow = document.getElementById(`manifestResSubrow_${idx}`);
    if (chk && subrow) subrow.style.display = chk.checked ? 'flex' : 'none';
  },

  clearManifestList() {
    if (confirm("Are you sure you want to clear all currently loaded items?")) {
      document.getElementById('manifestRowsContainer').innerHTML = '';
    }
  },

  processPastedSpreadsheet() {
    const text = document.getElementById('pasteManifestArea').value.trim();
    if (!text) { alert("Please paste spreadsheet data first."); return; }
    
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;
    
    let skuIdx = -1, qtyIdx = -1, custIdx = -1, poIdx = -1;
    let dataStartIndex = 0;
    
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      let cols = lines[i].toUpperCase().split('\t').map(c => c.trim());
      if (cols.includes('SKU') || cols.includes('REF')) {
        skuIdx = cols.indexOf('SKU') > -1 ? cols.indexOf('SKU') : cols.indexOf('REF');
        qtyIdx = cols.indexOf('QTY') > -1 ? cols.indexOf('QTY') : cols.indexOf('QUANTITY');
        custIdx = cols.indexOf('CUSTOMER') > -1 ? cols.indexOf('CUSTOMER') : cols.indexOf('CUST');
        poIdx = cols.indexOf('PO') > -1 ? cols.indexOf('PO') : cols.indexOf('INVOICE');
        dataStartIndex = i + 1;
        break;
      }
    }
    
    if (skuIdx === -1 && qtyIdx === -1) {
      let firstLineCols = lines[0].split('\t');
      dataStartIndex = (firstLineCols.length === 1 && lines.length > 1) ? 1 : 0;
      custIdx = 0; poIdx = 1; skuIdx = 2; qtyIdx = 3;
    }
    
    let parsedCount = 0;
    let lastCustomer = '', lastPO = '';
    
    for (let i = dataStartIndex; i < lines.length; i++) {
      let cols = lines[i].split('\t');
      if (cols.length < 2 && cols[0].trim() === '') continue;
      
      let rawCust = custIdx !== -1 && cols[custIdx] ? cols[custIdx].trim().toUpperCase() : '';
      let rawPO = poIdx !== -1 && cols[poIdx] ? cols[poIdx].trim().toUpperCase() : '';
      
      if (rawCust) { lastCustomer = rawCust; lastPO = rawPO; }
      
      let activeCust = rawCust || lastCustomer;
      let activePO = rawCust ? rawPO : (rawPO || lastPO);
      let ref = skuIdx !== -1 && cols[skuIdx] ? cols[skuIdx].trim().toUpperCase() : '';
      if (!ref) continue;
      
      let qtyRaw = qtyIdx !== -1 && cols[qtyIdx] ? cols[qtyIdx].replace(/\D/g, '') : '1';
      let qty = parseInt(qtyRaw, 10);
      if (isNaN(qty) || qty < 1) qty = 1;
      
      // NEW: INTELLIGENT "SHELF" SPLITTER
      let poShelfMatch = activePO.match(/(.*?)\s*\((\d+)\)\s*SHELF\s*\((\d+)\)/i);
      let isSplitCust = activeCust.includes('/SHELF') || activeCust.includes('SHELF/');

      if (poShelfMatch || isSplitCust) {
        let realCust = activeCust.split('/')[0].trim();
        if (realCust === 'SHELF') realCust = activeCust.split('/')[1].trim() || 'UNKNOWN';
        let realPO = poShelfMatch ? poShelfMatch[1].trim() : activePO;
        
        let custQty = poShelfMatch ? parseInt(poShelfMatch[2], 10) : Math.ceil(qty / 2);
        let shelfQty = poShelfMatch ? parseInt(poShelfMatch[3], 10) : Math.floor(qty / 2);
        
        if (custQty > 0) {
          this.addManifestRow(ref, custQty, true, realCust + ((realPO && realPO !== 'NA') ? ' - ' + realPO : ''), custQty);
          parsedCount++;
        }
        if (shelfQty > 0) {
          this.addManifestRow(ref, shelfQty, false, '', 0);
          parsedCount++;
        }
        continue; // Skip the standard single-line add
      }
      
      let isRes = false, tagVal = '', resQty = 0;
      if (activeCust && activeCust !== 'SHELF' && activeCust !== 'NA' && activeCust !== 'N/A') {
        isRes = true;
        tagVal = activeCust + ((activePO && activePO !== 'NA' && activePO !== 'N/A') ? ' - ' + activePO : '');
        resQty = qty;
      }
      
      this.addManifestRow(ref, qty, isRes, tagVal, resQty);
      parsedCount++;
    }
    if (parsedCount > 0) {
      document.getElementById('pasteManifestArea').value = '';
      alert(`Successfully parsed and added ${parsedCount} lines (including auto-splits)!`);
    } else alert("Could not extract items.");
  },

  readManifestDataFromUI() {
    const container = document.getElementById('manifestRowsContainer');
    if (!container) return [];
    let list = [];
    container.querySelectorAll('.manifest-row').forEach(row => {
      let ref = row.querySelector('.manifest-ref-input').value.trim().toUpperCase();
      let expectedQty = parseInt(row.querySelector('.manifest-qty-input').value, 10) || 1;
      let allocations = [];
      row.querySelectorAll('.manifest-subrow').forEach(subrow => {
        let tag = subrow.querySelector('.manifest-tag-input').value.trim();
        let rQty = parseInt(subrow.querySelector('.manifest-resqty-input').value, 10) || 1;
        if (tag) allocations.push({ customerTag: tag, reservedQty: rQty });
      });
      if (ref) list.push({ ref, expectedQty, allocations });
    });
    return list;
  },

  goToManifestReview() {
    this.expectedManifest = this.readManifestDataFromUI();
    if (this.expectedManifest.length === 0) { alert("Please enter at least one expected item row."); return; }
    let totalExp = this.expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);
    
    let html = `<div style="margin-bottom:15px; text-align:center;"><strong>Total Expected Pieces:</strong> ${totalExp} across ${this.expectedManifest.length} unique REFs</div>`;
    this.expectedManifest.forEach(item => {
      html += `<div style="border: 1px solid #0277bd; border-radius: 4px; padding: 12px; margin-bottom: 12px; background: #ffffff; text-align: center;">
        <div style="font-size: 1.2rem; color: #0277bd;"><strong>${item.ref}</strong></div>
        <div style="margin: 6px 0; font-size: 1.05rem;"><strong>Total Expected:</strong> ${item.expectedQty}</div>`;
      if (item.allocations.length > 0) {
        html += `<div style="margin-top: 10px; font-size: 0.9rem; color: #555;"><strong>Allocations:</strong><br>`;
        item.allocations.forEach(a => { html += `<span style="display:inline-block; background:#e3f2fd; color:#0277bd; padding:4px 8px; border:1px dashed #0277bd; border-radius:3px; margin:4px; font-weight:bold;">${a.customerTag} (Qty: ${a.reservedQty})</span><br>`; });
        html += `</div>`;
      } else {
        html += `<div style="margin-top: 10px; font-size: 0.85rem; color: #757575;"><em>All routed to standard Inventory.</em></div>`;
      }
      html += `</div>`;
    });
    document.getElementById('manifestReviewSummaryContainer').innerHTML = html;
    document.getElementById('screenManifestEntry').style.display = 'none';
    document.getElementById('screenManifestReview').style.display = 'block';
  },

  returnToManifestEdit() {
    document.getElementById('screenManifestReview').style.display = 'none';
    document.getElementById('screenManifestEntry').style.display = 'block';
  },

  cancelManifestEntry() {
    document.getElementById('screenManifestEntry').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  confirmManifestAndStart() {
    localStorage.setItem('asp_active_manifest', JSON.stringify(this.expectedManifest));
    document.getElementById('screenManifestReview').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
    this.updateManifestProgressUI();
  },

  updateManifestProgressUI() {
    const banner = document.getElementById('manifestProgressBanner');
    const tracker = document.getElementById('liveManifestTracker');
    
    if (!this.isManifestEnabled || this.expectedManifest.length === 0) { 
      if (banner) banner.style.display = 'none'; 
      if (tracker) tracker.style.display = 'none';
      return; 
    }
    
    if (banner) banner.style.display = 'block';
    if (tracker) tracker.style.display = 'block';
    
    let expHtml = '';
    let totalExpected = 0;
    let totalScannedExp = 0;
    let totalUnexpected = 0;

    let scannedMap = {};
    this.scannedObjects.forEach(i => { scannedMap[i.ref] = (scannedMap[i.ref] || 0) + i.qty; });

    this.expectedManifest.forEach(exp => {
      totalExpected += exp.expectedQty;
      let sQty = scannedMap[exp.ref] || 0;
      totalScannedExp += Math.min(sQty, exp.expectedQty); // Cap expected scanned
      let diff = sQty - exp.expectedQty;
      if (diff > 0) totalUnexpected += diff;
      
      let color = sQty >= exp.expectedQty ? '#2e7d32' : (sQty > 0 ? '#f57f17' : '#555');
      let icon = sQty >= exp.expectedQty ? '✅' : '⏳';
      
      expHtml += `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #e0e0e0; padding:6px 4px;">
        <span style="font-weight:bold; color:${color};">${icon} ${exp.ref}</span>
        <span style="color:${color}; font-weight:bold;">${sQty} / ${exp.expectedQty}</span>
      </div>`;
    });

    Object.keys(scannedMap).forEach(sRef => {
      if (!this.expectedManifest.find(e => e.ref === sRef)) {
        totalUnexpected += scannedMap[sRef];
        expHtml += `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #e0e0e0; padding:6px 4px; background-color: #fff3e0;">
          <span style="font-weight:bold; color:#e65100;">⚠️ ${sRef} (Unexpected)</span>
          <span style="color:#e65100; font-weight:bold;">${scannedMap[sRef]}</span>
        </div>`;
      }
    });

    document.getElementById('manifestScannedQty').textContent = totalScannedExp;
    document.getElementById('manifestTotalQty').textContent = totalExpected;
    
    let unexpHtml = totalUnexpected > 0 ? ` | <span style="color:#e65100;">${totalUnexpected} Unexpected</span>` : '';
    document.getElementById('manifestUnexpectedStats').innerHTML = unexpHtml;

    if (document.getElementById('liveManifestList')) {
      document.getElementById('liveManifestList').innerHTML = expHtml;
    }
  },

  confirmFieldUpdate(field) {
    if (!this.currentMatchedItem) return;
    if (field === 'gtin' && this.pendingUpdates['gtin']) {
      this.currentMatchedItem.gtin = this.pendingUpdates['gtin'];
      alert(`Database updated: GTIN ${this.pendingUpdates['gtin']} linked to REF ${DatabaseManager.getItemSku(this.currentMatchedItem)}!`);
    } else if (field === 'mfr') {
      let selectedMfr = document.getElementById('vendorSelect').value;
      this.currentMatchedItem.mfr = selectedMfr;
      this.currentMatchedItem.manufacturer = selectedMfr;
      alert(`Database updated: Manufacturer updated for REF ${DatabaseManager.getItemSku(this.currentMatchedItem)}!`);
    }
    this.pendingFieldUpdates.push({
      ref: DatabaseManager.getItemSku(this.currentMatchedItem),
      field: field === 'gtin' ? 'GTIN' : 'Manufacturer',
      newValue: field === 'gtin' ? this.pendingUpdates['gtin'] : document.getElementById('vendorSelect').value,
      timestamp: new Date().toLocaleString()
    });
    localStorage.setItem('asp_pending_updates', JSON.stringify(this.pendingFieldUpdates));
    localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));
    UIManager.hideAllConfirmButtons();
  },

  getCombinedCustomerTag() {
    let custName = document.getElementById('itemCustomerSelect') ? document.getElementById('itemCustomerSelect').value : '';
    let custPO = document.getElementById('itemOrderNumInput') ? document.getElementById('itemOrderNumInput').value.trim() : '';
    if (custName === '+ Add Customer') custName = '';
    return custName + (custPO ? ` - ${custPO}` : '');
  },

  goToReviewStage() {
    let expField = document.getElementById('expInput');
    if (expField && expField.value.trim() !== "" && !document.getElementById('chkNaExp').checked) {
      UIManager.formatExpDate(expField);
    }
    
    const ref = document.getElementById('refInput').value.trim().toUpperCase();
    if (!ref) { 
      alert("Please enter or scan a REF/SKU before continuing."); 
      return; 
    }
    
    const gtin = document.getElementById('gtinInput').value.trim();
    const lot = document.getElementById('lotInput').value.trim().toUpperCase();
    const exp = document.getElementById('expInput').value.trim();
    const vendor = document.getElementById('vendorSelect').value;
    const qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
    const cTag = this.getCombinedCustomerTag();
    const iNote = document.getElementById('itemNoteInput') ? document.getElementById('itemNoteInput').value.trim() : '';

    // Manifest Progress Indicators (Safely Guarded)
    const refProgRow = document.getElementById('revRefProgressRow');
    const totalProgRow = document.getElementById('revTotalProgressRow');
    const refProgText = document.getElementById('revRefProgress');
    const totalProgText = document.getElementById('revTotalProgress');

    if (this.isManifestEnabled && this.expectedManifest.length > 0) {
      if (refProgRow) refProgRow.style.display = 'flex';
      if (totalProgRow) totalProgRow.style.display = 'flex';
      
      let manifestItem = this.expectedManifest.find(i => i.ref === ref);
      let scannedRefQtySoFar = this.scannedObjects.filter(i => i.ref === ref).reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
      let newTotalScannedForRef = scannedRefQtySoFar + qty;
      
      if (refProgText) {
        if (manifestItem) refProgText.textContent = `${newTotalScannedForRef} Scanned / ${manifestItem.expectedQty} Expected`;
        else refProgText.innerHTML = `<span class="badge-info badge-alert">⚠️ Unexpected Item (Not on Manifest)</span>`;
      }
      
      let totalScannedOverall = this.scannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0) + qty;
      let totalExpectedOverall = this.expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);
      if (totalProgText) totalProgText.textContent = `${totalScannedOverall} / ${totalExpectedOverall} Total Order Items`;
    } else {
      if (refProgRow) refProgRow.style.display = 'none';
      if (totalProgRow) totalProgRow.style.display = 'none';
    }

    // Required Fields Rendering
    if (document.getElementById('revRef')) document.getElementById('revRef').textContent = ref;
    if (document.getElementById('revGtin')) document.getElementById('revGtin').textContent = gtin || '--';
    if (document.getElementById('revLot')) document.getElementById('revLot').textContent = lot || '--';
    if (document.getElementById('revExp')) document.getElementById('revExp').textContent = exp || '--';
    if (document.getElementById('revMfr')) document.getElementById('revMfr').textContent = vendor;
    if (document.getElementById('revQty')) document.getElementById('revQty').textContent = qty;
    
    // Item Note Row Guard
    if (document.getElementById('revItemNoteRow')) {
      document.getElementById('revItemNoteRow').style.display = iNote ? 'flex' : 'none';
      if (document.getElementById('revItemNote')) document.getElementById('revItemNote').textContent = iNote;
    }

    if (document.getElementById('revDesc')) {
      document.getElementById('revDesc').textContent = DatabaseManager.getItemDesc(this.currentMatchedItem) || "Navigate to vendor website for item description.";
    }
    if (document.getElementById('revPrice')) {
      document.getElementById('revPrice').textContent = (this.currentMatchedItem && this.currentMatchedItem.price) ? this.currentMatchedItem.price : "$0.00";
    }

    // FIX: Always render the correct destination type regardless of the row's display state
    if (document.getElementById('revAction')) {
      document.getElementById('revAction').textContent = this.currentItemAction;
    }
    if (document.getElementById('revActionRow')) {
      document.getElementById('revActionRow').style.display = this.currentWorkflowType.includes('Receiving & Reserving') ? 'flex' : 'none';
    }
    
    // Customer Tag Row Guard
    let tagRow = document.getElementById('rowCustomerTag');
    let revTagRow = document.getElementById('revCustomerTagRow');
    if (tagRow && tagRow.style.display !== 'none' && revTagRow) {
      revTagRow.style.display = 'flex'; 
      if (document.getElementById('revCustomerTag')) document.getElementById('revCustomerTag').textContent = cTag || 'NONE';
    } else if (revTagRow) { 
      revTagRow.style.display = 'none'; 
    }

    // GTIN Difference Banner Guard
    let diffBanner = document.getElementById('gtinDiffBanner');
    let btnGtin = document.getElementById('btnConfirmGtin');
    if (this.currentMatchedItem && gtin && gtin !== "N/A" && this.currentMatchedItem.gtin !== gtin) {
      this.pendingUpdates['gtin'] = gtin;
      if (btnGtin) btnGtin.style.display = 'inline-block';
      if (diffBanner) {
        diffBanner.textContent = this.currentMatchedItem.gtin ? `⚠️ Replace Saved GTIN (${this.currentMatchedItem.gtin}) with Scanned GTIN (${gtin})?` : `[Link New GTIN: ${gtin}]`;
        diffBanner.style.display = 'block';
      }
    } else {
      if (btnGtin) btnGtin.style.display = 'none';
      if (diffBanner) diffBanner.style.display = 'none';
    }

    let btnMfr = document.getElementById('btnConfirmMfr');
    if (btnMfr) {
      btnMfr.style.display = (this.currentMatchedItem && DatabaseManager.getItemVendor(this.currentMatchedItem).toLowerCase() !== vendor.toLowerCase()) ? 'inline-block' : 'none';
    }

    // Transition Screens
    document.getElementById('screenScanning').style.display = 'none';
    document.getElementById('screenReview').style.display = 'block';
  },

  returnToEdit() {
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
  },

  cancelScannedItem() {
    if (confirm("Are you sure you want to discard this scanned item?")) {
      ScannerManager.resetScanLinesAndFields();
      this.returnToEdit();
    }
  },

  saveItemLog() {
    const gtin = document.getElementById('gtinInput').value.trim();
    const ref = document.getElementById('refInput').value.trim().toUpperCase();
    const lot = document.getElementById('lotInput').value.trim().toUpperCase();
    const exp = document.getElementById('expInput').value.trim();
    const vendor = document.getElementById('vendorSelect').value;
    const qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
    const cTag = this.getCombinedCustomerTag();
    const iNote = document.getElementById('itemNoteInput') ? document.getElementById('itemNoteInput').value.trim() : '';
    
    const desc = DatabaseManager.getItemDesc(this.currentMatchedItem) || "Navigate to vendor website for item description.";
    const price = (this.currentMatchedItem && this.currentMatchedItem.price) ? this.currentMatchedItem.price : "$0.00";

    let rawBarcodesGathered = [];
    for (let i = 1; i <= 4; i++) {
      let val = document.getElementById(`rawScan${i}`).value.trim();
      if (val) rawBarcodesGathered.push(val.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, ''));
    }

    // LIVE GTIN SYNC: Link GTIN in memory for immediate re-scan matching
    if (this.currentMatchedItem && gtin && gtin !== "N/A" && !this.currentMatchedItem.gtin) {
      this.currentMatchedItem.gtin = gtin;
      let dbMatch = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase());
      if (dbMatch) dbMatch.gtin = gtin;
      localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));
    }

    let isNewRef = false;
    if (!this.currentMatchedItem && ref) {
      isNewRef = true;
      let newItem = { gtin: (gtin === "N/A" ? "" : gtin), sku: ref, ref: ref, desc: desc, price: "$0.00", mfr: vendor };
      DatabaseManager.db.push(newItem);
      localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));
      this.pendingNewItems.push(newItem);
      localStorage.setItem('asp_pending_new_items', JSON.stringify(this.pendingNewItems));
    }

    let effectiveTag = this.currentItemAction;
    if (!this.currentWorkflowType.includes('Receiving & Reserving')) {
      if (this.currentWorkflowType.includes('Reserving')) effectiveTag = 'Reserved';
      else if (this.currentWorkflowType.includes('Packing')) effectiveTag = 'Pack & Ship';
      else effectiveTag = 'Inventory';
    }

    this.scannedObjects.push({
      actionTag: effectiveTag,
      gtin: gtin || (this.currentMatchedItem ? this.currentMatchedItem.gtin : ''),
      ref: ref || 'UNREGISTERED',
      lot: lot || 'NO_LOT',
      exp: exp || 'NO_EXP',
      mfr: vendor,
      desc: desc,
      price: price,
      qty: qty,
      rawScanLines: rawBarcodesGathered,
      isNew: isNewRef,
      customerTag: (effectiveTag === 'Reserved' ? cTag : ''),
      itemNote: iNote
    });
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify(this.scannedObjects));

    ScannerManager.resetScanLinesAndFields();
    this.updateManifestProgressUI();
    this.returnToEdit();

    this.saveToArchive('Active');
  },

  goToSummaryScreen() {
    if (ScannerManager.isCameraActive) ScannerManager.toggleCameraScanner();
    document.getElementById('screenScanning').style.display = 'none';
    document.getElementById('screenReview').style.display = 'none';
    AuditManager.updateSessionSummaryView();
    
    let optCommit = document.getElementById('optCommitStock');
    if (optCommit) {
      optCommit.style.display = this.currentWorkflowType.includes('Stocktake') ? 'block' : 'none';
    }

    this.renderManifestReconciliation();
    this.renderAdvancedReview(); 
    
    document.getElementById('screenSummary').style.display = 'block';
  },

  getVendorSearchUrl(mfr, ref) {
    let cleanMfr = (mfr || '').toUpperCase();
    if (cleanMfr.includes('ETHICON')) return 'https://www.ethicon.com/na/epc/search/';
    if (cleanMfr.includes('SYNERGY')) return 'https://www.synergysurgical.com/search/in-date,short-dated.html';
    
    return `https://www.google.com/search?q=${encodeURIComponent(mfr + ' ' + ref)}`;
  },

  renderAdvancedReview() {
    const card = document.getElementById('advancedReviewCard');
    const list = document.getElementById('advancedItemsList');
    if (!card || !list) return;

    if (!Array.isArray(this.pendingNewItems)) {
      this.pendingNewItems = [];
    }

    let unresolved = this.pendingNewItems.filter(i => i.desc === "Navigate to vendor website for item description." || !i.desc);
    
    if (unresolved.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    unresolved.forEach((item, index) => {
      let searchUrl = this.getVendorSearchUrl(item.mfr, item.ref);
      let div = document.createElement('div');
      div.style.marginBottom = '10px';
      div.style.padding = '10px';
      div.style.backgroundColor = '#ffffff';
      div.style.border = '1px solid #90caf9';
      div.style.borderRadius = '4px';

      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <div><strong style="color: #0277bd;">${item.ref}</strong> <span style="font-size:0.8rem; color:#555; margin-left: 6px;">${item.mfr}</span></div>
          <button class="btn-small" style="background-color:#1976d2; color:#ffffff; padding: 4px 10px;" onclick="window.open('${searchUrl}', '_blank')">🔍 Search</button>
        </div>
        <div style="display:flex; align-items:center; gap:6px; background:#f5f5f5; padding:6px; border-radius:4px; border:1px solid #ccc;">
          <span style="font-size:0.85rem; font-weight:bold; color:#555; white-space:nowrap;">${item.mfr}</span>
          <input type="text" id="advDesc_${index}" class="adv-desc-input" data-ref="${item.ref}" data-mfr="${item.mfr}" placeholder="Paste website description here..." style="flex:1; padding:6px; border: 1px solid #ccc; border-radius: 4px;">
          <span style="font-size:0.85rem; font-weight:bold; color:#555; white-space:nowrap;">${item.ref}</span>
        </div>
      `;
      list.appendChild(div);
    });
  },

  saveAdvancedDescriptions() {
    const inputs = document.querySelectorAll('.adv-desc-input');
    let updatedCount = 0;

    inputs.forEach(input => {
      let rawDesc = input.value.trim();
      let ref = input.getAttribute('data-ref');
      let mfr = input.getAttribute('data-mfr');
      
      if (rawDesc && rawDesc !== "Navigate to vendor website for item description.") {
        // Automatically inject the Manufacturer and REF into the saved string
        let newDesc = `${mfr} ${rawDesc} ${ref}`.replace(/\s+/g, ' ').trim();
        
        let pendingItem = this.pendingNewItems.find(i => i.ref === ref);
        if (pendingItem) pendingItem.desc = newDesc;

        let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase());
        if (dbItem) dbItem.desc = newDesc;

        this.scannedObjects.forEach(scanned => {
          if (scanned.ref === ref && scanned.isNew) {
            scanned.desc = newDesc;
          }
        });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));
      localStorage.setItem('asp_pending_new_items', JSON.stringify(this.pendingNewItems));
      localStorage.setItem('asp_session_scanned_objects', JSON.stringify(this.scannedObjects));
      
      alert(`Successfully updated ${updatedCount} descriptions!`);
      this.renderAdvancedReview();
    } else {
      alert("No new descriptions were entered.");
    }
  },

  cancelSession() {
    if (!confirm("Are you sure you want to CANCEL this entire scanning session?\n\nAll items scanned during this session will be discarded.")) return;
    
    // Auto-Export Text Log before wiping memory
    if (this.scannedObjects.length > 0 || this.pendingNewItems.length > 0 || this.pendingFieldUpdates.length > 0) {
      AuditManager.exportSessionData('txt');
    }

    this.saveToArchive('Cancelled');

    this.isSessionActive = false; this.isManifestEnabled = false;
    localStorage.setItem('asp_session_is_active', 'false'); localStorage.setItem('asp_manifest_enabled', 'false');
    this.scannedObjects = []; this.expectedManifest = [];
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify([])); localStorage.setItem('asp_active_manifest', JSON.stringify([]));

    // Fix: Destroy manifest discrepancy UI leak
    let recList = document.getElementById('manifestReconcileList');
    let recCard = document.getElementById('manifestReconcileCard');
    if (recList) recList.innerHTML = '';
    if (recCard) recCard.style.display = 'none';

    if (ScannerManager.isCameraActive) ScannerManager.toggleCameraScanner();
    document.getElementById('sessionNoteInput').value = ""; document.getElementById('chkSessionNote').checked = false;
    UIManager.toggleSessionNote();

    const chkPreload = document.getElementById('chkPreloadManifest');
    if (chkPreload) chkPreload.checked = false;

    document.getElementById('screenScanning').style.display = 'none';
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenSummary').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  completeSession(skipConfirm = false) {
    if (!skipConfirm && !confirm("Are you ready to complete this session?\n\nMake sure you have saved or exported your data first. This will close the session and return you to the home screen.")) return;
    
    // Auto-Export Text Log before wiping memory
    if (this.scannedObjects.length > 0 || this.pendingNewItems.length > 0 || this.pendingFieldUpdates.length > 0) {
      AuditManager.exportSessionData('txt');
    }

    // LIVE FEED PUSH: Background log push & mark order completed in Google Sheets
    if (this.googleFeederUrl && !this.googleFeederUrl.includes("YOUR_COPIED")) {
      let payload = {
        action: "COMPLETE_SESSION",
        sessionName: this.currentSessionName,
        orderNum: this.currentOrderNum,
        workflowType: this.currentWorkflowType,
        userName: this.currentUserName,
        uniqueRefs: new Set(this.scannedObjects.map(i => i.ref)).size,
        totalQty: this.scannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0),
        sessionNotes: document.getElementById('sessionNoteInput') ? document.getElementById('sessionNoteInput').value.trim() : ''
      };

      fetch(this.googleFeederUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.warn("Background log push failed:", err));
    }

    this.pendingNewItems = []; this.pendingFieldUpdates = [];
    localStorage.setItem('asp_pending_new_items', JSON.stringify([])); localStorage.setItem('asp_pending_updates', JSON.stringify([]));
    
    // Fix: Destroy manifest discrepancy UI leak
    let recList = document.getElementById('manifestReconcileList');
    let recCard = document.getElementById('manifestReconcileCard');
    if (recList) recList.innerHTML = '';
    if (recCard) recCard.style.display = 'none';

    document.getElementById('sessionNoteInput').value = ""; 
    document.getElementById('chkSessionNote').checked = false;
    UIManager.toggleSessionNote();

    const chkPreload = document.getElementById('chkPreloadManifest');
    if (chkPreload) chkPreload.checked = false;

    document.getElementById('screenSummary').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
    this.isSessionActive = false; 
    this.isManifestEnabled = false;
    localStorage.setItem('asp_session_is_active', 'false'); 
    localStorage.setItem('asp_manifest_enabled', 'false');

    this.saveToArchive('Completed');
  },

  commitStocktake() {
    if (!this.currentWorkflowType.includes('Stocktake')) return;
    
    let noteEl = document.getElementById('sessionNoteInput');
    let chkNote = document.getElementById('chkSessionNote');
    let noteVal = noteEl ? noteEl.value.trim() : '';
    
    // Enforce mandatory note for Full Stocktakes
    if (this.currentWorkflowType === 'Full Stocktake' && (!chkNote.checked || !noteVal)) {
      alert("A mandatory Session Note is required to commit a Full Stocktake (e.g., 'Q3 Inventory Audit'). Please check 'Add Session Note' and provide a reason.");
      return;
    }

    if (!confirm(`Are you sure you want to commit these quantities to the master database?\n\nMode: ${this.currentWorkflowType}\nScanned Items: ${this.scannedObjects.length}`)) return;

    let scannedTotals = {};
    this.scannedObjects.forEach(item => {
      if (!scannedTotals[item.ref]) scannedTotals[item.ref] = 0;
      scannedTotals[item.ref] += item.qty;
    });

    // NEW: CALCULATE VARIANCE
    let varianceData = [];
    let netFinancialImpact = 0;

    DatabaseManager.db.forEach(dbItem => {
      let sku = (dbItem.sku || dbItem.ref || '').toUpperCase();
      let expected = dbItem.onHand || 0;
      let counted = scannedTotals[sku] || 0;
      
      // If it's a Selection stocktake, ignore items we didn't count
      if (this.currentWorkflowType !== 'Full Stocktake' && scannedTotals[sku] === undefined) return;

      let variance = counted - expected;
      if (variance !== 0) {
        let costStr = dbItem.cost && dbItem.cost !== "$0.00" ? dbItem.cost : (dbItem.price || "0");
        let costVal = parseFloat(costStr.replace(/[^0-9.-]+/g,"")) || 0;
        let financialVar = variance * costVal;
        netFinancialImpact += financialVar;
        
        varianceData.push({ ref: sku, desc: dbItem.desc, mfr: dbItem.mfr, expected: expected, counted: counted, variance: variance, financialImpact: financialVar });
      }
    });

    // Apply to DB logic
    if (this.currentWorkflowType === 'Full Stocktake') {
      // Zero out ALL onHand quantities first
      DatabaseManager.db.forEach(dbItem => dbItem.onHand = 0);
    } else {
      // Selection: Zero out ONLY the scanned REFs before applying the new count
      Object.keys(scannedTotals).forEach(ref => {
        let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref);
        if (dbItem) dbItem.onHand = 0;
      });
    }

    // Add the new counts
    Object.keys(scannedTotals).forEach(ref => {
      let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref);
      if (dbItem) {
        dbItem.onHand = (dbItem.onHand || 0) + scannedTotals[ref];
      }
    });

    localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));
    alert("Stocktake successfully committed to the master database!");
    
    // Auto export TXT log, generate Variance PDF, then cleanly complete
    AuditManager.exportSessionData('txt');
    if (varianceData.length > 0) {
      ReportsManager.generateVarianceReportPDF(varianceData, this.currentWorkflowType, netFinancialImpact);
    }
    
    setTimeout(() => { this.completeSession(true); }, 500);
  },

  suspendToBackorder() {
    if (!confirm("Suspend session to Pending Backorder?\n\nThis will export your logs so far and keep the session in the archive to be resumed later.")) return;
    
    // Auto-Export Text Log before wiping memory
    if (this.scannedObjects.length > 0 || this.pendingNewItems.length > 0 || this.pendingFieldUpdates.length > 0) {
      AuditManager.exportSessionData('txt');
    }
    
    this.pendingNewItems = []; this.pendingFieldUpdates = [];
    localStorage.setItem('asp_pending_new_items', JSON.stringify([])); 
    localStorage.setItem('asp_pending_updates', JSON.stringify([]));
    
    // Cleanup UI
    let recList = document.getElementById('manifestReconcileList');
    let recCard = document.getElementById('manifestReconcileCard');
    if (recList) recList.innerHTML = '';
    if (recCard) recCard.style.display = 'none';

    document.getElementById('sessionNoteInput').value = ""; 
    document.getElementById('chkSessionNote').checked = false;
    UIManager.toggleSessionNote();
    const chkPreload = document.getElementById('chkPreloadManifest');
    if (chkPreload) chkPreload.checked = false;

    document.getElementById('screenSummary').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
    
    this.isSessionActive = false; 
    this.isManifestEnabled = false;
    localStorage.setItem('asp_session_is_active', 'false'); 
    localStorage.setItem('asp_manifest_enabled', 'false');

    this.saveToArchive('Pending Backorder');
  },

  // ==========================================
  // SESSION ARCHIVE ENGINE
  // ==========================================
  saveToArchive(status = 'Active') {
    if (!this.sessionId || this.scannedObjects.length === 0) return;
    
    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let sessionObj = {
      id: this.sessionId,
      status: status,
      userName: this.currentUserName,
      sessionName: this.currentSessionName,
      orderNum: this.currentOrderNum,
      workflowType: this.currentWorkflowType,
      dateStr: this.sessionDateStr,
      startStr: this.sessionStartStr,
      manifestEnabled: this.isManifestEnabled,
      expectedManifest: this.expectedManifest,
      scannedObjects: this.scannedObjects,
      pendingNewItems: this.pendingNewItems,
      pendingUpdates: this.pendingFieldUpdates,
      lastUpdated: Date.now()
    };

    let existingIdx = archive.findIndex(s => s.id === this.sessionId);
    if (existingIdx > -1) archive[existingIdx] = sessionObj;
    else archive.unshift(sessionObj);

    // Auto-delete sessions older than 30 days (2592000000 ms)
    let cutoff = Date.now() - 2592000000;
    archive = archive.filter(s => s.lastUpdated > cutoff);
    
    localStorage.setItem('asp_session_archive', JSON.stringify(archive));

    // NEW: Auto-push to Google Sheets if the session is finished!
    if (status === 'Completed') {
      this.pushToCloudArchive(sessionObj);
    }
  },

  renderManifestReconciliation() {
    const card = document.getElementById('manifestReconcileCard');
    const list = document.getElementById('manifestReconcileList');
    if (!card || !list || !this.isManifestEnabled || this.expectedManifest.length === 0) return;

    let scannedMap = {};
    this.scannedObjects.forEach(i => { scannedMap[i.ref] = (scannedMap[i.ref] || 0) + i.qty; });

    let hasDiscrepancy = false;
    let html = '';

    this.expectedManifest.forEach((exp, idx) => {
      let scannedQty = scannedMap[exp.ref] || 0;
      if (scannedQty !== exp.expectedQty) {
        hasDiscrepancy = true;
        html += `
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; background:#fff; padding:8px; border:1px solid #ccc; border-radius:4px;">
            <input type="text" id="recRef_${idx}" value="${exp.ref}" style="flex:2; text-transform:uppercase; font-weight:bold; color:#0277bd;">
            <input type="number" id="recQty_${idx}" value="${exp.expectedQty}" min="1" style="flex:1;">
            <span style="font-size:0.8rem; color:#555; flex:1.5;">Scanned: <strong>${scannedQty}</strong></span>
          </div>
        `;
      }
    });

    if (hasDiscrepancy) {
      card.style.display = 'block';
      list.innerHTML = html;
    } else {
      card.style.display = 'none';
    }
  },

  saveManifestReconciliation() {
    this.expectedManifest.forEach((exp, idx) => {
      let refEl = document.getElementById(`recRef_${idx}`);
      let qtyEl = document.getElementById(`recQty_${idx}`);
      if (refEl && qtyEl) {
        exp.ref = refEl.value.trim().toUpperCase();
        exp.expectedQty = parseInt(qtyEl.value, 10) || 1;
      }
    });
    localStorage.setItem('asp_active_manifest', JSON.stringify(this.expectedManifest));
    alert("Manifest updated! Recalculating session summaries...");
    this.goToSummaryScreen();
  },

  updateScannedItem(index) {
    if (!this.scannedObjects[index]) return;
    
    let qtyEl = document.getElementById(`editQty_${index}`);
    let tagEl = document.getElementById(`editTag_${index}`);
    if (!qtyEl) return;
    
    let newQty = parseInt(qtyEl.value, 10) || 1;
    let newTag = tagEl ? tagEl.value.trim() : '';

    this.scannedObjects[index].qty = newQty;
    this.scannedObjects[index].customerTag = newTag;
    if (newTag) this.scannedObjects[index].actionTag = 'Reserved';

    localStorage.setItem('asp_session_scanned_objects', JSON.stringify(this.scannedObjects));
    this.updateManifestProgressUI();
    this.saveToArchive('Active');
    
    alert(`Updated REF ${this.scannedObjects[index].ref} (Qty: ${newQty}${newTag ? ', Tag: ' + newTag : ''})`);
    AuditManager.updateSessionSummaryView();
    this.renderManifestReconciliation();
    this.renderAdvancedReview();
  },

  deleteScannedItem(index) {
    if (!this.scannedObjects[index]) return;
    let item = this.scannedObjects[index];
    
    if (!confirm(`Delete scanned item run for REF: ${item.ref} (Lot: ${item.lot}, Qty: ${item.qty})?`)) return;

    this.scannedObjects.splice(index, 1);
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify(this.scannedObjects));
    this.updateManifestProgressUI();
    this.saveToArchive('Active');

    AuditManager.updateSessionSummaryView();
    this.renderManifestReconciliation();
    this.renderAdvancedReview();
  },

  openSettings() {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenSettings').style.display = 'block';
  },

  closeSettings() {
    document.getElementById('screenSettings').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  openArchive() {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenArchive').style.display = 'block';
    this.renderArchiveList();
  },

  closeArchive() {
    document.getElementById('screenArchive').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  renderArchiveList() {
    const container = document.getElementById('archiveListContainer');
    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    
    if (archive.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:#555;">No archived sessions found.</div>';
      return;
    }

    let filterVal = document.getElementById('archiveFilter').value;
    let hideCancelled = document.getElementById('chkHideCancelled') ? document.getElementById('chkHideCancelled').checked : false;
    let onlyActive = document.getElementById('chkOnlyActive') ? document.getElementById('chkOnlyActive').checked : false;
    
    let cutoff = 0;
    if (filterVal === 'today') cutoff = Date.now() - (24 * 60 * 60 * 1000);
    else if (filterVal === 'week') cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    else cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);

    let filtered = archive.filter(s => {
      if (s.lastUpdated < cutoff) return false;
      if (hideCancelled && s.status === 'Cancelled') return false;
      if (onlyActive && s.status !== 'Active') return false;
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:#555;">No sessions found matching these filters.</div>`;
      return;
    }

    let html = '';
    filtered.forEach(s => {
      let statusColor = s.status === 'Completed' ? '#2e7d32' : (s.status === 'Cancelled' ? '#d32f2f' : (s.status === 'Active' ? '#0277bd' : '#f57f17'));
      
      let itemsPreview = s.scannedObjects.map(item => `<li>${item.qty}x ${item.ref}</li>`).join('');
      if(!itemsPreview) itemsPreview = '<li>No items scanned</li>';

      html += `
        <div class="audit-card" style="border-left: 5px solid ${statusColor};">
          <div class="flex-between" style="margin-bottom: 6px;">
            <strong style="color:#0277bd; font-size:1.05rem;">${s.sessionName}</strong>
            <span class="badge-info" style="background-color:${statusColor}; color:#fff;">${s.status}</span>
          </div>
          
          <details style="font-size: 0.85rem; color: #555; margin-bottom: 10px;">
            <summary style="cursor:pointer; font-weight:bold; color:#333; margin-bottom:6px;">[+] View Details (${s.scannedObjects.length} Items)</summary>
            <div style="padding-left: 12px; margin-top: 6px; border-left: 2px solid #eee;">
              <div><strong>Date:</strong> ${s.dateStr} | <strong>Start:</strong> ${s.startStr}</div>
              <div><strong>Workflow:</strong> ${s.workflowType}</div>
              <div style="margin-top:6px;"><strong>Scanned Items:</strong></div>
              <ul style="margin:4px 0 0 0; padding-left:16px; max-height:80px; overflow-y:auto;">
                ${itemsPreview}
              </ul>
            </div>
          </details>
          
          <div class="flex-between">
            <button class="btn-small btn-cancel btn-auto" onclick="SessionManager.deleteArchivedSession('${s.id}')">🗑️ Delete</button>
            <button class="btn-action btn-save btn-auto" style="margin:0; padding:6px 12px;" onclick="SessionManager.restoreArchivedSession('${s.id}')">🔄 Restore Session</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  },

  restoreArchivedSession(id) {
    if (!confirm("Restore this session? This will override your current unsaved session if you have one active.")) return;
    
    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let s = archive.find(x => x.id === id);
    if (!s) return;

    this.sessionId = s.id;
    this.isSessionActive = true;
    this.currentUserName = s.userName;
    this.currentSessionName = s.sessionName;
    this.currentOrderNum = s.orderNum;
    this.currentWorkflowType = s.workflowType;
    this.sessionDateStr = s.dateStr;
    this.sessionStartStr = s.startStr;
    this.isManifestEnabled = s.manifestEnabled;
    this.expectedManifest = s.expectedManifest;
    this.scannedObjects = s.scannedObjects;
    this.pendingNewItems = s.pendingNewItems;
    this.pendingFieldUpdates = s.pendingUpdates;

    localStorage.setItem('asp_session_id', this.sessionId);
    localStorage.setItem('asp_session_is_active', 'true');
    localStorage.setItem('asp_user_name', this.currentUserName);
    localStorage.setItem('asp_session_name', this.currentSessionName);
    localStorage.setItem('asp_order_num', this.currentOrderNum);
    localStorage.setItem('asp_workflow_type', this.currentWorkflowType);
    localStorage.setItem('asp_session_date_str', this.sessionDateStr);
    localStorage.setItem('asp_session_start_str', this.sessionStartStr);
    localStorage.setItem('asp_manifest_enabled', this.isManifestEnabled ? 'true' : 'false');
    localStorage.setItem('asp_active_manifest', JSON.stringify(this.expectedManifest));
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify(this.scannedObjects));
    localStorage.setItem('asp_pending_new_items', JSON.stringify(this.pendingNewItems));
    localStorage.setItem('asp_pending_updates', JSON.stringify(this.pendingFieldUpdates));

    this.updateHeaderBanners();
    document.getElementById('screenArchive').style.display = 'none';
    this.goToSummaryScreen();
  },

  deleteArchivedSession(id) {
    if (!confirm("Are you sure you want to permanently delete this session from the archive?")) return;
    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    archive = archive.filter(s => s.id !== id);
    localStorage.setItem('asp_session_archive', JSON.stringify(archive));
    this.renderArchiveList();
  }
};