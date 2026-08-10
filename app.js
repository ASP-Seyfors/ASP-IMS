/* ======================================================================= */
/* ASP SCANNER APP - LOGIC & SCRIPTING (app.js)                            */
/* VERSION 1.7.0 | MULTI-SESSION AUDIT & TRACEABILITY ENGINE               */
/* ======================================================================= */

const defaultVendors = [
  "ARTHREX", "BARD", "BAXTER", "BD", "COOPER SURGICAL", "COOPERSURG", "COVIDIEN", 
  "ETHICON", "INTEGRA", "INTUITIVE", "MEDTRONIC", "SHARPOINT", "SMITH & NEPHEW", "STRYKER",   
  "+ Create New Vendor"
];

let db = JSON.parse(localStorage.getItem('asp_wh_db')) || [];
let vendors = JSON.parse(localStorage.getItem('asp_wh_vendors')) || defaultVendors;

let pendingNewItems = JSON.parse(localStorage.getItem('asp_pending_new_items')) || [];
let pendingFieldUpdates = JSON.parse(localStorage.getItem('asp_pending_updates')) || [];
let sessionScannedObjects = JSON.parse(localStorage.getItem('asp_session_scanned_objects')) || [];

// Manifest Reconciliation State
let isManifestEnabled = false;
let expectedManifest = JSON.parse(localStorage.getItem('asp_active_manifest')) || [];

// Multi-Session Audit State
let parsedAuditSessions = [];

let currentItemAction = "Inventory";
let visibleScanLines = 1;
let isSessionActive = false;
let currentUserName = localStorage.getItem('asp_user_name') || "";
let currentSessionName = localStorage.getItem('asp_session_name') || "";
let currentOrderNum = localStorage.getItem('asp_order_num') || "";
let currentWorkflowType = localStorage.getItem('asp_workflow_type') || "Receiving";
let sessionStartStr = localStorage.getItem('asp_session_start_str') || "";
let sessionDateStr = localStorage.getItem('asp_session_date_str') || "";

let currentMatchedItem = null;
let pendingUpdates = {};

let html5QrCode = null;
let isCameraActive = false;
let scanCooldown = false;

/* --- DATABASE INITIALIZATION & PREDICTIVE TEXT --- */

window.getItemSku = function(item) {
  if (!item) return '';
  return (item.sku || item.ref || '').toString().trim().toUpperCase();
}

window.getItemVendor = function(item) {
  if (!item) return '';
  return (item.mfr || item.vendor || item.manufacturer || '').toString().trim();
}

window.getItemDesc = function(item) {
  if (!item) return '';
  return (item.desc || item.description || '').toString().trim();
}

window.populateRefDatalist = function() {
  const datalist = document.getElementById('dbRefs');
  if (!datalist) return;
  datalist.innerHTML = '';
  db.forEach(item => {
    let opt = document.createElement('option');
    opt.value = getItemSku(item);
    datalist.appendChild(opt);
  });
}

window.populateVendors = function() {
  const sel = document.getElementById('vendorSelect');
  if (!sel) return;
  sel.innerHTML = '';
  vendors.forEach(v => {
    let opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  evaluateFieldAttention();
}

window.loadMasterDatabase = async function() {
  try {
    const response = await fetch('database.json');
    if (response.ok) {
      const jsonContent = await response.json();
      let loadedItems = Array.isArray(jsonContent) ? jsonContent : (jsonContent.items || []);
      let loadedVendors = jsonContent.vendors || defaultVendors;

      if (loadedItems.length > 0) {
        db = loadedItems;
        localStorage.setItem('asp_wh_db', JSON.stringify(db));
        populateRefDatalist();
      }

      if (loadedVendors.length > 0) {
        vendors = loadedVendors;
        localStorage.setItem('asp_wh_vendors', JSON.stringify(vendors));
        populateVendors();
      }
      runMasterLookup();
    } else {
      console.warn("Notice: External database.json not found or returned an error.");
      populateRefDatalist();
    }
  } catch (err) {
    console.error("Database parsing error:", err);
  }
}

/* --- MANIFEST PRE-LOAD & RECONCILIATION LOGIC --- */

window.addManifestRow = function(refVal = '', qtyVal = 1, isRes = false, tagVal = '', resQtyVal = 1) {
  const container = document.getElementById('manifestRowsContainer');
  if (!container) return;

  const rowIdx = container.children.length;
  const div = document.createElement('div');
  div.className = 'manifest-row';
  div.id = `manifestRow_${rowIdx}`;

  div.innerHTML = `
    <div style="display:flex; gap:6px; align-items:center;">
      <input type="text" class="manifest-ref-input" placeholder="REF / SKU" value="${refVal}" oninput="this.value = this.value.toUpperCase();" style="flex:2;">
      <input type="number" class="manifest-qty-input" placeholder="Qty" value="${qtyVal}" min="1" style="flex:1;">
      <button class="btn-small btn-cancel" onclick="this.parentElement.parentElement.remove()" style="padding:4px 8px;">✕</button>
    </div>
    <div style="margin-top:6px;">
      <label style="font-size:0.8rem; font-weight:bold; cursor:pointer;">
        <input type="checkbox" class="manifest-res-chk" onchange="toggleManifestResRow(${rowIdx})" ${isRes ? 'checked' : ''}> ☐ Reserved for Customer
      </label>
    </div>
    <div class="manifest-subrow" id="manifestResSubrow_${rowIdx}" style="display:${isRes ? 'flex' : 'none'};">
      <input type="text" class="manifest-tag-input" placeholder="Customer Tag" value="${tagVal}" style="flex:2;">
      <input type="number" class="manifest-resqty-input" placeholder="Res Qty" value="${resQtyVal}" min="1" style="flex:1;">
    </div>
  `;
  container.appendChild(div);
};

window.toggleManifestResRow = function(idx) {
  const row = document.getElementById(`manifestRow_${idx}`);
  if (!row) return;
  const chk = row.querySelector('.manifest-res-chk');
  const subrow = document.getElementById(`manifestResSubrow_${idx}`);
  if (chk && subrow) {
    subrow.style.display = chk.checked ? 'flex' : 'none';
  }
};

window.scanDocumentOCR = function(event) {
  if (event.target.files.length === 0) return;
  const file = event.target.files[0];
  alert("Processing document image with experimental OCR... Please wait a few seconds.");

  Tesseract.recognize(file, 'eng')
    .then(({ data: { text } }) => {
      let lines = text.split('\n');
      let foundMatches = 0;

      lines.forEach(line => {
        let words = line.toUpperCase().split(/\s+/);
        words.forEach(word => {
          let cleanWord = word.replace(/[^A-Z0-9-]/g, '');
          let match = db.find(i => getItemSku(i) === cleanWord);
          if (match) {
            addManifestRow(cleanWord, 1);
            foundMatches++;
          }
        });
      });

      if (foundMatches > 0) {
        alert(`OCR Scan Complete: Pre-filled ${foundMatches} recognized REF(s) from document! Please verify quantities.`);
      } else {
        alert("OCR Scan Complete: No known database REFs detected in image. Please add rows manually.");
      }
      event.target.value = '';
    })
    .catch(err => {
      alert("OCR Error: " + err.message);
      event.target.value = '';
    });
};

window.readManifestDataFromUI = function() {
  const container = document.getElementById('manifestRowsContainer');
  if (!container) return [];

  let list = [];
  const rows = container.querySelectorAll('.manifest-row');
  rows.forEach(row => {
    let ref = row.querySelector('.manifest-ref-input').value.trim().toUpperCase();
    let qty = parseInt(row.querySelector('.manifest-qty-input').value, 10) || 1;
    let chk = row.querySelector('.manifest-res-chk').checked;
    let tag = row.querySelector('.manifest-tag-input').value.trim();
    let resQty = parseInt(row.querySelector('.manifest-resqty-input').value, 10) || 1;

    if (ref) {
      list.push({
        ref: ref,
        expectedQty: qty,
        isReserved: chk,
        customerTag: chk ? tag : '',
        reservedQty: chk ? resQty : 0
      });
    }
  });
  return list;
};

window.goToManifestReview = function() {
  expectedManifest = readManifestDataFromUI();
  if (expectedManifest.length === 0) {
    alert("Please enter at least one expected item row.");
    return;
  }

  const container = document.getElementById('manifestReviewSummaryContainer');
  let totalExp = expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);

  let html = `<div style="margin-bottom:10px;"><strong>Total Expected Pieces:</strong> ${totalExp} across ${expectedManifest.length} unique REFs</div>`;
  html += `<table class="lot-table" style="width:100%;"><thead><tr><th>REF</th><th>Expected Qty</th><th>Customer Reserve</th></tr></thead><tbody>`;

  expectedManifest.forEach(item => {
    let resText = item.isReserved ? `${item.customerTag} (Qty: ${item.reservedQty})` : '--';
    html += `<tr><td><strong>${item.ref}</strong></td><td style="text-align:center;">${item.expectedQty}</td><td>${resText}</td></tr>`;
  });
  html += `</tbody></table>`;

  container.innerHTML = html;
  document.getElementById('screenManifestEntry').style.display = 'none';
  document.getElementById('screenManifestReview').style.display = 'block';
};

window.returnToManifestEdit = function() {
  document.getElementById('screenManifestReview').style.display = 'none';
  document.getElementById('screenManifestEntry').style.display = 'block';
};

window.cancelManifestEntry = function() {
  document.getElementById('screenManifestEntry').style.display = 'none';
  document.getElementById('screenSetup').style.display = 'block';
};

window.confirmManifestAndStart = function() {
  localStorage.setItem('asp_active_manifest', JSON.stringify(expectedManifest));
  document.getElementById('screenManifestReview').style.display = 'none';
  document.getElementById('screenScanning').style.display = 'block';
  updateManifestProgressUI();
};

window.updateManifestProgressUI = function() {
  const banner = document.getElementById('manifestProgressBanner');
  if (!banner || !isManifestEnabled || expectedManifest.length === 0) {
    if (banner) banner.style.display = 'none';
    return;
  }

  banner.style.display = 'block';
  let totalExpected = expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);
  let totalScanned = sessionScannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);

  document.getElementById('manifestScannedQty').textContent = totalScanned;
  document.getElementById('manifestTotalQty').textContent = totalExpected;
};

