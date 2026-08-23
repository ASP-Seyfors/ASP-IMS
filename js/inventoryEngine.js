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
        if (!currentAllocations[tag][ref]) currentAllocations[tag][ref] = { qty: 0, orders: [], lots: [], exps: [], sessionIds: [] }; 
      }

      if (workflowType.includes('Receiving & Reserving')) {
        onHandChanges[ref] += item.qty;
        if (item.actionTag === 'Reserved') { 
          reservedChanges[ref] += item.qty; 
          if (tag) {
             currentAllocations[tag][ref].qty += item.qty; 
             if(orderNum && !currentAllocations[tag][ref].orders.includes(orderNum)) currentAllocations[tag][ref].orders.push(orderNum);
             if(item.lot && item.lot !== 'NO_LOT' && !currentAllocations[tag][ref].lots.includes(item.lot)) currentAllocations[tag][ref].lots.push(item.lot);
             if(item.exp && item.exp !== 'NO_EXP' && !currentAllocations[tag][ref].exps.includes(item.exp)) currentAllocations[tag][ref].exps.push(item.exp);
             if(item.sessionId && !currentAllocations[tag][ref].sessionIds.includes(item.sessionId)) currentAllocations[tag][ref].sessionIds.push(item.sessionId);
          }
        }
      } else if (workflowType.includes('Receiving')) { 
        onHandChanges[ref] += item.qty;
      } else if (workflowType.includes('Reserving')) { 
        reservedChanges[ref] += item.qty; 
        if (tag) {
           currentAllocations[tag][ref].qty += item.qty;
           if(orderNum && !currentAllocations[tag][ref].orders.includes(orderNum)) currentAllocations[tag][ref].orders.push(orderNum);
           if(item.lot && item.lot !== 'NO_LOT' && !currentAllocations[tag][ref].lots.includes(item.lot)) currentAllocations[tag][ref].lots.push(item.lot);
           if(item.exp && item.exp !== 'NO_EXP' && !currentAllocations[tag][ref].exps.includes(item.exp)) currentAllocations[tag][ref].exps.push(item.exp);
           if(item.sessionId && !currentAllocations[tag][ref].sessionIds.includes(item.sessionId)) currentAllocations[tag][ref].sessionIds.push(item.sessionId);
        }
      } else if (workflowType.includes('Packing') || workflowType.includes('Pack & Ship')) {
        onHandChanges[ref] -= item.qty;
        
        if (tag && currentAllocations[tag] && currentAllocations[tag][ref] && currentAllocations[tag][ref].qty > 0) {
            let deduct = Math.min(item.qty, currentAllocations[tag][ref].qty);
            reservedChanges[ref] -= deduct; 
            currentAllocations[tag][ref].qty -= deduct;
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