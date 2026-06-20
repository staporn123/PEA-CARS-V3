/* ===========================
   PEA CARS+ V3 CONFIG
=========================== */

// Apps Script Web App URL
const API_URL =
"https://script.google.com/macros/s/AKfycbxAZyCDn0bHcfaj0vxnOTMQRim8h7aiiXQP83VaqQOB82hrAggRi3C1-_Ap7Jay5tth/exec";

// System
const APP_NAME = "PEA CARS+ V3";
const VERSION = "3.0";

// Refresh interval (milliseconds)
const AUTO_REFRESH = 300000; // 5 นาที

// Theme
const THEME = {
  primary: "#7c4dff",
  success: "#00c853",
  danger: "#ff5252",
  warning: "#ff9800",
  info: "#29b6f6"
};

// Priority Colors
const PRIORITY_COLORS = {
  P1: "#ff5252",
  P2: "#ff9800",
  P3: "#29b6f6",
  P4: "#00c853"
};

// Status Colors
const STATUS_COLORS = {
  PASS: "#00c853",
  FAIL: "#ff5252",
  REL: "#00c853",
  TECO: "#ff9800",
  CLSD: "#29b6f6",
  C1: "#29b6f6",
  C2: "#ab47bc",
  C3: "#ff9800",
  D1: "#00c853",
  D2: "#ef5350"
};

// Export filenames
const EXPORT_FILENAME_PROJECT =
"PEA_CARS_ACTIVE_PROJECT";

const EXPORT_FILENAME_CHECKLIST =
"PEA_CARS_DOCUMENT_CHECKLIST";

// Default page
const DEFAULT_PAGE = "dashboard";

// จำนวนรายการต่อหน้า
const PAGE_SIZE = 100;