/* --- MULTI-SESSION AUDIT & TRACEABILITY ENGINE --- */

window.openAuditHub = function() {
  document.getElementById('screenSetup').style.display = 'none';
  document.getElementById('screenAuditHub').style.display = 'block';
};

window.closeAuditHub = function() {
  document.getElementById('screenAuditHub').style.display = 'none';
  document.getElementById('screenSetup').style.display = 'block';
};

window.processAuditFiles = async function(event) {
  const files = event.target.files;
  if (files.length === 0) return;

  parsedAuditSessions = [];
  let filePromises = Array.from(files).map(file => {
    return new Promise((resolve) => {
      let reader = new FileReader();
      reader.onload = (e) => {
        let text = e.target.result;
        let sessionData = parseTXTExportContent(text, file.name);
        if (sessionData) parsedAuditSessions.push(sessionData);
        resolve();
      };
      reader.readAsText(file);
    });
  });

  await Promise.all(filePromises);

  if (parsedAuditSessions.length > 0) {
    renderAuditPreviewUI();
    document.getElementById('auditResultsContainer').style.display = 'block';
  } else {
    alert("Could not parse valid session logs from selected files.");
  }
};

function parseTXTExportContent(text, filename) {
  let sessionName = filename;
  let workflow = "Unknown";
  let date = "Unknown";
  let user = "N/A";
  let items = [];

  let lines = text.split('\n');
  let currentRef = "";
  let currentTag = "";

  lines.forEach(line => {
    let trim = line.trim();
    if (trim.includes("ASP SCANNER APP SUMMARY EXPORT - ")) {
      sessionName = trim.replace("ASP SCANNER APP SUMMARY EXPORT - ", "").trim();
    } else if (trim.startsWith("Scanned By:")) {
      user = trim.replace("Scanned By:", "").trim();
    } else if (trim.startsWith("Workflow Process:")) {
      workflow = trim.replace("Workflow Process:", "").trim();
    } else if (trim.startsWith("Scanned Date:")) {
      date = trim.replace("Scanned Date:", "").trim();
    } else if (trim.startsWith("[") && trim.includes("REF:")) {
      currentRef = trim.substring(trim.indexOf("REF:") + 4).trim();
    } else if (trim.startsWith("| Customer Tag:")) {
      currentTag = trim.substring(trim.indexOf("Customer Tag:") + 15).replace(/\(Qty: \d+\)/, '').trim();
    } else if (trim.startsWith("- Lot:")) {
      let lotMatch = trim.match(/- Lot:\s*([^|]+)\|\s*Exp:\s*([^|]+)\|\s*Qty:\s*(\d+)/);
      if (lotMatch && currentRef) {
        items.push({
          ref: currentRef,
          lot: lotMatch[1].trim(),
          exp: lotMatch[2].trim(),
          qty: parseInt(lotMatch[3], 10) || 1,
          customerTag: currentTag,
          workflow: workflow,
          sessionName: sessionName,
          date: date,
          user: user
        });
      }
    }
  });

  return items.length > 0 ? { sessionName, workflow, date, user, items } : null;
}

function compileTraceabilityData() {
  let lotTraceMap = {};
  let totalItemsScanned = 0;
  let uniqueRefs = new Set();

  parsedAuditSessions.forEach(session => {
    session.items.forEach(item => {
      uniqueRefs.add(item.ref);
      totalItemsScanned += item.qty;

      let key = `${item.ref}_${item.lot}`;
      if (!lotTraceMap[key]) {
        lotTraceMap[key] = {
          ref: item.ref,
          lot: item.lot,
          exp: item.exp,
          inboundQty: 0,
          reservedQty: 0,
          outboundQty: 0,
          timeline: []
        };
      }

      if (item.workflow.includes('Receiving')) lotTraceMap[key].inboundQty += item.qty;
      if (item.workflow.includes('Reserving')) lotTraceMap[key].reservedQty += item.qty;
      if (item.workflow.includes('Packing')) lotTraceMap[key].outboundQty += item.qty;

      lotTraceMap[key].timeline.push({
        date: item.date,
        workflow: item.workflow,
        qty: item.qty,
        sessionName: item.sessionName,
        customerTag: item.customerTag,
        user: item.user
      });
    });
  });

  return { lotTraceMap, totalItemsScanned, uniqueRefsCount: uniqueRefs.size };
}

function renderAuditPreviewUI() {
  const container = document.getElementById('auditPreviewContent');
  const { lotTraceMap, totalItemsScanned, uniqueRefsCount } = compileTraceabilityData();

  let html = `
    <div class="audit-card" style="background-color:#e3f2fd;">
      <h3>Audit Scope: ${parsedAuditSessions.length} Sessions Processed</h3>
      <div><strong>Total Unique REFs:</strong> ${uniqueRefsCount} | <strong>Total Units Handled:</strong> ${totalItemsScanned}</div>
    </div>
  `;

  for (let key in lotTraceMap) {
    let trace = lotTraceMap[key];
    let isReconciled = (trace.inboundQty === trace.outboundQty && trace.inboundQty > 0);
    let badgeClass = isReconciled ? 'badge-match' : 'badge-warn';
    let statusText = isReconciled ? '✓ Reconciled' : '⚠️ Pending / Discrepancy';

    html += `
      <div class="audit-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:1.05rem;">REF: ${trace.ref} (Lot: ${trace.lot})</strong>
          <span class="badge-info ${badgeClass}">${statusText}</span>
        </div>
        <div style="font-size:0.85rem; color:#555; margin: 4px 0;">Expiration: ${trace.exp}</div>
        <div style="font-size:0.85rem; margin-bottom:6px;">
          Inbound: <strong>${trace.inboundQty}</strong> | Reserved: <strong>${trace.reservedQty}</strong> | Outbound: <strong>${trace.outboundQty}</strong>
        </div>
        <div style="font-size:0.8rem; background:#f5f5f5; padding:6px; border-radius:3px;">
          <strong>Chain of Custody Events:</strong><br>
    `;

    trace.timeline.forEach(event => {
      let tagStr = event.customerTag ? ` (Tag: ${event.customerTag})` : '';
      html += `&nbsp;&nbsp;• [${event.date}] ${event.workflow}: ${event.qty} unit(s) via <em>${event.sessionName}</em>${tagStr}<br>`;
    });

    html += `</div></div>`;
  }

  container.innerHTML = html;
}

