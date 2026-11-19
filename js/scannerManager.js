const ScannerManager = {
  html5QrCode: null,
  isCameraActive: false,
  scanCooldown: false,
  visibleScanLines: 1,

  handleSuccessfulScan(decodedText) {
    if (this.scanCooldown) return;
    
    // Clean string formatting artifacts
    let cleanText = decodedText.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    if (cleanText.length < 4) return;

    // SAFETY NET FILTER: Validate that barcode contains meaningful GS1 data
    const isGs1Gtin = cleanText.startsWith('(01)') || cleanText.startsWith('01');
    const isGs1LotExp = cleanText.startsWith('(17)') || cleanText.startsWith('17');
    const isCombined2D = cleanText.includes('(01)') && cleanText.includes('(17)');
    const isRawGtin = /^\d{12,14}$/.test(cleanText);

    if (!isGs1Gtin && !isGs1LotExp && !isCombined2D && !isRawGtin) {
      console.log(`[Safety Net] Ignored non-inventory barcode: ${cleanText}`);
      return;
    }

    // Duplicate Check: Prevent scanning the exact same barcode line twice
    for (let i = 1; i <= 4; i++) {
      if (document.getElementById(`rawScan${i}`).value.trim() === cleanText) return;
    }

    let targetLine = 0;
    for (let i = 1; i <= 4; i++) {
      if (!document.getElementById(`rawScan${i}`).value.trim()) { targetLine = i; break; }
    }

    if (targetLine === 0 && this.visibleScanLines < 4) {
      this.addScanLine();
      targetLine = this.visibleScanLines;
    }

    if (targetLine > 0) {
      this.scanCooldown = true;
      let camBox = document.getElementById('cameraViewfinder');
      if (camBox) {
          camBox.classList.add('scan-success');
          setTimeout(() => camBox.classList.remove('scan-success'), 600);
      }
      document.getElementById(`rawScan${targetLine}`).value = cleanText;
      this.processAllScans();

      // Check if essential data (GTIN, Lot, Exp) is captured
      let currentGtin = document.getElementById('gtinInput').value.trim() !== '' || document.getElementById('chkNaGtin').checked;
      let currentLot = document.getElementById('lotInput').value.trim() !== '' || document.getElementById('chkNaLot').checked;
      let currentExp = document.getElementById('expInput').value.trim() !== '' || document.getElementById('chkNaExp').checked;

      if (currentGtin && currentLot && currentExp && this.isCameraActive) {
        setTimeout(() => this.toggleCameraScanner(), 300);
      } else if (this.visibleScanLines < 4) {
        this.addScanLine();
      }
      setTimeout(() => this.scanCooldown = false, 600);
    }
  },

  scanImageFile(event) {
    if (event.target.files.length == 0) return;
    const file = event.target.files[0];
    const qr = new Html5Qrcode("cameraViewfinder");
    qr.scanFile(file, true)
      .then(decodedText => { this.handleSuccessfulScan(decodedText); event.target.value = ''; })
      .catch(err => { alert("No barcode detected in this image."); event.target.value = ''; });
  },

  toggleCameraScanner() {
    const camContainer = document.getElementById('cameraContainer');
    const camBtn = document.getElementById('btnToggleCam');

    if (!this.isCameraActive) {
      camContainer.style.display = 'block';
      camBtn.textContent = '❌ Close Camera';
      camBtn.style.backgroundColor = '#c62828';
      this.isCameraActive = true;
      UIManager.updateCameraOverlayStatus();

      setTimeout(() => {
        if (!this.isCameraActive) return;
        this.html5QrCode = new Html5Qrcode("cameraViewfinder");
        this.html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: { width: 320, height: 250 }, aspectRatio: 1.333333 }, (txt) => this.handleSuccessfulScan(txt))
          .catch(err => {
            this.html5QrCode.start({ facingMode: "user" }, { fps: 15, qrbox: { width: 320, height: 250 }, aspectRatio: 1.333333 }, (txt) => this.handleSuccessfulScan(txt))
              .catch(fallbackErr => { alert("Unable to access camera: " + fallbackErr); this.toggleCameraScanner(); });
          });
      }, 50);
    } else {
      if (this.html5QrCode) {
        this.html5QrCode.stop().then(() => {
          this.html5QrCode.clear();
          camContainer.style.display = 'none';
          camBtn.textContent = '📷 Open Camera';
          camBtn.style.backgroundColor = '#e65100';
          this.isCameraActive = false;
        }).catch(() => { camContainer.style.display = 'none'; this.isCameraActive = false; });
      } else {
        camContainer.style.display = 'none';
        this.isCameraActive = false;
      }
    }
  },

  addScanLine() {
    if (this.visibleScanLines < 4) {
      this.visibleScanLines++;
      document.getElementById(`rowScan${this.visibleScanLines}`).style.display = 'flex';
    }
    if (this.visibleScanLines === 4) document.getElementById('btnAddLine').style.display = 'none';
  },

  resetScanLinesAndFields() {
    this.visibleScanLines = 1;
    for (let i = 1; i <= 4; i++) {
      let rawEl = document.getElementById(`rawScan${i}`);
      if (rawEl) rawEl.value = '';
      let rowEl = document.getElementById(`rowScan${i}`);
      if (rowEl && i > 1) rowEl.style.display = 'none';
    }
    
    let btnAdd = document.getElementById('btnAddLine');
    if (btnAdd) btnAdd.style.display = 'inline-block';
    
    ['Gtin', 'Lot', 'Exp'].forEach(suffix => {
      let chk = document.getElementById(`chkNa${suffix}`);
      if (chk) chk.checked = false;
      let field = document.getElementById(`${suffix.toLowerCase()}Input`);
      if (field) { field.value = ''; field.readOnly = false; }
    });

    let refInp = document.getElementById('refInput');
    if (refInp) refInp.value = '';

    // ✨ FIX: Clear the Version field after saving an item or starting/resetting a session
    let verInp = document.getElementById('verInput');
    if (verInp) verInp.value = '';
    
    let qtyInp = document.getElementById('qtyInput');
    if (qtyInp) qtyInp.value = '1';

    let shelfInp = document.getElementById('shelfInput');
    if (shelfInp) {
        shelfInp.value = '';
        // ✨ FIX: Lockdown the shelf if we are Packing or Reserving!
        if (typeof SessionManager !== 'undefined' && SessionManager.currentWorkflowType && (SessionManager.currentWorkflowType.includes('Pack') || SessionManager.currentWorkflowType.includes('Order'))) {
             shelfInp.readOnly = true;
             shelfInp.style.backgroundColor = '#f0f0f0';
             shelfInp.style.color = '#888';
             if (document.getElementById('btnConfirmShelf')) document.getElementById('btnConfirmShelf').style.display = 'none'; // ✨ NEW
        } else {
             shelfInp.readOnly = false;
             shelfInp.style.backgroundColor = '';
             shelfInp.style.color = '';
        }
    }
    
    let vendorSel = document.getElementById('vendorSelect');
    if (vendorSel) vendorSel.selectedIndex = 0;
    
    let custSel = document.getElementById('itemCustomerSelect');
    if (custSel) custSel.selectedIndex = 0;

    let ordInp = document.getElementById('itemOrderNumInput');
    if (ordInp) ordInp.value = '';

    let knownOrdSel = document.getElementById('itemKnownOrdersSelect');
    if (knownOrdSel) knownOrdSel.style.display = 'none';

    // ✨ FIX: Always reset Item Destination back to "Inventory" for the next scan in Receiving or Stocktake
    if (typeof SessionManager !== 'undefined' && (SessionManager.currentWorkflowType.includes('Receiving & Reserving') || SessionManager.currentWorkflowType.includes('Stocktake'))) {
      if (typeof UIManager !== 'undefined' && UIManager.setItemAction) UIManager.setItemAction('Inventory');
    }

    let noteInp = document.getElementById('itemNoteInput');
    if (noteInp) noteInp.value = '';

    let chkNote = document.getElementById('chkItemNote');
    if (chkNote) { 
      chkNote.checked = false; 
      if (typeof UIManager !== 'undefined' && UIManager.toggleItemNote) UIManager.toggleItemNote(); 
    }

    if (typeof SessionManager !== 'undefined') {
      SessionManager.currentMatchedItem = null;
      SessionManager.pendingUpdates = {};
    }

    if (typeof UIManager !== 'undefined') {
      UIManager.hideAllConfirmButtons();
      UIManager.evaluateFieldAttention();
    }

    let liveMatch = document.getElementById('liveMatchPreview');
    if (liveMatch) liveMatch.style.display = 'none';

    if (refInp) { setTimeout(() => { try { document.getElementById('rawScan1').focus(); } catch(e){} }, 50); }
  },

  captureViewfinderFrame() {
    const videoEl = document.querySelector('#cameraViewfinder video');
    if (!videoEl) {
      alert("Camera is not active.");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 1280;
    canvas.height = videoEl.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "viewfinder_snap.png", { type: "image/png" });
      
      if (typeof Html5Qrcode !== 'undefined') {
        const qrScanner = new Html5Qrcode("cameraViewfinder");
        qrScanner.scanFile(file, true)
          .then(decodedText => {
            this.handleSuccessfulScan(decodedText);
          })
          .catch(err => {
            alert("Could not detect barcode from snapshot frame. Try adjusting light or distance.");
          });
      }
    }, 'image/png');
  },

  processAllScans() {
    for (let i = 1; i <= 4; i++) {
      let inputEl = document.getElementById(`rawScan${i}`);
      if (inputEl && inputEl.value) {
        inputEl.value = inputEl.value.toUpperCase();
      }
    }

    let lines = [
      document.getElementById('rawScan1').value, document.getElementById('rawScan2').value,
      document.getElementById('rawScan3').value, document.getElementById('rawScan4').value
    ];

    let gtin = "", lot = "", exp = "", variant = "";

    // Helper: Validate YYMMDD dates so random digits inside lots aren't mistaken for dates
    const isValidYYMMDD = (str, isProdDate = false) => {
      if (!/^\d{6}$/.test(str)) return false;
      let yy = parseInt(str.substring(0, 2), 10);
      let mm = parseInt(str.substring(2, 4), 10);
      let dd = parseInt(str.substring(4, 6), 10);
      if (mm < 1 || mm > 12 || dd < 0 || dd > 31) return false;
      return isProdDate ? (yy >= 18 && yy <= 35) : (yy >= 19 && yy <= 40);
    };

    // PASS 1: Clean lines & sniff GTIN early so we can identify Manufacturer & REF before parsing Lot
    let cleanedLines = [];
    lines.forEach(rawLine => {
      if (!rawLine || !rawLine.trim()) return;
      let clean = rawLine
        .replace(/\x1D/g, '|')
        .replace(/^\][a-zA-Z0-9]{2}/, '')
        .replace(/[\(\)]/g, '')
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        .trim()
        .toUpperCase();
      cleanedLines.push(clean);

      if (!gtin) {
        let gMatch = clean.match(/^01(\d{14})/);
        if (gMatch) gtin = gMatch[1];
        else if (/^\d{12,14}$/.test(clean)) gtin = clean;
      }
    });

    // Resolve Manufacturer & REF from DB via GTIN (or fallback to current UI fields)
    let knownMfr = document.getElementById('vendorSelect') ? document.getElementById('vendorSelect').value.toUpperCase().trim() : "";
    let knownRef = document.getElementById('refInput') ? document.getElementById('refInput').value.toUpperCase().trim() : "";
    if (typeof DatabaseManager !== 'undefined' && (gtin || knownRef)) {
      let dbHit = DatabaseManager.findDatabaseMatch(gtin, knownRef);
      if (dbHit) {
        knownMfr = DatabaseManager.getItemVendor(dbHit).toUpperCase().trim() || knownMfr;
        knownRef = DatabaseManager.getItemSku(dbHit).toUpperCase().trim() || knownRef;
      }
    }

    // PASS 2: Structured GS1 Parsing with Manufacturer / REF Prediction Profiles
    cleanedLines.forEach(clean => {
      let idx = 0;
      while (idx < clean.length) {
        if (clean[idx] === '|') {
          idx++;
          continue;
        }

        // AI 01: GTIN (14 digits)
        if (clean.substring(idx, idx + 2) === "01" && clean.length - idx >= 16 && /^\d{14}$/.test(clean.substring(idx + 2, idx + 16))) {
          if (!gtin) gtin = clean.substring(idx + 2, idx + 16);
          idx += 16;
          continue;
        }

        // AI 20: Product Variant (2 digits) — outside of lot strings (e.g. Ethicon 01...201417...)
        if (clean.substring(idx, idx + 2) === "20" && clean.length - idx >= 4 && /^\d{2}$/.test(clean.substring(idx + 2, idx + 4))) {
          if (!variant) variant = clean.substring(idx + 2, idx + 4);
          idx += 4;
          continue;
        }

        // AI 11: Production Date (YYMMDD) — skip cleanly so '10' or '20' inside date never hijacks parser!
        if (clean.substring(idx, idx + 2) === "11" && clean.length - idx >= 8 && isValidYYMMDD(clean.substring(idx + 2, idx + 8), true)) {
          idx += 8;
          continue;
        }

        // AI 17: Expiration Date (YYMMDD)
        if (clean.substring(idx, idx + 2) === "17" && clean.length - idx >= 8 && isValidYYMMDD(clean.substring(idx + 2, idx + 8), false)) {
          if (!exp) {
            let rawExp = clean.substring(idx + 2, idx + 8);
            let yy = parseInt(rawExp.substring(0, 2), 10);
            let year = yy < 50 ? (2000 + yy) : (1900 + yy);
            exp = `${year}-${rawExp.substring(2, 4)}-${rawExp.substring(4, 6)}`;
          }
          idx += 8;
          continue;
        }

        // AI 10: Lot / Batch Number
        if (clean.substring(idx, idx + 2) === "10") {
          let rem = clean.substring(idx + 2);

          // 0. If hardware scanner emitted an explicit GS1 Group Separator '|', trust it 100%
          let gsIdx = rem.indexOf('|');
          if (gsIdx > -1) {
            lot = rem.substring(0, gsIdx);
            idx += 2 + gsIdx + 1;
            continue;
          }

          // --- MANUFACTURER & REF LOT PROFILES ---
          // Profile 1: INTUITIVE (470xxx, 471xxx, 480xxx, 482xxx, 483xxx)
          // Format: 1 letter + 8 digits (e.g. K11260824), optionally followed by AI 91xxxx
          if (knownMfr.includes('INTUITIVE') || /^(470|471|480|482|483)/.test(knownRef)) {
            let mInt = rem.match(/^([A-Z]\d{8})(?:(91\d{4,})|(17\d{6})|(20\d{2}))?/);
            if (mInt) {
              lot = mInt[1];
              idx += 2 + lot.length + (mInt[2] ? mInt[2].length : 0);
              continue;
            }
          }

          // Profile 2: STRYKER (279-xxx-xxx)
          // Format: 8-char lot (e.g. 26152AE2) followed by AI 93 internal code (93 + 5+ digits)
          if (knownMfr.includes('STRYKER') || knownRef.startsWith('279-')) {
            let mStr = rem.match(/^(\d{5}[A-Z]{2}\d)(93\d{5,})$/);
            if (mStr) {
              lot = mStr[1];
              break;
            }
          }

          // Profile 3: BD (e.g. 309647)
          // Format: 7-digit lot followed by AI 30 box count (e.g. 30125)
          if (knownMfr === 'BD') {
            let mBd = rem.match(/^(\d{7})(30\d{1,4})$/);
            if (mBd) {
              lot = mBd[1];
              break;
            }
          }

          // Profile 4: COVIDIEN / MEDTRONIC (SIG*, LF*, LS*, TA*, EL-*, EGIA*, MR8-*)
          // Never split on '11', '20', or '21' INSIDE the lot — ONLY strip trailing AI 20XX at the very end!
          if (knownMfr.includes('COVIDIEN') || knownMfr.includes('MEDTRONIC') || /^(SIG|LF|LS|TA|EL-|EGIA|MR8-)/.test(knownRef)) {
            let mCov = rem.match(/^(.{6,}?)(20\d{2})$/);
            if (mCov) {
              lot = mCov[1];
              if (!variant) variant = mCov[2].substring(2);
              break;
            } else {
              lot = rem;
              break;
            }
          }

          // --- GENERAL SAFE FALLBACK RULES (All Other Manufacturers) ---
          // A) Trailing AI 91 or AI 93 internal code after a 6+ char lot
          let m9x = rem.match(/^([A-Z0-9]{6,}?)(9[13]\d{4,})$/);
          if (m9x) {
            lot = m9x[1];
            break;
          }

          // B) Trailing AI 20XX (Product Variant) strictly at the VERY END of the string (after 5+ char lot)
          let mEnd20 = rem.match(/^(.{5,}?)(20\d{2})$/);
          if (mEnd20) {
            lot = mEnd20[1];
            if (!variant) variant = mEnd20[2].substring(2);
            break;
          }

          // C) Valid AI 17 (Exp Date YYMMDD) appearing after a 4+ char lot (e.g. Cooper Surgical 10LOT17300310240...)
          let m17 = rem.match(/^(.{4,}?)(17)([2-3]\d(?:0[1-9]|1[0-2])(?:0[0-9]|[1-2]\d|3[0-1]))(.*)$/);
          if (m17) {
            lot = m17[1];
            let rawExp = m17[3];
            if (!exp) {
              let yy = parseInt(rawExp.substring(0, 2), 10);
              let year = yy < 50 ? (2000 + yy) : (1900 + yy);
              exp = `${year}-${rawExp.substring(2, 4)}-${rawExp.substring(4, 6)}`;
            }
            break;
          }

          lot = rem;
          break;
        } else if (/^\d{12,14}$/.test(clean)) {
          if (!gtin) gtin = clean;
          break;
        } else {
          idx++;
        }
      }
    });

    let verInput = document.getElementById('verInput');
    if (verInput) {
      verInput.value = variant ? variant : "";
    }

    if (gtin && !document.getElementById('chkNaGtin').checked) document.getElementById('gtinInput').value = gtin;
    if (lot && !document.getElementById('chkNaLot').checked) document.getElementById('lotInput').value = lot;
    if (exp && !document.getElementById('chkNaExp').checked) document.getElementById('expInput').value = exp;

    DatabaseManager.runMasterLookup();
  },

  scanDocumentOCR(event) {
    if (event.target.files.length === 0) return;
    const file = event.target.files[0];
    alert("Processing document image with experimental OCR... Please wait a few seconds.");

    Tesseract.recognize(file, 'eng').then(({ data: { text } }) => {
        let lines = text.split('\n');
        let foundMatches = 0;
        lines.forEach(line => {
          let words = line.toUpperCase().split(/\s+/);
          words.forEach(word => {
            let cleanWord = word.replace(/[^A-Z0-9-]/g, '');
            if (DatabaseManager.db.find(i => DatabaseManager.getItemSku(i) === cleanWord)) {
              SessionManager.addManifestRow(cleanWord, 1);
              foundMatches++;
            }
          });
        });
        alert(foundMatches > 0 ? `OCR Complete: Pre-filled ${foundMatches} recognized REF(s)!` : "OCR Complete: No known REFs detected.");
        event.target.value = '';
    }).catch(err => { alert("OCR Error: " + err.message); event.target.value = ''; });
  }
};
/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/scannerManager.js
 * Author: Thomas Seyfors
 * Date Created: August 2026
 * 
 * Description:
 *   Hardware and camera barcode engine integrating HTML5-QRCode viewfinder, 
 *   GS1 2D DataMatrix parsing, and real-time GTIN/LOT/EXP extraction.
 *
 * Affected Features:
 *   - Device Camera Initialization & Focus Controls
 *   - GS1 String Decryption (01, 10, 17 parsing)
 *   - Scan Field Auto-Population
 *   - AI Vision OCR Bridging
 *
 * Copyright (c) 2026 Thomas Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */