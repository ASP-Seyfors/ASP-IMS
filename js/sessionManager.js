/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/sessionManager.js
 * Description: Core session lifecycle orchestrator.
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
  currentArchiveTab: 'local',

  // PROXY ROUTERS to prevent breaking downstream files during refactor
  getActiveArchiveUrl() { return ApiManager.getActiveArchiveUrl(); },
  getActiveFeederUrl() { return ApiManager.getActiveFeederUrl(); },
  get cloudArchiveUrl() { return ApiManager.cloudArchiveUrl; },
  get googleFeederUrl() { return ApiManager.googleFeederUrl; },

  applyTestingModeVisuals(isTestActive) {
    if (isTestActive) {
      document.body.style.backgroundColor = '#fff3e0'; 
      document.querySelectorAll('.card').forEach(card => {
        card.style.borderColor = '#ff9800';
        card.style.backgroundColor = '#e1f5fe'; 
      });
    } else {
      document.body.style.backgroundColor = '';
      document.querySelectorAll('.card').forEach(card => {
        card.style.borderColor = '';
        card.style.backgroundColor = '';
      });
    }
  },

  async pushToCloudArchive(sessionObj) {
    if (!this.getActiveArchiveUrl()) return; 
    let chunks = this.splitPayloadIfNeeded(sessionObj);
    for (let chunk of chunks) {
      let payload = { action: "ARCHIVE_SESSION", payload: chunk };
      try {
        await fetch(this.getActiveArchiveUrl(), {
          method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
      } catch(err) { console.warn("Cloud Archive push failed:", err); }
    }
  },

  splitPayloadIfNeeded(sessionObj) {
    const MAX_CHARS = 45000;
    let fullString = JSON.stringify(sessionObj);
    if (fullString.length <= MAX_CHARS) return [sessionObj];

    let scansByRef = {};
    sessionObj.scannedObjects.forEach(scan => {
      let ref = scan.ref || 'UNKNOWN';
      if (!scansByRef[ref]) scansByRef[ref] = [];
      scansByRef[ref].push(scan);
    });

    let chunks = []; let currentScans = [];
    let baseSession = { ...sessionObj, scannedObjects: [] };
    let currentSize = JSON.stringify(baseSession).length + 50;

    for (let ref in scansByRef) {
      let refScans = scansByRef[ref];
      let refStrLen = JSON.stringify(refScans).length;
      if (currentSize + refStrLen > MAX_CHARS && currentScans.length > 0) {
        chunks.push(currentScans);
        currentScans = [];
        currentSize = JSON.stringify(baseSession).length + 50;
      }
      currentScans.push(...refScans);
      currentSize += refStrLen + 1;
    }
    if (currentScans.length > 0) chunks.push(currentScans);

    let splitSessions = [];
    let baseId = parseInt(sessionObj.id, 10);
    if (isNaN(baseId)) baseId = Date.now();

    for (let i = 0; i < chunks.length; i++) {
      let newSess = JSON.parse(JSON.stringify(baseSession));
      newSess.scannedObjects = chunks[i];
      newSess.sessionName = `${sessionObj.sessionName} (Part ${i + 1} of ${chunks.length})`;
      newSess.id = String(baseId + i);
      if (i > 0 && newSess.workflowType === 'Full Stocktake') newSess.workflowType = 'Selection Stocktake';
      splitSessions.push(newSess);
    }
    return splitSessions;
  },

  switchArchiveTab(tabName) {
    this.currentArchiveTab = tabName;
    let btnLocal = document.getElementById('tabLocalArchive');
    let btnCloud = document.getElementById('tabCloudArchive');
    
    if (tabName === 'local') {
      btnLocal.style.cssText = 'background-color:#0277bd; color:#fff; border:1px solid #0277bd;';
      btnCloud.style.cssText = 'background-color:#f5f5f5; color:#555; border:1px solid #ccc;';
    } else {
      btnCloud.style.cssText = 'background-color:#0277bd; color:#fff; border:1px solid #0277bd;';
      btnLocal.style.cssText = 'background-color:#f5f5f5; color:#555; border:1px solid #ccc;';
      let dir = JSON.parse(localStorage.getItem('asp_cloud_directory')) || [];
      if (dir.length === 0) this.syncCloudArchive();
    }
    this.renderArchiveList();
  },

  async syncAllocationsToCloud() {
    if (sessionStorage.getItem('asp_allocations_verified') !== 'true') return;
    let allocationsObj = JSON.parse(localStorage.getItem('asp_allocations') || '{}');
    let payload = { action: "SYNC_ALLOCATIONS", allocations: allocationsObj, aliases: DatabaseManager.customerAliases || {} };
    try {
      await fetch(this.getActiveArchiveUrl(), { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    } catch (err) { console.warn("Allocation sync failed:", err); }
  },

  async fetchAllocationsFromCloud() {
    try {
      let res = await fetch(`${this.getActiveArchiveUrl()}?action=GET_ALLOCATIONS`);
      let data = await res.json();
      if (data.status === "success" && data.allocations) {
        let allocMap = {};
        data.allocations.forEach(a => {
          let cleanCustName = DatabaseManager.resolveAlias(String(a.customerName).trim(), 'customer').toUpperCase(); 
          if (!allocMap[cleanCustName]) allocMap[cleanCustName] = {};
          if (!allocMap[cleanCustName][a.ref]) allocMap[cleanCustName][a.ref] = { qty: 0, details: [] };
          let cleanExp = typeof a.exp === 'string' && a.exp.includes('T') ? a.exp.split('T')[0] : (a.exp || 'NO_EXP');
          let safeQty = parseInt(a.qty, 10) || 0;
          allocMap[cleanCustName][a.ref].qty += safeQty;
          allocMap[cleanCustName][a.ref].details.push({ lot: a.lot, exp: cleanExp, qty: safeQty, orderNum: a.orderNum, sessionId: a.sessionId });
        });
        localStorage.setItem('asp_allocations', JSON.stringify(allocMap));
        sessionStorage.setItem('asp_allocations_verified', 'true');
      } else throw new Error("Invalid payload.");
    } catch (err) { sessionStorage.removeItem('asp_allocations_verified'); }
  },

  async syncCloudArchive(event, silent = false) {
    const btn = event ? event.target : null;
    const originalText = btn ? btn.textContent : "☁️ Sync Directory";
    if (btn) { btn.textContent = "⏳ Syncing..."; btn.disabled = true; btn.style.opacity = "0.7"; }
    try {
      let res = await fetch(`${this.getActiveArchiveUrl()}?action=SYNC_DIRECTORY&t=${Date.now()}`);
      let text = await res.text();
      let data = JSON.parse(text);
      if (data.status === "success" && data.archive) {
        localStorage.setItem('asp_cloud_directory', JSON.stringify(data.archive));
        if (data.db && typeof DatabaseManager !== 'undefined') DatabaseManager.importCloudDatabase(data.db);
        await this.fetchAllocationsFromCloud();
        if (this.currentArchiveTab === 'cloud') this.renderArchiveList();
        if (!silent) alert(`Cloud Directory Synced! Found ${data.archive.length} total sessions in the vault.`);
      } else alert("Sync failed.");
    } catch (err) { if (!silent) alert("Error connecting: " + err.message);
    } finally { if (btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; } }
  },

  async pushLegacySessionsToCloud(event, silent = false) {
    const btn = event ? event.target : null;
    const originalText = btn ? btn.textContent : "⬆️ Upload Local History";
    if (btn) { btn.textContent = "⏳ Uploading..."; btn.disabled = true; btn.style.opacity = "0.7"; }

    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let completedSessions = archive.filter(s => s.status === 'Completed' && !s.isSynced);
    if (completedSessions.length === 0) {
      if (btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; }
      return;
    }
    for (let session of completedSessions) {
      await this.pushToCloudArchive(session);
      session.isSynced = true;
    }
    localStorage.setItem('asp_session_archive', JSON.stringify(archive));
    if (btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; }
  },

  async offloadAndPurgeHistory(event) {
    const btn = event ? event.target : null;
    const originalText = btn ? btn.textContent : "🧹 Offload & Purge Local History";
    if (btn) { btn.textContent = "⏳ Processing..."; btn.disabled = true; btn.style.opacity = "0.7"; }
    try {
      await this.pushLegacySessionsToCloud(null, true);
      let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
      let retainedArchive = archive.filter(s => s.status === 'Pending');
      localStorage.setItem('asp_session_archive', JSON.stringify(retainedArchive));
      if (typeof UIManager !== 'undefined' && UIManager.evaluateSyncIndicator) UIManager.evaluateSyncIndicator();
      alert(`✅ Offload Complete! Devices storage is now optimized.`);
    } catch (err) { alert("Error: " + err.message);
    } finally { if (btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; } }
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
        let spacer1 = document.createElement('option'); spacer1.disabled = true; spacer1.text = " ";
        sel.add(spacer1);
      }
    });

    if (typeof UIManager !== 'undefined' && UIManager.loadFontPreference) UIManager.loadFontPreference();
    QboManager.bindOrderInputListener(); 
  },

  startStocktakeSession(mode) {
    let uName = document.getElementById('userNameInput').value.trim();
    if (typeof AuthManager !== 'undefined' && AuthManager.isWorkstation) {
        let sel = document.getElementById('userNameSelect');
        uName = sel ? sel.value : "";
        if (!uName) { alert("Select User Name before starting a session."); return; }
    }
    
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
    this.expectedManifest = [];
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));
    localStorage.setItem('asp_active_manifest', JSON.stringify([]));

    this.updateHeaderBanners();
    ManifestManager.updateManifestProgressUI();
    
    if (typeof UIManager !== 'undefined') {
       if (UIManager.closeStocktakeModal) UIManager.closeStocktakeModal();
       UIManager.lockCheatCodes(); 
    }
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';

    let destRow = document.getElementById('rowItemDestination');
    if (destRow) destRow.style.display = 'flex';
    this.currentItemAction = 'Inventory';
    ScannerManager.resetScanLinesAndFields();
  },

  startSession() {
    try {
      let uName = document.getElementById('userNameInput').value.trim();
      if (typeof AuthManager !== 'undefined' && AuthManager.isWorkstation) {
          let sel = document.getElementById('userNameSelect');
          uName = sel ? sel.value : "";
          if (!uName) { alert("Select User Name before starting a session."); return; }
      }
      
      const typeRadio = document.querySelector('input[name="sessionType"]:checked');
      const type = typeRadio ? typeRadio.value : 'Shipment';
      
      let supplier = document.getElementById('supplierSelect') ? document.getElementById('supplierSelect').value.trim() : '';
      let customer = document.getElementById('customerSelect') ? document.getElementById('customerSelect').value.trim() : '';
      
      if (supplier && typeof DatabaseManager !== 'undefined') supplier = DatabaseManager.resolveAlias(supplier, 'supplier');
      if (customer && typeof DatabaseManager !== 'undefined') customer = DatabaseManager.resolveAlias(customer, 'customer');

      let partner = type === 'Shipment' ? supplier : customer;
      const oDetails = document.getElementById('orderDetailsInput').value.trim();
      const wType = type === 'Shipment' ? 'Receiving & Reserving' : document.getElementById('workflowTypeSelect').value;
      let chkManifest = document.getElementById('chkPreloadManifest').checked;

      if (!partner || partner === '+ Add Supplier' || partner === '+ Add Customer') {
        alert("Please select a valid Supplier or Customer.");
        return;
      }

      let baseSessName = document.getElementById('sessionNameInput') ? document.getElementById('sessionNameInput').value.trim() : '';
      if (baseSessName && typeof DatabaseManager !== 'undefined') {
          let possibleCust = DatabaseManager.resolveAlias(baseSessName, 'customer');
          let possibleSup = DatabaseManager.resolveAlias(baseSessName, 'supplier');
          if (possibleCust.toUpperCase() !== baseSessName.toUpperCase()) baseSessName = possibleCust;
          else if (possibleSup.toUpperCase() !== baseSessName.toUpperCase()) baseSessName = possibleSup;
      }

      let preloadedAllocations = [];
      if (type === 'Order' && wType === 'Picking & Packing') {
          let currentAllocations = JSON.parse(localStorage.getItem('asp_allocations')) || {};
          let baseTag = partner.toUpperCase().trim();
          let searchTag = baseTag + (oDetails ? ` - ${oDetails.toUpperCase().trim()}` : '');
          
          let targetAllocation = currentAllocations[searchTag] ? currentAllocations[searchTag] : currentAllocations[baseTag];

          if (targetAllocation && Object.keys(targetAllocation).length > 0) {
              let itemCount = Object.keys(targetAllocation).length;
              let totalUnits = Object.values(targetAllocation).reduce((a, b) => a + (typeof b === 'object' ? (b.qty || 0) : b), 0);
              
              if (confirm(`Targeted Pick & Pack Available:\n\n${partner} has ${totalUnits} units currently sitting in Reserve.\n\nDo you want to pre-load these items into your Pick List manifest?`)) {
                  chkManifest = true;
                  for (let ref in targetAllocation) {
                      let rawVal = targetAllocation[ref];
                      let qty = typeof rawVal === 'object' ? (rawVal.qty || 0) : rawVal;
                      preloadedAllocations.push({ ref: ref, expectedQty: qty, isReserved: true, customerTag: searchTag, reservedQty: qty, allocations: [{ customerTag: searchTag, reservedQty: qty }] });
                  }
              }
          }
      }

      this.currentUserName = uName || "N/A";
      this.currentSessionName = baseSessName ? baseSessName : partner + (oDetails ? ` (${oDetails})` : '');
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
      if (typeof UIManager !== 'undefined') UIManager.lockCheatCodes(); 
      document.getElementById('screenSetup').style.display = 'none';

      if (this.isManifestEnabled) {
        const container = document.getElementById('manifestRowsContainer');
        if (container) container.innerHTML = '';
        
        let isPreloaded = false;
        if (preloadedAllocations.length > 0) {
            this.expectedManifest = preloadedAllocations;
            isPreloaded = true;
        }

        if (this.expectedManifest && this.expectedManifest.length > 0) {
          this.expectedManifest.forEach(item => {
            let hasAlloc = item.allocations && item.allocations.length > 0;
            let tagVal = hasAlloc ? item.allocations[0].customerTag : (item.customerTag || '');
            let resQtyVal = hasAlloc ? item.allocations[0].reservedQty : (item.reservedQty || item.expectedQty || 1);
            ManifestManager.addManifestRow(item.ref || item.sku || '', item.expectedQty || item.qty || 1, hasAlloc, tagVal, resQtyVal);
          });
        } else {
          ManifestManager.addManifestRow();
        }
        
        if (isPreloaded) {
            localStorage.setItem('asp_active_manifest', JSON.stringify(this.expectedManifest));
            document.getElementById('screenScanning').style.display = 'block';
            ManifestManager.updateManifestProgressUI();
        } else {
            document.getElementById('screenManifestEntry').style.display = 'block';
        }
      } else {
        this.expectedManifest = [];
        localStorage.setItem('asp_active_manifest', JSON.stringify([]));
        document.getElementById('screenScanning').style.display = 'block';
        ManifestManager.updateManifestProgressUI();
      }

      let destRow = document.getElementById('rowItemDestination');
      let tagRow = document.getElementById('rowCustomerTag');
      let chkBundle = document.getElementById('chkIsBundle'); 
      let bundleWrapper = chkBundle ? chkBundle.parentElement : null;

      if (this.currentWorkflowType.includes('Receiving & Reserving')) {
        if (destRow) destRow.style.display = 'flex';
        if (tagRow) tagRow.style.display = this.currentItemAction === 'Reserved' ? 'flex' : 'none';
        if (bundleWrapper) bundleWrapper.style.display = 'block'; 
      } else if (this.currentWorkflowType.includes('Reserving')) {
        if (destRow) destRow.style.display = 'none';
        if (tagRow) tagRow.style.display = 'none';
        if (bundleWrapper) bundleWrapper.style.display = 'none';
        this.currentItemAction = 'Reserved';
      } else if (this.currentWorkflowType.includes('Packing')) {
        if (destRow) destRow.style.display = 'none';
        if (tagRow) tagRow.style.display = 'none'; 
        if (bundleWrapper) bundleWrapper.style.display = 'none'; 
        this.currentItemAction = 'Pack & Ship';
      } else {
        if (destRow) destRow.style.display = 'none';
        if (tagRow) tagRow.style.display = 'none';
        if (bundleWrapper) bundleWrapper.style.display = 'none'; 
        this.currentItemAction = 'Inventory';
      }

      ScannerManager.resetScanLinesAndFields();

    } catch (err) {
      alert("Encountered an issue starting session: " + err.message);
      document.getElementById('screenSetup').style.display = 'block';
    }
  },

  editOrderNumber() {
    let newOrderNum = prompt("Enter new Order/Invoice number (leave blank to clear):", this.currentOrderNum);
    if (newOrderNum !== null) {
      this.currentOrderNum = newOrderNum.trim();
      let baseCustomer = this.currentSessionName.split(' (')[0].trim();
      this.currentSessionName = baseCustomer + (this.currentOrderNum ? ` (${this.currentOrderNum})` : '');
      
      localStorage.setItem('asp_order_num', this.currentOrderNum);
      localStorage.setItem('asp_session_name', this.currentSessionName);
      this.updateHeaderBanners();
    }
  },

  updateHeaderBanners() {
    let editBtn = ` <button class="btn-small" style="background:transparent; border:none; color:#0277bd; cursor:pointer; font-size:1rem; padding:0; margin-left:8px;" onclick="SessionManager.editOrderNumber()" title="Edit Order Number">✏️</button>`;
    
    ['hdrTitle', 'hdrTitleRev', 'hdrTitleSum'].forEach(id => { 
      let el = document.getElementById(id);
      if(el) el.innerHTML = this.currentSessionName + editBtn; 
    });
    
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

  confirmFieldUpdate(field) {
    if (!this.currentMatchedItem) return;
    if (field === 'gtin' && this.pendingUpdates['gtin']) {
      this.currentMatchedItem.gtin = this.pendingUpdates['gtin'];
      alert(`Database updated: GTIN linked to REF!`);
    } else if (field === 'mfr') {
      let selectedMfr = document.getElementById('vendorSelect').value;
      this.currentMatchedItem.mfr = selectedMfr;
      alert(`Database updated: Manufacturer updated for REF!`);
    } else if (field === 'shelf' && this.pendingUpdates['shelf']) {
      // ✨ NEW: Handle Shelf Updates
      this.currentMatchedItem.shelf = this.pendingUpdates['shelf'];
      alert(`Database updated: Shelf Location updated for REF!`);
    }
    
    // ✨ FIX: Determine the actual new value being saved
    let updateValue = "";
    if (field === 'gtin') updateValue = this.pendingUpdates['gtin'];
    else if (field === 'mfr') updateValue = document.getElementById('vendorSelect').value;
    else if (field === 'shelf') updateValue = this.pendingUpdates['shelf'];
    
    let displayField = field === 'gtin' ? 'GTIN' : (field === 'mfr' ? 'Manufacturer' : 'Shelf Location');

    this.pendingFieldUpdates.push({
      ref: DatabaseManager.getItemSku(this.currentMatchedItem),
      field: displayField,
      newValue: updateValue,
      timestamp: new Date().toLocaleString()
    });
    localStorage.setItem('asp_pending_updates', JSON.stringify(this.pendingFieldUpdates));
    localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));
    UIManager.hideAllConfirmButtons();
  }, 

  goToReviewStage() {
    let expField = document.getElementById('expInput');
    if (expField && expField.value.trim() !== "" && !document.getElementById('chkNaExp').checked) UIManager.formatExpDate(expField);
    
    const ref = document.getElementById('refInput').value.trim().toUpperCase();
    if (!ref) { alert("Please enter or scan a REF/SKU before continuing."); return; }
    
    const gtin = document.getElementById('gtinInput').value.trim();
    const lot = document.getElementById('lotInput').value.trim().toUpperCase();
    const exp = document.getElementById('expInput').value.trim();
    const vendor = document.getElementById('vendorSelect').value;
    const qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
    const shelf = document.getElementById('shelfInput') ? document.getElementById('shelfInput').value.trim().toUpperCase() : ''; // ✨ NEW

    const custVal = document.getElementById('itemCustomerSelect') ? document.getElementById('itemCustomerSelect').value : '';
    const ordVal = document.getElementById('itemOrderNumInput') ? document.getElementById('itemOrderNumInput').value.trim() : '';
    const cTag = custVal + (ordVal ? ` - ${ordVal}` : '');
    const iNote = document.getElementById('itemNoteInput') ? document.getElementById('itemNoteInput').value.trim() : '';

    const refProgRow = document.getElementById('revRefProgressRow');
    const totalProgRow = document.getElementById('revTotalProgressRow');
    const refProgText = document.getElementById('revRefProgress');
    const totalProgText = document.getElementById('revTotalProgress');

    if (this.isManifestEnabled && this.expectedManifest.length > 0) {
      if (refProgRow) refProgRow.style.display = 'flex';
      if (totalProgRow) totalProgRow.style.display = 'flex';
      
      let totalExpectedForRef = this.expectedManifest.filter(i => i.ref === ref).reduce((acc, curr) => acc + curr.expectedQty, 0);
      let scannedRefQtySoFar = this.scannedObjects.filter(i => i.ref === ref).reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
      let newTotalScannedForRef = scannedRefQtySoFar + qty;
      
      if (refProgText) {
        if (totalExpectedForRef > 0) refProgText.textContent = `${newTotalScannedForRef} Scanned / ${totalExpectedForRef} Expected`;
        else refProgText.innerHTML = `<span class="badge-info badge-alert">⚠️ Unexpected Item</span>`;
      }
      let totalScannedOverall = this.scannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0) + qty;
      let totalExpectedOverall = this.expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);
      if (totalProgText) totalProgText.textContent = `${totalScannedOverall} / ${totalExpectedOverall} Total Order Items`;
    } else {
      if (refProgRow) refProgRow.style.display = 'none';
      if (totalProgRow) totalProgRow.style.display = 'none';
    }

    if (document.getElementById('revRef')) document.getElementById('revRef').textContent = ref;
    if (document.getElementById('revGtin')) document.getElementById('revGtin').textContent = gtin || '--';
    if (document.getElementById('revLot')) document.getElementById('revLot').textContent = lot || '--';
    if (document.getElementById('revExp')) document.getElementById('revExp').textContent = exp || '--';
    if (document.getElementById('revMfr')) document.getElementById('revMfr').textContent = vendor;
    if (document.getElementById('revShelf')) document.getElementById('revShelf').textContent = shelf || '--'; // ✨ NEW
    if (document.getElementById('revQty')) document.getElementById('revQty').textContent = qty;

    if (document.getElementById('revItemNoteRow')) {
      document.getElementById('revItemNoteRow').style.display = iNote ? 'flex' : 'none';
      if (document.getElementById('revItemNote')) document.getElementById('revItemNote').textContent = ' ' + iNote;
    }

    if (document.getElementById('revDesc')) document.getElementById('revDesc').textContent = DatabaseManager.getItemDesc(this.currentMatchedItem) || "Navigate to vendor website.";
    if (document.getElementById('revPrice')) document.getElementById('revPrice').textContent = (this.currentMatchedItem && this.currentMatchedItem.price) ? this.currentMatchedItem.price : "$0.00";
    if (document.getElementById('revAction')) document.getElementById('revAction').textContent = this.currentItemAction;
    if (document.getElementById('revActionRow')) document.getElementById('revActionRow').style.display = this.currentWorkflowType.includes('Receiving & Reserving') ? 'flex' : 'none';
    
    let tagRow = document.getElementById('rowCustomerTag');
    let revTagRow = document.getElementById('revCustomerTagRow');
    if (tagRow && tagRow.style.display !== 'none' && revTagRow) {
      revTagRow.style.display = 'flex'; 
      if (document.getElementById('revCustomerTag')) document.getElementById('revCustomerTag').textContent = ' ' + (cTag || 'NONE');
    } else if (revTagRow) { revTagRow.style.display = 'none'; }

    let diffBanner = document.getElementById('gtinDiffBanner');
    let btnGtin = document.getElementById('btnConfirmGtin');
    if (this.currentMatchedItem && gtin && gtin !== "N/A" && this.currentMatchedItem.gtin !== gtin) {
      this.pendingUpdates['gtin'] = gtin;
      if (btnGtin) btnGtin.style.display = 'inline-block';
      if (diffBanner) {
        diffBanner.textContent = this.currentMatchedItem.gtin ? `⚠️ Replace Saved GTIN (${this.currentMatchedItem.gtin})?` : `[Link New GTIN]`;
        diffBanner.style.display = 'block';
      }
    } else {
      if (btnGtin) btnGtin.style.display = 'none';
      if (diffBanner) diffBanner.style.display = 'none';
    }

    let btnMfr = document.getElementById('btnConfirmMfr');
    if (btnMfr) btnMfr.style.display = (this.currentMatchedItem && DatabaseManager.getItemVendor(this.currentMatchedItem).toLowerCase() !== vendor.toLowerCase()) ? 'inline-block' : 'none';

    // ✨ FIX: Force both variables to be uppercase strings to prevent false mismatches
    let btnShelf = document.getElementById('btnConfirmShelf');
    let dbShelf = this.currentMatchedItem ? String(this.currentMatchedItem.shelf || "").toUpperCase().trim() : "";
    let uiShelf = String(shelf || "").toUpperCase().trim();
    
    if (this.currentMatchedItem && uiShelf && dbShelf !== uiShelf) {
        this.pendingUpdates['shelf'] = shelf;
        if (btnShelf) btnShelf.style.display = 'inline-block';
    } else {
        if (btnShelf) btnShelf.style.display = 'none';
    }

    // ✨ NEW: Auto-Check the Bundle box if this item is a known bundle!
    if (this.currentMatchedItem && this.currentMatchedItem.parentRef && parseInt(this.currentMatchedItem.uomMult, 10) > 1) {
        let chkBundle = document.getElementById('chkIsBundle');
        let rowBundleData = document.getElementById('rowBundleData');
        if (chkBundle && rowBundleData) {
            chkBundle.checked = true;
            rowBundleData.style.display = 'flex';
            document.getElementById('bundleParentRef').value = this.currentMatchedItem.parentRef;
            document.getElementById('bundleMult').value = this.currentMatchedItem.uomMult;
        }
    }

    document.getElementById('screenScanning').style.display = 'none';
    document.getElementById('screenReview').style.display = 'block';
  },

  returnToEdit() {
    let bundleChk = document.getElementById('chkIsBundle');
    let bundleRow = document.getElementById('rowBundleData');
    if (bundleChk) bundleChk.checked = false;
    if (bundleRow) bundleRow.style.display = 'none';
    if (document.getElementById('bundleParentRef')) document.getElementById('bundleParentRef').value = '';
    if (document.getElementById('bundleMult')) document.getElementById('bundleMult').value = '';

    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
  },

  cancelScannedItem() {
    if (confirm("Are you sure you want to discard this scanned item?")) {
      ScannerManager.resetScanLinesAndFields();
      this.returnToEdit();
    }
  },

  saveItemLog(ignoreOverpack = false) {
        let rawGtin = document.getElementById('gtinInput').value.trim();
        if (rawGtin.toUpperCase() === "N/A" || rawGtin.toUpperCase() === "NA") rawGtin = "";
        
        let ref = document.getElementById('refInput').value.trim().toUpperCase();
        let lot = document.getElementById('lotInput').value.trim().toUpperCase();
        if (lot === "N/A" || lot === "NA" || lot === "NO_LOT") lot = "";
        
        let exp = document.getElementById('expInput').value.trim();
        if (exp.toUpperCase() === "N/A" || exp.toUpperCase() === "NA" || exp === "NO_EXP") exp = "";
        
        const vendor = document.getElementById('vendorSelect').value;
        let qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
        
        let itemCust = document.getElementById('itemCustomerSelect') ? document.getElementById('itemCustomerSelect').value.trim() : '';
        const itemOrder = document.getElementById('itemOrderNumInput') ? document.getElementById('itemOrderNumInput').value.trim() : '';
        const iNote = document.getElementById('itemNoteInput') ? document.getElementById('itemNoteInput').value.trim() : '';

        if (itemCust) {
            let upperTag = itemCust.toUpperCase();
            let masterCustList = DatabaseManager.dbRaw && DatabaseManager.dbRaw.customers ? DatabaseManager.dbRaw.customers : [];
            let matchedCust = masterCustList.find(c => String(c).toUpperCase().trim() === upperTag);
            if (matchedCust) itemCust = matchedCust; 
        }

    let cTag = itemCust.trim();
    if (cTag && typeof DatabaseManager !== 'undefined') cTag = DatabaseManager.resolveAlias(cTag, 'customer');

    let matchedDbItem = InventoryEngine.lookupAndNormalize(ref, rawGtin, DatabaseManager.db);
    
    if (!matchedDbItem) {
      let pendingMatch = this.pendingNewItems.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase());
      if (pendingMatch) matchedDbItem = pendingMatch; 
    }

    let uomResult = InventoryEngine.calculateUOM(matchedDbItem, qty, ref);
    if (matchedDbItem && uomResult.trueRef !== matchedDbItem.sku && uomResult.trueRef !== matchedDbItem.ref) {
      if (typeof UIManager !== 'undefined') UIManager.showCustomAlert("UOM Conversion", `Box Barcode Detected. Converted to ${uomResult.trueQty} individual units of ${uomResult.trueRef}.`);
      rawGtin = ""; 
      matchedDbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === uomResult.trueRef);
      if (!matchedDbItem) matchedDbItem = this.pendingNewItems.find(i => (i.sku || i.ref || '').toUpperCase() === uomResult.trueRef);
    }

    ref = uomResult.trueRef;
    qty = uomResult.trueQty;

    let isNewItem = !matchedDbItem;
    let pRef = "";
    let uMult = 1;

    if (isNewItem) {
       let isOutbound = this.currentWorkflowType && (this.currentWorkflowType.toUpperCase().includes('ORDER') || this.currentWorkflowType.toUpperCase().includes('PACK'));
       if (isOutbound) {
           UIManager.showCustomAlert("Action Blocked", `You are packing an outbound order, but barcode ${ref} doesn't exist.`);
           return;
       }

       let bundleChk = document.getElementById('chkIsBundle');
       let isBundle = bundleChk && bundleChk.checked;
       
       if (isBundle) {
           pRef = document.getElementById('bundleParentRef').value.trim().toUpperCase();
           uMult = parseInt(document.getElementById('bundleMult').value, 10) || 1;
           if (!pRef || uMult <= 1 || pRef === ref) {
               UIManager.showCustomAlert("Bundle Error", "Please provide a valid Parent REF.");
               return;
           }
       }

       if (!confirm(`⚠️ UNRECOGNIZED REF DETECTED ⚠️\n\nThe REF/SKU "${ref}" does not exist in the master database.\n\nAre you sure you want to create a BRAND NEW item?`)) return;

       if (!this.pendingNewItems.find(i => i.ref === ref)) {
           this.pendingNewItems.push({
               ref: ref, gtin: rawGtin, mfr: vendor, price: "$0.00", cost: "$0.00",
               onHand: 0, reservedQty: 0, availableQty: 0,
               onRevMed: "FALSE", revMedPrice: "", onDotMed: "FALSE", dotMedPrice: "",
               syncedThrive: "FALSE", syncedShopify: "FALSE",
               desc: "Navigate to vendor website for item description.", 
               category: "General", shopifyCategory: "Medical Supplies", status: "ACTIVE",
               parentRef: pRef, uomMult: uMult, shelf: document.getElementById('shelfInput') ? document.getElementById('shelfInput').value.trim().toUpperCase() : "" // ✨ NEW
           });
       }

       if (pRef && uMult > 1) {
           ref = pRef;
           qty = qty * uMult;
           matchedDbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === pRef);
           if (!matchedDbItem && !this.pendingNewItems.find(i => i.ref === pRef)) {
               this.pendingNewItems.push({
                   ref: pRef, gtin: "", mfr: vendor, price: "$0.00", cost: "$0.00",
                   onHand: 0, reservedQty: 0, availableQty: 0,
                   onRevMed: "FALSE", revMedPrice: "", onDotMed: "FALSE", dotMedPrice: "",
                   syncedThrive: "FALSE", syncedShopify: "FALSE",
                   desc: "Navigate to vendor website for item description.", 
                   category: "General", shopifyCategory: "Medical Supplies", status: "ACTIVE",
                   parentRef: "", uomMult: 1, shelf: document.getElementById('shelfInput') ? document.getElementById('shelfInput').value.trim().toUpperCase() : "" // ✨ NEW
               });
           }
       }
       localStorage.setItem('asp_pending_new_items', JSON.stringify(this.pendingNewItems));
    }

    let effectiveTag = this.currentItemAction;
    if (!this.currentWorkflowType.includes('Receiving & Reserving') && !this.currentWorkflowType.includes('Stocktake')) {
      if (this.currentWorkflowType.includes('Reserving')) effectiveTag = 'Reserved';
      else if (this.currentWorkflowType.includes('Packing')) effectiveTag = 'Pack & Ship';
      else if (this.currentWorkflowType.includes('Un-Reserve')) effectiveTag = 'Un-Reserve';
      else effectiveTag = 'Inventory';
    }

    let finalCustomerTag = cTag;
    let finalOrderNum = itemOrder;

    if (!this.currentWorkflowType.includes('Receiving & Reserving')) {
      let baseCustomer = this.currentSessionName.split('(')[0].trim();
      if (!finalCustomerTag) finalCustomerTag = baseCustomer;
      if (!finalOrderNum) finalOrderNum = this.currentOrderNum;
    }
    
    if (finalCustomerTag.toUpperCase().trim() === "ASP DAMAGED INVENTORY" && iNote) finalOrderNum = iNote;

    let cTagCombined = finalCustomerTag + (finalOrderNum ? ` - ${finalOrderNum}` : '');
    let bypassOverpackWarning = ignoreOverpack || !this.isManifestEnabled;

    let alreadyScannedQty = this.scannedObjects
        .filter(i => i.ref === ref && i.actionTag === effectiveTag)
        .reduce((acc, curr) => acc + curr.qty, 0);

    try {
      let currentAllocations = JSON.parse(localStorage.getItem('asp_allocations')) || {};
      InventoryEngine.validateAvailability(ref, qty + alreadyScannedQty, effectiveTag, DatabaseManager.db, cTagCombined, currentAllocations, bypassOverpackWarning, this.currentWorkflowType);
    } catch (error) {
      if (error.message.startsWith('OVERPACK_WARNING:')) {
        let friendlyMsg = `Item isn't on original reserve list or exceeds expected qty.\n\nDo you want to pull this from general inventory and add it anyway?`;
        UIManager.showCustomConfirm("📦 Extra Item Detected", friendlyMsg, () => { this.saveItemLog(true); });
        return; 
      } else {
        UIManager.showCustomAlert("Inventory Error", error.message, true);
        return; 
      }
    }

    const desc = DatabaseManager.getItemDesc(matchedDbItem) || "Navigate to vendor website for item description.";
    const price = (matchedDbItem && matchedDbItem.price) ? matchedDbItem.price : "$0.00";
        
    let rawBarcodesGathered = [];
    for (let i = 1; i <= 4; i++) {
      let val = document.getElementById(`rawScan${i}`).value.trim();
      if (val) rawBarcodesGathered.push(val.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, ''));
    }

    if (this.currentMatchedItem && rawGtin && rawGtin !== "N/A" && !this.currentMatchedItem.gtin) {
      this.currentMatchedItem.gtin = rawGtin;
      let dbMatch = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase());
      if (dbMatch) dbMatch.gtin = rawGtin;
      localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));
    }

    this.scannedObjects.push({
      actionTag: effectiveTag,
      gtin: rawGtin || (this.currentMatchedItem ? this.currentMatchedItem.gtin : ''),
      ref: ref,
      lot: lot || 'NO_LOT',
      // ✨ NEW: Tell the app to grab the version box data and save it!
      version: document.getElementById('verInput') ? document.getElementById('verInput').value.trim() : "",
      exp: exp || 'NO_EXP',
      mfr: vendor,
      desc: desc,
      price: price,
      qty: qty,
      rawScanLines: rawBarcodesGathered,
      isNew: isNewItem, 
      customerTag: (effectiveTag === 'Reserved' || effectiveTag === 'Pack & Ship' || effectiveTag === 'Un-Reserve' ? cTagCombined : ''),
      orderNum: (effectiveTag === 'Reserved' || effectiveTag === 'Pack & Ship' || effectiveTag === 'Un-Reserve' ? finalOrderNum : ''),
      sessionId: this.sessionId,
      itemNote: iNote
    });
    
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify(this.scannedObjects));

    ScannerManager.resetScanLinesAndFields();
    ManifestManager.updateManifestProgressUI();
    this.returnToEdit();
    this.saveToArchive('Pending');
  },

  goToSummaryScreen() {
    if (ScannerManager.isCameraActive) ScannerManager.toggleCameraScanner();
    document.getElementById('screenScanning').style.display = 'none';
    document.getElementById('screenReview').style.display = 'none';
    AuditManager.updateSessionSummaryView();
    
    let optCommit = document.getElementById('optCommitStock');
    let optComplete = document.querySelector('#exportDropdown option[value="complete"]');
    let isStocktake = this.currentWorkflowType.includes('Stocktake');

    if (optCommit) {
      optCommit.style.display = isStocktake ? 'block' : 'none';
      if (optComplete) optComplete.style.display = isStocktake ? 'none' : 'block';
      document.getElementById('exportDropdown').value = isStocktake ? 'commit_stock' : 'continue';
    }

    ManifestManager.renderManifestReconciliation();
    this.renderAdvancedReview(); 
    document.getElementById('screenSummary').style.display = 'block';
  },

  getVendorSearchUrl(mfr, ref) {
    let cleanMfr = (mfr || '').toUpperCase();
    if (cleanMfr.includes('ETHICON')) return 'https://www.ethicon.com/na/epc/search/';
    if (cleanMfr.includes('SYNERGY')) return 'https://www.synergysurgical.com/search/';
    return `https://www.google.com/search?q=${encodeURIComponent(mfr + ' ' + ref)}`;
  },

  async autoFetchEthicon(ref, index) {
    let btn = document.getElementById(`btnEthiconFetch_${index}`);
    if (btn) { btn.textContent = "⏳ Fetching..."; btn.disabled = true; }
    try {
      let res = await fetch(`${ApiManager.getActiveArchiveUrl()}?action=FETCH_ETHICON&ref=${encodeURIComponent(ref)}`);
      let text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error("Google Server busy. Try again in 5 seconds."); }
      
      if (data.status === "success" && data.desc) {
         let input = document.getElementById(`advDesc_${index}`);
         if (input) {
             input.value = data.desc;
             input.setAttribute('data-autofetched', 'true'); 
         }
         if (btn) { btn.textContent = "✅ Success"; btn.style.backgroundColor = "#2e7d32"; }
      } else { throw new Error(data.message || "Parse failed."); }
    } catch(err) {
       alert("Ethicon Auto-Fetch failed: " + err.message);
       if (btn) { btn.textContent = "⚡ Auto-Fetch"; btn.disabled = false; }
    }
  },

  renderAdvancedReview() {
    const card = document.getElementById('advancedReviewCard');
    const list = document.getElementById('advancedItemsList');
    if (!card || !list) return;

    if (!Array.isArray(this.pendingNewItems)) this.pendingNewItems = [];

    let unresolved = this.pendingNewItems.filter(i => i.desc === "Navigate to vendor website for item description." || !i.desc);
    if (unresolved.length === 0) { card.style.display = 'none'; return; }

    card.style.display = 'block';
    list.innerHTML = '';

    unresolved.forEach((item, index) => {
      let searchUrl = this.getVendorSearchUrl(item.mfr, item.ref);
      let isEthicon = (item.mfr || '').toUpperCase().includes('ETHICON');
      
      let ethiconBtnHtml = isEthicon ? `
        <label style="font-size:0.85rem; font-weight:bold; color:#c62828; display:flex; align-items:center; gap:4px; margin-right:8px;">
          <input type="checkbox" id="chkSuture_${index}"> Suture?
        </label>
        <button id="btnEthiconFetch_${index}" class="btn-small" style="background-color:#f57f17; color:#ffffff; padding: 4px 10px;" onclick="SessionManager.autoFetchEthicon('${item.ref}', ${index})">⚡ Auto-Fetch</button>
      ` : '';

      let div = document.createElement('div');
      div.style.marginBottom = '10px'; div.style.padding = '10px'; div.style.backgroundColor = '#ffffff'; div.style.border = '1px solid #90caf9'; div.style.borderRadius = '4px';

      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <div><strong style="color: #0277bd;">${item.ref}</strong> <span style="font-size:0.8rem; color:#555; margin-left: 6px;">${item.mfr}</span></div>
          <div style="display:flex; gap:6px;">
            ${ethiconBtnHtml}
            <button class="btn-small" style="background-color:#1976d2; color:#ffffff; padding: 4px 10px;" onclick="window.open('${searchUrl}', '_blank')">🔍 Manual Search</button>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; background:#f5f5f5; padding:6px; border-radius:4px; border:1px solid #ccc;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:0.85rem; font-weight:bold; color:#555; white-space:nowrap;">${item.mfr}</span>
            <input type="text" id="advDesc_${index}" class="adv-desc-input" data-ref="${item.ref}" data-mfr="${item.mfr}" placeholder="Paste website description here..." style="flex:1; padding:6px; border: 1px solid #ccc; border-radius: 4px;">
            <span style="font-size:0.85rem; font-weight:bold; color:#555; white-space:nowrap;">${item.ref}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <label style="font-size:0.8rem; font-weight:bold; color:#0277bd; min-width:70px;">Category:</label>
            <select id="advCat_${index}" style="flex:1; padding:6px; font-size:0.85rem; border:1px solid #ccc; border-radius:4px;">
                <option value="Medical Supplies">Medical Supplies (General)</option>
                <option value="Suture">Suture</option>
                <option value="Endomechanical">Endomechanical</option>
                <option value="Energy">Energy</option>
                <option value="Mesh">Mesh</option>
                <option value="Orthopedic">Orthopedic</option>
                <option value="Wound Care">Wound Care</option>
                <option value="Custom">+ Add Custom Category...</option>
            </select>
          </div>
        </div>
      `;
      list.appendChild(div);

      let catSelect = document.getElementById(`advCat_${index}`);
      if (catSelect) {
          catSelect.addEventListener('change', function() {
              if (this.value === 'Custom') {
                  let customCat = prompt("Enter a custom category name:");
                  if (customCat && customCat.trim() !== "") {
                      let opt = document.createElement('option');
                      opt.value = customCat.trim(); opt.textContent = customCat.trim();
                      this.insertBefore(opt, this.lastElementChild);
                      this.value = customCat.trim();
                  } else { this.selectedIndex = 0; }
              }
          });
      }
    });
  },

  saveAdvancedDescriptions() {
    const inputs = document.querySelectorAll('.adv-desc-input');
    let updatedCount = 0;

    inputs.forEach((input, index) => {
      let rawDesc = input.value.trim();
      let ref = input.getAttribute('data-ref');
      let mfr = input.getAttribute('data-mfr');
      
      if (rawDesc && rawDesc !== "Navigate to vendor website for item description.") {
        let sutureChk = document.getElementById(`chkSuture_${index}`);
        let isSuture = sutureChk && sutureChk.checked;
        let isAutoFetched = input.getAttribute('data-autofetched') === 'true';
        let catSelect = document.getElementById(`advCat_${index}`);
        let selectedCat = catSelect ? catSelect.value : "Medical Supplies";
        
        let finalDesc = "";
        let finalCategory = selectedCat;
        let pendingMatch = this.pendingNewItems.find(i => i.ref === ref);
        if (pendingMatch) finalCategory = pendingMatch.category || "Medical Supplies";

        if (isSuture) {
            let refBase = ref.slice(0, -1); 
            finalCategory = `Suture, ${refBase}`;
            if (isAutoFetched) {
                let boxQtyStr = "";
                let lastChar = ref.slice(-1).toUpperCase();
                if (mfr.toUpperCase().includes('ETHICON')) {
                    if (lastChar === 'G') boxQtyStr = "(BX/12)";
                    else if (lastChar === 'T') boxQtyStr = "(BX/24)";
                    else if (lastChar === 'H') boxQtyStr = "(BX/36)";
                }
                finalDesc = `${mfr} ${rawDesc} ${boxQtyStr} ${ref}`.replace(/\s+/g, ' ').trim();
            } else {
                finalDesc = `${mfr} ${rawDesc} ${ref}`.replace(/\s+/g, ' ').trim();
            }
        } else {
            finalDesc = `${mfr} ${rawDesc} ${ref}`.replace(/\s+/g, ' ').trim();
        }
        
        if (pendingMatch) { pendingMatch.desc = finalDesc; pendingMatch.category = finalCategory; }

        let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase());
        if (dbItem) { dbItem.desc = finalDesc; dbItem.category = finalCategory; }

        this.scannedObjects.forEach(scanned => { if (scanned.ref === ref && scanned.isNew) scanned.desc = finalDesc; });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));
      localStorage.setItem('asp_pending_new_items', JSON.stringify(this.pendingNewItems));
      localStorage.setItem('asp_session_scanned_objects', JSON.stringify(this.scannedObjects));
      alert(`Successfully updated ${updatedCount} descriptions!`);
      this.renderAdvancedReview();
    } else alert("No new descriptions were entered.");
  },

  cancelSession() {
    UIManager.showCustomConfirm("Cancel Session", "Are you sure you want to CANCEL this scanning session? All items scanned during this session will be discarded.", () => {
      this.saveToArchive('Cancelled');
      this.isSessionActive = false; this.isManifestEnabled = false;
      localStorage.setItem('asp_session_is_active', 'false'); localStorage.setItem('asp_manifest_enabled', 'false');
      this.scannedObjects = []; this.expectedManifest = [];
      localStorage.setItem('asp_session_scanned_objects', JSON.stringify([])); localStorage.setItem('asp_active_manifest', JSON.stringify([]));

      this.pendingNewItems = []; this.pendingFieldUpdates = [];
      localStorage.setItem('asp_pending_new_items', JSON.stringify([])); 
      localStorage.setItem('asp_pending_updates', JSON.stringify([]));

      let recList = document.getElementById('manifestReconcileList');
      let recCard = document.getElementById('manifestReconcileCard');
      if (recList) recList.innerHTML = '';
      if (recCard) recCard.style.display = 'none';

      if (ScannerManager.isCameraActive) ScannerManager.toggleCameraScanner();
      document.getElementById('sessionNoteInput').value = ""; document.getElementById('chkSessionNote').checked = false;
      document.getElementById('orderDetailsInput').value = ""; 
      if (typeof UIManager !== 'undefined' && UIManager.toggleSessionNote) UIManager.toggleSessionNote();

      const chkPreload = document.getElementById('chkPreloadManifest');
      if (chkPreload) { chkPreload.checked = false; chkPreload.dispatchEvent(new Event('change')); }

      document.getElementById('screenScanning').style.display = 'none';
      document.getElementById('screenReview').style.display = 'none';
      document.getElementById('screenSummary').style.display = 'none';
      document.getElementById('screenSetup').style.display = 'block';

      this.currentItemAction = 'Inventory'; 
    });
  },

  completeSession(skipConfirm = false, skipShipping = false, skipIncoming = false) {
    if (this.currentWorkflowType === 'Picking & Packing' && !skipShipping) {
      if (typeof ShippingManager !== 'undefined') { 
        // ShippingManager.openModal(); <-- Commented out to temporarily bypass UI
        ShippingManager.skipAndComplete(); // ✨ Instantly fires the skip function instead!
        return; 
      }
    }
    if (this.currentWorkflowType.includes('Receiving') && !skipIncoming) {
      if (typeof ShippingManager !== 'undefined' && typeof ShippingManager.openIncomingModal === 'function') { ShippingManager.openIncomingModal(); return; }
    }

    const executeCompletion = async () => {
      let overlay = document.createElement('div');
      overlay.id = 'sessionSaveOverlay';
      overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff;';
      overlay.innerHTML = `
        <div style="background:#fff; border-radius:8px; width:100%; max-width:400px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5); text-align:center;">
          <h3 style="margin:0 0 15px 0; color:#0277bd;">💾 Committing Session to Cloud</h3>
          <div id="syncStep1" style="margin-bottom:10px; font-weight:bold; color:#555;">⏳ 1. Validating Payload...</div>
          <div id="syncStep2" style="margin-bottom:10px; font-weight:bold; color:#555;">⏳ 2. Server Processing...</div>
          <div id="syncStep3" style="margin-bottom:15px; font-weight:bold; color:#555;">⏳ 3. Downloading Fresh Sync...</div>
          <div style="width:100%; background:#eee; border-radius:4px; height:8px; overflow:hidden;">
            <div id="syncProgressBar" style="width:0%; height:100%; background:#2e7d32; transition:width 0.3s ease;"></div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const updateStep = (stepNum, text, progress) => {
        let el = document.getElementById(`syncStep${stepNum}`);
        if (el) el.innerHTML = `✅ <span style="color:#2e7d32;">${text}</span>`;
        let pBar = document.getElementById('syncProgressBar');
        if (pBar) pBar.style.width = `${progress}%`;
      };

      try {
        updateStep(1, "Payload Built", 33);
        
        this.scannedObjects.forEach((item, index) => {
          let qtyEl = document.getElementById(`editQty_${index}`);
          let tagEl = document.getElementById(`editTag_${index}`);
          if (qtyEl) {
            item.qty = parseInt(qtyEl.value, 10) || 1;
            if (tagEl) {
              let newTag = tagEl.value.trim().toUpperCase();
              item.customerTag = newTag;
              if (newTag && this.currentWorkflowType.includes('Receiving')) item.actionTag = 'Reserved';
            }
          }
          if (this.currentWorkflowType.includes('Packing') && this.isManifestEnabled) {
             let manifestItem = this.expectedManifest.find(m => m.ref === item.ref.toUpperCase());
             if (manifestItem && manifestItem.allocations && manifestItem.allocations.length > 0) { 
                 item.customerTag = manifestItem.allocations[0].customerTag; 
             }
          }
        });

        let sessionObj = {
          id: this.sessionId,
          status: "Completed",
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

        updateStep(2, "Server Calculating...", 66);
        
        let res = await fetch(ApiManager.getActiveArchiveUrl(), { 
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: "COMMIT_SESSION", payload: sessionObj })
        });
        
        let data = await res.json();
        if (data.status !== "success") throw new Error(data.message);

        // ✨ FIX 1: Capture the REFs to sync *before* we wipe the local session memory, but DON'T build the payload yet!
        let refsToSyncToShopify = [];
        if (this.currentWorkflowType === 'Full Stocktake') {
            refsToSyncToShopify = DatabaseManager.db.map(i => i.sku || i.ref);
        } else {
            refsToSyncToShopify = this.scannedObjects.map(scan => scan.ref);
            this.pendingNewItems.forEach(item => { if (item.ref) refsToSyncToShopify.push(item.ref); });
        }

        // Clean up Local Memory
        this.pendingNewItems = []; this.pendingFieldUpdates = [];
        localStorage.setItem('asp_pending_new_items', JSON.stringify([])); 
        localStorage.setItem('asp_pending_updates', JSON.stringify([]));
        this.expectedManifest = [];
        localStorage.setItem('asp_active_manifest', JSON.stringify([]));
        this.scannedObjects = [];
        localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));
        
        let localArchive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
        localArchive = localArchive.filter(s => s.id !== this.sessionId);
        localStorage.setItem('asp_session_archive', JSON.stringify(localArchive));
        
        document.getElementById('sessionNoteInput').value = ""; document.getElementById('chkSessionNote').checked = false;
        document.getElementById('orderDetailsInput').value = ""; 
        if (typeof UIManager !== 'undefined' && UIManager.toggleSessionNote) UIManager.toggleSessionNote();
        const chkPreload = document.getElementById('chkPreloadManifest');
        if (chkPreload) { chkPreload.checked = false; chkPreload.dispatchEvent(new Event('change')); }
        
        this.isSessionActive = false; this.isManifestEnabled = false;
        localStorage.setItem('asp_session_is_active', 'false'); localStorage.setItem('asp_manifest_enabled', 'false');
        this.currentItemAction = 'Inventory'; 

        if (sessionObj.orderNum) { QboManager.pushQboWriteBack(sessionObj); }

        document.body.removeChild(overlay);
        document.getElementById('screenSummary').style.display = 'none';
        document.getElementById('screenSetup').style.display = 'block';

        // 5. Download the Newly Calculated Database natively via the Master Sync!
        sessionStorage.setItem('asp_allocations_verified', 'true');
        if (typeof window.masterSystemSync === 'function') {
            await window.masterSystemSync(null); 
        } else {
            UIManager.showCustomAlert("Session Complete", "✅ Inventory successfully updated in the Cloud!");
        }

        // ✨ FIX 2: NOW that the freshly calculated database is downloaded, build the Shopify payload!
        try {
            let shopifyUpdatePayload = DatabaseManager.buildShopifyPayload(refsToSyncToShopify);
            
            if (shopifyUpdatePayload.length > 0 && ApiManager.getActiveArchiveUrl()) {
                
                // ✨ FIX: Show floating sync indicator
                if (typeof UIManager !== 'undefined' && UIManager.showShopifySyncingBadge) {
                    UIManager.showShopifySyncingBadge(true, shopifyUpdatePayload.length);
                }

                // Fire-and-forget batched Shopify Sync to prevent timeouts
                (async () => {
                  let batchSize = 40; 
                  let totalBatches = Math.ceil(shopifyUpdatePayload.length / batchSize); // ✨ FIX: Calculate exact batches
                  
                  for (let i = 0; i < shopifyUpdatePayload.length; i += batchSize) {
                      let currentBatch = (i / batchSize) + 1;
                      let batch = shopifyUpdatePayload.slice(i, i + batchSize);
                      
                      // ✨ FIX: Update UI meter before sending the batch
                      if (typeof UIManager !== 'undefined' && UIManager.showShopifySyncingBadge) {
                          UIManager.showShopifySyncingBadge(true, shopifyUpdatePayload.length, currentBatch, totalBatches);
                      }
                      
                      try {
                          await fetch(ApiManager.getActiveArchiveUrl(), { 
                              method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
                              body: JSON.stringify({ action: "SYNC_SHOPIFY", payload: batch }) 
                          });
                      } catch(e) { console.warn("Shopify batch sync failed:", e); }
                      
                      await new Promise(r => setTimeout(r, 1500));
                  }
                  
                  if (typeof UIManager !== 'undefined' && UIManager.showShopifySyncingBadge) {
                      UIManager.showShopifySyncingBadge(false);
                  }
              })();
            }
        } catch(e) {
            console.warn("Shopify background sync setup failed", e);
        }

      } catch (err) {
        let overlayEl = document.getElementById('sessionSaveOverlay');
        if (overlayEl) document.body.removeChild(overlayEl);
        alert("Commit Error: Failed to save session to the cloud: " + err.message);
      }
    };

    if (!skipConfirm) { UIManager.showCustomConfirm("Complete Session", "Are you ready to commit this session to the cloud?", executeCompletion); } 
    else { executeCompletion(); }
  },

  commitStocktake() {
    if (!this.currentWorkflowType.includes('Stocktake')) return;
    
    let noteEl = document.getElementById('sessionNoteInput');
    let chkNote = document.getElementById('chkSessionNote');
    let noteVal = noteEl ? noteEl.value.trim() : '';
    
    if (this.currentWorkflowType === 'Full Stocktake' && (!chkNote.checked || !noteVal)) {
      alert("A mandatory Session Note is required to commit a Full Stocktake. Please check 'Add Session Note' and provide a reason.");
      return;
    }

    if (!confirm(`Are you sure you want to commit these quantities to the master database?\n\nMode: ${this.currentWorkflowType}\nScanned Items: ${this.scannedObjects.length}`)) return;

    let scannedTotals = {};
    this.scannedObjects.forEach(item => {
      if (!scannedTotals[item.ref]) scannedTotals[item.ref] = 0;
      scannedTotals[item.ref] += item.qty;
    });

    let varianceData = [];
    let netFinancialImpact = 0;

    DatabaseManager.db.forEach(dbItem => {
      let sku = (dbItem.sku || dbItem.ref || '').toUpperCase();
      let expected = dbItem.onHand || 0;
      let counted = scannedTotals[sku] || 0;
      
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

    Object.keys(scannedTotals).forEach(sku => {
      let dbMatch = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === sku.toUpperCase());
      if (!dbMatch) {
        let counted = scannedTotals[sku];
        let scanObj = this.scannedObjects.find(i => i.ref.toUpperCase() === sku.toUpperCase());
        let costVal = scanObj ? parseFloat(String(scanObj.price || "0").replace(/[^0-9.-]+/g,"")) || 0 : 0;
        let financialVar = counted * costVal;
        netFinancialImpact += financialVar;
        varianceData.push({ ref: sku, desc: scanObj ? scanObj.desc : "New Item", mfr: scanObj ? scanObj.mfr : "N/A", expected: 0, counted: counted, variance: counted, financialImpact: financialVar });
      }
    });

    // ✨ ALL LOCAL MUTATIONS DELETED! We simply generate the Variance Report and then hand off to the cloud!
    if (varianceData.length > 0) ReportsManager.generateVarianceReportPDF(varianceData, this.currentWorkflowType, netFinancialImpact);
    else alert("No variances detected! Your physical counts match the system perfectly.");
    
    // Hand off to completeSession to push the payload to the Ledger Engine
    setTimeout(() => { this.completeSession(true); }, UIManager.printTimeout);
  },

  async executeSessionReversal() {
    let select = document.getElementById('reversalSessionSelect');
    let targetId = select ? select.value : "";
    if (!targetId) { alert("Please select a session to reverse."); return; }

    let dir = JSON.parse(localStorage.getItem('asp_cloud_directory')) || [];
    let targetLite = dir.find(s => String(s.id) === String(targetId));
    if (!targetLite) return;

    if (!confirm(`Are you absolutely sure you want to mathematically REVERSE the session:\n\n"${targetLite.sessionName}"?\n\nThis will download the payload from the cloud and subtract all items that were originally added.`)) return;

    // ✨ FIX: Identify all parts of a split payload automatically
    let partsToFetch = [targetLite];
    let baseName = targetLite.sessionName;

    let match = targetLite.sessionName.match(/(.*?)\s*\(Part \d+ of \d+\)$/i);
    if (match) {
      baseName = match[1].trim();
      partsToFetch = dir.filter(s => {
          let smatch = s.sessionName.match(/(.*?)\s*\(Part \d+ of \d+\)$/i);
          let sBase = smatch ? smatch[1].trim() : s.sessionName;
          return sBase === baseName && s.dateStr === targetLite.dateStr;
      }).sort((a, b) => parseInt(a.id) - parseInt(b.id));
    }

    let overlay = document.createElement('div');
    overlay.id = 'reversalOverlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff;';
    overlay.innerHTML = `<h3>🔄 Reversing Session...</h3><p id="revStatusText" style="color:#a5d6a7;">Downloading cloud payloads...</p>`;
    document.body.appendChild(overlay);

    let combinedScans = [];
    let targetSession = null;

    try {
        // Download all parts and stitch them together
        for (let i = 0; i < partsToFetch.length; i++) {
            let partLite = partsToFetch[i];
            if (partsToFetch.length > 1) document.getElementById('revStatusText').innerText = `Downloading part ${i+1} of ${partsToFetch.length}...`;
            
            let res = await fetch(`${ApiManager.getActiveArchiveUrl()}?action=GET_SESSION&id=${partLite.id}`);
            let partData = await res.json();
            if (!partData || partData.status === "error") throw new Error(partData.message || "Cloud payload missing.");
            
            if (i === 0) targetSession = partData;
            combinedScans = combinedScans.concat(partData.scannedObjects || []);
        }

        document.getElementById('revStatusText').innerText = "Transmitting negative payloads to the Cloud Ledger...";

        // Convert all scanned items to negative quantities
        let revScannedObjects = combinedScans.map(item => {
            return { ...item, qty: -(item.qty), itemNote: item.itemNote ? `[REVERSAL] ${item.itemNote}` : `REVERSAL of ${targetSession.id}` };
        });

        // Build the Master Reversal Payload
        let masterSessionObj = {
          id: Date.now().toString(), status: 'Completed', userName: this.currentUserName || 'Thomas',
          sessionName: `[REVERSED] ${baseName}`, orderNum: targetSession.orderNum,
          workflowType: targetSession.workflowType, dateStr: new Date().toLocaleDateString().replace(/\//g, '.'),
          startStr: new Date().toLocaleTimeString(), manifestEnabled: false, expectedManifest: [],
          scannedObjects: revScannedObjects, pendingNewItems: [], pendingUpdates: [], lastUpdated: Date.now()
        };

        // Split it back into chunks if it exceeds the 45,000 char cell limit
        let chunks = this.splitPayloadIfNeeded(masterSessionObj);

        // Push chunks sequentially to COMMIT_SESSION
        for (let i = 0; i < chunks.length; i++) {
            if (chunks.length > 1) document.getElementById('revStatusText').innerText = `Committing reversed part ${i+1} of ${chunks.length}...`;
            
            let res = await fetch(ApiManager.getActiveArchiveUrl(), { 
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: "COMMIT_SESSION", payload: chunks[i] })
            });
            
            let data = await res.json();
            if (data.status !== "success") throw new Error(data.message);
            
            await new Promise(r => setTimeout(r, 1000)); 
        }
        
        document.body.removeChild(overlay);
        
        sessionStorage.setItem('asp_allocations_verified', 'true');
        if (typeof window.masterSystemSync === 'function') await window.masterSystemSync(null); 
        
        alert("Session successfully reversed! The database and cloud audit log have been updated with the negative quantities.");
        this.loadReversibleSessions(); 

    } catch (err) {
        let overlayEl = document.getElementById('reversalOverlay');
        if (overlayEl) document.body.removeChild(overlayEl);
        alert("Reversal Failed: " + err.message);
    }
  },

  suspendToBackorder() {
    if (!confirm("Suspend session to Pending Backorder?\n\nThis will keep the session in the archive to be resumed later.")) return;
    
    this.pendingNewItems = []; this.pendingFieldUpdates = [];
    localStorage.setItem('asp_pending_new_items', JSON.stringify([])); 
    localStorage.setItem('asp_pending_updates', JSON.stringify([]));
    
    let recList = document.getElementById('manifestReconcileList');
    let recCard = document.getElementById('manifestReconcileCard');
    if (recList) recList.innerHTML = '';
    if (recCard) recCard.style.display = 'none';

    document.getElementById('sessionNoteInput').value = ""; 
    document.getElementById('chkSessionNote').checked = false;
    if (typeof UIManager !== 'undefined' && UIManager.toggleSessionNote) UIManager.toggleSessionNote();
    
    const chkPreload = document.getElementById('chkPreloadManifest');
    if (chkPreload) { chkPreload.checked = false; chkPreload.dispatchEvent(new Event('change')); }

    document.getElementById('screenSummary').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
    
    this.isSessionActive = false; 
    this.isManifestEnabled = false;
    localStorage.setItem('asp_session_is_active', 'false'); 
    localStorage.setItem('asp_manifest_enabled', 'false');

    this.currentItemAction = 'Inventory'; 
    this.saveToArchive('Pending');
  },

  saveToArchive(status = 'Pending') { 
    if (!this.sessionId || this.scannedObjects.length === 0) return null;
    
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

    let cutoff = Date.now() - 2592000000;
    archive = archive.filter(s => s.lastUpdated > cutoff);
    localStorage.setItem('asp_session_archive', JSON.stringify(archive));
    return sessionObj;
  },

  loadReversibleSessions() {
    let select = document.getElementById('reversalSessionSelect');
    if (!select) return;
    
    let archive = JSON.parse(localStorage.getItem('asp_cloud_directory')) || [];
    let cutoff = Date.now() - (24 * 60 * 60 * 1000); 
    
    let reversible = archive.filter(s => {
        if (s.status !== 'Completed') return false;
        let sTime = parseInt(s.id, 10);
        if (isNaN(sTime) || sTime < cutoff) return false;
        
        let w = (s.workflowType || '').toUpperCase();
        if (w.includes('PACK') || w.includes('STOCKTAKE')) return false;
        return w.includes('RECEIV') || w.includes('RESERV');
    }).sort((a,b) => parseInt(b.id) - parseInt(a.id));

    select.innerHTML = '<option value="">-- Select Session to Reverse --</option>';
    reversible.forEach(s => {
        let opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `☁️ ${s.dateStr} | ${s.sessionName} (${s.workflowType})`;
        select.appendChild(opt);
    });
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
    ManifestManager.updateManifestProgressUI();
    this.saveToArchive('Pending');
    
    alert(`Updated REF ${this.scannedObjects[index].ref} (Qty: ${newQty}${newTag ? ', Tag: ' + newTag : ''})`);
    AuditManager.updateSessionSummaryView();
    ManifestManager.renderManifestReconciliation();
    this.renderAdvancedReview();
  },

  deleteScannedItem(index) {
    if (!this.scannedObjects[index]) return;
    let item = this.scannedObjects[index];
    
    if (!confirm(`Delete scanned item run for REF: ${item.ref} (Lot: ${item.lot}, Qty: ${item.qty})?`)) return;

    this.scannedObjects.splice(index, 1);
    
    if (item.isNew) {
        let stillExists = this.scannedObjects.some(i => i.ref === item.ref && i.isNew);
        if (!stillExists) {
            this.pendingNewItems = this.pendingNewItems.filter(i => i.ref !== item.ref);
            localStorage.setItem('asp_pending_new_items', JSON.stringify(this.pendingNewItems));
        }
    }

    localStorage.setItem('asp_session_scanned_objects', JSON.stringify(this.scannedObjects));
    ManifestManager.updateManifestProgressUI();
    this.saveToArchive('Pending');

    AuditManager.updateSessionSummaryView();
    ManifestManager.renderManifestReconciliation();
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
    
    let rawList = [];
    if (this.currentArchiveTab === 'local') {
      rawList = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    } else {
      rawList = JSON.parse(localStorage.getItem('asp_cloud_directory')) || [];
    }
    
    if (rawList.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:#555;">No ${this.currentArchiveTab} sessions found.</div>`;
      return;
    }

    let filterVal = document.getElementById('archiveFilter').value;
    let searchVal = document.getElementById('archiveSearchInput') ? document.getElementById('archiveSearchInput').value.trim().toLowerCase() : '';
    let hideCancelled = document.getElementById('chkHideCancelled') ? document.getElementById('chkHideCancelled').checked : false;
    let onlyActive = document.getElementById('chkOnlyActive') ? document.getElementById('chkOnlyActive').checked : false;
    
    let cutoff = 0;
    if (filterVal === 'today') cutoff = Date.now() - (24 * 60 * 60 * 1000);
    else if (filterVal === 'week') cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    else if (filterVal === 'month') cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    else cutoff = 0; 

    let filtered = rawList.filter(s => {
      if (cutoff > 0 && s.lastUpdated && s.lastUpdated < cutoff) return false;
      if (hideCancelled && s.status === 'Cancelled') return false;
      if (onlyActive && s.status !== 'Pending') return false; 
      
      if (searchVal) {
          let searchTarget = `${s.sessionName} ${s.orderNum} ${s.dateStr} ${s.id}`.toLowerCase();
          if (!searchTarget.includes(searchVal)) return false;
      }
      
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:#555;">No sessions found matching these filters.</div>`;
      return;
    }

    let html = '';
    filtered.forEach(s => {
      let statusColor = s.status === 'Completed' ? '#2e7d32' : (s.status === 'Cancelled' ? '#d32f2f' : (s.status === 'Pending' ? '#0277bd' : '#f57f17'));
      
      let itemsPreview = '';
      let isCloud = s.isCloud === true;

      if (!isCloud && s.scannedObjects) {
        itemsPreview = s.scannedObjects.map(item => `<li>${item.qty}x ${item.ref}</li>`).join('');
        if(!itemsPreview) itemsPreview = '<li>No items scanned</li>';
      } else {
        itemsPreview = '<li style="color:#0277bd; font-style:italic;">Payload stored safely in Cloud Vault. Restore to view items.</li>';
      }

      let deleteBtnHtml = isCloud 
        ? `<div style="font-size:0.8rem; color:#777; font-style:italic;">Locked (Cloud)</div>` 
        : `<button class="btn-small btn-cancel btn-auto" onclick="SessionManager.deleteArchivedSession('${s.id}')">🗑️ Delete</button>`;

      let restoreBtnHtml = isCloud
        ? `<button class="btn-action btn-auto" style="margin:0; padding:6px 12px; background-color:#1565c0; color:#fff;" onclick="SessionManager.restoreArchivedSession('${s.id}', true)">☁️ Download & Restore</button>`
        : `<button class="btn-action btn-save btn-auto" style="margin:0; padding:6px 12px;" onclick="SessionManager.restoreArchivedSession('${s.id}', false)">🔄 Restore Local</button>`;

      html += `
        <div class="audit-card" style="border-left: 5px solid ${statusColor};">
          <div class="flex-between" style="margin-bottom: 6px;">
            <strong style="color:#0277bd; font-size:1.05rem;">${s.sessionName}</strong>
            <span class="badge-info" style="background-color:${statusColor}; color:#fff;">${s.status}</span>
          </div>
          
          <details style="font-size: 0.85rem; color: #555; margin-bottom: 10px;">
            <summary style="cursor:pointer; font-weight:bold; color:#333; margin-bottom:6px;">[+] View Details</summary>
            <div style="padding-left: 12px; margin-top: 6px; border-left: 2px solid #eee;">
              <div><strong>Date:</strong> ${s.dateStr} | <strong>User:</strong> ${s.userName}</div>
              ${s.workflowType ? `<div><strong>Workflow:</strong> ${s.workflowType}</div>` : ''}
              <div style="margin-top:6px;"><strong>Items:</strong></div>
              <ul style="margin:4px 0 0 0; padding-left:16px; max-height:80px; overflow-y:auto;">
                ${itemsPreview}
              </ul>
            </div>
          </details>
          
          <div class="flex-between">
            ${deleteBtnHtml}
            ${restoreBtnHtml}
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  },

  async restoreArchivedSession(id, isCloud = false) {
    let confirmMsg = isCloud 
      ? "Download and restore this session from the Cloud Vault?\n\nThis will override your current unsaved session if you have one active." 
      : "Restore this local session?\n\nThis will override your current unsaved session if you have one active.";
    
    if (!confirm(confirmMsg)) return;
    
    let sessionData = null;

    if (isCloud) {
      try {
        let dir = JSON.parse(localStorage.getItem('asp_cloud_directory')) || [];
        let targetLite = dir.find(s => String(s.id) === String(id));
        if (!targetLite) return;

        let partsToFetch = [targetLite];
        let baseName = targetLite.sessionName;

        let match = targetLite.sessionName.match(/(.*?)\s*\(Part \d+ of \d+\)$/i);
        if (match) {
          baseName = match[1].trim();
          partsToFetch = dir.filter(s => {
              let smatch = s.sessionName.match(/(.*?)\s*\(Part \d+ of \d+\)$/i);
              let sBase = smatch ? smatch[1].trim() : s.sessionName;
              return sBase === baseName && s.dateStr === targetLite.dateStr;
          }).sort((a, b) => parseInt(a.id) - parseInt(b.id));
        }

        let overlay = document.createElement('div');
        overlay.id = 'downloadOverlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; color:#fff; font-size:1.2rem; font-weight:bold; flex-direction:column;';
        overlay.innerHTML = `<div style="font-size:2rem; margin-bottom:10px;">☁️</div><div id="dlText">Downloading session payload...</div>`;
        document.body.appendChild(overlay);

        let combinedScans = [];
        for (let i = 0; i < partsToFetch.length; i++) {
          let partLite = partsToFetch[i];
          let dlText = document.getElementById('dlText');
          if (dlText && partsToFetch.length > 1) dlText.textContent = `Downloading part ${i+1} of ${partsToFetch.length}...`;

          let res = await fetch(`${ApiManager.getActiveArchiveUrl()}?action=GET_SESSION&id=${partLite.id}`);
          let partData = await res.json();
          
          if (!partData || partData.status === "error") {
            document.body.removeChild(overlay);
            alert("Failed to download payload: " + (partData ? partData.message : "Unknown error"));
            return;
          }
          if (i === 0) sessionData = partData;
          combinedScans = combinedScans.concat(partData.scannedObjects || []);
        }
        document.body.removeChild(overlay);

        if (partsToFetch.length > 1) {
          sessionData.scannedObjects = combinedScans;
          sessionData.sessionName = baseName;
          if (sessionData.workflowType === 'Selection Stocktake' && baseName.toUpperCase().includes('FULL-INV')) {
             sessionData.workflowType = 'Full Stocktake';
          }
        }

      } catch (err) {
        let overlay = document.getElementById('downloadOverlay');
        if (overlay) document.body.removeChild(overlay);
        alert("Network error downloading session: " + err.message);
        return;
      }
    } else {
      let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
      sessionData = archive.find(x => x.id === id);
    }

    if (!sessionData) {
      alert("Session data could not be found.");
      return;
    }

    this.sessionId = sessionData.id;
    this.isSessionActive = true;
    this.currentUserName = sessionData.userName;
    this.currentSessionName = sessionData.sessionName;
    this.currentOrderNum = sessionData.orderNum;
    this.currentWorkflowType = sessionData.workflowType;
    this.sessionDateStr = sessionData.dateStr;
    this.sessionStartStr = sessionData.startStr;
    
    if (this.sessionStartStr === 'Historical Import') {
      this.sessionStartStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    this.isManifestEnabled = sessionData.manifestEnabled;
    this.expectedManifest = sessionData.expectedManifest || [];
    this.scannedObjects = sessionData.scannedObjects || [];
    this.pendingNewItems = sessionData.pendingNewItems || [];
    this.pendingFieldUpdates = sessionData.pendingUpdates || [];

    let destRow = document.getElementById('rowItemDestination');
    let tagRow = document.getElementById('rowCustomerTag');

    if (this.currentWorkflowType.includes('Receiving & Reserving')) {
      this.currentItemAction = 'Inventory'; 
      if (destRow) destRow.style.display = 'flex';
      if (tagRow) tagRow.style.display = 'none';
      if (typeof UIManager !== 'undefined' && UIManager.setItemAction) UIManager.setItemAction('Inventory');
    } else if (this.currentWorkflowType.includes('Reserving')) {
      this.currentItemAction = 'Reserved';
      if (destRow) destRow.style.display = 'none';
      if (tagRow) tagRow.style.display = 'none';
    } else if (this.currentWorkflowType.includes('Packing')) {
      this.currentItemAction = 'Pack & Ship';
      if (destRow) destRow.style.display = 'none';
      if (tagRow) tagRow.style.display = 'none';
    } else {
      this.currentItemAction = 'Inventory';
      if (destRow) destRow.style.display = 'none';
      if (tagRow) tagRow.style.display = 'none';
    }

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
  },

  // Un-Reserve Logic Engine (With Partial Quantity Support)
  openUnreserveModal(custName) {
      if (!custName) return;
      
      let binModal = document.getElementById('binViewerModal');
      if (binModal) binModal.style.display = 'none';

      let targetKey = custName.toUpperCase();
      let allocations = JSON.parse(localStorage.getItem('asp_allocations')) || {};
      let custAllocs = allocations[targetKey];

      if (!custAllocs || Object.keys(custAllocs).length === 0) {
          UIManager.showCustomAlert("Notice", `There are no items currently reserved for ${targetKey}.`);
          return;
      }

      document.getElementById('unreserveCustomerName').innerText = targetKey;
      let container = document.getElementById('unreserveChecklistContainer');
      let html = '';

      for (let ref in custAllocs) {
          let itemData = custAllocs[ref];
          let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase()) || { desc: "Unknown Item" };
          
          if (itemData && itemData.details && itemData.details.length > 0) {
              itemData.details.forEach((det) => {
                  if (det.qty > 0) {
                      html += `
                        <div class="unreserve-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;">
                          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
                            <input type="checkbox" class="unreserve-chk" data-ref="${ref}" data-lot="${det.lot || ''}" data-exp="${det.exp || ''}" data-session="${det.sessionId || ''}" data-max="${det.qty}"> 
                            <div>
                              <strong style="color:#0277bd;">${ref}</strong> (Max: ${det.qty})<br>
                              <span style="font-size:0.8rem; color: var(--text-main);">Lot: ${det.lot || 'N/A'} | Exp: ${det.exp || 'N/A'}</span><br>
                              <span style="font-size:0.8rem; color: var(--text-main);">${dbItem.desc}</span>
                            </div>
                          </label>
                          <div style="display:flex; flex-direction:column; align-items:center;">
                            <label style="font-size:0.7rem; font-weight:bold; color:#555;">Un-Reserve Qty</label>
                            <input type="number" id="unresQty_${ref}_${det.sessionId}" value="${det.qty}" min="1" max="${det.qty}" style="width:70px; padding:6px; text-align:center; border:1px solid #ccc; border-radius:4px; font-weight:bold; color:#d32f2f;">
                          </div>
                        </div>`;
                  }
              });
          }
      }
      
      container.innerHTML = html;
      document.getElementById('modalUnreserve').style.display = 'flex';
  },

  async processUnreserve(event) {
      let btn = event ? event.target : document.activeElement;
      let origText = btn.textContent;
      btn.textContent = "⏳ Un-Reserving..."; btn.disabled = true;
      
      try {
          let custName = document.getElementById('unreserveCustomerName').innerText.toUpperCase();
          let checkboxes = document.querySelectorAll('.unreserve-chk:checked');
          
          if (checkboxes.length === 0) {
              UIManager.showCustomAlert("Notice", "No items selected to un-reserve.");
              return;
          }

          let overlay = document.createElement('div');
          overlay.id = 'unreserveOverlay';
          overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff;';
          overlay.innerHTML = `
            <div style="background:#fff; border-radius:8px; width:100%; max-width:400px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5); text-align:center;">
              <h3 style="margin:0 0 15px 0; color:#d32f2f;">🔄 Processing Un-Reserve</h3>
              <div id="unresStep1" style="margin-bottom:15px; font-weight:bold; color:#555;">⏳ Adjusting inventory and syncing to the cloud...</div>
              <div style="width:100%; background:#eee; border-radius:4px; height:8px; overflow:hidden;">
                <div style="width:100%; height:100%; background:#d32f2f; animation: pulse 1.5s infinite;"></div>
              </div>
            </div>
          `;
          document.body.appendChild(overlay);

          let unreservedItems = [];
          
          checkboxes.forEach(chk => {
              let ref = chk.getAttribute('data-ref');
              let lot = chk.getAttribute('data-lot');
              let exp = chk.getAttribute('data-exp');
              let sessionId = chk.getAttribute('data-session');
              let maxQty = parseInt(chk.getAttribute('data-max'), 10) || 0;
              
              let rowWrapper = chk.closest('.unreserve-item-row');
              let qtyInput = rowWrapper ? rowWrapper.querySelector('input[type="number"]') : null;
              let unresQty = qtyInput ? parseInt(qtyInput.value, 10) : maxQty;
              
              if (isNaN(unresQty) || unresQty <= 0) return;
              if (unresQty > maxQty) unresQty = maxQty;

              unreservedItems.push({
                  ref: ref, lot: lot || "N/A", exp: exp || "N/A", qty: unresQty,
                  actionTag: "Un-Reserve",
                  customerTag: custName, isNew: false, sessionId: Date.now().toString(),
                  itemNote: "Un-Reserved from Bin"
              });
          });

          document.getElementById('modalUnreserve').style.display = 'none';

          let uNameInput = document.getElementById('userNameInput');
          let userName = uNameInput && uNameInput.value ? uNameInput.value.trim() : "Operator";

          let auditPayload = {
              id: Date.now().toString(), status: "Completed", userName: userName,
              sessionName: `Un-Reserve: ${custName}`, orderNum: "", workflowType: "Un-Reserve",
              dateStr: new Date().toLocaleDateString().replace(/\//g, '.'), startStr: new Date().toLocaleTimeString(),
              manifestEnabled: false, expectedManifest: [], scannedObjects: unreservedItems,
              pendingNewItems: [], pendingUpdates: [], lastUpdated: Date.now()
          };

          // 1. Send to the Cloud Ledger Engine for secure math calculation
          let res = await fetch(ApiManager.getActiveArchiveUrl(), {
              method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: "COMMIT_SESSION", payload: auditPayload })
          });
          
          let data = await res.json();
          if (data.status !== "success") throw new Error(data.message);

          document.getElementById('unresStep1').innerHTML = `✅ <span style="color:#2e7d32;">Cloud math calculated! Downloading fresh sync...</span>`;

          // ✨ FIX 1: Force the app to download the freshly calculated database FIRST!
          sessionStorage.setItem('asp_allocations_verified', 'true');
          if (typeof window.masterSystemSync === 'function') await window.masterSystemSync(null);

          // ✨ FIX 2: NOW build the Shopify payload using the updated, accurate math
          let refsToSync = unreservedItems.map(scan => scan.ref);
          let shopifyUpdatePayload = DatabaseManager.buildShopifyPayload(refsToSync);
          
          if (shopifyUpdatePayload.length > 0 && ApiManager.getActiveArchiveUrl()) {
              
              if (typeof UIManager !== 'undefined' && UIManager.showShopifySyncingBadge) {
                  UIManager.showShopifySyncingBadge(true, shopifyUpdatePayload.length);
              }

              (async () => {
                  let batchSize = 40; 
                  let totalBatches = Math.ceil(shopifyUpdatePayload.length / batchSize); // ✨ FIX: Calculate exact batches
                  
                  for (let i = 0; i < shopifyUpdatePayload.length; i += batchSize) {
                      let currentBatch = (i / batchSize) + 1;
                      let batch = shopifyUpdatePayload.slice(i, i + batchSize);
                      
                      // ✨ FIX: Update UI meter before sending the batch
                      if (typeof UIManager !== 'undefined' && UIManager.showShopifySyncingBadge) {
                          UIManager.showShopifySyncingBadge(true, shopifyUpdatePayload.length, currentBatch, totalBatches);
                      }
                      
                      try {
                          await fetch(ApiManager.getActiveArchiveUrl(), { 
                              method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
                              body: JSON.stringify({ action: "SYNC_SHOPIFY", payload: batch }) 
                          });
                      } catch(e) { console.warn("Shopify batch sync failed:", e); }
                      
                      await new Promise(r => setTimeout(r, 1500));
                  }
                  
                  if (typeof UIManager !== 'undefined' && UIManager.showShopifySyncingBadge) {
                      UIManager.showShopifySyncingBadge(false);
                  }
              })();
          }

          let overlayEl = document.getElementById('unreserveOverlay');
          if (overlayEl) document.body.removeChild(overlayEl);

          UIManager.showCustomAlert("Success", `Successfully un-reserved ${unreservedItems.length} item(s) and synced inventory!`);
          
          if (custName === "ASP DAMAGED INVENTORY") {
              if (typeof UIManager !== 'undefined' && UIManager.openDamagedBinViewerModal) UIManager.openDamagedBinViewerModal();
          } else {
              if (typeof UIManager !== 'undefined' && UIManager.openBinViewerModal) UIManager.openBinViewerModal();
          }
      
      } catch (err) {
          let overlayEl = document.getElementById('unreserveOverlay');
          if (overlayEl) document.body.removeChild(overlayEl);
          UIManager.showCustomAlert("Error", "Failed to process un-reserve: " + err.message, true);
      } finally {
          if (btn) {
              btn.textContent = origText; 
              btn.disabled = false;
          }
      }
  }
};