window.executeAuditExport = function() {
  const val = document.getElementById('auditExportDropdown').value;
  if (!val) {
    alert("Please select an audit export format.");
    return;
  }

  const { lotTraceMap, totalItemsScanned, uniqueRefsCount } = compileTraceabilityData();
  const filename = `MASTER_WEEKLY_AUDIT_TRACEABILITY_${sessionDateStr}.${val}`;

  let reportText = [
    `================================================================================`,
    `ASP MASTER WEEKLY TRACEABILITY & AUDIT SUMMARY`,
    `Generated Date: ${sessionDateStr}`,
    `Total Uploaded Sessions: ${parsedAuditSessions.length}`,
    `Total Unique REFs: ${uniqueRefsCount}`,
    `Total Units Handled: ${totalItemsScanned}`,
    `================================================================================\n`,
    `--- LOT-LEVEL CHAIN OF CUSTODY TRACEABILITY ---\n`
  ];

  for (let key in lotTraceMap) {
    let trace = lotTraceMap[key];
    reportText.push(`[REF: ${trace.ref}] | LOT: ${trace.lot} | EXP: ${trace.exp}`);
    reportText.push(`  | Total Inbound: ${trace.inboundQty} | Total Reserved: ${trace.reservedQty} | Total Outbound: ${trace.outboundQty}`);
    reportText.push(`  | Timeline Chain of Custody:`);
    trace.timeline.forEach(event => {
      let tagStr = event.customerTag ? ` (Tag: ${event.customerTag})` : '';
      reportText.push(`    - [${event.date}] ${event.workflow}: ${event.qty} unit(s) [Session: ${event.sessionName}]${tagStr} (User: ${event.user})`);
    });
    reportText.push(``);
  }

  reportText.push(`================================================================================\nEND OF MASTER TRACEABILITY AUDIT\n================================================================================`);
  let fullText = reportText.join('\n');

  if (val === 'pdf') {
    let printWin = window.open('', '_blank');
    if (printWin) {
      let html = `<html><head><title>${filename}</title><style>body{font-family:monospace; font-size:12px; padding:20px; white-space:pre-wrap;}</style></head><body>${fullText}</body></html>`;
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.title = filename;
      printWin.document.close();
      setTimeout(() => { printWin.focus(); printWin.print(); }, 500);
    }
  } else {
    triggerShareOrDownload(fullText, filename, 'text/plain');
  }
};

/* --- LOOKUP & MATCHING LOGIC --- */

window.findDatabaseMatch = function(gtinVal, refVal) {
  if (!db || db.length === 0) return null;
  let cleanGtin = (gtinVal || '').replace(/^(01|\(01\))/, '').trim();
  let cleanRef = (refVal || '').trim().toUpperCase();

  if (cleanGtin) {
    let match = db.find(i => {
      let dbGtin = (i.gtin || '').toString().trim();
      return dbGtin && (dbGtin === cleanGtin || dbGtin.replace(/^0+/, '') === cleanGtin.replace(/^0+/, ''));
    });
    if (match) return match;
  }
  if (cleanRef) {
    let match = db.find(i => getItemSku(i) === cleanRef);
    if (match) return match;
  }
  return null;
}

window.runMasterLookup = function() {
  let curRef = document.getElementById('refInput').value.trim().toUpperCase();
  let curGtin = document.getElementById('gtinInput').value.trim();
  let match = findDatabaseMatch(curGtin, curRef);

  if (match) {
    currentMatchedItem = match;
    if (curGtin && match.gtin && match.gtin !== curGtin) {
      pendingUpdates['gtin'] = curGtin;
    }
    populateDisplay(match);
    let prevBox = document.getElementById('liveMatchPreview');
    let prevText = document.getElementById('prevDescText');
    if (prevBox && prevText) {
      prevText.textContent = `${getItemSku(match)} - ${getItemDesc(match)}`;
      prevBox.style.display = 'block';
    }
  } else {
    currentMatchedItem = null;
    hideAllConfirmButtons();
    let prevBox = document.getElementById('liveMatchPreview');
    if (prevBox) prevBox.style.display = 'none';
  }
  evaluateFieldAttention();
}

window.populateDisplay = function(item) {
  let itemSku = getItemSku(item);
  let itemVendor = getItemVendor(item);

  if (itemSku && !document.getElementById('refInput').value.trim()) {
    document.getElementById('refInput').value = itemSku;
  }
  if (item.gtin && !document.getElementById('gtinInput').value.trim() && !document.getElementById('chkNaGtin').checked) {
    document.getElementById('gtinInput').value = item.gtin;
  }
  if (itemVendor) {
    let vendorSelect = document.getElementById('vendorSelect');
    let targetOption = Array.from(vendorSelect.options).find(opt => opt.value.trim().toLowerCase() === itemVendor.trim().toLowerCase());
    if (targetOption) {
      vendorSelect.value = targetOption.value;
    } else {
      vendors.splice(vendors.length - 1, 0, itemVendor);
      localStorage.setItem('asp_wh_vendors', JSON.stringify(vendors));
      populateVendors();
      vendorSelect.value = itemVendor;
    }
  }
  evaluateFieldAttention();
}

/* --- UI FIELD MANAGEMENT & AUTO-FORMATTING --- */

window.formatExpDate = function(inputEl) {
    let val = inputEl.value.replace(/\D/g, ''); 
    if (!val) return;
    if(val.length >= 8) {
        let mm = val.substring(0,2);
        let dd = val.substring(2,4);
        let yyyy = val.substring(4,8);
        if (parseInt(val.substring(0,4)) > 1900) {
            yyyy = val.substring(0,4);
            mm = val.substring(4,6);
            dd = val.substring(6,8);
        }
        inputEl.value = `${yyyy}-${mm}-${dd}`;
    } else if (val.length === 6) {
        let mm = val.substring(0,2);
        let dd = val.substring(2,4);
        let yy = val.substring(4,6);
        let year = parseInt(yy) < 50 ? (2000 + parseInt(yy)) : (1900 + parseInt(yy));
        inputEl.value = `${year}-${mm}-${dd}`;
    }
    evaluateFieldAttention();
};

window.toggleNA = function(fieldId, chkId) {
  let field = document.getElementById(fieldId);
  let chk = document.getElementById(chkId);
  if (!field || !chk) return;
  
  if (chk.checked) {
    field.value = "N/A";
    field.readOnly = true;
    field.classList.remove('needs-attention');
  } else {
    field.value = "";
    field.readOnly = false;
    field.classList.add('needs-attention');
  }
  evaluateFieldAttention();
}

window.toggleItemNote = function() {
  let chk = document.getElementById('chkItemNote');
  let row = document.getElementById('rowItemNote');
  if (chk && row) {
    row.style.display = chk.checked ? 'flex' : 'none';
    if (!chk.checked) document.getElementById('itemNoteInput').value = "";
  }
}

