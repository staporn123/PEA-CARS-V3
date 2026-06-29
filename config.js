/* ==========================================================
   PEA CARS+ V4 Professional
   config.js
========================================================== */

const CONFIG = {
  // =========================================
  // Google Apps Script API URL
  // =========================================
  API_URL: "https://script.google.com/macros/s/AKfycbzeAhZ3kbSnAD0Rc2zxfJL7Q4-fdBb6ju45Zu9apLK7PBUnWEEUyiiSMTcWfSHYNGUJ/exec",

  API_TIMEOUT: 60000,

  // =========================================
  // Application Information
  // =========================================
  APP_NAME: "PEA CARS+ V4 Professional",
  VERSION: "4.0.0",
  COMPANY: "Provincial Electricity Authority",
  AUTHOR: "PEA NE1",
  TIMEZONE: "Asia/Bangkok",
  DATE_FORMAT: "dd/MM/yyyy",

  // =========================================
  // Auto Refresh
  // =========================================
  AUTO_REFRESH: true,
  REFRESH_INTERVAL: 300000,

  // =========================================
  // Theme Color
  // =========================================
  COLORS: {
    primary: "#6C63FF",
    success: "#16C784",
    warning: "#F59E0B",
    danger: "#EF4444",
    info: "#3B82F6",
    dark: "#0F172A",
    dark2: "#111827",
    border: "#1E293B"
  },

  // =========================================
  // Dashboard Chart Colors
  // =========================================
  CHART_COLORS: [
    "#6C63FF",
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6"
  ],

  // =========================================
  // Default Table Page Size
  // =========================================
  PAGE_SIZE: 50,

  // =========================================
  // Export Setting
  // =========================================
  EXPORT_EXCEL: true,
  EXPORT_PDF: true,

  // =========================================
  // AI Assistant
  // =========================================
  AI_ENABLED: true,
  AI_NAME: "PEA CARS+ Assistant",

  // =========================================
  // Debug Mode
  // =========================================
  DEBUG: true
};

/* ==========================================================
   Console Message
========================================================== */

console.log(
  CONFIG.APP_NAME +
  " Version " +
  CONFIG.VERSION +
  " Loaded Successfully"
);
