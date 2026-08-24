/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/inventoryEngine.js
 * Description: Strict mathematical engine and validation gatekeeper.
 * Author: Thomas Paul Seyfors
 * Date: August 2026
 * 
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */

const InventoryEngine = {

  /**
   * GATE 1: STRICT NORMALIZATION & LOOKUP
   * Forces all inputs to uppercase and attempts a database match.
   * Throws a hard error if the item does not exist.
   */
  lookupAndNormalize(ref, gtin, currentDb) {
    let cleanRef = (ref || '').trim().toUpperCase();
    let cleanGtin = (gtin || '').replace(/^(01|\(01\))/, '').trim();
    
    let match = currentDb.find(i => 
      (i.sku || i.ref || '').toUpperCase() === cleanRef || 
      (i.gtin && i.gtin === cleanGtin)
    );

    if (!match) {
      throw new Error(`HARD ERROR: Unrecognized SKU (${cleanRef}). Please add this item to the master database before scanning.`);
    }
    
    return match;
  },

  /**
   * GATE 2: UOM MULTIPLIER (BOX TO EACH)
   * Cross-references the UOM Bundles to calculate the true EACH quantity.
   */
  calculateUOM(matchedItem, scannedQty) {
    let finalQty = parseInt(scannedQty, 10) || 1;
    let finalRef = matchedItem.sku || matchedItem.ref;

    if (matchedItem.parentRef && matchedItem.uomMult > 1) {
      finalQty = finalQty * matchedItem.uomMult;
      finalRef = matchedItem.parentRef.toUpperCase();
    }

    return { trueRef: finalRef, trueQty: finalQty };
  },

  /**
   * GATE 3: AVAILABILITY VALIDATION
   * Prevents over-reserving and provides a smart prompt if a user 
   * attempts to pack more items than a customer has in reserve.
   */
  validateAvailability(trueRef, requestedQty, action, currentDb, customerTag, currentAllocations, ignoreOverpack = false) {
    let dbItem = currentDb.find(i => (i.sku || i.ref || '').toUpperCase() === trueRef);
    if (!dbItem) throw new Error(`HARD ERROR: Parent item ${trueRef} missing from database.`);

    let onHand = parseInt(dbItem.onHand, 10) || 0;
    let reserved = parseInt(dbItem.reservedQty, 10) || 0;
    let available = onHand - reserved;

    if (action === 'Reserved') {
      if (requestedQty > available) {
        throw new Error(`HARD ERROR: Insufficient stock. You are trying to reserve ${requestedQty}, but only ${available} are available.`);
      }
    }

    if (action === 'Pack & Ship') {
      let custTagUpper = (customerTag || '').toUpperCase();
      let allocatedToCust = (currentAllocations[custTagUpper] && currentAllocations[custTagUpper][trueRef]) ? currentAllocations[custTagUpper][trueRef] : 0;
      
      // Check if they are trying to pack more than is specifically reserved for this customer
      if (requestedQty > allocatedToCust && !ignoreOverpack) {
        let extraNeeded = requestedQty - allocatedToCust;
        
        if (extraNeeded > available) {
            throw new Error(`HARD ERROR: Insufficient stock to over-pack. You need ${extraNeeded} extra units, but only ${available} are available on the shelf.`);
        } else {
            throw new Error(`OVERPACK_WARNING: You are packing ${requestedQty}, but this customer only has ${allocatedToCust} reserved. This will pull ${extraNeeded} extra unit(s) from standard inventory. Proceed?`);
        }
      }
    }

    return true;
  },
  
  /**
   * GATE 5: FINAL LEDGER COMMIT
   * Executes the exact addition and subtraction math for the database
   * and the Active Allocations ledger.
   */
  commitLedgerMath(scannedObjects, currentDb, currentAllocations, workflowType) {
    let onHandChanges = {}; 
    let reservedChanges = {}; 

    scannedObjects.forEach(item => {
      let ref = item.ref.toUpperCase(); 
      let tag = item.customerTag; 
      let orderNum = item.orderNum;

      if (!onHandChanges[ref]) { onHandChanges[ref] = 0; reservedChanges[ref] = 0; }
      if (tag) { 
        if (!currentAllocations[tag]) currentAllocations[tag] = {}; 
        if (!currentAllocations[tag][ref]) currentAllocations[tag][ref] = { qty: 0, details: [] }; 
      }

      if (workflowType.includes('Receiving') || workflowType.includes('Stocktake')) {
        // Only increment OnHand for pure Receiving or Stocktake (not Reserving alone)
        if (!workflowType.includes('Reserving') || item.actionTag !== 'Reserved') {
            onHandChanges[ref] += item.qty;
        }
      }

      if (item.actionTag === 'Reserved' && tag) {
         reservedChanges[ref] += item.qty;
         currentAllocations[tag][ref].qty += item.qty;
         
         // Relational Object Push
         let existingDetail = currentAllocations[tag][ref].details.find(d => 
            d.lot === item.lot && d.exp === item.exp && d.orderNum === orderNum && d.sessionId === item.sessionId
         );
         
         if (existingDetail) {
            existingDetail.qty += item.qty;
         } else {
            currentAllocations[tag][ref].details.push({
                lot: item.lot || 'NO_LOT',
                exp: item.exp || 'NO_EXP',
                orderNum: orderNum || '',
                sessionId: item.sessionId || '',
                qty: item.qty
            });
         }
      } else if (workflowType.includes('Packing') || workflowType.includes('Pack & Ship')) {
        onHandChanges[ref] -= item.qty;
        
        if (tag && currentAllocations[tag] && currentAllocations[tag][ref] && currentAllocations[tag][ref].qty > 0) {
            let deduct = Math.min(item.qty, currentAllocations[tag][ref].qty);
            reservedChanges[ref] -= deduct; 
            currentAllocations[tag][ref].qty -= deduct;
            
            // FIFO Deduction from specific lots
            let remainingToDeduct = deduct;
            for (let i = 0; i < currentAllocations[tag][ref].details.length; i++) {
                if (remainingToDeduct <= 0) break;
                let det = currentAllocations[tag][ref].details[i];
                let take = Math.min(det.qty, remainingToDeduct);
                det.qty -= take;
                remainingToDeduct -= take;
            }
            // Clean up empty lots
            currentAllocations[tag][ref].details = currentAllocations[tag][ref].details.filter(d => d.qty > 0);

            if (currentAllocations[tag][ref].qty <= 0) delete currentAllocations[tag][ref];
        }
      }
    });

    Object.keys(currentAllocations).forEach(t => { 
      if (Object.keys(currentAllocations[t]).length === 0) delete currentAllocations[t]; 
    });

    currentDb.forEach(dbItem => {
      let ref = (dbItem.sku || dbItem.ref || '').toUpperCase();
      if (onHandChanges[ref] || reservedChanges[ref]) {
        dbItem.onHand = (dbItem.onHand || 0) + (onHandChanges[ref] || 0); 
        dbItem.reservedQty = (dbItem.reservedQty || 0) + (reservedChanges[ref] || 0);
        
        if (dbItem.onHand < 0) dbItem.onHand = 0; 
        if (dbItem.reservedQty < 0) dbItem.reservedQty = 0;
      }
    });

    return { updatedDb: currentDb, updatedAllocations: currentAllocations };
  }
};