window.toggleSessionNote = function() {
  let chk = document.getElementById('chkSessionNote');
  let row = document.getElementById('rowSessionNote');
  if (chk && row) {
    row.style.display = chk.checked ? 'block' : 'none';
    if (!chk.checked) document.getElementById('sessionNoteInput').value = "";
  }
}

window.evaluateFieldAttention = function() {
  const fields = [
    { el: document.getElementById('gtinInput'), chk: document.getElementById('chkNaGtin') },
    { el: document.getElementById('lotInput'), chk: document.getElementById('chkNaLot') },
    { el: document.getElementById('expInput'), chk: document.getElementById('chkNaExp') },
    { el: document.getElementById('refInput'), chk: null },
    { el: document.getElementById('vendorSelect'), chk: null }
  ];

  fields.forEach(obj => {
    if (!obj.el) return;
    if (obj.chk && obj.chk.checked) {
      obj.el.classList.remove('needs-attention');
    } else if (!obj.el.value.trim()) {
      obj.el.classList.add('needs-attention');
    } else {
      obj.el.classList.remove('needs-attention');
    }
  });
  updateCameraOverlayStatus();
}

window.updateCameraOverlayStatus = function() {
  const hasGtin = document.getElementById('gtinInput').value.trim() !== '' || document.getElementById('chkNaGtin').checked;
  const hasLot = document.getElementById('lotInput').value.trim() !== '' || document.getElementById('chkNaLot').checked;
  const hasExp = document.getElementById('expInput').value.trim() !== '' || document.getElementById('chkNaExp').checked;

  let tagGtin = document.getElementById('tagGtin');
  let tagLot = document.getElementById('tagLot');
  let tagExp = document.getElementById('tagExp');

  if (tagGtin) tagGtin.classList.toggle('captured', hasGtin);
  if (tagLot) tagLot.classList.toggle('captured', hasLot);
  if (tagExp) tagExp.classList.toggle('captured', hasExp);
}

window.setItemAction = function(act) {
  currentItemAction = act;
  let invBtn = document.getElementById('actBtnInv');
  let resBtn = document.getElementById('actBtnRes');
  if (invBtn) invBtn.className = 'action-btn' + (act === 'Inventory' ? ' selected-inv' : '');
  if (resBtn) resBtn.className = 'action-btn' + (act === 'Reserved' ? ' selected-res' : '');

  let tagRow = document.getElementById('rowCustomerTag');
  if (tagRow && currentWorkflowType.includes('Receiving & Reserving')) {
    tagRow.style.display = (act === 'Reserved') ? 'flex' : 'none';
  }
}

window.handleVendorSelect = function(val) {
  if (val === "+ Create New Vendor") {
    let newV = prompt("Enter new Manufacturer/Vendor name:");
    if (newV) {
      vendors.splice(vendors.length - 1, 0, newV);
      localStorage.setItem('asp_wh_vendors', JSON.stringify(vendors));
      populateVendors();
      document.getElementById('vendorSelect').value = newV;
    }
  } else if (currentMatchedItem && getItemVendor(currentMatchedItem).toLowerCase() !== val.toLowerCase()) {
    let btnMfr = document.getElementById('btnConfirmMfr');
    if (btnMfr) btnMfr.style.display = 'inline-block';
  }
  evaluateFieldAttention();
}

/* --- SESSION MANAGEMENT --- */

window.startSession = function() {
  const uName = document.getElementById('userNameInput').value.trim();
  const sName = document.getElementById('sessionNameInput').value.trim();
  const oNum = document.getElementById('orderNumInput').value.trim();
  const wType = document.getElementById('workflowTypeSelect').value;
  const chkManifest = document.getElementById('chkPreloadManifest').checked;

  if (!sName) {
    alert("Please enter a Session Name before starting.");
    return;
  }

  isSessionActive = true;
  isManifestEnabled = chkManifest;
  localStorage.setItem('asp_session_is_active', 'true');
  localStorage.setItem('asp_manifest_enabled', isManifestEnabled ? 'true' : 'false');

  const nowObj = new Date();
  let yyyy = nowObj.getFullYear();
  let mm = String(nowObj.getMonth() + 1).padStart(2, '0');
  let dd = String(nowObj.getDate()).padStart(2, '0');
  sessionDateStr = `${yyyy}.${mm}.${dd}`;
  sessionStartStr = nowObj.toLocaleTimeString();

  currentUserName = uName || "N/A";
  currentSessionName = sName;
  currentOrderNum = oNum;
  currentWorkflowType = wType;

  localStorage.setItem('asp_user_name', currentUserName);
  localStorage.setItem('asp_session_name', currentSessionName);
  localStorage.setItem('asp_order_num', currentOrderNum);
  localStorage.setItem('asp_workflow_type', currentWorkflowType);
  localStorage.setItem('asp_session_start_str', sessionStartStr);
  localStorage.setItem('asp_session_date_str', sessionDateStr);

  sessionScannedObjects = [];
  localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));

  updateHeaderBanners();

  if (isManifestEnabled) {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('manifestRowsContainer').innerHTML = '';
    addManifestRow();
    document.getElementById('screenManifestEntry').style.display = 'block';
  } else {
    expectedManifest = [];
    localStorage.setItem('asp_active_manifest', JSON.stringify([]));
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
    updateManifestProgressUI();
  }

  let destRow = document.getElementById('rowItemDestination');
  let tagRow = document.getElementById('rowCustomerTag');
  
  if (currentWorkflowType.includes('Receiving & Reserving')) {
    if (destRow) destRow.style.display = 'flex';
    if (tagRow) tagRow.style.display = currentItemAction === 'Reserved' ? 'flex' : 'none';
  } else if (currentWorkflowType.includes('Reserving')) {
    if (destRow) destRow.style.display = 'none';
    if (tagRow) tagRow.style.display = 'flex';
    currentItemAction = 'Reserved';
  } else if (currentWorkflowType.includes('Packing')) {
    if (destRow) destRow.style.display = 'none';
    if (tagRow) tagRow.style.display = 'none';
    currentItemAction = 'Pack & Ship';
  } else {
    if (destRow) destRow.style.display = 'none';
    if (tagRow) tagRow.style.display = 'none';
    currentItemAction = 'Inventory';
  }

  resetScanLinesAndFields();
}

window.updateHeaderBanners = function() {
  let titleStr = currentSessionName;
  if (currentOrderNum) titleStr += ` (${currentOrderNum})`;

  document.getElementById('hdrTitle').textContent = titleStr;
  document.getElementById('hdrUser').textContent = currentUserName || 'N/A';
  document.getElementById('hdrDate').textContent = sessionDateStr;
  document.getElementById('hdrTime').textContent = sessionStartStr;
  document.getElementById('hdrWorkflow').textContent = currentWorkflowType;

  let hdrTitleRev = document.getElementById('hdrTitleRev');
  if (hdrTitleRev) {
      hdrTitleRev.textContent = titleStr;
      document.getElementById('hdrUserRev').textContent = currentUserName || 'N/A';
      document.getElementById('hdrDateRev').textContent = sessionDateStr;
      document.getElementById('hdrTimeRev').textContent = sessionStartStr;
      document.getElementById('hdrWorkflowRev').textContent = currentWorkflowType;
  }

  let hdrTitleSum = document.getElementById('hdrTitleSum');
  if (hdrTitleSum) {
    hdrTitleSum.textContent = titleStr;
    document.getElementById('hdrUserSum').textContent = currentUserName || 'N/A';
    document.getElementById('hdrDateSum').textContent = sessionDateStr;
    document.getElementById('hdrTimeSum').textContent = sessionStartStr;
    document.getElementById('hdrWorkflowSum').textContent = currentWorkflowType;
  }
}

