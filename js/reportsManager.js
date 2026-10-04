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

  openCategoryModal() {
    let container = document.getElementById('subCategoryChecklist');
    container.innerHTML = '';

    // 1. Extract, split, and clean all categories from local memory
    let categorySet = new Set();
    
    DatabaseManager.db.forEach(item => {
      let catString = item.category || 'Uncategorized';
      
      // Split by comma to handle items with multiple categories
      let parts = catString.split(',');
      parts.forEach(part => {
        let cleanCat = part.trim();
        if (cleanCat !== '') {
          categorySet.add(cleanCat);
        }
      });
    });

    // 2. Convert Set to Array and alphabetize
    let categories = Array.from(categorySet).sort();

    // 3. Check which ones the user already has saved in the input field
    let currentSelections = (document.getElementById('subCategories').value || '')
                            .split(',')
                            .map(s => s.trim());

    // 4. Build the HTML checkboxes dynamically
    categories.forEach(cat => {
      let isChecked = currentSelections.includes(cat) ? 'checked' : '';
      container.innerHTML += `
        <label style="font-size:0.9rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="sub-cat-chk" value="${cat}" ${isChecked}> ${cat}
        </label>
      `;
    });

    // 5. Reveal the modal
    document.getElementById('modalSubCategories').style.display = 'flex';
  },

  confirmCategorySelection() {
    let checkboxes = document.querySelectorAll('.sub-cat-chk:checked');
    let selected = Array.from(checkboxes).map(chk => chk.value);
    
    let input = document.getElementById('subCategories');
    input.value = selected.join(', ');
    
    document.getElementById('modalSubCategories').style.display = 'none';
  },

  openAddressBookEditor() {
    this.renderAddressBookGrid();
    document.getElementById('addressBookModal').style.display = 'flex';
  },

  clearAddressBookForm() {
    ['abContactId', 'abCompany', 'abContactName', 'abEmail', 'abPhone', 'abAccount', 'abAddress1', 'abAddress2', 'abCity', 'abState', 'abZip', 'abNotes'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('abCountry').value = 'US';
    document.getElementById('abMethod').selectedIndex = 0;
  },

  renderAddressBookGrid() {
    let container = document.getElementById('addressBookGrid');
    if (!container) return;

    let rules = DatabaseManager.shippingRules || {};
    let keys = Object.keys(rules).sort();
    
    // ✨ NEW: Inject the calculated count into the HTML span
    let countEl = document.getElementById('abContactCount');
    if (countEl) countEl.innerText = keys.length;

    if (keys.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#777; background:#fff; border-radius:4px; border:1px solid #ccc;">No contacts found in Address Book.</div>';
        return;
    }

    let html = '';
    keys.forEach(k => {
        let data = rules[k];
        // Encode data safely so we can pass it into the edit function
        let safeData = encodeURIComponent(JSON.stringify(data));

        html += `
        <div style="background:#fff; border:1px solid #ccc; border-radius:6px; padding:12px; display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <strong style="color:#8e24aa; font-size:1.1rem;">${data.contactId}</strong>
                <div style="font-size:0.85rem; color:#333; margin-top:4px;"><strong>Company:</strong> ${data.formalCompany || '--'} | <strong>Contact:</strong> ${data.contactName || '--'}</div>
                <div style="font-size:0.8rem; color:#555;">${data.address1} ${data.address2 ? data.address2 : ''}, ${data.city}, ${data.state} ${data.zip} ${data.country}</div>
                <div style="font-size:0.8rem; color:#0277bd; margin-top:4px;">Carrier: <strong>${data.method || 'FEDEX'}</strong> | Acct: <strong>${data.account || '--'}</strong></div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                <button class="btn-small" style="background:#0277bd; color:#fff; border:none; padding:4px 10px; cursor:pointer; border-radius:3px;" onclick="ReportsManager.editAddressBookEntry('${safeData}')">✏️ Edit</button>
                <button class="btn-small" style="background:#d32f2f; color:#fff; border:none; padding:4px 10px; cursor:pointer; border-radius:3px;" onclick="ReportsManager.deleteAddressBookEntry('${data.contactId}')">🗑️ Delete</button>
            </div>
        </div>`;
    });

    container.innerHTML = html;
  },

  editAddressBookEntry(safeData) {
      let data = JSON.parse(decodeURIComponent(safeData));
      
      document.getElementById('abContactId').value = data.contactId || '';
      document.getElementById('abCompany').value = data.formalCompany || '';
      document.getElementById('abContactName').value = data.contactName || '';
      document.getElementById('abEmail').value = data.email || '';
      document.getElementById('abPhone').value = data.phone || '';
      document.getElementById('abAccount').value = data.account || '';
      document.getElementById('abAddress1').value = data.address1 || '';
      document.getElementById('abAddress2').value = data.address2 || '';
      document.getElementById('abCity').value = data.city || '';
      document.getElementById('abZip').value = data.zip || '';
      document.getElementById('abCountry').value = data.country || 'US';
      document.getElementById('abNotes').value = data.notes || '';
      
      // ✨ FIX: Auto-abbreviate the state when editing an old Address Book entry
      let rawState = data.state || '';
      let cleanState = rawState;
      if (rawState.trim().length > 2) {
          const stateMap = {
            "ALABAMA":"AL", "ALASKA":"AK", "ARIZONA":"AZ", "ARKANSAS":"AR", "CALIFORNIA":"CA",
            "COLORADO":"CO", "CONNECTICUT":"CT", "DELAWARE":"DE", "FLORIDA":"FL", "GEORGIA":"GA",
            "HAWAII":"HI", "IDAHO":"ID", "ILLINOIS":"IL", "INDIANA":"IN", "IOWA":"IA",
            "KANSAS":"KS", "KENTUCKY":"KY", "LOUISIANA":"LA", "MAINE":"ME", "MARYLAND":"MD",
            "MASSACHUSETTS":"MA", "MICHIGAN":"MI", "MINNESOTA":"MN", "MISSISSIPPI":"MS", "MISSOURI":"MO",
            "MONTANA":"MT", "NEBRASKA":"NE", "NEVADA":"NV", "NEW HAMPSHIRE":"NH", "NEW JERSEY":"NJ",
            "NEW MEXICO":"NM", "NEW YORK":"NY", "NORTH CAROLINA":"NC", "NORTH DAKOTA":"ND", "OHIO":"OH",
            "OKLAHOMA":"OK", "OREGON":"OR", "PENNSYLVANIA":"PA", "RHODE ISLAND":"RI", "SOUTH CAROLINA":"SC",
            "SOUTH DAKOTA":"SD", "TENNESSEE":"TN", "TEXAS":"TX", "UTAH":"UT", "VERMONT":"VT",
            "VIRGINIA":"VA", "WASHINGTON":"WA", "WEST VIRGINIA":"WV", "WISCONSIN":"WI", "WYOMING":"WY",
            "DISTRICT OF COLUMBIA":"DC", "PUERTO RICO":"PR"
          };
          let upperState = rawState.trim().toUpperCase();
          if (stateMap[upperState]) cleanState = stateMap[upperState];
      }
      document.getElementById('abState').value = cleanState;
      
      let methodSel = document.getElementById('abMethod');
      if (data.method) {
          let opt = Array.from(methodSel.options).find(o => o.value.toUpperCase() === data.method.toUpperCase());
          if (opt) methodSel.value = opt.value;
      }
      
      // Scroll to top of modal to see the form
      document.querySelector('#addressBookModal > div > div:nth-child(2)').scrollTo({ top: 0, behavior: 'smooth' });
  },

  async saveAddressBookEntry() {
      let btn = document.getElementById('btnSaveAbEntry');
      let origText = btn.innerHTML;
      btn.innerHTML = "⏳ Saving..."; btn.disabled = true;

      let contactId = document.getElementById('abContactId').value.trim();
      if (!contactId) {
          alert("Contact ID is required.");
          btn.innerHTML = origText; btn.disabled = false;
          return;
      }

      let payloadData = {
          formalCompany: document.getElementById('abCompany').value.trim(),
          contactName: document.getElementById('abContactName').value.trim(),
          contactId: contactId,
          email: document.getElementById('abEmail').value.trim(),
          phone: document.getElementById('abPhone').value.trim(),
          method: document.getElementById('abMethod').value,
          account: document.getElementById('abAccount').value.trim(),
          address1: document.getElementById('abAddress1').value.trim(),
          address2: document.getElementById('abAddress2').value.trim(),
          city: document.getElementById('abCity').value.trim(),
          state: document.getElementById('abState').value.trim(),
          zip: document.getElementById('abZip').value.trim(),
          country: document.getElementById('abCountry').value.trim() || "US",
          notes: document.getElementById('abNotes').value.trim()
      };

      try {
          let res = await fetch(SessionManager.getActiveArchiveUrl(), {
              method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: "SAVE_SHIPPING_INFO", payload: payloadData })
          });
          let result = await res.json();
          
          if (result.status === "success") {
              // Update local memory so it's instantly available without a full refresh
              DatabaseManager.shippingRules[contactId.toUpperCase()] = payloadData;
              this.clearAddressBookForm();
              this.renderAddressBookGrid();
              alert("Address book updated successfully!");
          } else {
              alert("Database Error: " + result.message);
          }
      } catch(err) {
          alert("Network Error: " + err.message);
      } finally {
          btn.innerHTML = origText; btn.disabled = false;
      }
  },

  async deleteAddressBookEntry(contactId) {
      if (!confirm(`Are you sure you want to permanently delete ${contactId} from the Address Book?`)) return;

      try {
          let res = await fetch(SessionManager.getActiveArchiveUrl(), {
              method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: "DELETE_SHIPPING_INFO", payload: { contactId: contactId } })
          });
          let result = await res.json();
          
          if (result.status === "success") {
              delete DatabaseManager.shippingRules[contactId.toUpperCase()];
              this.renderAddressBookGrid();
          } else {
              alert("Database Error: " + result.message);
          }
      } catch(err) {
          alert("Network Error: " + err.message);
      }
  },

  openInventoryReportOptions(type) {
    if (type !== 'in_stock') {
      this.generateInventoryReport(type); 
      return;
    }
    document.getElementById('inventoryReportOptionsModal').style.display = 'flex';
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
        return avail > 0;
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
        <img src="${ENV_CONFIG.LOGO_URL}" class="logo-img" alt="ASP Logo">
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
      let formattedPrice = cleanNum > 0 ? '$' + cleanNum.toFixed(2) : 'CONTACT US';
      
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
    
    // Fix the Filename and Print Truncation
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
    if (modal) modal.style.display = 'none'; // Changed from modal.remove()
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
      // Fetch live ledger
      let res = await fetch(`${SessionManager.cloudArchiveUrl}?action=GET_AUDIT_LOG&t=${Date.now()}`);
      let text = await res.text();
      let responseData = JSON.parse(text);

      if (responseData.status !== "success" || !responseData.data) {
        throw new Error(responseData.message || "Failed to load audit log from cloud.");
      }

      let auditLog = responseData.data;

      // Filter for the last 7 days
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

      // Calculate KPIs
      let sessionsSet = new Set();
      let inboundSessions = new Set();
      let outboundSessions = new Set();
      let totalItems = 0;
      let uniqueRefs = new Set();
      let sessionsByDate = {};
      let newlyAddedRefs = new Set();
      let totalRevenue = 0;
      
      var testKeywords = ["ASP TEST SUPPLIER", "ASP RECONCILE", "ASP SYSTEM ADMIN", "ASP TESTER", "ASP_INTERNAL"];

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

      // Build the HTML output
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

      // Trigger the hidden iframe print with Magic Dot Title
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

  async generateUnifiedExpirationReport() {
    let btn = document.querySelector('button[onclick="ReportsManager.generateUnifiedExpirationReport()"]');
    let origText = btn ? btn.innerHTML : "⚠️ Run Expiration Report";
    if (btn) { btn.innerHTML = "⏳ Compiling Cloud Ledger..."; btn.disabled = true; }

    try {
      // ✨ FIX: Revert to Cloud Ledger for full traceability but skip Google Apps Script parsing overhead
      let res = await fetch(`${SessionManager.cloudArchiveUrl}?action=GET_AUDIT_LOG&t=${Date.now()}`);
      let text = await res.text();
      let responseData;
      
      try {
        responseData = JSON.parse(text);
      } catch(e) { 
        throw new Error("Connection blocked by Google. Try running again in a few moments."); 
      }

      if (responseData.status !== "success" || !responseData.data) {
        throw new Error(responseData.message || "Failed to load audit log from cloud.");
      }

      let auditLog = responseData.data;
      let lotMap = {};

      // Crunch the ledger math to find active lots
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
          let dbMatch = (typeof DatabaseManager !== 'undefined' && DatabaseManager.db) 
            ? DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase()) 
            : null;
          let mfr = dbMatch ? (dbMatch.mfr || dbMatch.manufacturer || 'Unknown') : 'Unknown';
          let shelf = dbMatch ? (dbMatch.shelf || 'Standard') : 'Unknown';
          lotMap[key] = { ref, lot, exp, mfr, shelf, qty: 0 };
        }

        // FEFO Math: Add inbound receiving, subtract outbound packing
        if (workflow.includes('Receiving') || workflow.includes('Stocktake')) {
          lotMap[key].qty += qty;
        } else if (workflow.includes('Packing') || workflow.includes('Pack & Ship')) {
          lotMap[key].qty -= qty;
        }
      });

      // Filter to only active physical stock
      let activeLots = Object.values(lotMap).filter(l => l.qty > 0);

      // Define Time Brackets
      let today = new Date();
      let sixMonths = new Date(); sixMonths.setMonth(today.getMonth() + 6);
      let twelveMonths = new Date(); twelveMonths.setMonth(today.getMonth() + 12);
      let twentyFourMonths = new Date(); twentyFourMonths.setMonth(today.getMonth() + 24);

      let groups = {
        expired: [],
        six: [],
        twelve: [],
        twentyFour: []
      };

      activeLots.forEach(item => {
        let expDate = new Date(item.exp);
        if (expDate < today) groups.expired.push(item);
        else if (expDate <= sixMonths) groups.six.push(item);
        else if (expDate <= twelveMonths) groups.twelve.push(item);
        else if (expDate <= twentyFourMonths) groups.twentyFour.push(item);
      });

      // Helper function to build table sections
      const buildSection = (title, color, icon, items) => {
        if (items.length === 0) return '';
        items.sort((a, b) => new Date(a.exp) - new Date(b.exp));
        
        let sectionHtml = `
          <h3 style="color:${color}; border-bottom:2px solid ${color}; padding-bottom:6px; margin-top:20px;">${icon} ${title} (${items.length} Lots)</h3>
          <table><thead><tr><th>MFR</th><th>REF</th><th>Lot</th><th>Exp Date</th><th>Location</th><th style="text-align:center;">Remaining Qty</th></tr></thead><tbody>
        `;
        items.forEach(item => {
          sectionHtml += `<tr><td>${item.mfr}</td><td style="font-weight:bold;">${item.ref}</td><td>${item.lot}</td><td style="color:${color}; font-weight:bold;">${item.exp}</td><td style="font-size:11px; color:#555;">${item.shelf}</td><td style="text-align:center; font-weight:bold; font-size:14px;">${item.qty}</td></tr>`;
        });
        sectionHtml += `</tbody></table>`;
        return sectionHtml;
      };

      let html = `<!DOCTYPE html><html><head><title>Unified Expiration Report</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin:30px; font-size:12px; color:#333; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0277bd; padding-bottom: 10px; margin-bottom: 10px; }
        h1 { margin:0; color:#0277bd; font-size:20px; text-transform:uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f5f5f5; border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 11px; text-transform:uppercase;}
        td { border: 1px solid #eee; padding: 8px; }
      </style></head><body>
      
      <div class="header">
        <div>
          <h1>Unified Expiration Report (FEFO)</h1>
          <div style="font-size:12px; font-weight:bold; color:#555; margin-top:4px;">Allied Surgical Products</div>
        </div>
        <div style="text-align:right; font-size:11px; color:#555;">
          <div>Generated: ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
      <p style="font-style:italic; color:#777; margin-bottom:20px;">This report flags all active inventory that has either expired or is at risk of expiring within the next 24 months, calculated directly from the live Cloud Ledger.</p>
      `;

      let hasData = false;
      if (groups.expired.length > 0) { html += buildSection('Already Expired', '#c62828', '❌', groups.expired); hasData = true; }
      if (groups.six.length > 0) { html += buildSection('Expiring within 6 Months', '#e65100', '🚨', groups.six); hasData = true; }
      if (groups.twelve.length > 0) { html += buildSection('Expiring within 12 Months', '#f57f17', '⚠️', groups.twelve); hasData = true; }
      if (groups.twentyFour.length > 0) { html += buildSection('Expiring within 24 Months', '#0277bd', 'ℹ️', groups.twentyFour); hasData = true; }

      if (!hasData) {
        html += `<div style="text-align:center; padding:30px; font-size:14px; color:#555; border:1px dashed #ccc; border-radius:6px; background:#f9f9f9;">No active inventory is set to expire within the next 24 months.</div>`;
      }

      html += `</body></html>`;
      
      let safeDate = new Date().toLocaleDateString().replace(/\//g, '.');
      let filename = `ASP_Unified_Expiration_Report_(${safeDate})`;
      let safeTitle = filename.replace(/\./g, '\u2024'); 
      
      let win = window.open('', '_blank');
      if (win) { 
        win.document.write(html); 
        win.document.title = safeTitle; 
        win.focus(); 
        setTimeout(() => win.print(), UIManager.printTimeout);
      }

    } catch (err) {
      alert("Error generating expiration report: " + err.message);
    } finally {
      if (btn) { btn.innerHTML = origText; btn.disabled = false; }
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
  },

  // ✨ FIX: Switched to a GET request so the browser can read the response!
  async loadSubscribers() {
      const container = document.getElementById('subListContainer');
      container.innerHTML = '<p style="text-align:center; color:#0277bd;">Loading...</p>';
      try {
          // Use GET with URL parameters to bypass CORS restrictions
          let res = await fetch(`${SessionManager.getActiveArchiveUrl()}?action=GET_SUBSCRIBERS`);
          let data = await res.json();
          
          if (data.status === "success" && data.subs && data.subs.length > 0) {
              let html = '<table style="width:100%; border-collapse:collapse; text-align:left;">';
              html += '<tr style="background:#f0f0f0; border-bottom:1px solid #ccc;"><th style="padding:4px;">Name</th><th style="padding:4px;">Email</th><th style="padding:4px;">Freq</th><th style="padding:4px;">Status</th><th style="padding:4px;"></th></tr>';
              
              data.subs.forEach(sub => {
                  html += `<tr style="border-bottom:1px solid #eee;">
                    <td style="padding:4px;">${sub.name}</td>
                    <td style="padding:4px; color:#0277bd;">${sub.email}</td>
                    <td style="padding:4px;">${sub.freq}</td>
                    <td style="padding:4px; color:${sub.status === 'ACTIVE' ? '#2e7d32' : '#c62828'};">${sub.status}</td>
                    <td style="padding:4px; text-align:right;">
                       <button class="btn-small" style="padding:2px 6px; font-size:0.7rem;" onclick="document.getElementById('subName').value='${sub.name}'; document.getElementById('subEmail').value='${sub.email}'; document.getElementById('subFreq').value='${sub.freq === 'Daily' ? 'Daily' : 'Weekly'}'; document.getElementById('subStatus').value='${sub.status === 'ACTIVE' ? 'Active' : 'Inactive'}'; document.getElementById('subCategories').value='${sub.categories || ''}';">Edit</button>
                    </td>
                  </tr>`;
              });
              html += '</table>';
              container.innerHTML = html;
          } else {
              container.innerHTML = '<p style="text-align:center; color:#777; margin:0;">No active subscribers found.</p>';
          }
      } catch (err) {
          container.innerHTML = '<p style="text-align:center; color:#c62828;">Failed to load subscribers.</p>';
      }
  },

  saveSubscriber(event) {
      // Grab the button and save its original text
      let btn = event ? event.target : document.activeElement;
      let origText = btn.textContent;
      btn.textContent = "⏳ Saving..."; btn.disabled = true;

      let name = document.getElementById('subName').value.trim();
      let email = document.getElementById('subEmail').value.trim();
      let freq = document.getElementById('subFreq').value;
      let status = document.getElementById('subStatus').value;

      if (!name || !email) {
          UIManager.showCustomAlert("Error", "Please provide a name and email address.");
          btn.textContent = origText; btn.disabled = false; // Reset button
          return;
      }

      let categoryPref = document.getElementById('subCategories').value.trim();
       
      let payload = { name: name, email: email, freq: freq, status: status, categories: categoryPref };

      fetch(SessionManager.getActiveArchiveUrl(), {
          method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: "UPDATE_SUBSCRIBER", payload: payload })
      }).then(() => {
          UIManager.showCustomAlert("Success", `${name} has been updated in the cloud!`);
          document.getElementById('subName').value = "";
          document.getElementById('subEmail').value = "";
      }).catch(err => {
          UIManager.showCustomAlert("Error", "Failed to save subscriber.");
      }).finally(() => {
          // This always runs at the very end to restore the button!
          btn.textContent = origText; 
          btn.disabled = false;
      });
  },

  filterFlyerItems() {
    let input = document.getElementById('flyerSearchBox');
    if (!input) return;
    
    let filter = input.value.toUpperCase().trim();
    let container = document.getElementById('reportItemRowsContainer');
    if (!container) return;
    
    let rows = container.getElementsByClassName('flyer-item-row');
    let showSelectedOnly = document.getElementById('chkShowSelectedFlyer') && document.getElementById('chkShowSelectedFlyer').checked;
    let visibleCount = 0;

    for (let i = 0; i < rows.length; i++) {
        let refInput = rows[i].querySelector('.rep-ref');
        let descInput = rows[i].querySelector('.rep-desc');
        let chk = rows[i].querySelector('.flyer-chk');
        
        let refText = refInput ? refInput.value.toUpperCase() : "";
        let descText = descInput ? descInput.value.toUpperCase() : "";
        
        let matchesSearch = refText.includes(filter) || descText.includes(filter);
        let matchesSelected = !showSelectedOnly || (chk && chk.checked);
        
        if (matchesSearch && matchesSelected) {
            rows[i].style.display = "flex"; 
            visibleCount++;
        } else {
            rows[i].style.display = "none";
        }
    }

    container.style.minHeight = visibleCount === 0 ? "50px" : "auto";
  },

  addBlankRowToReportEditor() {
    let container = document.getElementById('reportItemRowsContainer');
    let uniqueId = 'custom_row_' + Date.now();
    
    // ✨ FIX: Switched class names to flyer-item-row, rep-ref, rep-desc, rep-qty, and rep-price so the exporter sees them!
    let html = `
      <div id="${uniqueId}" class="flyer-item-row custom-flyer-row" style="display:flex; gap:10px; align-items:center; margin-bottom:8px; padding:8px; background:#e1f5fe; border:1px dashed #0277bd; border-radius:4px;">
        <input type="checkbox" class="flyer-chk" checked style="width:18px; height:18px; cursor:pointer;">
        <input type="text" class="rep-ref" placeholder="REF / SKU" style="flex:1; padding:4px; border:1px solid #ccc; border-radius:3px; font-weight:bold; font-size:0.85rem;">
        <input type="text" class="rep-desc" placeholder="Description" style="flex:2; padding:4px; border:1px solid #ccc; border-radius:3px; font-size:0.85rem;">
        <input type="number" class="rep-qty" placeholder="Qty" style="width:60px; padding:4px; border:1px solid #ccc; border-radius:3px; font-size:0.85rem;">
        <input type="text" class="rep-price" placeholder="Price" style="width:70px; padding:4px; border:1px solid #ccc; border-radius:3px; font-size:0.85rem;">
        <button onclick="document.getElementById('${uniqueId}').remove()" style="background:#c62828; color:#fff; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;" title="Remove Row">X</button>
      </div>
    `;
    
    container.insertAdjacentHTML('afterbegin', html); 
  }
};

