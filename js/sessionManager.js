/* ======================================================================= */
/* ASP SCANNER APP - SESSION MANAGER (js/sessionManager.js)                */
/* VERSION 1.9.2 | COMBINES CUSTOMER SELECTOR + ORDER # FIELD             */
/* ======================================================================= */

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

  init() {
    // Pre-fill the User Name input with the last saved user name
    let lastUser = localStorage.getItem('asp_user_name') || "";
    let userInput = document.getElementById('userNameInput');
    if (userInput && lastUser) {
      userInput.value = lastUser;
    }
  },

  startSession() {
    const uName = document.getElementById('userNameInput').value.trim();
    const type = document.querySelector('input[name="sessionType"]:checked').value;
    let partner = type === 'Shipment' ? document.getElementById('supplierSelect').value : document.getElementById('customerSelect').value;
    const oDetails = document.getElementById('orderDetailsInput').value.trim();
    const wType = type === 'Shipment' ? 'Receiving & Reserving' : document.getElementById('workflowTypeSelect').value;
    const chkManifest = document.getElementById('chkPreloadManifest').checked;

    if (!partner || partner === '+ Add Supplier' || partner === '+ Add Customer') { alert("Please select a valid Supplier or Customer."); return; }

    this.currentUserName = uName || "N/A";
    this.currentSessionName = partner + (oDetails ? ` (${oDetails})` : '');
    this.currentOrderNum = oDetails;
    this.currentWorkflowType = wType;
    this.isSessionActive = true;
    this.isManifestEnabled = chkManifest;

    const nowObj = new Date();
    this.sessionDateStr = `${nowObj.getFullYear()}.${String(nowObj.getMonth() + 1).padStart(2, '0')}.${String(nowObj.getDate()).padStart(2, '0')}`;
    this.sessionStartStr = nowObj.toLocaleTimeString();

    // Persist session details including last user name
    localStorage.setItem('asp_session_is_active', 'true');
    localStorage.setItem('asp_manifest_enabled', this.isManifestEnabled ? 'true' : 'false');
    localStorage.setItem('asp_user_name', this.currentUserName); // <--- Saves last used user
    localStorage.setItem('asp_session_name', this.currentSessionName);
    localStorage.setItem('asp_order_num', this.currentOrderNum);
    localStorage.setItem('asp_workflow_type', this.currentWorkflowType);
    localStorage.setItem('asp_session_start_str', this.sessionStartStr);
    localStorage.setItem('asp_session_date_str', this.sessionDateStr);
    
    this.scannedObjects = [];
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));

    this.updateHeaderBanners();

    if (this.isManifestEnabled) {
      document.getElementById('screenSetup').style.display = 'none';
      document.getElementById('manifestRowsContainer').innerHTML = '';
      this.addManifestRow();
      document.getElementById('screenManifestEntry').style.display = 'block';
    } else {
      this.expectedManifest = [];
      localStorage.setItem('asp_active_manifest', JSON.stringify([]));
      document.getElementById('screenSetup').style.display = 'none';
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
  },

  launchAIVisionBridge() {
    const promptText = `Analyze these attached medical inventory box photos. Group the items by REF/SKU, Quantity, Lot Number, and Expiration Date. For any item where the Lot or Expiration is unreadable or not visible, put 'N/A'.

Return ONLY a raw tab-separated table with NO extra introductory text, headers, or explanations, formatted in these exact columns:
REF [Tab] Quantity [Tab] Lot [Tab] Exp`;

    // Copy the prompt directly to clipboard
    navigator.clipboard.writeText(promptText).then(() => {
      alert("AI Vision Prompt copied to your clipboard! Opening Gemini...\n\nJust paste (Ctrl+V) into the chat and attach your shipment photos.");
      window.open('https://gemini.google.com', '_blank');
    }).catch(err => {
      console.error('Failed to copy prompt: ', err);
      window.open('https://gemini.google.com', '_blank');
    });
  },

  updateHeaderBanners() {
    ['hdrTitle', 'hdrTitleRev', 'hdrTitleSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.currentSessionName; });
    ['hdrUser', 'hdrUserRev', 'hdrUserSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.currentUserName || 'N/A'; });
    ['hdrDate', 'hdrDateRev', 'hdrDateSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.sessionDateStr; });
    ['hdrTime', 'hdrTimeRev', 'hdrTimeSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.sessionStartStr; });
    ['hdrWorkflow', 'hdrWorkflowRev', 'hdrWorkflowSum'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).textContent = this.currentWorkflowType; });
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
    div.innerHTML = `
      <div style="display:flex; gap:6px; align-items:center;">
        <input type="text" class="manifest-ref-input" placeholder="REF / SKU" value="${refVal}" oninput="this.value = this.value.toUpperCase();" style="flex:2;">
        <input type="number" class="manifest-qty-input" placeholder="Qty" value="${qtyVal}" min="1" style="flex:1;">
        <button class="btn-small btn-cancel" onclick="this.parentElement.parentElement.remove()" style="padding:4px 8px;">✕</button>
      </div>
      <div style="margin-top:6px;">
        <label style="font-size:0.8rem; font-weight:bold; cursor:pointer;">
          <input type="checkbox" class="manifest-res-chk" onchange="toggleManifestResRow(${rowIdx})" ${isRes ? 'checked' : ''}> ☐ Reserved for Customer
        </label>
      </div>
      <div class="manifest-subrow" id="manifestResSubrow_${rowIdx}" style="display:${isRes ? 'flex' : 'none'};">
        <input type="text" class="manifest-tag-input" placeholder="Customer Tag" value="${tagVal}" style="flex:2;">
        <input type="number" class="manifest-resqty-input" placeholder="Res Qty" value="${resQtyVal}" min="1" style="flex:1;">
      </div>
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
      alert(`Successfully parsed and added ${parsedCount} items!`);
    } else alert("Could not extract items.");
  },

  readManifestDataFromUI() {
    const container = document.getElementById('manifestRowsContainer');
    if (!container) return [];
    let list = [];
    container.querySelectorAll('.manifest-row').forEach(row => {
      let ref = row.querySelector('.manifest-ref-input').value.trim().toUpperCase();
      let qty = parseInt(row.querySelector('.manifest-qty-input').value, 10) || 1;
      let chk = row.querySelector('.manifest-res-chk').checked;
      let tag = row.querySelector('.manifest-tag-input').value.trim();
      let resQty = parseInt(row.querySelector('.manifest-resqty-input').value, 10) || 1;
      if (ref) list.push({ ref, expectedQty: qty, isReserved: chk, customerTag: chk ? tag : '', reservedQty: chk ? resQty : 0 });
    });
    return list;
  },

  goToManifestReview() {
    this.expectedManifest = this.readManifestDataFromUI();
    if (this.expectedManifest.length === 0) { alert("Please enter at least one expected item row."); return; }
    let totalExp = this.expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);
    let html = `<div style="margin-bottom:10px;"><strong>Total Expected Pieces:</strong> ${totalExp} across ${this.expectedManifest.length} unique REFs</div><table class="lot-table" style="width:100%;"><thead><tr><th>REF</th><th>Expected Qty</th><th>Customer Reserve</th></tr></thead><tbody>`;
    this.expectedManifest.forEach(item => {
      let resText = item.isReserved ? `${item.customerTag} (Qty: ${item.reservedQty})` : '--';
      html += `<tr><td><strong>${item.ref}</strong></td><td style="text-align:center;">${item.expectedQty}</td><td>${resText}</td></tr>`;
    });
    html += `</tbody></table>`;
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
    if (!banner || !this.isManifestEnabled || this.expectedManifest.length === 0) { if (banner) banner.style.display = 'none'; return; }
    banner.style.display = 'block';
    document.getElementById('manifestScannedQty').textContent = this.scannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
    document.getElementById('manifestTotalQty').textContent = this.expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);
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
    if (expField && expField.value.trim() !== "" && !document.getElementById('chkNaExp').checked) UIManager.formatExpDate(expField);
    const ref = document.getElementById('refInput').value.trim().toUpperCase();
    if (!ref) { alert("Please enter or scan a REF/SKU before continuing."); return; }
    const gtin = document.getElementById('gtinInput').value.trim();
    const lot = document.getElementById('lotInput').value.trim().toUpperCase();
    const exp = document.getElementById('expInput').value.trim();
    const vendor = document.getElementById('vendorSelect').value;
    const qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
    const cTag = this.getCombinedCustomerTag();
    const iNote = document.getElementById('itemNoteInput') ? document.getElementById('itemNoteInput').value.trim() : '';

    if (this.isManifestEnabled && this.expectedManifest.length > 0) {
      document.getElementById('revRefProgressRow').style.display = 'flex';
      document.getElementById('revTotalProgressRow').style.display = 'flex';
      let manifestItem = this.expectedManifest.find(i => i.ref === ref);
      let scannedRefQtySoFar = this.scannedObjects.filter(i => i.ref === ref).reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
      let newTotalScannedForRef = scannedRefQtySoFar + qty;
      if (manifestItem) document.getElementById('revRefProgress').textContent = `${newTotalScannedForRef} Scanned / ${manifestItem.expectedQty} Expected`;
      else document.getElementById('revRefProgress').innerHTML = `<span class="badge-info badge-alert">⚠️ Unexpected Item (Not on Manifest)</span>`;
      let totalScannedOverall = this.scannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0) + qty;
      let totalExpectedOverall = this.expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);
      document.getElementById('revTotalProgress').textContent = `${totalScannedOverall} / ${totalExpectedOverall} Total Order Items`;
    } else {
      document.getElementById('revRefProgressRow').style.display = 'none';
      document.getElementById('revTotalProgressRow').style.display = 'none';
    }

    document.getElementById('revRef').textContent = ref;
    document.getElementById('revGtin').textContent = gtin || '--';
    document.getElementById('revLot').textContent = lot || '--';
    document.getElementById('revExp').textContent = exp || '--';
    document.getElementById('revMfr').textContent = vendor;
    document.getElementById('revQty').textContent = qty;
    
    if (document.getElementById('revItemNoteRow')) {
        document.getElementById('revItemNoteRow').style.display = iNote ? 'flex' : 'none';
        document.getElementById('revItemNote').textContent = iNote;
    }

    document.getElementById('revDesc').textContent = DatabaseManager.getItemDesc(this.currentMatchedItem) || "Navigate to vendor website for item description.";
    document.getElementById('revPrice').textContent = (this.currentMatchedItem && this.currentMatchedItem.price) ? this.currentMatchedItem.price : "$0.00";

    if (document.getElementById('revActionRow')) {
      document.getElementById('revActionRow').style.display = this.currentWorkflowType.includes('Receiving & Reserving') ? 'flex' : 'none';
      document.getElementById('revAction').textContent = this.currentItemAction;
    }
    
    let tagRow = document.getElementById('rowCustomerTag');
    let revTagRow = document.getElementById('revCustomerTagRow');
    if (tagRow && tagRow.style.display !== 'none') {
       revTagRow.style.display = 'flex'; document.getElementById('revCustomerTag').textContent = cTag || 'NONE';
    } else { if (revTagRow) revTagRow.style.display = 'none'; }

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
    if (btnMfr) btnMfr.style.display = (this.currentMatchedItem && DatabaseManager.getItemVendor(this.currentMatchedItem).toLowerCase() !== vendor.toLowerCase()) ? 'inline-block' : 'none';

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
  },

  goToSummaryScreen() {
    if (ScannerManager.isCameraActive) ScannerManager.toggleCameraScanner();
    document.getElementById('screenScanning').style.display = 'none';
    document.getElementById('screenReview').style.display = 'none';
    AuditManager.updateSessionSummaryView();
    
    // NEW CALL: Render the advanced review if needed
    this.renderAdvancedReview(); 
    
    document.getElementById('screenSummary').style.display = 'block';
  },

  getVendorSearchUrl(mfr, ref) {
    let cleanMfr = (mfr || '').toUpperCase();
    if (cleanMfr.includes('ETHICON')) return 'https://www.ethicon.com/na/epc/search/';
    if (cleanMfr.includes('SYNERGY')) return 'https://www.synergysurgical.com/search/in-date,short-dated.html';
    
    // Fallback: Standard Google Search for Manufacturer + SKU
    return `https://www.google.com/search?q=${encodeURIComponent(mfr + ' ' + ref)}`;
  },

  renderAdvancedReview() {
    const card = document.getElementById('advancedReviewCard');
    const list = document.getElementById('advancedItemsList');
    if (!card || !list) return;

    // Filter pending items to only those that still have the default placeholder
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
        <input type="text" id="advDesc_${index}" class="adv-desc-input" data-ref="${item.ref}" placeholder="Paste description here..." style="width:100%; padding:8px; box-sizing:border-box; border: 1px solid #ccc; border-radius: 4px;">
      `;
      list.appendChild(div);
    });
  },

  saveAdvancedDescriptions() {
    const inputs = document.querySelectorAll('.adv-desc-input');
    let updatedCount = 0;

    inputs.forEach(input => {
      let newDesc = input.value.trim();
      let ref = input.getAttribute('data-ref');
      
      if (newDesc && newDesc !== "Navigate to vendor website for item description.") {
        // 1. Update pendingNewItems list
        let pendingItem = this.pendingNewItems.find(i => i.ref === ref);
        if (pendingItem) pendingItem.desc = newDesc;

        // 2. Update Master Database
        let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase());
        if (dbItem) dbItem.desc = newDesc;

        // 3. Update Scanned Objects in the current session
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
      this.renderAdvancedReview(); // Re-render to hide the card if all items are resolved
    } else {
      alert("No new descriptions were entered.");
    }
  },

  cancelSession() {
    if (!confirm("Are you sure you want to CANCEL this entire scanning session?\n\nAll items scanned during this session will be discarded.")) return;
    this.isSessionActive = false; this.isManifestEnabled = false;
    localStorage.setItem('asp_session_is_active', 'false'); localStorage.setItem('asp_manifest_enabled', 'false');
    this.scannedObjects = []; this.expectedManifest = [];
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify([])); localStorage.setItem('asp_active_manifest', JSON.stringify([]));

    if (ScannerManager.isCameraActive) ScannerManager.toggleCameraScanner();
    document.getElementById('sessionNoteInput').value = ""; document.getElementById('chkSessionNote').checked = false;
    UIManager.toggleSessionNote();

    document.getElementById('screenScanning').style.display = 'none';
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenSummary').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  completeSession() {
    if (!confirm("Are you ready to complete this session?\n\nMake sure you have saved or exported your data first. This will close the session and return you to the home screen.")) return;
    this.pendingNewItems = []; this.pendingFieldUpdates = [];
    localStorage.setItem('asp_pending_new_items', JSON.stringify([])); localStorage.setItem('asp_pending_updates', JSON.stringify([]));
    
    document.getElementById('sessionNoteInput').value = ""; document.getElementById('chkSessionNote').checked = false;
    UIManager.toggleSessionNote();

    document.getElementById('screenSummary').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
    this.isSessionActive = false; this.isManifestEnabled = false;
    localStorage.setItem('asp_session_is_active', 'false'); localStorage.setItem('asp_manifest_enabled', 'false');
  }
};