window.checkSessionRecoveryState = function() {
  let storedActiveState = localStorage.getItem('asp_session_is_active');
  if (storedActiveState === 'true') {
    isSessionActive = true;
    isManifestEnabled = localStorage.getItem('asp_manifest_enabled') === 'true';
    expectedManifest = JSON.parse(localStorage.getItem('asp_active_manifest')) || [];
    
    updateHeaderBanners();
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenSummary').style.display = 'none';
    updateManifestProgressUI();

    let destRow = document.getElementById('rowItemDestination');
    let tagRow = document.getElementById('rowCustomerTag');
    
    if (currentWorkflowType.includes('Receiving & Reserving')) {
      if (destRow) destRow.style.display = 'flex';
      if (tagRow) tagRow.style.display = currentItemAction === 'Reserved' ? 'flex' : 'none';
    } else if (currentWorkflowType.includes('Reserving')) {
      if (destRow) destRow.style.display = 'none';
      if (tagRow) tagRow.style.display = 'flex';
      currentItemAction = 'Reserved';
    }
  }
}

window.cancelSession = function() {
  let confirmCancel = confirm("Are you sure you want to CANCEL this entire scanning session?\n\nAll items scanned during this session will be discarded.");
  if (!confirmCancel) return;

  isSessionActive = false;
  isManifestEnabled = false;
  localStorage.setItem('asp_session_is_active', 'false');
  localStorage.setItem('asp_manifest_enabled', 'false');
  sessionScannedObjects = [];
  expectedManifest = [];
  localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));
  localStorage.setItem('asp_active_manifest', JSON.stringify([]));

  if (isCameraActive) toggleCameraScanner();
  
  document.getElementById('sessionNoteInput').value = "";
  document.getElementById('chkSessionNote').checked = false;
  toggleSessionNote();

  document.getElementById('screenScanning').style.display = 'none';
  document.getElementById('screenReview').style.display = 'none';
  document.getElementById('screenSummary').style.display = 'none';
  document.getElementById('screenSetup').style.display = 'block';
}

window.completeSession = function() {
  let confirmClear = confirm("Are you ready to complete this session?\n\nMake sure you have saved or exported your data first. This will close the session and return you to the home screen.");
  if (!confirmClear) return;

  pendingNewItems = []; pendingFieldUpdates = [];
  localStorage.setItem('asp_pending_new_items', JSON.stringify([]));
  localStorage.setItem('asp_pending_updates', JSON.stringify([]));
  
  let sNoteInput = document.getElementById('sessionNoteInput');
  if(sNoteInput) sNoteInput.value = "";
  let chkSNote = document.getElementById('chkSessionNote');
  if(chkSNote) chkSNote.checked = false;
  toggleSessionNote();

  document.getElementById('screenSummary').style.display = 'none';
  document.getElementById('screenSetup').style.display = 'block';
  isSessionActive = false; 
  isManifestEnabled = false;
  localStorage.setItem('asp_session_is_active', 'false');
  localStorage.setItem('asp_manifest_enabled', 'false');
}

window.continueScanning = function() {
  try {
      resetScanLinesAndFields();
      document.getElementById('screenSummary').style.display = 'none';
      document.getElementById('screenScanning').style.display = 'block';
  } catch(e) {
      console.error(e);
  }
}

window.goToSummaryScreen = function() {
  if (isCameraActive) toggleCameraScanner();
  document.getElementById('screenScanning').style.display = 'none';
  document.getElementById('screenReview').style.display = 'none';
  updateSessionSummaryView();
  document.getElementById('screenSummary').style.display = 'block';
}

window.rescueLastSession = function() {
  let saved = JSON.parse(localStorage.getItem('asp_session_scanned_objects')) || [];
  if (saved.length === 0) {
    alert("No scanned items found in memory to rescue.");
    return;
  }
  sessionScannedObjects = saved;
  pendingNewItems = JSON.parse(localStorage.getItem('asp_pending_new_items')) || [];
  pendingFieldUpdates = JSON.parse(localStorage.getItem('asp_pending_updates')) || [];
  
  isManifestEnabled = localStorage.getItem('asp_manifest_enabled') === 'true';
  expectedManifest = JSON.parse(localStorage.getItem('asp_active_manifest')) || [];

  currentUserName = localStorage.getItem('asp_user_name') || "";
  currentSessionName = localStorage.getItem('asp_session_name') || "Rescued Session";
  currentOrderNum = localStorage.getItem('asp_order_num') || "";
  currentWorkflowType = localStorage.getItem('asp_workflow_type') || "Receiving";
  sessionStartStr = localStorage.getItem('asp_session_start_str') || "";
  sessionDateStr = localStorage.getItem('asp_session_date_str') || "";

  updateHeaderBanners();
  goToSummaryScreen();
}

/* --- BARCODE SCANNING & PARSING --- */

window.handleSuccessfulScan = function(decodedText) {
  if (scanCooldown) return;
  
  let cleanText = decodedText.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
  if (cleanText.length < 4) return;

  for (let i = 1; i <= 4; i++) {
    let existingVal = document.getElementById(`rawScan${i}`).value.trim();
    if (existingVal === cleanText) return;
  }

  let targetLine = 0;
  for (let i = 1; i <= 4; i++) {
    if (!document.getElementById(`rawScan${i}`).value.trim()) {
      targetLine = i;
      break;
    }
  }

  if (targetLine === 0 && visibleScanLines < 4) {
    addScanLine();
    targetLine = visibleScanLines;
  }

  if (targetLine > 0) {
    scanCooldown = true;
    
    let camBox = document.getElementById('cameraViewfinder');
    if (camBox) {
        camBox.classList.add('scan-success');
        setTimeout(() => { camBox.classList.remove('scan-success'); }, 450);
    }

    document.getElementById(`rawScan${targetLine}`).value = cleanText;
    processAllScans();

    let currentGtin = document.getElementById('gtinInput').value.trim() !== '' || document.getElementById('chkNaGtin').checked;
    let currentLot = document.getElementById('lotInput').value.trim() !== '' || document.getElementById('chkNaLot').checked;
    let currentExp = document.getElementById('expInput').value.trim() !== '' || document.getElementById('chkNaExp').checked;

    if (currentGtin && currentLot && currentExp) {
      if (isCameraActive) { setTimeout(() => { toggleCameraScanner(); }, 300); }
    } else if (visibleScanLines < 4) {
      addScanLine();
    }
    setTimeout(() => { scanCooldown = false; }, 600);
  }
}

window.scanImageFile = function(event) {
    if (event.target.files.length == 0) return;
    const file = event.target.files[0];
    
    const html5QrCode = new Html5Qrcode("cameraViewfinder");
    html5QrCode.scanFile(file, true)
        .then(decodedText => {
            handleSuccessfulScan(decodedText);
            event.target.value = ''; 
        })
        .catch(err => {
            alert("No barcode could be detected in this image. Please ensure the barcode is clear and in focus.");
            event.target.value = '';
        });
}

window.toggleCameraScanner = function() {
  const camContainer = document.getElementById('cameraContainer');
  const camBtn = document.getElementById('btnToggleCam');

  if (!isCameraActive) {
    camContainer.style.display = 'block';
    camBtn.textContent = '❌ Close Camera';
    camBtn.style.backgroundColor = '#c62828';
    isCameraActive = true;
    updateCameraOverlayStatus();

    setTimeout(() => {
      if (!isCameraActive) return;
      html5QrCode = new Html5Qrcode("cameraViewfinder");
      const qrConfig = { fps: 15, qrbox: { width: 320, height: 250 }, aspectRatio: 1.333333 };

      const onScanSuccess = (decodedText, decodedResult) => {
        handleSuccessfulScan(decodedText);
      };

      html5QrCode.start({ facingMode: "environment" }, qrConfig, onScanSuccess)
        .catch(err => {
          console.warn("Environment camera failed, attempting standard camera fallback...", err);
          html5QrCode.start({ facingMode: "user" }, qrConfig, onScanSuccess)
            .catch(fallbackErr => {
              alert("Unable to access camera: " + fallbackErr);
              toggleCameraScanner();
            });
        });
    }, 50);

  } else {
    if (html5QrCode) {
      html5QrCode.stop().then(() => {
        html5QrCode.clear();
        camContainer.style.display = 'none';
        camBtn.textContent = '📷 Open Camera';
        camBtn.style.backgroundColor = '#e65100';
        isCameraActive = false;
      }).catch(err => {
        camContainer.style.display = 'none';
        isCameraActive = false;
      });
    } else {
      camContainer.style.display = 'none';
      isCameraActive = false;
    }
  }
}

