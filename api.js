/* =========================================================
   PEA CARS+ V3 API CLIENT - JSONP VERSION
   ใช้แก้ CORS สำหรับ GitHub Pages → Apps Script
========================================================= */

const CarsAPI = (() => {
  const DEFAULT_TIMEOUT = 30000;

  function assertConfig() {
    if (typeof API_URL === "undefined" || !API_URL) {
      throw new Error("ไม่พบ API_URL กรุณาตั้งค่าในไฟล์ config.js ก่อน");
    }
  }

  function buildUrl(action, params = {}, callbackName = "") {
    assertConfig();
    const url = new URL(API_URL);
    url.searchParams.set("action", action);
    if (callbackName) url.searchParams.set("callback", callbackName);
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
    url.searchParams.set("_", Date.now());
    return url.toString();
  }

  function request(action, params = {}, options = {}) {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    return new Promise((resolve, reject) => {
      const callbackName = "jsonp_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
      const script = document.createElement("script");
      let done = false;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error("API ใช้เวลานานเกินไป หรือโหลดไม่สำเร็จ"));
      }, timeout);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function(data) {
        if (done) return;
        done = true;
        cleanup();
        if (data && data.success === false) reject(new Error(data.message || "API ส่งกลับ success=false"));
        else resolve(data);
      };

      script.onerror = function() {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error("โหลดข้อมูลไม่สำเร็จ: ตรวจสอบ Deploy Apps Script หรือสิทธิ์ Anyone"));
      };

      script.src = buildUrl(action, params, callbackName);
      document.body.appendChild(script);
    });
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeWbs(value) {
    return normalizeText(value).replace(/\s+/g, "").replace(/[–—−]/g, "-").toUpperCase();
  }

  function asArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }

  function asObject(data) {
    if (!data) return {};
    if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) return data.data;
    return data;
  }

  async function getDashboard() { return asObject(await request("dashboard")); }
  async function getProjects() { return asArray(await request("projects")); }
  async function searchProjects(keyword = "") { return asArray(await request("projects", { keyword })); }
  async function getProject(wbs) { return asObject(await request("project", { wbs: normalizeWbs(wbs) })); }
  async function getProjectFullDetail(wbs) { return asObject(await request("projectDetail", { wbs: normalizeWbs(wbs) })); }
  async function getCostDetail(wbs) { return asObject(await request("costDetail", { wbs: normalizeWbs(wbs) })); }
  async function getMaterialDetail(wbs) { return asObject(await request("materialDetail", { wbs: normalizeWbs(wbs) })); }
  async function getDocumentDetail(wbs) { return asObject(await request("documentDetail", { wbs: normalizeWbs(wbs) })); }
  async function getTimeDetail(wbs) { return asObject(await request("timeDetail", { wbs: normalizeWbs(wbs) })); }
  async function getDocumentChecklist(wbs) { return asArray(await request("checklist", { wbs: normalizeWbs(wbs) })); }
  async function getWorkQueue() { return asArray(await request("workqueue")); }
  async function getAlertCenter() { return asArray(await request("alerts")); }
  async function exportActiveProjectExcel() { return asObject(await request("exportExcel", {}, { timeout: 60000 })); }
  async function exportDocumentPdf(wbs) { return asObject(await request("exportPdf", { wbs: normalizeWbs(wbs) }, { timeout: 60000 })); }
  async function ping() { return asObject(await request("ping")); }

  function filterProjects(projects, keyword = "") {
    const key = normalizeText(keyword).toLowerCase();
    if (!key) return projects || [];
    return (projects || []).filter(p => [
      p.wbs, p.jobName, p.owner, p.province, p.workType,
      p.systemStatus, p.userStatus, p.mainIssue, p.priority
    ].some(v => normalizeText(v).toLowerCase().includes(key)));
  }

  function filterByIssue(projects, issueType) {
    const type = normalizeText(issueType).toLowerCase();
    return (projects || []).filter(p => {
      if (type === "cost") return p.costStatus !== "PASS";
      if (type === "material") return p.materialStatus !== "PASS";
      if (type === "document") return p.documentStatus !== "PASS";
      if (type === "time") return p.timeStatus && p.timeStatus !== "ผ่าน" && p.timeStatus !== "PASS";
      if (type === "ready") return p.readyToClose === "YES" || p.closureStatus === "พร้อมปิดงาน";
      if (type === "notready") return p.readyToClose !== "YES" && p.closureStatus !== "พร้อมปิดงาน";
      if (type === "rel") return p.systemStatus === "REL";
      if (type === "teco") return p.systemStatus === "TECO";
      if (type === "clsd") return p.systemStatus === "CLSD";
      return true;
    });
  }

  function getTopRiskProjects(projects, limit = 10) {
    return [...(projects || [])]
      .filter(p => p.readyToClose !== "YES" && p.closureStatus !== "พร้อมปิดงาน")
      .sort((a, b) => Number(a.overallScore || 0) - Number(b.overallScore || 0))
      .slice(0, limit);
  }

  function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return value <= 1 ? `${(value * 100).toFixed(2)}%` : `${value.toFixed(2)}%`;
    return String(value);
  }

  function formatMoney(value) {
    const n = Number(String(value ?? 0).replace(/,/g, ""));
    if (Number.isNaN(n)) return "0.00";
    return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function openFileUrl(result) {
    if (result && result.url) {
      window.open(result.url, "_blank");
      return true;
    }
    return false;
  }

  return {
    request, buildUrl,
    getDashboard, getProjects, searchProjects, getProject, getProjectFullDetail,
    getCostDetail, getMaterialDetail, getDocumentDetail, getTimeDetail, getDocumentChecklist,
    getWorkQueue, getAlertCenter, exportActiveProjectExcel, exportDocumentPdf, ping,
    filterProjects, filterByIssue, getTopRiskProjects,
    normalizeWbs, normalizeText, formatPercent, formatMoney, openFileUrl
  };
})();
