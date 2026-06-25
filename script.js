/* =========================================================
   PEA CARS+ V4 Professional Edition - Turbo V6.2 Stable Filter Logic
   File: script.js
   Copy ทั้งไฟล์นี้ไปวางทับ script.js เดิม
========================================================= */

let allProjects = [];
let workQueue = [];
let alertCenter = [];

let statusChart = null;
let issueChart = null;
let selectedProject = null;
let activeDashboardFilter = "all";
const detailCache = new Map();

document.addEventListener("DOMContentLoaded", function () {
  injectDashboardFilterStyle();
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
  `;
  document.head.appendChild(style);
}

function unwrapArray(response) {
  if (Array.isArray(response)) return response;
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
      apiAction("alerts")
    ]);

    if (results[0].status === "fulfilled") {
      workQueue = unwrapArray(results[0].value);
      renderWorkQueue(workQueue);
    }

    if (results[1].status === "fulfilled") {
      alertCenter = unwrapArray(results[1].value);
      renderAlertCenter(alertCenter);
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

  const now = new Date();
  el.textContent = "อัปเดตล่าสุด: " + now.toLocaleString("th-TH");
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
    _source: fallback._source || "frontend-v6-2"
  };
}

function isClosedProject(p) {
  return String(p.systemStatus || "").toUpperCase() === "CLSD" ||
    String(p.closureStatus || "").trim() === "ปิดแล้ว";
}

function isReadyProject(p) {
  const ready = String(p.readyToClose || "").toUpperCase() === "YES" ||
    String(p.closureStatus || "").trim() === "พร้อมปิดงาน" ||
    String(p.priority || "").toUpperCase() === "P4";

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
    time: "timedetail"
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
    time: "Time Detail"
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

    ${renderLazyDetailPlaceholder("cost", "Cost Detail")}
    ${renderLazyDetailPlaceholder("material", "Material Pending")}
    ${renderLazyDetailPlaceholder("document", "Document Checklist")}
    ${renderLazyDetailPlaceholder("time", "Time Detail")}
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
  const rows = (material.pendingItems || []).map(function (x) {
    return `
      <tr>
        <td>${escapeHtml(x.materialCode)}</td>
        <td class="text-wrap">${escapeHtml(x.materialName)}</td>
        <td>${escapeHtml(x.requiredQty)}</td>
        <td>${escapeHtml(x.issuedQty)}</td>
        <td>${escapeHtml(x.pendingQty)}</td>
        <td>${formatMoney(x.pendingValue)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="detail-section card" id="detail-part-material">
      <h3>Material Pending</h3>
      <p class="muted">
        รายการทั้งหมด ${material.totalItems || 0} รายการ /
        ค้าง ${material.pendingCount || 0} รายการ /
        มูลค่าค้าง ${formatMoney(material.pendingValue || 0)} บาท
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>รหัสพัสดุ</th>
              <th>รายการพัสดุ</th>
              <th>ต้องการ</th>
              <th>เบิกแล้ว</th>
              <th>ค้าง</th>
              <th>มูลค่าค้าง</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6" class="empty-state">ไม่มีพัสดุค้าง</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
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
        ยังไม่ครบ ${documentDetail.missing || 0} รายการ
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