window.addScanLine = function() {
  if (visibleScanLines < 4) {
    visibleScanLines++;
    document.getElementById(`rowScan${visibleScanLines}`).style.display = 'flex';
  }
  if (visibleScanLines === 4) {
    document.getElementById('btnAddLine').style.display = 'none';
  }
}

window.resetScanLines = function() {
  visibleScanLines = 1;
  document.getElementById('rawScan1').value = '';
  document.getElementById('rawScan2').value = '';
  document.getElementById('rawScan3').value = '';
  document.getElementById('rawScan4').value = '';

  document.getElementById('rowScan2').style.display = 'none';
  document.getElementById('rowScan3').style.display = 'none';
  document.getElementById('rowScan4').style.display = 'none';
  document.getElementById('btnAddLine').style.display = 'inline-block';
}

window.resetScanLinesAndFields = function() {
  try {
      resetScanLines();
      
      ['gtin', 'lot', 'exp'].forEach(prefix => {
        let chk = document.getElementById(`chkNa${prefix.charAt(0).toUpperCase() + prefix.slice(1)}`);
        if(chk) chk.checked = false;
        let field = document.getElementById(`${prefix}Input`);
        if(field) {
            field.value = '';
            field.readOnly = false;
        }
      });

      document.getElementById('refInput').value = '';
      document.getElementById('qtyInput').value = '1';
      
      let tagInput = document.getElementById('customerTagInput');
      if (tagInput) tagInput.value = '';

      let chkNote = document.getElementById('chkItemNote');
      if (chkNote) {
          chkNote.checked = false;
          toggleItemNote();
      }

      currentMatchedItem = null;
      pendingUpdates = {};
      hideAllConfirmButtons();
      
      let prevBox = document.getElementById('liveMatchPreview');
      if (prevBox) prevBox.style.display = 'none';

      evaluateFieldAttention();
      document.getElementById('refInput').focus();
  } catch(e) {
      console.error(e);
  }
}

window.processAllScans = function() {
  let lines = [
    document.getElementById('rawScan1').value,
    document.getElementById('rawScan2').value,
    document.getElementById('rawScan3').value,
    document.getElementById('rawScan4').value
  ];

  let gtin = "", lot = "", exp = "";

  lines.forEach(rawLine => {
    if (!rawLine.trim()) return;
    let clean = rawLine.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\(\)]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    let idx = 0;

    while (idx < clean.length) {
      if (clean.substring(idx, idx + 2) === "17" && clean.length - idx >= 8 && /^\d{6}$/.test(clean.substring(idx + 2, idx + 8))) {
        if (!exp) {
          let rawExp = clean.substring(idx + 2, idx + 8);
          let yy = parseInt(rawExp.substring(0, 2), 10);
          let mm = rawExp.substring(2, 4);
          let dd = rawExp.substring(4, 6);
          let year = yy < 50 ? (2000 + yy) : (1900 + yy);
          exp = `${year}-${mm}-${dd}`;
        }
        idx += 8;
      }
      else if (clean.substring(idx, idx + 2) === "01" && clean.length - idx >= 16 && /^\d{14}$/.test(clean.substring(idx + 2, idx + 16))) {
        if (!gtin) gtin = clean.substring(idx + 2, idx + 16);
        idx += 16;
      }
      else if (clean.substring(idx, idx + 2) === "10") {
        if (!lot) { lot = clean.substring(idx + 2); }
        break;
      }
      else if (/^\d{12,14}$/.test(clean)) {
        if (!gtin) gtin = clean;
        break;
      }
      else {
        idx++;
      }
    }
  });

  if (gtin && !document.getElementById('chkNaGtin').checked) document.getElementById('gtinInput').value = gtin;
  if (lot && !document.getElementById('chkNaLot').checked) document.getElementById('lotInput').value = lot;
  if (exp && !document.getElementById('chkNaExp').checked) document.getElementById('expInput').value = exp;

  runMasterLookup();
}

/* --- REVIEW & SAVE ITEM --- */

window.confirmFieldUpdate = function(field) {
  if (!currentMatchedItem) return;
  if (field === 'gtin' && pendingUpdates['gtin']) {
    currentMatchedItem.gtin = pendingUpdates['gtin'];
    document.getElementById('btnConfirmGtin').style.display = 'none';
    document.getElementById('gtinDiffBanner').style.display = 'none';
    alert(`Database updated: GTIN ${pendingUpdates['gtin']} linked to REF ${getItemSku(currentMatchedItem)}!`);
  } else if (field === 'mfr') {
    let selectedMfr = document.getElementById('vendorSelect').value;
    currentMatchedItem.mfr = selectedMfr;
    currentMatchedItem.manufacturer = selectedMfr;
    document.getElementById('btnConfirmMfr').style.display = 'none';
    alert(`Database updated: Manufacturer updated for REF ${getItemSku(currentMatchedItem)}!`);
  }

  pendingFieldUpdates.push({
    ref: getItemSku(currentMatchedItem),
    field: field === 'gtin' ? 'GTIN' : 'Manufacturer',
    newValue: field === 'gtin' ? pendingUpdates['gtin'] : document.getElementById('vendorSelect').value,
    timestamp: new Date().toLocaleString()
  });
  localStorage.setItem('asp_pending_updates', JSON.stringify(pendingFieldUpdates));
  localStorage.setItem('asp_wh_db', JSON.stringify(db));
}

function hideAllConfirmButtons() {
  let btnGtin = document.getElementById('btnConfirmGtin');
  let btnMfr = document.getElementById('btnConfirmMfr');
  let diffBanner = document.getElementById('gtinDiffBanner');
  if (btnGtin) btnGtin.style.display = 'none';
  if (btnMfr) btnMfr.style.display = 'none';
  if (diffBanner) diffBanner.style.display = 'none';
}

