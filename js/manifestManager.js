/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/manifestManager.js
 * Description: Pre-load manifest compilation and discrepancy tracker.
 * ======================================================================= */
const ManifestManager = {
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
        <button class="btn-small btn-auto" style="font-size:0.75rem; padding:2px 8px; background-color:#0277bd;" onclick="ManifestManager.addManifestAllocation(${rowIdx})">+ Add Customer Allocation</button>
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
        continue;
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
    SessionManager.expectedManifest = this.readManifestDataFromUI();
    if (SessionManager.expectedManifest.length === 0) { alert("Please enter at least one expected item row."); return; }
    let totalExp = SessionManager.expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);
    
    let html = `<div style="margin-bottom:15px; text-align:center;"><strong>Total Expected Pieces:</strong> ${totalExp} across ${SessionManager.expectedManifest.length} unique REFs</div>`;
    SessionManager.expectedManifest.forEach(item => {
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
    localStorage.setItem('asp_active_manifest', JSON.stringify(SessionManager.expectedManifest));
    document.getElementById('screenManifestReview').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
    this.updateManifestProgressUI();
  },

  updateManifestProgressUI() {
    const banner = document.getElementById('manifestProgressBanner');
    const tracker = document.getElementById('liveManifestTracker');
    
    if (!SessionManager.isManifestEnabled || SessionManager.expectedManifest.length === 0) { 
      if (banner) banner.style.display = 'none'; 
      if (tracker) tracker.style.display = 'none';
      return; 
    }
    
    if (banner) banner.style.display = 'block';
    if (tracker) tracker.style.display = 'block';

    let expectedMap = {};
    SessionManager.expectedManifest.forEach(exp => {
        expectedMap[exp.ref] = (expectedMap[exp.ref] || 0) + exp.expectedQty;
    });

    let scannedMap = {};
    SessionManager.scannedObjects.forEach(i => { scannedMap[i.ref] = (scannedMap[i.ref] || 0) + i.qty; });

    let expHtml = '';
    let totalExpected = 0;
    let totalScannedExp = 0;
    let totalUnexpected = 0;

    Object.keys(expectedMap).sort((a, b) => {
        let dbItemA = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === a) || {};
        let dbItemB = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === b) || {};
        let shelfA = dbItemA.shelf || 'ZZZ-UNASSIGNED';
        let shelfB = dbItemB.shelf || 'ZZZ-UNASSIGNED';
        return shelfA.localeCompare(shelfB) || a.localeCompare(b);
    }).forEach(ref => {
        let eQty = expectedMap[ref];
        let sQty = scannedMap[ref] || 0;
        
        let dbMatch = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref) || {};
        let shelfStr = (dbMatch.shelf && dbMatch.shelf !== 'ZZZ-UNASSIGNED') ? 
            `<span style="font-size:0.7rem; background:#e0e0e0; color:#333; padding:2px 6px; border-radius:4px; margin-left:8px;">📍 ${dbMatch.shelf}</span>` : '';

        totalExpected += eQty;
        totalScannedExp += Math.min(sQty, eQty);
        
        let color = sQty >= eQty ? '#2e7d32' : (sQty > 0 ? '#f57f17' : '#555');
        let icon = sQty >= eQty 
            ? '<i data-lucide="check-circle-2" style="width:16px; height:16px; vertical-align:text-bottom;"></i>' 
            : '<i data-lucide="hourglass" style="width:16px; height:16px; vertical-align:text-bottom;"></i>';
        
        expHtml += `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #e0e0e0; padding:8px 4px; align-items:center;">
          <div><span style="font-weight:bold; color:${color};">${icon} ${ref}</span>${shelfStr}</div>
          <span style="color:${color}; font-weight:bold; font-size:1.1rem;">${sQty} / ${eQty}</span>
        </div>`;
    });

    Object.keys(scannedMap).sort().forEach(sRef => {
        let sQty = scannedMap[sRef];
        let eQty = expectedMap[sRef] || 0;
        if (sQty > eQty) {
            let diff = sQty - eQty;
            totalUnexpected += diff;
            if (eQty === 0) {
                expHtml += `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #e0e0e0; padding:6px 4px; background-color: #fff3e0;">
                  <span style="font-weight:bold; color:#e65100;">⚠️ ${sRef} (Unexpected)</span>
                  <span style="color:#e65100; font-weight:bold;">${sQty}</span>
                </div>`;
            }
        }
    });

    document.getElementById('manifestScannedQty').textContent = totalScannedExp;
    document.getElementById('manifestTotalQty').textContent = totalExpected;
    
    let unexpHtml = totalUnexpected > 0 ? ` | <span style="color:#e65100;">${totalUnexpected} Unexpected</span>` : '';
    document.getElementById('manifestUnexpectedStats').innerHTML = unexpHtml;

    if (document.getElementById('liveManifestList')) {
      document.getElementById('liveManifestList').innerHTML = expHtml;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  },

  renderManifestReconciliation() {
    const card = document.getElementById('manifestReconcileCard');
    const list = document.getElementById('manifestReconcileList');
    if (!card || !list || !SessionManager.isManifestEnabled || SessionManager.expectedManifest.length === 0) return;

    let scannedMap = {};
    SessionManager.scannedObjects.forEach(i => { scannedMap[i.ref] = (scannedMap[i.ref] || 0) + i.qty; });

    let expectedMap = {};
    SessionManager.expectedManifest.forEach(exp => {
        expectedMap[exp.ref] = (expectedMap[exp.ref] || 0) + exp.expectedQty;
    });

    let hasDiscrepancy = false;
    let html = '';

    Object.keys(expectedMap).sort().forEach(ref => {
      let eQty = expectedMap[ref];
      let sQty = scannedMap[ref] || 0;
      if (sQty !== eQty) {
        hasDiscrepancy = true;
        html += `
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; background:#fff; padding:8px; border:1px solid #ccc; border-radius:4px;" class="manifest-rec-row">
            <input type="text" class="rec-ref-input" value="${ref}" style="flex:2; text-transform:uppercase; font-weight:bold; color:#0277bd;" readonly>
            <input type="number" class="rec-qty-input" data-original="${eQty}" value="${eQty}" min="0" style="flex:1;">
            <span style="font-size:0.8rem; color:#555; flex:1.5;">Scanned: <strong>${sQty}</strong></span>
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
    const list = document.getElementById('manifestReconcileList');
    if (!list) return;

    let rows = list.querySelectorAll('.manifest-rec-row');
    rows.forEach(row => {
      let ref = row.querySelector('.rec-ref-input').value.trim().toUpperCase();
      let newQty = parseInt(row.querySelector('.rec-qty-input').value, 10) || 0;
      let origQty = parseInt(row.querySelector('.rec-qty-input').getAttribute('data-original'), 10) || 0;
      
      if (newQty !== origQty) {
         let diff = newQty - origQty;
         let targetExp = SessionManager.expectedManifest.find(e => e.ref === ref);
         if (targetExp) {
             targetExp.expectedQty += diff;
             if (targetExp.expectedQty < 0) targetExp.expectedQty = 0;
         } else {
             SessionManager.expectedManifest.push({ ref: ref, expectedQty: newQty, allocations: [] });
         }
      }
    });

    SessionManager.expectedManifest = SessionManager.expectedManifest.filter(e => e.expectedQty > 0);
    localStorage.setItem('asp_active_manifest', JSON.stringify(SessionManager.expectedManifest));
    alert("Manifest updated! Recalculating session summaries...");
    SessionManager.goToSummaryScreen();
  }
};