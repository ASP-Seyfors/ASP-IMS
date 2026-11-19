// ASP IMS - GLOBAL ENVIRONMENT CONFIGURATION
let ENV_CONFIG = {};
const currentUrl = window.location.href.toUpperCase();
const devToolsCheatCode = "OPENSAYSME";

// DYNAMIC ASSET & ICON ROUTING (Automatically applies _DEV / _DEMO or shared filenames)
const envSuffix = currentUrl.includes("ASP-IMS-DEMO") ? "_DEMO" : (currentUrl.includes("ASP-IMS-DEV") ? "_DEV" : "");

// 1.                                                                       DEMO ENVIRONMENT
if (currentUrl.includes("ASP-IMS-DEMO")) {
    ENV_CONFIG = {
        CLOUD_ARCHIVE_URL: "https://script.google.com/macros/s/AKfycbyODX9mhA1QL83lRcpWEuRQ6JGjFSYCYu_dnUbTrfXzVb59Q2jflnyxX4-DvbOBazj2yg/exec",
        GOOGLE_FEEDER_URL: "https://script.google.com/macros/s/AKfycbx2IMSdGKmIVsiXms5FjH-ZRXYeMzwmCd2n6wiaff5F4ORO8Kdjilp65mFmp4WcqaZL6w/exec",
        APP_VERSION: "7.2.4 (DEMO)",
        ENVIRONMENT_NAME: "ASP DEMO",
        THEME_COLOR: "#f1d84a"
    };
} 
// 2.                                                                       DEV ENVIRONMENT
else if (currentUrl.includes("ASP-IMS-DEV")) {
    ENV_CONFIG = {
        CLOUD_ARCHIVE_URL: "https://script.google.com/macros/s/AKfycby-jGbxOlkmMDQwDN5x1FHae6OTNlVD4ZsBDWiLzotdp2ALs0JGYe_RYvSoXMDD7EqQeg/exec",
        GOOGLE_FEEDER_URL: "https://script.google.com/macros/s/AKfycbzm9u8lHnJEgDyG8rJk5YaXs8VY_jzyganveRP8UwkgLlMtZxhLjWIZ4iu545H07ogFRw/exec",
        APP_VERSION: "7.2.4 (DEV)",
        ENVIRONMENT_NAME: "ASP DEV",
        THEME_COLOR: "#cf0452"
    };
} 
// 3.                                                           PRODUCTION ENVIRONMENT (Fallback / Default)
else {
    ENV_CONFIG = {
        CLOUD_ARCHIVE_URL: "https://script.google.com/macros/s/AKfycbzJw6P78vbvpYVOAqBqkAJezLpk1SXxwF1ndSs3my6ZeF3pJh1tBHvyGwWcuYsB63uG/exec",
        GOOGLE_FEEDER_URL: "https://script.google.com/macros/s/AKfycbxccIizG_pkX6ARslZCv4ElewSCRz_HUtsn0R8CKpCAFgVKPj972RLrL5eUsTNArq6IeA/exec",
        APP_VERSION: "7.2.4",
        ENVIRONMENT_NAME: "Allied Surgical Products",
        THEME_COLOR: "#0277bd"
    };
}

ENV_CONFIG.LOGO_URL = `ASP_Box_Web_RGB${envSuffix}.png`;
ENV_CONFIG.MEDALLION_URL = `3D_ASP_Logo${envSuffix}.png`;
ENV_CONFIG.SMALL_ICON_URL = `3D_ASP_192_Icon${envSuffix}.png`;
ENV_CONFIG.LARGE_ICON_URL = `3D_ASP_512_Icon${envSuffix}.png`;