/* =========================================================
   PEA CARS+ V4 Professional Edition - Turbo V6.2 Stable Filter Logic
   File: script.js
   Copy ทั้งไฟล์นี้ไปวางทับ script.js เดิม
========================================================= */

let allProjects = [];
let workQueue = [];
let alertCenter = [];
let materialWaiting = [];
let projectTimeline = [];
let dataUpdateInfo = null;

let statusChart = null;
let issueChart = null;
let selectedProject = null;
let activeDashboardFilter = "all";
const detailCache = new Map();

document.addEventListener("DOMContentLoaded", function () {
  injectDashboardFilterStyle();
  injectAssistantClearButton();
  bindEvents();
  loadAllData();
});


function injectDashboardFilterStyle() {
  if (document.getElementById("dashboardFilterStyle")) return;

  const style = document.createElement("style");
  style.id = "dashboardFilterStyle";
  style.textContent = `
    .kpi-card { cursor: pointer; }
    .kpi-card.active-filter {
      border-color: rgba(56, 189, 248, 0.9) !important;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18), 0 18px 45px rgba(37, 99, 235, 0.34) !important;
      transform: translateY(-2px);
    }
    .kpi-card.kpi-c3 {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(124, 58, 237, 0.16));
    }
    .timeline-summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .timeline-chip {
      padding: 10px 12px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.42);
    }
    .timeline-chip-label {
      color: #94a3b8;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .timeline-chip-value {
      color: #f8fafc;
      font-weight: 800;
      font-size: 15px;
    }
    .material-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .material-tag {
      border: 1px solid rgba(56, 189, 248, 0.26);
      background: rgba(14, 165, 233, 0.12);
      color: #dbeafe;
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 700;
      max-width: 100%;
    }
    .last-update-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(15, 23, 42, .6);
      border: 1px solid rgba(148, 163, 184, .22);
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}


function injectAssistantClearButton() {
  if (document.getElementById("clearChatBtn")) return;

  const chatBox = document.getElementById("chatBox");
  const sendBtn = document.getElementById("assistantSendBtn");
  const input = document.getElementById("assistantInput");

  if (!chatBox && !sendBtn && !input) return;

  const btn = document.createElement("button");
  btn.id = "clearChatBtn";
  btn.type = "button";
  btn.textContent = "🧹 ล้างข้อความ";
  btn.title = "ล้างข้อความใน AI Assistant";
  btn.style.marginLeft = "8px";

  btn.addEventListener("click", clearAssistantChat);

  if (sendBtn && sendBtn.parentNode) {
    sendBtn.parentNode.insertBefore(btn, sendBtn.nextSibling);
  } else if (input && input.parentNode) {
    input.parentNode.appendChild(btn);
  }
}

function clearAssistantChat() {
  const box = document.getElementById("chatBox");
  if (!box) return;

  box.innerHTML = `
    <div class="bot-msg">
      สวัสดีครับ ผมคือ PEA CARS+ Assistant<br>
      พิมพ์ WBS, ชื่อผู้รับผิดชอบ, "ติดเอกสาร", "ติดพัสดุ", "ติดค่าใช้จ่าย", "ติด Time" หรือ "พร้อมปิด" ได้เลยครับ
    </div>
  `;
}

if (typeof window !== "undefined") {
  window.clearAssistantChat = clearAssistantChat;
}

function unwrapArray(response) {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.items)) return response.items;
  if (response && Array.isArray(response.data)) return response.data;
  if (response && Array.isArray(response.rows)) return response.rows;
  return [];
}

function unwrapObject(response) {
  if (response && response.data && typeof response.data === "object") {
    return response.data;
  }
  return response || {};
}

function getApiUrl() {
  if (typeof CONFIG !== "undefined" && CONFIG.API_URL) return CONFIG.API_URL;
  if (typeof window !== "undefined" && window.CONFIG && window.CONFIG.API_URL) return window.CONFIG.API_URL;
  throw new Error("ไม่พบ CONFIG.API_URL ใน config.js");
}

function apiAction(action, params) {
  params = params || {};

  return new Promise(function (resolve, reject) {
    const callbackName = "peaCarsCb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const timeoutMs = (typeof CONFIG !== "undefined" && CONFIG.API_TIMEOUT) ? CONFIG.API_TIMEOUT : 60000;

    const query = Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
    }).join("&");

    const url =
      getApiUrl() +
      "?action=" + encodeURIComponent(action) +
      (query ? "&" + query : "") +
      "&callback=" + encodeURIComponent(callbackName) +
      "&_ts=" + Date.now();

    const script = document.createElement("script");
    let done = false;

    const timer = setTimeout(function () {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("API timeout: " + action));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function (data) {
      if (done) return;
      done = true;
      cleanup();

      if (data && data.success === false) {
        reject(new Error(data.message || ("API error: " + action)));
        return;
      }

      resolve(data);
    };

    script.onerror = function () {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("โหลด API ไม่สำเร็จ: " + action));
    };

    script.src = url;
    document.head.appendChild(script);
  });
}


function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showPage(btn.dataset.page);
    });
  });

  // Dashboard KPI filter: ใช้ Event Delegation แทน inline onclick
  // เพื่อให้ทำงานได้แน่นอนแม้ GitHub Pages โหลด script แบบ defer/module
  const kpiGrid = document.getElementById("kpiGrid");
  if (kpiGrid) {
    kpiGrid.addEventListener("click", function (e) {
      const card = e.target.closest(".kpi-card");
      if (!card || !kpiGrid.contains(card)) return;

      const filter = card.getAttribute("data-filter") || "all";
      applyDashboardFilter(filter);
    });

    kpiGrid.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;

      const card = e.target.closest(".kpi-card");
      if (!card || !kpiGrid.contains(card)) return;

      e.preventDefault();
      const filter = card.getAttribute("data-filter") || "all";
      applyDashboardFilter(filter);
    });
  }

  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", function () {
    detailCache.clear();
    loadAllData();
  });

  const projectSearchBtn = document.getElementById("projectSearchBtn");
  if (projectSearchBtn) projectSearchBtn.addEventListener("click", searchProjects);

  const projectSearch = document.getElementById("projectSearch");
  if (projectSearch) {
    projectSearch.addEventListener("keydown", function (e) {
      if (e.key === "Enter") searchProjects();
    });
  }

  const globalSearch = document.getElementById("globalSearch");
  if (globalSearch) {
    globalSearch.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        showPage("projects");
        const projectSearchInput = document.getElementById("projectSearch");
        if (projectSearchInput) projectSearchInput.value = globalSearch.value;
        searchProjects();
      }
    });
  }

  const assistantSendBtn = document.getElementById("assistantSendBtn");
  if (assistantSendBtn) assistantSendBtn.addEventListener("click", askAssistant);

  const clearChatBtn = document.getElementById("clearChatBtn");
  if (clearChatBtn) clearChatBtn.addEventListener("click", clearAssistantChat);

  const assistantInput = document.getElementById("assistantInput");
  if (assistantInput) {
    assistantInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") askAssistant();
    });
  }

  const closeModalBtn = document.getElementById("closeModalBtn");
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);

  const modal = document.getElementById("projectModal");
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(function (p) {
    p.classList.remove("active");
  });

  document.querySelectorAll(".nav-btn").forEach(function (b) {
    b.classList.remove("active");
  });

  const pageEl = document.getElementById(page + "Page");
  if (pageEl) pageEl.classList.add("active");

  const navBtn = document.querySelector('.nav-btn[data-page="' + page + '"]');
  if (navBtn) navBtn.classList.add("active");

  const titleMap = {
    dashboard: "Dashboard",
    projects: "Projects",
    workqueue: "Work Queue",
    alerts: "Alert Center",
    assistant: "AI Assistant"
  };

  const pageTitle = document.getElementById("pageTitle");
  if (pageTitle) pageTitle.textContent = titleMap[page] || "Dashboard";
}

async function loadAllData() {
  try {
    setLoading(true);
    detailCache.clear();

    // TURBO V6: โหลดหน้าแรกด้วย action=init เพียงครั้งเดียว
    // init จะส่งเฉพาะ Dashboard + ACTIVE_PROJECT ไม่โหลด detail หนัก ๆ
    const init = unwrapObject(await apiAction("init"));

    allProjects = init.projects || [];
    workQueue = init.workQueue || [];
    alertCenter = init.alerts || [];
    materialWaiting = normalizeMaterialWaitingRows(init.materialWaiting || init.materialWaitingC3 || init.c3Waiting || []);
    projectTimeline = normalizeTimelineRows(init.projectTimeline || init.timeline || []);
    dataUpdateInfo = init.dataUpdate || init.dataUpdateInfo || (init.dashboard && init.dashboard.dataUpdate) || (init.dashboard && init.dashboard.lastDataUpdate) || init.lastDataUpdate || init.updatedAt || null;

    enrichProjectsWithC3Info();

    // V6.2: คำนวณ KPI จาก allProjects ด้วย Logic เดียวกับตอนกด Filter
    // เพื่อให้จำนวนบนการ์ดตรงกับรายการที่แสดงด้านล่างเสมอ
    const dashboard = buildDashboardFromProjects(allProjects, init.dashboard || {});

    renderKpi(dashboard);
    renderCharts(dashboard);
    activeDashboardFilter = "all";
    renderProjectTable(allProjects);
    renderSearchTable(allProjects);
    renderWorkQueue(workQueue);
    renderAlertCenter(alertCenter);
    renderLastUpdate();

    // โหลด Work Queue / Alert ตามหลังแบบ background ไม่บล็อก Dashboard
    loadLazyDashboardLists();

  } catch (err) {
    console.error(err);
    alert("โหลดข้อมูลไม่สำเร็จ: " + err.message);
  } finally {
    setLoading(false);
  }
}

async function loadLazyDashboardLists() {
  try {
    const results = await Promise.allSettled([
      apiAction("workqueue"),
      apiAction("alerts"),
      apiAction("materialwaiting")
    ]);

    if (results[0].status === "fulfilled") {
      workQueue = unwrapArray(results[0].value);
      renderWorkQueue(workQueue);
    }

    if (results[1].status === "fulfilled") {
      alertCenter = unwrapArray(results[1].value);
      renderAlertCenter(alertCenter);
    }

    if (results[2].status === "fulfilled") {
      if (results[2].value && results[2].value.updatedAt) dataUpdateInfo = results[2].value.updatedAt;
      const mw = unwrapArray(results[2].value);
      if (mw.length) {
        materialWaiting = normalizeMaterialWaitingRows(mw);
        enrichProjectsWithC3Info();
        const dashboard = buildDashboardFromProjects(allProjects, {});
        renderKpi(dashboard);
        renderCharts(dashboard);
        if (activeDashboardFilter === "c3Waiting") applyDashboardFilter("c3Waiting");
      }
    }
  } catch (err) {
    console.warn("Lazy list load skipped:", err);
  }
}

function setLoading(isLoading) {
  const btn = document.getElementById("refreshBtn");
  if (!btn) return;

  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Loading..." : "Refresh";

  const app = document.getElementById("app");
  if (app) app.classList.toggle("loading", isLoading);
}

function renderLastUpdate() {
  const el = document.getElementById("lastUpdate");
  if (!el) return;

  const stamp = getDataUpdateText();
  el.innerHTML = `<span class="last-update-chip">🕘 ข้อมูลล่าสุด: ${escapeHtml(stamp)}</span>`;
}

function getDataUpdateText() {
  if (!dataUpdateInfo) return new Date().toLocaleString("th-TH");

  if (typeof dataUpdateInfo === "string") return formatDateTimeText(dataUpdateInfo);

  if (dataUpdateInfo.lastUpdateDisplay) return String(dataUpdateInfo.lastUpdateDisplay);
  if (dataUpdateInfo.lastUpdate) return formatDateTimeText(dataUpdateInfo.lastUpdate);
  if (dataUpdateInfo.updatedAt) return formatDateTimeText(dataUpdateInfo.updatedAt);
  if (dataUpdateInfo.time) return formatDateTimeText(dataUpdateInfo.time);

  if (Array.isArray(dataUpdateInfo.rows) && dataUpdateInfo.rows.length) {
    const last = dataUpdateInfo.rows
      .map(function (r) { return r.lastUpdate || r.updatedAt || r[1] || ""; })
      .filter(Boolean)
      .sort()
      .pop();
    if (last) return formatDateTimeText(last);
  }

  return new Date().toLocaleString("th-TH");
}

function formatDateTimeText(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleString("th-TH");
  return String(value);
}

/* =========================
   KPI
========================= */


function buildDashboardFromProjects(projects, fallback) {
  projects = Array.isArray(projects) ? projects : [];
  fallback = fallback || {};

  return {
    total: projects.length,
    ready: projects.filter(isReadyProject).length,
    notReady: projects.filter(isNotReadyProject).length,
    closed: projects.filter(isClosedProject).length,
    docIssue: projects.filter(hasDocumentIssue).length,
    materialIssue: projects.filter(hasMaterialIssue).length,
    costIssue: projects.filter(hasCostIssue).length,
    timeIssue: projects.filter(hasTimeIssue).length,
    rel: projects.filter(function (p) { return String(p.systemStatus || "").toUpperCase() === "REL"; }).length,
    teco: projects.filter(function (p) { return String(p.systemStatus || "").toUpperCase() === "TECO"; }).length,
    clsd: projects.filter(function (p) { return String(p.systemStatus || "").toUpperCase() === "CLSD"; }).length,
    c3Waiting: Math.max(projects.filter(isC3WaitingProject).length, Number(fallback.c3Waiting || fallback.materialWaitingC3 || 0)),
    c3MaxDays: getC3MaxWaitingDays(projects),
    materialWaitingValue: getMaterialWaitingTotalValue(),
    _source: fallback._source || "frontend-v6-2"
  };
}

function isClosedProject(p) {
  return String(p.systemStatus || "").toUpperCase() === "CLSD" ||
    String(p.closureStatus || "").trim() === "ปิดแล้ว";
}

function isReadyProject(p) {
  // V6.3: พร้อมปิดงานต้องยึด Ready/Closure เท่านั้น
  // ไม่ใช้ Priority P4 เป็นเงื่อนไข เพราะ P4 อาจเป็นเพียงระดับความพร้อม
  // และอาจมีงาน CLSD / ปิดแล้วปนมาได้
  const ready = String(p.readyToClose || "").toUpperCase() === "YES" ||
    String(p.closureStatus || "").trim() === "พร้อมปิดงาน";

  return ready && !isClosedProject(p);
}

function isNotReadyProject(p) {
  return !isReadyProject(p) && !isClosedProject(p);
}

function hasDocumentIssue(p) {
  return !isPassStatus(p.documentStatus) && !isClosedProject(p);
}

function hasMaterialIssue(p) {
  return !isPassStatus(p.materialStatus) && !isClosedProject(p);
}

function hasCostIssue(p) {
  return !isPassStatus(p.costStatus) && !isClosedProject(p);
}

function hasTimeIssue(p) {
  return !!p.timeStatus && !isPassStatus(p.timeStatus) && !isClosedProject(p);
}


function normalizeMaterialWaitingRows(rows) {
  rows = unwrapArray(rows);
  return rows.map(function (r) {
    if (!r) return null;

    if (Array.isArray(r)) {
      return {
        wbs: safeValueRaw(r[0]),
        jobName: safeValueRaw(r[1]),
        owner: safeValueRaw(r[2]),
        province: safeValueRaw(r[3]),
        status: safeValueRaw(r[4]),
        waitingDays: numberOrBlank(r[5]),
        totalItems: numberOrBlank(r[6]),
        pendingCount: numberOrBlank(r[7]),
        pendingValue: numberOrBlank(r[8]),
        pendingMaterials: safeValueRaw(r[9]),
        priority: safeValueRaw(r[10]),
        remark: safeValueRaw(r[11]),
        mainMaterials: safeValueRaw(r[12])
      };
    }

    return {
      wbs: safeValueRaw(r.wbs || r.WBS),
      jobName: safeValueRaw(r.jobName || r["ชื่องาน"]),
      owner: safeValueRaw(r.owner || r.responsible || r["ผู้รับผิดชอบ"]),
      province: safeValueRaw(r.province || r["จังหวัด"]),
      status: safeValueRaw(r.status || r.currentStatus || r["สถานะ"]),
      waitingDays: numberOrBlank(r.waitingDays || r.materialWaitingDays || r["รอพัสดุ (วัน)"] || r["รอพัสดุ"]),
      totalItems: numberOrBlank(r.totalItems || r.materialTotalItems || r["จำนวนรายการทั้งหมด"] || r["รายการทั้งหมด"]),
      pendingCount: numberOrBlank(r.pendingCount || r.pendingItems || r["จำนวนรายการค้างจริง"] || r["จำนวนรายการค้าง"]),
      pendingValue: numberOrBlank(r.pendingValue || r.pendingAmount || r["มูลค่าค้าง"]),
      pendingMaterials: safeValueRaw(r.pendingMaterials || r.allPendingMaterials || r["รายการพัสดุค้างทั้งหมด"]),
      priority: safeValueRaw(r.priority || r.Priority),
      remark: safeValueRaw(r.remark || r["หมายเหตุ"]),
      mainMaterials: safeValueRaw(r.mainMaterials || r.criticalMaterials || r["สรุปพัสดุหลักที่ค้าง"])
    };
  }).filter(function (r) {
    return r && r.wbs;
  });
}

function normalizeTimelineRows(rows) {
  rows = unwrapArray(rows);
  return rows.map(function (r) {
    if (!r) return null;

    if (Array.isArray(r)) {
      return {
        wbs: safeValueRaw(r[0]),
        jobName: safeValueRaw(r[1]),
        owner: safeValueRaw(r[2]),
        province: safeValueRaw(r[3]),
        systemStatus: safeValueRaw(r[4]),
        userStatus: safeValueRaw(r[5]),
        source: safeValueRaw(r[32]),
        sapChangeCount: numberOrBlank(r[33]),
        cpmChangeCount: numberOrBlank(r[34])
      };
    }

    return {
      wbs: safeValueRaw(r.wbs || r.WBS),
      jobName: safeValueRaw(r.jobName || r["ชื่องาน"]),
      owner: safeValueRaw(r.owner || r["ผู้รับผิดชอบ"]),
      province: safeValueRaw(r.province || r["จังหวัด"]),
      systemStatus: safeValueRaw(r.systemStatus || r["สถานะ SAP ปัจจุบัน"]),
      userStatus: safeValueRaw(r.userStatus || r.stage || r["Stage ปัจจุบัน"]),
      source: safeValueRaw(r.a0Source || r["A0 Source"]),
      sapChangeCount: numberOrBlank(r.sapChangeCount || r["SAP Change Count"]),
      cpmChangeCount: numberOrBlank(r.cpmChangeCount || r["CPM Change Count"])
    };
  }).filter(function (r) {
    return r && r.wbs;
  });
}

function enrichProjectsWithC3Info() {
  const mwMap = new Map();
  materialWaiting.forEach(function (m) {
    mwMap.set(normalizeKey(m.wbs), m);
  });

  const tlMap = new Map();
  projectTimeline.forEach(function (t) {
    tlMap.set(normalizeKey(t.wbs), t);
  });

  allProjects = allProjects.map(function (p) {
    const key = normalizeKey(p.wbs);
    const mw = mwMap.get(key);
    const tl = tlMap.get(key);

    if (mw) {
      p.materialWaiting = mw;
      p.isC3Waiting = true;
      p.c3WaitingDays = mw.waitingDays;
      p.c3TotalItems = mw.totalItems;
      p.c3PendingCount = mw.pendingCount;
      p.c3PendingValue = mw.pendingValue;
      p.c3MainMaterials = mw.mainMaterials || mw.pendingMaterials || "";
    }

    if (tl) {
      p.timeline = tl;
      p.a0Source = normalizeWorkflowSource(tl.a0Source, tl.source || p.a0Source || "");
      p.sapChangeCount = tl.sapChangeCount;
      p.cpmChangeCount = tl.cpmChangeCount;
    }

    return p;
  });
}

function isC3WaitingProject(p) {
  const userStatus = String(p.userStatus || p.stage || "").toUpperCase();
  return p.isC3Waiting === true || userStatus === "C3" || !!getMaterialWaitingForWbs(p.wbs);
}

function getMaterialWaitingForWbs(wbs) {
  const key = normalizeKey(wbs);
  return materialWaiting.find(function (m) {
    return normalizeKey(m.wbs) === key;
  }) || null;
}

function getTimelineForWbs(wbs) {
  const key = normalizeKey(wbs);
  return projectTimeline.find(function (m) {
    return normalizeKey(m.wbs) === key;
  }) || null;
}

function getC3MaxWaitingDays(projects) {
  const values = projects
    .filter(isC3WaitingProject)
    .map(function (p) {
      const mw = getMaterialWaitingForWbs(p.wbs);
      return Number((mw && mw.waitingDays) || p.c3WaitingDays || 0);
    });

  return values.length ? Math.max.apply(null, values) : 0;
}

function getMaterialWaitingTotalValue() {
  return materialWaiting.reduce(function (sum, m) {
    return sum + Number(m.pendingValue || 0);
  }, 0);
}

function safeValueRaw(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberOrBlank(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(String(value).replace(/,/g, "").replace(/บาท/g, "").trim());
  return Number.isNaN(n) ? value : n;
}

function isWorkflowSourceValue(value) {
  const s = String(value || "").trim().toUpperCase();
  return s === "SAP" || s === "CPM" || s === "SAP+CPM" || s === "SAP / CPM";
}

function normalizeWorkflowSource(primary, fallback) {
  if (isWorkflowSourceValue(primary)) return String(primary).trim().toUpperCase();
  if (isWorkflowSourceValue(fallback)) return String(fallback).trim().toUpperCase();

  const p = String(primary || "");
  const f = String(fallback || "");

  // กันกรณี Code.gs ดึงคอลัมน์ A0 วันที่มาใส่ A0 Source ผิด
  if (p.includes("GMT") || p.includes("Jan") || p.includes("/")) {
    return isWorkflowSourceValue(f) ? String(f).trim().toUpperCase() : "-";
  }

  return primary || fallback || "-";
}

function getMaterialWaitingDaysForWbs(wbs) {
  const mw = getMaterialWaitingForWbs(wbs) || (selectedProject && selectedProject.materialWaiting) || null;
  return mw ? (mw.waitingDays || mw.materialWaitingDays || 0) : 0;
}


function renderKpi(data) {
  const kpiGrid = document.getElementById("kpiGrid");
  if (!kpiGrid) return;

  const items = [
    { key: "all", title: "งานทั้งหมด", value: data.total || 0, sub: "โครงการทั้งหมด", icon: "📁", tone: "blue" },
    { key: "ready", title: "พร้อมปิดงาน", value: data.ready || 0, sub: "Ready to Close", icon: "✅", tone: "green" },
    { key: "notReady", title: "ยังไม่พร้อม", value: data.notReady || 0, sub: "Need Action", icon: "⏱️", tone: "orange" },
    { key: "closed", title: "ปิดแล้ว", value: data.closed || 0, sub: "Closed", icon: "🔒", tone: "purple" },
    { key: "docIssue", title: "ติดเอกสาร", value: data.docIssue || 0, sub: "Document Issue", icon: "📄", tone: "red" },
    { key: "materialIssue", title: "ติดพัสดุ", value: data.materialIssue || 0, sub: "Material Issue", icon: "📦", tone: "orange" },
    { key: "costIssue", title: "ติดค่าใช้จ่าย", value: data.costIssue || 0, sub: "Cost Issue", icon: "💰", tone: "yellow" },
    { key: "timeIssue", title: "ติด Time", value: data.timeIssue || 0, sub: "Time Issue", icon: "🕘", tone: "blue" },
    { key: "c3Waiting", title: "C3 รอพัสดุ", value: data.c3Waiting || 0, sub: "Material Waiting", icon: "📦", tone: "c3" },
    { key: "rel", title: "REL", value: data.rel || 0, sub: "Released", icon: "📋", tone: "purple" },
    { key: "teco", title: "TECO", value: data.teco || 0, sub: "Technically Complete", icon: "☑️", tone: "cyan" },
    { key: "clsd", title: "CLSD", value: data.clsd || 0, sub: "Closed Status", icon: "🔐", tone: "green" }
  ];

  kpiGrid.innerHTML = items.map(function (item) {
    const activeClass = item.key === activeDashboardFilter ? " active-filter" : "";

    return `
      <div
        class="kpi-card kpi-${escapeAttr(item.tone)}${activeClass}"
        data-filter="${escapeAttr(item.key)}"
        title="คลิกเพื่อกรองรายการด้านล่าง"
        role="button"
        tabindex="0"
      >
        <div class="kpi-icon">${escapeHtml(item.icon)}</div>
        <div class="kpi-title">${escapeHtml(item.title)}</div>
        <div class="kpi-value">${escapeHtml(item.value)}</div>
        <div class="kpi-sub">${escapeHtml(item.sub)}</div>
      </div>
    `;
  }).join("");
}

function applyDashboardFilter(type) {
  activeDashboardFilter = type || "all";

  let filtered = allProjects.slice();
  let filterTitle = "งานทั้งหมด";

  switch (activeDashboardFilter) {
    case "ready":
      filterTitle = "พร้อมปิดงาน";
      filtered = allProjects.filter(isReadyProject);
      break;

    case "notReady":
      filterTitle = "ยังไม่พร้อม";
      filtered = allProjects.filter(isNotReadyProject);
      break;

    case "closed":
      filterTitle = "ปิดแล้ว";
      filtered = allProjects.filter(isClosedProject);
      break;

    case "docIssue":
      filterTitle = "ติดเอกสาร";
      filtered = allProjects.filter(hasDocumentIssue);
      break;

    case "materialIssue":
      filterTitle = "ติดพัสดุ";
      filtered = allProjects.filter(hasMaterialIssue);
      break;

    case "costIssue":
      filterTitle = "ติดค่าใช้จ่าย";
      filtered = allProjects.filter(hasCostIssue);
      break;

    case "timeIssue":
      filterTitle = "ติด Time";
      filtered = allProjects.filter(hasTimeIssue);
      break;

    case "c3Waiting":
      filterTitle = "C3 รอพัสดุ";
      filtered = allProjects.filter(isC3WaitingProject);
      break;

    case "rel":
      filterTitle = "REL";
      filtered = allProjects.filter(function (p) {
        return String(p.systemStatus || "").toUpperCase() === "REL";
      });
      break;

    case "teco":
      filterTitle = "TECO";
      filtered = allProjects.filter(function (p) {
        return String(p.systemStatus || "").toUpperCase() === "TECO";
      });
      break;

    case "clsd":
      filterTitle = "CLSD";
      filtered = allProjects.filter(function (p) {
        return String(p.systemStatus || "").toUpperCase() === "CLSD";
      });
      break;

    default:
      activeDashboardFilter = "all";
      filterTitle = "งานทั้งหมด";
      filtered = allProjects.slice();
  }

  renderProjectTable(filtered);
  renderSearchTable(filtered);
  updateDashboardFilterLabel(filterTitle, filtered.length);
  refreshKpiActiveState();
  scrollToProjectOverview();
}

function updateDashboardFilterLabel(title, count) {
  const projectCount = document.getElementById("projectCount");
  if (projectCount) {
    projectCount.textContent = title + " " + count + " งาน";
  }
}

function refreshKpiActiveState() {
  document.querySelectorAll(".kpi-card").forEach(function (card) {
    card.classList.remove("active-filter");
  });

  const activeCard = document.querySelector('.kpi-card[data-filter="' + activeDashboardFilter + '"]');
  if (activeCard) activeCard.classList.add("active-filter");
}

function scrollToProjectOverview() {
  const table = document.getElementById("projectTable");
  const card = table ? table.closest(".card") || table.closest("section") || table : null;

  if (card && typeof card.scrollIntoView === "function") {
    setTimeout(function () {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
}

if (typeof window !== "undefined") {
  window.applyDashboardFilter = applyDashboardFilter;
}

/* =========================
   Charts
========================= */

function renderCharts(data) {
  renderStatusChart(data);
  renderIssueChart(data);
}

function prepareStatusChartLayout(canvas) {
  const card = canvas.closest(".card") || canvas.parentElement;
  if (!card) return null;

  card.classList.add("status-chart-card");

  let body = card.querySelector(".chart-body");
  let canvasWrap = card.querySelector(".status-canvas-wrap");
  let legend = card.querySelector(".status-legend-custom");

  if (!body) {
    body = document.createElement("div");
    body.className = "chart-body";
    canvasWrap = document.createElement("div");
    canvasWrap.className = "status-canvas-wrap";
    legend = document.createElement("div");
    legend.className = "status-legend-custom";

    canvas.parentNode.insertBefore(body, canvas);
    canvasWrap.appendChild(canvas);
    body.appendChild(canvasWrap);
    body.appendChild(legend);
  }

  return legend;
}

function renderStatusLegend(legendEl, ready, notReady, closed) {
  if (!legendEl) return;

  const total = ready + notReady + closed;

  const rows = [
    { label: "พร้อมปิด", value: ready, color: "#22c55e" },
    { label: "ยังไม่พร้อม", value: notReady, color: "#ff3b3b" },
    { label: "ปิดแล้ว", value: closed, color: "#38bdf8" }
  ];

  legendEl.innerHTML = rows.map(function (r) {
    const percent = total ? ((r.value / total) * 100).toFixed(1) : "0.0";
    return `
      <div class="status-legend-row">
        <span class="status-dot" style="background:${r.color}; color:${r.color};"></span>
        <span class="status-legend-label">${escapeHtml(r.label)}</span>
        <span class="status-legend-value">${escapeHtml(r.value)} (${percent}%)</span>
      </div>
    `;
  }).join("");
}

function renderStatusChart(data) {
  const canvas = document.getElementById("statusChart");
  if (!canvas || typeof Chart === "undefined") return;

  const ready = Number(data.ready || 0);
  const notReady = Number(data.notReady || 0);
  const closed = Number(data.closed || 0);
  const total = ready + notReady + closed;

  const legendEl = prepareStatusChartLayout(canvas);
  renderStatusLegend(legendEl, ready, notReady, closed);

  if (statusChart) statusChart.destroy();

  const centerTextPlugin = {
    id: "centerTextPlugin",
    afterDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data || !meta.data[0]) return;

      const ctx = chart.ctx;
      const x = meta.data[0].x;
      const y = meta.data[0].y;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = "#f8fafc";
      ctx.font = "800 16px Segoe UI";
      ctx.fillText("รวมทั้งสิ้น", x, y - 42);

      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(255,255,255,.35)";
      ctx.shadowBlur = 10;
      ctx.font = "950 46px Segoe UI";
      ctx.fillText(String(total), x, y + 4);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#f8fafc";
      ctx.font = "800 16px Segoe UI";
      ctx.fillText("โครงการ", x, y + 48);

      ctx.restore();
    }
  };

  statusChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["พร้อมปิด", "ยังไม่พร้อม", "ปิดแล้ว"],
      datasets: [{
        data: [ready, notReady, closed],
        backgroundColor: ["#22c55e", "#ff3b3b", "#38bdf8"],
        hoverBackgroundColor: ["#4ade80", "#ff6464", "#7dd3fc"],
        borderColor: "#0f172a",
        borderWidth: 3,
        spacing: 1,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      radius: "92%",
      layout: {
        padding: 8
      },
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 900,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.96)",
          titleColor: "#ffffff",
          bodyColor: "#dbeafe",
          borderColor: "rgba(148, 163, 184, 0.25)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function (context) {
              const value = Number(context.raw || 0);
              const percent = total ? ((value / total) * 100).toFixed(1) : "0.0";
              return " " + context.label + ": " + value + " งาน (" + percent + "%)";
            }
          }
        }
      }
    },
    plugins: [centerTextPlugin]
  });
}

function renderIssueChart(data) {
  const canvas = document.getElementById("issueChart");
  if (!canvas || typeof Chart === "undefined") return;

  const parent = canvas.closest(".card") || canvas.parentElement;
  if (parent) parent.classList.add("issue-chart-card");

  if (issueChart) issueChart.destroy();

  const values = [
    Number(data.docIssue || 0),
    Number(data.materialIssue || 0),
    Number(data.costIssue || 0),
    Number(data.timeIssue || 0)
  ];

  const barValuePlugin = {
    id: "barValuePlugin",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const meta = chart.getDatasetMeta(0);

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 15px Segoe UI";

      meta.data.forEach(function (bar, index) {
        ctx.fillText(String(values[index]), bar.x, bar.y - 8);
      });

      ctx.restore();
    }
  };

  issueChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["เอกสาร", "พัสดุ", "ค่าใช้จ่าย", "Time"],
      datasets: [{
        label: "จำนวนงาน",
        data: values,
        backgroundColor: ["#ff3b3b", "#fb923c", "#facc15", "#38bdf8"],
        hoverBackgroundColor: ["#ff6464", "#fdba74", "#fde047", "#7dd3fc"],
        borderRadius: 8,
        borderSkipped: false,
        barPercentage: 0.5,
        categoryPercentage: 0.66
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 900,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            color: "#f8fafc",
            boxWidth: 12,
            boxHeight: 12,
            padding: 16,
            font: {
              size: 13,
              weight: "bold"
            }
          }
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.96)",
          titleColor: "#ffffff",
          bodyColor: "#dbeafe",
          borderColor: "rgba(148, 163, 184, 0.25)",
          borderWidth: 1,
          padding: 12
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#f8fafc",
            font: {
              size: 13,
              weight: "bold"
            }
          },
          grid: {
            color: "rgba(148,163,184,0.08)",
            drawBorder: false
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max.apply(null, values.concat([10])) + 10,
          ticks: {
            color: "#f8fafc",
            precision: 0
          },
          grid: {
            color: "rgba(148,163,184,0.16)",
            borderDash: [3, 4],
            drawBorder: false
          }
        }
      }
    },
    plugins: [barValuePlugin]
  });
}

/* =========================
   Tables
========================= */

function renderProjectTable(rows) {
  const tbody = document.getElementById("projectTable");
  const count = document.getElementById("projectCount");

  if (!tbody) return;
  if (count) count.textContent = rows.length + " งาน";

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">ไม่พบข้อมูลโครงการ</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(projectRowTemplate).join("");
}

function renderSearchTable(rows) {
  const tbody = document.getElementById("searchTable");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-state">ไม่พบข้อมูลที่ค้นหา</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(projectRowTemplate).join("");
}

function projectRowTemplate(p) {
  const wbs = safeValue(p.wbs);

  return `
    <tr class="clickable" onclick="openProjectDetail('${escapeAttr(wbs)}')">
      <td>${priorityBadge(p.priority)}</td>
      <td>${escapeHtml(p.wbs)}</td>
      <td class="text-wrap">${escapeHtml(p.jobName)}</td>
      <td>${escapeHtml(p.owner)}</td>
      <td>${statusBadge(p.systemStatus, p.userStatus)}</td>
      <td>${metricBadge(p.costPercent, p.costStatus, wbs)}</td>
      <td>${metricBadge(p.materialPercent, p.materialStatus, wbs)}</td>
      <td>${metricBadge(p.documentPercent, p.documentStatus, wbs)}</td>
      <td>${metricBadge(p.timePercent, p.timeStatus, wbs)}</td>
      <td>${escapeHtml(p.readyToClose || p.closureStatus || "-")}</td>
    </tr>
  `;
}

function searchProjects() {
  const input = document.getElementById("projectSearch");
  const keyword = input ? input.value.trim().toLowerCase() : "";

  if (!keyword) {
    renderSearchTable(allProjects);
    return;
  }

  const filtered = allProjects.filter(function (p) {
    return [
      p.wbs,
      p.jobName,
      p.owner,
      p.province,
      p.systemStatus,
      p.userStatus,
      p.workType,
      p.mainIssue
    ].some(function (v) {
      return String(v || "").toLowerCase().includes(keyword);
    });
  });

  renderSearchTable(filtered);
}

function renderWorkQueue(rows) {
  const tbody = document.getElementById("workQueueTable");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">ไม่พบข้อมูล Work Queue</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(function (r) {
    return `
      <tr class="clickable" onclick="openProjectDetail('${escapeAttr(r.wbs)}')">
        <td>${priorityBadge(r.priority)}</td>
        <td>${escapeHtml(r.wbs)}</td>
        <td class="text-wrap">${escapeHtml(r.jobName)}</td>
        <td>${escapeHtml(r.owner)}</td>
        <td>${escapeHtml(r.mainIssue)}</td>
        <td class="text-wrap">${escapeHtml(r.action)}</td>
        <td>${escapeHtml(r.province)}</td>
      </tr>
    `;
  }).join("");
}

function renderAlertCenter(rows) {
  const tbody = document.getElementById("alertTable");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">ไม่พบข้อมูล Alert Center</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(function (r) {
    return `
      <tr class="clickable" onclick="openProjectDetail('${escapeAttr(r.wbs)}')">
        <td>${escapeHtml(r.alertType)}</td>
        <td>${priorityBadge(r.priority)}</td>
        <td>${escapeHtml(r.wbs)}</td>
        <td class="text-wrap">${escapeHtml(r.jobName)}</td>
        <td>${escapeHtml(r.owner)}</td>
        <td>${escapeHtml(r.issue)}</td>
        <td class="text-wrap">${escapeHtml(r.action)}</td>
      </tr>
    `;
  }).join("");
}

/* =========================
   Modal
========================= */

async function openProjectDetail(wbs) {
  const modal = document.getElementById("projectModal");
  const title = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");

  if (!modal || !title || !body) return;

  const cacheKey = normalizeKey(wbs);
  const localProject = getProjectFromLocal(wbs) || { wbs: wbs };

  selectedProject = localProject;

  // TURBO V6.1 FULL DETAIL:
  // 1) เปิด Modal ทันทีจาก ACTIVE_PROJECT
  // 2) แสดง placeholder ครบทุกส่วน
  // 3) โหลด Cost / Material / Document / Time แยก API แล้วแทนที่ทีละส่วน
  modal.classList.remove("hidden");
  title.textContent = "รายละเอียดงาน: " + (localProject.wbs || wbs);
  body.innerHTML = renderProjectDetailShell(localProject);

  if (detailCache.has(cacheKey)) {
    const cachedDetail = detailCache.get(cacheKey);
    const cachedProject = cachedDetail.project || localProject;
    selectedProject = cachedProject;
    body.innerHTML = renderProjectDetail(cachedProject, cachedDetail);
    return;
  }

  const detail = {
    success: true,
    project: localProject,
    cost: null,
    material: null,
    document: null,
    time: null,
    timeline: null,
    errors: [],
    cacheMode: "frontend-lazy-v6-1-full-detail",
    updatedAt: new Date()
  };

  loadDetailPart("cost", wbs, detail, function (data) {
    detail.cost = data;
    replaceDetailPart("cost", renderCostDetail(data));
  });

  loadDetailPart("material", wbs, detail, function (data) {
    detail.material = data;
    replaceDetailPart("material", renderMaterialDetail(data));
  });

  loadDetailPart("document", wbs, detail, function (data) {
    detail.document = data;
    replaceDetailPart("document", renderDocumentDetail(data));
  });

  loadDetailPart("time", wbs, detail, function (data) {
    detail.time = data;
    replaceDetailPart("time", renderTimeDetail(data));
  });

  loadDetailPart("timeline", wbs, detail, function (data) {
    detail.timeline = data;
    applyTimelineDetailToProject(localProject, data);
    replaceDetailPart("timeline", renderTimelineDetail(data, localProject));
  });

  // เก็บ cache หลังจากให้ API แต่ละส่วนมีเวลาตอบกลับเล็กน้อย
  // ถ้ากดย้ำเร็ว ๆ จะยังเห็น shell ทันที และส่วนที่โหลดแล้วจะขึ้นเร็ว
  setTimeout(function () {
    detailCache.set(cacheKey, detail);
  }, 1200);
}

function loadDetailPart(part, wbs, detail, onSuccess) {
  const actionMap = {
    cost: "costdetail",
    material: "materialdetail",
    document: "documentdetail",
    time: "timedetail",
    timeline: "timelinedetail"
  };

  const action = actionMap[part];
  if (!action) return;

  setDetailPartLoading(part);

  apiAction(action, { wbs: wbs })
    .then(function (raw) {
      const data = unwrapObject(raw);
      onSuccess(data);
    })
    .catch(function (err) {
      console.error("โหลดรายละเอียดส่วน " + part + " ไม่สำเร็จ", err);
      detail.errors.push(part + ": " + err.message);
      replaceDetailPart(part, renderDetailPartError(part, err.message, wbs));
    });
}

function replaceDetailPart(part, html) {
  const el = document.getElementById("detail-part-" + part);
  if (!el) return;
  el.outerHTML = html;
}

function renderDetailPartError(part, message, wbs) {
  const titleMap = {
    cost: "Cost Detail",
    material: "Material Pending",
    document: "Document Checklist",
    time: "Time Detail",
    timeline: "Project Timeline / Workflow"
  };

  return `
    <div class="detail-section card" id="detail-part-${escapeAttr(part)}">
      <h3>${escapeHtml(titleMap[part] || part)}</h3>
      <div class="empty-state">
        โหลดข้อมูลส่วนนี้ไม่สำเร็จ<br>
        ${escapeHtml(message)}<br><br>
        <button type="button" onclick="openProjectDetail('${escapeAttr(wbs)}')">ลองโหลดใหม่</button>
      </div>
    </div>
  `;
}

function renderModalLoading(wbs, project) {
  return `
    <div class="modal-loading">
      <div>
        <div class="loader-ring"></div>
        <div class="loading-title">กำลังโหลดรายละเอียดงาน</div>
        <div class="loading-sub">กำลังดึงข้อมูล Cost / Material / Document / Time</div>

        <div class="loading-mini-card">
          <strong>${escapeHtml(wbs)}</strong><br>
          ${escapeHtml(project ? project.jobName : "กรุณารอสักครู่...")}
        </div>
      </div>
    </div>
  `;
}

function getProjectFromLocal(wbs) {
  const key = normalizeKey(wbs);
  return allProjects.find(function (p) {
    return normalizeKey(p.wbs) === key;
  }) || null;
}

function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

function renderProjectDetailShell(project) {
  return `
    <div class="detail-grid">
      ${detailItem("WBS", project.wbs)}
      ${detailItem("ชื่องาน", project.jobName)}
      ${detailItem("ผู้รับผิดชอบ", project.owner)}
      ${detailItem("จังหวัด", project.province)}
      ${detailItem("สถานะระบบ", project.systemStatus)}
      ${detailItem("สถานะผู้ใช้", project.userStatus)}
      ${detailItem("Priority", project.priority)}
      ${detailItem("Ready", project.readyToClose || project.closureStatus)}
      ${detailItem("Cost", formatPercent(project.costPercent) + " / " + safeValue(project.costStatus))}
      ${detailItem("Material", formatPercent(project.materialPercent) + " / " + safeValue(project.materialStatus))}
      ${detailItem("Document", formatPercent(project.documentPercent) + " / " + safeValue(project.documentStatus))}
      ${detailItem("Time", formatPercent(project.timePercent) + " / " + safeValue(project.timeStatus))}
    </div>

    <div class="detail-section card">
      <h3>Main Issue</h3>
      <p>${escapeHtml(project.mainIssue || "-")}</p>
    </div>

    <div class="detail-section card">
      <h3>Recommended Action</h3>
      <p>${escapeHtml(project.action || "-")}</p>
    </div>

    ${renderProjectTimelineSummary(project)}
    ${renderMaterialWaitingSummary(project)}

    ${renderLazyDetailPlaceholder("timeline", "Project Timeline / Workflow")}
    ${renderLazyDetailPlaceholder("cost", "Cost Detail")}
    ${renderLazyDetailPlaceholder("material", "Material Pending")}
    ${renderLazyDetailPlaceholder("document", "Document Checklist")}
    ${renderLazyDetailPlaceholder("time", "Time Detail")}
  `;
}


function renderProjectTimelineSummary(project) {
  const timeline = project.timeline || getTimelineForWbs(project.wbs);
  if (!timeline && !project.a0Source && project.sapChangeCount === undefined && project.cpmChangeCount === undefined) {
    return "";
  }

  return `
    <div class="detail-section card">
      <h3>Project Timeline / Workflow</h3>
      <div class="timeline-summary-grid">
        ${timelineDetailChip("A0 ผ่านจาก", normalizeWorkflowSource(project.a0Source, timeline && timeline.source))}
        ${timelineDetailChip("SAP Change", safeValue((timeline && timeline.sapChangeCount) ?? project.sapChangeCount ?? 0) + " ครั้ง")}
        ${timelineDetailChip("CPM Change", safeValue((timeline && timeline.cpmChangeCount) ?? project.cpmChangeCount ?? 0) + " ครั้ง")}
        ${timelineDetailChip("Stage ปัจจุบัน", project.userStatus || (timeline && timeline.userStatus) || "-")}
      </div>
    </div>
  `;
}

function renderMaterialWaitingSummary(project) {
  const mw = project.materialWaiting || getMaterialWaitingForWbs(project.wbs);
  if (!mw) return "";

  const tagText = mw.mainMaterials || mw.pendingMaterials || "";
  const tags = tagText
    ? tagText.split(",").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 18)
    : [];

  return `
    <div class="detail-section card">
      <h3>Material Waiting C3</h3>
      <div class="timeline-summary-grid">
        ${timelineDetailChip("รอพัสดุแล้ว", safeValue(mw.waitingDays) + " วัน")}
        ${timelineDetailChip("รายการทั้งหมด", safeValue(mw.totalItems || "-") + " รายการ")}
        ${timelineDetailChip("รายการค้างจริง", safeValue(mw.pendingCount) + " รายการ")}
        ${timelineDetailChip("มูลค่าค้าง", formatMoney(mw.pendingValue || 0) + " บาท")}
        ${timelineDetailChip("Priority", mw.priority || "-")}
      </div>
      <div class="material-tags">
        ${tags.length ? tags.map(function (t) {
          return `<span class="material-tag">${escapeHtml(t)}</span>`;
        }).join("") : `<span class="material-tag">ไม่มีรายการพัสดุหลัก</span>`}
      </div>
    </div>
  `;
}

function timelineDetailChip(label, value) {
  return `
    <div class="timeline-chip">
      <div class="timeline-chip-label">${escapeHtml(label)}</div>
      <div class="timeline-chip-value">${escapeHtml(value)}</div>
    </div>
  `;
}



function applyTimelineDetailToProject(project, data) {
  if (!project || !data) return;

  const tl = data.timeline || null;
  const mw = data.materialWaiting || null;

  if (tl) {
    project.timeline = tl;
    project.a0Source = normalizeWorkflowSource(tl.a0Source, tl.source || project.a0Source || "");
    project.sapChangeCount = tl.sapChangeCount;
    project.cpmChangeCount = tl.cpmChangeCount;
  }

  if (mw) {
    project.materialWaiting = mw;
    project.isC3Waiting = true;
    project.c3WaitingDays = mw.waitingDays;
    project.c3TotalItems = mw.totalItems;
    project.c3PendingCount = mw.pendingCount;
    project.c3PendingValue = mw.pendingValue;
    project.c3MainMaterials = mw.mainItems || mw.mainMaterialSummary || mw.mainMaterials || mw.allItems || "";
  }
}

function renderTimelineDetail(data, project) {
  data = data || {};
  project = project || selectedProject || {};

  const tl = data.timeline || project.timeline || getTimelineForWbs(project.wbs) || {};
  const mw = data.materialWaiting || project.materialWaiting || getMaterialWaitingForWbs(project.wbs) || null;

  const a0Source = normalizeWorkflowSource(tl.a0Source, tl.source || project.a0Source || "");
  const sapCount = (tl.sapChangeCount !== undefined && tl.sapChangeCount !== "") ? tl.sapChangeCount : (project.sapChangeCount ?? 0);
  const cpmCount = (tl.cpmChangeCount !== undefined && tl.cpmChangeCount !== "") ? tl.cpmChangeCount : (project.cpmChangeCount ?? 0);
  const stageCurrent = tl.currentStage || tl.userStatus || project.userStatus || "-";
  const stageAge = (tl.stageAgeDays !== undefined && tl.stageAgeDays !== "") ? tl.stageAgeDays : "-";
  const projectAge = (tl.projectAgeDays !== undefined && tl.projectAgeDays !== "") ? tl.projectAgeDays : "-";
  const waitingDays = mw ? (mw.waitingDays || tl.materialWaitingDays || project.c3WaitingDays || 0) : (tl.materialWaitingDays || project.c3WaitingDays || 0);
  const totalItems = mw ? (mw.totalItems || project.c3TotalItems || "-") : (project.c3TotalItems || "-");
  const pendingCount = mw ? (mw.pendingCount || project.c3PendingCount || 0) : (project.c3PendingCount || 0);
  const pendingValue = mw ? (mw.pendingValue || project.c3PendingValue || 0) : (project.c3PendingValue || 0);
  const delayReason = tl.delayReason || (mw ? (mw.remark || "หยุดงานรอพัสดุ") : "-");
  const lastUser = tl.lastUser || "-";
  const startDate = tl.projectStartDate || "-";
  const updateText = getDataUpdateText();

  const materialText = (mw && (mw.mainItems || mw.mainMaterialSummary || mw.mainMaterials || mw.allItems || mw.materialItems)) || project.c3MainMaterials || "";
  const materialTags = String(materialText || "")
    .split(",")
    .map(function (x) { return x.trim(); })
    .filter(Boolean)
    .slice(0, 20);

  return `
    <div class="detail-section card" id="detail-part-timeline">
      <h3>Project Timeline / Workflow</h3>
      <p class="muted">ข้อมูลล่าสุดจากหลังบ้าน: ${escapeHtml(updateText)}</p>

      <div class="timeline-summary-grid">
        ${timelineDetailChip("รอพัสดุแล้ว", safeValue(waitingDays) + " วัน")}
        ${timelineDetailChip("Stage ปัจจุบัน", stageCurrent)}
        ${timelineDetailChip("Stage ค้าง", safeValue(stageAge) + " วัน")}
        ${timelineDetailChip("อายุโครงการ", safeValue(projectAge) + " วัน")}
        ${timelineDetailChip("A0 Source", a0Source)}
        ${timelineDetailChip("SAP Change", safeValue(sapCount) + " ครั้ง")}
        ${timelineDetailChip("CPM Change", safeValue(cpmCount) + " ครั้ง")}
        ${timelineDetailChip("ผู้เปลี่ยนล่าสุด", lastUser)}
        ${timelineDetailChip("วันเริ่มต้น", startDate)}
        ${timelineDetailChip("รายการทั้งหมด", safeValue(totalItems) + " รายการ")}
        ${timelineDetailChip("รายการค้างจริง", safeValue(pendingCount) + " รายการ")}
        ${timelineDetailChip("มูลค่าพัสดุค้าง", formatMoney(pendingValue || 0) + " บาท")}
        ${timelineDetailChip("Delay Reason", delayReason)}
      </div>

      <div class="material-tags">
        ${materialTags.length ? materialTags.map(function (t) {
          return `<span class="material-tag">${escapeHtml(t)}</span>`;
        }).join("") : `<span class="material-tag">ไม่มีข้อมูลพัสดุหลักที่ค้าง</span>`}
      </div>
    </div>
  `;
}

function renderLazyDetailPlaceholder(part, title) {
  return `
    <div class="detail-section card" id="detail-part-${escapeAttr(part)}">
      <h3>${escapeHtml(title)}</h3>
      <div class="modal-loading mini">
        <div>
          <div class="loader-ring small"></div>
          <div class="loading-title">กำลังโหลด ${escapeHtml(title)}</div>
          <div class="loading-sub">ระบบกำลังดึงข้อมูลเฉพาะส่วนนี้...</div>
        </div>
      </div>
    </div>
  `;
}

function setDetailPartLoading(part) {
  const el = document.getElementById("detail-part-" + part);
  if (!el) return;
}

function renderProjectDetail(project, detail) {
  return `
    <div class="detail-grid">
      ${detailItem("WBS", project.wbs)}
      ${detailItem("ชื่องาน", project.jobName)}
      ${detailItem("ผู้รับผิดชอบ", project.owner)}
      ${detailItem("จังหวัด", project.province)}
      ${detailItem("สถานะระบบ", project.systemStatus)}
      ${detailItem("สถานะผู้ใช้", project.userStatus)}
      ${detailItem("Priority", project.priority)}
      ${detailItem("Ready", project.readyToClose || project.closureStatus)}
      ${detailItem("Cost", formatPercent(project.costPercent) + " / " + safeValue(project.costStatus))}
      ${detailItem("Material", formatPercent(project.materialPercent) + " / " + safeValue(project.materialStatus))}
      ${detailItem("Document", formatPercent(project.documentPercent) + " / " + safeValue(project.documentStatus))}
      ${detailItem("Time", formatPercent(project.timePercent) + " / " + safeValue(project.timeStatus))}
    </div>

    <div class="detail-section card">
      <h3>Main Issue</h3>
      <p>${escapeHtml(project.mainIssue || "-")}</p>
    </div>

    <div class="detail-section card">
      <h3>Recommended Action</h3>
      <p>${escapeHtml(project.action || "-")}</p>
    </div>

    ${renderDetailSections(detail)}
  `;
}

function renderDetailSections(detail) {
  let html = "";

  if (detail.cost && detail.cost.items) html += renderCostDetail(detail.cost);
  if (detail.material && detail.material.pendingItems) html += renderMaterialDetail(detail.material);
  if (detail.document && detail.document.items) html += renderDocumentDetail(detail.document);
  if (detail.time) html += renderTimeDetail(detail.time);
  if (detail.timeline) html += renderTimelineDetail(detail.timeline, detail.project);

  return html;
}

function renderCostDetail(cost) {
  const rows = (cost.items || []).map(function (x) {
    return `
      <tr>
        <td>${escapeHtml(x.type)}</td>
        <td>${formatMoney(x.plan)}</td>
        <td>${formatMoney(x.actual)}</td>
        <td>${escapeHtml(x.percent)}</td>
        <td>${escapeHtml(x.status)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="detail-section card" id="detail-part-cost">
      <h3>Cost Detail</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ประเภทค่าใช้จ่าย</th>
              <th>แผน</th>
              <th>เบิกจริง</th>
              <th>%</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMaterialDetail(material) {
  const wbs = material.wbs || (selectedProject && selectedProject.wbs) || "";
  const mw = getMaterialWaitingForWbs(wbs) || (selectedProject && selectedProject.materialWaiting) || null;
  const waitingDays = mw ? (mw.waitingDays || 0) : getMaterialWaitingDaysForWbs(wbs);

  const allItems = material.allItems || material.items || [];
  const pendingList = (material.pendingItems || allItems.filter(function (x) {
    return Number(x.pendingQty || x.remain || 0) > 0;
  }));

  const pendingQtyTotal = pendingList.reduce(function (sum, x) {
    return sum + Number(x.pendingQty || x.remain || 0);
  }, 0);

  window.currentMaterialDetail = material;
  window.currentMaterialWaitingDays = waitingDays;

  const rows = allItems.map(function (x) {
    const pendingQty = Number(x.pendingQty || x.remain || 0);
    const statusText = pendingQty > 0 ? "ค้าง" : "ครบ";
    const statusClass = pendingQty > 0 ? "material-status pending" : "material-status complete";
    const materialCode = safeValue(x.materialCode);
    const materialName = getMaterialDisplayName(x);
    const network = safeValue(x.network);

    return `
      <tr class="${pendingQty > 0 ? "row-pending" : "row-complete"}">
        <td>
          <button
            type="button"
            class="material-code-link"
            title="คลิกเพื่อดูรายละเอียด/ประวัติพัสดุ"
            onclick="openMaterialItemDetailPopup('${escapeAttr(wbs)}','${escapeAttr(materialCode)}','${escapeAttr(network)}')"
          >${escapeHtml(materialCode)}</button>
        </td>
        <td class="text-wrap">${escapeHtml(materialName)}</td>
        <td>${escapeHtml(x.requiredQty)}</td>
        <td>${escapeHtml(x.issuedQty)}</td>
        <td>${escapeHtml(pendingQty)}</td>
        <td>${pendingQty > 0 && waitingDays ? escapeHtml(waitingDays + " วัน") : "-"}</td>
        <td>${formatMoney(x.pendingValue)}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join("");

  return `
    <div class="detail-section card" id="detail-part-material">
      <div class="section-title-row">
        <div>
          <h3>Material Detail</h3>
          <p class="muted">
            รายการพัสดุทั้งหมด ${material.totalItems || allItems.length || 0} รายการ /
            เบิกครบ ${(material.completeCount !== undefined ? material.completeCount : (allItems.length - pendingList.length)) || 0} รายการ /
            ค้างจริง ${material.pendingCount || pendingList.length || 0} รายการ /
            จำนวนค้างรวม ${pendingQtyTotal} ชิ้น /
            ค้างมาแล้ว ${waitingDays ? escapeHtml(waitingDays + " วัน") : "-"} /
            มูลค่าค้าง ${formatMoney(material.pendingValue || 0)} บาท
          </p>
        </div>
        <button type="button" class="secondary-action" onclick="openPendingMaterialPopup()">
          ดูพัสดุค้างจริง ${material.pendingCount || pendingList.length || 0} รายการ
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>รหัสพัสดุ</th>
              <th>ชื่อพัสดุ</th>
              <th>ต้องการ</th>
              <th>เบิกแล้ว</th>
              <th>ค้าง</th>
              <th>ค้างมาแล้ว</th>
              <th>มูลค่าค้าง</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="8" class="empty-state">ไม่พบข้อมูลพัสดุ</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getMaterialDisplayName(item) {
  const code = safeValue(item.materialCode);
  const name = safeValue(item.materialName || item.materialDescription || item.description || item.materialText);

  // Core Rule: ชื่อพัสดุต้องไม่แสดงซ้ำเป็นรหัสพัสดุ
  if (!name || name === "-" || normalizeKey(name) === normalizeKey(code)) {
    return "(ไม่พบชื่อพัสดุจากข้อความวัสดุ SAP)";
  }
  return name;
}

function openPendingMaterialPopup() {
  const material = window.currentMaterialDetail || {};
  const waitingDays = window.currentMaterialWaitingDays || 0;
  const wbs = material.wbs || (selectedProject && selectedProject.wbs) || "";
  const allItems = material.allItems || material.items || [];
  const pendingList = (material.pendingItems || allItems.filter(function (x) {
    return Number(x.pendingQty || x.remain || 0) > 0;
  }));

  const rows = pendingList.map(function (x) {
    const pendingQty = Number(x.pendingQty || x.remain || 0);
    const materialCode = safeValue(x.materialCode);
    const materialName = getMaterialDisplayName(x);
    const network = safeValue(x.network);
    return `
      <tr>
        <td>
          <button
            type="button"
            class="material-code-link"
            title="คลิกเพื่อดูรายละเอียด/ประวัติพัสดุ"
            onclick="openMaterialItemDetailPopup('${escapeAttr(wbs)}','${escapeAttr(materialCode)}','${escapeAttr(network)}')"
          >${escapeHtml(materialCode)}</button>
        </td>
        <td class="text-wrap">${escapeHtml(materialName)}</td>
        <td>${escapeHtml(x.requiredQty)}</td>
        <td>${escapeHtml(x.issuedQty)}</td>
        <td>${escapeHtml(pendingQty)}</td>
        <td>${waitingDays ? escapeHtml(waitingDays + " วัน") : "-"}</td>
        <td>${formatMoney(x.pendingValue)}</td>
      </tr>
    `;
  }).join("");

  const popup = document.createElement("div");
  popup.id = "pendingMaterialPopup";
  popup.className = "mini-modal";
  popup.innerHTML = `
    <div class="mini-modal-box">
      <div class="mini-modal-head">
        <div>
          <h3>พัสดุค้างจริง</h3>
          <p class="muted">ค้าง ${pendingList.length} จาก ${material.totalItems || allItems.length || 0} รายการ / ค้างมาแล้ว ${waitingDays ? escapeHtml(waitingDays + " วัน") : "-"}</p>
        </div>
        <button type="button" onclick="closePendingMaterialPopup()">ปิด</button>
      </div>
      <div class="mini-modal-body">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>รหัสพัสดุ</th>
                <th>ชื่อพัสดุ</th>
                <th>ต้องการ</th>
                <th>เบิกแล้ว</th>
                <th>ค้าง</th>
                <th>ค้างมาแล้ว</th>
                <th>มูลค่าค้าง</th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="7" class="empty-state">ไม่มีพัสดุค้างจริง</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const old = document.getElementById("pendingMaterialPopup");
  if (old) old.remove();
  document.body.appendChild(popup);
}

function closePendingMaterialPopup() {
  const popup = document.getElementById("pendingMaterialPopup");
  if (popup) popup.remove();
}

async function openMaterialItemDetailPopup(wbs, materialCode, network) {
  const old = document.getElementById("materialItemDetailPopup");
  if (old) old.remove();

  const popup = document.createElement("div");
  popup.id = "materialItemDetailPopup";
  popup.className = "mini-modal";
  popup.innerHTML = `
    <div class="mini-modal-box material-item-box">
      <div class="mini-modal-head">
        <div>
          <h3>รายละเอียดพัสดุ</h3>
          <p class="muted">${escapeHtml(materialCode)} / ${escapeHtml(wbs)}</p>
        </div>
        <button type="button" onclick="closeMaterialItemDetailPopup()">ปิด</button>
      </div>
      <div class="mini-modal-body">
        <div class="empty-state">กำลังโหลดประวัติพัสดุ...</div>
      </div>
    </div>
  `;
  document.body.appendChild(popup);

  try {
    const data = await apiAction("materialhistory", {
      wbs: wbs,
      materialCode: materialCode,
      network: network || ""
    });
    renderMaterialItemHistoryPopup(data, wbs, materialCode, network);
  } catch (err) {
    const body = popup.querySelector(".mini-modal-body");
    if (body) {
      body.innerHTML = `<div class="empty-state error-text">โหลดประวัติพัสดุไม่สำเร็จ<br>${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderMaterialItemHistoryPopup(data, wbs, materialCode, network) {
  const popup = document.getElementById("materialItemDetailPopup");
  if (!popup) return;

  const item = data && data.item ? data.item : null;
  const history = data && Array.isArray(data.history) ? data.history : [];
  const materialName = item ? getMaterialDisplayName(item) : "-";

  const historyRows = history.map(function (h) {
    return `
      <tr>
        <td>${escapeHtml(h.timestampDisplay || "-")}</td>
        <td>${escapeHtml(h.batchId || "-")}</td>
        <td>${escapeHtml(h.changeType || "-")}</td>
        <td>${escapeHtml(safeValue(h.oldRequired))} → ${escapeHtml(safeValue(h.newRequired))}</td>
        <td>${escapeHtml(safeValue(h.oldIssued))} → ${escapeHtml(safeValue(h.newIssued))}</td>
        <td>${escapeHtml(safeValue(h.oldPending))} → ${escapeHtml(safeValue(h.newPending))}</td>
        <td>${escapeHtml(h.sapStatus || "-")}</td>
        <td class="text-wrap">${escapeHtml(h.remark || "-")}</td>
      </tr>
    `;
  }).join("");

  const body = popup.querySelector(".mini-modal-body");
  if (!body) return;

  body.innerHTML = `
    <div class="material-item-summary">
      <div class="detail-grid">
        ${detailItem("รหัสพัสดุ", item ? item.materialCode : materialCode)}
        ${detailItem("ชื่อพัสดุ", materialName)}
        ${detailItem("Network", item ? item.network : network)}
        ${detailItem("กลุ่มพัสดุ", item ? item.materialGroup : "-")}
        ${detailItem("ต้องการ", item ? item.requiredQty : "-")}
        ${detailItem("เบิกแล้ว", item ? item.issuedQty : "-")}
        ${detailItem("ค้าง", item ? item.pendingQty : "-")}
        ${detailItem("มูลค่าค้าง", item ? formatMoney(item.pendingValue || 0) + " บาท" : "-")}
        ${detailItem("พบครั้งแรก", item ? item.firstImport : "-")}
        ${detailItem("อัปเดตล่าสุด", item ? item.lastUpdate : "-")}
        ${detailItem("Batch ล่าสุด", item ? item.lastBatch : "-")}
        ${detailItem("สถานะ SAP", item ? item.sapStatus : "-")}
      </div>
    </div>

    <div class="detail-section card material-history-card">
      <h3>ประวัติการเปลี่ยนแปลงพัสดุ</h3>
      <p class="muted">แสดงจาก MATERIAL_CHANGE_LOG จำนวน ${history.length} รายการ</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>Batch</th>
              <th>ประเภท</th>
              <th>ต้องการ</th>
              <th>เบิกแล้ว</th>
              <th>ค้าง</th>
              <th>SAP</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>${historyRows || `<tr><td colspan="8" class="empty-state">ยังไม่มีประวัติการเปลี่ยนแปลง</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function closeMaterialItemDetailPopup() {
  const popup = document.getElementById("materialItemDetailPopup");
  if (popup) popup.remove();
}

function renderDocumentDetail(documentDetail) {
  const items = documentDetail.items || [];
  const wbs = documentDetail.wbs || "";

  const rows = items.map(function (x, index) {
    const currentStatus = String(x.status || "ยังไม่ตรวจ");

    return `
      <tr>
        <td>${escapeHtml(x.docCode)}</td>
        <td>${escapeHtml(x.category)}</td>
        <td class="text-wrap">${escapeHtml(x.documentName || x.docName)}</td>
        <td>
          <select
            class="doc-status-select checklist-control"
            data-row="${escapeAttr(x.row)}"
            data-doc-code="${escapeAttr(x.docCode)}"
            data-index="${index}"
            disabled
          >
            <option value="ยังไม่ตรวจ" ${currentStatus === "ยังไม่ตรวจ" ? "selected" : ""}>ยังไม่ตรวจ</option>
            <option value="ครบ" ${currentStatus === "ครบ" ? "selected" : ""}>ครบ</option>
            <option value="ขาด" ${currentStatus === "ขาด" ? "selected" : ""}>ขาด</option>
            <option value="ไม่เกี่ยวข้อง" ${currentStatus === "ไม่เกี่ยวข้อง" ? "selected" : ""}>ไม่เกี่ยวข้อง</option>
          </select>
        </td>
        <td>${escapeHtml(x.importance)}</td>
        <td>${escapeHtml(x.required)}</td>
        <td>
          <input
            class="doc-remark-input checklist-control"
            type="text"
            data-row="${escapeAttr(x.row)}"
            placeholder="หมายเหตุ"
            value="${escapeAttr(x.remark || "")}"
            disabled
          />
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="detail-section card" id="detail-part-document">
      <h3>Document Checklist</h3>

      <p class="muted">
        เอกสารทั้งหมด ${documentDetail.total || items.length || 0} รายการ /
        เกี่ยวข้อง ${documentDetail.applicableTotal || items.length || 0} รายการ /
        ไม่เกี่ยวข้อง ${documentDetail.notApplicable || 0} รายการ /
        ผ่าน ${documentDetail.passCount || 0} รายการ /
        ยังไม่ครบ ${documentDetail.missing || 0} รายการ /
        ${documentDetail.documentPercent !== undefined ? "คิดเป็น " + formatPercent(documentDetail.documentPercent) : ""}
      </p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>DocCode</th>
              <th>หมวด</th>
              <th>รายการเอกสาร</th>
              <th>สถานะ</th>
              <th>ความสำคัญ</th>
              <th>จำเป็น</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="7" class="empty-state">ไม่พบข้อมูลเอกสาร</td></tr>`}
          </tbody>
        </table>
      </div>

      <br>

      <div class="checklist-actions">
        <button type="button" onclick="setAllChecklistStatus('ครบ')">
          ✅ ติ๊กครบทั้งหมด
        </button>

        <button type="button" onclick="setAllChecklistStatus('ยังไม่ตรวจ')">
          ↩️ กลับเป็นยังไม่ตรวจ
        </button>

        <button type="button" onclick="toggleChecklistEdit()">
          🔍 เปิดตรวจเช็ค / แก้ไข
        </button>

        <button type="button" onclick="saveDocumentChecklistFromModal('${escapeAttr(wbs)}')">
          💾 บันทึก Checklist
        </button>

        <button type="button" onclick="exportExcel()">
          📊 Export Excel
        </button>

        <button type="button" onclick="exportProjectPdf('${escapeAttr(wbs)}')">
          📄 Export PDF Checklist
        </button>
      </div>
    </div>
  `;
}

async function saveDocumentChecklistFromModal(wbs) {
  try {
    setChecklistControlsEnabled(true);

    const selects = document.querySelectorAll(".doc-status-select");
    const remarks = document.querySelectorAll(".doc-remark-input");

    const remarkMap = {};
    remarks.forEach(function (input) {
      remarkMap[String(input.dataset.row)] = input.value || "";
    });

    const items = Array.from(selects).map(function (select) {
      const row = Number(select.dataset.row || 0);

      return {
        row: row,
        status: select.value,
        remark: remarkMap[String(row)] || "",
        auditor: "GitHub Web",
        missingQty: select.value === "ขาด" ? 1 : 0
      };
    }).filter(function (item) {
      return item.row && item.row >= 2;
    });

    if (!items.length) {
      alert("ไม่พบรายการเอกสารสำหรับบันทึก");
      return;
    }

    const ok = confirm("ยืนยันบันทึก Checklist จำนวน " + items.length + " รายการ?");
    if (!ok) return;

    const result = await apiAction("savechecklist", { items: JSON.stringify(items) });

    if (result && result.success === false) {
      alert("บันทึกไม่สำเร็จ: " + (result.message || ""));
      return;
    }

    detailCache.delete(normalizeKey(wbs));

    alert("บันทึก Checklist สำเร็จ");

    closeModal();
    await loadAllData();

  } catch (err) {
    console.error(err);
    alert("บันทึก Checklist ไม่สำเร็จ: " + err.message);
  }
}

function toggleChecklistEdit() {
  const controls = document.querySelectorAll(".checklist-control");

  if (!controls.length) {
    alert("ไม่พบรายการ Checklist");
    return;
  }

  const willEnable = Array.from(controls).some(function (control) {
    return control.disabled;
  });

  setChecklistControlsEnabled(willEnable);

  if (willEnable) {
    alert("เปิดโหมดตรวจเช็คแล้ว สามารถแก้ไขสถานะและหมายเหตุได้");
  }
}

function setChecklistControlsEnabled(enabled) {
  document.querySelectorAll(".checklist-control").forEach(function (control) {
    control.disabled = !enabled;
  });
}

function setAllChecklistStatus(status) {
  const selects = document.querySelectorAll(".doc-status-select");

  if (!selects.length) {
    alert("ไม่พบรายการ Checklist");
    return;
  }

  setChecklistControlsEnabled(true);

  selects.forEach(function (select) {
    select.value = status;
  });
}

function renderTimeDetail(time) {
  return `
    <div class="detail-section card" id="detail-part-time">
      <h3>Time Detail</h3>
      <div class="detail-grid">
        ${detailItem("Plan Time", time.planTime)}
        ${detailItem("Actual Time", time.actualTime)}
        ${detailItem("Time %", time.timePercent)}
        ${detailItem("Time Status", time.timeStatus)}
      </div>
    </div>
  `;
}

function closeModal() {
  const modal = document.getElementById("projectModal");
  if (modal) modal.classList.add("hidden");
}

/* =========================
   Export
========================= */

async function exportExcel() {
  try {
    const result = await apiAction("exportexcel");

    if (result && result.url) {
      window.open(result.url, "_blank");
    } else {
      alert("ไม่พบลิงก์ Export Excel");
    }
  } catch (err) {
    alert("Export Excel ไม่สำเร็จ: " + err.message);
  }
}

async function exportProjectPdf(wbs) {
  try {
    const result = await apiAction("exportpdf", { wbs: wbs });

    if (result && result.url) {
      window.open(result.url, "_blank");
    } else {
      alert("ไม่พบลิงก์ Export PDF");
    }
  } catch (err) {
    alert("Export PDF ไม่สำเร็จ: " + err.message);
  }
}

/* =========================
   AI Assistant
========================= */

function askAssistant() {
  const input = document.getElementById("assistantInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  addChatMessage("user", text);
  input.value = "";

  const answer = localAssistant(text);

  setTimeout(function () {
    addChatMessage("bot", answer);
  }, 250);
}

function addChatMessage(type, text) {
  const box = document.getElementById("chatBox");
  if (!box) return;

  const div = document.createElement("div");
  div.className = type === "user" ? "user-msg" : "bot-msg";
  div.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function localAssistant(text) {
  const q = text.toLowerCase();

  const byWbs = allProjects.find(function (p) {
    return String(p.wbs || "").toLowerCase().includes(q) ||
      q.includes(String(p.wbs || "").toLowerCase());
  });

  if (byWbs) return projectSummaryText(byWbs);

  const byOwner = allProjects.filter(function (p) {
    return String(p.owner || "").toLowerCase().includes(q);
  });

  if (byOwner.length) return ownerSummaryText(byOwner);

  if (q.includes("c3") || q.includes("รอพัสดุ") || q.includes("หยุดงานรอพัสดุ")) {
    const list = allProjects.filter(isC3WaitingProject);

    return "งาน C3 รอพัสดุ " + list.length + " งาน\n" +
      list.slice(0, 10).map(function (p, i) {
        const mw = getMaterialWaitingForWbs(p.wbs);
        return (i + 1) + ") " + p.wbs +
          " / รอ " + safeValue((mw && mw.waitingDays) || p.c3WaitingDays) + " วัน" +
          " / " + safeValue((mw && mw.mainMaterials) || p.c3MainMaterials || "");
      }).join("\n");
  }

  if (q.includes("ติดพัสดุ")) {
    const list = allProjects.filter(hasMaterialIssue);

    return "งานติดพัสดุ " + list.length + " งาน\n" +
      list.slice(0, 10).map(function (p, i) {
        return (i + 1) + ") " + p.wbs + " " + formatPercent(p.materialPercent);
      }).join("\n");
  }

  if (q.includes("ติดเอกสาร")) {
    const list = allProjects.filter(hasDocumentIssue);

    return "งานติดเอกสาร " + list.length + " งาน\n" +
      list.slice(0, 10).map(function (p, i) {
        return (i + 1) + ") " + p.wbs;
      }).join("\n");
  }

  if (q.includes("ติดค่าใช้จ่าย") || q.includes("ค่าใช้จ่าย")) {
    const list = allProjects.filter(hasCostIssue);

    return "งานติดค่าใช้จ่าย " + list.length + " งาน\n" +
      list.slice(0, 10).map(function (p, i) {
        return (i + 1) + ") " + p.wbs + " " + formatPercent(p.costPercent);
      }).join("\n");
  }

  if (q.includes("ติด time") || q.includes("ติดไทม์") || q.includes("time")) {
    const list = allProjects.filter(hasTimeIssue);

    return "งานติด Time " + list.length + " งาน\n" +
      list.slice(0, 10).map(function (p, i) {
        return (i + 1) + ") " + p.wbs + " " + formatPercent(p.timePercent);
      }).join("\n");
  }

  if (q.includes("พร้อมปิด")) {
    const list = allProjects.filter(isReadyProject);

    return "งานพร้อมปิด " + list.length + " งาน\n" +
      list.slice(0, 10).map(function (p, i) {
        return (i + 1) + ") " + p.wbs + " - " + p.jobName;
      }).join("\n");
  }

  return "ยังไม่พบข้อมูลจากคำถามนี้";
}

function projectSummaryText(p) {
  return `
พบงาน ${p.wbs}

${p.jobName}

ผู้รับผิดชอบ: ${p.owner}
สถานะ: ${p.systemStatus || "-"} / ${p.userStatus || "-"}

Cost: ${formatPercent(p.costPercent)} / ${p.costStatus || "-"}
Material: ${formatPercent(p.materialPercent)} / ${p.materialStatus || "-"}
Document: ${formatPercent(p.documentPercent)} / ${p.documentStatus || "-"}
Time: ${formatPercent(p.timePercent)} / ${p.timeStatus || "-"}

ปัญหาหลัก: ${p.mainIssue || "-"}
Priority: ${p.priority || "-"}
${isC3WaitingProject(p) ? "\nC3 รอพัสดุ: " + safeValue((getMaterialWaitingForWbs(p.wbs) || {}).waitingDays || p.c3WaitingDays) + " วัน" : ""}
  `.trim();
}

function ownerSummaryText(list) {
  const owner = list[0].owner || "-";
  const notReady = list.filter(isNotReadyProject);

  return `
พบงานของ ${owner} จำนวน ${list.length} งาน
ยังไม่พร้อม ${notReady.length} งาน

งานเร่งด่วน:
${notReady.slice(0, 8).map(function (p, i) {
    return (i + 1) + ") " + p.wbs + " - " + (p.mainIssue || "-");
  }).join("\n")}
  `.trim();
}

/* =========================
   UI Helpers
========================= */

function priorityBadge(priority) {
  const p = String(priority || "-").toUpperCase();

  let cls = "badge-p3";

  if (p === "P1") cls = "badge-p1";
  if (p === "P2") cls = "badge-p2";
  if (p === "P3") cls = "badge-p3";
  if (p === "P4") cls = "badge-p4";

  return `<span class="badge ${cls}">${escapeHtml(p)}</span>`;
}

function statusBadge(systemStatus, userStatus) {
  const sys = String(systemStatus || "-").toUpperCase();
  const usr = String(userStatus || "-").toUpperCase();

  let cls = "";

  if (sys === "REL") cls = "status-rel";
  if (sys === "TECO") cls = "status-teco";
  if (sys === "CLSD") cls = "status-clsd";

  return `<span class="status-pill ${cls}">${escapeHtml(sys)} / ${escapeHtml(usr)}</span>`;
}

function metricBadge(value, status, wbs) {
  const s = String(status || "-").toUpperCase();

  let cls = "metric-warning";

  if (isPassStatus(s)) {
    cls = "metric-pass";
  } else if (s === "FAIL" || s === "NO" || s === "-") {
    cls = "metric-fail";
  }

  return `
    <span
      class="metric-pill ${cls}"
      onclick="event.stopPropagation(); openProjectDetail('${escapeAttr(wbs)}')"
      title="คลิกเพื่อดูรายละเอียด"
    >
      ${escapeHtml(formatPercent(value))} / ${escapeHtml(status || "-")}
    </span>
  `;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${escapeHtml(safeValue(value))}</div>
    </div>
  `;
}

/* =========================
   Format Helpers
========================= */

function safeValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "number") {
    if (value <= 1) return (value * 100).toFixed(2) + "%";
    return value.toFixed(2) + "%";
  }

  const text = String(value);

  if (text.includes("%")) return text;

  const n = Number(text);

  if (!Number.isNaN(n)) return n.toFixed(2) + "%";

  return text;
}

function formatMoney(value) {
  const n = Number(String(value || 0).replace(/,/g, ""));

  if (Number.isNaN(n)) return "0.00";

  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function isPassStatus(value) {
  const s = String(value || "").trim().toUpperCase();

  return s === "PASS" ||
    s === "ผ่าน" ||
    s === "YES" ||
    s === "ครบ";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "");
}
