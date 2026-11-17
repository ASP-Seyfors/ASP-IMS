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
      // ✨ THE FIX: Strip the '*' prefix if the item is marked as Sell As Box Only
      finalRef = String(matchedItem.parentRef).replace(/^\*/, '').trim().toUpperCase();
    }

    return { trueRef: finalRef, trueQty: finalQty };
  },

  // ✨ PHASE 3: Universal Packaging Display Helper
  getPackagingDisplay(item, currentDb, availableEaches) {
    let isBundle = item.parentRef && parseInt(item.uomMult, 10) > 1;
    let uom = parseInt(item.uomMult, 10) || 1;
    
    let children = currentDb.filter(c => 
        (c.parentRef || '').replace(/^\*/, '').toUpperCase() === (item.sku || item.ref || '').toUpperCase() 
        && parseInt(c.uomMult, 10) > 1
    );
    
    let isBoxOnly = children.some(c => String(c.parentRef).startsWith('*'));
    let largestBundle = children.reduce((max, c) => Math.max(max, parseInt(c.uomMult, 10)), 1);

    // If item has a Display Alias, we return it here to be used universally!
    let printRef = item.displayAlias ? item.displayAlias : (item.sku || item.ref);

    if (isBundle) {
        let boxes = Math.floor(availableEaches / uom);
        return { 
            printRef: printRef, totalUnits: availableEaches, displayQty: String(boxes), 
            displayString: `${boxes} Box(es) of ${uom}`, isBoxOnly: false, shouldHide: (boxes === 0) 
        };
    } else {
        if (isBoxOnly) return { printRef: printRef, totalUnits: availableEaches, displayQty: "0", displayString: "Hidden (Box Only)", isBoxOnly: true, shouldHide: true };
        if (largestBundle > 1) {
            let eaches = availableEaches % largestBundle;
            return { printRef: printRef, totalUnits: availableEaches, displayQty: String(eaches), displayString: `${eaches} Eaches`, isBoxOnly: false, shouldHide: (eaches === 0) };
        }
        return { printRef: printRef, totalUnits: availableEaches, displayQty: String(availableEaches), displayString: `${availableEaches} Eaches`, isBoxOnly: false, shouldHide: (availableEaches === 0) };
    }
  },

  validateAvailability(trueRef, requestedQty, action, currentDb, customerTag, currentAllocations, ignoreOverpack = false, workflowType = '', scanContext = null) {
    if (workflowType.toUpperCase().includes('RECEIVING') || workflowType.toUpperCase().includes('STOCKTAKE')) {
        return true;
    }

    let dbItem = currentDb.find(i => (i.sku || i.ref || '').toUpperCase() === trueRef);
    if (!dbItem) throw new Error(`Item ${trueRef} was not found in the database. Cannot reserve or pack.`);

    let onHand = parseInt(dbItem.onHand, 10) || 0;
    let reserved = parseInt(dbItem.reservedQty, 10) || 0;
    let available = onHand - reserved;

    if (action === 'Reserved') {
      if (requestedQty > available) {
        throw new Error(`You are trying to reserve ${requestedQty}, with ${available} available.`);
      }
    }

    if (action === 'Pack & Ship') {
      let rawBaseTag = (customerTag || '').toUpperCase().split('(')[0].split('-')[0].trim();
      let resolvedTag = (typeof DatabaseManager !== 'undefined' && DatabaseManager.resolveAlias)
          ? DatabaseManager.resolveAlias(rawBaseTag, 'customer').toUpperCase()
          : rawBaseTag;

      let allocData = (currentAllocations[resolvedTag] && currentAllocations[resolvedTag][trueRef])
          || (currentAllocations[rawBaseTag] && currentAllocations[rawBaseTag][trueRef])
          || 0;
      let allocatedToCust = typeof allocData === 'object' ? (allocData.qty || 0) : (parseInt(allocData, 10) || 0);

      // ✨ LOT/EXP-AWARE ALLOCATION CHECK
      if (scanContext && typeof allocData === 'object' && Array.isArray(allocData.details) && allocData.details.length > 0) {
        let normLot = (l) => (!l || l === 'N/A' || l === 'NA' || l === 'NO_LOT') ? '' : String(l).trim().toUpperCase();
        let normExp = (e) => (!e || e === 'N/A' || e === 'NA' || e === 'NO_EXP') ? '' : String(e).trim().substring(0, 10);

        // Clone customer's reserved lot buckets for this REF
        let buckets = allocData.details.map(d => ({
          lot: normLot(d.lot),
          exp: normExp(d.exp),
          remQty: parseInt(d.qty, 10) || 0
        }));

        let consumeFromReserved = (q, sLot, sExp) => {
          let rem = q;
          let isNaScan = (!sLot || sLot === 'N/A' || sLot === 'NA' || sLot === 'NO_LOT');

          // If the operator selected N/A for lot/exp, bypass strict lot matching and consume from buckets freely
          if (isNaScan) {
              buckets.forEach(b => {
                if (rem > 0 && b.remQty > 0) {
                  let take = Math.min(b.remQty, rem);
                  b.remQty -= take;
                  rem -= take;
                }
              });
              return rem;
          }

          // 1. Exact Lot + Exp match
          buckets.forEach(b => {
            if (rem > 0 && b.remQty > 0 && b.lot === sLot && b.exp === sExp) {
              let take = Math.min(b.remQty, rem);
              b.remQty -= take;
              rem -= take;
            }
          });
          // 2. Exact Lot match (if Exp differed by a day)
          if (rem > 0 && sLot) {
            buckets.forEach(b => {
              if (rem > 0 && b.remQty > 0 && b.lot === sLot) {
                let take = Math.min(b.remQty, rem);
                b.remQty -= take;
                rem -= take;
              }
            });
          }
          // 3. Un-lotted wildcard reservation match
          if (rem > 0) {
            buckets.forEach(b => {
              if (rem > 0 && b.remQty > 0 && !b.lot) {
                let take = Math.min(b.remQty, rem);
                b.remQty -= take;
                rem -= take;
              }
            });
          }
          return rem; // Units NOT covered by customer's reservation (must come from general available)
        };

        // Replay prior scans in this session first
        let generalUsedPrior = 0;
        (scanContext.priorScans || []).forEach(ps => {
          generalUsedPrior += consumeFromReserved(parseInt(ps.qty, 10) || 0, normLot(ps.lot), normExp(ps.exp));
        });

        // Now evaluate the current scan
        let extraNeededThisScan = consumeFromReserved(
          parseInt(scanContext.currentQty, 10) || 0,
          normLot(scanContext.currentLot),
          normExp(scanContext.currentExp)
        );

        let totalGeneralNeeded = generalUsedPrior + extraNeededThisScan;
        if (totalGeneralNeeded > available) {
          let remainingGeneral = Math.max(0, available - generalUsedPrior);
          throw new Error(`There are currently ${remainingGeneral} unreserved unit(s) available in general inventory.`);
        } else if (extraNeededThisScan > 0 && !ignoreOverpack) {
          throw new Error(`OVERPACK_WARNING: ${extraNeededThisScan} unit(s) of this scan do not match the customer's reserved Lot/Exp (or exceed reserved qty) and will be pulled from general inventory. Proceed?`);
        }
        return true;
      }

      // Fallback when customer has 0 reserved or no granular lot details
      let priorTotal = scanContext && Array.isArray(scanContext.priorScans)
          ? scanContext.priorScans.reduce((acc, s) => acc + (parseInt(s.qty, 10) || 0), 0)
          : 0;
      let priorExtra = Math.max(0, priorTotal - allocatedToCust);
      let totalExtraNeeded = Math.max(0, requestedQty - allocatedToCust);
      let extraForThisScan = Math.max(0, totalExtraNeeded - priorExtra);

      if (totalExtraNeeded > available) {
        let remainingGeneral = Math.max(0, available - priorExtra);
        throw new Error(`There are currently ${remainingGeneral} unreserved unit(s) available.`);
      } else if (extraForThisScan > 0 && !ignoreOverpack) {
        throw new Error(`OVERPACK_WARNING: You are packing ${extraForThisScan} unit(s) beyond this customer's reservation. This will pull from available inventory. Proceed?`);
      }
    }

    if (action === 'Un-Reserve') {
      let baseTag = (customerTag || '').toUpperCase().split('(')[0].split('-')[0].trim();
      let resolvedTag = (typeof DatabaseManager !== 'undefined' && DatabaseManager.resolveAlias)
          ? DatabaseManager.resolveAlias(baseTag, 'customer').toUpperCase()
          : baseTag;
      let allocData = (currentAllocations[resolvedTag] && currentAllocations[resolvedTag][trueRef])
          || (currentAllocations[baseTag] && currentAllocations[baseTag][trueRef])
          || 0;
      let allocatedToCust = typeof allocData === 'object' ? (allocData.qty || 0) : allocData;
      
      if (requestedQty > allocatedToCust) {
         throw new Error(`Cannot Un-Reserve ${requestedQty} units. Customer ${baseTag} only has ${allocatedToCust} units of ${trueRef} currently reserved.`);
      }
    }

    return true;
  }
};