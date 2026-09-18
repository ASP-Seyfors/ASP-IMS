// ==========================================
// ASP IMS - GLOBAL ENVIRONMENT CONFIGURATION
// ==========================================
let ENV_CONFIG = {};
const currentUrl = window.location.href.toUpperCase();

// 1. DEMO ENVIRONMENT
if (currentUrl.includes("ASP-IMS-DEMO")) {
    ENV_CONFIG = {
        CLOUD_ARCHIVE_URL: "https://script.google.com/macros/s/AKfycbyODX9mhA1QL83lRcpWEuRQ6JGjFSYCYu_dnUbTrfXzVb59Q2jflnyxX4-DvbOBazj2yg/exec",
        GOOGLE_FEEDER_URL: "https://script.google.com/macros/s/AKfycbx2IMSdGKmIVsiXms5FjH-ZRXYeMzwmCd2n6wiaff5F4ORO8Kdjilp65mFmp4WcqaZL6w/exec",
        APP_VERSION: "5.1.5 (DEMO)",
        ENVIRONMENT_NAME: "ASP DEMO",
        THEME_COLOR: "#37c015", 
        LOGO_URL: "ASP_Box_Web_RGB_DEMO.png",
        SMALL_ICON_URL: "ASP_Icon_192_DEMO.png",
        LARGE_ICON_URL: "ASP_Icon_512_DEMO.png"
    };
} 
// 2. DEV ENVIRONMENT
else if (currentUrl.includes("ASP-IMS-DEV")) {
    ENV_CONFIG = {
        CLOUD_ARCHIVE_URL: "https://script.google.com/macros/s/AKfycby-jGbxOlkmMDQwDN5x1FHae6OTNlVD4ZsBDWiLzotdp2ALs0JGYe_RYvSoXMDD7EqQeg/exec",
        GOOGLE_FEEDER_URL: "https://script.google.com/macros/s/AKfycbzm9u8lHnJEgDyG8rJk5YaXs8VY_jzyganveRP8UwkgLlMtZxhLjWIZ4iu545H07ogFRw/exec",
        APP_VERSION: "5.1.5 (DEV)",
        ENVIRONMENT_NAME: "ASP DEV",
        THEME_COLOR: "#e61b00", 
        LOGO_URL: "ASP_Box_Web_RGB_DEV.png",
        SMALL_ICON_URL: "ASP_Icon_192_DEV.png",
        LARGE_ICON_URL: "ASP_Icon_512_DEV.png"
    };
} 
// 3. PRODUCTION ENVIRONMENT (Fallback / Default)
else {
    ENV_CONFIG = {
        CLOUD_ARCHIVE_URL: "https://script.google.com/macros/s/AKfycbzJw6P78vbvpYVOAqBqkAJezLpk1SXxwF1ndSs3my6ZeF3pJh1tBHvyGwWcuYsB63uG/exec",
        GOOGLE_FEEDER_URL: "https://script.google.com/macros/s/AKfycbxccIizG_pkX6ARslZCv4ElewSCRz_HUtsn0R8CKpCAFgVKPj972RLrL5eUsTNArq6IeA/exec",
        APP_VERSION: "4.9.9",
        ENVIRONMENT_NAME: "Allied Surgical Products",
        THEME_COLOR: "#0277bd", 
        LOGO_URL: "ASP_Box_Web_RGB.png",
        SMALL_ICON_URL: "ASP_Icon_192.png",
        LARGE_ICON_URL: "ASP_Icon_512.png"
    };
}