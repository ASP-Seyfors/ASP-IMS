/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/qboManager.js
 * Description: QuickBooks Online integration and staged order polling.
 * ======================================================================= */
const QboManager = {
  fetchedStagedData: {},

  async fetchStagedSessions(silent = false) {
    if (!ApiManager.getActiveFeederUrl() || ApiManager.getActiveFeederUrl().includes("YOUR_")) return;

    this.fetchedStagedData = {};
    let manualData = { stagedSessions: {} };
    let qboData = { stagedSessions: {} };

    try {
      let feederUrl = ApiManager.getActiveFeederUrl();
      let joiner = feederUrl.includes('?') ? '&' : '?';
      let manualRes = await fetch(`${feederUrl}${joiner}t=${Date.now()}`);
      let manualText = await manualRes.text();
      if (manualText.trim().startsWith('{')) manualData = JSON.parse(manualText);
    } catch (e) { console.warn("Manual Orders Feed failed:", e); }

    try {
      let qboRes = await fetch(`${ApiManager.getActiveArchiveUrl()}?action=GET_QBO_FEED&t=${Date.now()}`);
      let qboText = await qboRes.text();
      if (qboText.trim().startsWith('{')) qboData = JSON.parse(qboText);
    } catch (e) { console.warn("QBO Feed failed:", e); }

    this.fetchedStagedData = { ...(manualData.stagedSessions || {}), ...(qboData.stagedSessions || {}) };
    
    if (manualData.customerAnalytics) {
      localStorage.setItem('asp_remote_analytics', JSON.stringify(manualData.customerAnalytics));
      localStorage.setItem('asp_remote_customers', JSON.stringify(manualData.customerList));
    }
    
    let select = document.getElementById('stagedOrdersSelect');
    if (select) {
      select.innerHTML = '<option value="">-- Select Staged Order --</option>';
      let count = 0;
      for (let sessionName in this.fetchedStagedData) {
        let sessionObj = this.fetchedStagedData[sessionName];
        let items = Array.isArray(sessionObj) ? sessionObj : (sessionObj.items || []);
        if (sessionObj.isCompleted === true || sessionObj.status === 'COMPLETED') continue;

        let opt = document.createElement('option');
        opt.value = sessionName;
        opt.textContent = `📦 ${sessionName} (${items.length} items)`;
        select.appendChild(opt);
        count++;
      }

      if (typeof UIManager !== 'undefined' && UIManager.populateCustomerDropdown) UIManager.populateCustomerDropdown();

      if (!silent) {
        if (count > 0) alert(`Successfully synced! Found ${count} staged orders and updated Customer Analytics.`);
        else alert("Synced successfully, but no staged orders found in either feed.");
      }
    }
  },

  async triggerQboSync(event, silent = false) {
    if (typeof AuthManager === 'undefined' || !AuthManager.currentUser || !AuthManager.currentUser.isAdmin) {
      if (!silent) alert("Access Denied: You must be an Administrator to run QuickBooks automations.");
      return;
    }
    
    const btn = event ? event.target : null;
    const originalText = btn ? btn.textContent : "Fetch QBO";
    if (btn && !silent) { btn.textContent = "⏳ Fetching QBO..."; btn.disabled = true; btn.style.opacity = "0.7"; }

    try {
      let res = await fetch(ApiManager.getActiveArchiveUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
        body: JSON.stringify({ action: "FETCH_QBO" })
      });
      
      let data = await res.json();
      if (data.status === "error") throw new Error(data.message);

      await this.fetchStagedSessions(true);

      if (!silent) {
          if (data.count === 0) alert("✅ Sync Complete! No pending open invoices currently staged.");
          else alert(`✅ QuickBooks Sync Complete! You have ${data.count} open invoice(s) pending fulfillment.`);
      }
    } catch (err) {
      if (!silent) alert("Error triggering QBO Sync: " + err.message);
    } finally {
      if (btn && !silent) { btn.textContent = originalText; btn.disabled = false; btn.style.opacity = "1"; }
    }
  },

  loadSelectedStagedOrder(sessionName) {
    if (!sessionName || !this.fetchedStagedData[sessionName]) return;
    
    let sessionObj = this.fetchedStagedData[sessionName];
    let items = Array.isArray(sessionObj) ? sessionObj : (sessionObj.items || []);
    let isDone = sessionObj.isCompleted === true;

    if (isDone) {
      let confirmRescan = confirm(`Notice: "${sessionName}" is already marked as COMPLETED in your logs.\n\nDo you want to re-load this order into the Pre-Load Manifest for a re-scan?`);
      if (!confirmRescan) {
        document.getElementById('stagedOrdersSelect').value = "";
        return;
      }
    }

    let chk = document.getElementById('chkPreloadManifest');
    if (chk) chk.checked = true;
    
    let detailsInput = document.getElementById('orderDetailsInput');
    if (detailsInput) detailsInput.value = sessionName;
    
    SessionManager.expectedManifest = [];
    items.forEach(item => {
      let isRes = item.customerTag && !item.customerTag.toUpperCase().includes('SHELF');
      SessionManager.expectedManifest.push({
        ref: item.sku,
        expectedQty: item.qty,
        isReserved: isRes,
        customerTag: item.customerTag || '',
        reservedQty: item.qty,
        allocations: isRes ? [{ customerTag: item.customerTag, reservedQty: item.qty }] : []
      });
    });

    localStorage.setItem('asp_active_manifest', JSON.stringify(SessionManager.expectedManifest));
    alert(`Loaded "${sessionName}" with ${items.length} items into Pre-Load Manifest!`);
  },

  async pushQboWriteBack(sessionObj) {
    if (!ApiManager.getActiveFeederUrl() || ApiManager.getActiveFeederUrl().includes("YOUR_")) return; 
    if (!sessionObj.orderNum) return;
    
    try {
      await fetch(ApiManager.getActiveArchiveUrl(), { 
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: "QBO_WRITEBACK", payload: sessionObj })
      });
    } catch (err) {}

    try {
      await fetch(ApiManager.getActiveFeederUrl(), { 
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: "COMPLETE_SESSION", sessionName: sessionObj.sessionName, orderNum: sessionObj.orderNum })
      });
    } catch (err) {}
  },

  bindOrderInputListener() {
    let orderInput = document.getElementById('orderDetailsInput');
    if (orderInput) {
      orderInput.addEventListener('change', (e) => {
        let val = e.target.value.trim().toUpperCase();
        if (!val) return;
        
        let typeRadio = document.querySelector('input[name="sessionType"]:checked');
        let wType = document.getElementById('workflowTypeSelect').value;
        if (!typeRadio || typeRadio.value !== 'Order' || wType !== 'Picking & Packing') return;
        
        let match = Object.keys(this.fetchedStagedData).find(key => key.toUpperCase().includes(val));
        
        if (match) {
          let isDone = this.fetchedStagedData[match].isCompleted === true;
          if (isDone) return; 

          UIManager.showCustomConfirm(
            "Order Found",
            `📦 Order ${val} found in the QBO Feed!\n\nWould you like to auto-fill the customer and pre-load the expected items for packing?`,
            () => {
              let customerName = match.split('-')[0].trim();
              let custSelect = document.getElementById('customerSelect');
              if (custSelect) {
                 let opt = Array.from(custSelect.options).find(o => o.value.toUpperCase() === customerName.toUpperCase());
                 if (opt) custSelect.value = opt.value;
              }
              document.getElementById('chkPreloadManifest').checked = true;
              this.loadSelectedStagedOrder(match);
            }
          );
        }
      });
    }
  }
};