async function openActiveShipmentsHub() {
    let modal = document.getElementById('shipmentTrackingModal');
    let listIn = document.getElementById('trackIncomingList');
    let listOut = document.getElementById('trackOutgoingList');
    
    listIn.innerHTML = "<p style='text-align:center; color:#0277bd;'>⏳ Loading Shipments...</p>";
    listOut.innerHTML = "<p style='text-align:center; color:#0277bd;'>⏳ Loading Shipments...</p>";
    
    // ✨ FIX: Set to "flex" to maintain the modal's centering
    modal.style.display = "flex"; 

    try {
        let res = await fetch(`${SessionManager.getActiveArchiveUrl()}?action=GET_PENDING_SHIPMENTS`);
        let data = await res.json();
        
        const buildHtml = (arr) => {
            if (arr.length === 0) return "<p style='color:#777; font-style:italic;'>No pending shipments.</p>";
            return arr.map(s => {
                let dStr = "Unknown Date";
                if (s.date) {
                    let pDate = new Date(s.date);
                    if (!isNaN(pDate)) dStr = pDate.toLocaleDateString();
                }

                let link = "No Tracking #";
                if (s.tracking) {
                    let url = `https://www.fedex.com/fedextrack/?trknbr=${s.tracking}`; 
                    if (String(s.carrier).toUpperCase().includes("UPS")) {
                        url = `https://www.ups.com/track?track=yes&trackNums=${s.tracking}`;
                    }
                    link = `<a href="${url}" target="_blank" style="color:#0277bd; font-weight:bold; text-decoration:none;">Track: ${s.tracking}</a>`;
                }

                // ✨ NEW: Encode the data so we can pass it into the edit modal
                let safeData = encodeURIComponent(JSON.stringify(s));
                let type = s.weight !== undefined ? 'Outgoing' : 'Incoming';

                return `<div style="background:#fff; border:1px solid #ddd; padding:8px; margin-bottom:8px; border-radius:4px;">
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:4px; margin-bottom:4px;">
                                <a href="javascript:void(0)" onclick="openShipmentEditor('${type}', ${s.rowIdx}, '${safeData}')" style="font-weight:bold; color:#333; text-decoration:none; cursor:pointer;" title="Click to Edit">
                                    ✏️ ${s.partner}
                                </a>
                                <span style="color:#777; font-size:0.75rem;">${dStr}</span>
                            </div>
                            <div style="color:#555; font-size:0.8rem;">PO / Invoice: ${s.po || 'N/A'}</div>
                            <div style="margin-top:4px; display:flex; justify-content:space-between;">
                                ${link}
                                <span style="font-size:0.75rem; color:${s.status==='Pending'?'#e65100':'#2e7d32'}; font-weight:bold;">${s.status}</span>
                            </div>
                        </div>`;
            }).join('');
        };

        listIn.innerHTML = buildHtml(data.incoming);
        listOut.innerHTML = buildHtml(data.outgoing);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        listIn.innerHTML = `<p style="color:red; text-align:center;">Error loading shipments.</p>`;
        listOut.innerHTML = "";
    }
}

function openShipmentEditor(type, rowIdx, dataStr) {
    let data = {};
    try {
        data = JSON.parse(decodeURIComponent(dataStr));
    } catch(e) {
        data = {};
    }

    // ✨ NEW: Helper to convert messy ISO dates into simple MM/DD/YYYY
    const cleanDate = (val) => {
        if (!val) return '';
        let d = new Date(val);
        if (isNaN(d)) return val;
        // Parse UTC properly so timestamps like "04:00:00.000Z" don't shift the day backward in US timezones
        if (val.toString().includes('T')) {
            return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
        }
        return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    };
    
    document.getElementById('shipEditTitle').innerText = rowIdx === 'NEW' ? `Add New ${type} Shipment` : `Edit ${type} Shipment`;
    document.getElementById('shipEditType').value = type;
    document.getElementById('shipEditRowIdx').value = rowIdx;
    
    let todayStr = `${new Date().getMonth() + 1}/${new Date().getDate()}/${new Date().getFullYear()}`;
    
    // Inject the clean dates into the form inputs
    document.getElementById('shipEditDate').value = data.date ? cleanDate(data.date) : todayStr;
    document.getElementById('shipEditEta').value = data.eta ? cleanDate(data.eta) : '';
    
    document.getElementById('shipEditStatus').value = data.status || 'Pending';
    document.getElementById('shipEditPartner').value = data.partner || '';
    document.getElementById('shipEditPo').value = data.po || '';
    document.getElementById('shipEditCarrier').value = data.carrier || '';
    document.getElementById('shipEditTracking').value = data.tracking || '';
    document.getElementById('shipEditNotes').value = data.notes || '';
    
    let extraRow = document.getElementById('shipEditOutboundExtra');
    if (type === 'Outgoing') {
        extraRow.style.display = 'flex';
        document.getElementById('shipEditWeight').value = data.weight || '';
        document.getElementById('shipEditDims').value = data.dims || '';
    } else {
        extraRow.style.display = 'none';
    }
    
    document.getElementById('shipmentEditModal').style.display = 'flex';
}

async function saveShipmentEdit() {
    let btn = document.getElementById('btnSaveShipmentEdit');
    let origText = btn.innerHTML;
    btn.innerHTML = "⏳ Saving..."; btn.disabled = true;

    let rowIdxVal = document.getElementById('shipEditRowIdx').value;

    let payload = {
        action: "UPDATE_SHIPMENT_ENTRY",
        payload: {
            type: document.getElementById('shipEditType').value,
            rowIdx: rowIdxVal,
            isNew: (rowIdxVal === 'NEW'), // Tells the backend to append a new row instead of updating
            date: document.getElementById('shipEditDate').value,
            status: document.getElementById('shipEditStatus').value,
            partner: document.getElementById('shipEditPartner').value,
            po: document.getElementById('shipEditPo').value,
            carrier: document.getElementById('shipEditCarrier').value,
            tracking: document.getElementById('shipEditTracking').value,
            eta: document.getElementById('shipEditEta').value,
            notes: document.getElementById('shipEditNotes').value,
            weight: document.getElementById('shipEditWeight').value,
            dims: document.getElementById('shipEditDims').value
        }
    };

    try {
        let res = await fetch(SessionManager.getActiveArchiveUrl(), {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        let result = await res.json();
        
        if (result.status === "success") {
            alert("Shipment updated successfully!");
            document.getElementById('shipmentEditModal').style.display = 'none';
            openActiveShipmentsHub(); 
        } else {
            alert("Database Error: " + result.message);
        }
    } catch(err) {
        alert("Network Error: " + err.message);
    } finally {
        btn.innerHTML = origText; btn.disabled = false;
    }
}