async function runEthiconUiScan(mode) {
    let resultsBox = document.getElementById('ethiconUiResults');
    let searchInput = document.getElementById('ethiconSearchInput').value.trim().toUpperCase();
    
    if (mode === 'SEARCH' && !searchInput) {
        alert("Please enter a REF to search.");
        return;
    }
    
    let queryParam = mode === 'SEARCH' ? `&ref=${encodeURIComponent(searchInput)}` : '';
    resultsBox.innerHTML = `<div style="text-align:center; padding:20px; color:#0277bd;"><strong>⏳ Querying J&J MedTech Servers...</strong><br>This may take a moment depending on the number of items.</div>`;
    
    try {
        let res = await fetch(`${SessionManager.getActiveArchiveUrl()}?action=RUN_ETHICON_UI_SCAN${queryParam}`);
        let data = await res.json();
        
        if (data.status !== "success") throw new Error(data.message || "API Error");
        
        if (data.data.length === 0) {
            let msg = mode === 'SEARCH' ? `REF ${searchInput} is either Active or not found in the J&J catalog.` : "Great news! None of your on-hand Ethicon items are flagged as discontinued.";
            resultsBox.innerHTML = `<div style="text-align:center; padding:15px; color:#2e7d32; font-weight:bold;">✅ ${msg}</div>`;
            return;
        }
        
        let tableHtml = `<table style="width:100%; border-collapse:collapse; text-align:left;">
            <tr style="background:#ffebee; border-bottom:2px solid #d32f2f;">
                <th style="padding:6px; color:#d32f2f;">Discontinued REF</th>
                <th style="padding:6px; color:#d32f2f;">Ethicon Replacement</th>
            </tr>`;
            
        data.data.forEach(hit => {
            let alts = hit.replacements.length > 0 ? hit.replacements.join(", ") : "<i style='color:#c62828;'>No Replacement</i>";
            
            // ✨ FIX: Clean the date string for Live Search
            let cleanDate = hit.date || '';
            if (cleanDate && cleanDate !== "Unknown Date") {
                let d = new Date(cleanDate);
                if (!isNaN(d.getTime())) cleanDate = d.toISOString().split('T')[0];
            }
            
            tableHtml += `<tr style="border-bottom:1px solid #ccc;">
                <td style="padding:6px; font-weight:bold; color:#d32f2f;">${hit.ref}</td>
                <td style="padding:6px; font-weight:bold; color:#2e7d32;">${alts}</td>
                <td style="padding:6px; font-size:0.8rem; color:#555;">${cleanDate}</td>
            </tr>`;
        });
        tableHtml += `</table>`;
        
        resultsBox.innerHTML = tableHtml;
        
    } catch(err) {
        resultsBox.innerHTML = `<div style="text-align:center; padding:15px; color:#c62828;">Error connecting to J&J servers: ${err.message}</div>`;
    }
}

