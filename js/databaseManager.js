/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/databaseManager.js
 * Author: Thomas Paul Seyfors
 * Date: August 2026
 * 
 * Description:
 *   Local database controller for warehouse inventory catalog lookup, GTIN/SKU
 *   cross-referencing, manufacturer mapping, and live item description matching.
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const defaultVendors = [
  "ARTHREX", "BARD", "BAXTER", "BD", "COOPER SURGICAL", "COOPERSURG", "COVIDIEN", 
  "ETHICON", "INTEGRA", "INTUITIVE", "MEDTRONIC", "SHARPOINT", "SMITH & NEPHEW", "STRYKER",   
  "+ Create New Vendor"
];
const defaultSuppliers = ["Medline", "GeoSurgical", "RevMed", "SPS", "All Dats Medical", "Fast Surgical Solutions", "Med Choice Inc.", "DJ Medical", "+ Add Supplier"];
const defaultCustomers = ["AHS", "BL", "RFP", "CASCADE", "REDHEAD", "SUNCOAST", "MAP", "PMCY", "EMMANUEL JR", "SurgiShop", "Synergy", "POSS", "+ Add Customer"];

const DatabaseManager = {
  db: JSON.parse(localStorage.getItem('asp_wh_db')) || [],
  vendors: JSON.parse(localStorage.getItem('asp_wh_vendors')) || defaultVendors,
  suppliers: JSON.parse(localStorage.getItem('asp_wh_suppliers')) || defaultSuppliers,
  customers: JSON.parse(localStorage.getItem('asp_wh_customers')) || defaultCustomers,

  async init() {
    // AUTO-SYNC: Merge any new hardcoded defaults into localStorage cache
    defaultSuppliers.forEach(s => {
      if (!this.suppliers.includes(s)) {
        // Insert right before "+ Add Supplier"
        this.suppliers.splice(this.suppliers.length - 1, 0, s);
      }
    });
    localStorage.setItem('asp_wh_suppliers', JSON.stringify(this.suppliers));

    defaultCustomers.forEach(c => {
      if (!this.customers.includes(c)) {
        // Insert right before "+ Add Customer"
        this.customers.splice(this.customers.length - 1, 0, c);
      }
    });
    localStorage.setItem('asp_wh_customers', JSON.stringify(this.customers));

    try {
      const response = await fetch('database.json');
      if (response.ok) {
        const jsonContent = await response.json();
        if (jsonContent.items && jsonContent.items.length > 0) {
          this.db = jsonContent.items;
          localStorage.setItem('asp_wh_db', JSON.stringify(this.db));
        }
        if (jsonContent.vendors && jsonContent.vendors.length > 0) {
          this.vendors = jsonContent.vendors;
          localStorage.setItem('asp_wh_vendors', JSON.stringify(this.vendors));
        }
      } else {
        console.warn("Notice: External database.json not found, using local cache.");
      }
    } catch (err) {
      console.error("Database parsing error:", err);
    }
    
    this.populateRefDatalist();
    this.populateVendors();
    this.populatePartners();
    this.populateItemCustomerSelect();
    this.runMasterLookup();
  },

  populateRefDatalist() {
    const datalist = document.getElementById('dbRefs');
    if (!datalist) return;
    datalist.innerHTML = '';
    this.db.forEach(item => {
      let opt = document.createElement('option');
      opt.value = (item.sku || item.ref || '').toString().trim().toUpperCase();
      datalist.appendChild(opt);
    });
  },

  populateVendors() {
    const sel = document.getElementById('vendorSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Manufacturer --</option>';
    this.vendors.forEach(v => {
      if (v === "+ Create New Vendor") return;
      let opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
    let optNew = document.createElement('option');
    optNew.value = "+ Create New Vendor"; optNew.textContent = "+ Create New Vendor";
    sel.appendChild(optNew);
  },

  populatePartners() {
    const supSel = document.getElementById('supplierSelect');
    const custSel = document.getElementById('customerSelect');
    if (supSel) {
      supSel.innerHTML = '<option value="">-- Select Supplier --</option>';
      this.suppliers.forEach(s => {
        let opt = document.createElement('option'); opt.value = s; opt.textContent = s; supSel.appendChild(opt);
      });
    }
    if (custSel) {
      custSel.innerHTML = '<option value="">-- Select Customer --</option>';
      this.customers.forEach(c => {
        let opt = document.createElement('option'); opt.value = c; opt.textContent = c; custSel.appendChild(opt);
      });
    }
  },

  populateItemCustomerSelect() {
    const sel = document.getElementById('itemCustomerSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Customer --</option>';
    this.customers.forEach(c => {
      let opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      sel.appendChild(opt);
    });
  },

  handleItemCustomerSelect(val) {
    if (val === "+ Add Customer") {
      let newC = prompt("Enter new Customer name:");
      if (newC) {
        this.customers.splice(this.customers.length - 1, 0, newC.trim().toUpperCase());
        // SECURITY: Prevent guests from permanently overwriting the verified master list
        if (typeof AuthManager !== 'undefined' && !AuthManager.isGuest) {
          localStorage.setItem('asp_wh_customers', JSON.stringify(this.customers));
        }
        this.populatePartners();
        this.populateItemCustomerSelect();
        document.getElementById('itemCustomerSelect').value = newC.trim().toUpperCase();
      } else {
        document.getElementById('itemCustomerSelect').selectedIndex = 0;
      }
    }
  },

  handlePartnerSelect(val, type) {
    if (val === "+ Add Supplier") {
      let newS = prompt("Enter new Supplier/Vendor name:");
      if (newS) {
        this.suppliers.splice(this.suppliers.length - 1, 0, newS.trim());
        // SECURITY: Prevent guests from permanently overwriting the verified master list
        if (typeof AuthManager !== 'undefined' && !AuthManager.isGuest) {
          localStorage.setItem('asp_wh_suppliers', JSON.stringify(this.suppliers));
        }
        this.populatePartners();
        document.getElementById('supplierSelect').value = newS.trim();
      } else {
        document.getElementById('supplierSelect').selectedIndex = 0;
      }
    } else if (val === "+ Add Customer") {
      let newC = prompt("Enter new Customer name:");
      if (newC) {
        this.customers.splice(this.customers.length - 1, 0, newC.trim().toUpperCase());
        // SECURITY: Prevent guests from permanently overwriting the verified master list
        if (typeof AuthManager !== 'undefined' && !AuthManager.isGuest) {
          localStorage.setItem('asp_wh_customers', JSON.stringify(this.customers));
        }
        this.populatePartners();
        this.populateItemCustomerSelect();
        document.getElementById('customerSelect').value = newC.trim().toUpperCase();
      } else {
        document.getElementById('customerSelect').selectedIndex = 0;
      }
    }
  },

  handleVendorSelect(val) {
    if (val === "+ Create New Vendor") {
      let newV = prompt("Enter new Manufacturer/Vendor name:");
      if (newV) {
        this.vendors.splice(this.vendors.length - 1, 0, newV);
        // SECURITY: Prevent guests from permanently overwriting the verified master list
        if (typeof AuthManager !== 'undefined' && !AuthManager.isGuest) {
          localStorage.setItem('asp_wh_vendors', JSON.stringify(this.vendors));
        }
        this.populateVendors();
        document.getElementById('vendorSelect').value = newV;
      } else {
        document.getElementById('vendorSelect').selectedIndex = 0;
      }
    } else if (SessionManager.currentMatchedItem && this.getItemVendor(SessionManager.currentMatchedItem).toLowerCase() !== val.toLowerCase()) {
      document.getElementById('btnConfirmMfr').style.display = 'inline-block';
    }
    UIManager.evaluateFieldAttention();
  },

  findDatabaseMatch(gtinVal, refVal) {
    let cleanGtin = (gtinVal || '').replace(/^(01|\(01\))/, '').trim();
    let cleanRef = (refVal || '').trim().toUpperCase();
    if (cleanGtin) {
      let match = this.db.find(i => {
        let dbGtin = (i.gtin || '').toString().trim();
        return dbGtin && (dbGtin === cleanGtin || dbGtin.replace(/^0+/, '') === cleanGtin.replace(/^0+/, ''));
      });
      if (match) return match;
    }
    if (cleanRef) {
      let match = this.db.find(i => this.getItemSku(i) === cleanRef);
      if (match) return match;
    }
    return null;
  },

  // --- NEW: FACTORY RESET UTILITY ---
  factoryResetDatabase() {
    if(!confirm("⚠️ WARNING: Are you sure you want to wipe this device's local memory and reset the database back to the original database.json file?")) return;
    localStorage.removeItem('asp_wh_db');
    this.db = [];
    this.init().then(() => {
      alert("Local memory scrubbed and reset to factory defaults!");
      if (document.getElementById('screenDbEditor') && document.getElementById('screenDbEditor').style.display === 'block') {
         this.renderDbGridEditor(); 
      }
    });
  },

  // --- UPDATED: TEXT-WRAP GRID EDITOR WITH ADMIN-LOCKED COST & PRICE ---
  renderDbGridEditor() {
    const tbody = document.getElementById('dbGridBody');
    if (!tbody) return;
    
    let searchQuery = (document.getElementById('dbSearchInput') ? document.getElementById('dbSearchInput').value.toLowerCase().trim() : '');
    let mfrFilter = (document.getElementById('dbMfrFilter') ? document.getElementById('dbMfrFilter').value : 'ALL');
    
    // NEW: Check the toggle state
    let needsPriceFilter = document.getElementById('chkNeedsPrice') ? document.getElementById('chkNeedsPrice').checked : false;

    let mfrDropdown = document.getElementById('dbMfrFilter');
    if (mfrDropdown && mfrDropdown.options.length <= 1) {
      let uniqueMfrs = [...new Set(this.db.map(i => i.mfr).filter(Boolean))].sort();
      uniqueMfrs.forEach(m => {
        let opt = document.createElement('option'); opt.value = m; opt.textContent = m; mfrDropdown.appendChild(opt);
      });
    }

    let dbCopy = this.db.map(i => ({ ...i, category: i.category || '', cost: i.cost || '$0.00' }))
      .filter(i => {
        let matchesSearch = !searchQuery || (i.ref || i.sku || '').toLowerCase().includes(searchQuery) || (i.desc || '').toLowerCase().includes(searchQuery);
        let matchesMfr = mfrFilter === 'ALL' || i.mfr === mfrFilter;
        
        // CORRECTION: Filter out items if they have both a valid price AND a valid cost
        let matchesPrice = needsPriceFilter ? 
          (!i.price || i.price === '$0.00' || i.price === '0' || !i.cost || i.cost === '$0.00' || i.cost === '0') 
          : true;
        
        return matchesSearch && matchesMfr && matchesPrice;
      })
      .sort((a,b) => (a.mfr || '').localeCompare(b.mfr) || (a.ref || '').localeCompare(b.ref));
    
    let html = '';
    let isAdmin = AuthManager.currentUser && AuthManager.currentUser.isAdmin;

    dbCopy.forEach((item, idx) => {
      // SECURITY: Restrict both Price and Cost editing to Admin accounts (Jessica & Thomas)
      let priceInputHtml = isAdmin 
        ? `<input type="text" id="grid_price_${idx}" value="${item.price || '$0.00'}" style="width:75px; padding:4px;">` 
        : `<input type="text" id="grid_price_${idx}" value="${item.price || '$0.00'}" style="width:75px; padding:4px; background-color:#f5f5f5; color:#777;" readonly title="Admin approval required to edit pricing.">`;

      let costInputHtml = isAdmin 
        ? `<input type="text" id="grid_cost_${idx}" value="${item.cost || '$0.00'}" style="width:75px; padding:4px;">` 
        : `<input type="text" id="grid_cost_${idx}" value="***" style="width:75px; padding:4px; background-color:#f5f5f5; color:#999; text-align:center;" readonly title="Restricted Admin Data">`;

      html += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding:4px; vertical-align:top;"><input type="text" id="grid_mfr_${idx}" value="${item.mfr || ''}" style="width:90px; padding:4px;"></td>
          <td style="padding:4px; font-weight:bold; vertical-align:top;">${item.ref || item.sku}</td>
          <td style="padding:4px; vertical-align:top;">
            <textarea id="grid_desc_${idx}" style="width:100%; padding:4px; resize:vertical; min-height:40px; font-family:inherit; font-size:0.85rem; line-height:1.2;">${item.desc || ''}</textarea>
          </td>
          <td style="padding:4px; vertical-align:top;"><input type="text" id="grid_cat_${idx}" value="${item.category || ''}" placeholder="Category" style="width:90px; padding:4px;"></td>
          <td style="padding:4px; vertical-align:top;">${priceInputHtml}</td>
          <td style="padding:4px; vertical-align:top;">
             ${costInputHtml}
             <input type="hidden" id="grid_ref_${idx}" value="${item.ref || item.sku}">
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  },

  backupFullDatabase() {
    let outJSON = { vendors: this.vendors, items: this.db };
    UIManager.triggerShareOrDownload(JSON.stringify(outJSON, null, 2), `ASP_Database_Backup_${Date.now()}.json`, 'application/json');
  },

  exportGridChanges() {
    const tbody = document.getElementById('dbGridBody');
    let rows = tbody.querySelectorAll('tr');
    let updatedCount = 0;
    let isAdmin = AuthManager.currentUser && AuthManager.currentUser.isAdmin;

    rows.forEach((row, idx) => {
      let ref = document.getElementById(`grid_ref_${idx}`).value;
      let mfr = document.getElementById(`grid_mfr_${idx}`).value.trim();
      let desc = document.getElementById(`grid_desc_${idx}`).value.trim();
      let cat = document.getElementById(`grid_cat_${idx}`).value.trim();
      let price = document.getElementById(`grid_price_${idx}`).value.trim();
      let costEl = document.getElementById(`grid_cost_${idx}`);
      let cost = (isAdmin && costEl) ? costEl.value.trim() : null;

      let dbItem = this.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase());
      if (dbItem) {
        let changed = (dbItem.mfr !== mfr || dbItem.desc !== desc || dbItem.category !== cat || (isAdmin && dbItem.price !== price) || (isAdmin && cost !== null && dbItem.cost !== cost));
        if (changed) {
          dbItem.mfr = mfr;
          dbItem.desc = desc;
          dbItem.category = cat;
          if (isAdmin) {
            dbItem.price = price;
            if (cost !== null) dbItem.cost = cost;
          }
          updatedCount++;
        }
      }
    });

    if (updatedCount > 0) {
      localStorage.setItem('asp_wh_db', JSON.stringify(this.db));
      let outJSON = { vendors: this.vendors, items: this.db };
      UIManager.triggerShareOrDownload(JSON.stringify(outJSON, null, 2), `database_master_export_${Date.now()}.json`, 'application/json');
    } else {
      alert("No changes detected in the grid to export.");
    }
  },

  runMasterLookup() {
    let curRef = document.getElementById('refInput').value.trim().toUpperCase();
    let curGtin = document.getElementById('gtinInput').value.trim();
    let match = this.findDatabaseMatch(curGtin, curRef);

    if (match) {
      SessionManager.currentMatchedItem = match;
      if (curGtin && match.gtin && match.gtin !== curGtin) SessionManager.pendingUpdates['gtin'] = curGtin;
      this.populateDisplay(match);
      document.getElementById('prevDescText').textContent = `${this.getItemSku(match)} - ${this.getItemDesc(match)}`;
      document.getElementById('liveMatchPreview').style.display = 'block';

      // SMART RESERVATION AUTO-FILL: Check manifest reserved quota
      if (SessionManager.isManifestEnabled && SessionManager.expectedManifest && SessionManager.expectedManifest.length > 0) {
        let matchedSku = this.getItemSku(match);
        let manifestItem = SessionManager.expectedManifest.find(i => i.ref === matchedSku && i.isReserved);

        if (manifestItem) {
          let alreadyReserved = SessionManager.scannedObjects
            .filter(i => i.ref === matchedSku && i.actionTag === 'Reserved')
            .reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);

          if (alreadyReserved < manifestItem.reservedQty) {
            UIManager.setItemAction('Reserved');
            let tagInput = document.getElementById('itemOrderNumInput');
            let custSelect = document.getElementById('itemCustomerSelect');

            if (manifestItem.customerTag) {
              let parts = manifestItem.customerTag.split(' - ');
              if (custSelect) custSelect.value = parts[0] || '';
              if (tagInput) tagInput.value = parts[1] || '';
            }
          } else {
            // Quota met: default back to standard Inventory
            UIManager.setItemAction('Inventory');
            let tagInput = document.getElementById('itemOrderNumInput');
            if (tagInput) tagInput.value = '';
          }
        }
      }
    } else {
      SessionManager.currentMatchedItem = null;
      UIManager.hideAllConfirmButtons();
      document.getElementById('liveMatchPreview').style.display = 'none';
    }
    UIManager.evaluateFieldAttention();
  },

  populateDisplay(item) {
    let itemSku = this.getItemSku(item);
    let itemVendor = this.getItemVendor(item);
    if (itemSku && !document.getElementById('refInput').value.trim()) document.getElementById('refInput').value = itemSku;
    if (item.gtin && !document.getElementById('gtinInput').value.trim() && !document.getElementById('chkNaGtin').checked) {
      document.getElementById('gtinInput').value = item.gtin;
    }
    if (itemVendor) {
      let vendorSelect = document.getElementById('vendorSelect');
      let targetOption = Array.from(vendorSelect.options).find(opt => opt.value.trim().toLowerCase() === itemVendor.trim().toLowerCase());
      if (targetOption) {
        vendorSelect.value = targetOption.value;
      } else {
        this.vendors.splice(this.vendors.length - 1, 0, itemVendor);
        localStorage.setItem('asp_wh_vendors', JSON.stringify(this.vendors));
        this.populateVendors();
        vendorSelect.value = itemVendor;
      }
    }
    UIManager.evaluateFieldAttention();
  },

  getItemSku: (item) => (item && (item.sku || item.ref || '').toString().trim().toUpperCase()) || '',
  getItemVendor: (item) => (item && (item.mfr || item.vendor || item.manufacturer || '').toString().trim()) || '',
  getItemDesc: (item) => (item && (item.desc || item.description || '').toString().trim()) || '',

  // --- NEW: CLOUD DATABASE SYNC ENGINE ---
  async syncMasterDatabase(event, silent = false) {
    const btn = event ? event.target : null;
    const originalText = btn ? btn.textContent : "☁️ Sync Updates from DB";
    if (btn) { btn.textContent = "⏳ Syncing..."; btn.disabled = true; btn.style.opacity = "0.7"; }

    try {
      let cleanCustomers = this.customers.filter(c => !c.startsWith("+") && c !== "#ERROR!");
      let cleanSuppliers = this.suppliers.filter(s => !s.startsWith("+") && s !== "#ERROR!");
      let cleanVendors = this.vendors.filter(v => !v.startsWith("+") && v !== "#ERROR!");

      let pushPayload = {
        action: "SYNC_LOCAL_DB",
        payload: { items: this.db, customers: cleanCustomers, suppliers: cleanSuppliers, vendors: cleanVendors }
      };
      
      // 1. PUSH local device additions (Forced text/plain to bypass browser CORS limits)
      await fetch(SessionManager.cloudArchiveUrl, {
        method: 'POST', 
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(pushPayload)
      });

      // 2. PULL the fresh database (Cache-buster added to prevent Google HTML redirect bugs)
      let res = await fetch(`${SessionManager.cloudArchiveUrl}?action=SYNC_DATABASE&t=${Date.now()}`);
      
      let text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error("Google returned HTML instead of JSON:", text);
        throw new Error("Connection blocked by Google. Please ensure your Apps Script is deployed as a 'New Deployment' and running as 'Me'.");
      }
      
      if (data.status === "success" && data.db) {
         this.importCloudDatabase(data.db);
         if (!silent) alert("Master Database successfully synchronized with the cloud!");
         
         if (document.getElementById('screenDbEditor') && document.getElementById('screenDbEditor').style.display === 'block') {
           this.renderDbGridEditor(); 
         }
      } else {
         throw new Error(data.message || "Unknown Apps Script connection error.");
      }
    } catch (err) {
      if (!silent) alert("Error syncing database: " + err.message);
      else console.error("Error syncing database: " + err.message);
      throw err; // Re-throw to notify the master UI
    } finally {
      if (btn) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; }
    }
  },

  importCloudDatabase(cloudDb) {
    if (cloudDb.items && cloudDb.items.length > 0) {
      this.db = cloudDb.items;
      localStorage.setItem('asp_wh_db', JSON.stringify(this.db));
    }
    if (cloudDb.customers && cloudDb.customers.length > 0) {
      this.customers = cloudDb.customers;
      if (!this.customers.includes("+ Add Customer")) this.customers.push("+ Add Customer");
      localStorage.setItem('asp_wh_customers', JSON.stringify(this.customers));
    }
    if (cloudDb.suppliers && cloudDb.suppliers.length > 0) {
      this.suppliers = cloudDb.suppliers;
      if (!this.suppliers.includes("+ Add Supplier")) this.suppliers.push("+ Add Supplier");
      localStorage.setItem('asp_wh_suppliers', JSON.stringify(this.suppliers));
    }
    if (cloudDb.vendors && cloudDb.vendors.length > 0) {
      this.vendors = cloudDb.vendors;
      if (!this.vendors.includes("+ Create New Vendor")) this.vendors.push("+ Create New Vendor");
      localStorage.setItem('asp_wh_vendors', JSON.stringify(this.vendors));
    }
    
    // Refresh all UI dropdowns with the newly imported lists
    this.populatePartners();
    this.populateVendors();
    this.populateItemCustomerSelect();
    if (typeof UIManager !== 'undefined' && typeof UIManager.populateCustomerDropdown === 'function') {
      UIManager.populateCustomerDropdown();
    }
  }
};
