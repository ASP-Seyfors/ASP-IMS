# ASP Scanner v3.0.5 – Operations Guide

Welcome to the Allied Surgical Products (ASP) Scanner application. This platform is a cloud-synchronized, Progressive Web App (PWA) designed for warehouse inventory management, GS1 barcode data extraction, and FEFO (First-Expired-First-Out) traceability.

---

## 1. Authentication & Security (Login Screen)
The app is protected by a Google Workspace gatekeeper.
* **Google Sign-In:** Users must log in with an `@alliedsurgicalproducts.com` email address.
* **Guest Mode:** Allows temporary entry but strictly locks down the app. Guests cannot access the Enterprise Hub, Audit Hub, Stocktake features, or edit the master database.
* **Role-Based Access (RBAC):** The system recognizes approved Admin emails. Only Admins can modify the "Selling Price" and "Unit Cost" fields in the database.

## 2. Session Setup (Home Screen)
This is the main launchpad for all daily operations.
* **🔄 Sync System:** The master button. It simultaneously pushes any completed local sessions to the Cloud Archive, uploads new catalog items, and downloads the latest master catalog (Manufacturers, Customers, Suppliers) directly from Google Sheets.
* **Advanced Checkbox:** Toggles the visibility of Enterprise tools. When unchecked, the UI is simplified for standard warehouse floor scanning. When checked, it reveals Pre-Load Manifests, the Enterprise Hub, Stocktakes, and Traceability tools.
* **Session Type (Shipment vs. Order):** 
  * *Shipment:* Defaults the workflow to "Receiving & Reserving" and asks for a Supplier.
  * *Order:* Defaults the workflow to either "Reserving" or "Picking & Packing" and asks for a Customer.

## 3. Pre-Load Manifests (Advanced Mode)
Used for intelligent receiving against an expected packing slip.
* **☁️ Sync Feed:** Pulls staged orders directly from the `ASP_Scanner_Feed` Google Sheet.
* **Copy/Paste Parser:** Allows the user to paste a raw spreadsheet. It automatically detects SKUs, Quantities, and Customer POs.
* **SHELF Splitter:** If a pasted row contains "SHELF", the app intelligently splits the quantity—reserving the requested amount for the specific customer and routing the remainder to standard Inventory.

## 4. The Scanning Engine
The core data capture screen utilizing the device camera.
* **📷 Open Camera:** Launches the HTML5 viewfinder. It automatically parses standard 1D barcodes and complex 2D GS1 DataMatrix codes.
* **Raw Barcode Scans:** The system extracts the GTIN (01), Lot (10), and Expiration Date (17) from GS1 strings automatically, ignoring formatting brackets.
* **N/A Checkboxes:** If an item lacks a Lot or Expiration, checking "N/A" safely bypasses the validation warning.
* **Destination Tags:** 
  * *Inventory:* Routes the item to standard warehouse stock.
  * *Reserved:* Attaches a specific Customer/Order tag to the item to reserve it for fulfillment.
* **⚠️ Add Item Issue / Note:** Attaches a specific damage or discrepancy note directly to that exact item's scan record.

## 5. Review & Summary
The final checkpoints before committing a session.
* **GTIN Difference Banner:** If a scanned GTIN differs from what the database expects, a warning appears allowing the user to update the master record instantly.
* **Manifest Tracker:** Shows live progress (e.g., "5/10 Expected"). Unexpected items are flagged in orange.
* **Discrepancy Detection:** On the summary screen, any shortages or overages against the expected manifest are highlighted for immediate reconciliation.
* **Resolve New Items:** Prompts the user to enter descriptions for any newly discovered REFs before completing the session.
* **Export Actions Dropdown:** Options to save as PDF, TXT, suspend to Pending Backorder, or successfully Complete the session (which auto-pushes the log to the cloud).

## 6. Enterprise Reports Hub
Generates standalone business intelligence documents.
* **Full On-Hand Stock:** Generates a complete inventory PDF with customizable columns (Manufacturer, Description, Price).
* **Expiration Risk (FEFO):** Calculates active stock from historical logs and flags items expiring in 6, 12, or 24 months.
* **Customer Internal Sales:** Provides an internal strategic brief on a specific customer's top 10 historical purchases, margins, and active on-hand warehouse availability.
* **Customer Stock Flyer:** Generates a clean PDF of available historical items for a customer. The **"📧 Copy to Email"** button drafts a beautifully formatted HTML table to the clipboard, ready to paste directly into an email draft to the client.

## 7. Audit & Traceability Hub
The reconciliation and export engine.
* **File Upload:** Accepts multiple `.txt` session logs simultaneously to build a comprehensive timeline.
* **Lifecycle Traceability:** Tracks a single Lot's journey from the day it was Received, to when it was Reserved, to the day it was Packed.
* **Thrive CSV Exports:** Instantly formats the audited logs into the exact "Bulk Create" or "Bulk Edit" CSV formats required by the Thrive inventory system.
* **End of Week Rollup:** Generates a master PDF detailing total unique REFs touched, inbound/outbound volume, and all newly discovered items.

## 8. Stocktake Protocol
Financial and physical auditing tools.
* **Full Stocktake:** Formal audit. Mandates a Session Note. It zeroes out the *entire* local database first, then applies only the newly counted items. Any item not scanned is considered lost.
* **Selection Stocktake:** Lightweight audit. Only zeroes out the specific REFs that are scanned, leaving the rest of the warehouse catalog untouched.
* **Variance Report:** Automatically generates a PDF showing what the system expected, what was actually counted, the unit variance, and the total net financial impact (gain/shrinkage).

---
*Developed for Allied Surgical Products | Copyright © 2026 Thomas Paul Seyfors*