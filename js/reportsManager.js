/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/reportsManager.js
 * Author: Thomas Seyfors
 * Date Created: August 2026
 * 
 * Description:
 *   Enterprise analytics and reporting generator. Compiles live data into 
 *   standalone business intelligence reports without requiring Excel.
 *
 * Affected Features:
 *   - Full On-Hand Stock Reports
 *   - Expiration Warning Reports
 *   - Stocktake Variance & Financial Impact Reports
 *   - End of Week Shipping & Revenue Summaries
 *
 * Copyright (c) 2026 Thomas Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const ReportsManager = {

  openInventoryReportOptions(type) {
    if (type !== 'in_stock') {
      this.generateInventoryReport(type); // Route out-of-stock and pricing directly
      return;
    }

    let modal = document.createElement('div');
    modal.id = 'inventoryReportOptionsModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    
    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:420px; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #2e7d32; padding-bottom:8px; margin-bottom:15px;">
          <h3 style="margin:0; color:#2e7d32; display:flex; align-items:center; gap:8px;">
            <i data-lucide="package" style="width:20px; height:20px;"></i> Full On-Hand Stock Options
          </h3>
          <button onclick="document.getElementById('inventoryReportOptionsModal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
        </div>
        <div style="margin-bottom:15px; font-size:0.85rem; color:#555;">Select the columns you want to include in the PDF export:</div>
        
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px; background:#f1f8e9; border:1px solid #c8e6c9; padding:12px; border-radius:4px;">
          <label style="cursor:pointer; font-weight:bold;"><input type="checkbox" id="chkInvMfr" checked> Manufacturer</label>
          <label style="cursor:pointer; font-weight:bold;"><input type="checkbox" id="chkInvDesc" checked> Description</label>
          <label style="cursor:pointer; font-weight:bold; color:#0277bd;"><input type="checkbox" id="chkInvAvail" checked> Available Quantity (Sales)</label>
          <label style="cursor:pointer; font-weight:bold;"><input type="checkbox" id="chkInvPrice" checked> Selling Price</label>
          
          <div style="border-top:1px dashed #a5d6a7; margin:4px 0; padding-top:6px;"></div>
          
          <label style="cursor:pointer; font-size:0.85rem; color:#555;"><input type="checkbox" id="chkInvTotal"> Total Physical Qty (Internal)</label>
          <label style="cursor:pointer; font-size:0.85rem; color:#555;"><input type="checkbox" id="chkInvRes"> Reserved Qty (Internal)</label>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button onclick="document.getElementById('inventoryReportOptionsModal').remove()" style="background:#777; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">Cancel</button>
          <button onclick="ReportsManager.generateInventoryReport('in_stock')" style="background:#2e7d32; color:#fff; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">🖨️ Generate Report</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  
    // NEW: Render the SVGs immediately after the modal is added to the screen
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  generateInventoryReport(type) {
    let db = DatabaseManager.db.slice().sort((a,b) => (a.mfr || '').localeCompare(b.mfr) || (a.ref || '').localeCompare(b.ref));
    let filtered = [];
    
    // Setup Dynamic Titles and Suffixes
    let title = "On-Hand Stock Report";
    let fileSuffix = "On-Hand";

    let incMfr = document.getElementById('chkInvMfr') ? document.getElementById('chkInvMfr').checked : true;
    let incDesc = document.getElementById('chkInvDesc') ? document.getElementById('chkInvDesc').checked : true;
    let incAvail = document.getElementById('chkInvAvail') ? document.getElementById('chkInvAvail').checked : true;
    let incPrice = document.getElementById('chkInvPrice') ? document.getElementById('chkInvPrice').checked : true;
    let incTotal = document.getElementById('chkInvTotal') ? document.getElementById('chkInvTotal').checked : false;
    let incRes = document.getElementById('chkInvRes') ? document.getElementById('chkInvRes').checked : false;

    // Apply Dynamic Naming
    if (type === 'in_stock') {
      filtered = db.filter(i => {
        let total = parseInt(i.onHand, 10) || 0;
        let res = parseInt(i.reservedQty, 10) || 0;
        let avail = total - res;
        let priceStr = String(i.price || '').replace(/[^0-9.-]+/g, '');
        let numPrice = parseFloat(priceStr) || 0;
        return avail > 0 && numPrice > 0;
      });
    } else if (type === 'out_of_stock') {
      filtered = db.filter(i => !i.onHand || i.onHand === 0);
      title = "Out of Stock Items Report";
      fileSuffix = "Out_Of_Stock";
    } else if (type === 'pricing') {
      filtered = db.filter(i => {
        let priceStr = String(i.price || '').replace(/[^0-9.-]+/g, '');
        let numPrice = parseFloat(priceStr) || 0;
        return numPrice === 0;
      });
      title = "Missing Price / Cost Report";
      fileSuffix = "Missing_Pricing";
    }

    filtered.sort((a, b) => (a.mfr || '').localeCompare(b.mfr || '') || (a.ref || a.sku || '').localeCompare(b.ref || b.sku || ''));
    let totalUnits = filtered.reduce((acc, i) => acc + ((parseInt(i.onHand, 10) || 0) - (parseInt(i.reservedQty, 10) || 0)), 0);

    // ... (Keep your existing HTML generation here) ...

    let html = `<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; color:#333; font-size:12px; }
      .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0277bd; padding-bottom: 10px; margin-bottom: 15px; }
      .brand-section { display: flex; align-items: center; gap: 12px; }
      .logo-img { height: 40px; object-fit: contain; }
      .company-name { font-size: 14px; font-weight: bold; color: #555; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
      h2 { color: #0277bd; margin: 2px 0 0 0; font-size: 20px; }
      .meta-right { text-align: right; font-size: 11px; color: #555; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
      th { background: #f0f0f0; border: 1px solid #ccc; padding: 8px; text-align: left; }
      td { border: 1px solid #eee; padding: 8px; vertical-align: top; }
      .qty-avail { text-align:center; font-weight:bold; font-size:13px; color:#2e7d32; }
      .qty-sub { text-align:center; font-weight:normal; color:#666; font-size:11px; }
    </style></head><body>

    <div class="header-container">
      <div class="brand-section">
        <img src="https://raw.githubusercontent.com/ASP-Seyfors/ASP-IMS/main/ASP_Icon_192.png" class="logo-img" alt="ASP Logo">
        <div>
          <div class="company-name">Allied Surgical Products</div>
          <h2>${title}</h2>
        </div>
      </div>
      <div class="meta-right">
        <div>Generated: ${new Date().toLocaleDateString()}</div>
        <div style="margin-top: 4px; font-weight: bold; color: #2e7d32; font-size: 12px;">Total Available Items: ${totalUnits}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          ${incMfr ? '<th>Manufacturer</th>' : ''}
          <th>REF / SKU</th>
          ${incDesc ? '<th>Description</th>' : ''}
          ${incTotal ? '<th style="text-align:center;">Total Qty</th>' : ''}
          ${incRes ? '<th style="text-align:center;">Reserved</th>' : ''}
          ${incAvail ? '<th style="text-align:center;">Available Qty</th>' : ''}
          ${incPrice ? '<th style="text-align:right;">Price</th>' : ''}
        </tr>
      </thead>
      <tbody>`;

    filtered.forEach(item => {
      let priceRaw = String(item.price || '');
      let cleanNum = parseFloat(priceRaw.replace(/[^0-9.-]+/g, '')) || 0;
      let formattedPrice = cleanNum > 0 ? '$' + cleanNum.toFixed(2) : '$0.00';
      
      let total = parseInt(item.onHand, 10) || 0;
      let res = parseInt(item.reservedQty, 10) || 0;
      let avail = total - res;
      
      html += `<tr>
        ${incMfr ? `<td>${item.mfr || 'UNKNOWN'}</td>` : ''}
        <td style="font-weight:bold; color:#0277bd;">${item.ref || item.sku}</td>
        ${incDesc ? `<td style="font-size:11px; color:#555;">${item.desc || '--'}</td>` : ''}
        ${incTotal ? `<td class="qty-sub">${total}</td>` : ''}
        ${incRes ? `<td class="qty-sub" style="color:#d32f2f;">${res}</td>` : ''}
        ${incAvail ? `<td class="qty-avail">${avail}</td>` : ''}
        ${incPrice ? `<td style="text-align:right; font-weight:bold; color:#2e7d32;">${formattedPrice}</td>` : ''}
      </tr>`;
    });

    html += `</tbody></table></body></html>`;
    
    // 3. Fix the Filename and Print Truncation
    let dateStr = new Date().toLocaleDateString().replace(/\//g, '.');
    // Remove the .pdf here
    let filename = `ASP_${fileSuffix}_Report_(${dateStr})`; 
    let safeTitle = filename.replace(/\./g, '\u2024'); 
    
    let win = window.open('', '_blank');
    if (win) { 
      win.document.write(html); 
      win.document.title = safeTitle; 
      win.focus(); 
      setTimeout(() => win.print(), UIManager.printTimeout); // Increased timeout
    }
    
    let modal = document.getElementById('inventoryReportOptionsModal');
    if (modal) modal.remove();
  },

  generateVarianceReportPDF(varianceData, mode, netFinancialImpact) {
    // Keep your standard YYYY.MM.DD formatting
    let filename = `Stocktake_Variance_Report_${SessionManager.sessionDateStr}.pdf`;
    let financialColor = netFinancialImpact >= 0 ? '#2e7d32' : '#c62828';
    let impactStr = netFinancialImpact >= 0 ? `+$${netFinancialImpact.toFixed(2)}` : `-$${Math.abs(netFinancialImpact).toFixed(2)}`;

    let html = `<!DOCTYPE html><html><head><title>${filename}</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; color:#333; font-size:12px; }
      .header { border-bottom:3px solid #7b1fa2; padding-bottom:10px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th { background: #f3e5f5; border: 1px solid #ce93d8; padding: 8px; text-align: left; }
      td { border: 1px solid #eee; padding: 8px; vertical-align: top; }
      .impact-box { background: #f5f5f5; border: 1px solid #ccc; padding: 15px; text-align: center; border-radius: 6px; font-size: 16px; margin-bottom: 20px;}
    </style></head><body>
    
    <div class="header">
      <div>
        <h1 style="margin:0; color:#7b1fa2; font-size:20px; text-transform:uppercase;">Stocktake Variance Report</h1>
        <div style="font-size:12px; font-weight:bold; color:#555; margin-top:4px;">Mode: ${mode}</div>
      </div>
      <div style="text-align:right; font-size:11px; color:#555;">
        <div>Date: ${SessionManager.sessionDateStr}</div>
        <div>User: ${SessionManager.currentUserName}</div>
      </div>
    </div>

    <div class="impact-box">
      Total Net Financial Variance: <strong style="color:${financialColor}; font-size: 22px; margin-left: 10px;">${impactStr}</strong>
    </div>

    <table>
      <thead>
        <tr>
          <th>REF / SKU</th>
          <th>Manufacturer</th>
          <th style="text-align:center;">System Expected</th>
          <th style="text-align:center;">Actual Counted</th>
          <th style="text-align:center;">Variance (Qty)</th>
          <th style="text-align:right;">Variance Value ($)</th>
        </tr>
      </thead>
      <tbody>`;

    varianceData.sort((a,b) => a.variance - b.variance).forEach(v => {
      let vColor = v.variance > 0 ? '#2e7d32' : '#c62828';
      let vSign = v.variance > 0 ? '+' : '';
      let fColor = v.financialImpact > 0 ? '#2e7d32' : (v.financialImpact < 0 ? '#c62828' : '#555');
      let fSign = v.financialImpact > 0 ? '+$' : (v.financialImpact < 0 ? '-$' : '$');
      
      html += `<tr>
        <td style="font-weight:bold;">${v.ref}</td>
        <td>${v.mfr}</td>
        <td style="text-align:center;">${v.expected}</td>
        <td style="text-align:center; font-weight:bold;">${v.counted}</td>
        <td style="text-align:center; font-weight:bold; color:${vColor};">${vSign}${v.variance}</td>
        <td style="text-align:right; font-weight:bold; color:${fColor};">${fSign}${Math.abs(v.financialImpact).toFixed(2)}</td>
      </tr>`;
    });

    html += `</tbody></table></body></html>`;

    let win = window.open('', '_blank');
    if (win) { 
      win.document.write(html); 
      let safeTitle = filename.replace(/\./g, '\u2024');
      win.document.title = safeTitle; 
      win.focus(); 
      setTimeout(() => win.print(), UIManager.printTimeout); 
    }
  },

  async generateEndOfWeekReport() {
    let btn = document.getElementById('btnEndOfWeek');
    let origText = btn ? btn.textContent : "📊 Generate the End of the Week (Last 7 Days) Report";
    if (btn) { btn.textContent = "⏳ Fetching Live Ledger..."; btn.disabled = true; }

    try {
      // 1. Fetch live ledger
      let res = await fetch(`${SessionManager.cloudArchiveUrl}?action=GET_AUDIT_LOG&t=${Date.now()}`);
      let text = await res.text();
      let responseData = JSON.parse(text);

      if (responseData.status !== "success" || !responseData.data) {
        throw new Error(responseData.message || "Failed to load audit log from cloud.");
      }

      let auditLog = responseData.data;

      // 2. Filter for the last 7 days
      let cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      cutoffDate.setHours(0,0,0,0);

      let filteredLogs = auditLog.filter(row => {
        let rowDate = new Date(row['Timestamp']);
        return rowDate >= cutoffDate;
      });

      if (filteredLogs.length === 0) {
        alert("No warehouse activity logged in the last 7 days.");
        return;
      }

      // 3. Calculate KPIs
      let sessionsSet = new Set();
      let inboundSessions = new Set();
      let outboundSessions = new Set();
      let totalItems = 0;
      let uniqueRefs = new Set();
      let sessionsByDate = {};
      let newlyAddedRefs = new Set();
      let totalRevenue = 0;
      
      let testKeywords = ["TEST SUPPLIER", "ASP_INTERNAL", "ASP_TESTER", "ASP_TESTER2", "TESTER"];

      filteredLogs.forEach(row => {
        let sessionName = row['Session / Reason'] || 'Unknown Session';
        
        // EXCLUDE TEST SESSIONS
        let upperSession = sessionName.toUpperCase();
        let isTest = testKeywords.some(kw => upperSession.includes(kw)) || upperSession === "TEST" || upperSession.startsWith("TEST ");
        if (isTest) return;

        let workflow = row['Workflow'] || '';
        let dateStr = row['Timestamp'].split(' ')[0];
        let qty = parseInt(row['Qty Moved'], 10) || 0;
        let ref = row['REF / SKU'] || '';
        let priceStr = String(row['Price'] || '').replace(/[^0-9.-]+/g, '');
        let price = parseFloat(priceStr) || 0;

        sessionsSet.add(sessionName);
        if (workflow.includes('Receiving')) inboundSessions.add(sessionName);
        if (workflow.includes('Packing') || workflow.includes('Pack & Ship')) {
            outboundSessions.add(sessionName);
            totalRevenue += (Math.abs(qty) * price);
        }
        
        // Check if the item was added in this log
        let notes = row['Destination / Action'] || '';
        if (workflow.includes('New Item Added') || notes.includes('New Item Added')) {
            newlyAddedRefs.add(ref); 
        }
        
        if (ref && ref !== 'N/A') {
          totalItems += Math.abs(qty);
          uniqueRefs.add(ref);
        }

        if (!sessionsByDate[dateStr]) sessionsByDate[dateStr] = new Set();
        sessionsByDate[dateStr].add(sessionName);
      });

      // Calculate customer bins directly from live cloud allocations, or local storage as fallback
      let rawAllocations = localStorage.getItem('asp_allocations') || '{}';
      let allocationsObj = JSON.parse(rawAllocations);
      
      let binsHtml = '';
      let customersWithStock = Object.keys(allocationsObj).sort();
      if (customersWithStock.length === 0) {
        binsHtml = '<div style="font-size:11px; color:#777; font-style:italic;">No active reservations found.</div>';
      } else {
        customersWithStock.forEach(cust => {
            let items = allocationsObj[cust];
            let totalCustItems = 0;
            let rowsHtml = '';
            Object.keys(items).sort().forEach(ref => {
                let qty = items[ref];
                totalCustItems += qty;
                rowsHtml += `<tr><td style="padding:4px 8px; border:1px solid #eee;">${ref}</td><td style="padding:4px 8px; border:1px solid #eee; text-align:center; font-weight:bold;">${qty}</td></tr>`;
            });
            binsHtml += `
            <div style="margin-bottom: 15px; border: 1px solid #bfe0fb; border-radius: 4px; padding: 10px; background: #fff;">
              <div style="color: #0277bd; font-weight: bold; font-size: 14px; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
                ${cust} <span style="float:right; color:#2e7d32;">Total Items: ${totalCustItems}</span>
              </div>
              <table style="width:100%; border-collapse: collapse; font-size: 12px;">
                <tr style="background:#f0f8ff;"><th style="text-align:left; padding:4px 8px;">REF</th><th style="text-align:center; padding:4px 8px;">Reserved Qty</th></tr>
                ${rowsHtml}
              </table>
            </div>`;
        });
      }

      // Check local pending new items for any that were created this week
      let localNewItems = JSON.parse(localStorage.getItem('asp_pending_new_items')) || [];
      localNewItems.forEach(item => {
        newlyAddedRefs.add(item.ref);
      });

      // 4. Build the HTML output
      let auditedSessionsHtml = '';
      let sortedDates = Object.keys(sessionsByDate).sort().reverse(); 
      if (sortedDates.length > 0) {
        sortedDates.forEach(d => {
          auditedSessionsHtml += `<h4 style="margin: 10px 0 4px 0; color: #333; font-size: 13px; border-bottom: 1px solid #eee; padding-bottom: 2px;">📅 ${d}</h4><ul class="session-list">`;
          Array.from(sessionsByDate[d]).sort().forEach(s => {
            auditedSessionsHtml += `<li>${s}</li>`;
          });
          auditedSessionsHtml += `</ul>`;
        });
      } else {
        auditedSessionsHtml = '<div style="font-size:11px; color:#777; font-style:italic;">No non-test sessions logged this week.</div>';
      }

      let generatedDate = new Date().toLocaleDateString();
      let dateRangeStr = sortedDates.length > 0 ? `${sortedDates[sortedDates.length - 1]} to ${sortedDates[0]}` : generatedDate;
      let baseFilename = `ASP_End_of_Week_Report_(${dateRangeStr.replace(/\//g, '.')})`;

      let newRefsHtml = '';
      if (newlyAddedRefs.size > 0) {
        newRefsHtml = `<ul style="column-count: 3; list-style-type: square; margin-top: 10px;">`;
        Array.from(newlyAddedRefs).sort().forEach(r => {
            newRefsHtml += `<li><strong style="color:#0277bd;">${r}</strong></li>`;
        });
        newRefsHtml += `</ul>`;
      } else {
        newRefsHtml = `<div style="font-size:11px; color:#777; font-style:italic;">No new REFs added this week.</div>`;
      }

      let html = `<!DOCTYPE html><html><head><title>ASP End of Week Report</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; color:#333; font-size:12px; }
        .header { border-bottom:3px solid #0277bd; padding-bottom:10px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; }
        h1 { margin:0; color:#0277bd; font-size:20px; text-transform:uppercase; }
        h3 { color: #0277bd; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 25px;}
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
        .kpi-box { background: #f0f8ff; border: 1px solid #bfe0fb; padding: 15px; border-radius: 6px; text-align: center; }
        .kpi-val { font-size: 20px; font-weight: bold; color: #0277bd; display: block; margin-top: 5px; }
        .kpi-rev { font-size: 20px; font-weight: bold; color: #2e7d32; display: block; margin-top: 5px; }
        ul { column-count: 2; margin: 0; padding-left: 20px; }
        li { margin-bottom: 4px; font-family: monospace; font-size: 11px; color: #555; }
        .session-list { column-count: 1; list-style-type: square; }
        @media print {
            .page-break { page-break-before: always; }
        }
      </style></head><body>

      <div class="header">
        <div>
          <h1>End of Week Report</h1>
          <div style="font-size:12px; color:#555; margin-top:4px;">Allied Surgical Products</div>
        </div>
        <div style="text-align:right; font-size:11px; color:#555;">
          <div>Generated: <strong>${generatedDate}</strong></div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-box">Total Items Scanned<span class="kpi-val">${totalItems}</span></div>
        <div class="kpi-box">Unique REFs Touched<span class="kpi-val">${uniqueRefs.size}</span></div>
        <div class="kpi-box">New REFs Added<span class="kpi-val">${newlyAddedRefs.size}</span></div>
        
        <div class="kpi-box">Sessions Logged<span class="kpi-val">${sessionsSet.size}</span></div>
        <div class="kpi-box">Outgoing Orders Packed<span class="kpi-val">${outboundSessions.size}</span></div>
        <div class="kpi-box">Total Revenue (Packed)<span class="kpi-rev">$${totalRevenue.toFixed(2)}</span></div>
      </div>

      <h3>✨ NEW REFS ADDED THIS WEEK</h3>
      ${newRefsHtml}

      <h3>📄 AUDITED SESSIONS (${sessionsSet.size})</h3>
      ${auditedSessionsHtml}

      <div class="page-break"></div>
      <h3>📦 CURRENT CUSTOMER RESERVED BINS</h3>
      <p style="font-size: 11px; color: #555; margin-top: -10px;">The following physical items are currently allocated and in reserved bins.</p>
      ${binsHtml}

      </body></html>`;

      // 5. Trigger the hidden iframe print with Magic Dot Title
      let iframe = document.getElementById('pdfPrintFrame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'pdfPrintFrame';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }
      
      let safeTitle = baseFilename.replace(/\./g, '\u2024'); 
      
      let doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.title = safeTitle;
      doc.close();
      
      let originalTitle = document.title;
      document.title = safeTitle;

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => { document.title = originalTitle; }, 2000);
      }, UIManager.printTimeout);

    } catch(err) {
      alert("Error generating End of Week Report: " + err.message);
    } finally {
      if (btn) { btn.textContent = origText; btn.disabled = false; }
    }
  },

  async generateExpirationReport() {
    let months = parseInt(document.getElementById('expirationFilter').value, 10);
    let btn = document.querySelector('button[onclick="ReportsManager.generateExpirationReport()"]');
    let origText = btn ? btn.textContent : "⚠️ Run Report";
    if (btn) { btn.textContent = "⏳ Fetching Live Ledger..."; btn.disabled = true; }

    try {
      // 1. Fetch the live audit log directly from the master Google Sheet
      let res = await fetch(`${SessionManager.cloudArchiveUrl}?action=GET_AUDIT_LOG&t=${Date.now()}`);
      let text = await res.text();
      let responseData;
      
      try {
        responseData = JSON.parse(text);
      } catch(e) { 
        throw new Error("Connection blocked by Google. Check Apps Script permissions."); 
      }

      if (responseData.status !== "success" || !responseData.data) {
        throw new Error(responseData.message || "Failed to load audit log from cloud.");
      }

      let auditLog = responseData.data;
      let lotMap = {};

      // 2. Crunch the ledger math to find active lots
      auditLog.forEach(row => {
        let ref = row['REF / SKU'];
        let lot = row['Lot'];
        let exp = row['Exp Date'];
        let qty = parseInt(row['Qty Moved'], 10) || 0;
        let workflow = row['Workflow'] || '';
        
        // Skip invalid rows or items without expiration tracking
        if (!ref || !lot || lot === 'N/A' || !exp || exp === 'N/A' || exp === 'NO_EXP') return;

        let key = `${ref}_${lot}_${exp}`;
        if (!lotMap[key]) {
          // Cross-reference with master catalog to get the Manufacturer name
          let dbMatch = (typeof DatabaseManager !== 'undefined' && DatabaseManager.db) 
            ? DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase()) 
            : null;
          let mfr = dbMatch ? (dbMatch.mfr || dbMatch.manufacturer || 'Unknown') : 'Unknown';
          lotMap[key] = { ref, lot, exp, mfr, qty: 0 };
        }

        // FEFO Math: Add inbound receiving, subtract outbound packing
        if (workflow.includes('Receiving') || workflow.includes('Stocktake')) {
          lotMap[key].qty += qty;
        } else if (workflow.includes('Packing') || workflow.includes('Pack & Ship')) {
          lotMap[key].qty -= qty;
        }
      });

      // 3. Filter against the selected timeframe
      let cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() + months);

      // Only show lots that actually have remaining physical stock > 0
      let atRisk = Object.values(lotMap).filter(l => l.qty > 0 && new Date(l.exp) <= cutoffDate);
      atRisk.sort((a,b) => new Date(a.exp) - new Date(b.exp));

      // 4. Build and Print the PDF
      let html = `<!DOCTYPE html><html><head><title>Expiration Warning Report</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; font-size:12px; }
        h2 { color: #e65100; border-bottom: 2px solid #e65100; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { background: #fff3e0; border: 1px solid #ffcc80; padding: 8px; text-align: left; }
        td { border: 1px solid #eee; padding: 8px; }
      </style></head><body>
      <h2>⚠️ Expiration Warning (Next ${months} Months)</h2>
      <table><thead><tr><th>MFR</th><th>REF</th><th>Lot</th><th>Exp Date</th><th style="text-align:center;">Remaining Qty</th></tr></thead><tbody>`;

      if (atRisk.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center; color:#555; padding:15px; font-style:italic;">No active inventory is expiring within this timeframe.</td></tr>`;
      } else {
        atRisk.forEach(item => {
          html += `<tr><td>${item.mfr}</td><td style="font-weight:bold;">${item.ref}</td><td>${item.lot}</td><td style="color:#d32f2f; font-weight:bold;">${item.exp}</td><td style="text-align:center; font-weight:bold; font-size:14px;">${item.qty}</td></tr>`;
        });
      }

      html += `</tbody></table></body></html>`;
      
      let safeDate = new Date().toLocaleDateString().replace(/\//g, '.');
      // Remove the .pdf here
      let filename = `Expiration_Warning_Report_${months}_Months_${safeDate}`;
      let safeTitle = filename.replace(/\./g, '\u2024'); 
      
      let win = window.open('', '_blank');
      if (win) { 
        win.document.write(html); 
        win.document.title = safeTitle; 
        win.focus(); 
        setTimeout(() => win.print(), UIManager.printTimeout); // Increased timeout
      }

    } catch (err) {
      alert("Error generating expiration report: " + err.message);
    } finally {
      if (btn) { btn.textContent = origText; btn.disabled = false; }
    }
  },

  exportInventoryCSV(mode = 'onhand') {
    let db = (typeof DatabaseManager !== 'undefined' && DatabaseManager.db) ? DatabaseManager.db : [];
    if (db.length === 0) {
      alert("No inventory data loaded in memory.");
      return;
    }

    let filtered = db;
    if (mode === 'onhand') {
      filtered = db.filter(item => {
        let total = parseInt(item.onHand || item.TotalQty, 10) || 0;
        let res = parseInt(item.reservedQty, 10) || 0;
        let avail = total - res;
        let priceStr = String(item.price || item.Price || '').replace(/[^0-9.-]+/g, '');
        let numPrice = parseFloat(priceStr) || 0;
        return avail > 0 && numPrice > 0;
      });
    }
    
    let csvContent = "MANUFACTURER,REF/SKU,DESCRIPTION,GTIN,PRICE,COST,TOTAL QTY,RESERVED QTY,AVAILABLE QTY\r\n";
    
    filtered.forEach(item => {
      let mfr = String(item.mfr || 'UNKNOWN').replace(/"/g, '""');
      let ref = String(item.ref || item.sku || '').replace(/"/g, '""');
      // SANITIZE: Replace carriage returns and newlines with spaces so CSV rows remain intact
      let desc = String(item.desc || item.Description || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      let gtin = String(item.gtin || '').replace(/"/g, '""');
      let price = String(item.price || item.Price || '0.00');
      let cost = String(item.cost || item.Cost || '0.00');
      let total = parseInt(item.onHand || item.TotalQty, 10) || 0;
      let res = parseInt(item.reservedQty, 10) || 0;
      let avail = total - res;

      csvContent += `"${mfr}","${ref}","${desc}","${gtin}","${price}","${cost}",${total},${res},${avail}\r\n`;
    });

    // OVERWRITE FROM HERE DOWN
    let dateStr = new Date().toLocaleDateString().replace(/\//g, '.');
    let filename = `ASP_Inventory_${mode}_Export_${dateStr}.csv`;
    
    // Route through the secure Blob API
    UIManager.triggerShareOrDownload(csvContent, filename, 'text/csv');
  },

  generateRevMedPDF(mode) {
    let db = DatabaseManager.db.slice().sort((a,b) => (a.mfr || '').localeCompare(b.mfr) || (a.ref || '').localeCompare(b.ref));
    let filtered = [];
    let title = "";
    let fileSuffix = "";

    if (mode === 'current') {
      title = "Current RevMed Catalog";
      fileSuffix = "Current_RevMed_Catalog";
      filtered = db.filter(i => String(i.onRevMed).toUpperCase() === 'TRUE');
    } else if (mode === 'not_on_revmed') {
      title = "On-Hand Stock Not on RevMed";
      fileSuffix = "Not_On_RevMed";
      filtered = db.filter(i => {
        let isFalse = String(i.onRevMed).toUpperCase() !== 'TRUE';
        let total = parseInt(i.onHand || 0, 10);
        let res = parseInt(i.reservedQty || 0, 10);
        let avail = total - res;
        let priceStr = String(i.price || '').replace(/[^0-9.-]+/g, '');
        let numPrice = parseFloat(priceStr) || 0;
        return isFalse && avail > 0 && numPrice > 0;
      });
    }

    if (filtered.length === 0) { alert("No items match this criteria."); return; }

    let html = `<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; color:#333; font-size:12px; }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0277bd; padding-bottom: 10px; margin-bottom: 15px; }
      h2 { color: #0277bd; margin: 0; font-size: 20px; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #f0f0f0; border: 1px solid #ccc; padding: 8px; text-align: left; }
      td { border: 1px solid #eee; padding: 8px; vertical-align: top; }
    </style></head><body>
    <div class="header">
      <div><h2>${title}</h2><div style="font-weight:bold; color:#555; margin-top:4px;">Allied Surgical Products</div></div>
      <div style="text-align:right;">Generated: ${new Date().toLocaleDateString()}<br>Total Items: ${filtered.length}</div>
    </div>
    <table><thead><tr><th>REF / SKU</th><th>Manufacturer</th><th>Description</th><th style="text-align:center;">Available Qty</th><th style="text-align:right;">RevMed Price</th></tr></thead><tbody>`;

    filtered.forEach(item => {
      let avail = (parseInt(item.onHand || 0, 10)) - (parseInt(item.reservedQty || 0, 10));
      let rmPriceRaw = String(item.revMedPrice || '').replace(/[^0-9.-]+/g, '');
      let rmPriceNum = parseFloat(rmPriceRaw) || 0;
      let priceDisplay = rmPriceNum > 0 ? '$' + rmPriceNum.toFixed(2) : '<span style="color:#c62828; font-weight:bold;">PRICE NEEDED</span>';

      html += `<tr>
        <td style="font-weight:bold; color:#0277bd;">${item.ref || item.sku}</td>
        <td>${item.mfr}</td>
        <td style="font-size:11px; color:#555;">${item.desc}</td>
        <td style="text-align:center; font-weight:bold; font-size:14px; color:#2e7d32;">${avail}</td>
        <td style="text-align:right; font-weight:bold;">${priceDisplay}</td>
      </tr>`;
    });

    html += `</tbody></table></body></html>`;
    
    let dateStr = new Date().toLocaleDateString().replace(/\//g, '.');
    let win = window.open('', '_blank');
    if (win) { 
      win.document.write(html); 
      win.document.title = `ASP_${fileSuffix}_Report_(${dateStr})`.replace(/\./g, '\u2024'); 
      win.focus(); setTimeout(() => win.print(), 1600);
    }
  }
};