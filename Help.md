# ASP Inventory Management System – Operations Guide

Welcome to the ASP Inventory Management System! This application is designed to help you quickly scan, track, and manage warehouse inventory.

## Table of Contents
* [1. Login & Security](#1-login-security)
* [2. The Home Screen](#2-the-home-screen)
* [3. Enterprise Tools & Database](#3-enterprise-tools-database)
* [4. Pre-Loading Orders](#4-pre-loading-orders)
* [5. Scanning Items](#5-scanning-items)
* [6. Reviewing & Completing Sessions](#6-reviewing-completing-sessions)
* [7. Traceability & Damaged Goods](#7-traceability-damaged-goods)
* [8. Session Archive](#8-session-archive)
* [9. Developer & Admin Tools](#9-developer-admin-tools)

---

## 1. Login & Security
To keep our inventory data safe, the app requires a verified login.
* **Google Sign-In:** You must log in using your `@alliedsurgicalproducts.com` email address. 
* **Guest Mode:** If you do not have an ASP email, you can enter as a Guest. Guest mode is strictly locked down: you can scan items, but you cannot view the master database, customer bins, or enterprise reports.
* **Admin Access:** Certain features (like editing pricing or accessing Developer Tools) are automatically restricted to authorized Administrators only. 

## 2. The Home Screen
This is your main dashboard where you start every task.
* **🔄 Sync System:** Click this button at the start of your shift! It downloads the latest database catalog and uploads any pending logs you have saved locally.
* **🔴 Updates Pending:** A red warning text will appear here if you have unsaved data on your device that needs to be synced to the cloud.
* **Advanced Checkbox:** Check this box to reveal the Enterprise Data Hub, Reports, and Pre-Load tools. Leave it unchecked for a clean, simple scanning screen.
* **Session Type:** 
  * *Shipment (Incoming):* Use this when items are arriving at the warehouse. It will ask you to select a Supplier.
  * *Order (Outgoing):* Use this when items are leaving the warehouse or being set aside. It will ask you to select a Customer.
* **🔍 Item Lookup:** A quick way to scan a barcode or type a REF to instantly see its description, price, and how many are currently sitting on the warehouse shelves.

## 3. Enterprise Tools & Database
*(Requires the "Advanced" checkbox to be ticked)*
* **🗄️ Database Editor:** Allows you to view the master catalog. Click the "Edit" button next to any item to update its description, shelf location, or active status.  
* **📊 Reports & Analytics:** Used to generate reports of On-Hand Stock, Unified Expiration Warnings (FEFO), RevMed Catalog data, or create Custom Promotional Flyers to email to customers.
* **🗃️ Customer Bins:** A quick-view tool that lists every item currently sitting in a physical reserve bin for a specific customer. 

## 4. Pre-Loading Orders
*(Requires the "Advanced" checkbox to be ticked)*
Instead of scanning items blindly, you can tell the app what items you *expect* to scan.
* **Pre-Load Order Information:** Check this box to type in a manual list of expected items (or paste a spreadsheet from an email). The app will track your progress as you scan them.
* **☁️ Fetch Orders (QBO):** Pulls open invoices directly from QuickBooks Online. You can select an invoice from the dropdown, and the app will automatically pre-load the expected items for you.

## 5. Scanning Items
The core screen where you capture barcodes using the tablet's camera.
* **📷 Open Camera:** Launches the camera. It automatically reads both standard 1D barcodes and the square 2D medical barcodes.
* **N/A Checkboxes:** If an item's box is missing a Lot Number or Expiration Date, simply check the "N/A" box so the system knows it isn't a mistake.
* **Item Destination:** 
  * *Inventory:* Sends the item to standard warehouse stock.
  * *Reserved:* Attaches a specific Customer tag to the item so it is set aside for an order.
* **⚠️ Add Item Issue / Note:** Use this if a box is crushed or damaged. Whatever you type here will be permanently attached to that item's history.

## 6. Reviewing & Completing Sessions
* **Verify Screen:** Before saving an item, the app shows you exactly what it captured. If the scanner grabbed the wrong date, hit "Return to Edit" to fix it.
* **Discrepancies:** If you used a Pre-Load manifest, the Summary screen will highlight any shortages (missing items) or overages (extra items) in bright orange so you can fix them before finishing.
* **Session Actions:** 
  * *Complete Session:* Saves the math to the database and uploads it to the cloud.
  * *Suspend / Save as Pending:* Pauses the session so you can come back and finish scanning later. 
  * *Cancel:* Throws away everything you just scanned.

## 7. Traceability & Damaged Goods
Located inside the **Traceability** button on the Home Screen.
* **Lot Traceability:** Type in a specific Lot Number to see exactly when it arrived, who scanned it, and what customer it was shipped to.
* **⚠️ Damaged Inventory Hub:** If items are flagged as damaged during scanning, they are quarantined here. You can view the list of damaged goods or export it to a spreadsheet to send back to a vendor.

## 8. Session Archive
* **📱 Local Archive:** Shows sessions saved directly on your tablet.
* **☁️ Cloud Archive:** Connects to the master Google Vault to show every session ever performed by any user. You can click "Download & Restore" to pull an old session back onto your screen.
* **Search Bar:** Use the search bar at the top of the archive to quickly find a specific session by Customer name, PO number, or Date.

## 9. Developer & Admin Tools
*(Accessible via Settings. Restricted to System Administrators.)*
* 📊 End of Week Rollup: Automatically pulls the live Cloud Ledger to generate a master KPI summary for the last 7 days.
* **🛠️ Developer Tools:** A highly restricted page for maintaining the app.
* ⏪ Reverse Session: Used to reverse a recent Receiving or Reserving session from the last 24 hours.
* ⚠️ System Restore: Rebuilds from the selected Stocktake. Downloads a historical "Full Stocktake" baseline and mathematically replays every subsequent session.
* **🧹 Offload & Purge Local History:** Cleans up the tablet's memory by deleting old completed sessions while keeping pending sessions safe.
* **🗑️ Force Update / Clear Cache:** The "Nuclear Option." Wipes the app completely and forces it to download the newest version of the code from the internet. Use this if the app is glitching. 
* **🐞 Live Debug Console:** Opens a floating window that tracks background code execution to help track down bugs while using the app.

## 10. Licensing & Intellectual Property
**Proprietary Software:** The ASP Inventory Management System (ASP IMS) architectural codebase, routing algorithms, and workflow structures are the proprietary intellectual property of Thomas Seyfors. 
**Usage License:** Licensed exclusively for internal use by Allied Surgical Products. Unauthorized distribution, reverse engineering, or external commercial deployment of this codebase is strictly prohibited.