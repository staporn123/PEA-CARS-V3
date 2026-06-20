let allProjects = [];
let workQueue = [];
let alerts = [];

let statusChart = null;
let issueChart = null;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadAllData();
});

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const page = btn.dataset.page;
      showPage(page);
    });
  });

  document.getElementById("refreshBtn").addEventListener("click", loadAllData);
  document.getElementById("projectSearchBtn").addEventListener("click", searchProjects);

  document.getElementById("projectSearch").addEventListener("keydown", e => {
    if (e.key === "Enter") searchProjects();
  });

  document.getElementById("globalSearch").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      showPage("projects");
      document.getElementById("projectSearch").value = e.target.value;
      searchProjects();
    }
  });

  document.getElementById("assistantSendBtn").addEventListener("click", askAssistant);

  document.getElementById("assistantInput").addEventListener("keydown", e => {
    if (e.key === "Enter") askAssistant();
  });

  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(page + "Page").classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    projects: "Projects",
    workqueue: "Work Queue",
    alerts: "Alert Center",
    assistant: "AI Assistant"
  };

  document.getElementById("pageTitle").textContent = titles[page] || "Dashboard";
}

async function api(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);

  Object.keys(params).forEach(key => {
    url.searchParams.set(key, params[key]);
  });

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("API Error: " + res.status);

  return await res.json();
}

