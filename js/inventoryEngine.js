/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/inventoryEngine.js
 * Description: Client-Side gatekeeper. Handles read-only validations, 
 * UOM multipliers, and prevents over-packing before cloud transmission.
 * ======================================================================= */
const InventoryEngine = {

  lookupAndNormalize(ref, gtin, currentDb) {
    let cleanRef = (ref || '').trim().toUpperCase();
    let cleanGtin = (gtin || '').replace(/^(01|\(01\))/, '').trim();
    
    if (cleanRef) {
        let match = currentDb.find(i => (i.sku || i.ref || '').toUpperCase() === cleanRef);
        if (match) return match;
    }

    if (cleanGtin && cleanGtin.toUpperCase() !== "N/A" && cleanGtin.toUpperCase() !== "NA") {
        let match = currentDb.find(i => i.gtin && i.gtin === cleanGtin);
        if (match) return match;
    }

    return null;
  },

  calculateUOM(matchedItem, scannedQty, fallbackRef) {
    let finalQty = parseInt(scannedQty, 10) || 1;
    let finalRef = matchedItem ? (matchedItem.sku || matchedItem.ref) : fallbackRef.toUpperCase();

    if (matchedItem && matchedItem.parentRef && matchedItem.uomMult > 1) {
      finalQty = finalQty * matchedItem.uomMult;
      finalRef = matchedItem.parentRef.toUpperCase();
    }

    return { trueRef: finalRef, trueQty: finalQty };
  },

  validateAvailability(trueRef, requestedQty, action, currentDb, customerTag, currentAllocations, ignoreOverpack = false, workflowType = '') {
    if (workflowType.toUpperCase().includes('RECEIVING') || workflowType.toUpperCase().includes('STOCKTAKE')) {
        return true;
    }

    let dbItem = currentDb.find(i => (i.sku || i.ref || '').toUpperCase() === trueRef);
    if (!dbItem) throw new Error(`HARD ERROR: Item ${trueRef} missing from database. Cannot reserve or pack.`);

    let onHand = parseInt(dbItem.onHand, 10) || 0;
    let reserved = parseInt(dbItem.reservedQty, 10) || 0;
    let available = onHand - reserved;

    if (action === 'Reserved') {
      if (requestedQty > available) {
        throw new Error(`HARD ERROR: Insufficient stock. You are trying to reserve ${requestedQty}, but only ${available} are available.`);
      }
    }

    if (action === 'Pack & Ship') {
      let baseTag = (customerTag || '').toUpperCase().split('(')[0].split('-')[0].trim();
      let allocData = (currentAllocations[baseTag] && currentAllocations[baseTag][trueRef]) ? currentAllocations[baseTag][trueRef] : 0;
      let allocatedToCust = typeof allocData === 'object' ? (allocData.qty || 0) : allocData;
      
      if (requestedQty > allocatedToCust) {
        let extraNeeded = requestedQty - allocatedToCust;
        if (extraNeeded > available) {
            throw new Error(`HARD ERROR: Insufficient stock to over-pack. You need ${extraNeeded} extra units, but only ${available} are available on the shelf.`);
        } 
        else if (!ignoreOverpack) {
            throw new Error(`OVERPACK_WARNING: You are packing ${requestedQty}, but this customer only has ${allocatedToCust} reserved. This will pull ${extraNeeded} extra unit(s) from standard inventory. Proceed?`);
        }
      }
    }

    if (action === 'Un-Reserve') {
      let baseTag = (customerTag || '').toUpperCase().split('(')[0].split('-')[0].trim();
      let allocData = (currentAllocations[baseTag] && currentAllocations[baseTag][trueRef]) ? currentAllocations[baseTag][trueRef] : 0;
      let allocatedToCust = typeof allocData === 'object' ? (allocData.qty || 0) : allocData;
      
      if (requestedQty > allocatedToCust) {
         throw new Error(`HARD ERROR: Cannot Un-Reserve ${requestedQty} units. Customer ${baseTag} only has ${allocatedToCust} units of ${trueRef} currently reserved.`);
      }
    }

    return true;
  }
};