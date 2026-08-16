/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/reportsManager.js
 * Author: Thomas Paul Seyfors
 * Version: 3.0.1
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
      <div style="background:#fff; border-radius:8px; width:100%; max-width:400px; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #2e7d32; padding-bottom:8px; margin-bottom:15px;">
          <h3 style="margin:0; color:#2e7d32;">📦 Full On-Hand Stock Options</h3>
          <button onclick="document.getElementById('inventoryReportOptionsModal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
        </div>
        <div style="margin-bottom:15px; font-size:0.85rem;">Select the columns to include in your inventory report:</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px; background:#f1f8e9; border:1px solid #c8e6c9; padding:12px; border-radius:4px;">
          <label style="cursor:pointer; font-weight:bold;"><input type="checkbox" id="chkInvMfr" checked> Manufacturer</label>
          <label style="cursor:pointer; font-weight:bold;"><input type="checkbox" id="chkInvDesc" checked> Description</label>
          <label style="cursor:pointer; font-weight:bold;"><input type="checkbox" id="chkInvPrice" checked> Selling Price</label>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button onclick="document.getElementById('inventoryReportOptionsModal').remove()" style="background:#777; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">Cancel</button>
          <button onclick="ReportsManager.generateInventoryReport('in_stock')" style="background:#2e7d32; color:#fff; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">🖨️ Generate Report</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  generateInventoryReport(type) {
    let db = DatabaseManager.db.slice().sort((a,b) => (a.mfr || '').localeCompare(b.mfr) || (a.ref || '').localeCompare(b.ref));
    let filtered = [];
    let title = "";

    // Grab toggles if they exist, otherwise default to true
    let incMfr = document.getElementById('chkInvMfr') ? document.getElementById('chkInvMfr').checked : true;
    let incDesc = document.getElementById('chkInvDesc') ? document.getElementById('chkInvDesc').checked : true;
    let incPrice = document.getElementById('chkInvPrice') ? document.getElementById('chkInvPrice').checked : true;

    if (type === 'in_stock') {
      filtered = db.filter(i => i.onHand && i.onHand > 0);
      title = "Full On-Hand Stock Report";
    } else if (type === 'out_of_stock') {
      filtered = db.filter(i => !i.onHand || i.onHand === 0);
      title = "Out of Stock Items Report";
    } else if (type === 'pricing') {
      filtered = db.filter(i => !i.price || i.price === "$0.00" || i.price === "0");
      title = "Items Requiring Pricing or Cost";
    }

    let html = `<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; color:#333; font-size:12px; }
      h2 { color: #0277bd; border-bottom: 2px solid #0277bd; padding-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th { background: #f0f0f0; border: 1px solid #ccc; padding: 8px; text-align: left; }
      td { border: 1px solid #eee; padding: 8px; vertical-align: top; }
    </style></head><body>
    <h2>${title}</h2>
    <p>Generated: ${new Date().toLocaleDateString()}</p>
    <table>
      <thead>
        <tr>
          ${incMfr ? '<th>Manufacturer</th>' : ''}
          <th>REF / SKU</th>
          ${incDesc ? '<th>Description</th>' : ''}
          <th>On-Hand</th>
          ${incPrice ? '<th>Price</th>' : ''}
        </tr>
      </thead>
      <tbody>`;

    filtered.forEach(item => {
      let formattedPrice = item.price ? (item.price.startsWith('$') || isNaN(parseFloat(item.price.replace(/[^0-9.-]+/g,""))) ? item.price : '$' + item.price) : '$0.00';
      html += `<tr>
        ${incMfr ? `<td>${item.mfr || 'UNKNOWN'}</td>` : ''}
        <td style="font-weight:bold; color:#0277bd;">${item.ref || item.sku}</td>
        ${incDesc ? `<td style="font-size:11px; color:#555;">${item.desc || '--'}</td>` : ''}
        <td style="text-align:center; font-weight:bold; font-size:14px;">${item.onHand || 0}</td>
        ${incPrice ? `<td>${formattedPrice}</td>` : ''}
      </tr>`;
    });

    html += `</tbody></table></body></html>`;
    let win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.title = title; win.focus(); setTimeout(() => win.print(), 500); }
    
    let modal = document.getElementById('inventoryReportOptionsModal');
    if (modal) modal.remove();
  },

  generateExpirationReport() {
    let months = parseInt(document.getElementById('expirationFilter').value, 10);
    let archive = JSON.parse(localStorage.getItem('asp_session_archive')) || [];
    let lotMap = {};

    // Crawl all sessions to find active lots
    archive.forEach(sess => {
      if (sess.status === 'Completed' && sess.scannedObjects) {
        sess.scannedObjects.forEach(s => {
          let key = `${s.ref}_${s.lot}_${s.exp}`;
          if (!lotMap[key]) lotMap[key] = { ref: s.ref, lot: s.lot, exp: s.exp, mfr: s.mfr, qty: 0 };
          if (sess.workflowType.includes('Stocktake') || sess.workflowType.includes('Receiving')) lotMap[key].qty += s.qty;
          else if (sess.workflowType.includes('Packing')) lotMap[key].qty -= s.qty;
        });
      }
    });

    let cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() + months);

    let atRisk = Object.values(lotMap).filter(l => l.qty > 0 && new Date(l.exp) <= cutoffDate);
    atRisk.sort((a,b) => new Date(a.exp) - new Date(b.exp));

    let html = `<!DOCTYPE html><html><head><title>Expiration Warning Report</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; font-size:12px; }
      h2 { color: #e65100; border-bottom: 2px solid #e65100; padding-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th { background: #fff3e0; border: 1px solid #ffcc80; padding: 8px; text-align: left; }
      td { border: 1px solid #eee; padding: 8px; }
    </style></head><body>
    <h2>⚠️ Expiration Warning (Next ${months} Months)</h2>
    <table><thead><tr><th>MFR</th><th>REF</th><th>Lot</th><th>Exp Date</th><th>Remaining Qty</th></tr></thead><tbody>`;

    atRisk.forEach(item => {
      html += `<tr><td>${item.mfr}</td><td style="font-weight:bold;">${item.ref}</td><td>${item.lot}</td><td style="color:#d32f2f; font-weight:bold;">${item.exp}</td><td style="text-align:center; font-weight:bold;">${item.qty}</td></tr>`;
    });

    html += `</tbody></table></body></html>`;
    let win = window.open('', '_blank');
    if (win) { win.document.write(html); win.focus(); setTimeout(() => win.print(), 500); }
  },

  generateVarianceReportPDF(varianceData, mode, netFinancialImpact) {
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
    if (win) { win.document.write(html); win.document.title = filename; win.focus(); setTimeout(() => win.print(), 800); }
  },

  async processEndOfWeekReport(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let sessionsCount = files.length;
    let inboundCount = 0; let outboundCount = 0;
    let totalItems = 0; let uniqueRefs = new Set();
    let newItems = new Set(); let updatedItems = new Set();
    let datesArray = []; 
    let sessionsByDate = {}; // NEW: Object to group files by date

    let filePromises = Array.from(files).map(file => {
      return new Promise((resolve) => {
        let reader = new FileReader();
        reader.onload = (e) => {
          let text = e.target.result;
          if (text.includes('Receiving & Reserving') || text.includes('Receiving')) inboundCount++;
          if (text.includes('Picking & Packing') || text.includes('Packing & Shipping')) outboundCount++;
          
          let parsed = AuditManager.parseTXTExportContent(text, file.name);
          if (parsed) {
            let sDate = (parsed.date && parsed.date !== "Unknown") ? parsed.date : "Unknown Date";
            if (sDate !== "Unknown Date") datesArray.push(sDate);
            
            // Group by date
            if (!sessionsByDate[sDate]) sessionsByDate[sDate] = [];
            sessionsByDate[sDate].push(parsed.fileName);
            
            parsed.items.forEach(i => { totalItems += i.qty; uniqueRefs.add(i.ref); });
            (parsed.newItems || []).forEach(n => newItems.add(n.ref));
            (parsed.updatedItems || []).forEach(u => updatedItems.add(u.ref));
          }
          resolve();
        };
        reader.readAsText(file);
      });
    });

    await Promise.all(filePromises);
    event.target.value = '';

    // Calculate Date Range for Filename
    datesArray.sort();
    let startDate = datesArray.length > 0 ? datesArray[0] : new Date().toLocaleDateString().replace(/\//g, '.');
    let endDate = datesArray.length > 0 ? datesArray[datesArray.length - 1] : new Date().toLocaleDateString().replace(/\//g, '.');
    let dateRangeStr = startDate === endDate ? startDate : `${startDate}-${endDate}`;
    let baseFilename = `ASP_End_of_Week_Report_(${dateRangeStr})`;

    let generatedDate = new Date().toLocaleDateString();

    // Build the grouped session list HTML
    let auditedSessionsHtml = '';
    let sortedDates = Object.keys(sessionsByDate).sort();
    sortedDates.forEach(d => {
      auditedSessionsHtml += `<h4 style="margin: 10px 0 4px 0; color: #333; font-size: 13px; border-bottom: 1px solid #eee; padding-bottom: 2px;">📅 ${d}</h4><ul class="session-list">`;
      sessionsByDate[d].sort().forEach(f => {
        auditedSessionsHtml += `<li>${f}</li>`;
      });
      auditedSessionsHtml += `</ul>`;
    });
    if (!auditedSessionsHtml) auditedSessionsHtml = '<p>No session files recorded.</p>';
    
    let html = `<!DOCTYPE html><html><head><title>ASP End of Week Report</title>
    <style>
      body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; color:#333; font-size:12px; }
      .header { border-bottom:3px solid #0277bd; padding-bottom:10px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; }
      h1 { margin:0; color:#0277bd; font-size:20px; text-transform:uppercase; }
      h3 { color: #0277bd; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px;}
      .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
      .kpi-box { background: #f0f8ff; border: 1px solid #bfe0fb; padding: 15px; border-radius: 6px; text-align: center; }
      .kpi-val { font-size: 20px; font-weight: bold; color: #0277bd; display: block; margin-top: 5px; }
      ul { column-count: 2; margin: 0; padding-left: 20px; }
      li { margin-bottom: 4px; font-family: monospace; font-size: 11px; }
      .session-list { column-count: 1; list-style-type: square; }
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
      <div class="kpi-box">Sessions Logged<span class="kpi-val">${sessionsCount}</span></div>
      <div class="kpi-box">Incoming Shipments<span class="kpi-val">${inboundCount}</span></div>
      <div class="kpi-box">Outgoing Orders<span class="kpi-val">${outboundCount}</span></div>
      <div class="kpi-box">Total Items Handled<span class="kpi-val">${totalItems}</span></div>
      <div class="kpi-box">Unique REFs Touched<span class="kpi-val">${uniqueRefs.size}</span></div>
    </div>

    <h3>🆕 NEW REFs DISCOVERED (${newItems.size})</h3>
    ${newItems.size > 0 ? `<ul>${Array.from(newItems).map(r => `<li>${r}</li>`).join('')}</ul>` : '<p>No new REFs discovered this week.</p>'}

    <h3>🔄 EXISTING REFs UPDATED (${updatedItems.size})</h3>
    ${updatedItems.size > 0 ? `<ul>${Array.from(updatedItems).map(r => `<li>${r}</li>`).join('')}</ul>` : '<p>No existing REFs updated this week.</p>'}

    <h3>📄 AUDITED SESSIONS (${sessionsCount})</h3>
    ${auditedSessionsHtml}

    </body></html>`;

    // Hidden Iframe PDF Print Trigger
    let iframe = document.getElementById('pdfPrintFrame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'pdfPrintFrame';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
    }
    let doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.title = baseFilename;
    doc.close();
    
    // Temporarily lock window title so browser print dialog uses baseFilename
    let originalTitle = document.title;
    document.title = baseFilename;

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { document.title = originalTitle; }, 2000);
    }, 500);
  }
};