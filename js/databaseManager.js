/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/databaseManager.js
 * Author: Thomas Paul Seyfors
 * Version: 2.8.8
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

  renderDbGridEditor() {
    const tbody = document.getElementById('dbGridBody');
    if (!tbody) return;
    
    // Ensure item has a category property, sort MFR -> REF
    let dbCopy = this.db.map(i => ({ ...i, category: i.category || '' }))
                        .sort((a,b) => (a.mfr || '').localeCompare(b.mfr) || (a.ref || '').localeCompare(b.ref));
    
    let html = '';
    dbCopy.forEach((item, idx) => {
      html += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding:4px;"><input type="text" id="grid_mfr_${idx}" value="${item.mfr || ''}" style="width:100px; padding:4px;"></td>
          <td style="padding:4px; font-weight:bold;">${item.ref || item.sku}</td>
          <td style="padding:4px;"><input type="text" id="grid_desc_${idx}" value="${item.desc || ''}" style="width:100%; padding:4px;"></td>
          <td style="padding:4px;"><input type="text" id="grid_cat_${idx}" value="${item.category || ''}" placeholder="Category" style="width:100px; padding:4px;"></td>
          <td style="padding:4px;"><input type="text" id="grid_gtin_${idx}" value="${item.gtin || ''}" style="width:120px; padding:4px;"></td>
          <input type="hidden" id="grid_ref_${idx}" value="${item.ref || item.sku}">
        </tr>
      `;
    });
    tbody.innerHTML = html;
  },

  exportGridChanges() {
    const tbody = document.getElementById('dbGridBody');
    let rows = tbody.querySelectorAll('tr');
    let updatedCount = 0;

    rows.forEach((row, idx) => {
      let ref = document.getElementById(`grid_ref_${idx}`).value;
      let mfr = document.getElementById(`grid_mfr_${idx}`).value.trim();
      let desc = document.getElementById(`grid_desc_${idx}`).value.trim();
      let cat = document.getElementById(`grid_cat_${idx}`).value.trim();
      let gtin = document.getElementById(`grid_gtin_${idx}`).value.trim();

      let dbItem = this.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref.toUpperCase());
      if (dbItem) {
        if (dbItem.mfr !== mfr || dbItem.desc !== desc || dbItem.category !== cat || dbItem.gtin !== gtin) {
          dbItem.mfr = mfr;
          dbItem.desc = desc;
          dbItem.category = cat;
          dbItem.gtin = gtin;
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
  getItemDesc: (item) => (item && (item.desc || item.description || '').toString().trim()) || ''
};
