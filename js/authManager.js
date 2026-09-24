/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/authManager.js
 * Author: Thomas Seyfors
 * Date Created: August 2026
 * 
 * Description:
 *   Security and authentication gatekeeper. Manages Google Workspace 
 *   OAuth 2.0 sign-in, session storage tokens, and Role-Based Access Control 
 *   (RBAC) for Admin functionality.
 *
 * Affected Features:
 *   - Google Account Sign-In
 *   - Guest Mode Restrictions
 *   - UI Locking & Element Visibility
 *   - Developer Tools Access
 *
 * Copyright (c) 2026 Thomas Seyfors / Allied Surgical Products.
 * All Rights Reserved.
 * ======================================================================= */
const AuthManager = {
  currentUser: null,
  isGuest: false,
  isWorkstation: false, // NEW FLAG

  idleTimeout: null,
  idleDuration: 60 * 60 * 1000, // 1 hour in milliseconds
  activityEvents: ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'],
  
  // NOTE: This is the actual Google Cloud Client ID to allow secure Google Sign-in.
  clientId: "578227168676-721gv6n3bt5qqcd67v1vhi6111c35fcc.apps.googleusercontent.com",

  init() {
    let savedSession = sessionStorage.getItem('asp_auth_session');
    if (savedSession) {
      this.currentUser = JSON.parse(savedSession);
      this.isGuest = false;
      this.isWorkstation = (this.currentUser.role === 'WORKSTATION');
      this.unlockApp();
    } else {
      this.showLoginScreen();
    }
  },

  showLoginScreen() {
    document.body.style.borderTop = "none"; // ✨ Hide banner on login screen
    document.getElementById('screenSetup').style.display = 'none';
    document.getElementById('screenLogin').style.display = 'flex';
    this.renderGoogleButton();
  },

  renderGoogleButton() {
    if (window.google && window.google.accounts) {
      google.accounts.id.initialize({
        client_id: this.clientId, 
        callback: (response) => this.handleCredentialResponse(response),
        auto_select: false,
        prompt: 'select_account',
        cancel_on_tap_outside: true
      });

      google.accounts.id.renderButton(
        document.getElementById('googleAuthButton'), 
        { theme: 'outline', size: 'large', width: 350 }
      );
    }
  },

  async handleCredentialResponse(response) {
    const payload = this.parseJwt(response.credential);
    let rawEmail = payload.email.toLowerCase().trim();
    
    // 1. Domain Lockdown
    if (!rawEmail.endsWith('@alliedsurgicalproducts.com') && rawEmail !== 'asp.techops.workstation@gmail.com') {
        alert("Access Denied: You must be an authorized Allied Surgical Products employee.");
        return;
    }

    let overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; justify-content:center; align-items:center; color:#fff; flex-direction:column;';
    overlay.innerHTML = `<div style="font-size:1.5rem; font-weight:bold;">🔐 Authenticating Profile...</div>`;
    document.body.appendChild(overlay);

    try {
        let res = await fetch(`${ENV_CONFIG.CLOUD_ARCHIVE_URL}?action=VERIFY_USER&email=${encodeURIComponent(rawEmail)}`);
        let data = await res.json();
        if(document.getElementById('authOverlay')) document.body.removeChild(document.getElementById('authOverlay'));

        if (data.status === 'success') {
            if (data.profile.disabled) {
                alert("Access Denied: Your account has been disabled. Contact IT Operations.");
                return;
            }
            
            let role = data.profile.role;
            if (role === "GUEST") {
                this.continueAsGuest();
                return;
            }
            
            this.currentUser = { 
                name: data.profile.name || payload.name, 
                email: rawEmail, 
                role: role, 
                verified: true,
                isAdmin: (role === 'ADMIN' || role === 'SYS_ADMIN') 
            };
            
            this.isGuest = false;
            this.isWorkstation = (role === 'WORKSTATION');
            
            if (this.isWorkstation) {
                this.promptWorkstationUser();
            } else {
                sessionStorage.setItem('asp_auth_session', JSON.stringify(this.currentUser));
                this.unlockApp();
            }
        } else {
            alert("Auth Error: " + data.message);
        }
    } catch (err) {
        if(document.getElementById('authOverlay')) document.body.removeChild(document.getElementById('authOverlay'));
        alert("Network Error during authentication: " + err.message);
    }
  },

  // ✨ NEW: Workstation Profile Gateway Functions
  promptWorkstationUser() {
    let modal = document.createElement('div');
    modal.id = 'workstationUserModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box;';
    
    let userList = (typeof DatabaseManager !== 'undefined' && DatabaseManager.users && DatabaseManager.users.length > 0) ? DatabaseManager.users : ["Trey", "Thomas", "Jessica", "+ New User"];
    let optionsHtml = userList.map(u => `<option value="${u}">${u}</option>`).join('');

    modal.innerHTML = `
      <div style="background:#fff; border-radius:8px; width:100%; max-width:400px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.5); text-align:center;">
        <h3 style="margin:0 0 15px 0; color:#0277bd;">🏭 Workstation Login</h3>
        <p style="font-size:0.9rem; color:#555; margin-bottom:15px;">Please select your User Name to continue.</p>
        
        <select id="workstationUserSelect" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:1rem; font-weight:bold; margin-bottom:20px; color:#0277bd;">
            ${optionsHtml}
        </select>

        <div style="display:flex; justify-content:space-between; gap:10px;">
          <button onclick="AuthManager.cancelWorkstationLogin()" style="flex:1; background:#757575; color:#fff; border:none; padding:10px; border-radius:4px; cursor:pointer;">Cancel</button>
          <button onclick="AuthManager.confirmWorkstationLogin()" style="flex:1; background:#0277bd; color:#fff; border:none; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Login</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('workstationUserSelect').addEventListener('change', (e) => {
        if (e.target.value === "+ New User") {
            let newName = prompt("Enter new User Name:");
            if (newName && newName.trim()) {
                let cleanName = newName.trim();
                if (typeof DatabaseManager !== 'undefined' && DatabaseManager.users) {
                    DatabaseManager.users.splice(DatabaseManager.users.length - 1, 0, cleanName);
                    localStorage.setItem('asp_wh_users', JSON.stringify(DatabaseManager.users));
                }
                let opt = document.createElement('option');
                opt.value = cleanName; opt.textContent = cleanName;
                e.target.insertBefore(opt, e.target.lastElementChild);
                e.target.value = cleanName;
            } else {
                e.target.selectedIndex = 0;
            }
        }
    });
  },

  confirmWorkstationLogin() {
    let sel = document.getElementById('workstationUserSelect');
    let chosenName = sel ? sel.value : "";
    if (!chosenName || chosenName === "+ New User") {
        alert("Please select a valid User Name.");
        return;
    }
    
    localStorage.setItem('asp_user_name', chosenName);
    sessionStorage.setItem('asp_auth_session', JSON.stringify(this.currentUser));
    document.getElementById('workstationUserModal').remove();
    this.unlockApp(); // Continue the sequence
  },

  cancelWorkstationLogin() {
    let modal = document.getElementById('workstationUserModal');
    if (modal) modal.remove();
    this.logout(true);
  },

  continueAsGuest() {
    this.isGuest = true;
    this.currentUser = { name: "Guest Scanner", email: "", role: "GUEST", verified: false };
    this.unlockApp();
  },

  unlockApp() {
    document.getElementById('screenLogin').style.display = 'none';
    document.getElementById('screenSetup').style.display = 'block';
    document.body.style.borderTop = "12px solid " + (typeof ENV_CONFIG !== 'undefined' && ENV_CONFIG.THEME_COLOR ? ENV_CONFIG.THEME_COLOR : "#0277bd");
    
    let advLabel = document.getElementById('chkAdvancedMode') ? document.getElementById('chkAdvancedMode').parentElement : null;
    let advChk = document.getElementById('chkAdvancedMode');
    let archiveBtn = document.getElementById('btnSessionArchive');
    let lookupBtn = document.getElementById('btnItemLookup');
    let userNameInput = document.getElementById('userNameInput');
    let userNameSelect = document.getElementById('userNameSelect');
    
    let stagedFeed = document.getElementById('panelStagedFeed');
    let preloadToggle = document.getElementById('rowPreloadToggle');
    let btnStock = document.getElementById('btnStocktake');
    let btnTrace = document.getElementById('btnTraceability');
    let roleBadge = document.getElementById('userRoleBadge');
    
    let reportsInv = document.getElementById('panelInventoryReports');
    let reportsRevMed = document.getElementById('panelRevMedReports');
    let reportsCust = document.getElementById('panelCustomerReports');
    let panelArchiveExport = document.getElementById('panelArchiveExport');
    let panelSubscribers = document.getElementById('panelSubscribers');
    
    let devToolsContainer = document.getElementById('devToolsContainer');
    let rowQboSync = document.getElementById('rowQboSync');
    let rowQboSettings = document.getElementById('rowQboSettings');
    let btnStart = document.querySelector('.btn-start');

    if (this.isGuest) {
      if (advLabel) advLabel.style.display = 'none';
      if (archiveBtn) archiveBtn.style.display = 'none';
      if (lookupBtn) lookupBtn.style.display = 'none';
      if (userNameInput) userNameInput.value = "";
      if (stagedFeed) stagedFeed.style.display = 'none';
      if (preloadToggle) preloadToggle.style.display = 'none';
      if (btnStock) btnStock.style.display = 'none';
      if (btnTrace) btnTrace.style.display = 'none';
      if (rowQboSettings) rowQboSettings.style.display = 'none';
      if (devToolsContainer) devToolsContainer.style.display = 'none';
      if (rowQboSync) rowQboSync.style.display = 'none';
      
      if (roleBadge) { roleBadge.textContent = "Guest Mode"; roleBadge.style.backgroundColor = "#c62828"; }
      
      if (advChk) advChk.checked = false;
      if (typeof UIManager !== 'undefined' && UIManager.toggleAdvancedMode) UIManager.toggleAdvancedMode(false); 
      
      if (typeof DatabaseManager !== 'undefined') {
          DatabaseManager.suppliers = ["+ Add Supplier"]; DatabaseManager.customers = ["+ Add Customer"];
          DatabaseManager.populatePartners(); DatabaseManager.populateItemCustomerSelect();
      }
      return;
    } 

    let r = this.currentUser.role;
    
    // Show standard authorized buttons first
    if (advLabel) advLabel.style.display = 'flex';
    if (archiveBtn) archiveBtn.style.display = 'inline-block';
    if (lookupBtn) lookupBtn.style.display = 'inline-block';
    
    // 1. Force the UI to a clean baseline matching the current form inputs
    if (typeof UIManager !== 'undefined') {
        UIManager.toggleSessionType();
        UIManager.toggleAdvancedMode(); 
    }

    // 1. SALES LOCKDOWN
    if (r === 'SALES') {
        // Force Advanced Mode open FIRST so it builds the UI, then we hide what we don't want
        if (advChk) { advChk.checked = true; if(typeof UIManager !== 'undefined') UIManager.toggleAdvancedMode(true); }
        if (advLabel) advLabel.style.display = 'none';

        // STRICT SCOPE: Only hide form rows on the Setup Screen so we don't break the Settings page
        document.querySelectorAll('#screenSetup .form-row').forEach(row => row.style.display = 'none');
        
        if (btnStart) btnStart.parentElement.style.display = 'none';
        if (archiveBtn) archiveBtn.style.display = 'none';
        if (btnStock) btnStock.style.display = 'none';
        if (preloadToggle) preloadToggle.style.display = 'none';
        if (stagedFeed) stagedFeed.style.display = 'none';
        if (panelArchiveExport) panelArchiveExport.style.display = 'none'; 
    }

    // 2. WORKSTATION / ADMIN / STANDARD LOGIC
    if (this.isWorkstation) {
        if (reportsCust) reportsCust.style.display = 'none';
        if (panelSubscribers) panelSubscribers.style.display = 'none'; 
        if (btnStock) btnStock.style.display = 'none'; 
        
        if (userNameInput) userNameInput.style.display = 'none';
        if (userNameSelect) {
            userNameSelect.style.display = 'block';
            let userList = (typeof DatabaseManager !== 'undefined' && DatabaseManager.users && DatabaseManager.users.length > 0) ? DatabaseManager.users : ["Trey", "Thomas", "Jessica", "+ New User"];
            userNameSelect.innerHTML = userList.map(u => `<option value="${u}">${u}</option>`).join('');
            userNameSelect.value = localStorage.getItem('asp_user_name') || userList[0];
        }
    } else {
        if (userNameInput) { userNameInput.style.display = 'block'; userNameInput.value = this.currentUser.name.split(' ')[0]; }
        if (userNameSelect) userNameSelect.style.display = 'none';
    }

    // 3. ADMIN VISIBILITY
    if (devToolsContainer) devToolsContainer.style.display = (r === 'SYS_ADMIN') ? 'flex' : 'none';
    if (rowQboSettings) rowQboSettings.style.display = (r === 'SYS_ADMIN' || r === 'ADMIN') ? 'flex' : 'none';
    if (rowQboSync) rowQboSync.style.display = (r === 'SYS_ADMIN' || r === 'ADMIN') ? 'flex' : 'none';

    // 4. BADGE COLORS
    if (roleBadge) {
        let badgeMap = { 
            'SYS_ADMIN': {t: 'Sys Admin', c: '#7b1fa2'}, 
            'ADMIN': {t: 'Admin', c: '#d32f2f'}, 
            'SALES': {t: 'Sales', c: '#f57f17'}, 
            'WORKSTATION': {t: 'Workstation', c: '#0277bd'}, 
            'STANDARD': {t: 'Standard', c: '#2e7d32'} 
        };
        let b = badgeMap[r] || {t: 'Guest', c: '#c62828'};
        roleBadge.textContent = b.t;
        roleBadge.style.backgroundColor = b.c;
    }
    
    if (typeof DatabaseManager !== 'undefined') {
        DatabaseManager.suppliers = JSON.parse(localStorage.getItem('asp_wh_suppliers')) || ["+ Add Supplier"];
        DatabaseManager.customers = JSON.parse(localStorage.getItem('asp_wh_customers')) || ["+ Add Customer"];
        DatabaseManager.populatePartners(); 
        DatabaseManager.populateItemCustomerSelect();
    }
    
    if (typeof UIManager !== 'undefined' && typeof UIManager.populateCustomerDropdown === 'function') {
        UIManager.populateCustomerDropdown();    
    }

    if (!sessionStorage.getItem('asp_has_auto_synced')) {
        sessionStorage.setItem('asp_has_auto_synced', 'true');
        setTimeout(() => { if (typeof window.masterSystemSync === 'function') window.masterSystemSync(null); }, 500);
    }
    
    this.startIdleTimer();
  },

  /**
   * Initializes the idle auto-logout timer and attaches event listeners.
   */
  startIdleTimer() {
    this.stopIdleTimer(); // Clear any existing timer/listeners

    // Bind handler so 'this' consistently refers to authManager
    this.handleUserActivity = this.resetIdleTimer.bind(this);

    // Attach listeners with passive flag for performance
    this.activityEvents.forEach((event) => {
      window.addEventListener(event, this.handleUserActivity, { passive: true });
    });

    // Start the initial countdown
    this.resetIdleTimer();
  },

  /**
   * Resets the inactivity timer whenever user action is detected.
   */
  resetIdleTimer() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }

    this.idleTimeout = setTimeout(() => {
      this.handleIdleTimeout();
    }, this.idleDuration);
  },

  /**
   * Removes event listeners and clears the active timer.
   */
  stopIdleTimer() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    if (this.handleUserActivity) {
      this.activityEvents.forEach((event) => {
        window.removeEventListener(event, this.handleUserActivity);
      });
      this.handleUserActivity = null;
    }
  },

  /**
   * Triggered when 60 minutes of inactivity elapse.
   */
  handleIdleTimeout() {
    this.stopIdleTimer();
    console.warn('Session expired due to 1 hour of inactivity.');
    alert('You have been logged out due to inactivity.');
    
    // Pass 'true' to force the logout without asking for confirmation
    this.logout(true); 
  },

  logout(force = false) {
    // Only ask for confirmation if this is a manual logout
    if (!force && !confirm("Are you sure you want to log out?")) return;
    
    // Stop the timer and remove listeners only after we know we are logging out
    this.stopIdleTimer();
    
    this.currentUser = null;
    this.isGuest = false;
    
    // Clear Authentication Tokens
    localStorage.removeItem('asp_auth_session');
    sessionStorage.removeItem('asp_auth_session');
    
    // ✨ FIX: Wipe ALL temporary session flags so the next login forces a massive hard-sync
    sessionStorage.removeItem('asp_allocations_verified');
    sessionStorage.removeItem('asp_has_auto_synced');
    
    localStorage.removeItem('asp_allocations');
    localStorage.removeItem('asp_remote_analytics');
    
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