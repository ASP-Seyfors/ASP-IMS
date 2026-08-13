/* ======================================================================= */
/* ASP SCANNER APP - UI MANAGER (js/UIManager.js)                          */
/* VERSION 2.2.1                                                           */
/* ======================================================================= */
const UIManager = {
  loadSavedTheme() {
    let savedTheme = localStorage.getItem('asp_app_theme') || 'slate';
    this.changeAppTheme(savedTheme);
  },

  changeAppTheme(themeName) {
    document.body.classList.remove('theme-sage', 'theme-gold', 'theme-slate');
    document.body.classList.add(`theme-${themeName}`);
    localStorage.setItem('asp_app_theme', themeName);
    let sel = document.getElementById('themeSelect');
    if (sel) sel.value = themeName;
  },

  changeFontSize(sizeVal) {
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${sizeVal}`);
    localStorage.setItem('asp_font_size', sizeVal);
  },

  loadFontPreference() {
    let savedSize = localStorage.getItem('asp_font_size') || 'medium';
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add(`font-${savedSize}`);
    let fontSelect = document.getElementById('fontSizeSelect');
    if (fontSelect) fontSelect.value = savedSize;
  },

  toggleSessionType() {
    const type = document.querySelector('input[name="sessionType"]:checked').value;
    document.getElementById('rowSupplier').style.display = type === 'Shipment' ? 'flex' : 'none';
    document.getElementById('rowCustomer').style.display = type === 'Order' ? 'flex' : 'none';
    document.getElementById('rowProcess').style.display = type === 'Order' ? 'flex' : 'none';
  },

  formatExpDate(inputEl) {
    let val = inputEl.value.replace(/\D/g, ''); 
    if (!val) return;
    if(val.length >= 8) {
        let mm = val.substring(0,2), dd = val.substring(2,4), yyyy = val.substring(4,8);
        if (parseInt(val.substring(0,4)) > 1900) { yyyy = val.substring(0,4); mm = val.substring(4,6); dd = val.substring(6,8); }
        inputEl.value = `${yyyy}-${mm}-${dd}`;
    } else if (val.length === 6) {
        let yy = val.substring(4,6);
        let year = parseInt(yy) < 50 ? (2000 + parseInt(yy)) : (1900 + parseInt(yy));
        inputEl.value = `${year}-${val.substring(0,2)}-${val.substring(2,4)}`;
    }
    this.evaluateFieldAttention();
  },

  toggleNA(fieldId, chkId) {
    let field = document.getElementById(fieldId);
    let chk = document.getElementById(chkId);
    if (!field || !chk) return;
    if (chk.checked) { field.value = "N/A"; field.readOnly = true; field.classList.remove('needs-attention'); } 
    else { field.value = ""; field.readOnly = false; field.classList.add('needs-attention'); }
    this.evaluateFieldAttention();
  },

  toggleItemNote() {
    let chk = document.getElementById('chkItemNote');
    let row = document.getElementById('rowItemNote');
    if (chk && row) { row.style.display = chk.checked ? 'flex' : 'none'; if (!chk.checked) document.getElementById('itemNoteInput').value = ""; }
  },

  toggleSessionNote() {
    let chk = document.getElementById('chkSessionNote');
    let row = document.getElementById('rowSessionNote');
    if (chk && row) { row.style.display = chk.checked ? 'block' : 'none'; if (!chk.checked) document.getElementById('sessionNoteInput').value = ""; }
  },

  evaluateFieldAttention() {
    [{ el: document.getElementById('gtinInput'), chk: document.getElementById('chkNaGtin') },
     { el: document.getElementById('lotInput'), chk: document.getElementById('chkNaLot') },
     { el: document.getElementById('expInput'), chk: document.getElementById('chkNaExp') },
     { el: document.getElementById('refInput'), chk: null },
     { el: document.getElementById('vendorSelect'), chk: null }
    ].forEach(obj => {
      if (!obj.el) return;
      if (obj.chk && obj.chk.checked) obj.el.classList.remove('needs-attention');
      else if (!obj.el.value.trim()) obj.el.classList.add('needs-attention');
      else obj.el.classList.remove('needs-attention');
    });
    this.updateCameraOverlayStatus();
  },

  updateCameraOverlayStatus() {
    const hasGtin = document.getElementById('gtinInput').value.trim() !== '' || document.getElementById('chkNaGtin').checked;
    const hasLot = document.getElementById('lotInput').value.trim() !== '' || document.getElementById('chkNaLot').checked;
    const hasExp = document.getElementById('expInput').value.trim() !== '' || document.getElementById('chkNaExp').checked;
    if (document.getElementById('tagGtin')) document.getElementById('tagGtin').classList.toggle('captured', hasGtin);
    if (document.getElementById('tagLot')) document.getElementById('tagLot').classList.toggle('captured', hasLot);
    if (document.getElementById('tagExp')) document.getElementById('tagExp').classList.toggle('captured', hasExp);
  },

  setItemAction(act) {
    SessionManager.currentItemAction = act;
    if (document.getElementById('actBtnInv')) document.getElementById('actBtnInv').className = 'action-btn' + (act === 'Inventory' ? ' selected-inv' : '');
    if (document.getElementById('actBtnRes')) document.getElementById('actBtnRes').className = 'action-btn' + (act === 'Reserved' ? ' selected-res' : '');
    let tagRow = document.getElementById('rowCustomerTag');
    if (tagRow && SessionManager.currentWorkflowType.includes('Receiving & Reserving')) tagRow.style.display = (act === 'Reserved') ? 'flex' : 'none';
  },

  hideAllConfirmButtons() {
    if (document.getElementById('btnConfirmGtin')) document.getElementById('btnConfirmGtin').style.display = 'none';
    if (document.getElementById('btnConfirmMfr')) document.getElementById('btnConfirmMfr').style.display = 'none';
    if (document.getElementById('gtinDiffBanner')) document.getElementById('gtinDiffBanner').style.display = 'none';
  },

  openAuditHub() {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenAuditHub').style.display = 'block';
  },

  closeAuditHub() {
    document.getElementById('screenAuditHub').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
  },

  async triggerShareOrDownload(content, filename, mimeType) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'Export Document', accept: { [mimeType]: [filename.substring(filename.lastIndexOf('.'))] } }] });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        alert("Export successful!");
        return;
      } catch (err) { if (err.name === 'AbortError') return; }
    }
    let file = new File([content], filename, { type: mimeType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { console.warn("Share fallback."); }
    }
    try {
        let blob = new Blob([content], { type: mimeType });
        let a = document.createElement('a'); let url = window.URL.createObjectURL(blob);
        a.style.display = 'none'; a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
        alert("Export successfully saved to Downloads!");
    } catch (e) { alert("Export failed: " + e.message); }
  }
};
