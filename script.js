/* =========================================================
   PEA CARS+ V4 Professional Edition
   File: script.js
   Copy ทั้งไฟล์นี้ไปวางทับ script.js เดิม
========================================================= */

let allProjects = [];
let workQueue = [];
let alertCenter = [];

let statusChart = null;
let issueChart = null;

let selectedProject = null;

document.addEventListener("DOMContentLoaded", function () {
  bindEvents();
  loadAllData();
});

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

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showPage(btn.dataset.page);
    });
  });

  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadAllData);

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

    const dashboardRaw = await CarsAPI.getDashboard();
    const projectsRaw = await CarsAPI.getProjects();
    const queueRaw = await CarsAPI.getWorkQueue();
    const alertsRaw = await CarsAPI.getAlertCenter();

    const dashboard = unwrapObject(dashboardRaw);

    allProjects = unwrapArray(projectsRaw);
    workQueue = unwrapArray(queueRaw);
    alertCenter = unwrapArray(alertsRaw);

    renderKpi(dashboard);
    renderCharts(dashboard);
    renderProjectTable(allProjects);
    renderSearchTable(allProjects);
    renderWorkQueue(workQueue);
    renderAlertCenter(alertCenter);
    renderLastUpdate();

  } catch (err) {
    console.error(err);
    alert("โหลดข้อมูลไม่สำเร็จ: " + err.message);
  } finally {
    setLoading(false);
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

function renderKpi(data) {
  const kpiGrid = document.getElementById("kpiGrid");
  if (!kpiGrid) return;

  const items = [
    { title: "งานทั้งหมด", value: data.total || 0, sub: "โครงการทั้งหมด", icon: "📁", tone: "blue" },
    { title: "พร้อมปิดงาน", value: data.ready || 0, sub: "Ready to Close", icon: "✅", tone: "green" },
    { title: "ยังไม่พร้อม", value: data.notReady || 0, sub: "Need Action", icon: "⏱️", tone: "orange" },
    { title: "ปิดแล้ว", value: data.closed || 0, sub: "Closed", icon: "🔒", tone: "purple" },
    { title: "ติดเอกสาร", value: data.docIssue || 0, sub: "Document Issue", icon: "📄", tone: "red" },
    { title: "ติดพัสดุ", value: data.materialIssue || 0, sub: "Material Issue", icon: "📦", tone: "orange" },
    { title: "ติดค่าใช้จ่าย", value: data.costIssue || 0, sub: "Cost Issue", icon: "💰", tone: "yellow" },
    { title: "ติด Time", value: data.timeIssue || 0, sub: "Time Issue", icon: "🕘", tone: "blue" },
    { title: "REL", value: data.rel || 0, sub: "Released", icon: "📋", tone: "purple" },
    { title: "TECO", value: data.teco || 0, sub: "Technically Complete", icon: "☑️", tone: "cyan" },
    { title: "CLSD", value: data.clsd || 0, sub: "Closed Status", icon: "🔐", tone: "green" }
  ];

  kpiGrid.innerHTML = items.map(function (item) {
    return `
      <div class="kpi-card kpi-${escapeAttr(item.tone)}">
        <div class="kpi-icon">${escapeHtml(item.icon)}</div>
        <div class="kpi-title">${escapeHtml(item.title)}</div>
        <div class="kpi-value">${escapeHtml(item.value)}</div>
        <div class="kpi-sub">${escapeHtml(item.sub)}</div>
      </div>
    `;
  }).join("");
}

function renderCharts(data) {
  renderStatusChart(data);
  renderIssueChart(data);
}

function renderStatusChart(data) {
  const canvas = document.getElementById("statusChart");
  if (!canvas || typeof Chart === "undefined") return;

  const parent = canvas.parentElement;
  if (parent) parent.classList.add("status-chart-card");

  if (statusChart) statusChart.destroy();

  const ready = Number(data.ready || 0);
  const notReady = Number(data.notReady || 0);
  const closed = Number(data.closed || 0);
  const total = ready + notReady + closed;

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

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "800 14px Segoe UI";
      ctx.fillText("รวมทั้งสิ้น", x, y - 34);

      ctx.fillStyle = "#ffffff";
      ctx.font = "950 38px Segoe UI";
      ctx.fillText(String(total), x, y + 2);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "800 14px Segoe UI";
      ctx.fillText("โครงการ", x, y + 38);

      ctx.restore();
    }
  };

  statusChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["พร้อมปิด", "ยังไม่พร้อม", "ปิดแล้ว"],
      datasets: [{
        data: [ready, notReady, closed],
        backgroundColor: ["#22c55e", "#ef4444", "#38bdf8"],
        hoverBackgroundColor: ["#4ade80", "#f87171", "#7dd3fc"],
        borderColor: "rgba(15, 23, 42, 0.98)",
        borderWidth: 5,
        hoverOffset: 10,
        spacing: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      radius: "82%",
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 900,
        easing: "easeOutQuart"
      },
      layout: {
        padding: 12
      },
      plugins: {
        legend: {
          position: "right",
          align: "center",
          labels: {
            color: "#f8fafc",
            usePointStyle: true,
            pointStyle: "circle",
            padding: 18,
            font: {
              size: 14,
              weight: "bold"
            },
            generateLabels: function (chart) {
              const dataset = chart.data.datasets[0];

              return chart.data.labels.map(function (label, i) {
                const value = Number(dataset.data[i] || 0);
                const percent = total ? ((value / total) * 100).toFixed(1) : "0.0";

                return {
                  text: label + "   " + value + " (" + percent + "%)",
                  fillStyle: dataset.backgroundColor[i],
                  strokeStyle: dataset.backgroundColor[i],
                  lineWidth: 0,
                  hidden: false,
                  index: i
                };
              });
            }
          }
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

  const parent = canvas.parentElement;
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
        const value = values[index];
        ctx.fillText(String(value), bar.x, bar.y - 8);
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
        backgroundColor: ["#ef4444", "#fb923c", "#facc15", "#38bdf8"],
        hoverBackgroundColor: ["#f87171", "#fdba74", "#fde047", "#7dd3fc"],
        borderRadius: 14,
        borderSkipped: false,
        barPercentage: 0.55,
        categoryPercentage: 0.68
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
          labels: {
            color: "#f8fafc",
            boxWidth: 24,
            boxHeight: 10,
            padding: 18,
            font: {
              size: 14,
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
            color: "rgba(148,163,184,0.10)",
            drawBorder: false
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...values, 10) + 10,
          ticks: {
            color: "#f8fafc",
            precision: 0
          },
          grid: {
            color: "rgba(148,163,184,0.14)",
            drawBorder: false
          }
        }
      }
    },
    plugins: [barValuePlugin]
  });
}

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
      <td>${metricBadge(p.costPercent, p.costStatus, "cost", wbs)}</td>
      <td>${metricBadge(p.materialPercent, p.materialStatus, "material", wbs)}</td>
      <td>${metricBadge(p.documentPercent, p.documentStatus, "document", wbs)}</td>
      <td>${metricBadge(p.timePercent, p.timeStatus, "time", wbs)}</td>
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