window.goToReviewStage = function() {
  
  let expField = document.getElementById('expInput');
  if (expField && expField.value.trim() !== "" && !document.getElementById('chkNaExp').checked) {
      formatExpDate(expField);
  }

  const ref = document.getElementById('refInput').value.trim().toUpperCase();
  if (!ref) {
    alert("Please enter or scan a REF/SKU before continuing.");
    return;
  }

  const gtin = document.getElementById('gtinInput').value.trim();
  const lot = document.getElementById('lotInput').value.trim().toUpperCase();
  const exp = document.getElementById('expInput').value.trim();
  const vendor = document.getElementById('vendorSelect').value;
  const qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
  const cTag = document.getElementById('customerTagInput') ? document.getElementById('customerTagInput').value.trim() : '';
  const iNote = document.getElementById('itemNoteInput') ? document.getElementById('itemNoteInput').value.trim() : '';

  // Calculate Real-Time Progress Metrics for Verification Screen
  let revRefRow = document.getElementById('revRefProgressRow');
  let revTotalRow = document.getElementById('revTotalProgressRow');

  if (isManifestEnabled && expectedManifest.length > 0) {
    revRefRow.style.display = 'flex';
    revTotalRow.style.display = 'flex';

    let manifestItem = expectedManifest.find(i => i.ref === ref);
    let scannedRefQtySoFar = sessionScannedObjects
      .filter(i => i.ref === ref)
      .reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);

    let newTotalScannedForRef = scannedRefQtySoFar + qty;

    if (manifestItem) {
      document.getElementById('revRefProgress').textContent = `${newTotalScannedForRef} Scanned / ${manifestItem.expectedQty} Expected`;
    } else {
      document.getElementById('revRefProgress').innerHTML = `<span class="badge-info badge-alert">⚠️ Unexpected Item (Not on Manifest)</span>`;
    }

    let totalScannedOverall = sessionScannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0) + qty;
    let totalExpectedOverall = expectedManifest.reduce((acc, curr) => acc + curr.expectedQty, 0);

    document.getElementById('revTotalProgress').textContent = `${totalScannedOverall} / ${totalExpectedOverall} Total Order Items`;
  } else {
    revRefRow.style.display = 'none';
    revTotalRow.style.display = 'none';
  }

  document.getElementById('revRef').textContent = ref;
  document.getElementById('revGtin').textContent = gtin || '--';
  document.getElementById('revLot').textContent = lot || '--';
  document.getElementById('revExp').textContent = exp || '--';
  document.getElementById('revMfr').textContent = vendor;
  document.getElementById('revQty').textContent = qty;
  
  let revNoteRow = document.getElementById('revItemNoteRow');
  if (revNoteRow) {
      if(iNote) {
          revNoteRow.style.display = 'flex';
          document.getElementById('revItemNote').textContent = iNote;
      } else {
          revNoteRow.style.display = 'none';
      }
  }

  const desc = getItemDesc(currentMatchedItem) || "Navigate to vendor website for item description.";
  const price = (currentMatchedItem && currentMatchedItem.price) ? currentMatchedItem.price : "$0.00";

  document.getElementById('revDesc').textContent = desc;
  document.getElementById('revPrice').textContent = price;

  let revActionRow = document.getElementById('revActionRow');
  if (revActionRow) {
    if (currentWorkflowType.includes('Receiving & Reserving')) {
      revActionRow.style.display = 'flex';
      document.getElementById('revAction').textContent = currentItemAction;
    } else {
      revActionRow.style.display = 'none';
    }
  }

  let tagRow = document.getElementById('rowCustomerTag');
  let revTagRow = document.getElementById('revCustomerTagRow');
  if (tagRow && tagRow.style.display !== 'none') {
     revTagRow.style.display = 'flex';
     document.getElementById('revCustomerTag').textContent = cTag || 'NONE';
  } else {
     if (revTagRow) revTagRow.style.display = 'none';
  }

  let diffBanner = document.getElementById('gtinDiffBanner');
  let btnGtin = document.getElementById('btnConfirmGtin');

  if (currentMatchedItem && gtin && gtin !== "N/A" && currentMatchedItem.gtin !== gtin) {
    pendingUpdates['gtin'] = gtin;
    if (btnGtin) btnGtin.style.display = 'inline-block';
    if (diffBanner) {
      diffBanner.textContent = currentMatchedItem.gtin 
        ? `⚠️ Replace Saved GTIN (${currentMatchedItem.gtin}) with Scanned GTIN (${gtin})?` 
        : `[Link New GTIN: ${gtin}]`;
      diffBanner.style.display = 'block';
    }
  } else {
    if (btnGtin) btnGtin.style.display = 'none';
    if (diffBanner) diffBanner.style.display = 'none';
  }

  let btnMfr = document.getElementById('btnConfirmMfr');
  if (btnMfr) {
    let matchedVendor = getItemVendor(currentMatchedItem);
    btnMfr.style.display = (currentMatchedItem && matchedVendor.toLowerCase() !== vendor.toLowerCase()) ? 'inline-block' : 'none';
  }

  document.getElementById('screenScanning').style.display = 'none';
  document.getElementById('screenReview').style.display = 'block';
}

window.returnToEdit = function() {
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
}

window.cancelScannedItem = function() {
  let confirmDiscard = confirm("Are you sure you want to discard this scanned item?");
  if (confirmDiscard) {
    resetScanLinesAndFields();
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
  }
}

window.saveItemLog = function() {
  try {
    const gtin = document.getElementById('gtinInput').value.trim();
    const ref = document.getElementById('refInput').value.trim().toUpperCase();
    const lot = document.getElementById('lotInput').value.trim().toUpperCase();
    const exp = document.getElementById('expInput').value.trim();
    const vendor = document.getElementById('vendorSelect').value;
    const qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
    const cTag = document.getElementById('customerTagInput') ? document.getElementById('customerTagInput').value.trim() : '';
    const iNote = document.getElementById('itemNoteInput') ? document.getElementById('itemNoteInput').value.trim() : '';

    let isNewRef = false;
    const desc = getItemDesc(currentMatchedItem) || "Navigate to vendor website for item description.";
    const price = (currentMatchedItem && currentMatchedItem.price) ? currentMatchedItem.price : "$0.00";

    let rawBarcodesGathered = [];
    for (let i = 1; i <= 4; i++) {
      let val = document.getElementById(`rawScan${i}`).value.trim();
      if (val) {
        let cleanedRaw = val.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        rawBarcodesGathered.push(cleanedRaw);
      }
    }

    if (!currentMatchedItem && ref) {
      isNewRef = true;
      let newItem = { gtin: (gtin === "N/A" ? "" : gtin), sku: ref, ref: ref, desc: desc, price: "$0.00", mfr: vendor };
      db.push(newItem);
      localStorage.setItem('asp_wh_db', JSON.stringify(db));
      pendingNewItems.push(newItem);
      localStorage.setItem('asp_pending_new_items', JSON.stringify(pendingNewItems));
    }

    let effectiveTag = currentItemAction;
    if (!currentWorkflowType.includes('Receiving & Reserving')) {
      if (currentWorkflowType.includes('Reserving')) effectiveTag = 'Reserved';
      else if (currentWorkflowType.includes('Packing')) effectiveTag = 'Pack & Ship';
      else effectiveTag = 'Inventory';
    }

    sessionScannedObjects.push({
      actionTag: effectiveTag,
      gtin: gtin || (currentMatchedItem ? currentMatchedItem.gtin : ''),
      ref: ref || 'UNREGISTERED',
      lot: lot || 'NO_LOT',
      exp: exp || 'NO_EXP',
      mfr: vendor,
      desc: desc,
      price: price,
      qty: qty,
      rawScanLines: rawBarcodesGathered,
      isNew: isNewRef,
      customerTag: (effectiveTag === 'Reserved' ? cTag : ''),
      itemNote: iNote
    });
    localStorage.setItem('asp_session_scanned_objects', JSON.stringify(sessionScannedObjects));

    resetScanLinesAndFields();
    updateManifestProgressUI();
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';

  } catch (err) {
    alert("Error saving item: " + err.message);
  }
}

/* --- EXPORT & SUMMARY LOGIC --- */

