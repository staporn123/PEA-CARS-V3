/* =========================================================
   PEA CARS+ V3 / V4 API CLIENT
   ใช้เชื่อม GitHub Pages → Apps Script Web App API
   ต้องมี config.js และตัวแปร API_URL ก่อนโหลดไฟล์นี้
========================================================= */

const CarsAPI = (() => {
  const DEFAULT_TIMEOUT = 30000;

  function assertConfig() {
    if (typeof API_URL === "undefined" || !API_URL) {
      throw new Error("ไม่พบ API_URL กรุณาตั้งค่าในไฟล์ config.js ก่อน");
    }
  }

  function buildUrl(action, params = {}) {
    assertConfig();

    const url = new URL(API_URL);
    url.searchParams.set("action", action);

    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  }

  async function request(action, params = {}, options = {}) {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const url = buildUrl(action, params);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`API HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data && data.success === false) {
        throw new Error(data.message || "API ส่งกลับ success=false");
      }

      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("API ใช้เวลานานเกินไป กรุณาลองใหม่");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeWbs(value) {
    return normalizeText(value)
      .replace(/\s+/g, "")
      .replace(/[–—−]/g, "-")
      .toUpperCase();
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

  async function getDashboard() {
    return asObject(await request("dashboard"));
  }

  async function getProjects() {
    return asArray(await request("projects"));
  }

  async function searchProjects(keyword = "") {
    const data = await request("projects", { keyword });
    return asArray(data);
  }

  async function getProject(wbs) {
    const key = normalizeWbs(wbs);
    if (!key) throw new Error("กรุณาระบุ WBS");

    return asObject(await request("project", { wbs: key }));
  }

  async function getProjectFullDetail(wbs) {
    const key = normalizeWbs(wbs);
    if (!key) throw new Error("กรุณาระบุ WBS");

    return asObject(await request("projectDetail", { wbs: key }));
  }

  async function getCostDetail(wbs) {
    const key = normalizeWbs(wbs);
    if (!key) throw new Error("กรุณาระบุ WBS");

    return asObject(await request("costDetail", { wbs: key }));
  }

  async function getMaterialDetail(wbs) {
    const key = normalizeWbs(wbs);
    if (!key) throw new Error("กรุณาระบุ WBS");

    return asObject(await request("materialDetail", { wbs: key }));
  }

  async function getDocumentDetail(wbs) {
    const key = normalizeWbs(wbs);
    if (!key) throw new Error("กรุณาระบุ WBS");

    return asObject(await request("documentDetail", { wbs: key }));
  }

  async function getTimeDetail(wbs) {
    const key = normalizeWbs(wbs);
    if (!key) throw new Error("กรุณาระบุ WBS");

    return asObject(await request("timeDetail", { wbs: key }));
  }

  async function getDocumentChecklist(wbs) {
    const key = normalizeWbs(wbs);
    if (!key) throw new Error("กรุณาระบุ WBS");

    return asArray(await request("checklist", { wbs: key }));
  }

  async function getWorkQueue() {
    return asArray(await request("workqueue"));
  }

  async function getAlertCenter() {
    return asArray(await request("alerts"));
  }

  async function exportActiveProjectExcel() {
    return asObject(await request("exportExcel"));
  }

  async function exportDocumentPdf(wbs) {
    const key = normalizeWbs(wbs);
    if (!key) throw new Error("กรุณาระบุ WBS");

    return asObject(await request("exportPdf", { wbs: key }));
  }

  async function ping() {
    return asObject(await request("ping"));
  }

  function filterProjects(projects, keyword = "") {
    const key = normalizeText(keyword).toLowerCase();

    if (!key) return projects || [];

    return (projects || []).filter((p) => {
      return [
        p.wbs,
        p.jobName,
        p.owner,
        p.province,
        p.workType,
        p.systemStatus,
        p.userStatus,
        p.mainIssue,
        p.priority
      ].some((v) => normalizeText(v).toLowerCase().includes(key));
    });
  }

  function filterByIssue(projects, issueType) {
    const type = normalizeText(issueType).toLowerCase();

    return (projects || []).filter((p) => {
      if (type === "cost") return p.costStatus !== "PASS";
      if (type === "material") return p.materialStatus !== "PASS";
      if (type === "document") return p.documentStatus !== "PASS";
      if (type === "time") return p.timeStatus && p.timeStatus !== "ผ่าน";
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
      .filter((p) => p.readyToClose !== "YES" && p.closureStatus !== "พร้อมปิดงาน")
      .sort((a, b) => {
        const scoreA = Number(a.overallScore || 0);
        const scoreB = Number(b.overallScore || 0);
        return scoreA - scoreB;
      })
      .slice(0, limit);
  }

  function summarizeByOwner(projects, ownerKeyword = "") {
    const key = normalizeText(ownerKeyword).toLowerCase();

    const list = (projects || []).filter((p) =>
      normalizeText(p.owner).toLowerCase().includes(key)
    );

    const summary = {
      owner: list[0]?.owner || ownerKeyword,
      total: list.length,
      ready: 0,
      notReady: 0,
      costIssue: 0,
      materialIssue: 0,
      documentIssue: 0,
      timeIssue: 0,
      p1: 0,
      p2: 0,
      p3: 0,
      projects: list
    };

    list.forEach((p) => {
      const isReady = p.readyToClose === "YES" || p.closureStatus === "พร้อมปิดงาน";

      if (isReady) summary.ready++;
      else summary.notReady++;

      if (p.costStatus !== "PASS") summary.costIssue++;
      if (p.materialStatus !== "PASS") summary.materialIssue++;
      if (p.documentStatus !== "PASS") summary.documentIssue++;
      if (p.timeStatus && p.timeStatus !== "ผ่าน") summary.timeIssue++;

      if (p.priority === "P1") summary.p1++;
      if (p.priority === "P2") summary.p2++;
      if (p.priority === "P3") summary.p3++;
    });

    return summary;
  }

  function summarizeByProvince(projects) {
    const map = {};

    (projects || []).forEach((p) => {
      const province = normalizeText(p.province) || "ไม่ระบุจังหวัด";

      if (!map[province]) {
        map[province] = {
          province,
          total: 0,
          ready: 0,
          notReady: 0,
          costIssue: 0,
          materialIssue: 0,
          documentIssue: 0,
          timeIssue: 0
        };
      }

      const item = map[province];
      const isReady = p.readyToClose === "YES" || p.closureStatus === "พร้อมปิดงาน";

      item.total++;
      if (isReady) item.ready++;
      else item.notReady++;

      if (p.costStatus !== "PASS") item.costIssue++;
      if (p.materialStatus !== "PASS") item.materialIssue++;
      if (p.documentStatus !== "PASS") item.documentIssue++;
      if (p.timeStatus && p.timeStatus !== "ผ่าน") item.timeIssue++;
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }

  function summarizeByMainIssue(projects) {
    const map = {};

    (projects || []).forEach((p) => {
      const issue = normalizeText(p.mainIssue) || "ไม่ระบุ";

      if (!map[issue]) {
        map[issue] = {
          issue,
          total: 0
        };
      }

      map[issue].total++;
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }

  function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "-";

    if (typeof value === "number") {
      return value <= 1 ? `${(value * 100).toFixed(2)}%` : `${value.toFixed(2)}%`;
    }

    const text = String(value);
    return text.includes("%") ? text : text;
  }

  function formatMoney(value) {
    const n = Number(String(value ?? 0).replace(/,/g, ""));
    if (Number.isNaN(n)) return "0.00";

    return n.toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function openFileUrl(result) {
    if (result && result.url) {
      window.open(result.url, "_blank");
      return true;
    }
    return false;
  }

  return {
    request,
    buildUrl,

    getDashboard,
    getProjects,
    searchProjects,
    getProject,
    getProjectFullDetail,
    getCostDetail,
    getMaterialDetail,
    getDocumentDetail,
    getTimeDetail,
    getDocumentChecklist,
    getWorkQueue,
    getAlertCenter,
    exportActiveProjectExcel,
    exportDocumentPdf,
    ping,

    filterProjects,
    filterByIssue,
    getTopRiskProjects,
    summarizeByOwner,
    summarizeByProvince,
    summarizeByMainIssue,

    normalizeWbs,
    normalizeText,
    formatPercent,
    formatMoney,
    formatDate,
    openFileUrl
  };
})();