async function openProjectDetail(wbs) {
  try {
    selectedProject = null;

    const rawDetail = await CarsAPI.getProjectDetail(wbs);
    const detail = unwrapObject(rawDetail);
    const project = detail.project || detail;

    selectedProject = project;

    const modal = document.getElementById("projectModal");
    const title = document.getElementById("modalTitle");
    const body = document.getElementById("modalBody");

    if (!modal || !title || !body) return;

    title.textContent = "รายละเอียดงาน: " + (project.wbs || wbs);
    body.innerHTML = renderProjectDetail(project, detail);

    modal.classList.remove("hidden");

  } catch (err) {
    console.error(err);
    alert("เปิดรายละเอียดไม่สำเร็จ: " + err.message);
  }
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
    <div class="detail-section card">
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
    <div class="detail-section card">
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
  const rows = (documentDetail.items || []).map(function (x) {
    return `
      <tr>
        <td>${escapeHtml(x.docCode)}</td>
        <td>${escapeHtml(x.category)}</td>
        <td class="text-wrap">${escapeHtml(x.documentName)}</td>
        <td>${escapeHtml(x.status)}</td>
        <td>${escapeHtml(x.importance)}</td>
        <td>${escapeHtml(x.required)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="detail-section card">
      <h3>Document Checklist</h3>
      <p class="muted">
        เอกสารทั้งหมด ${documentDetail.total || 0} รายการ /
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
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <br>
      <button onclick="exportProjectPdf('${escapeAttr(documentDetail.wbs)}')">
        Export PDF Checklist
      </button>
    </div>
  `;
}

function renderTimeDetail(time) {
  return `
    <div class="detail-section card">
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

async function exportExcel() {
  try {
    const result = await CarsAPI.exportExcel();

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
    const result = await CarsAPI.exportPdf(wbs);

    if (result && result.url) {
      window.open(result.url, "_blank");
    } else {
      alert("ไม่พบลิงก์ Export PDF");
    }
  } catch (err) {
    alert("Export PDF ไม่สำเร็จ: " + err.message);
  }
}

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
    const list = allProjects.filter(function (p) {
      return !isPassStatus(p.materialStatus);
    });

    return "งานติดพัสดุ " + list.length + " งาน\n" +
      list.slice(0, 10).map(function (p, i) {
        return (i + 1) + ") " + p.wbs + " " + formatPercent(p.materialPercent);
      }).join("\n");
  }

  if (q.includes("ติดเอกสาร")) {
    const list = allProjects.filter(function (p) {
      return !isPassStatus(p.documentStatus);
    });

    return "งานติดเอกสาร " + list.length + " งาน\n" +
      list.slice(0, 10).map(function (p, i) {
        return (i + 1) + ") " + p.wbs;
      }).join("\n");
  }

  if (q.includes("พร้อมปิด")) {
    const list = allProjects.filter(function (p) {
      return String(p.readyToClose || "").toUpperCase() === "YES" ||
        p.closureStatus === "พร้อมปิดงาน";
    });

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
  const notReady = list.filter(function (p) {
    return String(p.readyToClose || "").toUpperCase() !== "YES" &&
      p.closureStatus !== "พร้อมปิดงาน";
  });

  return `
พบงานของ ${owner} จำนวน ${list.length} งาน
ยังไม่พร้อม ${notReady.length} งาน

งานเร่งด่วน:
${notReady.slice(0, 8).map(function (p, i) {
    return (i + 1) + ") " + p.wbs + " - " + (p.mainIssue || "-");
  }).join("\n")}
  `.trim();
}

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

function metricBadge(value, status, type, wbs) {
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
