/* =======================================================================
 * ALLIED SURGICAL PRODUCTS - SCANNER APPLICATION
 * File: js/authManager.js
 * Author: Thomas Paul Seyfors
 * Version: 2.8.0
 * ======================================================================= */
const AuthManager = {
  currentUser: null,
  isGuest: false,
  
  // NOTE: You will need to replace this with your actual Google Cloud Client ID later.
  // For this weekend, the logic will still function using the Guest/Bypass features.
  clientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",

  init() {
    let savedSession = localStorage.getItem('asp_auth_session');
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
      this.currentUser = { name: payload.name, email: payload.email, verified: true };
      this.isGuest = false;
      localStorage.setItem('asp_auth_session', JSON.stringify(this.currentUser));
      this.unlockApp();
    } else {
      alert("Access Denied: You must use an authorized @alliedsurgicalproducts.com email address.");
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

    if (this.isGuest) {
      // LOCKDOWN MODE
      if (advLabel) advLabel.style.display = 'none';
      if (archiveBtn) archiveBtn.style.display = 'none';
      if (lookupBtn) lookupBtn.style.display = 'none';
      if (userNameInput) userNameInput.value = "";
      
      UIManager.toggleAdvancedMode(false); // Force basic mode
      
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