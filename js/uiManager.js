/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/uiManager.js
 * Author: Thomas Seyfors
 * Date Created: August 2026
 * 
 * Description:
 *   User interface interaction manager handling theme toggling, dynamic font 
 *   scaling, field validation highlighting, dynamic modals, and native 
 *   file download triggers.
 *
 * Affected Features:
 *   - Customer Bin & Damaged Bin Viewers
 *   - Quick Item Lookup Modal
 *   - Alert & Confirmation Modals
 *   - Sandbox Environment Toggles
 *   - Live Debug Console Floating UI
 *   - Native Blob / PDF File Downloader
 *
 * Copyright (c) 2026 Thomas Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const UIManager = {// GLOBAL CONFIGURATIONS
  printTimeout: 1600,

  handleSandboxToggle(chkEl) {
    let isChecked = chkEl.checked;
    
    // Check if there is pending data that hasn't been pushed
    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let pendingSessions = archive.filter(s => s.status === 'Pending' || (s.status === 'Completed' && !s.isSynced));
    let pendingNew = JSON.parse(localStorage.getItem('asp_pending_new_items')) || [];
    let pendingUpd = JSON.parse(localStorage.getItem('asp_pending_updates')) || [];

    if (pendingSessions.length > 0 || pendingNew.length > 0 || pendingUpd.length > 0) {
      this.showCustomAlert("Action Blocked", "You have pending sessions or un-synced database edits! Please upload or purge your local history before switching environments.", true);
      chkEl.checked = !isChecked; // Revert the checkbox visually
      return;
    }

    this.showCustomConfirm(
      "Switch Environments?", 
      "Switching between Production and Sandbox will completely wipe this device's local memory to prevent cross-contamination.\n\nYou will need to click 'Sync System' afterward to download the correct database.", 
      () => {
        // Wipe the memory
        localStorage.removeItem('asp_wh_db');
        localStorage.removeItem('asp_session_archive');
        localStorage.removeItem('asp_allocations');
        localStorage.removeItem('asp_pending_new_items');
        localStorage.removeItem('asp_pending_updates');
        localStorage.removeItem('asp_last_cloud_sync');
        if(typeof DatabaseManager !== 'undefined') DatabaseManager.db = [];
        
        SessionManager.applyTestingModeVisuals(isChecked);

        chkEl.checked = isChecked;
        
        // Return home so they can sync
        if(document.getElementById('screenDevTools')) document.getElementById('screenDevTools').style.display = 'none';
        if(document.getElementById('screenSetup')) document.getElementById('screenSetup').style.display = 'block';
        
        setTimeout(() => alert("Environment switched successfully. Local memory wiped.\n\nPlease click 'Sync System' now."), 300);
      }
    );
    
    // Revert visually immediately until they confirm
    chkEl.checked = !isChecked; 
  },
  
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
    if (forceState !== null && chk) chk.checked = forceState;
    let isAdv = chk ? chk.checked : false;
    localStorage.setItem('asp_advanced_mode', isAdv ? 'true' : 'false');

    let elPreload = document.getElementById('rowPreloadToggle');
    if (elPreload) elPreload.style.display = isAdv ? 'block' : 'none';

    let elHub = document.getElementById('panelEnterpriseHub');
    if (elHub) elHub.style.display = isAdv ? 'block' : 'none';
    
    let elDamaged = document.getElementById('panelDamagedHub');
    if (elDamaged) elDamaged.style.display = isAdv ? 'block' : 'none';
    
    this.togglePreloadFeed();
  },

  togglePreloadFeed() {
    let preloadChk = document.getElementById('chkPreloadManifest');
    let feedPanel = document.getElementById('panelStagedFeed');
    let advChk = document.getElementById('chkAdvancedMode');
    
    if (feedPanel && preloadChk && advChk) {
      // Only show the feed if BOTH Advanced Mode AND the Pre-Load checkbox are checked
      feedPanel.style.display = (advChk.checked && preloadChk.checked) ? 'block' : 'none';
    }
  },

  // ==========================================
  // CUSTOMER BIN VIEWER MODAL
  // ==========================================
  openBinViewerModal() {
    let modal = document.getElementById('binViewerModal');
    if (modal) modal.remove(); // Force a fresh render

    // Fetch live allocations and filter out the internal damaged bin
    let allocations = JSON.parse(localStorage.getItem('asp_allocations')) || {};
    let customersWithStock = Object.keys(allocations).filter(c => c.toUpperCase() !== "ASP DAMAGED INVENTORY").sort();    

    // Build the HTML content
    let contentHtml = '';
    
    if (customersWithStock.length === 0) {
        contentHtml = `<div style="text-align:center; padding:20px; color:#777; font-style:italic;">No active reservations found. All customer bins are currently empty.</div>`;
    } else {
        customersWithStock.forEach(cust => {
            let items = allocations[cust];
            let totalItems = 0;
            let rowsHtml = '';
            
            // Build the item rows for this customer
            Object.keys(items).sort().forEach(ref => {
                // FIX: Force Javascript to treat the value as an integer using parseInt
                let rawQty = typeof items[ref] === 'object' ? (items[ref].qty || 0) : (items[ref] || 0);
                let qty = parseInt(rawQty, 10) || 0; 
                
                if (qty <= 0) return;
                
                totalItems += qty;
                rowsHtml += `
                    <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed #ccc; font-size:0.85rem;">
                        <span style="font-weight:bold; color:#0277bd;">${ref}</span>
                        <span style="font-weight:bold; color:#333;">Qty: ${qty}</span>
                    </div>
                `;
            });

            // Wrap the customer's data in a collapsible accordion details block
            contentHtml += `
                <details style="background:#f9f9f9; border:1px solid #e0e0e0; border-radius:4px; margin-bottom:8px; padding:6px;">
                    <summary style="cursor:pointer; font-weight:bold; display:flex; justify-content:space-between; outline:none;">
                        <span style="color:#0277bd; display:flex; align-items:center; gap:6px;"><i data-lucide="folder" style="width:16px; height:16px;"></i> ${cust}</span>
                        <span class="badge-info" style="background:#f57f17; color:#fff;">${totalItems} Total Units</span>
                    </summary>
                    <div style="padding-top:8px; margin-top:6px; border-top:2px solid #0277bd;">
                        ${rowsHtml}
                    </div>
                </details>
            `;
        });
    }

    // Render the Modal
    modal = document.createElement('div');
    modal.id = 'binViewerModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    
    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:500px; max-height:85vh; display:flex; flex-direction:column; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
        
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f57f17; padding-bottom:8px; margin-bottom:15px; flex-shrink:0;">
          <h3 style="margin:0; color:#f57f17;">🗃️ Customer Bin Viewer</h3>
          <button onclick="document.getElementById('binViewerModal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
        </div>
        
        <div style="font-size:0.85rem; color:#555; margin-bottom:15px; flex-shrink:0;">
          Expand a customer below to view items currently reserved for them in physical warehouse bins.
        </div>
        
        <div style="overflow-y:auto; flex-grow:1; padding-right:4px;">
            ${contentHtml}
        </div>
        
        <div style="margin-top:15px; text-align:right; flex-shrink:0; border-top:1px solid #eee; padding-top:12px;">
            <button class="btn-small btn-cancel" style="padding:8px 16px;" onclick="document.getElementById('binViewerModal').remove()">Close Viewer</button>
        </div>

      </div>
    `;
    
    document.body.appendChild(modal);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  openDamagedBinViewerModal() {
    let modal = document.getElementById('damagedBinViewerModal');
    if (modal) modal.remove();

    let allocations = JSON.parse(localStorage.getItem('asp_allocations')) || {};
    let damagedItems = allocations["ASP DAMAGED INVENTORY"] || {};
    let totalItems = 0;
    let rowsHtml = '';

    Object.keys(damagedItems).sort().forEach(ref => {
        let data = damagedItems[ref];
        if (data.details && data.details.length > 0) {
            data.details.forEach(det => {
                if (det.qty > 0) {
                    totalItems += det.qty;
                    rowsHtml += `
                        <div style="padding:8px 0; border-bottom:1px dashed #ccc; font-size:0.85rem;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span style="font-weight:bold; color:#c62828;">${ref}</span>
                                <span style="font-weight:bold; color:#333;">Qty: ${det.qty}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:#555;">
                                <span>Lot: ${det.lot} | Exp: ${det.exp}</span>
                                <span style="font-style:italic;">Note: ${det.orderNum || 'None'}</span>
                            </div>
                        </div>`;
                }
            });
        }
    });

    let contentHtml = totalItems === 0 
      ? `<div style="text-align:center; padding:20px; color:#777; font-style:italic;">No damaged items currently recorded.</div>`
      : rowsHtml;

    modal = document.createElement('div');
    modal.id = 'damagedBinViewerModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    
    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:500px; max-height:85vh; display:flex; flex-direction:column; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #c62828; padding-bottom:8px; margin-bottom:15px; flex-shrink:0;">
          <h3 style="margin:0; color:#c62828;">⚠️ Damaged Inventory (${totalItems} Units)</h3>
          <button onclick="document.getElementById('damagedBinViewerModal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
        </div>
        <div style="overflow-y:auto; flex-grow:1; padding-right:4px;">
            ${contentHtml}
        </div>
        <div style="margin-top:15px; display:flex; justify-content:space-between; flex-shrink:0; border-top:1px solid #eee; padding-top:12px;">
            <button class="btn-small btn-auto" style="background:#0277bd; color:#fff; padding:8px 16px;" onclick="UIManager.exportDamagedItemsCSV()">📥 Export CSV</button>
            <button class="btn-small btn-cancel" style="padding:8px 16px;" onclick="document.getElementById('damagedBinViewerModal').remove()">Close Viewer</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  exportDamagedItemsCSV() {
    let allocations = JSON.parse(localStorage.getItem('asp_allocations')) || {};
    let damagedItems = allocations["ASP DAMAGED INVENTORY"] || {};
    
    let csvContent = "REF/SKU,QUANTITY,LOT,EXPIRATION,NOTE/REASON\r\n";
    let hasData = false;

    Object.keys(damagedItems).sort().forEach(ref => {
        let data = damagedItems[ref];
        if (data.details && data.details.length > 0) {
            data.details.forEach(det => {
                if (det.qty > 0) {
                    hasData = true;
                    let safeNote = String(det.orderNum || '').replace(/"/g, '""');
                    csvContent += `"${ref}",${det.qty},"${det.lot}","${det.exp}","${safeNote}"\r\n`;
                }
            });
        }
    });

    if (!hasData) {
        alert("No damaged items to export.");
        return;
    }

    let dateStr = new Date().toLocaleDateString().replace(/\//g, '.');
    this.triggerShareOrDownload(csvContent, `ASP_Damaged_Items_${dateStr}.csv`, 'text/csv');
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
    let query = document.getElementById('quickLookupInput').value.trim();
    let resContainer = document.getElementById('quickLookupResult');
    if (!query) return;

    let clean = query.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\(\)]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    let extractedGtin = "";
    let idx = 0;
    while (idx < clean.length) {
      if (clean.substring(idx, idx + 2) === "17" && clean.length - idx >= 8 && /^\d{6}$/.test(clean.substring(idx + 2, idx + 8))) {
        let testMm = parseInt(clean.substring(idx + 4, idx + 6), 10);
        if (testMm >= 1 && testMm <= 12) { idx += 8; } else { idx++; }
      } else if (clean.substring(idx, idx + 2) === "01" && clean.length - idx >= 16 && /^\d{14}$/.test(clean.substring(idx + 2, idx + 16))) {
        extractedGtin = clean.substring(idx + 2, idx + 16); idx += 16;
      } else if (clean.substring(idx, idx + 2) === "10") { break;
      } else if (/^\d{12,14}$/.test(clean)) { extractedGtin = clean; break;
      } else { idx++; }
    }
    
    // Determine what to pass to the engine
    let searchRef = extractedGtin ? "" : clean;
    let searchGtin = extractedGtin ? extractedGtin : "";

    let item;
    try {
        // USE THE NEW ENGINE STRICT LOOKUP
        item = InventoryEngine.lookupAndNormalize(searchRef, searchGtin, DatabaseManager.db);
        if (!item) throw new Error("Item not found"); // Explicitly throw if null
    } catch (e) {
        resContainer.innerHTML = `<div style="background:#ffebee; color:#c62828; padding:12px; border-radius:4px; text-align:center;"><strong>No Match Found</strong><br>REF or GTIN "${query}" does not exist in the local catalog.</div>`;
        return;
    }

    let ref = DatabaseManager.getItemSku(item);
    let mfr = DatabaseManager.getItemVendor(item) || 'UNKNOWN';
    let desc = DatabaseManager.getItemDesc(item) || 'No description available.';
    let isAdmin = AuthManager.currentUser && AuthManager.currentUser.isAdmin;
    let price = item.price || '$0.00';
    let cost = isAdmin ? (item.cost || '$0.00') : '<span style="color:#999; font-style:italic;">Admin Only</span>';
    
    let dbOnHand = parseInt(item.onHand || item.TotalQty, 10) || 0;
    let dbReserved = parseInt(item.reservedQty, 10) || 0;
    let dbAvailable = dbOnHand - dbReserved;

    // --- LIVE CLOUD LOT TRACING ---
    resContainer.innerHTML = `
      <div style="background:#f9f9f9; border:1px solid #e0e0e0; border-radius:6px; padding:12px;">
        <div style="font-size:1.1rem; font-weight:bold; color:#00796b;">REF: ${ref}</div>
        <div style="font-size:0.85rem; color:#555; margin-bottom:8px;">Manufacturer: <strong>${mfr}</strong></div>
        <div style="font-size:0.85rem; color:#333; margin-bottom:10px;">${desc}</div>
        <div style="background:#fff; border:1px solid #ccc; border-radius:4px; padding:8px; display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.85rem;">
          <span>Selling Price: <strong style="color:#2e7d32;">${price}</strong></span>
          <span>Unit Cost: <strong style="color:#555;">${cost}</strong></span>
        </div>
        <div style="font-weight:bold; font-size:0.85rem; color:#0277bd; margin-bottom:6px; display:flex; justify-content:space-between;">
          <span>Total On-Hand: ${dbOnHand}</span>
          <span style="color:${dbAvailable > 0 ? '#2e7d32' : '#c62828'};">Available to Sell: ${dbAvailable}</span>
        </div>
        <div id="quickLookupLotBox" style="text-align:center; padding:10px; color:#00796b; font-weight:bold;">⏳ Querying Live Cloud Ledger for Lot History...</div>
      </div>
    `;

    if (dbOnHand > 0 || dbReserved > 0) {
      // If we have inventory, fetch the cloud log to build the exact lots
      fetch(`${SessionManager.getActiveArchiveUrl()}?action=GET_AUDIT_LOG&t=${Date.now()}`)
        .then(res => res.text())
        .then(text => {
          let responseData = JSON.parse(text);
          if (responseData.status !== "success" || !responseData.data) throw new Error("Failed");

          let lotMap = {};
          responseData.data.forEach(row => {
            let rowRef = row['REF / SKU'];
            let lot = row['Lot'];
            let exp = row['Exp Date'];
            let qty = parseInt(row['Qty Moved'], 10) || 0;
            let workflow = row['Workflow'] || '';
            
            if (rowRef === ref && lot && lot !== 'N/A') {
              let key = `${lot}_${exp}`;
              if (!lotMap[key]) lotMap[key] = { lot: lot, exp: exp, qty: 0 };
              
              if (workflow.includes('Receiving') || workflow.includes('Stocktake')) { lotMap[key].qty += qty; }
              else if (workflow.includes('Packing') || workflow.includes('Pack & Ship')) { lotMap[key].qty -= qty; }
            }
          });

          let lotRows = '';
          Object.values(lotMap).filter(l => l.qty > 0).sort((a,b) => new Date(a.exp) - new Date(b.exp)).forEach(l => {
            let expDate = new Date(l.exp);
            let monthsLeft = (expDate - new Date()) / (1000 * 60 * 60 * 24 * 30);
            let alertBadge = monthsLeft <= 6 ? '<span style="color:#d32f2f; font-weight:bold;">🚨 Short (<6m)</span>' : (monthsLeft <= 12 ? '<span style="color:#f57f17; font-weight:bold;">⚠️ Short (<12m)</span>' : '');
            lotRows += `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;"><strong>${l.lot}</strong></td><td style="padding:4px;">${l.exp}</td><td style="padding:4px; text-align:center; font-weight:bold;">${l.qty}</td><td style="padding:4px; text-align:right; font-size:0.75rem;">${alertBadge}</td></tr>`;
          });

          let box = document.getElementById('quickLookupLotBox');
          if (box) {
            box.innerHTML = lotRows 
              ? `<table style="width:100%; border-collapse:collapse; font-size:0.8rem; background:#fff; border:1px solid #ddd; margin-top:8px;"><tr style="background:#eee; text-align:left;"><th style="padding:4px;">Lot</th><th style="padding:4px;">Exp</th><th style="padding:4px; text-align:center;">Qty</th><th style="padding:4px; text-align:right;">Status</th></tr>${lotRows}</table>`
              : `<div style="font-size:0.8rem; color:#777; font-style:italic; padding:10px;">Physical inventory exists, but no lot tracking data was found.</div>`;
            box.style.textAlign = 'left';
            box.style.padding = '0';
          }
        })
        .catch(err => {
          let box = document.getElementById('quickLookupLotBox');
          if (box) box.innerHTML = `<span style="color:#c62828;">⚠️ Cloud ledger unreachable.</span>`;
        });
    } else {
      let box = document.getElementById('quickLookupLotBox');
      if (box) {
        box.innerHTML = `<div style="font-size:0.8rem; color:#777; font-style:italic; padding:10px;">No physical inventory available to track.</div>`;
        box.style.padding = '0';
      }
    }
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
    if (typeof AuditManager.loadCloudSessionsForExport === 'function') AuditManager.loadCloudSessionsForExport();
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
    try {
      // Create a Blob and generate an object URL
      let blob = new Blob([content], { type: mimeType });
      let a = document.createElement('a');
      let url = window.URL.createObjectURL(blob);
      
      // Assign download attributes and trigger silently
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up DOM and memory
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      alert("Export failed: " + e.message);
    }
  },

  openQboModal() {
    let modal = document.getElementById('qboModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'qboModal';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
      
      modal.innerHTML = `
        <div style="background:#fff; border-radius:8px; width:100%; max-width:480px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1565c0; padding-bottom:8px; margin-bottom:15px;">
            <h3 style="margin:0; color:#1565c0;">☁️ QuickBooks Online Sync</h3>
            <button onclick="document.getElementById('qboModal').style.display='none'" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
          </div>
          
          <p style="font-size:0.85rem; color:#555; margin-bottom:20px;">
            Fetch open invoices from QuickBooks Online.
          </p>

          <div style="text-align:center; margin-bottom: 20px;">
            <button class="btn-action btn-auto" style="background-color: #1565c0; color: #fff; width: 100%; padding: 12px; font-size: 1rem;" onclick="triggerQboSync(event); document.getElementById('qboModal').style.display='none';">Fetch QBO Orders</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
  },

  evaluateSyncIndicator() {
    let indicator = document.getElementById('syncIndicator');
    if (!indicator) return;

    // Check if we have un-synced completed sessions
    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let unpushedCompleted = archive.filter(s => s.status === 'Completed' && !s.isSynced).length > 0;
    
    // Check if we have un-pushed database changes
    let pendingNew = JSON.parse(localStorage.getItem('asp_pending_new_items')) || [];
    let pendingUpd = JSON.parse(localStorage.getItem('asp_pending_updates')) || [];

    if (unpushedCompleted || pendingNew.length > 0 || pendingUpd.length > 0) {
      indicator.style.display = 'inline-block';
    } else {
      indicator.style.display = 'none';
    }
  },

  showCustomAlert(title, message, isError = false) {
    let modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    let color = isError ? '#c62828' : '#0277bd';
    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:400px; padding:20px; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
        <h3 style="color:${color}; margin-top:0;">${title}</h3>
        <p style="color:#555; font-size:0.95rem; margin-bottom:20px;">${message}</p>
        <button onclick="this.parentElement.parentElement.remove()" style="background:${color}; color:#fff; border:none; padding:10px 20px; border-radius:4px; font-weight:bold; cursor:pointer; width:100%;">OK</button>
      </div>`;
    document.body.appendChild(modal);
  },

  showCustomConfirm(title, message, onConfirmCallback) {
    let modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:400px; padding:20px; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
        <h3 style="color:#0277bd; margin-top:0;">${title}</h3>
        <p style="color:#555; font-size:0.95rem; margin-bottom:20px;">${message}</p>
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="flex:1; background:#757575; color:#fff; border:none; padding:10px; border-radius:4px; cursor:pointer;">Cancel</button>
          <button id="btnConfirmAction" style="flex:1; background:#0277bd; color:#fff; border:none; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('btnConfirmAction').onclick = () => { modal.remove(); onConfirmCallback(); };
  },

  async checkForCloudUpdates() {
    let indicator = document.getElementById('syncIndicator');
    if (!indicator) return;

    try {
      let localLastSync = parseInt(localStorage.getItem('asp_last_cloud_sync') || '0', 10);
      let res = await fetch(`${SessionManager.cloudArchiveUrl}?action=CHECK_VERSION`);
      let data = await res.json();

      if (data && data.lastUpdated && data.lastUpdated > localLastSync) {
        
        let pendingNew = JSON.parse(localStorage.getItem('asp_pending_new_items')) || [];
        let pendingUpd = JSON.parse(localStorage.getItem('asp_pending_updates')) || [];
        
        // SAFETY GATE: Only sync if the user is sitting idle on the home screen
        let isSafeToSync = !SessionManager.isSessionActive && pendingNew.length === 0 && pendingUpd.length === 0;

        if (isSafeToSync && typeof DatabaseManager.downloadCloudDatabase === 'function') {
            await DatabaseManager.downloadCloudDatabase(null, true);
            localStorage.setItem('asp_last_cloud_sync', Date.now().toString());
            indicator.style.display = 'none'; // Hide badge once synced
        } else {
            // Unsafe to sync automatically. Show the warning badge to the user.
            indicator.innerHTML = '<i data-lucide="circle-alert" style="width:14px; height:14px; vertical-align:text-bottom;"></i> Cloud Updates Available';
            indicator.style.display = 'inline-block';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    } catch (err) {
      console.warn("Could not check cloud version:", err);
    }
  },

  async openHelpScreen() {
    document.getElementById('screenSettings').style.display = 'none';
    document.getElementById('screenHelp').style.display = 'block';

    const container = document.getElementById('helpContentContainer');
    try {
      let res = await fetch('Help.md');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let mdText = await res.text();
      
      if (typeof showdown !== 'undefined') {
        let converter = new showdown.Converter({ tables: true, strikethrough: true, tasklists: true });
        container.innerHTML = converter.makeHtml(mdText);
      } else {
        // Fallback if CDN is offline
        container.innerHTML = `<pre style="white-space:pre-wrap; font-family:inherit;">${mdText}</pre>`;
      }
    } catch (err) {
      container.innerHTML = `<div style="color:#c62828; padding:10px;">Failed to load Help.md: ${err.message}</div>`;
    }
  },

  closeHelpScreen() {
    document.getElementById('screenHelp').style.display = 'none';
    document.getElementById('screenSettings').style.display = 'block';
  },

  openDevTools() {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenDevTools').style.display = 'block';
    
    // Load available sessions into the reversal dropdown
    if (typeof SessionManager !== 'undefined' && typeof SessionManager.loadReversibleSessions === 'function') {
      SessionManager.loadReversibleSessions();
    }
  },

  closeDevTools() {
    document.getElementById('screenDevTools').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  sendBugReport() {
    let modal = document.createElement('div');
    modal.id = 'bugReportModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    
    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:500px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
        <h3 style="margin:0 0 10px 0; color:#c62828; display:flex; align-items:center; gap:6px;"><i data-lucide="bug" style="width:20px; height:20px;"></i> Report a System Issue</h3>
        <p style="font-size:0.85rem; color:#555; margin-top:0;">Please describe the error or unexpected behavior below. Diagnostic data will be attached automatically.</p>
        
        <div style="margin-bottom:12px;">
          <label style="font-weight:bold; font-size:0.85rem; color:#333; display:block; margin-bottom:4px;">Issue Category:</label>
          <select id="bugCategorySelect" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:0.9rem;">
            <option value="General Bug / App Error">🐞 General Bug / App Error</option>
            <option value="Scanning / Barcode Issue">📦 Scanning / Barcode Issue</option>
            <option value="Database Correction">🗄️ Database / Item Info Correction</option>
            <option value="Feature Request">✨ Feature Request / Suggestion</option>
            <option value="Other">❓ Other / Not Sure</option>
          </select>
        </div>

        <textarea id="bugDescInput" rows="4" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; resize:vertical; font-family:inherit; font-size:0.9rem;" placeholder="What were you doing when the issue occurred?"></textarea>
        
        <div style="display:flex; justify-content:space-between; gap:10px; margin-top:15px;">
          <button onclick="document.getElementById('bugReportModal').remove()" style="flex:1; background:#757575; color:#fff; border:none; padding:10px; border-radius:4px; cursor:pointer;">Cancel</button>
          <button id="btnSubmitBug" onclick="UIManager.submitBugPayload()" style="flex:1; background:#c62828; color:#fff; border:none; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:6px;">Submit Report</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  async submitBugPayload() {
    let desc = document.getElementById('bugDescInput').value.trim();
    if (!desc) {
      alert("Please provide a description of the issue.");
      return;
    }

    // Grab the category and format it into the description payload
    let category = document.getElementById('bugCategorySelect').value;
    let formattedDesc = `[${category}]\n${desc}`;
    
    let btn = document.getElementById('btnSubmitBug');
    if (btn) { btn.textContent = "Sending..."; btn.disabled = true; }
    
    let userName = (typeof AuthManager !== 'undefined' && AuthManager.currentUser) ? AuthManager.currentUser.name : "Unknown Operator";
    let isSandbox = document.getElementById('chkSandboxMode') ? document.getElementById('chkSandboxMode').checked : false;
    
    let versionText = "Unknown";
    let versionEl = document.getElementById('appVersionDisplay');
    if (versionEl) {
      versionText = versionEl.textContent.replace('App Version:', '').trim();
    }
    
    let payload = {
      action: "REPORT_BUG",
      payload: {
        userName: userName,
        appVersion: versionText,
        sessionName: (typeof SessionManager !== 'undefined') ? SessionManager.currentSessionName : "None",
        workflowType: (typeof SessionManager !== 'undefined') ? SessionManager.currentWorkflowType : "None",
        description: formattedDesc,
        environment: isSandbox ? "Sandbox" : "Production"
      }
    };

    try {
      let activeUrl = (typeof SessionManager !== 'undefined') ? SessionManager.cloudArchiveUrl : "https://script.google.com/macros/s/AKfycbzJw6P78vbvpYVOAqBqkAJezLpk1SXxwF1ndSs3my6ZeF3pJh1tBHvyGwWcuYsB63uG/exec";
      
      await fetch(activeUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      
      document.getElementById('bugReportModal').remove();
      this.showCustomAlert("Report Sent", "✅ Thank you! Your bug report and diagnostic data have been sent to IT Operations.");
    } catch (err) {
      alert("Failed to send bug report. Please check your internet connection.");
      if (btn) { btn.textContent = "Submit Report"; btn.disabled = false; }
    }
  },

  initDebugConsole() {
    if (this.debugConsoleInitialized) return;
    this.debugConsoleInitialized = true;
    
    // Create the floating console container dynamically
    const floatContainer = document.createElement('div');
    floatContainer.id = 'floatingDebugConsoleContainer';
    floatContainer.style.cssText = 'display:none; position:fixed; bottom:20px; right:20px; width:350px; height:280px; background:rgba(26, 29, 32, 0.95); border:2px solid #4caf50; border-radius:6px; z-index:999999; flex-direction:column; box-shadow:0 6px 20px rgba(0,0,0,0.6);';
    
    floatContainer.innerHTML = `
      <div style="background:#2e7d32; color:#fff; padding:8px 12px; font-weight:bold; font-size:0.9rem; display:flex; justify-content:space-between; align-items:center; border-top-left-radius:4px; border-top-right-radius:4px; cursor:move;" id="floatingDebugHeader">
        <span>🐞 Debug Console</span>
        <div>
          <button onclick="document.getElementById('customDebugOutput').innerHTML=''" style="background:none; border:none; color:#fff; cursor:pointer; margin-right:12px; font-size:1.1rem;" title="Clear Logs">🚫</button>
          <button onclick="UIManager.toggleDebugConsole()" style="background:none; border:none; color:#fff; cursor:pointer; font-size:1.1rem;" title="Hide Console">✖</button>
        </div>
      </div>
      <div id="customDebugOutput" style="flex:1; padding:10px; overflow-y:auto; color:#a5d6a7; font-family:monospace; font-size:0.8rem; display:flex; flex-direction:column; gap:4px;">
        <div style="color:#888;">> Console initialized... Waiting for events.</div>
      </div>
    `;
    document.body.appendChild(floatContainer);

    // Make the console draggable by its header
    const header = document.getElementById('floatingDebugHeader');
    let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
    
    header.addEventListener('mousedown', (e) => {
      initialX = e.clientX - xOffset; initialY = e.clientY - yOffset;
      if (e.target === header || e.target.parentNode === header) isDragging = true;
    }, false);
    
    document.addEventListener('mouseup', () => { initialX = currentX; initialY = currentY; isDragging = false; }, false);
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX; currentY = e.clientY - initialY;
        xOffset = currentX; yOffset = currentY;
        floatContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      }
    }, false);

    // Override native console to output to UI
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    const logToUI = (msg, color) => {
      const consoleEl = document.getElementById('customDebugOutput');
      if (!consoleEl) return;
      const div = document.createElement('div');
      div.style.color = color;
      div.style.borderBottom = '1px solid #444';
      div.style.padding = '4px 0';
      
      let text = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
      const timestamp = new Date().toLocaleTimeString([], {hour12:false});
      div.textContent = `[${timestamp}] ${text}`;
      consoleEl.appendChild(div);
      consoleEl.scrollTop = consoleEl.scrollHeight;
    };

    console.log = (...args) => { originalLog.apply(console, args); logToUI(args.join(' '), '#a5d6a7'); };
    console.warn = (...args) => { originalWarn.apply(console, args); logToUI(args.join(' '), '#ffcc80'); };
    console.error = (...args) => { originalError.apply(console, args); logToUI(args.join(' '), '#ef9a9a'); };
  },

  toggleDebugConsole() {
    let fc = document.getElementById('floatingDebugConsoleContainer');
    if (fc) {
      fc.style.display = fc.style.display === 'none' ? 'flex' : 'none';
    }
  }
};