function openEthiconMonitorModal() {
    let modal = document.getElementById('ethiconMonitorModal');
    let subList = document.getElementById('ethiconSubList');
    let resultsBox = document.getElementById('ethiconUiResults');
    
    let userProfile = JSON.parse(localStorage.getItem('asp_user_profile')) || {};
    let emailInput = document.getElementById('ethiconMonitorEmail');
    if (emailInput && !emailInput.value && userProfile.email) {
        emailInput.value = userProfile.email;
    }

    subList.innerHTML = "<i>Loading subscribers...</i>";
    resultsBox.innerHTML = `<div style="text-align:center; padding:20px; color:#0277bd;">⏳ Loading archive from database...</div>`;
    modal.style.display = "flex";
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // 1. Fetch active subscribers
    fetch(`${SessionManager.getActiveArchiveUrl()}?action=GET_SUBSCRIBERS`)
      .then(r => r.json())
      .then(data => {
          if (data.status === "success") {
              let ethiconSubs = data.subs.filter(s => s.ethicon === "TRUE");
              if (ethiconSubs.length === 0) {
                  subList.innerHTML = "<i>No active subscribers.</i>";
              } else {
                  subList.innerHTML = ethiconSubs.map(s => `<div>• ${s.email}</div>`).join('');
              }
          }
      }).catch(e => subList.innerHTML = "<i>Error loading list.</i>");

    // 2. Fetch the Cached Discontinued Archive
    fetch(`${SessionManager.getActiveArchiveUrl()}?action=GET_ETHICON_ARCHIVE`)
      .then(r => r.json())
      .then(data => {
          if (data.status !== "success" || data.data.length === 0) {
              resultsBox.innerHTML = `<div style="text-align:center; padding:15px; color:#2e7d32; font-weight:bold;">✅ No discontinued items currently logged in the archive.</div>`;
              return;
          }
          
          let tableHtml = `<table style="width:100%; border-collapse:collapse; text-align:left;">
              <tr style="background:#ffebee; border-bottom:2px solid #d32f2f;">
                  <th style="padding:6px; color:#d32f2f;">Discontinued REF</th>
                  <th style="padding:6px; color:#d32f2f;">Ethicon Replacement</th>
                  <th style="padding:6px; color:#d32f2f;">Date Flagged</th>
              </tr>`;
              
          data.data.forEach(hit => {
              // ✨ FIX: Clean the date string for the UI Modal
              let cleanDate = hit.date || '';
              if (cleanDate && cleanDate !== "Unknown Date") {
                  let d = new Date(cleanDate);
                  if (!isNaN(d.getTime())) cleanDate = d.toISOString().split('T')[0];
              }
              
              tableHtml += `<tr style="border-bottom:1px solid #ccc;">
                  <td style="padding:6px; font-weight:bold; color:#d32f2f;">${hit.ref}</td>
                  <td style="padding:6px; font-weight:bold; color:#2e7d32;">${hit.alts}</td>
                  <td style="padding:6px; font-size:0.8rem; color:#555;">${cleanDate}</td>
              </tr>`;
          });
          tableHtml += `</table>`;
          
          resultsBox.innerHTML = tableHtml;
      }).catch(e => resultsBox.innerHTML = `<div style="text-align:center; padding:15px; color:#c62828;">Error loading archive data.</div>`);
}

async function subscribeToEthiconMonitor() {
    let email = document.getElementById('ethiconMonitorEmail').value.trim();
    if (!email || !email.includes('@')) {
        alert("Please enter a valid email address.");
        return;
    }
    
    let btn = document.getElementById('btnSubscribeEthicon');
    let orig = btn.innerText;
    btn.innerText = "⏳ Saving..."; btn.disabled = true;

    let userProfile = JSON.parse(localStorage.getItem('asp_user_profile')) || {};
    let name = userProfile.name || email.split('@')[0];

    try {
        let res = await fetch(SessionManager.getActiveArchiveUrl(), {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: "UPDATE_SUBSCRIBER",
                payload: { name: name, email: email, freq: "Monthly", status: "ACTIVE", categories: "ETHICON_MONITOR" }
            })
        });
        
        let data = await res.json();
        if (data.status === "success") {
            alert("Successfully subscribed to the Ethicon Monitor!");
            openEthiconMonitorModal(); // Refresh the list
        } else {
            alert("Error: " + data.message);
        }
    } catch(err) {
        alert("Network Error: " + err.message);
    } finally {
        btn.innerText = orig; btn.disabled = false;
    }
}