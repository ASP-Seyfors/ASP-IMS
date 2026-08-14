/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/scannerManager.js
 * Author: Thomas Paul Seyfors
 * Version: 2.3.3
 * Date: August 2026
 * 
 * Description:
 *   Hardware and camera barcode engine integrating HTML5-QRCode viewfinder,
 *   OCR processing, GS1 2D DataMatrix/1D parsing, and real-time GTIN/LOT/EXP
 *   field auto-population.
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
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
          setTimeout(() => camBox.classList.remove('scan-success'), 450);
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
    
    let qtyInp = document.getElementById('qtyInput');
    if (qtyInp) qtyInp.value = '1';
    
    let custSel = document.getElementById('itemCustomerSelect');
    if (custSel) custSel.selectedIndex = 0;

    let ordInp = document.getElementById('itemOrderNumInput');
    if (ordInp) ordInp.value = '';

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

    if (refInp) {
      setTimeout(() => { try { refInp.focus(); } catch(e){} }, 50);
    }
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

    let gtin = "", lot = "", exp = "";
    lines.forEach(rawLine => {
      if (!rawLine.trim()) return;
      let clean = rawLine.replace(/^\][a-zA-Z0-9]{2}/, '').replace(/[\(\)]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
      let idx = 0;
      while (idx < clean.length) {
        if (clean.substring(idx, idx + 2) === "17" && clean.length - idx >= 8 && /^\d{6}$/.test(clean.substring(idx + 2, idx + 8))) {
          let testMm = parseInt(clean.substring(idx + 4, idx + 6), 10);
          // STRICT MONTH VALIDATION: Ensure month is 01-12 to prevent matching inside "2017" variant strings
          if (testMm >= 1 && testMm <= 12) {
            if (!exp) {
              let rawExp = clean.substring(idx + 2, idx + 8);
              let yy = parseInt(rawExp.substring(0, 2), 10);
              let year = yy < 50 ? (2000 + yy) : (1900 + yy);
              exp = `${year}-${rawExp.substring(2, 4)}-${rawExp.substring(4, 6)}`;
            }
            idx += 8;
          } else {
            idx++;
          }
        } else if (clean.substring(idx, idx + 2) === "01" && clean.length - idx >= 16 && /^\d{14}$/.test(clean.substring(idx + 2, idx + 16))) {
          if (!gtin) gtin = clean.substring(idx + 2, idx + 16);
          idx += 16;
        } else if (clean.substring(idx, idx + 2) === "10") {
          if (!lot) lot = clean.substring(idx + 2);
          break;
        } else if (/^\d{12,14}$/.test(clean)) {
          if (!gtin) gtin = clean;
          break;
        } else {
          idx++;
        }
      }
    });

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
