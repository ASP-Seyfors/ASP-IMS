/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/auditManager.js
 * Author: Thomas Paul Seyfors
 * Date: August 2026
 * 
 * Description:
 *   Audit, report generation, and traceability engine. Constructs TXT and
 *   printable HTML/PDF session summaries, calculates live session metrics,
 *   parses multi-log uploads, and builds Thrive CSV export formats.
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const AuditManager = {
  parsedAuditSessions: [],

  cleanGtinValue(val) {
    if (!val) return 'N/A';
    return val.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() || 'N/A';
  },

  updateSessionSummaryView() {
    let container = document.getElementById('summaryListContainer');
    let elUnique = document.getElementById('sumUniqueRefs');
    let elTotal = document.getElementById('sumTotalQty');

    if (!container) return;
    container.innerHTML = '';

    if (SessionManager.scannedObjects.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 14px; color: #555;">No items scanned in this session yet.</div>';
      if(elUnique) elUnique.textContent = '0';
      if(elTotal) elTotal.textContent = '0';
      return;
    }

    let totalQty = 0;
    let uniqueRefs = new Set();

    SessionManager.scannedObjects.forEach((item, index) => {
      totalQty += item.qty;
      uniqueRefs.add(item.ref);

      let statusIcon = item.actionTag === 'Reserved' ? '🚩' : (item.actionTag === 'Pack & Ship' ? '🖐️' : '📦');
      let noteHtml = item.itemNote ? `<div style="font-size:0.8rem; color:#d32f2f; margin-top:6px;"><em>Note: ${item.itemNote}</em></div>` : '';

      let details = document.createElement('details');
      details.className = 'summary-item-card';

      let summary = document.createElement('summary');
      summary.innerHTML = `<span style="color:#0277bd;">[+] ${index + 1}. REF: ${item.ref}</span> <span>Qty: ${item.qty}</span>`;
      details.appendChild(summary);

      let content = document.createElement('div');
      content.style.paddingTop = '10px';
      content.style.marginTop = '10px';
      content.style.borderTop = '1px solid #eee';
      content.style.fontSize = '0.85rem';
      content.style.color = '#555';
      
      content.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span><strong>Lot:</strong> ${item.lot}</span>
          <span><strong>Exp:</strong> ${item.exp}</span>
          <span>Status: ${statusIcon} ${item.actionTag}</span>
        </div>
        ${noteHtml}
        
        <div style="background:#f5f5f5; border:1px solid #e0e0e0; border-radius:4px; padding:8px; margin-top:8px;">
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
            <label style="font-weight:bold; font-size:0.8rem;">Qty:</label>
            <input type="number" id="editQty_${index}" value="${item.qty}" min="0" style="width:60px; padding:4px; text-align:center;">
            
            <label style="font-weight:bold; font-size:0.8rem; margin-left:6px;">Customer Tag:</label>
            <input type="text" id="editTag_${index}" value="${item.customerTag || ''}" placeholder="e.g. SURGISHOP" style="flex:1; padding:4px; text-transform:uppercase;">
          </div>
          <div class="flex-between" style="margin-top:6px;">
            <button class="btn-small btn-cancel btn-auto" style="padding:3px 8px;" onclick="SessionManager.deleteScannedItem(${index})">🗑️ Delete Entry</button>
            <button class="btn-small btn-save btn-auto" style="padding:3px 12px; background-color:#1976d2;" onclick="SessionManager.updateScannedItem(${index})">💾 Save Changes</button>
          </div>
        </div>
      `;
      details.appendChild(content);
      container.appendChild(details);
    });

    if(elUnique) elUnique.textContent = uniqueRefs.size;
    if(elTotal) elTotal.textContent = totalQty;
  },

  loadCustomerReportData() {
    let select = document.getElementById('customerReportSelect');
    let controls = document.getElementById('customerReportControls');
    let title = document.getElementById('selectedCustomerTitle');
    
    if (!select || !select.value) {
      alert("Please select a valid customer account from the dropdown first.");
      if (controls) controls.style.display = 'none';
      return;
    }

    let cust = select.value;
    if (title) title.textContent = `Account Selected: ${cust}`;
    if (controls) controls.style.display = 'flex';
  },

  executeSessionAction() {
    const val = document.getElementById('exportDropdown').value;
    if (!val) {
      alert("Please select an action from the dropdown first.");
      return;
    }

    if (val === 'continue') {
      ScannerManager.resetScanLinesAndFields();
      document.getElementById('screenSummary').style.display = 'none';
      document.getElementById('screenScanning').style.display = 'block';
    } else if (val === 'commit_stock') {
      SessionManager.commitStocktake();
    } else if (val === 'cancel') {
      SessionManager.cancelSession();
    } else if (val === 'complete') {
      SessionManager.completeSession();
    } else if (val === 'backorder') {
      SessionManager.suspendToBackorder();
    } else if (val === 'pdf' || val === 'txt') {
      this.exportSessionData(val);
    }

    setTimeout(() => { document.getElementById('exportDropdown').value = "continue"; }, 500);
  },

  // ==========================================================================
  // SINGLE SESSION REPORT BUILDERS (TXT & PDF)
  // ==========================================================================

  buildTXTReportString() {
    let mfrMap = {};
    let custMap = {};
    let unpricedMfrMap = {};
    let scannedMap = {}; 

    SessionManager.scannedObjects.forEach(item => {
      let mfr = item.mfr || 'UNKNOWN MANUFACTURER';
      let rKey = item.ref;
      let cleanGtin = this.cleanGtinValue(item.gtin);
      
      if (!mfrMap[mfr]) mfrMap[mfr] = {};
      if (!mfrMap[mfr][rKey]) {
        mfrMap[mfr][rKey] = { ref: rKey, desc: item.desc, price: item.price, totalScannedQty: 0, byTag: {} };
      }
      mfrMap[mfr][rKey].totalScannedQty += item.qty;

      let tKey = item.customerTag || 'UNTAGGED';
      if (!mfrMap[mfr][rKey].byTag[tKey]) mfrMap[mfr][rKey].byTag[tKey] = { tagTotalQty: 0, lots: {} };
      mfrMap[mfr][rKey].byTag[tKey].tagTotalQty += item.qty;

      let lotKey = `${item.lot}_${item.exp}`;
      if (!mfrMap[mfr][rKey].byTag[tKey].lots[lotKey]) {
        mfrMap[mfr][rKey].byTag[tKey].lots[lotKey] = { lot: item.lot, exp: item.exp, qty: 0, notes: [] };
      }
      mfrMap[mfr][rKey].byTag[tKey].lots[lotKey].qty += item.qty;
      if (item.itemNote) mfrMap[mfr][rKey].byTag[tKey].lots[lotKey].notes.push(item.itemNote);

      if (item.customerTag) {
        if (!custMap[item.customerTag]) custMap[item.customerTag] = {};
        if (!custMap[item.customerTag][rKey]) custMap[item.customerTag][rKey] = 0;
        custMap[item.customerTag][rKey] += item.qty;
      }

      if (!item.price || item.price === "$0.00" || item.price === "0") {
         if (!unpricedMfrMap[mfr]) unpricedMfrMap[mfr] = new Set();
         unpricedMfrMap[mfr].add(rKey);
      }

      if (!scannedMap[rKey]) scannedMap[rKey] = { totalScannedQty: 0 };
      scannedMap[rKey].totalScannedQty += item.qty;
    });

    let sessionTitleHeader = SessionManager.currentSessionName;
    if (SessionManager.currentOrderNum && !sessionTitleHeader.includes(SessionManager.currentOrderNum)) {
      sessionTitleHeader += ` (${SessionManager.currentOrderNum})`;
    }

    const nowObj = new Date();
    let timeEndStr = nowObj.toLocaleTimeString();
    let totalUniqueRefs = new Set(SessionManager.scannedObjects.map(i => i.ref)).size;
    let totalItemsScanned = SessionManager.scannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
    let sNote = document.getElementById('sessionNoteInput') ? document.getElementById('sessionNoteInput').value.trim() : '';

    let reportLines = [
      `================================================================================`,
      `ASP SCANNER APP SUMMARY EXPORT - ${sessionTitleHeader}`,
      ``,
      `          Scanned By:          ${SessionManager.currentUserName || 'N/A'}`,
      `          Total Unique REFs:   ${totalUniqueRefs}`,
      `          Total Items Scanned: ${totalItemsScanned}`,
      ``,
      `          Workflow Process:    ${SessionManager.currentWorkflowType}`,
      `          Scanned Date:        ${SessionManager.sessionDateStr}`,
      `          Session Start:       ${SessionManager.sessionStartStr || 'N/A'}`,
      `          Session End:         ${timeEndStr}`
    ];
    
    if (sNote) reportLines.push(`          Session Notes:       ${sNote}`);
    reportLines.push(`================================================================================\n`);

    if (Object.keys(custMap).length > 0) {
      reportLines.push(`--- ROUTED TO CUSTOMER BINS ---`);
      Object.keys(custMap).sort().forEach(cTag => {
         reportLines.push(`  * Customer: ${cTag}`);
         Object.keys(custMap[cTag]).sort().forEach(ref => {
             reportLines.push(`      - REF: ${ref} | Qty: ${custMap[cTag][ref]}`);
         });
      });
      reportLines.push(``);
    }

    if (SessionManager.isManifestEnabled && SessionManager.expectedManifest.length > 0) {
      let shortages = [];
      SessionManager.expectedManifest.forEach(exp => {
        let scannedObj = scannedMap[exp.ref];
        let scannedQty = scannedObj ? scannedObj.totalScannedQty : 0;
        if (scannedQty < exp.expectedQty) {
          shortages.push({ ref: exp.ref, expected: exp.expectedQty, scanned: scannedQty, shortQty: exp.expectedQty - scannedQty });
        }
      });

      if (shortages.length > 0) {
        reportLines.push(`--- SHORTAGES / MISSING ITEMS ---`);
        shortages.forEach(s => {
          reportLines.push(`  * REF: ${s.ref} | Expected: ${s.expected} | Scanned: ${s.scanned} | SHORT: ${s.shortQty}`);
        });
        reportLines.push(``);
      }
    }

    if (SessionManager.isManifestEnabled && SessionManager.expectedManifest.length > 0) {
      let overages = [];
      Object.keys(scannedMap).forEach(rKey => {
        let expObj = SessionManager.expectedManifest.find(e => e.ref === rKey);
        let expQty = expObj ? expObj.expectedQty : 0;
        let scannedQty = scannedMap[rKey].totalScannedQty;
        if (scannedQty > expQty) {
          overages.push({ ref: rKey, expected: expQty, scanned: scannedQty, overQty: scannedQty - expQty });
        }
      });

      if (overages.length > 0) {
        reportLines.push(`--- OVERAGES / UNEXPECTED ITEMS ---`);
        overages.forEach(o => {
          reportLines.push(`  * REF: ${o.ref} | Expected: ${o.expected} | Scanned: ${o.scanned} | OVER: +${o.overQty}`);
        });
        reportLines.push(``);
      }
    }

    reportLines.push(`--- SCANNED ITEM DETAILS BREAKDOWN ---\n`);

    let sortedMfrs = Object.keys(mfrMap).sort();
    sortedMfrs.forEach(mfr => {
      reportLines.push(`### MANUFACTURER: ${mfr} ###\n`);
      
      let sortedRefs = Object.keys(mfrMap[mfr]).sort();
      sortedRefs.forEach(rKey => {
        let rData = mfrMap[mfr][rKey];
        let descLine = (rData.desc && rData.desc !== "Navigate to vendor website for item description.") ? `    | Description: ${rData.desc}\n` : '';
        
        reportLines.push(`[+] REF: ${rData.ref}\n${descLine}    | Total Quantity: ${rData.totalScannedQty}`);
        
        for (let tKey in rData.byTag) {
          let tagData = rData.byTag[tKey];
          if (tKey !== 'UNTAGGED') reportLines.push(`    | Customer Tag: ${tKey} (Qty: ${tagData.tagTotalQty})`);
          reportLines.push(`    | Lot & Expiration Breakdowns:`);
          for (let lKey in tagData.lots) {
            let lData = tagData.lots[lKey];
            reportLines.push(`      - Lot: ${lData.lot} | Exp: ${lData.exp} | Qty: ${lData.qty}`);
            if(lData.notes.length > 0) reportLines.push(`        * Notes: ${lData.notes.join(', ')}`);
          }
        }
        reportLines.push(``); 
      });
    });

    if (SessionManager.currentWorkflowType.includes('Receiving') && Object.keys(unpricedMfrMap).length > 0) {
      reportLines.push(`--- ITEMS REQUIRING PRICING ---`);
      Object.keys(unpricedMfrMap).sort().forEach(mfr => {
        let refList = Array.from(unpricedMfrMap[mfr]).sort().join(', ');
        reportLines.push(`  * MFR: ${mfr} -> REFs: ${refList}`);
      });
      reportLines.push(``);
    }

    if (SessionManager.pendingNewItems.length > 0) {
      reportLines.push(`--------------------------------------------------------------------------------\n--- NEW ITEM DETAILS ---\n--------------------------------------------------------------------------------`);
      let nIdx = 1;
      SessionManager.pendingNewItems.forEach(nItem => {
        let nDesc = (nItem.desc && nItem.desc !== "Navigate to vendor website for item description.") ? `\n          | Description: ${nItem.desc}` : '';
        reportLines.push(`[ ${nIdx} ] REF: ${nItem.ref}${nDesc}\n          | GTIN: ${this.cleanGtinValue(nItem.gtin)}\n          | Manufacturer: ${nItem.mfr}\n          | Price: ${nItem.price}`); nIdx++;
      }); reportLines.push(``);
    }

    if (SessionManager.pendingFieldUpdates.length > 0) {
      reportLines.push(`--------------------------------------------------------------------------------\n--- EXISTING ITEM UPDATES (${SessionManager.pendingFieldUpdates.length}) ---\n--------------------------------------------------------------------------------`);
      let uIdx = 1;
      SessionManager.pendingFieldUpdates.forEach(upd => {
        reportLines.push(`[ ${uIdx} ] REF: ${upd.ref}\n          | GTIN: ${this.cleanGtinValue(upd.newValue)}`); uIdx++;
      }); reportLines.push(``);
    }

    if (SessionManager.scannedObjects.length > 0) {
      reportLines.push(`--------------------------------------------------------------------------------\n--- SCANNING SESSION FULL BARCODE REFERENCE DATA ---\n--------------------------------------------------------------------------------\nSession Start Time: ${SessionManager.sessionStartStr || 'N/A'}\n`);
      SessionManager.scannedObjects.forEach(item => {
        reportLines.push(`REF: ${item.ref}`);
        if (item.rawScanLines && item.rawScanLines.length > 0) {
          item.rawScanLines.forEach((lineVal, idx) => { reportLines.push(`  - Barcode Line ${idx + 1}: ${lineVal}`); });
        } else reportLines.push(`  - No raw barcodes captured.`);
        reportLines.push(``);
      });
    }

    reportLines.push(`================================================================================\nEND OF RECEIVING INVENTORY SUMMARY\n================================================================================`);
    return reportLines.join('\n');
  },

  buildHTMLReportString(filename) {
    let scannedMap = {};

    SessionManager.scannedObjects.forEach(item => {
      let rKey = item.ref;
      let cleanGtin = this.cleanGtinValue(item.gtin);
      if (!scannedMap[rKey]) {
        scannedMap[rKey] = { ref: item.ref, desc: item.desc, gtin: cleanGtin, mfr: item.mfr, price: item.price, totalScannedQty: 0, byTag: {} };
      }
      scannedMap[rKey].totalScannedQty += item.qty;

      let tKey = item.customerTag || 'UNTAGGED';
      if (!scannedMap[rKey].byTag[tKey]) scannedMap[rKey].byTag[tKey] = { tagTotalQty: 0, lots: {} };
      scannedMap[rKey].byTag[tKey].tagTotalQty += item.qty;

      let lotKey = `${item.lot}_${item.exp}`;
      if (!scannedMap[rKey].byTag[tKey].lots[lotKey]) scannedMap[rKey].byTag[tKey].lots[lotKey] = { lot: item.lot, exp: item.exp, qty: 0, notes:[] };
      scannedMap[rKey].byTag[tKey].lots[lotKey].qty += item.qty;
      if (item.itemNote) scannedMap[rKey].byTag[tKey].lots[lotKey].notes.push(item.itemNote);
    });

    let sessionTitleHeader = SessionManager.currentSessionName;
    if (SessionManager.currentOrderNum && !sessionTitleHeader.includes(SessionManager.currentOrderNum)) {
      sessionTitleHeader += ` (${SessionManager.currentOrderNum})`;
    }

    const nowObj = new Date();
    let timeEndStr = nowObj.toLocaleTimeString();
    let totalUniqueRefs = new Set(SessionManager.scannedObjects.map(i => i.ref)).size;
    let totalItemsScanned = SessionManager.scannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
    let sNote = document.getElementById('sessionNoteInput') ? document.getElementById('sessionNoteInput').value.trim() : '';

    let workflowTitle = SessionManager.currentWorkflowType ? `${SessionManager.currentWorkflowType.toUpperCase()} - ` : '';
    let mainTitle = `${workflowTitle}SESSION LOG`;

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${filename}</title>
<style>
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 30px; font-size: 13px; }
.top-title-banner { text-align: center; border-bottom: 2px solid #0277bd; padding-bottom: 6px; margin-bottom: 14px; }
.top-title-banner h2 { margin: 0; color: #0277bd; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
.header-grid { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.company-info { flex: 1; }
.company-info h1 { margin: 0; color: #333; font-size: 14px; text-transform: uppercase; white-space: nowrap; }
.company-info p { margin: 2px 0; color: #555; font-size: 11px; }
.report-meta { text-align: right; }
.report-meta table { width: 100%; text-align: right; border: none; font-size: 12px; margin: 0; }
.report-meta td { border: none; padding: 2px 0 2px 15px; }
.section-title { background-color: #f0f0f0; border-left: 4px solid #0277bd; padding: 6px 10px; font-size: 13px; font-weight: bold; margin: 20px 0 10px 0; text-transform: uppercase; }
.data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.data-table th { background-color: #fafafa; border-bottom: 2px solid #ccc; padding: 6px; text-align: left; font-size: 11px; color: #555; }
.data-table td { border-bottom: 1px solid #eee; padding: 6px; vertical-align: top; }
.ref-col { font-weight: bold; color: #000; font-size: 13px; }
.desc-col { font-size: 11px; color: #666; max-width: 250px; }
.lot-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 5px; background: #fafafa; border: 1px solid #eaeaea; }
.lot-table th, .lot-table td { border: 1px solid #eaeaea; padding: 4px 6px; }
.lot-table th { background: #f0f0f0; }
.tag-header { font-weight: bold; color: #d32f2f; margin: 6px 0 4px 0; font-size: 11px; text-transform: uppercase; }
.note-text { color: #d32f2f; font-style: italic; font-size: 11px; display: block; margin-top: 3px;}
.session-notes { background-color: #fff9c4; border-left: 4px solid #fbc02d; padding: 8px 10px; margin-bottom: 15px; font-size: 12px;}
.alert-box { padding: 8px 12px; border-radius: 4px; margin-bottom: 15px; font-size: 12px; }
.alert-short { background-color: #ffebee; border-left: 4px solid #c62828; color: #c62828; }
.alert-over { background-color: #fff3e0; border-left: 4px solid #e65100; color: #e65100; }
.alert-tag { background-color: #e3f2fd; border-left: 4px solid #0277bd; color: #0277bd; }
@media print {
  body { margin: 0; padding: 15px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>

<div class="top-title-banner">
  <h2>${mainTitle}</h2>
</div>

<div class="header-grid">
  <div>
    <img src="ASP_Box_Web_RGB.png" style="max-height: 50px;" alt="ASP Logo" />
  </div>
  <div class="company-info" style="margin-left: 15px;">
    <h1>Allied Surgical Products</h1>
    <p>737 Barbara Street</p>
    <p>Palm Harbor, FL 34684</p>
  </div>
  <div class="report-meta">
    <table>
      <tr><td><strong>Session:</strong></td><td>${sessionTitleHeader}</td></tr>
      <tr><td><strong>User:</strong></td><td>${SessionManager.currentUserName || 'N/A'}</td></tr>
      <tr><td><strong>Date:</strong></td><td>${SessionManager.sessionDateStr}</td></tr>
      <tr><td><strong>Time Span:</strong></td><td>${SessionManager.sessionStartStr} - ${timeEndStr}</td></tr>
      <tr><td><strong>Unique REFs:</strong></td><td>${totalUniqueRefs}</td></tr>
      <tr><td><strong>Total Items:</strong></td><td>${totalItemsScanned}</td></tr>
    </table>
  </div>
</div>`;

    if (sNote) {
      html += `<div class="session-notes"><strong>Session Notes:</strong> ${sNote}</div>`;
    }

    // 1. SCANNED ITEM BREAKDOWN
    html += `<div class="section-title">📦 SCANNED ITEM BREAKDOWN</div>`;
    html += `<table class="data-table"><thead><tr><th>REF / MFR</th><th>Description & GTIN</th><th>Inventory Lots & Quantities</th><th style="text-align:center;">Total Qty</th></tr></thead><tbody>`;
    
    for (let rKey in scannedMap) {
      let rData = scannedMap[rKey];
      let lotSection = '';
      for (let tKey in rData.byTag) {
        let tagData = rData.byTag[tKey];
        if (tKey !== 'UNTAGGED') lotSection += `<div class="tag-header">Tag: ${tKey} (Qty: ${tagData.tagTotalQty})</div>`;
        
        lotSection += `<table class="lot-table"><tr><th>Lot Number</th><th>Exp Date</th><th>Qty</th></tr>`;
        for (let lKey in tagData.lots) {
           let lData = tagData.lots[lKey];
           let noteStr = lData.notes.length > 0 ? `<span class="note-text">${lData.notes.join('<br>')}</span>` : '';
           lotSection += `<tr><td>${lData.lot}${noteStr}</td><td>${lData.exp}</td><td style="text-align:center; font-weight:bold;">${lData.qty}</td></tr>`;
        }
        lotSection += `</table>`;
      }
      let descText = rData.desc || 'No description available.';
      let priceHtml = rData.price ? `<br><strong style="color:#2e7d32;">${rData.price}</strong>` : '';
      html += `<tr><td><div class="ref-col">${rData.ref}</div><div style="font-size:11px; color:#888; margin-top:2px;">${rData.mfr}</div></td><td><div class="desc-col">${descText}</div><div style="font-size:10px; margin-top:4px;"><strong>GTIN:</strong> ${rData.gtin}</div>${priceHtml}</td><td>${lotSection}</td><td style="text-align:center; font-size:16px; font-weight:bold;">${rData.totalScannedQty}</td></tr>`;
    }
    html += `</tbody></table>`;

    // 2. ROUTED TO CUSTOMER BINS (MOVED AFTER BREAKDOWN)
    let reservedItems = SessionManager.scannedObjects.filter(i => i.customerTag);
    if (reservedItems.length > 0) {
      let totalReservedQty = reservedItems.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
      html += `<div class="section-title" style="border-color:#0277bd; color:#0277bd;">🚩 ROUTED TO CUSTOMER BINS</div><div class="alert-box alert-tag"><table style="width:100%;"><thead><tr><th style="text-align:left;">REF</th><th style="text-align:left;">Customer Tag</th><th style="text-align:center;">Quantity Routed</th></tr></thead><tbody>`;
      reservedItems.forEach(r => {
        html += `<tr><td><strong>${r.ref}</strong></td><td>${r.customerTag}</td><td style="text-align:center; font-weight:bold;">${r.qty}</td></tr>`;
      });
      html += `<tr style="border-top:2px solid #0277bd;"><td colspan="2" style="text-align:right; font-weight:bold; padding-top:6px;">Total Quantity Reserved:</td><td style="text-align:center; font-weight:bold; font-size:13px; padding-top:6px;">${totalReservedQty}</td></tr>`;
      html += `</tbody></table></div>`;
    }

    // 3. ITEMS REQUIRING PRICING (AT VERY END)
    if (SessionManager.currentWorkflowType.includes('Receiving')) {
      let unpricedItems = Object.values(scannedMap).filter(i => !i.price || i.price === "$0.00" || i.price === "0");
      if (unpricedItems.length > 0) {
        html += `
          <div style="margin-top: 20px; page-break-inside: avoid;">
            <div class="section-title" style="border-color:#7b1fa2; color:#7b1fa2;">🏷️ ITEMS REQUIRING PRICING (${unpricedItems.length})</div>
            <table class="data-table" style="width:100%;">
              <thead>
                <tr style="background-color:#f3e5f5;">
                  <th style="padding:6px; text-align:left;">REF / SKU</th>
                  <th style="padding:6px; text-align:left;">Manufacturer</th>
                </tr>
              </thead>
              <tbody>`;
        unpricedItems.forEach(u => {
          html += `<tr><td style="font-weight:bold;">${u.ref}</td><td>${u.mfr}</td></tr>`;
        });
        html += `</tbody></table></div>`;
      }
    }

    // SHORTAGES
    if (SessionManager.isManifestEnabled && SessionManager.expectedManifest.length > 0) {
      let shortages = [];
      SessionManager.expectedManifest.forEach(exp => {
        let scannedObj = scannedMap[exp.ref];
        let scannedQty = scannedObj ? scannedObj.totalScannedQty : 0;
        if (scannedQty < exp.expectedQty) {
          shortages.push({ ref: exp.ref, expected: exp.expectedQty, scanned: scannedQty, shortQty: exp.expectedQty - scannedQty });
        }
      });

      if (shortages.length > 0) {
        html += `<div class="section-title" style="border-color:#c62828; color:#c62828;">⚠️ SHORTAGES / MISSING ITEMS</div><div class="alert-box alert-short"><table style="width:100%;"><tr><th>REF</th><th>Expected</th><th>Scanned</th><th>Shortage</th></tr>`;
        shortages.forEach(s => {
          html += `<tr><td><strong>${s.ref}</strong></td><td style="text-align:center;">${s.expected}</td><td style="text-align:center;">${s.scanned}</td><td style="text-align:center; font-weight:bold; color:#c62828;">-${s.shortQty}</td></tr>`;
        });
        html += `</table></div>`;
      }
    }

    // OVERAGES
    if (SessionManager.isManifestEnabled && SessionManager.expectedManifest.length > 0) {
      let overages = [];
      Object.keys(scannedMap).forEach(rKey => {
        let expObj = SessionManager.expectedManifest.find(e => e.ref === rKey);
        let expQty = expObj ? expObj.expectedQty : 0;
        let scannedQty = scannedMap[rKey].totalScannedQty;
        if (scannedQty > expQty) {
          overages.push({ ref: rKey, expected: expQty, scanned: scannedQty, overQty: scannedQty - expQty });
        }
      });

      if (overages.length > 0) {
        html += `<div class="section-title" style="border-color:#e65100; color:#e65100;">⚠️ OVERAGES / UNEXPECTED ITEMS</div><div class="alert-box alert-over"><table style="width:100%;"><tr><th>REF</th><th>Expected</th><th>Scanned</th><th>Overage</th></tr>`;
        overages.forEach(o => {
          html += `<tr><td><strong>${o.ref}</strong></td><td style="text-align:center;">${o.expected}</td><td style="text-align:center;">${o.scanned}</td><td style="text-align:center; font-weight:bold; color:#e65100;">+${o.overQty}</td></tr>`;
        });
        html += `</table></div>`;
      }
    }

    html += `</body></html>`; 
    return html;
  },

  // ==========================================================================
  // CUSTOMER INTERNAL SALES REPORT ENGINE
  // ==========================================================================
  openInternalSalesReportOptions() {
    let cust = document.getElementById('customerReportSelect').value;
    if (!cust) { alert("Please select a customer first."); return; }

    // Read the scope selected in screens/reports.html
    let scopeRadio = document.querySelector('input[name="internalReportScope"]:checked');
    let limit = scopeRadio ? scopeRadio.value : '10';

    let modal = document.createElement('div');
    modal.id = 'internalReportOptionsModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    
    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:500px; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #388e3c; padding-bottom:8px; margin-bottom:15px;">
          <h3 style="margin:0; color:#388e3c;">📈 Internal Sales Report Options</h3>
          <button onclick="document.getElementById('internalReportOptionsModal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
        </div>
        <div style="margin-bottom:15px; font-size:0.85rem;">Account: <strong>${cust}</strong><br>Select the columns you want to include in the PDF export:</div>
        
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px; background:#fafafa; border:1px solid #ddd; padding:12px; border-radius:4px;">
          <label style="cursor:pointer;"><input type="checkbox" id="chkIntDesc" checked> Description</label>
          <label style="cursor:pointer;"><input type="checkbox" id="chkIntHist" checked> Historical Vol.</label>
          <label style="cursor:pointer;"><input type="checkbox" id="chkIntOnHand" checked> On-Hand Stock</label>
          <label style="cursor:pointer;"><input type="checkbox" id="chkIntPrice" checked> Selling Price</label>
          <label style="cursor:pointer;"><input type="checkbox" id="chkIntCost" checked> Unit Cost</label>
          <label style="cursor:pointer;"><input type="checkbox" id="chkIntMargin" checked> Gross Margin %</label>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button onclick="document.getElementById('internalReportOptionsModal').remove()" style="background:#777; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">Cancel</button>
          <!-- Pass the limit variable straight into generateInternalSalesReport -->
          <button onclick="AuditManager.generateInternalSalesReport('${cust}', '${limit}')" style="background:#388e3c; color:#fff; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">🖨️ Export PDF</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  generateInternalSalesReport(cust) {
    if (!cust) return;
    
    // Read the limit selection from the modal radio buttons
    let limitRadio = document.querySelector('input[name="internalReportScope"]:checked');
    let limit = limitRadio ? limitRadio.value : '10';

    let incDesc = document.getElementById('chkIntDesc') ? document.getElementById('chkIntDesc').checked : true;
    let incHist = document.getElementById('chkIntHist') ? document.getElementById('chkIntHist').checked : true;
    let incOnHand = document.getElementById('chkIntOnHand') ? document.getElementById('chkIntOnHand').checked : true;
    let incPrice = document.getElementById('chkIntPrice') ? document.getElementById('chkIntPrice').checked : true;
    let incCost = document.getElementById('chkIntCost') ? document.getElementById('chkIntCost').checked : true;
    let incMargin = document.getElementById('chkIntMargin') ? document.getElementById('chkIntMargin').checked : true;

    let scopeTitle = limit === 'all' ? 'All Historical Items' : 'Top 10 Items';
    let filename = `Internal_Sales_Report_${cust}_${SessionManager.sessionDateStr}.pdf`;
    
    // Pass the limit parameter here!
    let skuMap = this.getHistoricalCustomerData(cust, limit); 
    
    let html = `<!DOCTYPE html><html><head><title>${filename}</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; color:#333; font-size:12px; }
      .header { border-bottom:3px solid #0277bd; padding-bottom:10px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; }
      h1 { margin:0; color:#0277bd; font-size:18px; text-transform:uppercase; }
      .meta { text-align:right; font-size:11px; color:#555; }
      table { width:100%; border-collapse:collapse; margin-top:15px; font-size:11px; }
      th { background:#f0f0f0; border:1px solid #ccc; padding:8px; text-align:center; color:#333; font-size:11px; }
      td { border:1px solid #eee; padding:8px; text-align:center; }
      .ref-cell { text-align:left; font-weight:bold; color:#0277bd; }
      .desc-cell { text-align:left; font-size:10px; color:#555; }
      .summary-box { background:#e3f2fd; border-left:4px solid #0277bd; padding:10px; margin-bottom:15px; font-size:11px; }
    </style></head><body>
    
    <div class="header">
      <div>
        <h1>Customer Internal Sales Report</h1>
        <div style="font-size:12px; font-weight:bold; color:#555; margin-top:4px;">Account: ${cust}</div>
      </div>
      <div class="meta">
        <div>Allied Surgical Products</div>
        <div>Generated: ${SessionManager.sessionDateStr}</div>
      </div>
    </div>

    <div class="summary-box">
      <strong>Internal Strategy Brief:</strong> ${scopeTitle} purchasing trends and live warehouse stock availability for account <strong>${cust}</strong>.
    </div>

    <table>
      <thead>
        <tr>
          <th>REF / SKU</th>
          ${incDesc ? '<th>Description</th>' : ''}
          ${incHist ? '<th>Historical Vol.</th>' : ''}
          ${incOnHand ? '<th>On-Hand Stock</th>' : ''}
          ${incPrice ? '<th>Selling Price</th>' : ''}
          ${incCost ? '<th>Unit Cost</th>' : ''}
          ${incMargin ? '<th>Gross Margin %</th>' : ''}
        </tr>
      </thead>
      <tbody>`;

    skuMap.forEach(item => {
      let pVal = parseFloat((item.price || '0').replace(/[^0-9.-]+/g,"")) || 0;
      let cVal = parseFloat((item.cost || '0').replace(/[^0-9.-]+/g,"")) || 0;
      let margin = pVal > 0 ? (((pVal - cVal) / pVal) * 100).toFixed(1) + '%' : 'N/A';
      
      let formattedPrice = item.price ? (item.price.startsWith('$') ? item.price : '$' + item.price) : '$0.00';
      let formattedCost = item.cost ? (item.cost.startsWith('$') ? item.cost : '$' + item.cost) : '$0.00';

      html += `
        <tr>
          <td class="ref-cell">${item.ref}</td>
          ${incDesc ? `<td class="desc-cell">${item.desc}</td>` : ''}
          ${incHist ? `<td><strong>${item.histQty} units</strong></td>` : ''}
          ${incOnHand ? `<td style="color:${item.onHand > 0 ? '#2e7d32' : '#c62828'}; font-weight:bold;">${item.onHand}</td>` : ''}
          ${incPrice ? `<td>${formattedPrice}</td>` : ''}
          ${incCost ? `<td>${formattedCost}</td>` : ''}
          ${incMargin ? `<td style="font-weight:bold; color:#0277bd;">${margin}</td>` : ''}
        </tr>`;
    });

    html += `</tbody></table></body></html>`;

    let win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.title = filename; win.focus(); setTimeout(() => win.print(), 500); }
    
    let modal = document.getElementById('internalReportOptionsModal');
    if (modal) modal.remove();
  },

  // ==========================================================================
  // CUSTOMER INVENTORY STOCK REPORT EDITOR (CUSTOMER-FACING)
  // ==========================================================================
  openCustomerStockReportEditor(limit = '10') {
    let cust = document.getElementById('customerReportSelect').value;
    if (!cust) { alert("Please select a customer first."); return; }

    let items = this.getHistoricalCustomerData(cust, limit);
    
    let existingModal = document.getElementById('stockReportEditorModal');
    if (existingModal) existingModal.remove();

    let modal = document.createElement('div');
    modal.id = 'stockReportEditorModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    
    let rowsHtml = '';
    items.forEach((it, idx) => {
      let safeDesc = (it.desc || '').replace(/"/g, '&quot;');
      let safeRef = (it.ref || '').replace(/"/g, '&quot;');
      let safePrice = (it.price || '').replace(/"/g, '&quot;');

      rowsHtml += `
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;" id="reportEditRow_${idx}">
          <input type="text" value="${safeRef}" class="rep-ref" style="width:90px; padding:4px; font-weight:bold; text-transform:uppercase;">
          <input type="text" value="${safeDesc}" class="rep-desc" style="flex:1; padding:4px; font-size:0.8rem;">
          <input type="number" value="${it.onHand}" class="rep-qty" style="width:60px; padding:4px; text-align:center;">
          <input type="text" value="${safePrice}" class="rep-price" style="width:70px; padding:4px; text-align:center;">
          <button onclick="this.parentElement.remove()" style="background:#c62828; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">🗑️</button>
        </div>`;
    });

    let top10Checked = limit === '10' ? 'checked' : '';
    let allChecked = limit === 'all' ? 'checked' : '';

    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:600px; max-height:90vh; overflow-y:auto; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #7b1fa2; padding-bottom:8px; margin-bottom:15px;">
          <h3 style="margin:0; color:#7b1fa2;">📄 Build "Customer Inventory Stock Report"</h3>
          <button onclick="document.getElementById('stockReportEditorModal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
        </div>

        <div style="background:#f3e5f5; border:1px solid #ce93d8; border-radius:4px; padding:10px; margin-bottom:15px; font-size:0.85rem;">
          <strong>Account:</strong> ${cust}<br>
          Customize the SKUs, descriptions, stock quantities, and pricing below before exporting.
        </div>

        <div style="margin-bottom:15px; background:#fafafa; border:1px solid #ddd; padding:10px; border-radius:4px; display:flex; flex-wrap:wrap; gap:15px;">
          <label style="font-weight:bold; cursor:pointer; font-size:0.85rem; color:#333;"><input type="checkbox" id="chkIncludeDescFlyer" checked> Include Description</label>
          <label style="font-weight:bold; cursor:pointer; font-size:0.85rem; color:#333;"><input type="checkbox" id="chkIncludeQtyFlyer" checked> Include Quantity</label>
          <label style="font-weight:bold; cursor:pointer; font-size:0.85rem; color:#333;"><input type="checkbox" id="chkIncludePriceInReport" checked> Include Unit Price</label>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-weight:bold; font-size:0.85rem; color:#555;">Report Line Items:</div>
          <div style="font-size:0.8rem; display:flex; gap:10px;">
            <label style="cursor:pointer;"><input type="radio" name="histLimit" value="10" ${top10Checked} onchange="AuditManager.openCustomerStockReportEditor('10')"> Top 10 Items</label>
            <label style="cursor:pointer;"><input type="radio" name="histLimit" value="all" ${allChecked} onchange="AuditManager.openCustomerStockReportEditor('all')"> All Historical Items</label>
          </div>
        </div>

        <div id="reportItemRowsContainer">${rowsHtml}</div>
        <button onclick="AuditManager.addBlankRowToReportEditor()" style="background:#0277bd; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-size:0.8rem; margin-top:8px; cursor:pointer;">+ Add Item to Flyer</button>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #eee; padding-top:12px;">
          <button onclick="document.getElementById('stockReportEditorModal').remove()" style="background:#777; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">Cancel</button>
          <button onclick="AuditManager.exportCustomerStockReportPDF('${cust}')" style="background:#7b1fa2; color:#fff; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">🖨️ Export PDF</button>
          <button onclick="AuditManager.draftEmailFlyer('${cust}')" style="background:#2e7d32; color:#fff; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">📧 Copy to Email</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  addBlankRowToReportEditor() {
    let container = document.getElementById('reportItemRowsContainer');
    let div = document.createElement('div');
    div.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px;';
    div.innerHTML = `
      <input type="text" placeholder="REF" class="rep-ref" style="width:90px; padding:4px; font-weight:bold; text-transform:uppercase;">
      <input type="text" placeholder="Item Description" class="rep-desc" style="flex:1; padding:4px; font-size:0.8rem;">
      <input type="number" value="1" class="rep-qty" style="width:60px; padding:4px; text-align:center;">
      <input type="text" placeholder="$0.00" class="rep-price" style="width:70px; padding:4px; text-align:center;">
      <button onclick="this.parentElement.remove()" style="background:#c62828; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">🗑️</button>
    `;
    container.appendChild(div);
  },

  draftEmailFlyer(cust) {
    let includeDesc = document.getElementById('chkIncludeDescFlyer') ? document.getElementById('chkIncludeDescFlyer').checked : true;
    let includeQty = document.getElementById('chkIncludeQtyFlyer') ? document.getElementById('chkIncludeQtyFlyer').checked : true;
    let includePrice = document.getElementById('chkIncludePriceInReport') ? document.getElementById('chkIncludePriceInReport').checked : true;
    
    let container = document.getElementById('reportItemRowsContainer');
    let rows = container.querySelectorAll('div');
    
    // <p>Good morning,</p>
    // <p>We are happy to inform you that we have the following products you have purchased in the past currently in stock.</p>
    let html = `<div id="flyerCanvasTarget" style="font-family: Arial, sans-serif; font-size: 14px; width: 700px; padding: 20px; background-color: #ffffff; color: #333333;">
      <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 13px; margin-top: 15px; margin-bottom: 15px;">
      <thead>
        <tr style="background-color: #0277bd; color: #ffffff;">
          <th style="padding: 10px; border: 1px solid #ccc; text-align: left;">Reference</th>
          ${includeDesc ? '<th style="padding: 10px; border: 1px solid #ccc; text-align: left;">Description</th>' : ''}
          ${includeQty ? '<th style="padding: 10px; border: 1px solid #ccc; text-align: center;">Quantity On Hand</th>' : ''}
          ${includePrice ? '<th style="padding: 10px; border: 1px solid #ccc; text-align: right;">Price</th>' : ''}
        </tr>
      </thead>
      <tbody>`;
      
    rows.forEach(r => {
      let ref = r.querySelector('.rep-ref').value.trim();
      let desc = r.querySelector('.rep-desc').value.trim();
      let qty = r.querySelector('.rep-qty').value.trim();
      let price = r.querySelector('.rep-price').value.trim();
      let formattedPrice = price ? (price.startsWith('$') || isNaN(parseFloat(price.replace(/[^0-9.-]+/g,""))) ? price : '$' + price) : 'Call for Price';

      if (ref) {
        html += `<tr style="background-color: #ffffff;">
          <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; color: #0277bd;">${ref}</td>
          ${includeDesc ? `<td style="padding: 10px; border: 1px solid #ccc;">${desc}</td>` : ''}
          ${includeQty ? `<td style="padding: 10px; border: 1px solid #ccc; text-align: center; font-weight: bold;">${qty}</td>` : ''}
          ${includePrice ? `<td style="padding: 10px; border: 1px solid #ccc; text-align: right; color: #2e7d32; font-weight: bold;">${formattedPrice}</td>` : ''}
        </tr>`;
      }
    });
    
    html += `</tbody></table>
      </div>`;
    
    // <p style="font-size: 13px;">If there is something you are looking for that is not listed, feel free to send over the reference number, and I will see if I can bring it in for you.</p>
    // <p style="font-size: 13px;">Quantities are reserved on a first-come, first-served basis. Also, if pricing is an issue, just let me know where I need to be, and I will make it happen!</p>
      
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px'; tempDiv.style.top = '-9999px';
    document.body.appendChild(tempDiv);
    
    let target = document.getElementById('flyerCanvasTarget');
    if (typeof html2canvas !== 'undefined') {
      html2canvas(target, { scale: 2, backgroundColor: "#ffffff" }).then(canvas => {
        canvas.toBlob(blob => {
          try {
            navigator.clipboard.write([new window.ClipboardItem({'image/png': blob})]).then(() => {
              alert("✅ Perfect! The flyer has been copied to your clipboard as a picture.\n\nYou can now safely paste (Ctrl+V) it into your email draft, and it will look beautiful even if the customer uses Dark Mode!");
            });
          } catch (e) {
            alert("Clipboard image copy not fully supported by this browser. Falling back to HTML.");
          }
        }, 'image/png');
        document.body.removeChild(tempDiv);
      });
    } else {
      document.body.removeChild(tempDiv);
      alert("Image rendering library is loading. Please try again in a few seconds.");
    }
  },

  exportCustomerStockReportPDF(cust) {
    let includeDesc = document.getElementById('chkIncludeDescFlyer') ? document.getElementById('chkIncludeDescFlyer').checked : true;
    let includeQty = document.getElementById('chkIncludeQtyFlyer') ? document.getElementById('chkIncludeQtyFlyer').checked : true;
    let includePrice = document.getElementById('chkIncludePriceInReport') ? document.getElementById('chkIncludePriceInReport').checked : true;
    
    let container = document.getElementById('reportItemRowsContainer');
    let rows = container.querySelectorAll('div');
    
    let scopeStr = document.querySelector('input[name="histLimit"]:checked').value === 'all' ? 'All' : 'Top10';
    let safeDate = SessionManager.sessionDateStr.replace(/\./g, '_');
    let filename = `Customer_Stock_Flyer_${cust}_${scopeStr}_${safeDate}.pdf`;

    let html = `<!DOCTYPE html><html><head><title>${filename}</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:35px; color:#333; font-size:12px; }
      .header-grid { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #0277bd; padding-bottom:12px; margin-bottom:20px; }
      .company-info h1 { margin:0; color:#0277bd; font-size:20px; text-transform:uppercase; letter-spacing:0.5px; }
      .company-info p { margin:2px 0; color:#555; font-size:11px; }
      .flyer-title { background:#f5f5f5; border-left:5px solid #0277bd; padding:10px; font-size:14px; font-weight:bold; color:#0277bd; margin-bottom:20px; text-transform:uppercase; }
      table { width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; }
      th { background:#fafafa; border-bottom:2px solid #ccc; padding:10px; text-align:left; color:#555; font-size:11px; text-transform:uppercase; }
      td { border-bottom:1px solid #eee; padding:10px; vertical-align:middle; }
      .ref-col { font-weight:bold; color:#000; font-size:13px; }
      .desc-col { font-size:11px; color:#555; }
      .qty-badge { background:#e8f5e9; color:#2e7d32; font-weight:bold; padding:4px 8px; border-radius:4px; font-size:13px; display:inline-block; }
      .footer-note { margin-top:30px; border-top:1px solid #ddd; padding-top:12px; font-size:11px; color:#777; text-align:center; font-style:italic; }
    </style></head><body>

    <div class="header-grid">
      <div class="company-info">
        <h1>Allied Surgical Products</h1>
        <p>737 Barbara Street | Palm Harbor, FL 34684</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:13px; font-weight:bold; color:#333;">ACCOUNT: ${cust}</div>
        <div style="font-size:11px; color:#777;">Date: ${SessionManager.sessionDateStr}</div>
      </div>
    </div>

    <div class="flyer-title">📦 AVAILABLE INVENTORY - READY TO SHIP</div>

    <table>
      <thead>
        <tr>
          <th>REF / Product Code</th>
          ${includeDesc ? '<th>Description</th>' : ''}
          ${includeQty ? '<th style="text-align:center;">Quantity Available</th>' : ''}
          ${includePrice ? '<th style="text-align:right;">Unit Price</th>' : ''}
        </tr>
      </thead>
      <tbody>`;

    rows.forEach(r => {
      let ref = r.querySelector('.rep-ref').value.trim();
      let desc = r.querySelector('.rep-desc').value.trim();
      let qty = r.querySelector('.rep-qty').value.trim();
      let price = r.querySelector('.rep-price').value.trim();

      let formattedPrice = price ? (price.startsWith('$') || isNaN(parseFloat(price.replace(/[^0-9.-]+/g,""))) ? price : '$' + price) : 'Inquire';

      if (ref) {
        html += `
          <tr>
            <td class="ref-col">${ref}</td>
            ${includeDesc ? `<td class="desc-col">${desc || 'Surgical Specialty Item'}</td>` : ''}
            ${includeQty ? `<td style="text-align:center;"><span class="qty-badge">${qty}</span></td>` : ''}
            ${includePrice ? `<td style="text-align:right; font-weight:bold; color:#2e7d32;">${formattedPrice}</td>` : ''}
          </tr>`;
      }
    });

    html += `
      </tbody>
    </table>

    <div class="footer-note">
      Quantities are reserved on a first-come, first-served basis. Contact your Allied Surgical Products representative to place your order.
    </div>

    </body></html>`;

    let win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.title = filename; win.focus(); setTimeout(() => win.print(), 500); }
    
    document.getElementById('stockReportEditorModal').remove();
  },

  getHistoricalCustomerData(cust, limit = '10') {
    let analytics = JSON.parse(localStorage.getItem('asp_remote_analytics')) || {};
    let skuCounts = analytics[cust.toUpperCase()] || {}; 

    let resultList = [];
    
    let sortedSkus = Object.keys(skuCounts).sort((a,b) => skuCounts[b] - skuCounts[a]);
    
    if (limit !== 'all') {
      sortedSkus = sortedSkus.slice(0, parseInt(limit, 10));
    }
    
    sortedSkus.forEach(ref => {
      let dbItem = DatabaseManager.db.find(i => DatabaseManager.getItemSku(i) === ref);
      resultList.push({
        ref: ref,
        desc: dbItem ? DatabaseManager.getItemDesc(dbItem) : 'Surgical Item',
        histQty: skuCounts[ref],
        onHand: dbItem ? (dbItem.onHand || 0) : 0, 
        price: dbItem ? dbItem.price : '$0.00',
        cost: dbItem ? (dbItem.cost || '$0.00') : '$0.00'
      });
    });

    return resultList;
  },

  async exportSessionData(formatType) {
    if (SessionManager.scannedObjects.length === 0 && SessionManager.pendingNewItems.length === 0 && SessionManager.pendingFieldUpdates.length === 0) {
      alert("No data was scanned in this session.");
      return;
    }

    let safeDate = (SessionManager.sessionDateStr || '').trim();
    let cleanSession = (SessionManager.currentSessionName || 'Session').replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_\-\(\)\&\s]/g, '_').trim();
    let cleanWorkflow = (SessionManager.currentWorkflowType || 'Workflow').replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_\-\(\)\&\s]/g, '_').trim();
    let baseFilename = `${safeDate} - ${cleanSession} - ${cleanWorkflow}`;

    if (formatType === 'pdf') {
      let fileContent = this.buildHTMLReportString(baseFilename);
      let iframe = document.getElementById('pdfPrintFrame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'pdfPrintFrame';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }
      let doc = iframe.contentWindow.document;
      doc.open();
      doc.write(fileContent);
      doc.title = baseFilename;
      doc.close();
      
      let originalTitle = document.title;
      document.title = baseFilename;

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => { document.title = originalTitle; }, 2000);
      }, 500);
      return;
    }

    let filename = `${baseFilename}.txt`;
    let fileContent = this.buildTXTReportString();
    let mime = 'text/plain';
    await UIManager.triggerShareOrDownload(fileContent, filename, mime);
  },

  // ==========================================================================
  // MULTI-SESSION AUDIT & TRACEABILITY ENGINE
  // ==========================================================================

  async processAuditFiles(event) {
    try {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const resultsBox = document.getElementById('auditResultsContainer');
      const container = document.getElementById('auditPreviewContent');
      
      if (resultsBox) resultsBox.style.display = 'block';
      if (container) container.innerHTML = '<div style="text-align:center; padding:20px; color:#0277bd; font-weight:bold;">⏳ Processing logs... Please wait.</div>';

      this.parsedAuditSessions = [];
      let filePromises = Array.from(files).map(file => {
        return new Promise((resolve) => {
          let reader = new FileReader();
          reader.onload = (e) => {
            try {
              let text = e.target.result;
              let sessionData = this.parseTXTExportContent(text, file.name);
              if (sessionData && sessionData.items && sessionData.items.length > 0) {
                this.parsedAuditSessions.push(sessionData);
              }
            } catch (err) {
              console.error("Error parsing file " + file.name + ":", err);
            }
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsText(file);
        });
      });

      await Promise.all(filePromises);

      if (this.parsedAuditSessions.length > 0) {
        this.renderAuditPreviewUI();
      } else {
        if (container) container.innerHTML = '<div style="text-align:center; padding:20px; color:#c62828; font-weight:bold;">⚠️ Could not extract valid scanning data from the selected files.<br><br><span style="font-size:0.85rem; color:#555;">Ensure you are uploading .txt files exported directly from the ASP Scanner app.</span></div>';
      }
      
      event.target.value = '';
    } catch (error) {
      alert("Error processing files: " + error.message);
    }
  },

  async batchPushLegacyLogs(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let newUploads = 0;
    let skipped = 0;

    alert(`Starting cloud extraction for ${files.length} historical log(s). Please wait...`);

    let filePromises = Array.from(files).map((file, fileIdx) => {
      return new Promise((resolve) => {
        let reader = new FileReader();
        reader.onload = async (e) => {
          try {
            let text = e.target.result;
            let parsed = AuditManager.parseTXTExportContent(text, file.name);
            
            if (parsed && parsed.items && parsed.items.length > 0) {
              // 1. Normalize Date to standard YYYY.MM.DD
              let rawDate = (parsed.date || '2026.01.01').trim();
              let dateParts = rawDate.split(/[\.\-\/]/);
              let normalizedDateStr = rawDate;
              if (dateParts.length === 3) {
                if (dateParts[0].length === 4) {
                  normalizedDateStr = `${dateParts[0]}.${dateParts[1].padStart(2, '0')}.${dateParts[2].padStart(2, '0')}`;
                } else {
                  normalizedDateStr = `${dateParts[2]}.${dateParts[0].padStart(2, '0')}.${dateParts[1].padStart(2, '0')}`;
                }
              }

              // 2. Generate clean 13-digit numeric timestamp ID
              let baseTimestamp = new Date(normalizedDateStr.replace(/\./g, '-')).getTime();
              if (isNaN(baseTimestamp)) baseTimestamp = Date.now();
              // Offset slightly by file index to guarantee absolute uniqueness
              let cleanNumericId = (baseTimestamp + (fileIdx * 60000) + Math.floor(Math.random() * 1000)).toString();

              // Check deduplication against current archive
              let exists = archive.find(s => s.sessionName === parsed.sessionName && s.dateStr === normalizedDateStr);
              
              if (!exists) {
                let sessionObj = {
                  id: cleanNumericId,
                  status: 'Completed',
                  userName: (parsed.user && parsed.user !== 'N/A') ? parsed.user : 'Thomas',
                  sessionName: parsed.sessionName,
                  orderNum: '',
                  workflowType: parsed.workflow,
                  dateStr: normalizedDateStr,
                  startStr: 'Historical Import',
                  manifestEnabled: false,
                  expectedManifest: [],
                  scannedObjects: parsed.items.map(i => ({
                     actionTag: i.customerTag ? 'Reserved' : (i.workflow.includes('Pack') ? 'Pack & Ship' : 'Inventory'),
                     gtin: '',
                     ref: i.ref,
                     lot: i.lot,
                     exp: i.exp,
                     mfr: 'N/A', 
                     desc: 'Historical Import',
                     price: '$0.00',
                     qty: i.qty,
                     rawScanLines: [],
                     isNew: false,
                     customerTag: i.customerTag || '',
                     itemNote: i.itemNote || ''
                  })),
                  pendingNewItems: parsed.newItems || [],
                  pendingUpdates: parsed.updatedItems || [],
                  lastUpdated: baseTimestamp
                };
                
                archive.push(sessionObj);
                
                // Push to ASP_SCANNER_DATABASE backend
                await fetch(SessionManager.cloudArchiveUrl, {
                  method: 'POST',
                  mode: 'no-cors',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({ action: "ARCHIVE_SESSION", payload: sessionObj })
                });

                // Also push to Medline/Suture Orders backend
                // await fetch(SessionManager.googleFeederUrl, {
                //  method: 'POST',
                //  mode: 'no-cors',
                //  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                //  body: JSON.stringify({ action: "ARCHIVE_SESSION", payload: sessionObj })
                //});
                
                newUploads++;
              } else {
                skipped++;
              }
            }
          } catch (err) {
            console.error("Error parsing legacy file " + file.name + ":", err);
          }
          resolve();
        };
        reader.readAsText(file);
      });
    });

    await Promise.all(filePromises);
    
    // Sort archive newest first and save
    archive.sort((a,b) => b.lastUpdated - a.lastUpdated);
    localStorage.setItem('asp_session_archive', JSON.stringify(archive));
    
    alert(`☁️ Cloud Batch Upload Complete!\n\n✅ Successfully Pushed: ${newUploads}\n⏭️ Skipped (Already Existed): ${skipped}`);
    event.target.value = '';
  },

  clearAuditSessions() {
    this.parsedAuditSessions = [];
    document.getElementById('auditResultsContainer').style.display = 'none';
    document.getElementById('auditPreviewContent').innerHTML = '';
    document.getElementById('auditFilesUpload').value = '';
    alert("Audit session cache cleared! Ready to upload new logs.");
  },

  parseTXTExportContent(text, filename) {
    let sessionName = filename.replace(/\.txt$/i, ''), workflow = "General", date = "Unknown", user = "N/A";
    let items = [], newItems = [], updatedItems = [];
    let lines = text.split(/\r?\n/);
    let currentMode = "GENERAL";
    let tempRef = "", currentTag = "", currentItemNote = "";
    let currentObj = null;

    lines.forEach(line => {
      let trim = line.trim();
      if (!trim) return;

      if (trim.includes("ASP SCANNER APP SUMMARY EXPORT - ")) {
        sessionName = trim.replace("ASP SCANNER APP SUMMARY EXPORT - ", "").trim();
      } else if (trim.includes("Scanned By:")) {
        user = trim.split("Scanned By:")[1].trim();
      } else if (trim.includes("Workflow Process:")) {
        workflow = trim.split("Workflow Process:")[1].trim();
      } else if (trim.includes("Scanned Date:")) {
        date = trim.split("Scanned Date:")[1].trim();
      } else if (trim.includes("--- NEW ITEM DETAILS ---")) {
        currentMode = "NEW_ITEMS"; return;
      } else if (trim.includes("--- EXISTING ITEM UPDATES")) {
        currentMode = "UPDATES"; return;
      } else if (trim.includes("--- SCANNING SESSION FULL BARCODE REFERENCE DATA ---") || trim.includes("--- 1. MASTER ITEM CATALOG ---") || trim.includes("END OF RECEIVING INVENTORY SUMMARY")) {
        currentMode = "DONE"; return;
      }

      if (currentMode === "GENERAL") {
        if (trim.startsWith("[") && trim.includes("REF:")) {
          tempRef = trim.substring(trim.indexOf("REF:") + 4).trim().split(/\s+/)[0];
          currentTag = ""; 
          currentItemNote = "";
        } else if (trim.includes("Customer Tag:")) {
          let parts = trim.split("Customer Tag:");
          if (parts[1]) {
            currentTag = parts[1].split("(")[0].replace(/\|/g, '').trim();
          }
        } else if (trim.includes("Notes:")) {
          currentItemNote = trim.split("Notes:")[1].trim();
        } else if (trim.includes("Lot:") && trim.includes("Exp:") && tempRef) {
          let lotMatch = trim.match(/Lot:\s*([^|]+)\|\s*Exp:\s*([^|]+)\|\s*Qty:\s*(\d+)/i);
          if (lotMatch) {
            let lotVal = lotMatch[1].trim();
            let expVal = lotMatch[2].trim();
            let qtyVal = parseInt(lotMatch[3], 10) || 1;

            let effectiveWorkflow = workflow;
            if (workflow === "Unknown" || workflow === "General") {
              if (text.includes("--- PACK & SHIP ---") || text.includes("Picking & Packing")) effectiveWorkflow = "Picking & Packing";
              else if (text.includes("Receiving & Reserving")) effectiveWorkflow = "Receiving & Reserving";
              else if (text.includes("Reserving")) effectiveWorkflow = "Reserving";
              else if (text.includes("Receiving")) effectiveWorkflow = "Receiving";
            }

            items.push({
              ref: tempRef,
              lot: lotVal,
              exp: expVal,
              qty: qtyVal,
              customerTag: currentTag,
              itemNote: currentItemNote,
              workflow: effectiveWorkflow,
              sessionName: sessionName,
              fileName: filename,
              date: date,
              user: user
            });
          }
        }
      } else if (currentMode === "NEW_ITEMS") {
        if (trim.startsWith("[") && trim.includes("] REF:")) {
          let refPart = trim.substring(trim.indexOf("REF:") + 4).trim();
          currentObj = { ref: refPart.split(/\s+/)[0], gtin: "", mfr: "", price: "$0.00" };
          newItems.push(currentObj);
        } else if (currentObj && trim.includes("GTIN:")) {
          currentObj.gtin = trim.split("GTIN:")[1].trim();
        } else if (currentObj && trim.includes("Manufacturer:")) {
          currentObj.mfr = trim.split("Manufacturer:")[1].trim();
        } else if (currentObj && trim.includes("Price:")) {
          currentObj.price = trim.split("Price:")[1].trim();
        }
      } else if (currentMode === "UPDATES") {
        if (trim.startsWith("[") && trim.includes("] REF:")) {
          let refPart = trim.substring(trim.indexOf("REF:") + 4).trim();
          currentObj = { ref: refPart.split(/\s+/)[0], gtin: "" };
          updatedItems.push(currentObj);
        } else if (currentObj && trim.includes("GTIN:")) {
          currentObj.gtin = trim.split("GTIN:")[1].trim();
        }
      }
    });

    return items.length > 0 ? { fileName: filename, sessionName, workflow, date, user, items, newItems, updatedItems } : null;
  },

  compileTraceabilityData() {
    let lotTraceMap = {}; let totalItemsScanned = 0; let uniqueRefs = new Set(); let datesArray = []; let sourceFilesList = [];
    this.parsedAuditSessions.forEach(session => {
      if (session.fileName && !sourceFilesList.includes(session.fileName)) sourceFilesList.push(session.fileName);
      session.items.forEach(item => {
        uniqueRefs.add(item.ref); totalItemsScanned += item.qty;
        if (item.date && item.date !== "Unknown") datesArray.push(item.date.replace(/\./g, '-'));
        let key = `${item.ref}_${item.lot}`;
        if (!lotTraceMap[key]) {
          let match = DatabaseManager.db.find(i => DatabaseManager.getItemSku(i) === item.ref);
          lotTraceMap[key] = { ref: item.ref, lot: item.lot, exp: item.exp, desc: match ? DatabaseManager.getItemDesc(match) : '', mfr: match ? DatabaseManager.getItemVendor(match) : '', gtin: match ? match.gtin : 'N/A', price: match ? match.price : '$0.00', inboundQty: 0, reservedQty: 0, outboundQty: 0, damagedQty: 0, receivedDate: 'N/A', reservedForTag: '', timeline: [] };
        }
        if (item.itemNote) lotTraceMap[key].damagedQty += item.qty;
        if (item.workflow.includes('Receiving')) { lotTraceMap[key].inboundQty += item.qty; if (lotTraceMap[key].receivedDate === 'N/A') lotTraceMap[key].receivedDate = item.date; }
        if (item.workflow.includes('Reserving')) { lotTraceMap[key].reservedQty += item.qty; if (item.customerTag) lotTraceMap[key].reservedForTag = item.customerTag; }
        if (item.workflow.includes('Packing')) { lotTraceMap[key].outboundQty += item.qty; }
        lotTraceMap[key].timeline.push({ date: item.date, workflow: item.workflow, qty: item.qty, sessionName: item.sessionName, fileName: item.fileName, customerTag: item.customerTag, itemNote: item.itemNote, user: item.user });
      });
    });
    datesArray.sort();
    let startDate = datesArray.length > 0 ? datesArray[0] : SessionManager.sessionDateStr;
    let endDate = datesArray.length > 0 ? datesArray[datesArray.length - 1] : SessionManager.sessionDateStr;
    let sortedTraceList = Object.values(lotTraceMap).sort((a, b) => { if (a.ref < b.ref) return -1; if (a.ref > b.ref) return 1; if (a.lot < b.lot) return -1; if (a.lot > b.lot) return 1; return 0; });
    sortedTraceList.forEach(trace => { trace.timeline.sort((a, b) => new Date(a.date.replace(/\./g, '-')) - new Date(b.date.replace(/\./g, '-'))); });
    return { sortedTraceList, totalItemsScanned, uniqueRefsCount: uniqueRefs.size, startDate, endDate, sourceFilesList };
  },

  renderAuditPreviewUI() {
    const container = document.getElementById('auditPreviewContent');
    if (!container) return;

    const { sortedTraceList, totalItemsScanned, uniqueRefsCount, startDate, endDate, sourceFilesList } = this.compileTraceabilityData();
    
    let fileListHtml = sourceFilesList.map(f => `<li>${f}</li>`).join('');

    let inboundItems = [];
    let shelfItems = [];
    let reservedMap = {};
    let shippedItems = [];

    sortedTraceList.forEach(t => {
      if (t.inboundQty > 0) inboundItems.push(t);
      if (t.inboundQty > 0 && !t.reservedForTag && t.outboundQty === 0) shelfItems.push(t);
      if (t.reservedForTag) {
        let tag = t.reservedForTag;
        if (!reservedMap[tag]) reservedMap[tag] = [];
        reservedMap[tag].push(t);
      }
      if (t.outboundQty > 0) shippedItems.push(t);
    });

    let reservedBinsHtml = '';
    let resKeys = Object.keys(reservedMap);

    if (resKeys.length > 0) {
      resKeys.forEach(tag => {
        let rows = reservedMap[tag].map(r => {
          let remaining = r.reservedQty - r.outboundQty;
          let remBadge = remaining > 0 
            ? `<span style="color:#d32f2f; font-weight:bold;">${remaining}</span>` 
            : `<span style="color:#2e7d32; font-weight:bold;">✅ 0</span>`;
          
          return `
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="width:25%; padding:4px 6px; font-weight:bold; color:#0277bd;">${r.ref}</td>
              <td style="width:25%; padding:4px 6px;">${r.lot}</td>
              <td style="width:15%; padding:4px 6px; text-align:center; font-weight:bold; color:#0277bd;">${r.reservedQty}</td>
              <td style="width:15%; padding:4px 6px; text-align:center; font-weight:bold; color:${r.outboundQty >= r.reservedQty ? '#2e7d32' : '#555'};">${r.outboundQty}</td>
              <td style="width:20%; padding:4px 6px; text-align:center;">${remBadge}</td>
            </tr>`;
        }).join('');

        reservedBinsHtml += `
          <div style="background:#f0f8ff; border:1px solid #bfe0fb; border-radius:4px; padding:8px; margin-bottom:10px;">
            <div style="font-weight:bold; color:#0277bd; font-size:0.85rem; margin-bottom:6px; border-bottom:1px solid #bfe0fb; padding-bottom:3px;">
              Order / Customer: ${tag}
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem; table-layout:fixed;">
              <thead>
                <tr style="text-align:left; color:#555; background:#e1f5fe;">
                  <th style="width:25%; padding:4px 6px;">REF</th>
                  <th style="width:25%; padding:4px 6px;">Lot</th>
                  <th style="width:15%; padding:4px 6px; text-align:center;">Reserved</th>
                  <th style="width:15%; padding:4px 6px; text-align:center;">Packed</th>
                  <th style="width:20%; padding:4px 6px; text-align:center; color:#d32f2f;">Remaining</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>`;
      });
    } else {
      reservedBinsHtml = '<div style="font-size:0.8rem; color:#777; padding:8px;">No active customer allocations found in uploaded logs.</div>';
    }

    let html = `
      <div class="audit-card" style="background-color:#e3f2fd; border-left:5px solid #0277bd; margin-bottom:15px;">
        <div class="flex-between">
          <h3 style="margin:0; color:#0277bd;">🗓️ Audit Period: ${startDate} – ${endDate}</h3>
          <span class="badge-info" style="background-color:#0277bd; color:#fff;">${this.parsedAuditSessions.length} Logs Processed</span>
        </div>
        <div style="margin-top:8px; font-size:0.9rem; line-height:1.4;">
          <strong>Unique REFs Handled:</strong> ${uniqueRefsCount} &nbsp;|&nbsp; 
          <strong>Total Units Moved:</strong> ${totalItemsScanned}
        </div>
        <details style="margin-top:10px; font-size:0.8rem; color:#555;">
          <summary style="cursor:pointer; font-weight:bold; color:#0277bd;">📁 View Audited Source Logs (${sourceFilesList.length})</summary>
          <ul style="margin:6px 0 0 16px; padding:0; max-height:90px; overflow-y:auto;">${fileListHtml}</ul>
        </details>
      </div>

      <div class="card" style="border-left: 5px solid #2e7d32; margin-bottom: 12px;">
        <h3 style="color:#2e7d32; margin:0 0 8px 0; font-size:1rem;">📥 Inbound Stock Received (${inboundItems.reduce((acc, c) => acc + c.inboundQty, 0)} Units)</h3>
        <div style="max-height: 200px; overflow-y: auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; table-layout:fixed;">
            <thead>
              <tr style="background:#e8f5e9; text-align:left;">
                <th style="width:25%; padding:4px 6px;">REF</th>
                <th style="width:25%; padding:4px 6px;">Lot</th>
                <th style="width:20%; padding:4px 6px;">Exp</th>
                <th style="width:15%; padding:4px 6px; text-align:center;">Qty</th>
                <th style="width:15%; padding:4px 6px;">Received</th>
              </tr>
            </thead>
            <tbody>
              ${inboundItems.map(i => `
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:4px 6px; font-weight:bold; color:#0277bd;">${i.ref}</td>
                  <td style="padding:4px 6px;">${i.lot}</td>
                  <td style="padding:4px 6px;">${i.exp}</td>
                  <td style="padding:4px 6px; text-align:center; font-weight:bold;">${i.inboundQty}</td>
                  <td style="padding:4px 6px;">${i.receivedDate}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="border-left: 5px solid #0277bd; margin-bottom: 12px;">
        <h3 style="color:#0277bd; margin:0 0 8px 0; font-size:1rem;">🚩 Active Reserved Bins (Allocated Orders)</h3>
        ${reservedBinsHtml}
      </div>

      <div class="card" style="border-left: 5px solid #e65100; margin-bottom: 12px;">
        <h3 style="color:#e65100; margin:0 0 8px 0; font-size:1rem;">🖐️ Outbound Orders Shipped (${shippedItems.reduce((acc, c) => acc + c.outboundQty, 0)} Units)</h3>
        <div style="max-height: 200px; overflow-y: auto;">
          <table style="width:100%; border-collapse:collapse; font-size:0.8rem; table-layout:fixed;">
            <thead>
              <tr style="background:#fff3e0; text-align:left;">
                <th style="width:30%; padding:4px 6px;">REF</th>
                <th style="width:30%; padding:4px 6px;">Lot</th>
                <th style="width:20%; padding:4px 6px;">Exp</th>
                <th style="width:20%; padding:4px 6px; text-align:center;">Qty Shipped</th>
              </tr>
            </thead>
            <tbody>
              ${shippedItems.map(s => `
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:4px 6px; font-weight:bold; color:#0277bd;">${s.ref}</td>
                  <td style="padding:4px 6px;">${s.lot}</td>
                  <td style="padding:4px 6px;">${s.exp}</td>
                  <td style="padding:4px 6px; text-align:center; font-weight:bold; color:#e65100;">${s.outboundQty}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  buildHTMLAuditReportString(filename, startDate, endDate) {
    const { sortedTraceList, totalItemsScanned, uniqueRefsCount, sourceFilesList } = this.compileTraceabilityData();

    let inventoryStockList = [];
    let customerGroupMap = {};
    let generalOutboundList = [];

    sortedTraceList.forEach(trace => {
      if (trace.reservedForTag) {
        let tag = trace.reservedForTag;
        if (!customerGroupMap[tag]) customerGroupMap[tag] = [];
        customerGroupMap[tag].push(trace);
      } else if (trace.inboundQty > 0) {
        inventoryStockList.push(trace);
      } else if (trace.outboundQty > 0) {
        generalOutboundList.push(trace);
      }
    });

    let fileItemsHtml = sourceFilesList.map(f => `<div style="font-size:10px; color:#555;">• ${f}</div>`).join('');

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${filename}</title>
<style>
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 30px; font-size: 12px; }
.header-grid { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0277bd; padding-bottom: 15px; margin-bottom: 15px; }
.company-info h1 { margin: 0; color: #0277bd; font-size: 20px; text-transform: uppercase; }
.company-info p { margin: 2px 0; color: #555; }
.report-meta { text-align: right; }
.report-meta h2 { margin: 0; color: #333; font-size: 15px; margin-bottom: 6px; }
.report-meta table { width: 100%; text-align: right; border: none; font-size: 11px; margin: 0; }
.report-meta td { border: none; padding: 1px 0 1px 10px; }
.file-log-box { background: #f4eeda; border: 1px solid #8b8589; border-radius: 4px; padding: 8px 12px; margin-bottom: 15px; }
.file-log-box h4 { margin: 0 0 4px 0; color: #0277bd; font-size: 11px; text-transform: uppercase; }
.section-title { background-color: #f0f0f0; border-left: 5px solid #0277bd; padding: 6px 10px; font-size: 13px; font-weight: bold; margin: 20px 0 10px 0; text-transform: uppercase; }
.sub-section-title { background-color: #e3f2fd; border-left: 4px solid #0277bd; padding: 4px 8px; font-size: 12px; font-weight: bold; margin: 12px 0 6px 0; color: #0277bd; }
.audit-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
.audit-table th { background-color: #fafafa; border: 1px solid #ccc; padding: 6px; text-align: center; color: #333; font-size: 11px; }
.audit-table td { border: 1px solid #eee; padding: 6px; vertical-align: middle; text-align: center; }
.ref-col { font-weight: bold; color: #0277bd; text-align: left; }
.desc-col { text-align: left; font-size: 10px; color: #555; }
.timeline-text { font-family: monospace; font-size: 10px; text-align: left; background: #f9f9f9; padding: 4px; border-radius: 3px; }
@media print {
  body { margin: 0; padding: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page-break { page-break-before: always; }
}
</style>
</head>
<body>
<div class="header-grid">
<div>
  <img src="ASP_Box_Web_RGB.png" style="max-height: 65px;" alt="ASP Logo" />
</div>
<div class="company-info" style="margin-left: 20px;">
  <h1>Allied Surgical Products</h1>
  <p>737 Barbara Street | Palm Harbor, FL 34684</p>
</div>
<div class="report-meta">
  <h2>SHIPPING & RECEIVING WEEKLY SUMMARY</h2>
  <table>
    <tr><td><strong>Date Range:</strong></td><td>${startDate} - ${endDate}</td></tr>
    <tr><td><strong>Sessions Audited:</strong></td><td>${this.parsedAuditSessions.length} Logs</td></tr>
    <tr><td><strong>Unique REFs:</strong></td><td>${uniqueRefsCount}</td></tr>
    <tr><td><strong>Total Units Handled:</strong></td><td>${totalItemsScanned}</td></tr>
  </table>
</div>
</div>

<div class="file-log-box">
  <h4>AUDITED SOURCE LOG FILES (${sourceFilesList.length})</h4>
  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 4px;">
    ${fileItemsHtml}
  </div>
</div>

<div class="section-title">1. MASTER CATALOG & INVENTORY ITEMS</div>
<table class="audit-table">
<thead>
  <tr>
    <th>REF</th>
    <th>Manufacturer</th>
    <th>Description</th>
    <th>Lot</th>
    <th>Exp</th>
    <th>Qty</th>
    <th>Price</th>
    <th>GTIN</th>
  </tr>
</thead>
<tbody>`;

    sortedTraceList.forEach(t => {
      html += `
        <tr>
          <td class="ref-col">${t.ref}</td>
          <td>${t.mfr}</td>
          <td class="desc-col">${t.desc}</td>
          <td>${t.lot}</td>
          <td>${t.exp}</td>
          <td><strong>${t.inboundQty || t.outboundQty || t.reservedQty}</strong></td>
          <td>${t.price}</td>
          <td style="font-family:monospace; font-size:10px;">${this.cleanGtinValue(t.gtin)}</td>
        </tr>
      `;
    });

    html += `</tbody></table>

<div class="section-title">2. RECEIVING & ALLOCATION STATUS</div>
<table class="audit-table">
<thead>
  <tr>
    <th>REF</th>
    <th>Lot</th>
    <th>Exp</th>
    <th>Total Qty</th>
    <th>Damaged Qty</th>
    <th>Received Date</th>
    <th>Reserved Qty</th>
    <th>Reserved For</th>
    <th>Packed Qty</th>
  </tr>
</thead>
<tbody>`;

    sortedTraceList.forEach(t => {
      let dmgStr = t.damagedQty > 0 ? `<span style="color:#d32f2f; font-weight:bold;">${t.damagedQty}</span>` : '0';
      let resQtyStr = t.reservedQty > 0 ? t.reservedQty : '--';
      let resForStr = t.reservedForTag ? t.reservedForTag : '--';

      html += `
        <tr>
          <td class="ref-col">${t.ref}</td>
          <td>${t.lot}</td>
          <td>${t.exp}</td>
          <td><strong>${t.inboundQty || t.outboundQty || t.reservedQty}</strong></td>
          <td>${dmgStr}</td>
          <td>${t.receivedDate}</td>
          <td>${resQtyStr}</td>
          <td>${resForStr}</td>
          <td>${t.outboundQty || '--'}</td>
        </tr>
      `;
    });

    html += `</tbody></table>

<div class="page-break"></div>
<div class="section-title">3. LIFECYCLE TRACEABILITY FLOW (CHRONOLOGICAL)</div>`;

    if (inventoryStockList.length > 0) {
      html += `<div class="sub-section-title">📦 Received to General Stock Inventory</div>
      <table class="audit-table">
      <thead><tr><th style="width:20%;">REF & Lot</th><th style="width:20%;">Received Date / Qty</th><th style="width:60%;">Chronological Lifecycle Timeline</th></tr></thead><tbody>`;
      
      inventoryStockList.forEach(t => {
        let timelineStr = t.timeline.map(ev => `• <strong>${ev.date}</strong> - ${ev.workflow}: ${ev.qty} unit(s) [${ev.sessionName}]`).join('<br>');
        html += `<tr><td class="ref-col">${t.ref}<br><span style="font-weight:normal; color:#555;">Lot: ${t.lot}</span></td><td>${t.receivedDate}<br><strong>Qty: ${t.inboundQty}</strong></td><td class="timeline-text">${timelineStr}</td></tr>`;
      });
      html += `</tbody></table>`;
    }

    if (Object.keys(customerGroupMap).length > 0) {
      html += `<div class="sub-section-title">🚩 Customer Allocations & Reserved Bins</div>`;
      for (let custTag in customerGroupMap) {
        html += `<div style="font-weight:bold; margin:6px 0 2px 0; color:#0277bd;">Customer Order: ${custTag}</div>
        <table class="audit-table">
        <thead><tr><th style="width:20%;">REF & Lot</th><th style="width:20%;">Reserved vs Packed</th><th style="width:60%;">Chronological Lifecycle Timeline</th></tr></thead><tbody>`;

        customerGroupMap[custTag].forEach(t => {
          let timelineStr = t.timeline.map(ev => `• <strong>${ev.date}</strong> - ${ev.workflow}: ${ev.qty} unit(s) [${ev.sessionName}]`).join('<br>');
          html += `<tr><td class="ref-col">${t.ref}<br><span style="font-weight:normal; color:#555;">Lot: ${t.lot}</span></td><td>Reserved: <strong>${t.reservedQty}</strong><br>Packed: <strong>${t.outboundQty}</strong></td><td class="timeline-text">${timelineStr}</td></tr>`;
        });
        html += `</tbody></table>`;
      }
    }

    if (generalOutboundList.length > 0) {
      html += `<div class="sub-section-title">🖐️ General Outbound Shipments</div>
      <table class="audit-table">
      <thead><tr><th style="width:20%;">REF & Lot</th><th style="width:20%;">Packed Qty</th><th style="width:60%;">Chronological Lifecycle Timeline</th></tr></thead><tbody>`;
      
      generalOutboundList.forEach(t => {
        let timelineStr = t.timeline.map(ev => `• <strong>${ev.date}</strong> - ${ev.workflow}: ${ev.qty} unit(s) [${ev.sessionName}]`).join('<br>');
        html += `<tr><td class="ref-col">${t.ref}<br><span style="font-weight:normal; color:#555;">Lot: ${t.lot}</span></td><td><strong>Qty: ${t.outboundQty}</strong></td><td class="timeline-text">${timelineStr}</td></tr>`;
      });
      html += `</tbody></table>`;
    }

    html += `</body></html>`;
    return html;
  },

  executeAuditExport() {
    const val = document.getElementById('auditExportDropdown').value;
    if (!val) { alert("Please select an audit export format."); return; }

    const { sortedTraceList, totalItemsScanned, uniqueRefsCount, startDate, endDate, sourceFilesList } = this.compileTraceabilityData();
    const filename = `ASP - Shipping & Receiving - Week Summary (${startDate}-${endDate}).${val}`;

    if (val === 'pdf') {
      let printWin = window.open('', '_blank');
      if (!printWin) { alert("Pop-up blocked! Please allow pop-ups to generate the PDF."); return; }

      let fileContent = this.buildHTMLAuditReportString(filename, startDate, endDate);
      printWin.document.open();
      printWin.document.write(fileContent);
      printWin.document.close();

      printWin.onload = () => {
        setTimeout(() => {
          printWin.focus();
          printWin.print();
        }, 500);
      };
      return;
    }

    let reportText = [
      `================================================================================`,
      `ASP - Shipping & Receiving - Week Summary (${startDate}-${endDate})`,
      `Generated Date: ${SessionManager.sessionDateStr}`,
      `Total Uploaded Sessions: ${this.parsedAuditSessions.length}`,
      `Total Unique REFs: ${uniqueRefsCount}`,
      `Total Units Handled: ${totalItemsScanned}`,
      `================================================================================`,
      `AUDITED SOURCE LOG FILES (${sourceFilesList.length}):`,
      sourceFilesList.map(f => `  • ${f}`).join('\n'),
      `================================================================================\n`,
      `--- 1. MASTER ITEM CATALOG ---\n`
    ];

    sortedTraceList.forEach(t => {
      reportText.push(`Ref: ${t.ref} | Mfr: ${t.mfr} | Lot: ${t.lot} | Exp: ${t.exp} | Qty: ${t.inboundQty || t.outboundQty || t.reservedQty} | Price: ${t.price} | GTIN: ${this.cleanGtinValue(t.gtin)}`);
    });

    reportText.push(`\n--------------------------------------------------------------------------------`);
    reportText.push(`--- 2. RECEIVING & ALLOCATION STATUS ---\n`);

    sortedTraceList.forEach(t => {
      let line = `Ref: ${t.ref} | Lot: ${t.lot} | Exp: ${t.exp} | Qty: ${t.inboundQty || t.outboundQty || t.reservedQty}`;
      if (t.damagedQty > 0) line += ` | Damaged Qty: ${t.damagedQty}`;
      if (t.receivedDate !== 'N/A') line += ` | Received Date: ${t.receivedDate}`;
      if (t.reservedQty > 0) line += ` | Reserved Qty: ${t.reservedQty} | Reserved for: ${t.reservedForTag}`;
      line += ` | Packed Qty: ${t.outboundQty}`;
      reportText.push(line);
    });

    reportText.push(`\n--------------------------------------------------------------------------------`);
    reportText.push(`--- 3. LIFECYCLE TRACEABILITY FLOW (CHRONOLOGICAL) ---\n`);

    sortedTraceList.forEach(t => {
      reportText.push(`Ref: ${t.ref}    |    Lot: ${t.lot}    |    Exp: ${t.exp}    |    Qty: ${t.inboundQty || t.outboundQty || t.reservedQty}`);
      if (t.receivedDate !== 'N/A') reportText.push(`             |    Received: ${t.receivedDate}`);
      if (t.reservedQty > 0) reportText.push(`             |    Reserved Qty: ${t.reservedQty}    |    Reserved for: ${t.reservedForTag}`);
      reportText.push(`             |    Timeline History:`);
      t.timeline.forEach(ev => {
        let tagStr = ev.customerTag ? ` [Tag: ${ev.customerTag}]` : '';
        reportText.push(`                 - [${ev.date}] ${ev.workflow}: ${ev.qty} unit(s) via ${ev.sessionName}${tagStr}`);
      });
      reportText.push(``);
    });

    reportText.push(`================================================================================\nEND OF WEEKLY SUMMARY\n================================================================================`);
    
    UIManager.triggerShareOrDownload(reportText.join('\n'), filename, 'text/plain');
  },

  exportThriveCreates() {
    let newItemsMap = new Map();
    this.parsedAuditSessions.forEach(sess => { (sess.newItems || []).forEach(item => newItemsMap.set(item.ref, item)); });
    if(newItemsMap.size === 0) { alert("No New Items found in uploaded logs."); return; }
    
    let headers = ['Product Name', 'Product Categories', 'Product Description', 'Variant Name', 'SKU', 'Barcode', 'Price', 'Default Cost', 'Active (ACTIVE, INACTIVE)', 'Reorder Point', 'Reorder Target', 'Vendor 1', 'Vendor 1 SKU', 'Vendor 2', 'Vendor 2 SKU', 'Vendor 3', 'Vendor 3 SKU', 'PH Warehouse Price', 'PH Warehouse Default Cost', 'PH Warehouse Reorder Point', 'PH Warehouse Reorder Target', 'PH Warehouse Quantity In Stock'];
    let instructionRow = 'Ignore this row - generated by ASP Scanner App';
    let csvContent = instructionRow + '\n' + headers.join(',') + '\n';
    
    newItemsMap.forEach(item => {
      let row = Array(headers.length).fill('');
      row[0] = item.ref; row[4] = item.ref; row[5] = (!item.gtin || item.gtin === 'N/A') ? '' : item.gtin;
      row[6] = (item.price || '').replace('$', ''); row[8] = 'ACTIVE'; row[11] = item.mfr; row[12] = item.ref;
      csvContent += row.map(v => `"${v}"`).join(',') + '\n';
    });
    UIManager.triggerShareOrDownload(csvContent, `Thrive_Bulk_Create_${Date.now()}.csv`, 'text/csv');
  },

  exportThriveEdits() {
    let updatesMap = new Map();
    this.parsedAuditSessions.forEach(sess => { (sess.updatedItems || []).forEach(item => updatesMap.set(item.ref, item)); });
    if(updatesMap.size === 0) { alert("No Existing Item Updates found in uploaded logs."); return; }
    
    let headers = ['ID', 'Product Name', 'Product Categories', 'Variant Name', 'New Variant Name', 'SKU', 'New SKU', 'Barcode', 'New Barcode', 'Price', 'New Price', 'Default Cost', 'New Default Cost', 'Reorder Point', 'New Reorder Point', 'Reorder Target', 'New Reorder Target', 'Vendor 1', 'New Vendor 1', 'Vendor 1 SKU', 'New Vendor 1 SKU', 'Vendor 2', 'New Vendor 2', 'Vendor 2 SKU', 'New Vendor 2 SKU', 'Vendor 3', 'New Vendor 3', 'Vendor 3 SKU', 'New Vendor 3 SKU', 'PH Warehouse Use Defaults', 'New PH Warehouse Use Defaults', 'PH Warehouse Price', 'New PH Warehouse Price', 'PH Warehouse Default Cost', 'New PH Warehouse Default Cost', 'PH Warehouse Reorder Point', 'New PH Warehouse Reorder Point', 'PH Warehouse Reorder Target', 'New PH Warehouse Reorder Target', 'PH Warehouse Quantity In Stock', 'New PH Warehouse Quantity In Stock'];
    let instructionRow = 'Ignore this row - generated by ASP Scanner App';
    let csvContent = instructionRow + '\n' + headers.join(',') + '\n';

    updatesMap.forEach(item => {
      let row = Array(headers.length).fill('');
      row[1] = item.ref; row[5] = item.ref; row[8] = (!item.gtin || item.gtin === 'N/A') ? '' : item.gtin;
      csvContent += row.map(v => `"${v}"`).join(',') + '\n';
    });
    UIManager.triggerShareOrDownload(csvContent, `Thrive_Bulk_Edit_${Date.now()}.csv`, 'text/csv');
  },

  exportUpdatedDatabaseJSON() {
    let currentDB = JSON.parse(localStorage.getItem('asp_wh_db')) || [];
    let currentVendors = JSON.parse(localStorage.getItem('asp_wh_vendors')) || [];
    let newItemsMap = new Map(), updatesMap = new Map();
    
    this.parsedAuditSessions.forEach(sess => {
      (sess.newItems || []).forEach(item => newItemsMap.set(item.ref, item));
      (sess.updatedItems || []).forEach(item => updatesMap.set(item.ref, item));
    });

    currentDB.forEach(dbItem => {
      let refKey = (dbItem.sku || dbItem.ref || '').toUpperCase();
      if(updatesMap.has(refKey)) {
        let update = updatesMap.get(refKey);
        if(update.gtin && update.gtin !== 'N/A') dbItem.gtin = update.gtin;
      }
    });

    newItemsMap.forEach(newItem => {
      let exists = currentDB.find(i => (i.sku || i.ref || '').toUpperCase() === newItem.ref);
      if(!exists) {
        currentDB.push({ gtin: newItem.gtin === 'N/A' ? '' : newItem.gtin, ref: newItem.ref, desc: "", price: newItem.price || "$0.00", mfr: newItem.mfr });
      }
    });

    let outJSON = { vendors: currentVendors, items: currentDB };
    UIManager.triggerShareOrDownload(JSON.stringify(outJSON, null, 2), `database_updated_${Date.now()}.json`, 'application/json');
  }
};