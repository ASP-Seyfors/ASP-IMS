# ASP Scanner – Operations Guide

Welcome to the Allied Surgical Products (ASP) Scanner application. This platform is a cloud-synchronized, Progressive Web App (PWA) designed for warehouse inventory management, GS1 barcode data extraction, and FEFO (First-Expired-First-Out) traceability.

---

## 1. Authentication & Security (Login Screen)
The app is protected by a Google Workspace gatekeeper.
* **Google Sign-In:** Users must log in with an `@alliedsurgicalproducts.com` email address.
* **Guest Mode:** Allows temporary entry but strictly locks down the app. Guests cannot access the Enterprise Hub, Stocktake features, or edit the master database.
* **Role-Based Access (RBAC):** The system recognizes approved Admin emails. Only Admins can view or modify the restricted "Unit Cost" field in the Database Editor. Non-admins will see this field masked as `***`.

## 2. Session Setup (Home Screen)
This is the main launchpad for all daily operations.
* **🔄 Sync System:** The master button. It automatically pushes pending logs to the Cloud, pulls down new Master Catalog updates, downloads the Cloud Vault Directory, and fetches the latest orders from QuickBooks Online.
* **🔴 Updates Pending / Cloud Updates Available:** A visual indicator that alerts the user when local data needs to be pushed, or when the master Google Sheet has been modified remotely.
* **Advanced Checkbox:** Toggles the visibility of Enterprise tools. When unchecked, the UI is simplified for standard warehouse floor scanning.
* **Session Type (Shipment vs. Order):** * *Shipment:* Defaults the workflow to "Receiving & Reserving" and asks for a Supplier.
  * *Order:* Defaults the workflow to either "Reserving" or "Picking & Packing" and asks for a Customer.
* **🔍 Item Lookup:** A quick-search tool to instantly verify the on-hand quantity, price, and manufacturer of a specific REF/SKU without starting a full session.

## 3. Pre-Load Manifests & QBO Sync (Advanced Mode)
Used for intelligent fulfillment against expected orders.
* **☁️ QBO Invoice Sync:** Located in the Settings panel. Pulls open invoices directly from QuickBooks Online and stages them in the dropdown feed for immediate picking.
* **Copy/Paste Parser:** Allows the user to paste a raw spreadsheet. It automatically detects SKUs, Quantities, and Customer POs.
* **SHELF Splitter:** If a pasted row contains "SHELF", the app intelligently splits the quantity—reserving the requested amount for the specific customer and routing the remainder to standard Inventory.

## 4. The Scanning Engine
The core data capture screen utilizing the device camera.
* **📷 Open Camera:** Launches the HTML5 viewfinder. It automatically parses standard 1D barcodes and complex 2D GS1 DataMatrix codes.
* **Raw Barcode Scans:** The system extracts the GTIN (01), Lot (10), and Expiration Date (17) from GS1 strings automatically, ignoring formatting brackets.
* **N/A Checkboxes:** If an item lacks a Lot or Expiration, checking "N/A" safely bypasses the validation warning.
* **Destination Tags:** * *Inventory:* Routes the item to standard warehouse stock.
  * *Reserved:* Attaches a specific Customer/Order tag to the item to reserve it for fulfillment.
* **⚠️ Add Item Issue / Note:** Attaches a specific damage or discrepancy note directly to that exact item's scan record.

## 5. Review & Summary
The final checkpoints before committing a session.
* **GTIN Difference Banner:** If a scanned GTIN differs from what the database expects, a warning appears allowing the user to update the master record instantly.
* **Manifest Tracker:** Shows live progress (e.g., "5/10 Expected"). Unexpected items are flagged in orange.
* **Discrepancy Detection:** On the summary screen, any shortages or overages against the expected manifest are highlighted for immediate reconciliation.
* **Resolve New Items:** Prompts the user to enter descriptions for any newly discovered REFs before completing the session. A quick-link Google Search button is provided to find the manufacturer's product page.
* **Session Commit:** When a session is "Completed", the payload is immediately processed into the master inventory calculation and uploaded to the Google Sheets Cloud Archive.

## 6. Enterprise Data Hub
Generates standalone business intelligence documents and audits.
* **🗄️ Database Editor:** A direct interface to the master catalog. Allows Admins to safely edit Price, Cost, and Descriptions, and push updates back to Google Sheets.
* **📊 Reports Hub:** Generates complete inventory PDFs, Customer Stock Flyers, and Internal Sales intelligence briefs.
* **📋 Stocktake (Full vs. Selection):** * *Full Stocktake:* Mandates a Session Note. It zeroes out the *entire* local database first, then applies only the newly counted items. 
  * *Selection Stocktake:* Lightweight audit. Only zeroes out the specific REFs that are scanned, leaving the rest of the warehouse catalog untouched. Both modes automatically generate a Variance Report PDF detailing net financial impact.
* **📦 Traceability (FEFO Calculation):** The engine dynamically parses all historical session payloads to calculate live Expiration Risk and track a specific Lot's journey from Receiving to Fulfillment.

## 7. Session Archive & Cloud Vault
The historical record and device storage management center.
* **📱 Local Device:** Displays active, pending, or recently completed sessions stored directly on the device memory.
* **☁️ Cloud Vault:** Connects to the master Google Sheets backend. Displays a lightweight directory of all historical sessions across the organization. Users can click "Download & Restore" to pull a specific historical payload back into their active scanner memory for review.
* **🧹 Offload & Purge (Settings Screen):** A storage optimization tool that safely verifies all completed sessions are backed up to the cloud, then wipes the heavy JSON payloads from the local device to maintain maximum app performance.

---
*Developed for Allied Surgical Products | Copyright © 2026 Thomas Paul Seyfors*