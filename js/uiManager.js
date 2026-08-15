/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/uiManager.js
 * Author: Thomas Paul Seyfors
 * Version: 2.9.1
 * Date: August 2026
 * 
 * Description:
 *   User interface interaction manager handling theme toggling, dynamic font
 *   scaling, field validation/attention highlighting, date formatting, modal
 *   controls, and native file download/share triggers.
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const UIManager = {
  // POPULATE CUSTOMER REPORT SELECTOR FROM MASTER CUSTOMER LIST
  populateCustomerDropdown() {
    let select = document.getElementById('customerReportSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Customer Account --</option>';
    
    // Pull the clean, verified master customer list
    let custList = (typeof DatabaseManager !== 'undefined' && DatabaseManager.customers) 
      ? DatabaseManager.customers 
      : JSON.parse(localStorage.getItem('asp_wh_customers')) || [];

    let uniqueSet = new Set();
    
    // Filter out prompts, force uppercase, and trim spaces
    let cleanList = custList
      .filter(c => c && c !== '+ Add Customer' && c.toUpperCase() !== 'SHELF' && c.toUpperCase() !== 'UNTAGGED')
      .map(c => c.trim().toUpperCase());

    // Sort and append only unique names
    cleanList.sort((a, b) => a.localeCompare(b)).forEach(cust => {
      if (!uniqueSet.has(cust)) {
        uniqueSet.add(cust);
        let opt = document.createElement('option');
        opt.value = cust;
        opt.textContent = cust;
        select.appendChild(opt);
      }
    });
  },

  // ADVANCED MODE CONTROLLER
  toggleAdvancedMode(forceState = null) {
    let chk = document.getElementById('chkAdvancedMode');
    
    // If AuthManager forces a state (e.g., Guest Mode = false), uncheck the box
    if (forceState !== null && chk) {
      chk.checked = forceState;
    }
    
    let isAdv = chk ? chk.checked : false;

    // Persist user preference
    localStorage.setItem('asp_advanced_mode', isAdv ? 'true' : 'false');

    // Toggle all advanced UI elements
    let elPreload = document.getElementById('rowPreloadToggle');
    if (elPreload) elPreload.style.display = isAdv ? 'block' : 'none';

    let elFeed = document.getElementById('panelStagedFeed');
    if (elFeed) elFeed.style.display = isAdv ? 'block' : 'none';

    let elReports = document.getElementById('cardCustomerReports');
    if (elReports) elReports.style.display = isAdv ? 'block' : 'none';

    let elHub = document.getElementById('panelEnterpriseHub');
    if (elHub) elHub.style.display = isAdv ? 'block' : 'none';

    let btnStock = document.getElementById('btnStocktake');
    if (btnStock) btnStock.style.display = isAdv ? 'inline-block' : 'none';

    let btnTrace = document.getElementById('btnTraceability');
    if (btnTrace) btnTrace.style.display = isAdv ? 'inline-block' : 'none';
  },

  loadSavedAdvancedMode() {
    let saved = localStorage.getItem('asp_advanced_mode') === 'true';
    let chk = document.getElementById('chkAdvancedMode');
    if (chk) chk.checked = saved;
    this.toggleAdvancedMode();
  },
  
  // QUICK LOOKUP UTILITY MODAL
  openQuickLookupModal() {
    let modal = document.getElementById('quickLookupModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'quickLookupModal';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
      
      modal.innerHTML = `
        <div style="background:#fff; border-radius:8px; width:100%; max-width:480px; max-height:90vh; overflow-y:auto; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #00796b; padding-bottom:8px; margin-bottom:15px;">
            <h3 style="margin:0; color:#00796b;">🔍 Quick Lookup</h3>
            <button onclick="document.getElementById('quickLookupModal').style.display='none'" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
          </div>
          
          <div style="margin-bottom:15px;">
            <label style="font-weight:bold; font-size:0.85rem; display:block; margin-bottom:4px;">Scan or Enter REF / GTIN:</label>
            <div style="display:flex; gap:6px;">
              <input type="text" id="quickLookupInput" placeholder="e.g. 8698G or Scan 2D" style="flex:1; padding:8px; font-size:1rem; text-transform:uppercase;" onkeypress="if(event.key==='Enter') UIManager.executeQuickLookup()">
              <button onclick="UIManager.executeQuickLookup()" style="background:#00796b; color:#fff; border:none; padding:8px 16px; border-radius:4px; font-weight:bold; cursor:pointer;">Search</button>
            </div>
          </div>
          
          <div id="quickLookupResult" style="min-height:120px;">
            <div style="text-align:center; color:#777; padding:20px;">Scan or type a REF/GTIN above to inspect database records.</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    document.getElementById('quickLookupInput').focus();
  },

  executeQuickLookup() {
    let query = document.getElementById('quickLookupInput').value.trim().toUpperCase();
    let resContainer = document.getElementById('quickLookupResult');
    if (!query) return;

    // --- NEW: GS1 BARCODE EXTRACTOR ---
    let clean = query.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\(\)]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    let extractedGtin = "";
    let idx = 0;
    while (idx < clean.length) {
      if (clean.substring(idx, idx + 2) === "17" && clean.length - idx >= 8 && /^\d{6}$/.test(clean.substring(idx + 2, idx + 8))) {
        let testMm = parseInt(clean.substring(idx + 4, idx + 6), 10);
        if (testMm >= 1 && testMm <= 12) { idx += 8; } else { idx++; }
      } else if (clean.substring(idx, idx + 2) === "01" && clean.length - idx >= 16 && /^\d{14}$/.test(clean.substring(idx + 2, idx + 16))) {
        extractedGtin = clean.substring(idx + 2, idx + 16);
        idx += 16;
      } else if (clean.substring(idx, idx + 2) === "10") {
        break;
      } else if (/^\d{12,14}$/.test(clean)) {
        extractedGtin = clean;
        break;
      } else {
        idx++;
      }
    }
    // If a GS1 GTIN was found inside the scan, use that as the search query
    if (extractedGtin) query = extractedGtin;
    // ----------------------------------

    let item = DatabaseManager.db.find(i => 
      DatabaseManager.getItemSku(i).toUpperCase() === query || 
      (i.gtin && i.gtin.toUpperCase() === query)
    );

    if (!item) {
      resContainer.innerHTML = `<div style="background:#ffebee; color:#c62828; padding:12px; border-radius:4px; text-align:center;"><strong>No Match Found</strong><br>REF or GTIN "${query}" is not in the local database catalog.</div>`;
      return;
    }

    let ref = DatabaseManager.getItemSku(item);
    let mfr = DatabaseManager.getItemVendor(item) || 'ETHICON';
    let desc = DatabaseManager.getItemDesc(item) || 'No description available.';
    let price = item.price || '$0.00';
    let cost = item.cost || '$0.00';
    
    // Parse On-Hand FEFO Inventory
    let allSessions = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let lotMap = {};
    let totalOnHand = 0;

    allSessions.forEach(sess => {
      if (sess.status === 'Completed' && sess.scannedObjects) {
        sess.scannedObjects.forEach(s => {
          if (s.ref === ref) {
            let key = `${s.lot}_${s.exp}`;
            if (!lotMap[key]) lotMap[key] = { lot: s.lot, exp: s.exp, qty: 0 };
            if (sess.workflowType.includes('Stocktake') || sess.workflowType.includes('Receiving')) {
              lotMap[key].qty += s.qty;
            } else if (sess.workflowType.includes('Packing')) {
              lotMap[key].qty -= s.qty;
            }
          }
        });
      }
    });

    let lotRows = '';
    Object.values(lotMap).filter(l => l.qty > 0).sort((a,b) => new Date(a.exp) - new Date(b.exp)).forEach(l => {
      totalOnHand += l.qty;
      let expDate = new Date(l.exp);
      let monthsLeft = (expDate - new Date()) / (1000 * 60 * 60 * 24 * 30);
      let alertBadge = monthsLeft <= 6 ? '<span style="color:#d32f2f; font-weight:bold;">🚨 Short-Dated (<6 Mo)</span>' : 
                        (monthsLeft <= 12 ? '<span style="color:#f57f17; font-weight:bold;">⚠️ Short-Dated (<12 Mo)</span>' : '');
      
      lotRows += `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:4px;"><strong>${l.lot}</strong></td>
          <td style="padding:4px;">${l.exp}</td>
          <td style="padding:4px; text-align:center; font-weight:bold;">${l.qty}</td>
          <td style="padding:4px; text-align:right; font-size:0.75rem;">${alertBadge}</td>
        </tr>`;
    });

    resContainer.innerHTML = `
      <div style="background:#f9f9f9; border:1px solid #e0e0e0; border-radius:6px; padding:12px;">
        <div style="font-size:1.1rem; font-weight:bold; color:#00796b;">REF: ${ref}</div>
        <div style="font-size:0.85rem; color:#555; margin-bottom:8px;">Manufacturer: <strong>${mfr}</strong></div>
        <div style="font-size:0.85rem; color:#333; margin-bottom:10px;">${desc}</div>
        
        <div style="background:#fff; border:1px solid #ccc; border-radius:4px; padding:8px; display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.85rem;">
          <span>Selling Price: <strong style="color:#2e7d32;">${price}</strong></span>
          <span>Unit Cost: <strong style="color:#555;">${cost}</strong></span>
        </div>

        <div style="font-weight:bold; font-size:0.85rem; color:#0277bd; margin-bottom:6px;">
          Warehouse Stock On-Hand: ${totalOnHand} Box(es)
        </div>
        
        ${totalOnHand > 0 ? `
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; background:#fff; border:1px solid #ddd;">
            <tr style="background:#eee; text-align:left;">
              <th style="padding:4px;">Lot</th>
              <th style="padding:4px;">Exp</th>
              <th style="padding:4px; text-align:center;">Qty</th>
              <th style="padding:4px; text-align:right;">Status</th>
            </tr>
            ${lotRows}
          </table>
        ` : '<div style="font-size:0.8rem; color:#777; font-style:italic;">No active FEFO inventory recorded on shelves.</div>'}
      </div>
    `;
  },

  openStocktakeModal() {
    document.getElementById('stocktakeModal').style.display = 'flex';
  },

  closeStocktakeModal() {
    document.getElementById('stocktakeModal').style.display = 'none';
  },

  loadSavedTheme() {
    let savedTheme = localStorage.getItem('asp_app_theme') || 'slate';
    this.changeAppTheme(savedTheme);
  },

  changeAppTheme(themeName) {
    document.body.classList.remove('theme-sage', 'theme-gold', 'theme-slate');
    document.body.classList.add(`theme-${themeName}`);
    localStorage.setItem('asp_app_theme', themeName);
    let sel = document.getElementById('themeSelect');
    if (sel) sel.value = themeName;
  },

  changeFontSize(sizeVal) {
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${sizeVal}`);
    localStorage.setItem('asp_font_size', sizeVal);
  },

  loadFontPreference() {
    let savedSize = localStorage.getItem('asp_font_size') || 'medium';
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${savedSize}`);
    let fontSelect = document.getElementById('fontSizeSelect');
    if (fontSelect) fontSelect.value = savedSize;
  },

  toggleSessionType() {
    const type = document.querySelector('input[name="sessionType"]:checked').value;
    document.getElementById('rowSupplier').style.display = type === 'Shipment' ? 'flex' : 'none';
    document.getElementById('rowCustomer').style.display = type === 'Order' ? 'flex' : 'none';
    document.getElementById('rowProcess').style.display = type === 'Order' ? 'flex' : 'none';
  },

  formatExpDate(inputEl) {
    let val = inputEl.value.replace(/\D/g, ''); 
    if (!val) return;
    if(val.length >= 8) {
        let mm = val.substring(0,2), dd = val.substring(2,4), yyyy = val.substring(4,8);
        if (parseInt(val.substring(0,4)) > 1900) { yyyy = val.substring(0,4); mm = val.substring(4,6); dd = val.substring(6,8); }
        inputEl.value = `${yyyy}-${mm}-${dd}`;
    } else if (val.length === 6) {
        let yy = val.substring(4,6);
        let year = parseInt(yy) < 50 ? (2000 + parseInt(yy)) : (1900 + parseInt(yy));
        inputEl.value = `${year}-${val.substring(0,2)}-${val.substring(2,4)}`;
    }
    this.evaluateFieldAttention();
  },

  toggleNA(fieldId, chkId) {
    let field = document.getElementById(fieldId);
    let chk = document.getElementById(chkId);
    if (!field || !chk) return;
    if (chk.checked) { field.value = "N/A"; field.readOnly = true; field.classList.remove('needs-attention'); } 
    else { field.value = ""; field.readOnly = false; field.classList.add('needs-attention'); }
    this.evaluateFieldAttention();
  },

  toggleItemNote() {
    let chk = document.getElementById('chkItemNote');
    let row = document.getElementById('rowItemNote');
    if (chk && row) { row.style.display = chk.checked ? 'flex' : 'none'; if (!chk.checked) document.getElementById('itemNoteInput').value = ""; }
  },

  toggleSessionNote() {
    let chk = document.getElementById('chkSessionNote');
    let row = document.getElementById('rowSessionNote');
    if (chk && row) { row.style.display = chk.checked ? 'block' : 'none'; if (!chk.checked) document.getElementById('sessionNoteInput').value = ""; }
  },

  evaluateFieldAttention() {
    [{ el: document.getElementById('gtinInput'), chk: document.getElementById('chkNaGtin') },
     { el: document.getElementById('lotInput'), chk: document.getElementById('chkNaLot') },
     { el: document.getElementById('expInput'), chk: document.getElementById('chkNaExp') },
     { el: document.getElementById('refInput'), chk: null },
     { el: document.getElementById('vendorSelect'), chk: null }
    ].forEach(obj => {
      if (!obj.el) return;
      if (obj.chk && obj.chk.checked) obj.el.classList.remove('needs-attention');
      else if (!obj.el.value.trim()) obj.el.classList.add('needs-attention');
      else obj.el.classList.remove('needs-attention');
    });
    this.updateCameraOverlayStatus();
  },

    openReportsHub() {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenReports').style.display = 'block';
    if (typeof UIManager.populateCustomerDropdown === 'function') UIManager.populateCustomerDropdown();
  },

  closeReportsHub() {
    document.getElementById('screenReports').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  openDbEditor() {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenDbEditor').style.display = 'block';
    DatabaseManager.renderDbGridEditor();
  },

  closeDbEditor() {
    document.getElementById('screenDbEditor').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  updateCameraOverlayStatus() {
    const hasGtin = document.getElementById('gtinInput').value.trim() !== '' || document.getElementById('chkNaGtin').checked;
    const hasLot = document.getElementById('lotInput').value.trim() !== '' || document.getElementById('chkNaLot').checked;
    const hasExp = document.getElementById('expInput').value.trim() !== '' || document.getElementById('chkNaExp').checked;
    if (document.getElementById('tagGtin')) document.getElementById('tagGtin').classList.toggle('captured', hasGtin);
    if (document.getElementById('tagLot')) document.getElementById('tagLot').classList.toggle('captured', hasLot);
    if (document.getElementById('tagExp')) document.getElementById('tagExp').classList.toggle('captured', hasExp);
  },

  setItemAction(act) {
    SessionManager.currentItemAction = act;
    if (document.getElementById('actBtnInv')) document.getElementById('actBtnInv').className = 'action-btn' + (act === 'Inventory' ? ' selected-inv' : '');
    if (document.getElementById('actBtnRes')) document.getElementById('actBtnRes').className = 'action-btn' + (act === 'Reserved' ? ' selected-res' : '');
    let tagRow = document.getElementById('rowCustomerTag');
    if (tagRow && SessionManager.currentWorkflowType.includes('Receiving & Reserving')) tagRow.style.display = (act === 'Reserved') ? 'flex' : 'none';
  },

  hideAllConfirmButtons() {
    if (document.getElementById('btnConfirmGtin')) document.getElementById('btnConfirmGtin').style.display = 'none';
    if (document.getElementById('btnConfirmMfr')) document.getElementById('btnConfirmMfr').style.display = 'none';
    if (document.getElementById('gtinDiffBanner')) document.getElementById('gtinDiffBanner').style.display = 'none';
  },

  openAuditHub() {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenAuditHub').style.display = 'block';
  },

  closeAuditHub() {
    document.getElementById('screenAuditHub').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  async triggerShareOrDownload(content, filename, mimeType) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'Export Document', accept: { [mimeType]: [filename.substring(filename.lastIndexOf('.'))] } }] });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        alert("Export successful!");
        return;
      } catch (err) { if (err.name === 'AbortError') return; }
    }
    let file = new File([content], filename, { type: mimeType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { console.warn("Share fallback."); }
    }
    try {
        let blob = new Blob([content], { type: mimeType });
        let a = document.createElement('a'); let url = window.URL.createObjectURL(blob);
        a.style.display = 'none'; a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
        alert("Export successfully saved to Downloads!");
    } catch (e) { alert("Export failed: " + e.message); }
  }
};
