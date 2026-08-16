/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/authManager.js
 * Author: Thomas Paul Seyfors
 * Date: August 2026
 * 
 * Description:
 *   Audit, report generation, and traceability engine. Constructs TXT and
 *   printable HTML/PDF session summaries, calculates live session metrics,
 *   parses multi-log uploads, and builds Thrive CSV export formats.
 *
 * Copyright (c) 2026 Thomas Paul Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */

const AuthManager = {
  currentUser: null,
  isGuest: false,
  
  // NOTE: This is the actual Google Cloud Client ID to allow secure Google Sign-in.
  clientId: "578227168676-721gv6n3bt5qqcd67v1vhi6111c35fcc.apps.googleusercontent.com",

  // Add your authorized admin emails here
  ADMIN_EMAILS: ['jessica@alliedsurgicalproducts.com', 'thomas@alliedsurgicalproducts.com'],

  init() {
    // SECURITY UPGRADE: Use sessionStorage so it clears when the app/tab is closed
    let savedSession = sessionStorage.getItem('asp_auth_session');
    if (savedSession) {
      this.currentUser = JSON.parse(savedSession);
      this.isGuest = false;
      this.unlockApp();
    } else {
      this.showLoginScreen();
    }
  },

  showLoginScreen() {
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenLogin').style.display = 'flex';
    this.renderGoogleButton();
  },

  renderGoogleButton() {
    if (window.google && window.google.accounts) {
      google.accounts.id.initialize({
        client_id: this.clientId,
        callback: this.handleCredentialResponse.bind(this)
      });
      google.accounts.id.renderButton(
        document.getElementById("googleAuthButton"),
        { theme: "outline", size: "large", width: "100%" }
      );
    }
  },

  handleCredentialResponse(response) {
    const payload = this.parseJwt(response.credential);
    
    // Domain Verification Lockdown
    if (payload.email && payload.email.endsWith('@alliedsurgicalproducts.com')) {
      
      // RBAC Check for Price/Cost Editing
      let isAdmin = this.ADMIN_EMAILS.includes(payload.email.toLowerCase());
      
      this.currentUser = { name: payload.name, email: payload.email, verified: true, isAdmin: isAdmin };
      this.isGuest = false;
      
      // Save to sessionStorage instead of localStorage
      sessionStorage.setItem('asp_auth_session', JSON.stringify(this.currentUser));
      this.unlockApp();
    } else {
      alert("Access Denied: You must be an authorized Allied Surgical Products employee.");
    }
  },

  continueAsGuest() {
    this.isGuest = true;
    this.currentUser = { name: "Guest Scanner", email: "", verified: false };
    this.unlockApp();
  },

  unlockApp() {
    document.getElementById('screenLogin').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
    
    let advLabel = document.getElementById('chkAdvancedMode') ? document.getElementById('chkAdvancedMode').parentElement : null;
    let archiveBtn = document.getElementById('btnSessionArchive');
    let lookupBtn = document.getElementById('btnItemLookup');
    let userNameInput = document.getElementById('userNameInput');
    
    let stagedFeed = document.getElementById('panelStagedFeed');
    let preloadToggle = document.getElementById('rowPreloadToggle');
    let enterpriseHub = document.getElementById('panelEnterpriseHub');
    let btnStock = document.getElementById('btnStocktake');
    let btnTrace = document.getElementById('btnTraceability');
    let roleBadge = document.getElementById('userRoleBadge');

    if (this.isGuest) {
      // LOCKDOWN MODE
      if (advLabel) advLabel.style.display = 'none';
      if (archiveBtn) archiveBtn.style.display = 'none';
      if (lookupBtn) lookupBtn.style.display = 'none';
      if (userNameInput) userNameInput.value = "";
      
      if (stagedFeed) stagedFeed.style.display = 'none';
      if (preloadToggle) preloadToggle.style.display = 'none';
      if (enterpriseHub) enterpriseHub.style.display = 'none';
      if (btnStock) btnStock.style.display = 'none';
      if (btnTrace) btnTrace.style.display = 'none';
      
      if (roleBadge) {
        roleBadge.textContent = "Guest Mode";
        roleBadge.style.backgroundColor = "#c62828";
      }
      
      // Force checkbox to uncheck, then trigger UI lockdown
      let chk = document.getElementById('chkAdvancedMode');
      if (chk) chk.checked = false;
      UIManager.toggleAdvancedMode(false); 
      
      // Purge business intelligence from dropdowns
      DatabaseManager.suppliers = ["+ Add Supplier"];
      DatabaseManager.customers = ["+ Add Customer"];
      DatabaseManager.populatePartners();
      DatabaseManager.populateItemCustomerSelect();
      
    } else {
      // VERIFIED MODE
      if (advLabel) advLabel.style.display = 'flex';
      if (archiveBtn) archiveBtn.style.display = 'inline-block';
      if (lookupBtn) lookupBtn.style.display = 'inline-block';
      if (userNameInput) userNameInput.value = this.currentUser.name.split(' ')[0];
      
      if (roleBadge) {
        roleBadge.textContent = "Verified Workspace";
        roleBadge.style.backgroundColor = "#2e7d32";
      }
      
      // Restore standard lists
      DatabaseManager.suppliers = JSON.parse(localStorage.getItem('asp_wh_suppliers')) || ["+ Add Supplier"];
      DatabaseManager.customers = JSON.parse(localStorage.getItem('asp_wh_customers')) || ["+ Add Customer"];
      DatabaseManager.populatePartners();
      DatabaseManager.populateItemCustomerSelect();
      if (typeof UIManager.populateCustomerDropdown === 'function') UIManager.populateCustomerDropdown();
    }
  },

  logout() {
    if (!confirm("Are you sure you want to log out?")) return;
    this.currentUser = null;
    this.isGuest = false;
    localStorage.removeItem('asp_auth_session');
    sessionStorage.removeItem('asp_auth_session');
    window.location.reload();
  },

  parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  }
};