/* ======================================================================= */
/* ASP SCANNER APP - LOGIC & SCRIPTING (app.js)                            */
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

let currentItemAction = "Inventory";
let visibleScanLines = 1;
let isSessionActive = false;
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
  const sName = document.getElementById('sessionNameInput').value.trim();
  const oNum = document.getElementById('orderNumInput').value.trim();
  const wType = document.getElementById('workflowTypeSelect').value;

  if (!sName) {
    alert("Please enter a Session Name before starting.");
    return;
  }

  isSessionActive = true;
  localStorage.setItem('asp_session_is_active', 'true');

  const nowObj = new Date();
  let yyyy = nowObj.getFullYear();
  let mm = String(nowObj.getMonth() + 1).padStart(2, '0');
  let dd = String(nowObj.getDate()).padStart(2, '0');
  sessionDateStr = `${yyyy}.${mm}.${dd}`;
  sessionStartStr = nowObj.toLocaleTimeString();

  currentSessionName = sName;
  currentOrderNum = oNum;
  currentWorkflowType = wType;

  localStorage.setItem('asp_session_name', currentSessionName);
  localStorage.setItem('asp_order_num', currentOrderNum);
  localStorage.setItem('asp_workflow_type', currentWorkflowType);
  localStorage.setItem('asp_session_start_str', sessionStartStr);
  localStorage.setItem('asp_session_date_str', sessionDateStr);

  sessionScannedObjects = [];
  localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));

  updateHeaderBanners();

  document.getElementById('screenSetup').style.display = 'none';
  document.getElementById('screenScanning').style.display = 'block';
  document.getElementById('screenReview').style.display = 'none';
  document.getElementById('screenSummary').style.display = 'none';

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
  document.getElementById('hdrDate').textContent = sessionDateStr;
  document.getElementById('hdrTime').textContent = sessionStartStr;
  document.getElementById('hdrWorkflow').textContent = currentWorkflowType;

  let hdrTitleRev = document.getElementById('hdrTitleRev');
  if (hdrTitleRev) {
      hdrTitleRev.textContent = titleStr;
      document.getElementById('hdrDateRev').textContent = sessionDateStr;
      document.getElementById('hdrTimeRev').textContent = sessionStartStr;
      document.getElementById('hdrWorkflowRev').textContent = currentWorkflowType;
  }

  let hdrTitleSum = document.getElementById('hdrTitleSum');
  if (hdrTitleSum) {
    hdrTitleSum.textContent = titleStr;
    document.getElementById('hdrDateSum').textContent = sessionDateStr;
    document.getElementById('hdrTimeSum').textContent = sessionStartStr;
    document.getElementById('hdrWorkflowSum').textContent = currentWorkflowType;
  }
}

window.checkSessionRecoveryState = function() {
  let storedActiveState = localStorage.getItem('asp_session_is_active');
  if (storedActiveState === 'true') {
    isSessionActive = true;
    updateHeaderBanners();
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenSummary').style.display = 'none';

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
  localStorage.setItem('asp_session_is_active', 'false');
  sessionScannedObjects = [];
  localStorage.setItem('asp_session_scanned_objects', JSON.stringify([]));

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
  localStorage.setItem('asp_session_is_active', 'false');
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
  
  // Reload Headers to Ensure UI reflects Rescued Session
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
    document.getElementById('screenReview').style.display = 'none';
    document.getElementById('screenScanning').style.display = 'block';

  } catch (err) {
    alert("Error saving item: " + err.message);
  }
}

/* --- EXPORT & SUMMARY LOGIC --- */

window.cleanGtinValue = function(val) {
  if (!val) return 'N/A';
  return val.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim() || 'N/A';
};

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
  let baseFilename = `${sessionDateStr} - ${prefix} - ${wType}`;
  let trackerKey = `asp_export_count_${baseFilename}`;
  let count = parseInt(localStorage.getItem(trackerKey), 10) || 0;
  let finalName = count === 0 ? `${baseFilename}.${extension}` : `${baseFilename} ${count}.${extension}`;
  localStorage.setItem(trackerKey, count + 1);
  return finalName;
}

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
    } else if (val === 'html') {
        exportData('html');
    } else if (val === 'pdf') {
        exportData('pdf');
    } else if (val === 'txt') {
        exportData('txt');
    } else if (val === 'complete') {
        completeSession();
    }

    setTimeout(() => { selectEl.value = ""; }, 500);
};

