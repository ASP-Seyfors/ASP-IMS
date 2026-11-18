const ReportsManager = {

  // EXTERNAL STOREFRONT & MARKETPLACE EXPORT TRIGGERS
  async triggerVetcoveVariance() {
      await this._fetchAndDownloadCsv('EXPORT_VETCOVE_VARIANCE', 'Vetcove_Variance_Export.csv');
  },
  async triggerVetcoveFull() {
      await this._fetchAndDownloadCsv('EXPORT_VETCOVE_FULL', 'Vetcove_Full_Export.csv');
  },
  async triggerDotMedVariance() {
      await this._fetchAndDownloadCsv('EXPORT_DOTMED_VARIANCE', 'DotMed_Variance_Export.csv');
  },
  async triggerDotMedFull() {
      await this._fetchAndDownloadCsv('EXPORT_DOTMED_FULL', 'DotMed_Full_Export.csv');
  },
  async triggerRevMedExport() {
      await this._fetchAndDownloadCsv('EXPORT_REVMED', 'RevMed_Catalog_Export.csv');
  },

  async triggerOnHandCsv() {
    await this._fetchAndDownloadCsv('EXPORT_ON_HAND_CSV', 'ASP_OnHand_Stock_Export.csv');
  },

  async _fetchAndDownloadCsv(actionName, defaultFilename) {
      try {
          let baseUrl = ApiManager.getActiveArchiveUrl();
          let joiner = baseUrl.includes('?') ? '&' : '?';
          let targetUrl = `${baseUrl}${joiner}action=${actionName}&t=${Date.now()}`;
          
          let response = await fetch(targetUrl);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          
          let csvText = await response.text();
          if (csvText.trim().startsWith('<')) {
              throw new Error("Server returned an HTML page instead of CSV data. Check authentication or Apps Script deployment parameters.");
          }

          let dateStr = new Date().toLocaleDateString().replace(/\//g, '.');
          let filename = defaultFilename.replace('.csv', `_${dateStr}.csv`);
          
          UIManager.triggerShareOrDownload(csvText, filename, 'text/csv');
      } catch (err) {
          alert("CSV Export Failed: " + err.message);
      }
  },

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

  // Centralized Report Math Engine
  getTrueAvailability(item) {
      if (!item) return 0;
      let isBundle = item.parentRef && parseInt(item.uomMult, 10) > 1;
      
      if (isBundle) {
          let pSku = DatabaseManager.getCleanParentRef(item).toUpperCase();
          let pItem = DatabaseManager.db.find(i => DatabaseManager.getItemSku(i) === pSku);
          if (pItem) {
              let pAvail = (parseInt(pItem.onHand, 10) || 0) - (parseInt(pItem.reservedQty, 10) || 0);
              return Math.floor(pAvail / parseInt(item.uomMult, 10));
          }
          return 0;
      } else {
          let avail = (parseInt(item.onHand, 10) || 0) - (parseInt(item.reservedQty, 10) || 0);
          let children = DatabaseManager.db.filter(c => DatabaseManager.getCleanParentRef(c).toUpperCase() === DatabaseManager.getItemSku(item) && parseInt(c.uomMult, 10) > 1);
          if (children.length > 0) {
              let hasBoxOnly = children.some(c => DatabaseManager.isBoxOnly(c));
              if (hasBoxOnly) return 0; // Completely hide the 'Each' remainder if flagged as Box Only!
              let largestBundle = children.reduce((max, c) => Math.max(max, parseInt(c.uomMult, 10)), 1);
              if (largestBundle > 1) avail = avail % largestBundle;
          }
          return avail;
      }
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
          let res = await fetch(ApiManager.getActiveArchiveUrl(), {
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
          let res = await fetch(ApiManager.getActiveArchiveUrl(), {
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

  // ADMIN INTERNAL INVENTORY COST & VALUATION ENGINE
  _calculateInventoryValuation() {
    if (typeof AuthManager === 'undefined' || !AuthManager.currentUser || !AuthManager.currentUser.isAdmin) {
      throw new Error("Access Denied: Administrator privileges required.");
    }

    let db = (typeof DatabaseManager !== 'undefined' && Array.isArray(DatabaseManager.db)) ? DatabaseManager.db : [];
    const parseMoney = (val) => parseFloat(String(val || '').replace(/[^0-9.-]+/g, '')) || 0;

    // Map child bundles by clean Parent REF so we can resolve per-each cost if needed
    let bundleCostMap = {};
    db.forEach(item => {
      let uom = parseInt(item.uomMult, 10) || 1;
      if (item.parentRef && uom > 1) {
        let cleanParent = DatabaseManager.getCleanParentRef(item).toUpperCase();
        let bCost = parseMoney(item.cost);
        let bPrice = parseMoney(item.price);
        if (cleanParent && (bCost > 0 || bPrice > 0)) {
          bundleCostMap[cleanParent] = { cost: bCost, price: bPrice, uom: uom, bundleRef: item.ref || item.sku };
        }
      }
    });

    let rows = [];
    let summary = {
      totalSkusInStock: 0,
      skusWithCost: 0,
      skusMissingCost: 0,
      unitsMissingCost: 0,
      totalPhysicalUnits: 0,
      totalAvailUnits: 0,
      totalResUnits: 0,
      totalPhysicalCost: 0,
      totalAvailCost: 0,
      totalResCost: 0,
      totalPhysicalRetail: 0,
      totalAvailRetail: 0,
      totalResRetail: 0
    };

    // Iterate strictly over physical base items (exclude virtual bundle rows so stock is never double-counted)
    db.forEach(item => {
      let uom = parseInt(item.uomMult, 10) || 1;
      if (item.parentRef && uom > 1) return;

      let ref = String(item.ref || item.sku || '').toUpperCase().trim();
      if (!ref) return;

      let totalQty = Math.max(0, parseInt(item.onHand, 10) || 0);
      let resQty = Math.max(0, parseInt(item.reservedQty, 10) || 0);
      let availQty = Math.max(0, totalQty - resQty);

      if (totalQty <= 0 && resQty <= 0) return;

      let unitCost = parseMoney(item.cost);
      let unitPrice = parseMoney(item.price);
      let costNote = "";

      // Smart Bundle Cost Resolution:
      // 1) If Each cost is $0 but its Bundle has a cost (e.g., 309647), derive per-each cost = bundleCost / uom
      // 2) If Each cost equals the full Box cost (e.g., GST60B / PHSE), divide by uom to get true per-each cost
      if (bundleCostMap[ref]) {
        let bInfo = bundleCostMap[ref];
        if (unitCost === 0 && bInfo.cost > 0) {
          unitCost = bInfo.cost / bInfo.uom;
          costNote = `Derived from ${bInfo.bundleRef} ($${bInfo.cost.toFixed(2)} / ${bInfo.uom})`;
        } else if (unitCost > 0 && Math.abs(unitCost - bInfo.cost) < 0.01 && bInfo.uom > 1) {
          unitCost = bInfo.cost / bInfo.uom;
          costNote = `Box Cost ($${bInfo.cost.toFixed(2)} / ${bInfo.uom})`;
        }
        if (unitPrice > 0 && Math.abs(unitPrice - bInfo.price) < 0.01 && bInfo.uom > 1) {
          unitPrice = bInfo.price / bInfo.uom;
        }
      }

      let hasCost = unitCost > 0;
      let availCost = availQty * unitCost;
      let resCost = resQty * unitCost;
      let totalCost = totalQty * unitCost;

      let availRetail = availQty * unitPrice;
      let resRetail = resQty * unitPrice;
      let totalRetail = totalQty * unitPrice;

      summary.totalSkusInStock++;
      if (hasCost) {
        summary.skusWithCost++;
      } else {
        summary.skusMissingCost++;
        summary.unitsMissingCost += totalQty;
      }

      summary.totalPhysicalUnits += totalQty;
      summary.totalAvailUnits += availQty;
      summary.totalResUnits += resQty;

      summary.totalPhysicalCost += totalCost;
      summary.totalAvailCost += availCost;
      summary.totalResCost += resCost;

      summary.totalPhysicalRetail += totalRetail;
      summary.totalAvailRetail += availRetail;
      summary.totalResRetail += resRetail;

      rows.push({
        mfr: item.mfr || 'UNKNOWN',
        ref: ref,
        displayAlias: item.displayAlias || '',
        desc: item.desc || '',
        shelf: item.shelf || '',
        availQty: availQty,
        resQty: resQty,
        totalQty: totalQty,
        unitCost: unitCost,
        hasCost: hasCost,
        costNote: costNote,
        availCost: availCost,
        resCost: resCost,
        totalCost: totalCost,
        unitPrice: unitPrice,
        availRetail: availRetail,
        resRetail: resRetail,
        totalRetail: totalRetail
      });
    });

    rows.sort((a, b) => a.mfr.localeCompare(b.mfr) || a.ref.localeCompare(b.ref));
    return { rows, summary };
  },

  openInternalCostReportModal() {
    if (typeof AuthManager === 'undefined' || !AuthManager.currentUser || !AuthManager.currentUser.isAdmin) {
      alert("Access Denied: Only Administrators can view internal cost valuations.");
      return;
    }
    this.updateCostModalPreview();
    document.getElementById('internalCostReportModal').style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  updateCostModalPreview() {
    let banner = document.getElementById('costModalSummaryBanner');
    if (!banner) return;

    try {
      let { summary } = this._calculateInventoryValuation();
      const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      banner.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; text-align:center;">
          <div style="background:var(--card-bg); border:1px solid var(--border-color); border-top:3px solid #1565c0; border-radius:6px; padding:8px;">
            <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; opacity:0.8;">Total Physical Cost</div>
            <div style="font-size:1.1rem; font-weight:800; color:var(--heading-color); margin:3px 0;">${fmt(summary.totalPhysicalCost)}</div>
            <div style="font-size:0.72rem; opacity:0.75;">${summary.totalPhysicalUnits.toLocaleString()} Units (${summary.totalSkusInStock} SKUs)</div>
          </div>
          <div style="background:var(--card-bg); border:1px solid var(--border-color); border-top:3px solid #2e7d32; border-radius:6px; padding:8px;">
            <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; opacity:0.8;">Available Stock Cost</div>
            <div style="font-size:1.1rem; font-weight:800; color:#66bb6a; margin:3px 0;">${fmt(summary.totalAvailCost)}</div>
            <div style="font-size:0.72rem; opacity:0.75;">${summary.totalAvailUnits.toLocaleString()} Unreserved Units</div>
          </div>
          <div style="background:var(--card-bg); border:1px solid var(--border-color); border-top:3px solid #f57f17; border-radius:6px; padding:8px;">
            <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; opacity:0.8;">Reserved (Cart) Cost</div>
            <div style="font-size:1.1rem; font-weight:800; color:#ffa726; margin:3px 0;">${fmt(summary.totalResCost)}</div>
            <div style="font-size:0.72rem; opacity:0.75;">${summary.totalResUnits.toLocaleString()} Reserved Units</div>
          </div>
        </div>
        ${summary.skusMissingCost > 0 ? `
          <div style="margin-top:8px; padding:6px 10px; background:rgba(245, 127, 23, 0.12); border:1px dashed #ffa726; border-radius:6px; font-size:0.76rem; color:#ffa726; text-align:center;">
            ⚠️ <strong>Note:</strong> ${summary.skusMissingCost} in-stock SKU(s) (${summary.unitsMissingCost} units) currently have a <strong>$0.00</strong> cost in the database.
          </div>
        ` : ''}
      `;
    } catch (err) {
      banner.innerHTML = `<div style="color:#ef5350; text-align:center;">${err.message}</div>`;
    }
  },

  _getFilteredCostRows() {
    let { rows, summary } = this._calculateInventoryValuation();
    let scope = document.getElementById('costReportScope') ? document.getElementById('costReportScope').value : 'all_stock';
    let incMissing = document.getElementById('chkCostIncludeMissing') ? document.getElementById('chkCostIncludeMissing').checked : true;

    let filtered = rows.filter(r => {
      if (scope === 'missing_cost') return !r.hasCost;
      if (!incMissing && !r.hasCost) return false;
      if (scope === 'available_only') return r.availQty > 0;
      if (scope === 'reserved_only') return r.resQty > 0;
      return true;
    });

    return { filtered, summary, scope };
  },

  generateInternalCostReportPDF() {
    try {
      let { filtered, summary, scope } = this._getFilteredCostRows();
      if (filtered.length === 0) {
        alert("No inventory items match the selected filter criteria.");
        return;
      }

      let incMfr = document.getElementById('chkCostMfr') ? document.getElementById('chkCostMfr').checked : true;
      let incDesc = document.getElementById('chkCostDesc') ? document.getElementById('chkCostDesc').checked : true;
      let incBreakdown = document.getElementById('chkCostBreakdown') ? document.getElementById('chkCostBreakdown').checked : true;
      let incRetail = document.getElementById('chkCostRetail') ? document.getElementById('chkCostRetail').checked : false;

      const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      let scopeLabel = {
        'all_stock': 'All Physical Stock (Available + Reserved)',
        'available_only': 'Available Stock Only (Unreserved)',
        'reserved_only': 'Reserved Customer Bins Only',
        'missing_cost': 'In-Stock Items Missing Cost ($0.00)'
      }[scope] || 'All Physical Stock';

      let dateStr = new Date().toLocaleDateString();
      let safeDate = dateStr.replace(/\//g, '.');
      let filename = `ASP_Internal_Inventory_Cost_Report_(${safeDate})`;

      let html = `<!DOCTYPE html><html><head><title>${filename}</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 28px; color: #333; font-size: 11px; }
        .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0d47a1; padding-bottom: 10px; margin-bottom: 14px; }
        .brand-section { display: flex; align-items: center; gap: 12px; }
        .logo-img { height: 42px; object-fit: contain; }
        .company-name { font-size: 12px; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
        h2 { color: #0d47a1; margin: 2px 0 0 0; font-size: 18px; text-transform: uppercase; }
        .meta-right { text-align: right; font-size: 11px; color: #555; }
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
        .kpi-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; text-align: center; }
        .kpi-card.total { border-top: 4px solid #0d47a1; background: #f0f7ff; }
        .kpi-card.avail { border-top: 4px solid #2e7d32; background: #f1f8f1; }
        .kpi-card.res { border-top: 4px solid #e65100; background: #fff8f0; }
        .kpi-title { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #555; }
        .kpi-val { font-size: 18px; font-weight: 800; margin: 4px 0; }
        .kpi-sub { font-size: 10px; color: #666; }
        .missing-banner { background: #fff3e0; border-left: 4px solid #e65100; padding: 8px 12px; margin-bottom: 14px; font-size: 11px; color: #bf360c; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10.5px; }
        th { background: #e2e8f0; border: 1px solid #cbd5e1; padding: 6px 6px; text-align: left; font-size: 10px; text-transform: uppercase; color: #1e293b; }
        td { border: 1px solid #e2e8f0; padding: 5px 6px; vertical-align: middle; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .ctr { text-align: center; }
        .total-row { background: #f1f5f9; font-weight: bold; border-top: 2px solid #0d47a1; font-size: 11px; }
        @media print { body { margin: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>

      <div class="header-container">
        <div class="brand-section">
          <img src="${ENV_CONFIG.LOGO_URL}" class="logo-img" alt="ASP Logo">
          <div>
            <div class="company-name">Allied Surgical Products — Confidential Financial Report</div>
            <h2>Internal Inventory Cost Valuation</h2>
          </div>
        </div>
        <div class="meta-right">
          <div><strong>Date:</strong> ${dateStr}</div>
          <div><strong>Scope:</strong> ${scopeLabel}</div>
          <div><strong>SKUs Shown:</strong> ${filtered.length}</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card total">
          <div class="kpi-title">Total Physical Inventory Cost</div>
          <div class="kpi-val" style="color:#0d47a1;">${fmt(summary.totalPhysicalCost)}</div>
          <div class="kpi-sub">${summary.totalPhysicalUnits.toLocaleString()} Total Units (${summary.totalSkusInStock} SKUs)</div>
          ${incRetail ? `<div class="kpi-sub" style="margin-top:2px; color:#0d47a1;"><strong>Est. Retail Value:</strong> ${fmt(summary.totalPhysicalRetail)}</div>` : ''}
        </div>
        <div class="kpi-card avail">
          <div class="kpi-title">Available Inventory Cost (Unreserved)</div>
          <div class="kpi-val" style="color:#2e7d32;">${fmt(summary.totalAvailCost)}</div>
          <div class="kpi-sub">${summary.totalAvailUnits.toLocaleString()} Available Units Ready to Sell</div>
          ${incRetail ? `<div class="kpi-sub" style="margin-top:2px; color:#2e7d32;"><strong>Available Retail:</strong> ${fmt(summary.totalAvailRetail)}</div>` : ''}
        </div>
        <div class="kpi-card res">
          <div class="kpi-title">Reserved Inventory Cost (Customer Bins)</div>
          <div class="kpi-val" style="color:#e65100;">${fmt(summary.totalResCost)}</div>
          <div class="kpi-sub">${summary.totalResUnits.toLocaleString()} Units Staged in Customer Bins</div>
          ${incRetail ? `<div class="kpi-sub" style="margin-top:2px; color:#e65100;"><strong>Reserved Retail:</strong> ${fmt(summary.totalResRetail)}</div>` : ''}
        </div>
      </div>

      ${summary.skusMissingCost > 0 ? `
        <div class="missing-banner">
          <strong>⚠️ Missing Cost Notice:</strong> ${summary.skusMissingCost} in-stock SKU(s) (${summary.unitsMissingCost} physical units) do not have a Unit Cost recorded yet ($0.00) and are flagged as <strong>COST NEEDED</strong> below.
        </div>
      ` : ''}

      <table>
        <thead>
          <tr>
            ${incMfr ? '<th>MFR</th>' : ''}
            <th>REF / SKU</th>
            ${incDesc ? '<th>Description</th>' : ''}
            ${incBreakdown ? '<th class="ctr">Avail Qty</th><th class="ctr">Res Qty</th>' : ''}
            <th class="ctr">Total Qty</th>
            <th class="num">Unit Cost</th>
            ${incBreakdown ? '<th class="num">Available Cost</th><th class="num">Reserved Cost</th>' : ''}
            <th class="num">Total Cost</th>
            ${incRetail ? '<th class="num">Unit Price</th><th class="num">Total Retail</th>' : ''}
          </tr>
        </thead>
        <tbody>`;

      let tableAvailQty = 0, tableResQty = 0, tableTotQty = 0;
      let tableAvailCost = 0, tableResCost = 0, tableTotCost = 0, tableTotRetail = 0;

      filtered.forEach(r => {
        tableAvailQty += r.availQty;
        tableResQty += r.resQty;
        tableTotQty += r.totalQty;
        tableAvailCost += r.availCost;
        tableResCost += r.resCost;
        tableTotCost += r.totalCost;
        tableTotRetail += r.totalRetail;

        let unitCostDisplay = r.hasCost
          ? fmt(r.unitCost) + (r.costNote ? `<br><span style="font-size:8.5px; color:#666;">(${r.costNote})</span>` : '')
          : '<span style="color:#c62828; font-weight:bold;">COST NEEDED</span>';

        html += `<tr>
          ${incMfr ? `<td>${r.mfr}</td>` : ''}
          <td style="font-weight:bold; color:#0d47a1;">${r.ref}</td>
          ${incDesc ? `<td style="font-size:9.5px; color:#555;">${r.desc}</td>` : ''}
          ${incBreakdown ? `<td class="ctr" style="color:#2e7d32; font-weight:bold;">${r.availQty}</td><td class="ctr" style="color:${r.resQty > 0 ? '#e65100' : '#888'}; font-weight:${r.resQty > 0 ? 'bold' : 'normal'};">${r.resQty}</td>` : ''}
          <td class="ctr" style="font-weight:bold;">${r.totalQty}</td>
          <td class="num">${unitCostDisplay}</td>
          ${incBreakdown ? `<td class="num" style="color:#2e7d32;">${fmt(r.availCost)}</td><td class="num" style="color:${r.resCost > 0 ? '#e65100' : '#888'};">${fmt(r.resCost)}</td>` : ''}
          <td class="num" style="font-weight:bold; color:#0d47a1;">${fmt(r.totalCost)}</td>
          ${incRetail ? `<td class="num">${r.unitPrice > 0 ? fmt(r.unitPrice) : '--'}</td><td class="num" style="font-weight:bold;">${fmt(r.totalRetail)}</td>` : ''}
        </tr>`;
      });

      let leadCols = 1 + (incMfr ? 1 : 0) + (incDesc ? 1 : 0);
      html += `
          <tr class="total-row">
            <td colspan="${leadCols}" style="text-align:right;">REPORT TOTALS (${filtered.length} SKUs):</td>
            ${incBreakdown ? `<td class="ctr" style="color:#2e7d32;">${tableAvailQty.toLocaleString()}</td><td class="ctr" style="color:#e65100;">${tableResQty.toLocaleString()}</td>` : ''}
            <td class="ctr">${tableTotQty.toLocaleString()}</td>
            <td class="num">--</td>
            ${incBreakdown ? `<td class="num" style="color:#2e7d32;">${fmt(tableAvailCost)}</td><td class="num" style="color:#e65100;">${fmt(tableResCost)}</td>` : ''}
            <td class="num" style="color:#0d47a1;">${fmt(tableTotCost)}</td>
            ${incRetail ? `<td class="num">--</td><td class="num">${fmt(tableTotRetail)}</td>` : ''}
          </tr>
        </tbody>
      </table>
      </body></html>`;

      let safeTitle = filename.replace(/\./g, '\u2024');
      let win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.title = safeTitle;
        win.focus();
        setTimeout(() => win.print(), UIManager.printTimeout);
      }

      document.getElementById('internalCostReportModal').style.display = 'none';
    } catch (err) {
      alert("Error generating Cost Valuation PDF: " + err.message);
    }
  },

  exportInternalCostReportCSV() {
    try {
      let { filtered, summary, scope } = this._getFilteredCostRows();
      if (filtered.length === 0) {
        alert("No inventory items match the selected filter criteria.");
        return;
      }

      let incRetail = document.getElementById('chkCostRetail') ? document.getElementById('chkCostRetail').checked : false;

      let csvRows = [];
      // Top Summary Block in CSV so Jessica sees the grand totals immediately in Excel
      csvRows.push(`"ASP INTERNAL INVENTORY COST VALUATION","Generated: ${new Date().toLocaleDateString()}"`);
      csvRows.push(`"Total Physical Cost (Available + Reserved)","$${summary.totalPhysicalCost.toFixed(2)}","Total Physical Units",${summary.totalPhysicalUnits}`);
      csvRows.push(`"Available Inventory Cost (Unreserved)","$${summary.totalAvailCost.toFixed(2)}","Available Units",${summary.totalAvailUnits}`);
      csvRows.push(`"Reserved Inventory Cost (Customer Bins)","$${summary.totalResCost.toFixed(2)}","Reserved Units",${summary.totalResUnits}`);
      csvRows.push(`"In-Stock SKUs Missing Cost ($0.00)",${summary.skusMissingCost},"Units Missing Cost",${summary.unitsMissingCost}`);
      csvRows.push(""); // Blank separator row

      let headers = [
        "Manufacturer", "REF / SKU", "Description", "Shelf",
        "Available Qty", "Reserved Qty", "Total Physical Qty",
        "Unit Cost", "Available Cost ($)", "Reserved Cost ($)", "Total Physical Cost ($)", "Cost Status"
      ];
      if (incRetail) {
        headers.push("Selling Price", "Total Retail Value ($)");
      }
      csvRows.push(headers.join(","));

      filtered.forEach(r => {
        let mfr = String(r.mfr || '').replace(/"/g, '""');
        let ref = String(r.ref || '').replace(/"/g, '""');
        let desc = String(r.desc || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
        let shelf = String(r.shelf || '').replace(/"/g, '""');
        let statusStr = r.hasCost ? (r.costNote || "OK") : "COST NEEDED";

        let rowArr = [
          `"${mfr}"`, `"${ref}"`, `"${desc}"`, `"${shelf}"`,
          r.availQty, r.resQty, r.totalQty,
          r.unitCost.toFixed(2), r.availCost.toFixed(2), r.resCost.toFixed(2), r.totalCost.toFixed(2),
          `"${statusStr.replace(/"/g, '""')}"`
        ];
        if (incRetail) {
          rowArr.push(r.unitPrice.toFixed(2), r.totalRetail.toFixed(2));
        }
        csvRows.push(rowArr.join(","));
      });

      let dateStr = new Date().toLocaleDateString().replace(/\//g, '.');
      UIManager.triggerShareOrDownload(csvRows.join("\r\n"), `ASP_Internal_Inventory_Cost_Valuation_${dateStr}.csv`, 'text/csv');
      document.getElementById('internalCostReportModal').style.display = 'none';
    } catch (err) {
      alert("Error exporting Cost Valuation CSV: " + err.message);
    }
  },

  // =======================================================================
  // EXTERNAL MARKETPLACE SYNC PORTAL (REVMED / DOTMED / VETCOVE)
  // =======================================================================
  activeMpPlatform: 'REVMED',
  activeMpQueue: 'needs_listing',

  _parseMpStamp(rawVal) {
    let str = String(rawVal ?? '').trim();
    let upper = str.toUpperCase();
    if (!str || upper === 'FALSE' || upper === '0' || upper === 'NO' || upper === 'BLANK') {
      return { listed: false, syncedQty: null, syncedPrice: null };
    }
    if (upper === 'TRUE' || upper === '1' || upper === 'YES') {
      return { listed: true, syncedQty: null, syncedPrice: null };
    }
    if (upper.startsWith('TRUE|')) {
      let parts = str.split('|');
      let q = null, p = null;
      parts.forEach(pt => {
        if (pt.startsWith('QTY:')) q = parseInt(pt.substring(4), 10);
        if (pt.startsWith('PRICE:')) p = parseFloat(pt.substring(6));
      });
      return { listed: true, syncedQty: isNaN(q) ? null : q, syncedPrice: isNaN(p) ? null : p };
    }
    return { listed: false, syncedQty: null, syncedPrice: null };
  },

  _buildMpStamp(qty, priceNum) {
    let cleanQty = Math.max(0, parseInt(qty, 10) || 0);
    let cleanPrice = (parseFloat(priceNum) || 0).toFixed(2);
    return `TRUE|QTY:${cleanQty}|PRICE:${cleanPrice}`;
  },

  _getLotExpSummaryForItem(item) {
    let expTrack = (typeof DatabaseManager !== 'undefined' && Array.isArray(DatabaseManager.expTrack)) ? DatabaseManager.expTrack : [];
    let isBundle = item.parentRef && (parseInt(item.uomMult, 10) || 1) > 1;
    let lookupRef = isBundle ? DatabaseManager.getCleanParentRef(item).toUpperCase() : String(item.ref || item.sku || '').toUpperCase().trim();
    let uom = parseInt(item.uomMult, 10) || 1;

    let buckets = {};
    expTrack.forEach(r => {
      if (String(r[0] || '').toUpperCase().trim() === lookupRef) {
        let lot = r[1] || 'N/A';
        let exp = r[2] || 'N/A';
        let q = parseInt(r[3], 10) || 0;
        if (q > 0) {
          let key = `${lot}|${exp}`;
          if (!buckets[key]) buckets[key] = { lot, exp, qty: 0 };
          buckets[key].qty += q;
        }
      }
    });

    let list = [];
    Object.values(buckets).forEach(b => {
      if (isBundle) {
        let boxes = Math.floor(b.qty / uom);
        if (boxes > 0) list.push(`Lot: ${b.lot} (Exp: ${b.exp}) — ${boxes} Box(es)`);
      } else {
        list.push(`Lot: ${b.lot} (Exp: ${b.exp}) — ${b.qty} ea`);
      }
    });
    return list.length > 0 ? list.join('<br>') : '<span style="opacity:0.6;">No active lot breakdown</span>';
  },

  _getMarketplaceDataset(platform) {
    let db = (typeof DatabaseManager !== 'undefined' && Array.isArray(DatabaseManager.db)) ? DatabaseManager.db : [];
    let hiddenParents = DatabaseManager.getHiddenParentRefs();
    const parseMoney = (v) => parseFloat(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;

    let flagProp = platform === 'REVMED' ? 'onRevMed' : (platform === 'DOTMED' ? 'onDotMed' : 'onVetcove');
    let priceProp = platform === 'REVMED' ? 'revMedPrice' : (platform === 'DOTMED' ? 'dotMedPrice' : 'vetcovePrice');

    let needsListing = [];
    let qtyChanged = [];
    let priceChanged = [];
    let activeCatalog = [];

    db.forEach(item => {
      if (item.status === 'INACTIVE') return;
      let ref = String(item.ref || item.sku || '').toUpperCase().trim();
      if (!ref) return;

      let isBundle = item.parentRef && (parseInt(item.uomMult, 10) || 1) > 1;
      // Skip base Each row if its Box variant is flagged "Sell As Box Only"
      if (!isBundle && hiddenParents.has(ref)) return;

      let liveAvail = DatabaseManager.getTrueAvailability(item);
      let platformPriceNum = parseMoney(item[priceProp]);
      let fallbackPriceNum = parseMoney(item.price);
      let effectivePriceNum = platformPriceNum > 0 ? platformPriceNum : fallbackPriceNum;
      let hasDedicatedPlatformPrice = platformPriceNum > 0;

      let state = this._parseMpStamp(item[flagProp]);
      let lotHtml = this._getLotExpSummaryForItem(item);

      let rowObj = {
        item: item,
        ref: ref,
        displayAlias: item.displayAlias || '',
        mfr: item.mfr || 'UNKNOWN',
        desc: item.desc || '',
        gtin: item.gtin || '',
        isBundle: isBundle,
        uomMult: parseInt(item.uomMult, 10) || 1,
        liveAvail: liveAvail,
        effectivePriceNum: effectivePriceNum,
        hasDedicatedPlatformPrice: hasDedicatedPlatformPrice,
        listed: state.listed,
        syncedQty: state.syncedQty,
        syncedPrice: state.syncedPrice,
        lotHtml: lotHtml
      };

      if (!state.listed) {
        if (liveAvail > 0) needsListing.push(rowObj);
      } else {
        activeCatalog.push(rowObj);
        // Flag Qty Changed if:
        // 1) Item is Listed on the site AND liveAvail is now 0 (Sold out / needs removal!), OR
        // 2) A syncedQty stamp exists and differs from liveAvail
        if ((liveAvail === 0 && (state.syncedQty === null || state.syncedQty > 0)) ||
            (state.syncedQty !== null && state.syncedQty !== liveAvail)) {
          qtyChanged.push(rowObj);
        }
        // Flag Price Changed if a syncedPrice stamp exists and differs from effectivePriceNum
        if (state.syncedPrice !== null && Math.abs(state.syncedPrice - effectivePriceNum) >= 0.01) {
          priceChanged.push(rowObj);
        }
      }
    });

    const sortFn = (a, b) => a.mfr.localeCompare(b.mfr) || a.ref.localeCompare(b.ref);
    needsListing.sort(sortFn);
    qtyChanged.sort((a, b) => a.liveAvail - b.liveAvail || sortFn(a, b)); // Sold-out (0) items first!
    priceChanged.sort(sortFn);
    activeCatalog.sort(sortFn);

    return { needsListing, qtyChanged, priceChanged, activeCatalog };
  },

  openMarketplacePortal(platform = 'REVMED', queue = 'needs_listing') {
    this.activeMpPlatform = platform;
    this.activeMpQueue = queue;
    document.getElementById('marketplaceSyncModal').style.display = 'flex';
    this.renderMarketplacePortal();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  switchMarketplacePlatform(platform) {
    this.activeMpPlatform = platform;
    this.renderMarketplacePortal();
  },

  switchMarketplaceQueue(queue) {
    this.activeMpQueue = queue;
    this.renderMarketplacePortal();
  },

  renderMarketplacePortal() {
    let p = this.activeMpPlatform;
    ['REVMED', 'DOTMED', 'VETCOVE'].forEach(tab => {
      let btn = document.getElementById(`mpTab_${tab}`);
      if (btn) {
        let active = (tab === p);
        btn.style.background = active ? '#00796b' : '';
        btn.style.color = active ? '#ffffff' : '';
        btn.style.borderColor = active ? '#26a69a' : '';
      }
    });

    let data = this._getMarketplaceDataset(p);
    let qTabs = document.getElementById('mpQueueTabs');
    if (qTabs) {
      const makeTab = (key, label, count, color) => {
        let isAct = this.activeMpQueue === key;
        return `<button class="btn-saas-secondary" style="padding:8px 6px; font-size:0.78rem; font-weight:700; border-color:${isAct ? color : 'var(--border-color)'}; background:${isAct ? 'rgba(38,166,154,0.16)' : 'transparent'};" onclick="ReportsManager.switchMarketplaceQueue('${key}')">
          ${label} <span style="background:${color}; color:#fff; padding:1px 6px; border-radius:10px; font-size:0.72rem; margin-left:4px;">${count}</span>
        </button>`;
      };
      qTabs.innerHTML =
        makeTab('needs_listing', '🆕 Not Listed (In-Stock)', data.needsListing.length, '#0288d1') +
        makeTab('qty_changed', '📉 Qty Changed / Sold', data.qtyChanged.length, data.qtyChanged.length > 0 ? '#e65100' : '#546e7a') +
        makeTab('price_changed', '💲 Price Changed', data.priceChanged.length, data.priceChanged.length > 0 ? '#8e24aa' : '#546e7a') +
        makeTab('active_catalog', '📋 Active on Site', data.activeCatalog.length, '#2e7d32');
    }

    this.renderMarketplaceTable();
  },

  renderMarketplaceTable() {
    let p = this.activeMpPlatform;
    let q = this.activeMpQueue;
    let data = this._getMarketplaceDataset(p);
    let list = q === 'needs_listing' ? data.needsListing : (q === 'qty_changed' ? data.qtyChanged : (q === 'price_changed' ? data.priceChanged : data.activeCatalog));

    let searchVal = (document.getElementById('mpSearchInput') ? document.getElementById('mpSearchInput').value : '').toLowerCase().trim();
    if (searchVal) {
      list = list.filter(r =>
        r.ref.toLowerCase().includes(searchVal) ||
        r.mfr.toLowerCase().includes(searchVal) ||
        r.desc.toLowerCase().includes(searchVal) ||
        r.lotHtml.toLowerCase().includes(searchVal)
      );
    }

    let thead = document.getElementById('mpTableHead');
    let tbody = document.getElementById('mpTableBody');
    if (!thead || !tbody) return;

    let priceColTitle = p === 'REVMED' ? 'RM Price' : (p === 'DOTMED' ? 'DM Price' : 'VC Price');

    thead.innerHTML = `
      <tr>
        <th style="padding:8px; text-align:left;">MFR / REF</th>
        <th style="padding:8px; text-align:left;">Description & GTIN</th>
        <th style="padding:8px; text-align:left;">Active Lots & Exp (FEFO)</th>
        <th style="padding:8px; text-align:center;">${priceColTitle}</th>
        <th style="padding:8px; text-align:center;">Warehouse Avail</th>
        <th style="padding:8px; text-align:center;">Action</th>
      </tr>
    `;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:24px; text-align:center; opacity:0.7;">🎉 All caught up! No items in this queue for ${p}.</td></tr>`;
      return;
    }

    const fmt = (n) => n > 0 ? '$' + n.toFixed(2) : '<span style="color:#ef5350;">$0.00</span>';
    let html = '';

    list.forEach(r => {
      let safeRef = r.ref.replace(/'/g, "\\'");
      let qtyBadge = '';
      if (q === 'qty_changed') {
        let prevStr = r.syncedQty !== null ? r.syncedQty : 'Listed';
        let color = r.liveAvail === 0 ? '#ef5350' : '#ffa726';
        let statusNote = r.liveAvail === 0 ? '<div style="font-size:0.7rem; color:#ef5350; font-weight:800;">SOLD OUT — ZERO ON SITE</div>' : '';
        qtyBadge = `<div style="font-weight:800; color:${color};">${prevStr} ➔ ${r.liveAvail}</div>${statusNote}`;
      } else {
        qtyBadge = `<span style="font-weight:800; font-size:0.95rem; color:${r.liveAvail > 0 ? '#66bb6a' : '#ef5350'};">${r.liveAvail}</span> ${r.isBundle ? `<div style="font-size:0.7rem; opacity:0.75;">Box of ${r.uomMult}</div>` : ''}`;
      }

      let priceBadge = '';
      if (q === 'price_changed' && r.syncedPrice !== null) {
        priceBadge = `<div style="font-weight:800; color:#ce93d8;">$${r.syncedPrice.toFixed(2)} ➔ ${fmt(r.effectivePriceNum)}</div>`;
      } else {
        priceBadge = `<div style="font-weight:700;">${fmt(r.effectivePriceNum)}</div>` +
          (!r.hasDedicatedPlatformPrice && r.effectivePriceNum > 0 ? `<div style="font-size:0.68rem; opacity:0.65;">(Base Price)</div>` : '');
      }

      let actionBtns = '';
      if (q === 'needs_listing') {
        actionBtns = `<button class="btn-saas-primary" style="margin:0; padding:6px 10px; font-size:0.75rem; background:#0288d1;" onclick="ReportsManager.markItemMarketplaceSynced('${safeRef}', true)">+ Mark Listed</button>`;
      } else if (q === 'qty_changed' || q === 'price_changed') {
        let btnLabel = r.liveAvail === 0 ? '✓ Delist / Zeroed' : '✓ Confirm Updated';
        let shouldStayListed = r.liveAvail > 0;
        actionBtns = `<button class="btn-saas-primary" style="margin:0; padding:6px 10px; font-size:0.75rem; background:${r.liveAvail === 0 ? '#c62828' : '#2e7d32'};" onclick="ReportsManager.markItemMarketplaceSynced('${safeRef}', ${shouldStayListed})">${btnLabel}</button>`;
      } else {
        let syncedInfo = r.syncedQty !== null ? `<div style="font-size:0.68rem; opacity:0.75; margin-bottom:4px;">Stamped: Qty ${r.syncedQty} @ $${(r.syncedPrice || 0).toFixed(2)}</div>` : `<div style="font-size:0.68rem; color:#ffa726; margin-bottom:4px;">Legacy TRUE (Unstamped)</div>`;
        actionBtns = `
          ${syncedInfo}
          <div style="display:flex; gap:4px; justify-content:center;">
            <button class="btn-saas-primary" style="margin:0; padding:4px 8px; font-size:0.72rem; background:#00796b;" onclick="ReportsManager.markItemMarketplaceSynced('${safeRef}', true)">✓ Stamp Current</button>
            <button class="btn-saas-secondary" style="margin:0; padding:4px 8px; font-size:0.72rem; color:#ef5350; border-color:#ef5350;" onclick="ReportsManager.markItemMarketplaceSynced('${safeRef}', false)">Unlist</button>
          </div>`;
      }

      html += `
        <tr style="border-bottom:1px solid var(--border-color);">
          <td style="padding:8px;">
            <div style="font-weight:800; color:var(--heading-color);">${r.ref}</div>
            <div style="font-size:0.72rem; opacity:0.75;">${r.mfr}</div>
          </td>
          <td style="padding:8px;">
            <div style="font-size:0.78rem;">${r.desc}</div>
            <div style="font-size:0.7rem; opacity:0.7; font-family:monospace;">GTIN: ${r.gtin || 'N/A'}</div>
          </td>
          <td style="padding:8px; font-size:0.75rem; line-height:1.35;">${r.lotHtml}</td>
          <td style="padding:8px; text-align:center;">${priceBadge}</td>
          <td style="padding:8px; text-align:center;">${qtyBadge}</td>
          <td style="padding:8px; text-align:center;">${actionBtns}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  markItemMarketplaceSynced(ref, setListed = true) {
    let p = this.activeMpPlatform;
    let flagProp = p === 'REVMED' ? 'onRevMed' : (p === 'DOTMED' ? 'onDotMed' : 'onVetcove');
    let priceProp = p === 'REVMED' ? 'revMedPrice' : (p === 'DOTMED' ? 'dotMedPrice' : 'vetcovePrice');
    const parseMoney = (v) => parseFloat(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;

    let dbItem = DatabaseManager.db.find(i => String(i.ref || i.sku || '').toUpperCase().trim() === ref.toUpperCase().trim());
    if (!dbItem) return;

    if (!setListed) {
      dbItem[flagProp] = "FALSE";
    } else {
      let liveAvail = DatabaseManager.getTrueAvailability(dbItem);
      let pPrice = parseMoney(dbItem[priceProp]);
      let effPrice = pPrice > 0 ? pPrice : parseMoney(dbItem.price);
      dbItem[flagProp] = this._buildMpStamp(liveAvail, effPrice);
    }

    localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));

    fetch(ApiManager.getActiveArchiveUrl(), {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: "DELTA_UPDATE_METADATA",
        payload: { updates: [dbItem] }
      })
    }).catch(e => console.warn("Marketplace status push failed:", e));

    this.renderMarketplacePortal();
  },

  bulkMarkMarketplaceSynced() {
    let p = this.activeMpPlatform;
    let q = this.activeMpQueue;
    let data = this._getMarketplaceDataset(p);
    let list = q === 'needs_listing' ? data.needsListing : (q === 'qty_changed' ? data.qtyChanged : (q === 'price_changed' ? data.priceChanged : data.activeCatalog));

    if (list.length === 0) return;
    if (!confirm(`Mark all ${list.length} item(s) in this ${p} queue as synced with their current warehouse quantities and prices?`)) return;

    let flagProp = p === 'REVMED' ? 'onRevMed' : (p === 'DOTMED' ? 'onDotMed' : 'onVetcove');
    let priceProp = p === 'REVMED' ? 'revMedPrice' : (p === 'DOTMED' ? 'dotMedPrice' : 'vetcovePrice');
    const parseMoney = (v) => parseFloat(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;

    let updatedItems = [];
    list.forEach(r => {
      let dbItem = r.item;
      if (r.liveAvail <= 0 && q === 'qty_changed') {
        dbItem[flagProp] = "FALSE";
      } else {
        let pPrice = parseMoney(dbItem[priceProp]);
        let effPrice = pPrice > 0 ? pPrice : parseMoney(dbItem.price);
        dbItem[flagProp] = this._buildMpStamp(r.liveAvail, effPrice);
      }
      updatedItems.push(dbItem);
    });

    localStorage.setItem('asp_wh_db', JSON.stringify(DatabaseManager.db));

    fetch(ApiManager.getActiveArchiveUrl(), {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: "DELTA_UPDATE_METADATA",
        payload: { updates: updatedItems }
      })
    }).catch(e => console.warn("Bulk marketplace push failed:", e));

    this.renderMarketplacePortal();
  },

  printMarketplaceWorksheetPDF() {
    let p = this.activeMpPlatform;
    let q = this.activeMpQueue;
    let data = this._getMarketplaceDataset(p);
    let list = q === 'needs_listing' ? data.needsListing : (q === 'qty_changed' ? data.qtyChanged : (q === 'price_changed' ? data.priceChanged : data.activeCatalog));

    if (list.length === 0) {
      alert("No items in the current queue to print.");
      return;
    }

    let queueTitle = {
      'needs_listing': 'New In-Stock Items Not Listed Yet',
      'qty_changed': 'Quantity Changes & Sold Items To Adjust',
      'price_changed': 'Price Updates Needed',
      'active_catalog': 'All Active Marketplace Listings'
    }[q];

    let dateStr = new Date().toLocaleDateString();
    let html = `<!DOCTYPE html><html><head><title>${p} Marketplace Worksheet (${dateStr})</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #222; font-size: 11px; }
      h2 { color: #00695c; margin: 0 0 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #e0f2f1; border: 1px solid #b2dfdb; padding: 6px; text-align: left; font-size: 10px; text-transform: uppercase; }
      td { border: 1px solid #cfd8dc; padding: 6px; vertical-align: top; }
      .ctr { text-align: center; }
      @media print { body { margin: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <h2>${p} — ${queueTitle}</h2>
    <div><strong>Date:</strong> ${dateStr} | <strong>Total Items:</strong> ${list.length}</div>
    <table>
      <thead>
        <tr>
          <th class="ctr" style="width:28px;">Done</th>
          <th>MFR / REF</th>
          <th>Description & GTIN</th>
          <th>Active Lots & Exp</th>
          <th class="ctr">Site Price</th>
          <th class="ctr">Target Qty</th>
        </tr>
      </thead>
      <tbody>`;

    list.forEach(r => {
      let qtyText = (q === 'qty_changed' && r.syncedQty !== null) ? `${r.syncedQty} ➔ <strong>${r.liveAvail}</strong>` : `<strong>${r.liveAvail}</strong>`;
      let priceText = (q === 'price_changed' && r.syncedPrice !== null) ? `$${r.syncedPrice.toFixed(2)} ➔ <strong>$${r.effectivePriceNum.toFixed(2)}</strong>` : `$${r.effectivePriceNum.toFixed(2)}`;
      html += `<tr>
        <td class="ctr">☐</td>
        <td><strong>${r.ref}</strong><br><span style="font-size:9.5px; color:#555;">${r.mfr}</span></td>
        <td>${r.desc}<br><span style="font-size:9.5px; color:#666;">GTIN: ${r.gtin || 'N/A'}</span></td>
        <td style="font-size:10px;">${r.lotHtml}</td>
        <td class="ctr">${priceText}</td>
        <td class="ctr">${qtyText}</td>
      </tr>`;
    });

    html += `</tbody></table></body></html>`;
    let win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.focus();
      setTimeout(() => win.print(), UIManager.printTimeout);
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

    let hiddenParents = typeof DatabaseManager !== 'undefined' ? DatabaseManager.getHiddenParentRefs() : new Set();

    // Apply Dynamic Naming
    if (type === 'in_stock') {
      filtered = db.filter(i => {
        if (hiddenParents.has((i.sku || i.ref || '').toUpperCase())) return false; 
        return DatabaseManager.getTrueAvailability(i) > 0;
      });
    } else if (type === 'out_of_stock') {
      filtered = db.filter(i => {
        if (hiddenParents.has((i.sku || i.ref || '').toUpperCase())) return false; // ✨ Filter Box Only
        return !i.onHand || i.onHand === 0;
      });
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
      
      // ✨ FIX: Use the True Availability engine for the visual PDF table
      let avail = typeof DatabaseManager !== 'undefined' ? DatabaseManager.getTrueAvailability(item) : (total - res);
      
      html += `<tr>
        ${incMfr ? `<td>${item.mfr || 'UNKNOWN'}</td>` : ''}
        <td style="font-weight:bold; color:#0277bd;">${item.displayAlias || item.ref || item.sku}</td>
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
    let filename = `Stocktake_Variance_Report_${SessionManager.sessionDateStr}`;
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
      let res = await fetch(`${ApiManager.cloudArchiveUrl}?action=GET_AUDIT_LOG&t=${Date.now()}`);
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
    if (btn) { btn.innerHTML = "⏳ Downloading Live Ledger..."; btn.disabled = true; }

    try {
      // ✨ FIX: Target the new blazing-fast EXP_TRACK endpoint!
      let res = await fetch(`${ApiManager.cloudArchiveUrl}?action=GET_EXP_TRACK&t=${Date.now()}`);
      let text = await res.text();
      let responseData;
      
      try {
        responseData = JSON.parse(text);
      } catch(e) { 
        throw new Error("Connection blocked by Google. Try running again in a few moments."); 
      }

      if (responseData.status !== "success") {
        throw new Error(responseData.message || "Failed to load expiration ledger from cloud.");
      }

      let activeLots = responseData.data || [];

      let groups = {
        expired: [],
        six: [],
        twelve: [],
        twentyFour: []
      };

      // ✨ FIX: Map to the exact ALL-CAPS headers provided by the Google Sheets JSON
      activeLots.forEach(row => {
          let rawRef = String(row['REF / SKU'] || '').trim();
          
          // ✨ FIX 3: Preserve exact REF / SKU string (no stripping of (EACH) or parentheticals)
          let cleanRef = rawRef.toUpperCase();
          
          let lot = row['LOT']; 
          let exp = row['EXP DATE']; 
          let qty = parseInt(row['QTY'], 10) || 0; 
          let status = row['EXP STATUS']; 
          
          if (!rawRef || qty <= 0) return;
          
          let dbMatch = (typeof DatabaseManager !== 'undefined' && DatabaseManager.db) 
            ? DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === cleanRef) 
            : null;
            
          // Fallback just in case it is an older variant
          if (!dbMatch) dbMatch = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === rawRef.toUpperCase());

          // ✨ CRITICAL FIX 4: Cross-reference the live database. If it's completely out of stock globally, drop it from the report.
          let trueAvail = dbMatch ? DatabaseManager.getTrueAvailability(dbMatch) : 0;
          let reserved = dbMatch ? (parseInt(dbMatch.reservedQty, 10) || 0) : 0;
          if (dbMatch && (trueAvail + reserved) <= 0) return;

          let mfr = dbMatch ? (dbMatch.mfr || dbMatch.manufacturer || 'Unknown') : 'Unknown';
          let shelf = dbMatch ? (dbMatch.shelf || 'Standard') : 'Unknown';
          let displayRef = dbMatch ? (dbMatch.sku || dbMatch.ref) : cleanRef;
          
          let itemObj = { ref: displayRef, lot, exp, mfr, shelf, qty };

          if (status === "EXPIRED") groups.expired.push(itemObj);
          else if (status === "SHORT6") groups.six.push(itemObj);
          else if (status === "SHORT12") groups.twelve.push(itemObj);
          else if (status === "SHORT24") groups.twentyFour.push(itemObj);
      });

      // Helper function to build table sections
      const buildSection = (title, color, icon, items) => {
        if (items.length === 0) return '';
        // Sort chronologically by expiration date
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
      <p style="font-style:italic; color:#777; margin-bottom:20px;">This report flags all active inventory that has either expired or is at risk of expiring within the next 24 months, calculated directly from the live Expiration Ledger.</p>
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

    let hiddenParents = typeof DatabaseManager !== 'undefined' ? DatabaseManager.getHiddenParentRefs() : new Set();

    let filtered = db;
    if (mode === 'onhand') {
      filtered = db.filter(item => {
        if (hiddenParents.has(DatabaseManager.getItemSku(item))) return false; 
        let numPrice = parseFloat(String(item.price || item.Price || '').replace(/[^0-9.-]+/g, '')) || 0;
        return DatabaseManager.getTrueAvailability(item) > 0 && numPrice > 0;
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
      filtered = db.filter(i => this._parseMpStamp(i.onRevMed).listed);
    } else if (mode === 'not_on_revmed') {
      title = "On-Hand Stock Not on RevMed";
      fileSuffix = "Not_On_RevMed";
      filtered = db.filter(i => {
        let isListed = this._parseMpStamp(i.onRevMed).listed;
        let numPrice = parseFloat(String(i.price || '').replace(/[^0-9.-]+/g, '')) || 0;
        return !isListed && DatabaseManager.getTrueAvailability(i) > 0 && numPrice > 0;
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

  // Toggle Day Selector based on Frequency
  toggleSubSendDay() {
      let freq = document.getElementById('subFreq').value;
      let daySel = document.getElementById('subSendDay');
      if (!daySel) return;
      
      if (freq === 'Weekly') {
          daySel.style.display = 'block';
          daySel.innerHTML = `<option value="Monday">Monday</option><option value="Tuesday">Tuesday</option><option value="Wednesday">Wednesday</option><option value="Thursday">Thursday</option><option value="Friday">Friday</option><option value="Saturday">Saturday</option><option value="Sunday">Sunday</option>`;
      } else if (freq === 'Monthly') {
          daySel.style.display = 'block';
          let opts = '';
          for (let i=1; i<=31; i++) opts += `<option value="${i}">Day ${i}</option>`;
          opts += `<option value="Last">Last Day of Month</option>`;
          daySel.innerHTML = opts;
      } else {
          daySel.style.display = 'none';
      }
  },

  async loadSubscribers() {
      const container = document.getElementById('subListContainer');
      container.innerHTML = '<p style="text-align:center; color:#0277bd;">Loading...</p>';
      try {
          let res = await fetch(`${ApiManager.getActiveArchiveUrl()}?action=GET_SUBSCRIBERS`);
          let data = await res.json();
          
          if (data.status === "success" && data.subs && data.subs.length > 0) {
              this.currentSubs = data.subs; // ✨ FIX: Save data to memory to prevent quote-escaping bugs!
              
              let html = '<table style="width:100%; border-collapse:collapse; text-align:left;">';
              html += '<tr style="background:var(--raw-bg, #f0f0f0); border-bottom:1px solid var(--border-color, #ccc);"><th style="padding:4px; color:var(--text-main, #333);">Name</th><th style="padding:4px; color:var(--text-main, #333);">Email</th><th style="padding:4px; color:var(--text-main, #333);">Freq</th><th style="padding:4px; color:var(--text-main, #333);">Status</th><th style="padding:4px;"></th></tr>';
              
              data.subs.forEach(sub => {
                  html += `<tr style="border-bottom:1px solid #eee;">
                    <td style="padding:4px;">${sub.name}</td>
                    <td style="padding:4px; color:#0277bd; word-break:break-all;">${sub.email}</td>
                    <td style="padding:4px;">${sub.freq}</td>
                    <td style="padding:4px; font-weight:bold; color:${String(sub.status).toUpperCase() === 'ACTIVE' ? '#2e7d32' : '#c62828'};">${sub.status}</td>
                    <td style="padding:4px; text-align:right;">
                       <button class="btn-small" style="padding:4px 8px; font-size:0.75rem; margin-right:4px; background:#f57f17; border:none; color:#fff; cursor:pointer;" onclick="ReportsManager.previewSubscriberEmail('${sub.email}')">👁️ Preview</button>
                       <!-- ✨ FIX: Clean, safe function call -->
                       <button class="btn-small" style="padding:4px 8px; font-size:0.75rem;" onclick="ReportsManager.editSubscriber('${sub.email}')">Edit</button>
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

  // Clean edit function that pulls directly from memory
  editSubscriber(email) {
      if (!this.currentSubs) return;
      let sub = this.currentSubs.find(s => s.email === email);
      if (!sub) return;

      document.getElementById('subName').value = sub.name || "";
      document.getElementById('subEmail').value = sub.email || "";
      document.getElementById('subStatus').value = String(sub.status).toUpperCase() === 'ACTIVE' ? 'Active' : 'Inactive';
      document.getElementById('subCategories').value = sub.categories || "";
      
      if(document.getElementById('subFormat')) document.getElementById('subFormat').value = sub.format || "SMART";
      if(document.getElementById('subFallback')) document.getElementById('subFallback').value = sub.fallback || "SELLERS";
      if(document.getElementById('subCustomerId')) document.getElementById('subCustomerId').value = sub.customerId || "";
      if(document.getElementById('subPromoRefs')) document.getElementById('subPromoRefs').value = sub.promoRefs || "";
      if(document.getElementById('subCustomMessage')) document.getElementById('subCustomMessage').value = sub.customMessage || "";
      
      // Load the new toggle checkboxes
      if(document.getElementById('subIgnoreHistory')) document.getElementById('subIgnoreHistory').checked = (sub.ignoreHistory === true || String(sub.ignoreHistory).toUpperCase() === "TRUE");
      if(document.getElementById('subIncludeBoth')) document.getElementById('subIncludeBoth').checked = (sub.includeBoth === true || String(sub.includeBoth).toUpperCase() === "TRUE");
      if(document.getElementById('subIgnoreFallback')) document.getElementById('subIgnoreFallback').checked = (sub.ignoreFallback === true || String(sub.ignoreFallback).toUpperCase() === "TRUE");      

      let fSel = document.getElementById('subFreq');
      if(fSel) { 
          fSel.value = sub.freq || "Daily"; 
          if(typeof this.toggleSubSendDay === 'function') this.toggleSubSendDay(); 
      }
      let dSel = document.getElementById('subSendDay');
      if(dSel && sub.sendDay) dSel.value = sub.sendDay;
      
      window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to the form
  },

  // Master reset for the Subscriber entry form
  clearSubscriberFields() {
      if (document.getElementById('subName')) document.getElementById('subName').value = "";
      if (document.getElementById('subEmail')) document.getElementById('subEmail').value = "";
      if (document.getElementById('subFreq')) document.getElementById('subFreq').value = "Weekly";
      if (document.getElementById('subStatus')) document.getElementById('subStatus').value = "Active";
      if (document.getElementById('subFormat')) document.getElementById('subFormat').value = "SMART";
      if (document.getElementById('subFallback')) document.getElementById('subFallback').value = "SELLERS";
      if (document.getElementById('subCustomerId')) document.getElementById('subCustomerId').value = "";
      if (document.getElementById('subPromoRefs')) document.getElementById('subPromoRefs').value = "";
      if (document.getElementById('subSendDay')) document.getElementById('subSendDay').value = "";
      if (document.getElementById('subCustomMessage')) document.getElementById('subCustomMessage').value = "";
      if (document.getElementById('subIgnoreHistory')) document.getElementById('subIgnoreHistory').checked = false;
      if (document.getElementById('subIncludeBoth')) document.getElementById('subIncludeBoth').checked = false;
      if (document.getElementById('subIgnoreFallback')) document.getElementById('subIgnoreFallback').checked = false;
      if (document.getElementById('subCategories')) document.getElementById('subCategories').value = "";

      
      // Ensure the "Send Day" dropdown hides itself if the default frequency is changed back to Daily
      if (typeof this.toggleSubSendDay === 'function') this.toggleSubSendDay();
  },

  saveSubscriber(event) {
      let btn = event ? event.target : document.activeElement;
      let origText = btn.textContent;
      btn.textContent = "⏳ Saving..."; btn.disabled = true;

      let name = document.getElementById('subName').value.trim();
      let email = document.getElementById('subEmail').value.trim();
      let freq = document.getElementById('subFreq').value;
      let status = document.getElementById('subStatus').value;
      let format = document.getElementById('subFormat') ? document.getElementById('subFormat').value : "SMART";
      let fallback = document.getElementById('subFallback') ? document.getElementById('subFallback').value : "SELLERS";
      let categoryPref = document.getElementById('subCategories').value.trim();
      let customerId = document.getElementById('subCustomerId') ? document.getElementById('subCustomerId').value : ""; 
      let promoRefs = document.getElementById('subPromoRefs') ? document.getElementById('subPromoRefs').value.trim() : "";
      let customMessage = document.getElementById('subCustomMessage') ? document.getElementById('subCustomMessage').value.trim() : "";
      
      let ignoreHistory = document.getElementById('subIgnoreHistory') ? document.getElementById('subIgnoreHistory').checked : false;
      let includeBoth = document.getElementById('subIncludeBoth') ? document.getElementById('subIncludeBoth').checked : false;
      let ignoreFallback = document.getElementById('subIgnoreFallback') ? document.getElementById('subIgnoreFallback').checked : false; // ✨ NEW

      let sendDay = "";
      if (freq === 'Weekly' || freq === 'Monthly') {
          let dSel = document.getElementById('subSendDay');
          if (dSel) sendDay = dSel.value;
      }

      if (!name || !email) {
          UIManager.showCustomAlert("Error", "Please provide a name and email address.");
          btn.textContent = origText; btn.disabled = false; 
          return;
      }
       
      let payload = { 
          name: name, email: email, freq: freq, status: status, 
          categories: categoryPref, format: format, fallback: fallback, customerId: customerId,
          promoRefs: promoRefs, sendDay: sendDay, customMessage: customMessage,
          ignoreHistory: ignoreHistory, includeBoth: includeBoth, ignoreFallback: ignoreFallback // ✨ Map the new toggles
      };

      fetch(ApiManager.getActiveArchiveUrl(), {
          method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: "UPDATE_SUBSCRIBER", payload: payload })
      }).then(() => {
          UIManager.showCustomAlert("Success", `${name} has been updated in the cloud!`);
          
          // ✨ NEW: Trigger the master wipe function to reset the entire form for the next entry
          this.clearSubscriberFields();
          
          this.loadSubscribers(); 
      }).catch(err => {
          UIManager.showCustomAlert("Error", "Failed to save subscriber.");
      }).finally(() => {
          btn.textContent = origText; btn.disabled = false;
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
  },

  // CUSTOM LISTS ENGINE
  async openCustomListsModal() {
      document.getElementById('listNameInput').value = '';
      document.getElementById('listRefsInput').value = '';
      document.getElementById('customListsModal').style.display = 'flex';
      this.refreshCustomListsUI();
  },

  async refreshCustomListsUI() {
      let grid = document.getElementById('customListsGrid');
      let dropdown = document.getElementById('subFallback');
      if (grid) grid.innerHTML = '<div style="text-align:center; padding:20px; color:#777;">Loading...</div>';

      try {
          let res = await fetch(`${ApiManager.getActiveArchiveUrl()}?action=GET_CUSTOM_LISTS&t=${Date.now()}`);
          let data = await res.json();
          
          if (data.status === "success") {
              // 1. Rebuild the Grid
              if (grid) {
                  if (data.lists.length === 0) {
                      grid.innerHTML = '<div style="text-align:center; padding:20px; color:#777; font-style:italic; border:1px solid #ccc; border-radius:4px;">No custom lists saved yet.</div>';
                  } else {
                      let html = '';
                      data.lists.forEach(list => {
                          html += `
                          <div style="background:#fff; border:1px solid #ccc; border-radius:6px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                              <div>
                                  <strong style="color:#0277bd; font-size:1rem;">${list.name}</strong>
                                  <div style="font-size:0.75rem; color:#555; margin-top:4px; word-break:break-all;">${list.refs}</div>
                              </div>
                              <button class="btn-small" style="background:#d32f2f; color:#fff; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; margin-left:10px;" onclick="ReportsManager.deleteCustomList('${list.name}')">🗑️</button>
                          </div>`;
                      });
                      grid.innerHTML = html;
                  }
              }
              
              // 2. Rebuild the Dropdown Options
              if (dropdown) {
                  // Keep the current selection if possible
                  let currentVal = dropdown.value; 
                  
                  let optsHtml = `
                    <option value="SELLERS">Fallback: Top Sellers</option>
                    <option value="VALUE">Fallback: High Value</option>
                    <option value="NONE">Fallback: None (PDF Only)</option>
                  `;
                  
                  if (data.lists.length > 0) {
                      optsHtml += `<optgroup label="--- Custom Shared Lists ---">`;
                      data.lists.forEach(list => {
                          optsHtml += `<option value="LIST_${list.name.toUpperCase()}">${list.name}</option>`;
                      });
                      optsHtml += `</optgroup>`;
                  }
                  
                  dropdown.innerHTML = optsHtml;
                  // Try to restore selection
                  if (Array.from(dropdown.options).some(o => o.value === currentVal)) {
                      dropdown.value = currentVal;
                  }
              }
          }
      } catch (err) {
          if (grid) grid.innerHTML = '<div style="text-align:center; padding:20px; color:#c62828;">Failed to load lists.</div>';
      }
  },

  async saveCustomList() {
      let name = document.getElementById('listNameInput').value.trim();
      let refs = document.getElementById('listRefsInput').value.trim();
      let btn = document.getElementById('btnSaveCustomList');

      if (!name || !refs) {
          alert("Please provide both a List Name and at least one REF.");
          return;
      }
      
      // Ensure the name doesn't conflict with our base logic tags
      if (name.toUpperCase() === "SELLERS" || name.toUpperCase() === "VALUE" || name.toUpperCase() === "NONE") {
          alert("Reserved name. Please choose a different list name.");
          return;
      }

      let origText = btn.innerText;
      btn.innerText = "⏳ Saving..."; btn.disabled = true;

      let userName = (typeof AuthManager !== 'undefined' && AuthManager.currentUser) ? AuthManager.currentUser.name : "Unknown";

      try {
          let res = await fetch(ApiManager.getActiveArchiveUrl(), {
              method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                  action: "SAVE_CUSTOM_LIST",
                  payload: { name: name, refs: refs, author: userName }
              })
          });
          let result = await res.json();
          
          if (result.status === "success") {
              document.getElementById('listNameInput').value = '';
              document.getElementById('listRefsInput').value = '';
              this.refreshCustomListsUI();
          } else {
              alert("Error: " + result.message);
          }
      } catch(err) {
          alert("Network Error: " + err.message);
      } finally {
          btn.innerText = origText; btn.disabled = false;
      }
  },

  async deleteCustomList(listName) {
      if (!confirm(`Are you sure you want to delete the list "${listName}"?`)) return;

      try {
          let res = await fetch(ApiManager.getActiveArchiveUrl(), {
              method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: "DELETE_CUSTOM_LIST", payload: { name: listName } })
          });
          let result = await res.json();
          
          if (result.status === "success") {
              this.refreshCustomListsUI();
          } else {
              alert("Error: " + result.message);
          }
      } catch(err) {
          alert("Network Error: " + err.message);
      }
  },

  async previewSubscriberEmail(email) {
      let contentDiv = document.getElementById('emailPreviewContent');
      contentDiv.innerHTML = '<div style="text-align:center; padding:40px; color:#555; font-weight:bold;">⏳ Generating Live Preview from Cloud Ledger...<br><span style="font-weight:normal; font-size:0.85rem;">This may take a moment while we calculate the inventory math.</span></div>';
      document.getElementById('emailPreviewModal').style.display = 'flex';

      try {
          // Fire a GET request to the cloud specifically for this email
          let res = await fetch(`${ApiManager.getActiveArchiveUrl()}?action=PREVIEW_EMAIL&email=${encodeURIComponent(email)}&t=${Date.now()}`);
          let data = await res.json();
          
          if (data.status === "success") {
              contentDiv.innerHTML = data.html;
          } else {
              contentDiv.innerHTML = `<div style="color:#c62828; text-align:center; padding:20px;">Error generating preview: ${data.message}</div>`;
          }
      } catch (err) {
          contentDiv.innerHTML = `<div style="color:#c62828; text-align:center; padding:20px;">Network Error: ${err.message}</div>`;
      }
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
        let res = await fetch(`${ApiManager.getActiveArchiveUrl()}?action=RUN_ETHICON_UI_SCAN${queryParam}`);
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
                <td style="padding:6px; font-size:0.8rem; color:var(--text-main, #555);">${cleanDate}</td>
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
    fetch(`${ApiManager.getActiveArchiveUrl()}?action=GET_SUBSCRIBERS`)
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
    fetch(`${ApiManager.getActiveArchiveUrl()}?action=GET_ETHICON_ARCHIVE`)
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
                  <td style="padding:6px; font-size:0.8rem; color:var(--text-main, #555);">${cleanDate}</td>
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
        let res = await fetch(ApiManager.getActiveArchiveUrl(), {
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