async function loadAllData() {
  try {
    setLoading(true);

    const dashboard = await api("dashboard");
    allProjects = await api("projects");
    workQueue = await api("workqueue");
    alerts = await api("alerts");

    renderKpi(dashboard);
    renderCharts(dashboard);
    renderProjectTable(allProjects);
    renderSearchTable(allProjects);
    renderWorkQueue(workQueue);
    renderAlerts(alerts);
  } catch (err) {
    alert("โหลดข้อมูลไม่สำเร็จ: " + err.message);
    console.error(err);
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  const btn = document.getElementById("refreshBtn");
  btn.textContent = isLoading ? "Loading..." : "Refresh";
  btn.disabled = isLoading;
}

function renderKpi(data) {
  const items = [
    ["งานทั้งหมด", data.total || 0],
    ["พร้อมปิด", data.ready || 0],
    ["ยังไม่พร้อม", data.notReady || 0],
    ["ปิดแล้ว", data.closed || 0],
    ["ติดเอกสาร", data.docIssue || 0],
    ["ติดพัสดุ", data.materialIssue || 0],
    ["ติดค่าใช้จ่าย", data.costIssue || 0],
    ["ติด Time", data.timeIssue || 0],
    ["REL", data.rel || 0],
    ["TECO", data.teco || 0]
  ];

  document.getElementById("kpiGrid").innerHTML = items.map(item => `
    <div class="kpi-card">
      <div class="kpi-title">${escapeHtml(item[0])}</div>
      <div class="kpi-value">${escapeHtml(item[1])}</div>
    </div>
  `).join("");
}

function renderCharts(data) {
  const statusCtx = document.getElementById("statusChart");
  const issueCtx = document.getElementById("issueChart");

  if (statusChart) statusChart.destroy();
  if (issueChart) issueChart.destroy();

  statusChart = new Chart(statusCtx, {
    type: "doughnut",
    data: {
      labels: ["พร้อมปิด", "ยังไม่พร้อม", "ปิดแล้ว"],
      datasets: [{
        data: [data.ready || 0, data.notReady || 0, data.closed || 0],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { labels: { color: "#f8fafc" } } }
    }
  });

  issueChart = new Chart(issueCtx, {
    type: "bar",
    data: {
      labels: ["เอกสาร", "พัสดุ", "ค่าใช้จ่าย", "Time"],
      datasets: [{
        label: "จำนวนงาน",
        data: [
          data.docIssue || 0,
          data.materialIssue || 0,
          data.costIssue || 0,
          data.timeIssue || 0
        ],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { labels: { color: "#f8fafc" } } },
      scales: {
        x: { ticks: { color: "#f8fafc" } },
        y: { ticks: { color: "#f8fafc" }, beginAtZero: true }
      }
    }
  });
}

function renderProjectTable(rows) {
  document.getElementById("projectCount").textContent = `${rows.length} งาน`;
  document.getElementById("projectTable").innerHTML = rows.map(projectRow).join("");
}

function renderSearchTable(rows) {
  document.getElementById("searchTable").innerHTML = rows.map(projectRow).join("");
}

function projectRow(p) {
  return `
    <tr onclick="openProject('${escapeAttr(p.wbs)}')">
      <td>${priorityBadge(p.priority)}</td>
      <td>${escapeHtml(p.wbs)}</td>
      <td>${escapeHtml(p.jobName)}</td>
      <td>${escapeHtml(p.owner)}</td>
      <td><span class="status-pill">${escapeHtml(p.systemStatus || "-")} / ${escapeHtml(p.userStatus || "-")}</span></td>
      <td>${metricBadge(p.costPercent, p.costStatus)}</td>
      <td>${metricBadge(p.materialPercent, p.materialStatus)}</td>
      <td>${metricBadge(p.documentPercent, p.documentStatus)}</td>
      <td>${metricBadge(p.timePercent, p.timeStatus)}</td>
      <td>${escapeHtml(p.readyToClose || p.closureStatus || "-")}</td>
    </tr>
  `;
}

function searchProjects() {
  const key = document.getElementById("projectSearch").value.toLowerCase().trim();

  if (!key) {
    renderSearchTable(allProjects);
    return;
  }

  const filtered = allProjects.filter(p =>
    String(p.wbs || "").toLowerCase().includes(key) ||
    String(p.jobName || "").toLowerCase().includes(key) ||
    String(p.owner || "").toLowerCase().includes(key) ||
    String(p.province || "").toLowerCase().includes(key) ||
    String(p.systemStatus || "").toLowerCase().includes(key)
  );

  renderSearchTable(filtered);
}

function renderWorkQueue(rows) {
  document.getElementById("workQueueTable").innerHTML = rows.map(r => `
    <tr>
      <td>${priorityBadge(r.priority)}</td>
      <td>${escapeHtml(r.wbs)}</td>
      <td>${escapeHtml(r.jobName)}</td>
      <td>${escapeHtml(r.owner)}</td>
      <td>${escapeHtml(r.mainIssue)}</td>
      <td>${escapeHtml(r.action)}</td>
      <td>${escapeHtml(r.province)}</td>
    </tr>
  `).join("");
}

function renderAlerts(rows) {
  document.getElementById("alertTable").innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.alertType)}</td>
      <td>${priorityBadge(r.priority)}</td>
      <td>${escapeHtml(r.wbs)}</td>
      <td>${escapeHtml(r.jobName)}</td>
      <td>${escapeHtml(r.owner)}</td>
      <td>${escapeHtml(r.issue)}</td>
      <td>${escapeHtml(r.action)}</td>
    </tr>
  `).join("");
}

async function openProject(wbs) {
  try {
    const detail = await api("project", { wbs });

    const p = detail.project || detail;

    document.getElementById("modalTitle").textContent = p.wbs || "รายละเอียดงาน";

    document.getElementById("modalBody").innerHTML = `
      <div class="detail-grid">
        ${detailItem("WBS", p.wbs)}
        ${detailItem("ชื่องาน", p.jobName)}
        ${detailItem("ผู้รับผิดชอบ", p.owner)}
        ${detailItem("สถานะ", `${p.systemStatus || "-"} / ${p.userStatus || "-"}`)}
        ${detailItem("Cost", `${formatPercent(p.costPercent)} / ${p.costStatus || "-"}`)}
        ${detailItem("Material", `${formatPercent(p.materialPercent)} / ${p.materialStatus || "-"}`)}
        ${detailItem("Document", `${formatPercent(p.documentPercent)} / ${p.documentStatus || "-"}`)}
        ${detailItem("Time", `${formatPercent(p.timePercent)} / ${p.timeStatus || "-"}`)}
        ${detailItem("Ready", p.readyToClose || "-")}
        ${detailItem("Main Issue", p.mainIssue || "-")}
        ${detailItem("Priority", p.priority || "-")}
      </div>

      <div style="margin-top:18px" class="card">
        <h3>Recommended Action</h3>
        <p>${escapeHtml(p.action || "-")}</p>
      </div>
    `;

    document.getElementById("projectModal").classList.remove("hidden");
  } catch (err) {
    alert("เปิดรายละเอียดไม่สำเร็จ: " + err.message);
  }
}

function closeModal() {
  document.getElementById("projectModal").classList.add("hidden");
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${escapeHtml(value || "-")}</div>
    </div>
  `;
}

function priorityBadge(priority) {
  const p = String(priority || "-").toLowerCase();
  return `<span class="badge badge-${p}">${escapeHtml(priority || "-")}</span>`;
}

function metricBadge(value, status) {
  const cls = status === "PASS" || status === "ผ่าน" ? "badge-pass" : "badge-fail";
  return `<span class="metric-pill ${cls}">${formatPercent(value)} / ${escapeHtml(status || "-")}</span>`;
}

function formatPercent(v) {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") {
    return v <= 1 ? (v * 100).toFixed(2) + "%" : v.toFixed(2) + "%";
  }
  return String(v);
}