function buildTXTReportString() {
  let invMap = {}, resMap = {}, packMap = {};

  sessionScannedObjects.forEach(item => {
    let rKey = item.ref;
    let cleanGtin = cleanGtinValue(item.gtin);
    
    let targetMaps = [];
    if (item.actionTag === 'Inventory') targetMaps.push(invMap);
    else if (item.actionTag === 'Reserved') {
      targetMaps.push(resMap);
      if (currentWorkflowType.includes('Receiving & Reserving')) targetMaps.push(invMap); 
    } else if (item.actionTag === 'Pack & Ship') targetMaps.push(packMap);

    targetMaps.forEach(targetMap => {
      if (!targetMap[rKey]) {
        targetMap[rKey] = { ref: item.ref, gtin: cleanGtin, mfr: item.mfr, price: item.price, totalQty: 0, byTag: {} };
      } else if ((!targetMap[rKey].gtin || targetMap[rKey].gtin === 'N/A') && cleanGtin !== 'N/A') {
        targetMap[rKey].gtin = cleanGtin;
      }
      targetMap[rKey].totalQty += item.qty;

      let tKey = item.customerTag || 'UNTAGGED';
      if (!targetMap[rKey].byTag[tKey]) {
        targetMap[rKey].byTag[tKey] = { tagTotalQty: 0, lots: {} };
      }
      targetMap[rKey].byTag[tKey].tagTotalQty += item.qty;

      let lotKey = `${item.lot}_${item.exp}`;
      if (!targetMap[rKey].byTag[tKey].lots[lotKey]) {
        targetMap[rKey].byTag[tKey].lots[lotKey] = { lot: item.lot, exp: item.exp, qty: 0, notes: [] };
      }
      targetMap[rKey].byTag[tKey].lots[lotKey].qty += item.qty;
      if (item.itemNote) targetMap[rKey].byTag[tKey].lots[lotKey].notes.push(item.itemNote);
    });
  });

  let sessionTitleHeader = currentSessionName;
  if (currentOrderNum) sessionTitleHeader += ` (${currentOrderNum})`;
  const nowObj = new Date();
  let timeEndStr = nowObj.toLocaleTimeString();
  let totalUniqueRefs = new Set(sessionScannedObjects.map(i => i.ref)).size;
  let sNote = document.getElementById('sessionNoteInput') ? document.getElementById('sessionNoteInput').value.trim() : '';

  let reportLines = [
    `================================================================================`,
    `ASP SCANNER APP SUMMARY EXPORT - ${sessionTitleHeader}`,
    ``,
    `          Total Unique REFs Scanned: ${totalUniqueRefs}`,
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

  function formatTextMap(mapData, title, showTags) {
    if (Object.keys(mapData).length === 0) return;
    reportLines.push(`--- ${title} ---\n`);
    let count = 1;
    for (let rKey in mapData) {
      let rData = mapData[rKey];
      reportLines.push(`[${count}] REF: ${rData.ref}\n    | GTIN: ${rData.gtin}\n    | Total Quantity: ${rData.totalQty}`);
      for (let tKey in rData.byTag) {
        let tagData = rData.byTag[tKey];
        if (showTags && tKey !== 'UNTAGGED') reportLines.push(`    | Customer Tag: ${tKey} (Qty: ${tagData.tagTotalQty})`);
        reportLines.push(`    | Lot & Expiration Breakdowns:`);
        for (let lKey in tagData.lots) {
          let lData = tagData.lots[lKey];
          reportLines.push(`      - Lot: ${lData.lot} | Exp: ${lData.exp} | Qty: ${lData.qty}`);
          if(lData.notes.length > 0) reportLines.push(`        * Notes: ${lData.notes.join(', ')}`);
        }
      }
      reportLines.push(``); count++;
    }
  }

  formatTextMap(invMap, "INVENTORY ADDITIONS", true);
  formatTextMap(resMap, "RESERVED FOR CUSTOMERS", true);
  formatTextMap(packMap, "PACK & SHIP", true);

  if (pendingNewItems.length > 0) {
    reportLines.push(`--------------------------------------------------------------------------------\n--- NEW ITEM DETAILS ---\n--------------------------------------------------------------------------------`);
    let nIdx = 1;
    pendingNewItems.forEach(nItem => {
      reportLines.push(`[ ${nIdx} ] REF: ${nItem.ref}\n          | GTIN: ${cleanGtinValue(nItem.gtin)}\n          | Manufacturer: ${nItem.mfr}\n          | Price: ${nItem.price}`); nIdx++;
    }); reportLines.push(``);
  }

  if (pendingFieldUpdates.length > 0) {
    reportLines.push(`--------------------------------------------------------------------------------\n--- EXISTING ITEM UPDATES (${pendingFieldUpdates.length}) ---\n--------------------------------------------------------------------------------`);
    let uIdx = 1;
    pendingFieldUpdates.forEach(upd => {
      reportLines.push(`[ ${uIdx} ] REF: ${upd.ref}\n          | GTIN: ${cleanGtinValue(upd.newValue)}`); uIdx++;
    }); reportLines.push(``);
  }

  if (sessionScannedObjects.length > 0) {
    reportLines.push(`--------------------------------------------------------------------------------\n--- SCANNING SESSION FULL BARCODE REFERENCE DATA ---\n--------------------------------------------------------------------------------\nSession Start Time: ${sessionStartStr || 'N/A'}\n`);
    sessionScannedObjects.forEach(item => {
      reportLines.push(`REF: ${item.ref}`);
      if (item.rawScanLines && item.rawScanLines.length > 0) {
        item.rawScanLines.forEach((lineVal, idx) => { reportLines.push(`  - Barcode Line ${idx + 1}: ${lineVal}`); });
      } else reportLines.push(`  - No raw barcodes captured.`);
      reportLines.push(``);
    });
  }

  reportLines.push(`================================================================================\nEND OF RECEIVING INVENTORY SUMMARY\n================================================================================`);
  return reportLines.join('\n');
}

function buildHTMLReportString(filename) {
  let invMap = {}, resMap = {}, packMap = {};

  sessionScannedObjects.forEach(item => {
    let rKey = item.ref;
    let cleanGtin = cleanGtinValue(item.gtin);
    let targetMaps = [];
    if (item.actionTag === 'Inventory') targetMaps.push(invMap);
    else if (item.actionTag === 'Reserved') {
      targetMaps.push(resMap);
      if (currentWorkflowType.includes('Receiving & Reserving')) targetMaps.push(invMap); 
    } else if (item.actionTag === 'Pack & Ship') targetMaps.push(packMap);

    targetMaps.forEach(targetMap => {
      if (!targetMap[rKey]) {
        targetMap[rKey] = { ref: item.ref, desc: item.desc, gtin: cleanGtin, mfr: item.mfr, price: item.price, totalQty: 0, byTag: {} };
      } else if ((!targetMap[rKey].gtin || targetMap[rKey].gtin === 'N/A') && cleanGtin !== 'N/A') {
        targetMap[rKey].gtin = cleanGtin;
      }
      targetMap[rKey].totalQty += item.qty;

      let tKey = item.customerTag || 'UNTAGGED';
      if (!targetMap[rKey].byTag[tKey]) targetMap[rKey].byTag[tKey] = { tagTotalQty: 0, lots: {} };
      targetMap[rKey].byTag[tKey].tagTotalQty += item.qty;

      let lotKey = `${item.lot}_${item.exp}`;
      if (!targetMap[rKey].byTag[tKey].lots[lotKey]) targetMap[rKey].byTag[tKey].lots[lotKey] = { lot: item.lot, exp: item.exp, qty: 0, notes:[] };
      targetMap[rKey].byTag[tKey].lots[lotKey].qty += item.qty;
      if (item.itemNote) targetMap[rKey].byTag[tKey].lots[lotKey].notes.push(item.itemNote);
    });
  });

  let sessionTitleHeader = currentSessionName;
  if (currentOrderNum) sessionTitleHeader += ` (${currentOrderNum})`;
  const nowObj = new Date();
  let timeEndStr = nowObj.toLocaleTimeString();
  let totalUniqueRefs = new Set(sessionScannedObjects.map(i => i.ref)).size;
  let sNote = document.getElementById('sessionNoteInput') ? document.getElementById('sessionNoteInput').value.trim() : '';

  // IMPORTANT: For true offline PDF rendering via html2canvas without CORS blocking, 
  // the Base64 image string is embedded directly into the HTML generator.
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
.section-title { background-color: #f0f0f0; border-left: 5px solid #0277bd; padding: 8px 12px; font-size: 16px; font-weight: bold; margin: 30px 0 15px 0; text-transform: uppercase; }
.data-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
.data-table th { background-color: #fafafa; border-bottom: 2px solid #ccc; padding: 10px; text-align: left; font-size: 13px; color: #555; }
.data-table td { border-bottom: 1px solid #eee; padding: 10px; vertical-align: top; }
.ref-col { font-weight: bold; color: #000; font-size: 15px; }
.desc-col { font-size: 12px; color: #666; max-width: 250px; }
.lot-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 5px; background: #fafafa; border: 1px solid #eaeaea; }
.lot-table th, .lot-table td { border: 1px solid #eaeaea; padding: 4px 8px; }
.lot-table th { background: #f0f0f0; }
.tag-header { font-weight: bold; color: #d32f2f; margin: 10px 0 4px 0; font-size: 12px; text-transform: uppercase; }
.note-text { color: #d32f2f; font-style: italic; font-size: 11px; display: block; margin-top: 3px;}
.raw-scan-list { font-family: monospace; font-size: 11px; background: #f8f9fa; padding: 10px; border-radius: 4px; border: 1px solid #ddd; }
.session-notes { background-color: #fff9c4; border-left: 4px solid #fbc02d; padding: 10px; margin-bottom: 20px; font-size: 13px;}
@media print {
  body { margin: 0; padding: 15px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page-break { page-break-before: always; }
}
</style>
</head>
<body>
<div class="header-grid">
<div>
  <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/4QDoRXhpZgAATU0AKgAAAAgABAE7AAIAAAAKAAAISodpAAQAAAABAAAIVJydAAEAAAAOAAAQzOocAAcAAAgMAAAAPgAAAAAc6gAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE1pZGpvdXJuZXkAAAAWkAMAAgAAABQAABCkkAQAAgAAABQAABC4kpEAAgAAAAQ2NAAAkpIAAgAAAAQ2NAAA6hwABwAACAwAAAiYAAAAABzqAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAyNjowODowNyAwMjozODozMQAyMDI2OjA4OjA3IDAyOjM4OjMxAAAAQwBvAHIAZQBOAEwAUAAgAE0AZQB0AGEAZABhAHQAYQBFAHIAcgBvAHIAXwBTAHUAYwBjAGUAcwBzAAAA/+EKXmh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8APD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4NCjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iPjxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+PHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9InV1aWQ6ZmFmNWJkZDUtYmEzZC0xMWRhLWFkMzEtZDMzZDc1MTgyZjFiIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iPjx4bXA6Q3JlYXRlRGF0ZT4yMDI2LTA4LTA3VDAyOjM4OjMxLjYzOTwveG1wOkNyZWF0ZURhdGU+PC9yZGY6RGVzY3JpcHRpb24+PC9yZGY6UkRGPjwveDp4bXBtZXRhPg0KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8P3hwYWNrZXQgZW5kPSd3Jz8+/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoVDg8MEB8TXhcXF1ITGBgwIhoYIx8XFh0lISUpMA4NDRoaJz02MT0wMT0O/9sAQwEHBwcKCAoTCgoTMA4XDjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw/8AAEQgCBgIGAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfI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" style="max-height: 80px;" alt="ASP Logo" />
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
    <tr><td><strong>Workflow:</strong></td><td>${currentWorkflowType}</td></tr>
    <tr><td><strong>Date:</strong></td><td>${sessionDateStr}</td></tr>
    <tr><td><strong>Time Span:</strong></td><td>${sessionStartStr} - ${timeEndStr}</td></tr>
    <tr><td><strong>Unique REFs:</strong></td><td>${totalUniqueRefs}</td></tr>
  </table>
</div>
</div>`;

  if (sNote) {
      html += `<div class="session-notes"><strong>Session Notes:</strong> ${sNote}</div>`;
  }

  function buildTableHTML(mapData, showTags, showPrice) {
    if (Object.keys(mapData).length === 0) return '';
    let tb = `<table class="data-table"><thead><tr><th>REF / MFR</th><th>Description & GTIN</th><th>Inventory Lots & Quantities</th><th style="text-align:center;">Total Qty</th></tr></thead><tbody>`;
    for (let rKey in mapData) {
      let rData = mapData[rKey];
      let lotSection = '';
      for (let tKey in rData.byTag) {
        let tagData = rData.byTag[tKey];
        if (showTags && tKey !== 'UNTAGGED') lotSection += `<div class="tag-header">Tag: ${tKey} (Qty: ${tagData.tagTotalQty})</div>`;
        else if (showTags && Object.keys(rData.byTag).length > 1) lotSection += `<div class="tag-header" style="color:#555;">UNTAGGED (Qty: ${tagData.tagTotalQty})</div>`;
        
        lotSection += `<table class="lot-table"><tr><th>Lot Number</th><th>Exp Date</th><th>Qty</th></tr>`;
        for (let lKey in tagData.lots) {
           let lData = tagData.lots[lKey];
           let noteStr = lData.notes.length > 0 ? `<span class="note-text">${lData.notes.join('<br>')}</span>` : '';
           lotSection += `<tr><td>${lData.lot}${noteStr}</td><td>${lData.exp}</td><td style="text-align:center; font-weight:bold;">${lData.qty}</td></tr>`;
        }
        lotSection += `</table>`;
      }
      let descText = rData.desc || 'No description available.';
      let priceHtml = showPrice ? `<br><strong style="color:#2e7d32;">${rData.price}</strong>` : '';
      tb += `<tr><td><div class="ref-col">${rData.ref}</div><div style="font-size:11px; color:#888; margin-top:4px;">${rData.mfr}</div></td><td><div class="desc-col">${descText}</div><div style="font-size:11px; margin-top:6px;"><strong>GTIN:</strong> ${rData.gtin}</div>${priceHtml}</td><td>${lotSection}</td><td style="text-align:center; font-size:18px; font-weight:bold;">${rData.totalQty}</td></tr>`;
    }
    tb += `</tbody></table>`; return tb;
  }

  if (Object.keys(invMap).length > 0) { html += `<div class="section-title">📦 INVENTORY ADDITIONS</div>`; html += buildTableHTML(invMap, true, false); }
  if (Object.keys(resMap).length > 0) { html += `<div class="section-title">🚩 RESERVED FOR CUSTOMERS</div>`; html += buildTableHTML(resMap, true, false); }
  if (Object.keys(packMap).length > 0) { html += `<div class="section-title">🖐️ PACK & SHIP (OUTBOUND)</div>`; html += buildTableHTML(packMap, true, true); }

  if (pendingNewItems.length > 0 || pendingFieldUpdates.length > 0 || sessionScannedObjects.length > 0) {
     html += `<div class="page-break"></div><div class="section-title" style="background-color:#424242; color:#fff; border-color:#212121;">⚙️ SYSTEM LOGS & BARCODE DATA</div>`;
  }

  if (pendingNewItems.length > 0) {
    html += `<h4 style="margin-bottom:5px;">New Items Added to Database</h4><table class="data-table"><thead><tr><th>REF</th><th>Manufacturer</th><th>GTIN</th></tr></thead><tbody>`;
    pendingNewItems.forEach(nItem => { html += `<tr><td><strong>${nItem.ref}</strong></td><td>${nItem.mfr}</td><td>${cleanGtinValue(nItem.gtin)}</td></tr>`; });
    html += `</tbody></table>`;
  }

  if (pendingFieldUpdates.length > 0) {
    html += `<h4 style="margin-bottom:5px;">Existing Database Updates</h4><table class="data-table"><thead><tr><th>REF</th><th>Updated Value</th></tr></thead><tbody>`;
    pendingFieldUpdates.forEach(upd => { html += `<tr><td><strong>${upd.ref}</strong></td><td>${cleanGtinValue(upd.newValue)}</td></tr>`; });
    html += `</tbody></table>`;
  }

  if (sessionScannedObjects.length > 0) {
    html += `<h4 style="margin-bottom:5px;">Raw Barcode Scans</h4><div class="raw-scan-list">`;
    sessionScannedObjects.forEach(item => {
      html += `<div style="margin-bottom:8px;"><strong>REF: ${item.ref}</strong><br>`;
      if (item.rawScanLines && item.rawScanLines.length > 0) {
        item.rawScanLines.forEach((lineVal, idx) => { html += `&nbsp;&nbsp;Line ${idx + 1}: ${lineVal}<br>`; });
      } else html += `&nbsp;&nbsp;No raw barcodes captured.<br>`;
      html += `</div>`;
    }); html += `</div>`;
  }
  html += `</body></html>`; return html;
}

// Guaranteed Universal Download Function
function triggerStandardDownload(content, filename, mimeType) {
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
      alert("Export successful!");
  } catch (e) {
      alert("Export failed: " + e.message);
  }
}

// Fallback Print Function for mobile PDF generation
function triggerNativePrint(htmlContent) {
    let printIframe = document.createElement('iframe');
    printIframe.style.position = 'absolute';
    printIframe.style.width = '0px';
    printIframe.style.height = '0px';
    printIframe.style.border = 'none';
    document.body.appendChild(printIframe);
    
    let doc = printIframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    
    setTimeout(() => {
        printIframe.contentWindow.focus();
        printIframe.contentWindow.print();
        setTimeout(() => { document.body.removeChild(printIframe); }, 1000);
    }, 500);
}

window.exportData = async function(formatType) {
  if (sessionScannedObjects.length === 0 && pendingNewItems.length === 0 && pendingFieldUpdates.length === 0) {
    alert("No data was scanned in this session."); return;
  }

  let filename = generateExactFilename(formatType);
  let fileContent = formatType === 'txt' ? buildTXTReportString() : buildHTMLReportString(filename);

  if (formatType === 'pdf') {
      if (typeof html2pdf === 'undefined') {
          alert("Direct PDF generator unavailable (no internet). Falling back to Print -> Save as PDF.");
          triggerNativePrint(fileContent);
          return;
      }
      
      try {
          let opt = {
            margin:       0.5,
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
          };
          
          let tempDiv = document.createElement('div');
          tempDiv.innerHTML = fileContent;
          document.body.appendChild(tempDiv);
          
          await html2pdf().set(opt).from(tempDiv).save();
          document.body.removeChild(tempDiv);
          alert("Session successfully exported as PDF!");
      } catch (e) {
          alert("Direct PDF export failed. Falling back to Print -> Save as PDF.\nError: " + e.message);
          triggerNativePrint(fileContent);
      }
      return;
  }

  let mime = formatType === 'txt' ? 'text/plain' : 'text/html';
  triggerStandardDownload(fileContent, filename, mime);
}

window.onload = function() {
    loadMasterDatabase();
};
