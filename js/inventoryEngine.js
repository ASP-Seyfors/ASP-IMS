/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/inventoryEngine.js
 * Author: Thomas Seyfors
 * Date Created: August 2026
 * 
 * Description:
 *   The core mathematical engine and validation gatekeeper. Enforces exact 
 *   addition and subtraction rules for standard inventory and Customer Bins.
 *
 * Affected Features:
 *   - UOM Multiplier Conversions (Box to Each)
 *   - Over-pack Validation & Fault Tolerance Logic
 *   - General Ledger Math (On-Hand +/-)
 *   - FEFO Lot Subtraction (First Expiring, First Out)
 *   - Active Allocations Tracking & Cleanup
 *
 * Copyright (c) 2026 Thomas Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const InventoryEngine = {

  /**
   * NORMALIZATION & LOOKUP
   * Forces all inputs to uppercase and attempts a database match.
   */
  lookupAndNormalize(ref, gtin, currentDb) {
    let cleanRef = (ref || '').trim().toUpperCase();
    let cleanGtin = (gtin || '').replace(/^(01|\(01\))/, '').trim();
    
    // ✨ FIX: Exact REF match takes absolute priority over the GTIN field
    if (cleanRef) {
        let match = currentDb.find(i => (i.sku || i.ref || '').toUpperCase() === cleanRef);
        if (match) return match;
    }

    // GTIN Fallback Match (Ignoring N/A)
    if (cleanGtin && cleanGtin.toUpperCase() !== "N/A" && cleanGtin.toUpperCase() !== "NA") {
        let match = currentDb.find(i => i.gtin && i.gtin === cleanGtin);
        if (match) return match;
    }

    return null;
  },

  /**
   * UOM MULTIPLIER (BOX TO EACH)
   */
  calculateUOM(matchedItem, scannedQty, fallbackRef) {
    let finalQty = parseInt(scannedQty, 10) || 1;
    let finalRef = matchedItem ? (matchedItem.sku || matchedItem.ref) : fallbackRef.toUpperCase();

    if (matchedItem && matchedItem.parentRef && matchedItem.uomMult > 1) {
      finalQty = finalQty * matchedItem.uomMult;
      finalRef = matchedItem.parentRef.toUpperCase();
    }

    return { trueRef: finalRef, trueQty: finalQty };
  },

  /**
   * AVAILABILITY VALIDATION
   */
  validateAvailability(trueRef, requestedQty, action, currentDb, customerTag, currentAllocations, ignoreOverpack = false, workflowType = '') {
    // If we are RECEIVING, we are bringing items into the building. Skip availability checks.
    if (workflowType.toUpperCase().includes('RECEIVING')) {
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
      // Strip order number to match the base customer bin (e.g. 'SYNERGY')
      let baseTag = (customerTag || '').toUpperCase().split('(')[0].split('-')[0].trim();
      
      let allocData = (currentAllocations[baseTag] && currentAllocations[baseTag][trueRef]) ? currentAllocations[baseTag][trueRef] : 0;
      // Safely extract the qty whether it's the new object structure or an old number
      let allocatedToCust = typeof allocData === 'object' ? (allocData.qty || 0) : allocData;
      
      if (requestedQty > allocatedToCust) {
        let extraNeeded = requestedQty - allocatedToCust;
        
        // 1. ALWAYS prevent negative inventory, regardless of warnings
        if (extraNeeded > available) {
            throw new Error(`HARD ERROR: Insufficient stock to over-pack. You need ${extraNeeded} extra units, but only ${available} are available on the shelf.`);
        } 
        // 2. Only show the over-pack warning if we aren't explicitly ignoring it
        else if (!ignoreOverpack) {
            throw new Error(`OVERPACK_WARNING: You are packing ${requestedQty}, but this customer only has ${allocatedToCust} reserved. This will pull ${extraNeeded} extra unit(s) from standard inventory. Proceed?`);
        }
      }
    }

    return true;
  },
  
 /**
   * FINAL LEDGER COMMIT
   * Executes the exact addition and subtraction math for the database
   * and the Active Allocations ledger.
   */
  commitLedgerMath(scannedObjects, currentDb, currentAllocations, workflowType) {
    let onHandChanges = {}; 
    let reservedChanges = {}; 
    
    // Force uppercase to catch all legacy string variations and prevent matching failures
    let wType = (workflowType || '').toUpperCase();

    scannedObjects.forEach(item => {
      let ref = (item.ref || item.sku || '').toUpperCase().trim(); 
      let orderNum = item.orderNum || '';
      let actionTag = (item.actionTag || '').toUpperCase().trim();
      let rawTag = (item.customerTag || '').toUpperCase().trim(); 

      // THE TAG NORMALIZATION FIX
      // Strips away hyphens and parentheses so reserving and packing tags match perfectly
      let tag = rawTag.split('(')[0].split('-')[0].trim();
      
      // Fallback: If tag is blank during packing, extract it from the historical session name
      if (!tag && (wType.includes('PACKING') || wType.includes('PACK & SHIP') || actionTag.includes('PACK'))) {
        let sessName = (item.sessionId || SessionManager.currentSessionName || '').toUpperCase();
        let baseCust = sessName.split('(')[0].split('-')[0].trim();
        if (baseCust && !baseCust.includes('HISTORICAL')) tag = baseCust;
      }

      // Prevents running 0s from wiping out active math
      if (typeof onHandChanges[ref] === 'undefined') { 
          onHandChanges[ref] = 0; 
          reservedChanges[ref] = 0; 
      }
      
      if (tag) { 
        if (!currentAllocations[tag]) currentAllocations[tag] = {}; 
        if (!currentAllocations[tag][ref]) currentAllocations[tag][ref] = { qty: 0, details: [] }; 
      }

      // --- STRICT FAULT-TOLERANT LOGIC GATES ---

      // "Receiving" or "Receiving & Reserving" (Supports your Reconcile Strategy)
      if (wType.includes('RECEIVING')) {
        onHandChanges[ref] += item.qty; // ALWAYS updates Total Qty for Receiving
        
        if (actionTag === 'RESERVED' && tag) {
           reservedChanges[ref] += item.qty;
           currentAllocations[tag][ref].qty += item.qty;
           currentAllocations[tag][ref].details.push({
               lot: item.lot || 'NO_LOT', exp: item.exp || 'NO_EXP', orderNum: orderNum, sessionId: item.sessionId || '', qty: item.qty
           });
        }
      } 
      // "Reserving" or "Pick & Reserve" (DOES NOT ADD TO TOTAL QTY)
      else if (wType.includes('RESERVING') || wType.includes('PICK & RESERVE') || wType === 'RESERVE') {
         if (tag) {
             reservedChanges[ref] += item.qty;
             currentAllocations[tag][ref].qty += item.qty;
             currentAllocations[tag][ref].details.push({
                 lot: item.lot || 'NO_LOT', exp: item.exp || 'NO_EXP', orderNum: orderNum, sessionId: item.sessionId || '', qty: item.qty
             });
         }
      }
      // "Picking & Packing" or "Pack & Ship"
      else if (wType.includes('PACKING') || wType.includes('PACK & SHIP') || actionTag.includes('PACK')) {
        onHandChanges[ref] -= item.qty; // Subtracts from Total Qty
        
        if (tag && currentAllocations[tag] && currentAllocations[tag][ref]) {
            let deduct = item.qty;
            reservedChanges[ref] -= deduct; 
            currentAllocations[tag][ref].qty -= deduct;
            
            let targetLot = item.lot || 'NO_LOT';
            let targetExp = item.exp || 'NO_EXP';

            // EXACT MATCH DEDUCTION
            let exactMatches = currentAllocations[tag][ref].details.filter(d => d.lot === targetLot && d.exp === targetExp && d.qty > 0);
            for (let i = 0; i < exactMatches.length; i++) {
                if (deduct <= 0) break;
                let take = Math.min(exactMatches[i].qty, deduct);
                exactMatches[i].qty -= take;
                deduct -= take;
            }

            // FEFO FALLBACK DEDUCTION (First Expiring, First Out)
            if (deduct > 0) {
                currentAllocations[tag][ref].details.sort((a, b) => {
                    if (a.exp === 'NO_EXP') return 1;
                    if (b.exp === 'NO_EXP') return -1;
                    return new Date(a.exp) - new Date(b.exp);
                });

                for (let i = 0; i < currentAllocations[tag][ref].details.length; i++) {
                    if (deduct <= 0) break;
                    let det = currentAllocations[tag][ref].details[i];
                    if (det.qty > 0) {
                        let take = Math.min(det.qty, deduct);
                        det.qty -= take;
                        deduct -= take;
                    }
                }
            }
            
            // Clean up empty lots
            currentAllocations[tag][ref].details = currentAllocations[tag][ref].details.filter(d => d.qty > 0);
        }
      }
      // "Stocktake"
      // INTENTIONALLY EMPTY! Stocktake does NOT add or subtract here, preserving your UOM Bundle integrity. 
    });

    // GARBAGE COLLECTION
    Object.keys(currentAllocations).forEach(t => { 
      Object.keys(currentAllocations[t]).forEach(ref => {
          if (currentAllocations[t][ref].qty <= 0) delete currentAllocations[t][ref];
      });
      if (Object.keys(currentAllocations[t]).length === 0) delete currentAllocations[t]; 
    });

    // APPLY TO DATABASE
    currentDb.forEach(dbItem => {
      let ref = (dbItem.sku || dbItem.ref || '').toUpperCase();
      
      // Ensure we only touch items that were actually scanned in this session
      if (typeof onHandChanges[ref] !== 'undefined') {
        dbItem.onHand = (dbItem.onHand || 0) + (onHandChanges[ref] || 0); 
        dbItem.reservedQty = (dbItem.reservedQty || 0) + (reservedChanges[ref] || 0);
        
        // Final floor safety check
        if (dbItem.onHand < 0) dbItem.onHand = 0; 
        if (dbItem.reservedQty < 0) dbItem.reservedQty = 0;
      }
    });

    return { updatedDb: currentDb, updatedAllocations: currentAllocations };
  },
  /**
   * REVERSAL LEDGER MATH
   * Safely negates quantities from a prior session to undo accidental additions.
   */
  reverseLedgerMath(scannedObjects, currentDb, currentAllocations, originalWorkflow) {
    let onHandChanges = {};
    let reservedChanges = {};
    let wType = (originalWorkflow || '').toUpperCase();

    scannedObjects.forEach(item => {
      let ref = (item.ref || item.sku || '').toUpperCase().trim();
      let actionTag = (item.actionTag || '').toUpperCase().trim();
      let rawTag = (item.customerTag || '').toUpperCase().trim();
      let tag = rawTag.split('(')[0].split('-')[0].trim();

      if (typeof onHandChanges[ref] === 'undefined') {
          onHandChanges[ref] = 0;
          reservedChanges[ref] = 0;
      }

      // REVERSAL MATH: Convert the original quantity to a negative integer
      let revQty = -(item.qty);

      // We apply the exact same workflow routing, but adding a negative number subtracts it safely
      if (wType.includes('RECEIVING')) {
        onHandChanges[ref] += revQty; 
        if (actionTag === 'RESERVED' && tag && currentAllocations[tag] && currentAllocations[tag][ref]) {
           reservedChanges[ref] += revQty;
           currentAllocations[tag][ref].qty += revQty;
           currentAllocations[tag][ref].details.push({
               lot: item.lot, exp: item.exp, orderNum: 'REVERSAL', sessionId: 'REVERSAL', qty: revQty
           });
        }
      }
      else if (wType.includes('RESERVING') || wType.includes('PICK & RESERVE') || wType === 'RESERVE') {
         if (tag && currentAllocations[tag] && currentAllocations[tag][ref]) {
             reservedChanges[ref] += revQty;
             currentAllocations[tag][ref].qty += revQty;
             currentAllocations[tag][ref].details.push({
                 lot: item.lot, exp: item.exp, orderNum: 'REVERSAL', sessionId: 'REVERSAL', qty: revQty
             });
         }
      }
    });

    // STANDARD GARBAGE COLLECTION
    Object.keys(currentAllocations).forEach(t => {
      Object.keys(currentAllocations[t]).forEach(ref => {
          if (currentAllocations[t][ref].qty <= 0) delete currentAllocations[t][ref];
      });
      if (Object.keys(currentAllocations[t]).length === 0) delete currentAllocations[t];
    });

    // APPLY TO DATABASE WITH FLOOR SAFETY
    currentDb.forEach(dbItem => {
      let ref = (dbItem.sku || dbItem.ref || '').toUpperCase();
      if (typeof onHandChanges[ref] !== 'undefined') {
        dbItem.onHand = (dbItem.onHand || 0) + (onHandChanges[ref] || 0);
        dbItem.reservedQty = (dbItem.reservedQty || 0) + (reservedChanges[ref] || 0);
        if (dbItem.onHand < 0) dbItem.onHand = 0;
        if (dbItem.reservedQty < 0) dbItem.reservedQty = 0;
      }
    });

    return { updatedDb: currentDb, updatedAllocations: currentAllocations };
  }
};