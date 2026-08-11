/* ======================================================================= */
/* ASP SCANNER APP - AUDIT & EXPORT MANAGER (js/auditManager.js)           */
/* VERSION 2.0.1 | FULL PRODUCTION SINGLE-SESSION & MULTI-AUDIT EXPORTS    */
/* ======================================================================= */

const AuditManager = {
  parsedAuditSessions: [],

  cleanGtinValue(val) {
    if (!val) return 'N/A';
    return val.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() || 'N/A';
  },

  updateSessionSummaryView() {
    let container = document.getElementById('summaryListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (SessionManager.scannedObjects.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 14px; color: #555;">No items scanned in this session yet.</div>';
      return;
    }

    SessionManager.scannedObjects.forEach((item, index) => {
      let div = document.createElement('div');
      div.className = 'summary-item-card';

      let topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'space-between';
      topRow.style.width = '100%';

      let statusIcon = item.actionTag === 'Reserved' ? '🚩' : (item.actionTag === 'Pack & Ship' ? '🖐️' : '📦');

      topRow.innerHTML = `<span><strong>${index + 1}. REF:</strong> <span style="color:#0277bd;">${item.ref}</span></span> 
                          <span><strong>Qty:</strong> ${item.qty}</span>`;
      div.appendChild(topRow);

      let botRow = document.createElement('div');
      botRow.style.display = 'flex';
      botRow.style.justifyContent = 'space-between';
      botRow.style.width = '100%';
      botRow.style.marginTop = '6px';
      botRow.style.fontSize = '0.85rem';
      botRow.style.color = '#555';

      let tagHtml = item.customerTag ? `<strong>Tag:</strong> <span style="color:#0277bd;">${item.customerTag}</span>` : '';
      botRow.innerHTML = `<span>Status: ${statusIcon} ${item.actionTag}</span> <span>${tagHtml}</span>`;
      div.appendChild(botRow);
      
      if (item.itemNote) {
        let noteRow = document.createElement('div');
        noteRow.style.fontSize = '0.8rem';
        noteRow.style.color = '#d32f2f';
        noteRow.style.marginTop = '4px';
        noteRow.innerHTML = `<em>Note: ${item.itemNote}</em>`;
        div.appendChild(noteRow);
      }
      container.appendChild(div);
    });
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
    } else if (val === 'cancel') {
      SessionManager.cancelSession();
    } else if (val === 'complete') {
      SessionManager.completeSession();
    } else if (val === 'pdf' || val === 'txt') {
      this.(val);
    }

    setTimeout(() => { document.getElementById('exportDropdown').value = ""; }, 500);
  },

  // ==========================================================================
  // SINGLE SESSION REPORT BUILDERS (TXT & PDF)
  // ==========================================================================

  buildTXTReportString() {
    let scannedMap = {};

    SessionManager.scannedObjects.forEach(item => {
      let rKey = item.ref;
      let cleanGtin = this.cleanGtinValue(item.gtin);
      if (!scannedMap[rKey]) {
        scannedMap[rKey] = { ref: item.ref, desc: item.desc, mfr: item.mfr, price: item.price, totalScannedQty: 0, byTag: {} };
      }
      scannedMap[rKey].totalScannedQty += item.qty;

      let tKey = item.customerTag || 'UNTAGGED';
      if (!scannedMap[rKey].byTag[tKey]) scannedMap[rKey].byTag[tKey] = { tagTotalQty: 0, lots: {} };
      scannedMap[rKey].byTag[tKey].tagTotalQty += item.qty;

      let lotKey = `${item.lot}_${item.exp}`;
      if (!scannedMap[rKey].byTag[tKey].lots[lotKey]) {
        scannedMap[rKey].byTag[tKey].lots[lotKey] = { lot: item.lot, exp: item.exp, qty: 0, notes: [] };
      }
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
    
    if (sNote) {
      reportLines.push(`          Session Notes:       ${sNote}`);
    }
    reportLines.push(`================================================================================\n`);

    // CONDITIONAL SECTION 1: SHORTAGES
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

    // CONDITIONAL SECTION 2: OVERAGES
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

    // CONDITIONAL SECTION 3: ROUTED TO CUSTOMER BINS
    let reservedItems = SessionManager.scannedObjects.filter(i => i.customerTag);
    if (reservedItems.length > 0) {
      reportLines.push(`--- ROUTED TO CUSTOMER BINS ---`);
      reservedItems.forEach(r => {
        reportLines.push(`  * REF: ${r.ref} | Tag: ${r.customerTag} | Qty: ${r.qty}`);
      });
      reportLines.push(``);
    }

    // CONDITIONAL SECTION 4: ITEMS REQUIRING PRICING
    let unpricedItems = Object.values(scannedMap).filter(i => !i.price || i.price === "$0.00" || i.price === "0");
    if (unpricedItems.length > 0) {
      reportLines.push(`--- ITEMS REQUIRING PRICING ---`);
      unpricedItems.forEach(u => {
        reportLines.push(`  * REF: ${u.ref} | MFR: ${u.mfr} | Qty Scanned: ${u.totalScannedQty}`);
      });
      reportLines.push(``);
    }

    reportLines.push(`--- SCANNED ITEM DETAILS BREAKDOWN ---\n`);
    let count = 1;
    for (let rKey in scannedMap) {
      let rData = scannedMap[rKey];
      reportLines.push(`[${count}] REF: ${rData.ref}\n    | Total Quantity: ${rData.totalScannedQty}`);
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
      reportLines.push(``); count++;
    }

    if (SessionManager.pendingNewItems.length > 0) {
      reportLines.push(`--------------------------------------------------------------------------------\n--- NEW ITEM DETAILS ---\n--------------------------------------------------------------------------------`);
      let nIdx = 1;
      SessionManager.pendingNewItems.forEach(nItem => {
        reportLines.push(`[ ${nIdx} ] REF: ${nItem.ref}\n          | GTIN: ${this.cleanGtinValue(nItem.gtin)}\n          | Manufacturer: ${nItem.mfr}\n          | Price: ${nItem.price}`); nIdx++;
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

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${filename}</title>
<style>
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; font-size: 14px; }
.header-grid { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0277bd; padding-bottom: 20px; margin-bottom: 20px; }
.company-info { flex: 1; }
.company-info h1 { margin: 0; color: #0277bd; font-size: 24px; text-transform: uppercase; }
.company-info p { margin: 2px 0; color: #555; }
.report-meta { text-align: right; }
.report-meta h2 { margin: 0; color: #333; font-size: 18px; margin-bottom: 8px; }
.report-meta table { width: 100%; text-align: right; border: none; font-size: 13px; margin: 0; }
.report-meta td { border: none; padding: 2px 0 2px 15px; }
.section-title { background-color: #f0f0f0; border-left: 5px solid #0277bd; padding: 8px 12px; font-size: 16px; font-weight: bold; margin: 25px 0 12px 0; text-transform: uppercase; }
.data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.data-table th { background-color: #fafafa; border-bottom: 2px solid #ccc; padding: 8px; text-align: left; font-size: 12px; color: #555; }
.data-table td { border-bottom: 1px solid #eee; padding: 8px; vertical-align: top; }
.ref-col { font-weight: bold; color: #000; font-size: 14px; }
.desc-col { font-size: 12px; color: #666; max-width: 250px; }
.lot-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 5px; background: #fafafa; border: 1px solid #eaeaea; }
.lot-table th, .lot-table td { border: 1px solid #eaeaea; padding: 4px 8px; }
.lot-table th { background: #f0f0f0; }
.tag-header { font-weight: bold; color: #d32f2f; margin: 8px 0 4px 0; font-size: 12px; text-transform: uppercase; }
.note-text { color: #d32f2f; font-style: italic; font-size: 11px; display: block; margin-top: 3px;}
.session-notes { background-color: #fff9c4; border-left: 4px solid #fbc02d; padding: 10px; margin-bottom: 20px; font-size: 13px;}
.alert-box { padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 13px; }
.alert-short { background-color: #ffebee; border-left: 4px solid #c62828; color: #c62828; }
.alert-over { background-color: #fff3e0; border-left: 4px solid #e65100; color: #e65100; }
.alert-tag { background-color: #e3f2fd; border-left: 4px solid #0277bd; color: #0277bd; }
.alert-price { background-color: #f3e5f5; border-left: 4px solid #7b1fa2; color: #7b1fa2; }
@media print {
  body { margin: 0; padding: 15px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page-break { page-break-before: always; }
}
</style>
</head>
<body>
<div class="header-grid">
<div>
  <img src="ASP_Box_Web_RGB.png" style="max-height: 80px;" alt="ASP Logo" />
</div>
<div class="company-info" style="margin-left: 20px;">
  <h1>Allied Surgical Products</h1>
  <p>737 Barbara Street</p>
  <p>Palm Harbor, FL 34684</p>
</div>
<div class="report-meta">
  <h2>SESSION LOG EXPORT</h2>
  <table>
    <tr><td><strong>Session:</strong></td><td>${sessionTitleHeader}</td></tr>
    <tr><td><strong>User:</strong></td><td>${SessionManager.currentUserName || 'N/A'}</td></tr>
    <tr><td><strong>Workflow:</strong></td><td>${SessionManager.currentWorkflowType}</td></tr>
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

    // ROUTED TO CUSTOMER BINS
    let reservedItems = SessionManager.scannedObjects.filter(i => i.customerTag);
    if (reservedItems.length > 0) {
      html += `<div class="section-title" style="border-color:#0277bd; color:#0277bd;">🚩 ROUTED TO CUSTOMER BINS</div><div class="alert-box alert-tag"><table style="width:100%;"><tr><th>REF</th><th>Customer Tag</th><th>Quantity Routed</th></tr>`;
      reservedItems.forEach(r => {
        html += `<tr><td><strong>${r.ref}</strong></td><td>${r.customerTag}</td><td style="text-align:center; font-weight:bold;">${r.qty}</td></tr>`;
      });
      html += `</table></div>`;
    }

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
      html += `<tr><td><div class="ref-col">${rData.ref}</div><div style="font-size:11px; color:#888; margin-top:4px;">${rData.mfr}</div></td><td><div class="desc-col">${descText}</div><div style="font-size:11px; margin-top:6px;"><strong>GTIN:</strong> ${rData.gtin}</div>${priceHtml}</td><td>${lotSection}</td><td style="text-align:center; font-size:18px; font-weight:bold;">${rData.totalScannedQty}</td></tr>`;
    }
    html += `</tbody></table>`;

    // 2-COLUMN PRICING TABLE AT VERY END
    let unpricedItems = Object.values(scannedMap).filter(i => !i.price || i.price === "$0.00" || i.price === "0");
    if (unpricedItems.length > 0) {
      html += `
        <div style="margin-top: 30px; page-break-inside: avoid;">
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

    html += `</body></html>`; 
    return html;
  },

  async exportSessionData(formatType) {
    if (SessionManager.scannedObjects.length === 0 && SessionManager.pendingNewItems.length === 0 && SessionManager.pendingFieldUpdates.length === 0) {
      alert("No data was scanned in this session.");
      return;
    }

    // 1. Convert date dots to hyphens (2026.08.11 -> 2026-08-11) so browser print dialogs don't truncate at .08
    let safeDate = (SessionManager.sessionDateStr || '').replace(/\./g, '-');

    // 2. Clean session name & workflow, allowing ampersands (&), hyphens, parens, and spaces while stripping stray .pdf tags
    let cleanSession = (SessionManager.currentSessionName || 'Session')
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9_\-\(\)\&\s]/g, '_')
      .replace(/\./g, '-')
      .trim();

    let cleanWorkflow = (SessionManager.currentWorkflowType || 'Workflow')
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9_\-\(\)\&\s]/g, '_')
      .replace(/\./g, '-')
      .trim();

    // Base filename without inner periods
    let baseFilename = `${safeDate} - ${cleanSession} - ${cleanWorkflow}`;

    if (formatType === 'pdf') {
      let printWin = window.open('', '_blank');
      if (!printWin) {
        alert("Pop-up blocked! Please allow pop-ups for this site to generate the PDF.");
        return;
      }
      
      let fileContent = this.buildHTMLReportString(baseFilename);
      printWin.document.open();
      printWin.document.write(fileContent);
      printWin.document.title = baseFilename; // Chrome uses document.title for the suggested PDF filename
      printWin.document.close();
      
      setTimeout(() => {
        printWin.focus();
        printWin.print();
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
    const files = event.target.files;
    if (files.length === 0) return;
    this.parsedAuditSessions = [];
    let filePromises = Array.from(files).map(file => {
      return new Promise((resolve) => {
        let reader = new FileReader();
        reader.onload = (e) => {
          let text = e.target.result;
          let sessionData = this.parseTXTExportContent(text, file.name);
          if (sessionData) this.parsedAuditSessions.push(sessionData);
          resolve();
        };
        reader.readAsText(file);
      });
    });
    await Promise.all(filePromises);
    if (this.parsedAuditSessions.length > 0) {
      this.renderAuditPreviewUI();
      document.getElementById('auditResultsContainer').style.display = 'block';
    } else alert("Could not parse valid session logs from selected files.");
  },

  clearAuditSessions() {
    this.parsedAuditSessions = [];
    document.getElementById('auditResultsContainer').style.display = 'none';
    document.getElementById('auditPreviewContent').innerHTML = '';
    document.getElementById('auditFilesUpload').value = '';
    alert("Audit session cache cleared! Ready to upload new logs.");
  },

  parseTXTExportContent(text, filename) {
    let sessionName = filename, workflow = "General", date = "Unknown", user = "N/A";
    let items = [], newItems = [], updatedItems = [];
    let lines = text.split('\n');
    let currentMode = "GENERAL";
    let tempRef = "", currentTag = "", currentItemNote = "";
    let currentObj = null;

    lines.forEach(line => {
      let trim = line.trim();
      if (trim.includes("ASP SCANNER APP SUMMARY EXPORT - ")) sessionName = trim.replace("ASP SCANNER APP SUMMARY EXPORT - ", "").trim();
      else if (trim.startsWith("Scanned By:")) user = trim.replace("Scanned By:", "").trim();
      else if (trim.startsWith("Workflow Process:")) workflow = trim.replace("Workflow Process:", "").trim();
      else if (trim.startsWith("Scanned Date:")) date = trim.replace("Scanned Date:", "").trim();
      else if (trim.includes("--- NEW ITEM DETAILS ---")) { currentMode = "NEW_ITEMS"; return; }
      else if (trim.includes("--- EXISTING ITEM UPDATES")) { currentMode = "UPDATES"; return; }
      else if (trim.includes("--- SCANNING SESSION FULL BARCODE REFERENCE DATA ---") || trim.includes("--- 1. MASTER ITEM CATALOG ---")) { currentMode = "DONE"; return; }

      if (currentMode === "GENERAL") {
        if (trim.startsWith("[") && trim.includes("REF:")) {
          tempRef = trim.substring(trim.indexOf("REF:") + 4).trim();
          currentTag = ""; currentItemNote = "";
        } else if (trim.startsWith("| Customer Tag:")) {
          let tagMatch = trim.match(/Customer Tag:\s*(.+?)(?:\s*\(Qty:|\s*$)/);
          if (tagMatch) currentTag = tagMatch[1].trim();
        } else if (trim.startsWith("* Notes:")) {
          currentItemNote = trim.replace("* Notes:", "").trim();
        } else if (trim.startsWith("- Lot:")) {
          let lotMatch = trim.match(/- Lot:\s*([^|]+)\|\s*Exp:\s*([^|]+)\|\s*Qty:\s*(\d+)/);
          if (lotMatch && tempRef) {
            let effectiveWorkflow = workflow;
            if (workflow === "Unknown" || workflow === "General") {
              if (text.includes("--- PACK & SHIP ---")) effectiveWorkflow = "Picking & Packing";
              else if (text.includes("--- RESERVED FOR CUSTOMERS ---") && text.includes("--- INVENTORY ADDITIONS ---")) effectiveWorkflow = "Receiving & Reserving";
              else if (text.includes("--- RESERVED FOR CUSTOMERS ---")) effectiveWorkflow = "Reserving";
              else if (text.includes("--- INVENTORY ADDITIONS ---")) effectiveWorkflow = "Receiving";
            }
            items.push({ ref: tempRef, lot: lotMatch[1].trim(), exp: lotMatch[2].trim(), qty: parseInt(lotMatch[3], 10) || 1, customerTag: currentTag, itemNote: currentItemNote, workflow: effectiveWorkflow, sessionName: sessionName, fileName: filename, date: date, user: user });
          }
        }
      } else if (currentMode === "NEW_ITEMS") {
        if (trim.startsWith("[") && trim.includes("] REF:")) {
          let refPart = trim.substring(trim.indexOf("REF:") + 4).trim();
          currentObj = { ref: refPart.split(/\s+/)[0], gtin: "", mfr: "", price: "$0.00" };
          newItems.push(currentObj);
        } else if (currentObj && trim.startsWith("| GTIN:")) currentObj.gtin = trim.split("GTIN:")[1].trim();
        else if (currentObj && trim.startsWith("| Manufacturer:")) currentObj.mfr = trim.split("Manufacturer:")[1].trim();
        else if (currentObj && trim.startsWith("| Price:")) currentObj.price = trim.split("Price:")[1].trim();
      } else if (currentMode === "UPDATES") {
        if (trim.startsWith("[") && trim.includes("] REF:")) {
          let refPart = trim.substring(trim.indexOf("REF:") + 4).trim();
          currentObj = { ref: refPart.split(/\s+/)[0], gtin: "" };
          updatedItems.push(currentObj);
        } else if (currentObj && trim.startsWith("| GTIN:")) currentObj.gtin = trim.split("GTIN:")[1].trim();
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
    const { sortedTraceList, totalItemsScanned, uniqueRefsCount, startDate, endDate, sourceFilesList } = this.compileTraceabilityData();
    let fileListHtml = sourceFilesList.map(f => `<li>${f}</li>`).join('');
    let html = `<div class="audit-card" style="background-color:#e3f2fd;"><h3>Week Summary (${startDate} - ${endDate})</h3><div><strong>Sessions Uploaded:</strong> ${this.parsedAuditSessions.length} | <strong>Unique REFs:</strong> ${uniqueRefsCount} | <strong>Total Units:</strong> ${totalItemsScanned}</div><div style="margin-top:8px; font-size:0.8rem; color:#555;"><strong>Source Log Files (${sourceFilesList.length}):</strong><ul style="margin:4px 0 0 16px; padding:0; max-height:80px; overflow-y:auto;">${fileListHtml}</ul></div></div>`;
    sortedTraceList.forEach(trace => {
      let resHtml = trace.reservedQty > 0 ? `<div><strong>Reserved Qty:</strong> ${trace.reservedQty} &nbsp;|&nbsp; <strong>Reserved For:</strong> ${trace.reservedForTag}</div>` : '';
      let dmgHtml = trace.damagedQty > 0 ? `<div style="color:#d32f2f;"><strong>Damaged Qty:</strong> ${trace.damagedQty}</div>` : '';
      html += `<div class="audit-card"><div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:6px;"><strong style="font-size:1rem; color:#0277bd;">Ref: ${trace.ref}</strong><span style="font-size:0.85rem; color:#555;">${trace.mfr}</span></div><div style="font-size:0.85rem; font-family:monospace; line-height:1.4;"><div><strong>Lot:</strong> ${trace.lot} &nbsp;|&nbsp; <strong>Exp:</strong> ${trace.exp} &nbsp;|&nbsp; <strong>Qty:</strong> ${trace.inboundQty || trace.outboundQty || trace.reservedQty}</div><div><strong>Received Date:</strong> ${trace.receivedDate}</div>${resHtml}${dmgHtml}</div></div>`;
    });
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
    <tr><td><strong>Sessions Audited:</strong></td><td>${parsedAuditSessions.length} Logs</td></tr>
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

<!-- TABLE 1: MASTER ITEM CATALOG -->
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

<!-- TABLE 2: RECEIVING & ALLOCATION STATUS -->
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

<!-- TABLE 3: LIFECYCLE TRACEABILITY FLOW -->
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
      printWin.document.title = filename;
      printWin.document.close();

      setTimeout(() => { printWin.focus(); printWin.print(); }, 500);
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

  // --- THRIVE & DB EXPORTS ---
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
