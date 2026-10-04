/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/shippingManager.js
 * Description: Calculates Suture Box math (Weight/Dimensions) and 
 *              manages the final FedEx/UPS shipping intercept.
 * ======================================================================= */
const ShippingManager = {
    currentLoadedAddressState: "", 

    openModal() {
        this.populateCustomerLogistics();
        this.recalculateBoxMath();
        this.populateAddressDropdown();
        this.updateCarrierUI(); 
        document.getElementById('shipmentManagerModal').style.display = 'flex';
    },
    
    // ✨ PASTE THESE 4 NEW FUNCTIONS HERE:
    captureAddressState() {
        let state = [
            document.getElementById('shipAddressCompany').value.trim(),
            document.getElementById('shipAddressContact').value.trim(),
            document.getElementById('shipAddressEmail') ? document.getElementById('shipAddressEmail').value.trim() : "",
            document.getElementById('shipAddressPhone') ? document.getElementById('shipAddressPhone').value.trim() : "",
            document.getElementById('shipAddress1').value.trim(),
            document.getElementById('shipAddress2').value.trim(),
            document.getElementById('shipAddressCity').value.trim(),
            document.getElementById('shipAddressState').value.trim(),
            document.getElementById('shipAddressZip').value.trim(),
            document.getElementById('shipAddressCountry') ? document.getElementById('shipAddressCountry').value.trim() : "US",
            document.getElementById('shipCarrier').value,
            document.getElementById('shipAccountNum').value.trim(),
            document.getElementById('shipInstructions').value.trim()
        ].join('|');
        this.currentLoadedAddressState = state;
    },

    hasAddressChanged() {
        let currentState = [
            document.getElementById('shipAddressCompany').value.trim(),
            document.getElementById('shipAddressContact').value.trim(),
            document.getElementById('shipAddressEmail') ? document.getElementById('shipAddressEmail').value.trim() : "",
            document.getElementById('shipAddressPhone') ? document.getElementById('shipAddressPhone').value.trim() : "",
            document.getElementById('shipAddress1').value.trim(),
            document.getElementById('shipAddress2').value.trim(),
            document.getElementById('shipAddressCity').value.trim(),
            document.getElementById('shipAddressState').value.trim(),
            document.getElementById('shipAddressZip').value.trim(),
            document.getElementById('shipAddressCountry') ? document.getElementById('shipAddressCountry').value.trim() : "US",
            document.getElementById('shipCarrier').value,
            document.getElementById('shipAccountNum').value.trim(),
            document.getElementById('shipInstructions').value.trim()
        ].join('|');
        return this.currentLoadedAddressState !== currentState;
    },

    async checkUnsavedChanges(continueCallback) {
        if (!this.hasAddressChanged()) {
            continueCallback();
            return;
        }

        let overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
        overlay.innerHTML = `
          <div style="background:#fff; border-radius:8px; width:100%; max-width:420px; padding:20px; text-align:center; box-shadow:0 4px 20px rgba(0,0,0,0.5);">
            <h3 style="color:#0277bd; margin-top:0;">💾 Unsaved Address Changes</h3>
            <p style="color:#555; font-size:0.95rem; margin-bottom:20px;">You modified the shipping or account details for this customer. Do you want to save these changes to the Address Book?</p>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <button id="btnSaveAndCont" style="background:#2e7d32; color:#fff; border:none; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer;">Save to Address Book & Continue</button>
              <button id="btnSkipAndCont" style="background:#f57f17; color:#fff; border:none; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Skip Saving (Just Continue)</button>
              <button id="btnCancelCont" style="background:#757575; color:#fff; border:none; padding:10px; border-radius:4px; cursor:pointer;">Cancel</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        document.getElementById('btnSaveAndCont').onclick = async () => {
            document.body.removeChild(overlay);
            await this.saveAddressBookEntry(true); 
            this.captureAddressState(); 
            continueCallback();
        };
        document.getElementById('btnSkipAndCont').onclick = () => {
            document.body.removeChild(overlay);
            this.captureAddressState(); 
            continueCallback();
        };
        document.getElementById('btnCancelCont').onclick = () => {
            document.body.removeChild(overlay);
        };
    },

    handleCompanyAccountToggle() {
        let chk = document.getElementById('chkUseCompanyAccount');
        let acctInput = document.getElementById('shipAccountNum');
        let currentVal = acctInput.value.trim().toUpperCase();

        if (chk.checked) {
            if (currentVal && currentVal !== "N/A" && currentVal !== "NA" && currentVal !== "ASP_ACCNT") {
                if (!confirm(`An account number (${currentVal}) is already entered.\n\nAre you sure you want to override this and use the ASP Company Account to purchase the label?`)) {
                    chk.checked = false;
                    return;
                }
            }
            acctInput.value = "ASP_ACCNT";
            acctInput.readOnly = true;
            acctInput.style.backgroundColor = "#e3f2fd"; 
            acctInput.style.color = "#0277bd";
            acctInput.style.fontWeight = "bold";
        } else {
            if (currentVal === "ASP_ACCNT") {
                acctInput.value = "";
            }
            acctInput.readOnly = false;
            acctInput.style.backgroundColor = "";
            acctInput.style.color = "";
            acctInput.style.fontWeight = "";
        }
        this.resetQuoteUI();
    },

    async populateCustomerLogistics() {
        let baseName = SessionManager.currentSessionName.split('(')[0].trim().toUpperCase();
        let rules = DatabaseManager.shippingRules[baseName] || {};
        
        let safeSet = (id, val) => { let el = document.getElementById(id); if (el) el.value = val || ''; };
        
        // Strict mapping with fallback to blank '' strings
        safeSet('shipCustName', rules.contactId || baseName);
        safeSet('shipAddressCompany', rules.formalCompany || baseName); 
        
        let acctVal = rules.account || '';
        safeSet('shipAccountNum', acctVal);
        let chkCo = document.getElementById('chkUseCompanyAccount');
        let acctInput = document.getElementById('shipAccountNum');
        if (chkCo && acctInput) {
            if (acctVal.toUpperCase() === 'ASP_ACCNT') {
                chkCo.checked = true;
                acctInput.readOnly = true;
                acctInput.style.backgroundColor = "#e3f2fd";
                acctInput.style.color = "#0277bd";
                acctInput.style.fontWeight = "bold";
            } else {
                chkCo.checked = false;
                acctInput.readOnly = false;
                acctInput.style.backgroundColor = "";
                acctInput.style.color = "";
                acctInput.style.fontWeight = "";
            }
        }

        safeSet('shipInstructions', rules.notes || '');
        safeSet('shipAddressContact', rules.contactName || '');
        safeSet('shipAddressEmail', rules.email || '');
        safeSet('shipAddressPhone', rules.phone || '');
        
        let carrierSel = document.getElementById('shipCarrier');
        if (carrierSel) {
            if (rules.method) {
                let opt = Array.from(carrierSel.options).find(o => o.value.toUpperCase() === rules.method.toUpperCase());
                if (opt) carrierSel.value = opt.value;
            } else {
                carrierSel.selectedIndex = 0; // Reset to default FedEx if no rule
            }
            this.updateCarrierUI(); 
        }

        safeSet('shipAddress1', rules.address1 || '');
        safeSet('shipAddress2', rules.address2 || '');
        safeSet('shipAddressCity', rules.city || '');
        safeSet('shipAddressState', rules.state || '');
        safeSet('shipAddressZip', rules.zip || '');
        safeSet('shipAddressCountry', rules.country || 'US'); 

        // ✨ FIX: Force the UI to instantly abbreviate the state it just loaded
        this.formatStateUI('shipAddressState');

        this.captureAddressState();
    },

    updateCarrierUI() {
        this.resetQuoteUI(); // ✨ Swapped the ghost function for the correct UI reset
        let carrier = document.getElementById('shipCarrier').value.toUpperCase();
        let btn = document.getElementById('btnGenerateLabel');
        if (!btn) return;

        if (carrier.includes('UPS')) {
            btn.innerHTML = `<i data-lucide="printer"></i> Purchase UPS Label`;
            btn.onclick = () => ShippingManager.checkUnsavedChanges(() => ShippingManager.generateUPSLabel());
            btn.style.backgroundColor = "#ffb300"; 
            btn.style.color = "#000";
        } else {
            btn.innerHTML = `<i data-lucide="printer"></i> Purchase FedEx Label`;
            btn.onclick = () => ShippingManager.checkUnsavedChanges(() => ShippingManager.generateFedExLabel());
            btn.style.backgroundColor = "#2e7d32"; 
            btn.style.color = "#fff";
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    // ✨ NEW: Resets the UI so the user is forced to click "Calculate" again if they change a setting
    resetQuoteUI() {
        let calcBtn = document.getElementById('btnCalculateRate');
        let priceBox = document.getElementById('shipPriceDisplay');
        let buyBtn = document.getElementById('btnGenerateLabel');
        let accountInput = document.getElementById('shipAccountNum');
        
        let isNA = false;
        if (accountInput) {
            let acctVal = accountInput.value.trim().toUpperCase();
            if (acctVal === "N/A" || acctVal === "NA" || acctVal === "") isNA = true;
        }

        if (calcBtn && priceBox) {
            calcBtn.style.display = 'flex';
            calcBtn.disabled = isNA;
            
            // ✨ THE FIX: Dynamically lock the button if Account is N/A
            if (isNA) {
                calcBtn.innerHTML = `<i data-lucide="lock" style="width:20px; height:20px;"></i> Account N/A - Quoting Disabled`;
                calcBtn.style.backgroundColor = "#757575";
                calcBtn.style.cursor = "not-allowed";
            } else {
                calcBtn.innerHTML = `<i data-lucide="calculator" style="width:20px; height:20px;"></i> Recalculate Rate`;
                calcBtn.style.backgroundColor = "#0277bd";
                calcBtn.style.cursor = "pointer";
            }
            priceBox.style.display = 'none';
        }
        
        if (buyBtn) {
            buyBtn.style.display = 'flex'; 
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    // ✨ NEW: The Master Rate Calculator Function (With Soft Validation Warnings)
    async calculateShippingRate() {
        let btn = document.getElementById('btnCalculateRate');
        let priceBox = document.getElementById('shipPriceDisplay');
        let costText = document.getElementById('shipEstimatedCost');
        let valBadge = document.getElementById('shipValidationBadge');
        
        let origHtml = btn.innerHTML;
        btn.innerHTML = "⏳ Quoting...";
        btn.disabled = true;

        try {
            let isResidential = document.querySelector('input[name="shipAddressType"]:checked').value === 'residential';
            let serviceType = document.getElementById('shipServiceType').value;

            // STEP 1: Validate Address (Soft Check)
            let valPayload = {
                action: "VALIDATE_ADDRESS",
                payload: {
                    street: document.getElementById('shipAddress1').value.trim(),
                    street2: document.getElementById('shipAddress2').value.trim(),
                    city: document.getElementById('shipAddressCity').value.trim(),
                    state: document.getElementById('shipAddressState').value.trim(),
                    zip: document.getElementById('shipAddressZip').value.trim(),
                    country: document.getElementById('shipAddressCountry').value.trim() || "US"
                }
            };

            let valData = { status: "error", isValid: false };
            try {
                let valRes = await fetch(SessionManager.getActiveArchiveUrl(), {
                    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(valPayload)
                });
                let valText = await valRes.text();
                valData = JSON.parse(valText);
            } catch(e) {
                console.warn("Address Validation bypassed due to network/server delay.");
            }

            let isValidAddress = (valData.status === "success" && valData.isValid);

            // If FedEx corrects the residential status, update our UI to match
            if (valData.status === "success" && valData.isResidential !== isResidential) {
                let resRadio = document.querySelector(`input[name="shipAddressType"][value="${valData.isResidential ? 'residential' : 'commercial'}"]`);
                if (resRadio) resRadio.checked = true;
                isResidential = valData.isResidential;
            }

            // STEP 2: Fetch Live Rate Quote (Using only Zip & Country)
            let quotePayload = {
                action: "GET_FEDEX_RATE",
                payload: {
                    zip: document.getElementById('shipAddressZip').value.trim(),
                    country: document.getElementById('shipAddressCountry').value.trim() || "US",
                    serviceType: serviceType,
                    isResidential: isResidential,
                    account: document.getElementById('shipAccountNum').value.trim(),
                    totalWeight: document.getElementById('shipWeight').value,
                    dimL: document.getElementById('shipDimL').value || 12,
                    dimW: document.getElementById('shipDimW').value || 6,
                    dimH: document.getElementById('shipDimH').value || 6
                }
            };

            let rateRes = await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(quotePayload)
            });
            
            let rateText = await rateRes.text();
            let rateData;
            try {
                rateData = JSON.parse(rateText);
            } catch(e) {
                throw new Error("Google Apps Script returned an invalid HTML response. The server may be busy.");
            }

            // STEP 3: Render the Price and Badges
            if (rateData.status === "success") {
                btn.style.display = 'none';
                priceBox.style.display = 'flex';
                costText.innerText = "$" + parseFloat(rateData.netCharge).toFixed(2);
                
                if (isValidAddress) {
                    valBadge.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px; vertical-align:text-bottom;"></i> Validated ${isResidential ? "Residential" : "Commercial"} Address`;
                    valBadge.style.color = "#2e7d32";
                } else {
                    // Show the warning, but don't block the rate quote!
                    valBadge.innerHTML = `<i data-lucide="alert-triangle" style="width:14px; height:14px; vertical-align:text-bottom;"></i> Unverified ${isResidential ? "Residential" : "Commercial"} Address`;
                    valBadge.style.color = "#f57f17"; 
                }
            } else {
                UIManager.showCustomAlert("Rate Quote Failed", rateData.message, true);
            }

        } catch (err) {
            UIManager.showCustomAlert("Connection Error", err.message, true);
        } finally {
            if (btn) {
                btn.innerHTML = origHtml;
                btn.disabled = false;
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    },
    
    async generateFedExLabel() {
        let btn = document.getElementById('btnGenerateLabel');
        let origText = btn.innerHTML;
        if (btn) { btn.innerHTML = "⏳ Requesting FedEx Label..."; btn.disabled = true; }

        try {
            let serviceType = document.getElementById('shipServiceType').value;
            let isResidential = document.querySelector('input[name="shipAddressType"]:checked').value === 'residential';
            if (serviceType === 'FEDEX_GROUND' && isResidential) serviceType = 'GROUND_HOME_DELIVERY';

            let payload = {
                action: "CREATE_SHIPMENT", // (Or CREATE_UPS_SHIPMENT)
                payload: {
                    customerName: document.getElementById('shipAddressCompany').value.trim(),
                    contactName: document.getElementById('shipAddressContact').value.trim(),
                    orderNum: SessionManager.currentOrderNum || "N/A",
                    totalWeight: document.getElementById('shipWeight').value,
                    dimL: document.getElementById('shipDimL').value || "",
                    dimW: document.getElementById('shipDimW').value || "",
                    dimH: document.getElementById('shipDimH').value || "",
                    street: document.getElementById('shipAddress1').value.trim() + " " + document.getElementById('shipAddress2').value.trim(),
                    city: document.getElementById('shipAddressCity').value.trim(),
                    state: document.getElementById('shipAddressState').value.trim(),
                    zip: document.getElementById('shipAddressZip').value.trim(),
                    country: document.getElementById('shipAddressCountry').value.trim(), // ✨ NEW
                    serviceType: serviceType,
                    isResidential: isResidential,
                    account: document.getElementById('shipAccountNum').value.trim()
                }
            };

            let res = await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            
            let data = await res.json();
            if (data.status === "success") {
                let byteCharacters = atob(data.label);
                let byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
                let byteArray = new Uint8Array(byteNumbers);
                let fileBlob = new Blob([byteArray], { type: 'application/pdf' });
                let blobUrl = URL.createObjectURL(fileBlob);
                
                let printWindow = window.open(blobUrl, "_blank");
                if (!printWindow) alert("Pop-up blocked! Please allow pop-ups to view your shipping label.");
                
                this.skipAndComplete(true);
            } else {
                throw new Error(data.message || "FedEx API rejected the request.");
            }
        } catch (err) {
            // ✨ GRACEFUL FALLBACK: Log error, open carrier website manually, allow tracking log
            console.error("FedEx API Connection Failed:", err);
            window.open('https://www.fedex.com/shipping/get-started', '_blank');
            
            UIManager.showCustomAlert("FedEx Connection Notice", 
                `<div style="text-align:left; font-size:13px; color:#333;">
                    <b>Automated FedEx label generation encountered an issue:</b><br>
                    <span style="color:#c62828; font-family:monospace; font-size:0.8rem;">${err.message}</span><br><br>
                    We have opened <b>FedEx.com</b> in a new tab so you can generate the label directly.<br><br>
                    <i>Once complete, return here and click <b>Log Tracking Only</b> to record the tracking number.</i>
                </div>`, true);
        } finally {
            if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        }
    },

    async generateUPSLabel() {
        let btn = document.getElementById('btnGenerateLabel');
        let origText = btn.innerHTML;
        if (btn) { btn.innerHTML = "⏳ Contacting UPS API..."; btn.disabled = true; }

        try {
            // ✨ ADD THESE TWO MISSING LINES TO DEFINE THE VARIABLES
            let serviceType = document.getElementById('shipServiceType').value;
            let isResidential = document.querySelector('input[name="shipAddressType"]:checked').value === 'residential';

            // Attempt backend UPS call (ready for tomorrow's testing)
            let payload = {
                action: "CREATE_UPS_SHIPMENT",
                payload: {
                    customerName: document.getElementById('shipAddressCompany').value.trim(),
                    contactName: document.getElementById('shipAddressContact').value.trim(),
                    orderNum: SessionManager.currentOrderNum || "N/A",
                    totalWeight: document.getElementById('shipWeight').value,
                    dimL: document.getElementById('shipDimL').value || "",
                    dimW: document.getElementById('shipDimW').value || "",
                    dimH: document.getElementById('shipDimH').value || "",
                    street: document.getElementById('shipAddress1').value.trim() + " " + document.getElementById('shipAddress2').value.trim(),
                    city: document.getElementById('shipAddressCity').value.trim(),
                    state: document.getElementById('shipAddressState').value.trim(),
                    zip: document.getElementById('shipAddressZip').value.trim(),
                    country: document.getElementById('shipAddressCountry').value.trim(), // ✨ NEW
                    serviceType: serviceType,
                    isResidential: isResidential,
                    account: document.getElementById('shipAccountNum').value.trim()
                }
            };

            let res = await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            
            let data = await res.json();
            if (data.status === "success") {
                // If backend succeeds tomorrow, handle label print
                this.skipAndComplete(true);
            } else {
                throw new Error(data.message || "UPS Sandbox token syncing.");
            }
        } catch (err) {
            // ✨ GRACEFUL FALLBACK: Catches sandbox or auth errors without crashing
            console.warn("UPS API Connection Notice:", err.message);
            window.open('https://www.ups.com/ship', '_blank');

            let comp = document.getElementById('shipAddressCompany').value.trim() || document.getElementById('shipCustName').value.trim();
            let street = document.getElementById('shipAddress1').value.trim() + " " + document.getElementById('shipAddress2').value.trim();
            let city = document.getElementById('shipAddressCity').value.trim();
            let state = document.getElementById('shipAddressState').value.trim();
            let zip = document.getElementById('shipAddressZip').value.trim();
            let weight = document.getElementById('shipWeight').value;

            UIManager.showCustomAlert("UPS Manual Processing Notice", 
                `<div style="text-align:left; font-size:13px; color:#333;">
                    <b>UPS API handshake is currently syncing.</b><br><br>
                    We have opened <b>UPS.com/ship</b> in a new tab. Please use these details to generate your label:<br>
                    <b>To:</b> ${comp}<br>
                    <b>Address:</b> ${street}, ${city}, ${state} ${zip}<br>
                    <b>Weight:</b> ${weight} lbs<br><br>
                    <i>Once you have your label, click <b>Log Tracking Only</b> to save it to the database.</i>
                </div>`, false);
        } finally {
            if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        }
    },

    populateAddressDropdown() {
        let select = document.getElementById('shipAddressBookSelect');
        if (!select) return;
        select.innerHTML = '<option value="">-- Load Saved Address --</option>';
        
        let addresses = Object.keys(DatabaseManager.shippingRules).sort();
        addresses.forEach(cust => {
            let opt = document.createElement('option');
            opt.value = cust;
            opt.textContent = cust;
            select.appendChild(opt);
        });
    },

    loadFromAddressBook(customerName) {
        let safeSet = (id, val) => { let el = document.getElementById(id); if (el) el.value = val || ''; };

        // If they click the "-- Load Saved Address --" header, instantly wipe everything
        if (!customerName) {
            safeSet('shipCustName', ''); safeSet('shipAddressCompany', ''); safeSet('shipAccountNum', '');
            safeSet('shipInstructions', ''); safeSet('shipAddressContact', ''); safeSet('shipAddressEmail', '');
            safeSet('shipAddressPhone', ''); safeSet('shipAddress1', ''); safeSet('shipAddress2', '');
            safeSet('shipAddressCity', ''); safeSet('shipAddressState', ''); safeSet('shipAddressZip', '');
            safeSet('shipAddressCountry', '');
            
            let chkCo = document.getElementById('chkUseCompanyAccount');
            let acctInput = document.getElementById('shipAccountNum');
            if (chkCo) chkCo.checked = false;
            if (acctInput) {
                acctInput.readOnly = false;
                acctInput.style.backgroundColor = "";
                acctInput.style.color = "";
                acctInput.style.fontWeight = "";
            }

            let carrierSel = document.getElementById('shipCarrier');
            if (carrierSel) { carrierSel.selectedIndex = 0; this.updateCarrierUI(); }
            
            this.captureAddressState();
            return;
        }

        let rules = DatabaseManager.shippingRules[customerName.toUpperCase()] || {};
        
        safeSet('shipCustName', rules.contactId || customerName);
        safeSet('shipAddressCompany', rules.formalCompany || customerName);
        
        let acctVal = rules.account || '';
        safeSet('shipAccountNum', acctVal);
        let chkCo = document.getElementById('chkUseCompanyAccount');
        let acctInput = document.getElementById('shipAccountNum');
        if (chkCo && acctInput) {
            if (acctVal.toUpperCase() === 'ASP_ACCNT') {
                chkCo.checked = true;
                acctInput.readOnly = true;
                acctInput.style.backgroundColor = "#e3f2fd";
                acctInput.style.color = "#0277bd";
                acctInput.style.fontWeight = "bold";
            } else {
                chkCo.checked = false;
                acctInput.readOnly = false;
                acctInput.style.backgroundColor = "";
                acctInput.style.color = "";
                acctInput.style.fontWeight = "";
            }
        }

        safeSet('shipInstructions', rules.notes || '');
        safeSet('shipAddressContact', rules.contactName || '');
        safeSet('shipAddressEmail', rules.email || '');
        safeSet('shipAddressPhone', rules.phone || '');
        
        let carrierSel = document.getElementById('shipCarrier');
        if (carrierSel) {
            if (rules.method) {
                let opt = Array.from(carrierSel.options).find(o => o.value.toUpperCase() === rules.method.toUpperCase());
                if (opt) carrierSel.value = opt.value;
            } else {
                carrierSel.selectedIndex = 0;
            }
            this.updateCarrierUI(); 
        }

        safeSet('shipAddress1', rules.address1 || '');
        safeSet('shipAddress2', rules.address2 || '');
        safeSet('shipAddressCity', rules.city || '');
        safeSet('shipAddressState', rules.state || '');
        safeSet('shipAddressZip', rules.zip || '');
        safeSet('shipAddressCountry', rules.country || 'US'); 

        // ✨ FIX: Force the UI to instantly abbreviate the state it just loaded
        this.formatStateUI('shipAddressState');

        this.captureAddressState();
    },

    async saveAddressBookEntry(silent = false) {
        let custName = document.getElementById('shipCustName').value.trim() || document.getElementById('shipAddressCompany').value.trim();
        if (!custName) {
            if (!silent) UIManager.showCustomAlert("Error", "Please provide a Customer ID/Name.");
            return;
        }

        let existingRule = DatabaseManager.shippingRules[custName.toUpperCase()];

        const executeSave = async () => {
            let btn = document.getElementById('btnSaveAddress');
            let origText = btn.innerHTML;
            btn.innerHTML = "⏳ Saving...";
            btn.disabled = true;

            let newRules = {
                formalCompany: document.getElementById('shipAddressCompany').value.trim(), 
                contactName: document.getElementById('shipAddressContact').value.trim(),
                contactId: custName, 
                email: document.getElementById('shipAddressEmail') ? document.getElementById('shipAddressEmail').value.trim() : "", 
                phone: document.getElementById('shipAddressPhone') ? document.getElementById('shipAddressPhone').value.trim() : "", 
                address1: document.getElementById('shipAddress1').value.trim(),
                address2: document.getElementById('shipAddress2').value.trim(),
                city: document.getElementById('shipAddressCity').value.trim(),
                state: document.getElementById('shipAddressState').value.trim(),
                zip: document.getElementById('shipAddressZip').value.trim(),
                country: document.getElementById('shipAddressCountry').value.trim() || "US",
                method: document.getElementById('shipCarrier').value,
                account: document.getElementById('shipAccountNum').value.trim(),
                notes: document.getElementById('shipInstructions').value.trim()
            };

            let payload = {
                action: "SAVE_SHIPPING_INFO",
                payload: {
                    customerName: custName, 
                    ...newRules
                }
            };

            try {
                let res = await fetch(SessionManager.getActiveArchiveUrl(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
                let data = await res.json();
                
                if (data.status === "success") {
                    DatabaseManager.shippingRules[custName.toUpperCase()] = newRules;
                    this.populateAddressDropdown();
                    this.captureAddressState(); // ✨ INJECTED: Update baseline after saving
                    if (!silent) UIManager.showCustomAlert("Success", "✅ Address book updated successfully!");
                } else {
                    if (!silent) alert("Database Error: " + data.message);
                }
            } catch (err) {
                if (!silent) alert("Network Error: " + err.message);
            } finally {
                btn.innerHTML = origText;
                btn.disabled = false;
            }
        };

        if (existingRule && !silent) {
            UIManager.showCustomConfirm(
                "Overwrite Shipping Info?", 
                `You already have shipping information saved for <b>${custName}</b>.<br><br>Are you sure you want to overwrite it with the current data?`, 
                executeSave
            );
        } else {
            executeSave();
        }
    },

    recalculateBoxMath() {
        let totalVol = 0, totalWeight = 0, maxLen = 0, hasNonSuture = false;

        SessionManager.scannedObjects.forEach(item => {
            let qty = item.qty, ref = item.ref.toUpperCase();
            let dbItem = DatabaseManager.db.find(i => (i.sku || i.ref || '').toUpperCase() === ref) || {};
            let isSuture = (dbItem.category || '').toUpperCase().includes('SUTURE');
            let w = 0, l = 0, wd = 0, h = 0, vol = 0;

            if (isSuture) {
                let lastChar = ref.slice(-1);
                if (lastChar === 'G') { w = 0.35; l = 5.5; wd = 2.5; h = 2.5; vol = 34.375; }
                else if (lastChar === 'T') { w = 0.65; l = 5.5; wd = 4.5; h = 2.5; vol = 61.875; }
                else if (lastChar === 'H') { w = 1.15; l = 22.0; wd = 7.5; h = 2.0; vol = 330.0; }
                else { w = 0.5; l = 6.0; wd = 4.0; h = 4.0; vol = 96.0; } 
            } else {
                hasNonSuture = true;
                w = parseFloat(dbItem.weight) || 0.5; l = parseFloat(dbItem.dimL) || 6.0;
                wd = parseFloat(dbItem.dimW) || 4.0; h = parseFloat(dbItem.dimH) || 4.0;
                vol = l * wd * h;
            }
            totalWeight += (w * qty); totalVol += (vol * qty);
            if (l > maxLen) maxLen = l;
        });

        let paddedVol = totalVol * 1.15;
        let selectedBox = "CUSTOM", boxDims = { l: 0, w: 0, h: 0 };
        const boxes = [
            { id: 'S', l: 12, w: 6, h: 6, vol: 432 }, 
            { id: 'XS', l: 8, w: 8, h: 8, vol: 512 },
            { id: 'M', l: 22, w: 13, h: 15, vol: 4290 },
            { id: 'L', l: 27, w: 15, h: 17, vol: 6885 }
        ];

        for (let box of boxes) {
            if (box.vol >= paddedVol && Math.max(box.l, box.w, box.h) >= maxLen) {
                selectedBox = box.id; boxDims = box; break;
            }
        }

        document.getElementById('shipBoxSize').value = selectedBox;
        if (selectedBox !== "CUSTOM") {
            document.getElementById('shipDimL').value = boxDims.l;
            document.getElementById('shipDimW').value = boxDims.w;
            document.getElementById('shipDimH').value = boxDims.h;
        }
        
        document.getElementById('shipWeight').value = totalWeight.toFixed(1);
        document.getElementById('shipWeightWarning').style.display = hasNonSuture ? 'inline-block' : 'none';
    },

    handleBoxSizeChange() {
        this.resetQuoteUI(); // ✨ Swapped the ghost function for the correct UI reset
        let val = document.getElementById('shipBoxSize').value;
        if (val === 'XS') { document.getElementById('shipDimL').value = 8; document.getElementById('shipDimW').value = 8; document.getElementById('shipDimH').value = 8; }
        else if (val === 'S') { document.getElementById('shipDimL').value = 12; document.getElementById('shipDimW').value = 6; document.getElementById('shipDimH').value = 6; }
        else if (val === 'M') { document.getElementById('shipDimL').value = 22; document.getElementById('shipDimW').value = 13; document.getElementById('shipDimH').value = 15; }
        else if (val === 'L') { document.getElementById('shipDimL').value = 27; document.getElementById('shipDimW').value = 15; document.getElementById('shipDimH').value = 17; }
    },

    generateUPSPlaceholder() {
        window.open('https://www.ups.com/ship', '_blank');

        let comp = document.getElementById('shipAddressCompany').value.trim() || document.getElementById('shipCustName').value.trim();
        let street = document.getElementById('shipAddress1').value.trim() + " " + document.getElementById('shipAddress2').value.trim();
        let city = document.getElementById('shipAddressCity').value.trim();
        let state = document.getElementById('shipAddressState').value.trim();
        let zip = document.getElementById('shipAddressZip').value.trim();
        let weight = document.getElementById('shipWeight').value;

        UIManager.showCustomAlert("UPS Manual Processing", 
            `<div style="text-align:left; font-size: 13px; color: #333;">
                Please complete the shipment on the UPS website using these details:<br><br>
                <b>To:</b> ${comp}<br>
                <b>Address:</b> ${street}, ${city}, ${state} ${zip}<br>
                <b>Weight:</b> ${weight} lbs<br><br>
                <i>Once you purchase the label from UPS, return here and click <b>Log Tracking Only</b> to save the tracking number to the database.</i>
            </div>`);
    },
    
    skipAndComplete(isLoggedElsewhere = false) {
        // ✨ NEW: If clicked via the UI "Skip" button, auto-log it to Outgoing with blank tracking fields!
        if (isLoggedElsewhere !== true) {
            let payload = {
                action: "LOG_MANUAL_TRACKING",
                payload: {
                    customerName: document.getElementById('shipAddressCompany').value.trim() || document.getElementById('shipCustName').value.trim(),
                    orderNum: SessionManager.currentOrderNum || "",
                    carrier: document.getElementById('shipCarrier') ? document.getElementById('shipCarrier').value : "Manual",
                    trackingNumber: "", // ✨ Left deliberately blank so you can fill it in on the Google Sheet later
                    totalWeight: document.getElementById('shipWeight').value || "",
                    dimL: document.getElementById('shipDimL').value || "",
                    dimW: document.getElementById('shipDimW').value || "",
                    dimH: document.getElementById('shipDimH').value || ""
                }
            };
            try {
                // Fire without awaiting so it doesn't freeze or slow down the skip UI
                fetch(SessionManager.getActiveArchiveUrl(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
            } catch(e) {}
        }

        let modal = document.getElementById('shipmentManagerModal');
        if (modal) modal.style.display = 'none';

        let btn1 = document.getElementById('btnLogTrackingOnly');
        if (btn1) { btn1.innerText = "Log Tracking Only"; btn1.disabled = false; }
        let btn2 = document.getElementById('btnGenerateLabel');
        if (btn2) { btn2.innerHTML = `<i data-lucide="printer"></i> Purchase FedEx Label`; btn2.disabled = false; }

        // Bypass the shipping intercept and finish the local scanning math
        if (typeof SessionManager !== 'undefined') SessionManager.completeSession(true, true);
    },

    async logManualTracking() {
        let trackingNum = prompt("Please paste the pre-provided tracking number:");
        
        // ✨ THE FIX: Explicitly catch the Cancel button (null) and Empty strings
        if (trackingNum === null || trackingNum.trim() === "") return;

        let btn = document.getElementById('btnLogTrackingOnly');
        let origText = btn.innerText;
        if (btn) { btn.innerText = "⏳ Logging..."; btn.disabled = true; }

        let payload = {
            action: "LOG_MANUAL_TRACKING",
            payload: {
                customerName: document.getElementById('shipAddressCompany').value.trim() || document.getElementById('shipCustName').value.trim(),
                orderNum: SessionManager.currentOrderNum || "",
                carrier: document.getElementById('shipCarrier').value,
                trackingNumber: trackingNum.trim(),
                totalWeight: document.getElementById('shipWeight').value || "",
                dimL: document.getElementById('shipDimL').value || "",
                dimW: document.getElementById('shipDimW').value || "",
                dimH: document.getElementById('shipDimH').value || ""
            }
        };

        try {
            let res = await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            
            let text = await res.text();
            let data;
            try { 
                data = JSON.parse(text); 
            } catch(e) { 
                throw new Error("Google Server busy. Please try logging the tracking number again."); 
            }
            
            if (data.status === "success") {
                this.skipAndComplete(true); 
            } else {
                UIManager.showCustomAlert("Database Error", data.message, true);
            }
        } catch (err) {
            UIManager.showCustomAlert("Network Error", err.message, true);
        } finally {
            if (btn) { btn.innerText = origText; btn.disabled = false; }
        }
    },
    
    async openIncomingModal() {
        let modal = document.getElementById('incomingShipmentModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'incomingShipmentModal';
            modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:none; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
            
            // ✨ FIX: Swapped hardcoded hex colors for dynamic CSS variables
            modal.innerHTML = `
              <div style="background:var(--card-bg, #ffffff); border-radius:8px; width:100%; max-width:550px; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.6); max-height:85vh;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #f57f17; padding:15px 20px; flex-shrink:0;">
                  <h2 style="margin:0; color:#f57f17; font-size:1.3rem;">📥 Verify Incoming Shipments</h2>
                  <button onclick="ShippingManager.skipIncomingShipments()" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:var(--text-main, #333);">&times;</button>
                </div>
                <div style="padding:15px 20px; font-size:0.95rem; color:var(--text-main, #555); background:rgba(245, 127, 23, 0.1); border-bottom:1px solid var(--border-color, #ffcc80);">
                    Check any shipments below that arrived in this delivery. This will automatically mark them as "Delivered" and "Quality Checked" in your Google Sheet.
                </div>
                <div id="incomingShipmentList" style="padding:15px 20px; overflow-y:auto; flex-grow:1; display:flex; flex-direction:column; gap:8px;">
                </div>
                <div style="padding:15px 20px; border-top:1px solid var(--border-color, #eee); display:flex; gap:10px; flex-shrink:0;">
                  <button onclick="ShippingManager.skipIncomingShipments()" style="background:#757575; color:#fff; flex:1; padding:12px; border-radius:4px; border:none; cursor:pointer; font-weight:bold;">Skip</button>
                  <button id="btnConfirmIncoming" onclick="ShippingManager.confirmIncomingShipments()" style="background:#f57f17; color:#fff; flex:2; padding:12px; border-radius:4px; border:none; cursor:pointer; font-weight:bold;">Verify Checked Items</button>
                </div>
              </div>
            `;
            document.body.appendChild(modal);
        }
        
        let list = document.getElementById('incomingShipmentList');
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-main, #0277bd);">⏳ Loading pending incoming shipments...</div>';
        modal.style.display = 'flex';
        
        try {
            let res = await fetch(`${SessionManager.getActiveArchiveUrl()}?action=GET_PENDING_SHIPMENTS`);
            let data = await res.json();
            
            if (!data.incoming || data.incoming.length === 0) {
               modal.style.display = 'none';
               // If no shipments exist, silently jump past this step
               SessionManager.completeSession(true, true, true);
               return;
            }
            
            let html = '';
            data.incoming.forEach(s => {
                let dStr = s.date ? new Date(s.date).toLocaleDateString() : 'Unknown Date';
                
                // ✨ FIX: Used a transparent background tint so the cards naturally adapt to Light/Dark mode backgrounds
                html += `
                <label style="display:flex; align-items:flex-start; gap:12px; padding:12px; border:1px solid var(--border-color, #ccc); border-radius:6px; cursor:pointer; background:rgba(128, 128, 128, 0.08); transition: background 0.2s;">
                    <input type="checkbox" class="incoming-chk" value="${s.rowIdx}" style="margin-top:2px; width:20px; height:20px; cursor:pointer;">
                    <div style="flex:1;">
                       <strong style="color:var(--primary-color, #0277bd); font-size:1.05rem;">${s.partner}</strong> <span style="color:var(--text-muted, #777); font-size:0.8rem; float:right;">${dStr}</span><br>
                       <span style="color:var(--text-main, #333); font-size:0.9rem; font-weight:bold;">PO/Invoice: ${s.po || 'N/A'}</span><br>
                       <span style="color:var(--text-muted, #777); font-size:0.85rem;">Carrier: ${s.carrier || 'N/A'} | Tracking: ${s.tracking || 'N/A'}</span>
                    </div>
                </label>
                `;
            });
            list.innerHTML = html;
        } catch (err) {
            list.innerHTML = '<div style="color:#c62828; text-align:center; padding:20px;">Failed to load shipments.</div>';
        }
    },

    skipIncomingShipments() {
        let modal = document.getElementById('incomingShipmentModal');
        if (modal) modal.style.display = 'none';
        SessionManager.completeSession(true, true, true);
    },

    async confirmIncomingShipments() {
        let checkboxes = document.querySelectorAll('.incoming-chk:checked');
        let rowIndexes = Array.from(checkboxes).map(c => c.value);
        
        if (rowIndexes.length === 0) {
            this.skipIncomingShipments();
            return;
        }
        
        let btn = document.getElementById('btnConfirmIncoming');
        let orig = btn.innerText;
        btn.innerText = "⏳ Saving..."; btn.disabled = true;
        
        let sessionNotes = document.getElementById('sessionNoteInput') ? document.getElementById('sessionNoteInput').value.trim() : "";
        
        try {
            await fetch(SessionManager.getActiveArchiveUrl(), {
                method: 'POST',
                headers: {'Content-Type': 'text/plain;charset=utf-8'},
                body: JSON.stringify({
                    action: "MARK_INCOMING_DELIVERED",
                    payload: {
                        rowIndexes: rowIndexes,
                        notes: sessionNotes
                    }
                })
            });
        } catch (e) {
            console.warn("Failed to mark incoming delivered", e);
        }
        
        document.getElementById('incomingShipmentModal').style.display = 'none';
        btn.innerText = orig; btn.disabled = false;
        
        SessionManager.completeSession(true, true, true);
    },

    // (Add this right before the final closing brace } of the ShippingManager object)
    
    formatStateUI(inputId) {
        let el = document.getElementById(inputId);
        if (!el || !el.value) return;
        
        let s = String(el.value).trim().toUpperCase();
        if (s.length === 2) {
            el.value = s;
            return;
        }
        
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
        
        if (stateMap[s]) {
            el.value = stateMap[s];
        }
    }
};