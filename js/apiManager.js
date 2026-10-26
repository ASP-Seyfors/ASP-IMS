/* =======================================================================
 * Allied Surgical Products - Inventory Management System
 * File: js/apiManager.js
 * Description: Centralized network routing and endpoint management.
 * ======================================================================= */
const ApiManager = {
  cloudArchiveUrl: ENV_CONFIG.CLOUD_ARCHIVE_URL,
  googleFeederUrl: ENV_CONFIG.GOOGLE_FEEDER_URL,

  getActiveArchiveUrl() {
    return this.cloudArchiveUrl;
  },
  
  getActiveFeederUrl() {
    return this.googleFeederUrl;
  }
};