function updateSessionSummaryView() {
  let container = document.getElementById('summaryListContainer');
  container.innerHTML = '';

  if (sessionScannedObjects.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 14px; color: #555;">No items scanned in this session yet.</div>';
    return;
  }

  sessionScannedObjects.forEach((item, index) => {
    let div = document.createElement('div');
    div.className = 'summary-item-card';

    let topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.width = '100%';

    let statusIcon = '📦';
    if (item.actionTag === 'Reserved') statusIcon = '🚩';
    if (item.actionTag === 'Pack & Ship') statusIcon = '🖐️';

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
}

function generateExactFilename(extension = "txt") {
  let sName = currentSessionName || "Session";
  let oNum = currentOrderNum;
  let wType = currentWorkflowType || "Receiving";
  let prefix = sName;
  if (oNum) prefix += ` (${oNum})`;

  return `${sessionDateStr} - ${prefix} - ${wType}.${extension}`;
}

window.cleanGtinValue = function(val) {
  if (!val) return 'N/A';
  return val.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() || 'N/A';
};

window.executeAction = function() {
    const selectEl = document.getElementById('exportDropdown');
    const val = selectEl.value;

    if (!val) {
        alert("Please select an action from the dropdown first.");
        return;
    }

    if (val === 'continue') {
        continueScanning();
    } else if (val === 'cancel') {
        cancelSession();
    } else if (val === 'pdf') {
        exportData('pdf');
    } else if (val === 'txt') {
        exportData('txt');
    } else if (val === 'complete') {
        completeSession();
    }

    setTimeout(() => { selectEl.value = ""; }, 500);
};

/* --- CONDITIONAL EXPORT BUILDERS --- */

function buildTXTReportString() {
  let scannedMap = {};

  sessionScannedObjects.forEach(item => {
    let rKey = item.ref;
    let cleanGtin = cleanGtinValue(item.gtin);
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

  let sessionTitleHeader = currentSessionName;
  if (currentOrderNum) sessionTitleHeader += ` (${currentOrderNum})`;
  const nowObj = new Date();
  let timeEndStr = nowObj.toLocaleTimeString();
  let totalUniqueRefs = new Set(sessionScannedObjects.map(i => i.ref)).size;
  let totalItemsScanned = sessionScannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
  let sNote = document.getElementById('sessionNoteInput') ? document.getElementById('sessionNoteInput').value.trim() : '';

  let reportLines = [
    `================================================================================`,
    `ASP SCANNER APP SUMMARY EXPORT - ${sessionTitleHeader}`,
    ``,
    `          Scanned By:          ${currentUserName || 'N/A'}`,
    `          Total Unique REFs:   ${totalUniqueRefs}`,
    `          Total Items Scanned: ${totalItemsScanned}`,
    ``,
    `          Workflow Process:    ${currentWorkflowType}`,
    `          Scanned Date:        ${sessionDateStr}`,
    `          Session Start:       ${sessionStartStr || 'N/A'}`,
    `          Session End:         ${timeEndStr}`
  ];
  
  if (sNote) {
      reportLines.push(`          Session Notes:       ${sNote}`);
  }
  reportLines.push(`================================================================================\n`);

  // CONDITIONAL SECTION 1: SHORTAGES / MISSING ITEMS
  if (isManifestEnabled && expectedManifest.length > 0) {
    let shortages = [];
    expectedManifest.forEach(exp => {
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
  if (isManifestEnabled && expectedManifest.length > 0) {
    let overages = [];
    Object.keys(scannedMap).forEach(rKey => {
      let expObj = expectedManifest.find(e => e.ref === rKey);
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
  let reservedItems = sessionScannedObjects.filter(i => i.customerTag);
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

  reportLines.push(`================================================================================\nEND OF INVENTORY SUMMARY\n================================================================================`);
  return reportLines.join('\n');
}

function buildHTMLReportString(filename) {
  let scannedMap = {};

  sessionScannedObjects.forEach(item => {
    let rKey = item.ref;
    let cleanGtin = cleanGtinValue(item.gtin);
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

  let sessionTitleHeader = currentSessionName;
  if (currentOrderNum) sessionTitleHeader += ` (${currentOrderNum})`;
  const nowObj = new Date();
  let timeEndStr = nowObj.toLocaleTimeString();
  let totalUniqueRefs = new Set(sessionScannedObjects.map(i => i.ref)).size;
  let totalItemsScanned = sessionScannedObjects.reduce((acc, curr) => acc + (parseInt(curr.qty, 10) || 0), 0);
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
    <tr><td><strong>User:</strong></td><td>${currentUserName || 'N/A'}</td></tr>
    <tr><td><strong>Workflow:</strong></td><td>${currentWorkflowType}</td></tr>
    <tr><td><strong>Date:</strong></td><td>${sessionDateStr}</td></tr>
    <tr><td><strong>Time Span:</strong></td><td>${sessionStartStr} - ${timeEndStr}</td></tr>
    <tr><td><strong>Unique REFs:</strong></td><td>${totalUniqueRefs}</td></tr>
    <tr><td><strong>Total Items:</strong></td><td>${totalItemsScanned}</td></tr>
  </table>
</div>
</div>`;

  if (sNote) {
      html += `<div class="session-notes"><strong>Session Notes:</strong> ${sNote}</div>`;
  }

  // CONDITIONAL SECTION 1: SHORTAGES
  if (isManifestEnabled && expectedManifest.length > 0) {
    let shortages = [];
    expectedManifest.forEach(exp => {
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

  // CONDITIONAL SECTION 2: OVERAGES
  if (isManifestEnabled && expectedManifest.length > 0) {
    let overages = [];
    Object.keys(scannedMap).forEach(rKey => {
      let expObj = expectedManifest.find(e => e.ref === rKey);
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

  // CONDITIONAL SECTION 3: ROUTED TO CUSTOMER BINS
  let reservedItems = sessionScannedObjects.filter(i => i.customerTag);
  if (reservedItems.length > 0) {
    html += `<div class="section-title" style="border-color:#0277bd; color:#0277bd;">🚩 ROUTED TO CUSTOMER BINS</div><div class="alert-box alert-tag"><table style="width:100%;"><tr><th>REF</th><th>Customer Tag</th><th>Quantity Routed</th></tr>`;
    reservedItems.forEach(r => {
      html += `<tr><td><strong>${r.ref}</strong></td><td>${r.customerTag}</td><td style="text-align:center; font-weight:bold;">${r.qty}</td></tr>`;
    });
    html += `</table></div>`;
  }

  // CONDITIONAL SECTION 4: ITEMS REQUIRING PRICING
  let unpricedItems = Object.values(scannedMap).filter(i => !i.price || i.price === "$0.00" || i.price === "0");
  if (unpricedItems.length > 0) {
    html += `<div class="section-title" style="border-color:#7b1fa2; color:#7b1fa2;">🏷️ ITEMS REQUIRING PRICING</div><div class="alert-box alert-price"><table style="width:100%;"><tr><th>REF</th><th>Manufacturer</th><th>Quantity Scanned</th></tr>`;
    unpricedItems.forEach(u => {
      html += `<tr><td><strong>${u.ref}</strong></td><td>${u.mfr}</td><td style="text-align:center; font-weight:bold;">${u.totalScannedQty}</td></tr>`;
    });
    html += `</table></div>`;
  }

  // SCANNED BREAKDOWN TABLE
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
  html += `</tbody></table></body></html>`; 
  return html;
}

window.triggerShareOrDownload = async function(content, filename, mimeType) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Export Document', accept: { [mimeType]: [filename.substring(filename.lastIndexOf('.'))] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      alert("Export successful!");
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; 
    }
  }

  let file = new File([content], filename, { type: mimeType });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename
      });
      return; 
    } catch (e) {
      console.warn("Share cancelled or failed, falling back to download.");
    }
  }

  try {
      let blob = new Blob([content], { type: mimeType });
      let a = document.createElement('a');
      let url = window.URL.createObjectURL(blob);
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a); 
      a.click(); 
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      alert("Export successfully saved to Downloads!");
  } catch (e) {
      alert("Export failed: " + e.message);
  }
};

window.exportData = async function(formatType) {
  if (sessionScannedObjects.length === 0 && pendingNewItems.length === 0 && pendingFieldUpdates.length === 0) {
    alert("No data was scanned in this session."); return;
  }

  let filename = generateExactFilename(formatType);

  if (formatType === 'pdf') {
      let printWin = window.open('', '_blank');
      if (!printWin) {
          alert("Pop-up blocked! Please allow pop-ups for this site to generate the PDF.");
          return;
      }
      
      let fileContent = buildHTMLReportString(filename);
      printWin.document.open();
      printWin.document.write(fileContent);
      printWin.document.title = filename; 
      printWin.document.close();
      
      setTimeout(() => {
          printWin.focus();
          printWin.print();
      }, 500);
      return;
  }

  let fileContent = buildTXTReportString();
  let mime = 'text/plain';
  await triggerShareOrDownload(fileContent, filename, mime);
};

window.onload = function() {
    loadMasterDatabase();
};