function askAssistant() {
  const input = document.getElementById("assistantInput");
  const text = input.value.trim();
  if (!text) return;

  addChat("user", text);
  input.value = "";

  const answer = localAssistant(text);
  setTimeout(() => addChat("bot", answer), 250);
}

function addChat(type, text) {
  const box = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.className = type === "user" ? "user-msg" : "bot-msg";
  div.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function localAssistant(text) {
  const q = text.toLowerCase();

  const found = allProjects.find(p =>
    String(p.wbs || "").toLowerCase().includes(q) ||
    q.includes(String(p.wbs || "").toLowerCase())
  );

  if (found) {
    return `พบงาน ${found.wbs}
${found.jobName}

ผู้รับผิดชอบ: ${found.owner}
สถานะ: ${found.systemStatus || "-"} / ${found.userStatus || "-"}

Cost: ${formatPercent(found.costPercent)} / ${found.costStatus}
Material: ${formatPercent(found.materialPercent)} / ${found.materialStatus}
Document: ${formatPercent(found.documentPercent)} / ${found.documentStatus}
Time: ${formatPercent(found.timePercent)} / ${found.timeStatus}

ปัญหาหลัก: ${found.mainIssue || "-"}
Priority: ${found.priority || "-"}`;
  }

  const owner = allProjects.filter(p => q.includes(String(p.owner || "").toLowerCase()));

  if (owner.length) {
    const notReady = owner.filter(p => p.readyToClose !== "YES" && p.closureStatus !== "พร้อมปิดงาน");

    return `พบงานของ ${owner[0].owner} จำนวน ${owner.length} งาน
ยังไม่พร้อม ${notReady.length} งาน

งานเร่งด่วน:
${notReady.slice(0, 5).map((p, i) =>
  `${i + 1}) ${p.wbs} - ${p.mainIssue || "-"}`
).join("\n")}`;
  }

  if (q.includes("ติดพัสดุ")) {
    const list = allProjects.filter(p => p.materialStatus !== "PASS");
    return `งานติดพัสดุ ${list.length} งาน\n` +
      list.slice(0, 10).map((p, i) => `${i + 1}) ${p.wbs} ${formatPercent(p.materialPercent)}`).join("\n");
  }

  if (q.includes("พร้อมปิด")) {
    const list = allProjects.filter(p => p.readyToClose === "YES" || p.closureStatus === "พร้อมปิดงาน");
    return `งานพร้อมปิด ${list.length} งาน\n` +
      list.slice(0, 10).map((p, i) => `${i + 1}) ${p.wbs}`).join("\n");
  }

  return "ยังไม่พบคำตอบจากข้อมูลปัจจุบัน ลองพิมพ์ WBS, ชื่อผู้รับผิดชอบ, ติดพัสดุ หรือ พร้อมปิด";
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
