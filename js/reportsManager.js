/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/reportsManager.js
 * Author: Thomas Paul Seyfors
 * Version: 2.8.2
 * ======================================================================= */
const ReportsManager = {

  generateInventoryReport(type) {
    let db = DatabaseManager.db.slice().sort((a,b) => (a.mfr || '').localeCompare(b.mfr) || (a.ref || '').localeCompare(b.ref));
    let filtered = [];
    let title = "";

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
      <thead><tr><th>Manufacturer</th><th>REF / SKU</th><th>Description</th><th>On-Hand</th><th>Price</th></tr></thead>
      <tbody>`;

    filtered.forEach(item => {
      html += `<tr>
        <td>${item.mfr || 'UNKNOWN'}</td>
        <td style="font-weight:bold;">${item.ref || item.sku}</td>
        <td style="font-size:11px; color:#555;">${item.desc || '--'}</td>
        <td style="text-align:center; font-weight:bold;">${item.onHand || 0}</td>
        <td>${item.price || '$0.00'}</td>
      </tr>`;
    });

    html += `</tbody></table></body></html>`;
    let win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.title = title; win.focus(); setTimeout(() => win.print(), 500); }
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

  async processEndOfWeekReport(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let sessionsCount = files.length;
    let inboundCount = 0; let outboundCount = 0;
    let totalItems = 0; let uniqueRefs = new Set();
    let newItems = new Set(); let updatedItems = new Set();

    let filePromises = Array.from(files).map(file => {
      return new Promise((resolve) => {
        let reader = new FileReader();
        reader.onload = (e) => {
          let text = e.target.result;
          if (text.includes('Receiving & Reserving') || text.includes('Receiving')) inboundCount++;
          if (text.includes('Picking & Packing') || text.includes('Packing & Shipping')) outboundCount++;
          
          let parsed = AuditManager.parseTXTExportContent(text, file.name);
          if (parsed) {
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

    let reportLines = [
      `================================================================================`,
      `ASP - END OF WEEK ROLLUP REPORT`,
      `Generated: ${new Date().toLocaleDateString()}`,
      `================================================================================`,
      `Total Sessions Logged:       ${sessionsCount}`,
      `Incoming Shipments:          ${inboundCount}`,
      `Outgoing Orders:             ${outboundCount}`,
      `Total Items Handled:         ${totalItems}`,
      `Unique REFs Touched:         ${uniqueRefs.size}`,
      `--------------------------------------------------------------------------------`,
      `NEW REFs DISCOVERED (${newItems.size}):`,
      ...Array.from(newItems).map(r => `  - ${r}`),
      `--------------------------------------------------------------------------------`,
      `EXISTING REFs UPDATED (${updatedItems.size}):`,
      ...Array.from(updatedItems).map(r => `  - ${r}`),
      `================================================================================`
    ];

    UIManager.triggerShareOrDownload(reportLines.join('\n'), `ASP_End_of_Week_${Date.now()}.txt`, 'text/plain');
  }
};