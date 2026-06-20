/* =========================================================
   PEA CARS+ V3 API Backend for GitHub Pages
   Version: 3.3 JSONP FIX
   ใช้ใน Google Apps Script ฝั่ง Spreadsheet
========================================================= */

const SPREADSHEET_ID = ""; // ถ้าเป็น Script ที่ผูกกับชีท ให้ปล่อยว่างไว้
const TZ = "Asia/Bangkok";

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "ping").toLowerCase();
    let result;

    switch (action) {
      case "ping":
        result = { success: true, message: "PEA CARS+ API OK", time: new Date() };
        break;

      case "dashboard":
        result = getDashboardData_();
        break;

      case "projects":
        result = getActiveProjects_();
        break;

      case "project":
      case "projectdetail":
        result = getProjectDetail_(getParam_(e, "wbs"));
        break;

      case "workqueue":
        result = getWorkQueue_();
        break;

      case "alerts":
        result = getAlertCenter_();
        break;

      case "costdetail":
        result = getCostDetail_(getParam_(e, "wbs"));
        break;

      case "materialdetail":
        result = getMaterialDetail_(getParam_(e, "wbs"));
        break;

      case "documentdetail":
      case "checklist":
        result = getDocumentDetail_(getParam_(e, "wbs"));
        break;

      case "timedetail":
        result = getTimeDetail_(getParam_(e, "wbs"));
        break;

      case "exportexcel":
        result = exportActiveProjectExcel();
        break;

      case "exportpdf":
        result = exportDocumentPdf(getParam_(e, "wbs"));
        break;

      default:
        result = { success: false, message: "Unknown action: " + action };
    }

    return outputJson_(result, e);
  } catch (err) {
    return outputJson_({ success: false, message: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : "") }, e);
  }
}

function outputJson_(data, e) {
  const json = JSON.stringify(data);
  const callback = e && e.parameter && e.parameter.callback;

  if (callback) {
    const safeCallback = String(callback).replace(/[^a-zA-Z0-9_.$]/g, "");
    return ContentService
      .createTextOutput(safeCallback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getParam_(e, key) {
  return e && e.parameter && e.parameter[key] ? String(e.parameter[key]).trim() : "";
}

function getSs_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetValues_(sheetName) {
  const sh = getSs_().getSheetByName(sheetName);
  if (!sh) return [];
  const values = sh.getDataRange().getDisplayValues();
  return values || [];
}

function toNumber_(v) {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
  const n = Number(s);
  if (Number.isNaN(n)) return 0;
  return String(v).includes("%") ? n : n;
}

function normalizeWbs_(wbs) {
  return String(wbs || "").replace(/\s+/g, "").replace(/[–—−]/g, "-").toUpperCase();
}

function hasText_(v) {
  return String(v || "").trim() !== "";
}

function isPass_(v) {
  const s = String(v || "").trim().toUpperCase();
  return s === "PASS" || s === "ผ่าน" || s === "YES";
}

function getProjectMasterMap_() {
  const values = getSheetValues_("PROJECT_MASTER");
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const wbs = normalizeWbs_(r[0]);
    if (!wbs) continue;
    map[wbs] = {
      wbs,
      projectDef: r[1] || "",
      level: r[2] || "",
      jobName: r[3] || "",
      sapFullStatus: r[4] || "",
      systemStatus: r[5] || "",
      userStatus: r[6] || "",
      owner: r[7] || "",
      startPlan: r[8] || "",
      startActual: r[9] || "",
      village: r[10] || "",
      moo: r[11] || "",
      tambon: r[12] || "",
      amphoe: r[13] || "",
      province: r[14] || "",
      qty: r[15] || ""
    };
  }
  return map;
}

function getActiveProjects_() {
  const values = getSheetValues_("ACTIVE_PROJECT");
  const pmMap = getProjectMasterMap_();
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const wbs = normalizeWbs_(r[0]);
    if (!wbs) continue;

    const pm = pmMap[wbs] || {};
    const systemStatus = r[2] || pm.systemStatus || "";
    const userStatus = pm.userStatus || r[24] || "";

    rows.push({
      wbs,
      jobName: r[1] || pm.jobName || "",
      systemStatus: systemStatus,
      userStatus: userStatus,
      owner: r[3] || pm.owner || "",
      workType: r[4] || "",
      province: r[5] || pm.province || "",
      year: r[6] || "",
      costPercent: r[7] || "",
      costStatus: r[8] || "",
      materialPercent: r[9] || "",
      materialStatus: r[10] || "",
      documentPercent: r[11] || "",
      documentStatus: r[12] || "",
      missingDocuments: r[13] || "",
      closureStatus: r[14] || "",
      mainIssue: r[15] || "",
      action: r[16] || "",
      priority: r[17] || "",
      overallScore: r[18] || "",
      timePercent: r[19] || "",
      timeStatus: r[20] || "",
      timeIssue: r[21] || "",
      readyToClose: r[22] || "",
      readyReason: r[23] || "",
      documentCount: r[24] || ""
    });
  }
  return rows;
}

function getDashboardData_() {
  const projects = getActiveProjects_();
  const d = {
    success: true,
    total: projects.length,
    ready: 0,
    notReady: 0,
    closed: 0,
    rel: 0,
    teco: 0,
    clsd: 0,
    docIssue: 0,
    materialIssue: 0,
    costIssue: 0,
    timeIssue: 0,
    costPass: 0,
    costFail: 0,
    materialPass: 0,
    materialFail: 0,
    documentPass: 0,
    documentFail: 0
  };

  projects.forEach(p => {
    const sys = String(p.systemStatus || "").toUpperCase();
    if (sys === "REL") d.rel++;
    if (sys === "TECO") d.teco++;
    if (sys === "CLSD") d.clsd++;

    const ready = String(p.readyToClose || "").toUpperCase() === "YES" || p.closureStatus === "พร้อมปิดงาน";
    if (ready) d.ready++; else d.notReady++;
    if (p.closureStatus === "ปิดแล้ว" || sys === "CLSD") d.closed++;

    if (isPass_(p.costStatus)) d.costPass++; else { d.costFail++; d.costIssue++; }
    if (isPass_(p.materialStatus)) d.materialPass++; else { d.materialFail++; d.materialIssue++; }
    if (isPass_(p.documentStatus)) d.documentPass++; else { d.documentFail++; d.docIssue++; }
    if (p.timeStatus && String(p.timeStatus).toUpperCase() !== "ผ่าน" && String(p.timeStatus).toUpperCase() !== "PASS") d.timeIssue++;
  });

  return d;
}

function getProjectDetail_(wbs) {
  const key = normalizeWbs_(wbs);
  const projects = getActiveProjects_();
  const project = projects.find(p => normalizeWbs_(p.wbs) === key) || null;
  if (!project) return { success: false, message: "ไม่พบ WBS: " + wbs };
  return {
    success: true,
    project,
    cost: getCostDetail_(key),
    material: getMaterialDetail_(key),
    document: getDocumentDetail_(key),
    time: getTimeDetail_(key)
  };
}

function getWorkQueue_() {
  const values = getSheetValues_("WORK_QUEUE");
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!hasText_(r[1]) && !hasText_(r[0])) continue;
    rows.push({
      priority: r[0] || "",
      wbs: r[1] || "",
      jobName: r[2] || "",
      owner: r[3] || "",
      mainIssue: r[4] || "",
      action: r[5] || "",
      province: r[6] || "",
      status: r[7] || ""
    });
  }
  return rows;
}

function getAlertCenter_() {
  const values = getSheetValues_("ALERT_CENTER");
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!hasText_(r[2]) && !hasText_(r[0])) continue;
    rows.push({
      alertType: r[0] || "",
      priority: r[1] || "",
      wbs: r[2] || "",
      jobName: r[3] || "",
      owner: r[4] || "",
      issue: r[5] || "",
      action: r[6] || "",
      province: r[7] || "",
      status: r[8] || ""
    });
  }
  return rows;
}

function getCostDetail_(wbs) {
  const key = normalizeWbs_(wbs);
  const values = getSheetValues_("COST_AUDIT");
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (normalizeWbs_(r[0]) !== key) continue;
    const items = [
      { type: "ค่าแรง", plan: r[3] || "0", actual: r[4] || "0" },
      { type: "ค่าควบคุมงาน", plan: r[5] || "0", actual: r[6] || "0" },
      { type: "ค่าขนส่ง", plan: r[7] || "0", actual: r[8] || "0" },
      { type: "ค่าเบ็ดเตล็ด", plan: r[9] || "0", actual: r[10] || "0" }
    ].map(x => {
      const plan = toNumber_(x.plan);
      const actual = toNumber_(x.actual);
      const percent = plan ? (actual / plan) * 100 : 0;
      return Object.assign(x, {
        percent: percent.toFixed(2) + "%",
        diff: (actual - plan).toFixed(2),
        status: plan === 0 && actual === 0 ? "NO PLAN" : actual > plan ? "OVER" : "OK"
      });
    });

    return {
      success: true,
      wbs: key,
      jobName: r[1] || "",
      systemStatus: r[2] || "",
      siteCostPlan: r[11] || "",
      siteCostActual: r[12] || "",
      siteCostPercent: r[13] || "",
      costStatus: r[14] || "",
      costPass: r[16] || "",
      remark: r[17] || "",
      items
    };
  }
  return { success: false, message: "ไม่พบข้อมูล COST_AUDIT: " + key, items: [] };
}

function getMaterialDetail_(wbs) {
  const key = normalizeWbs_(wbs);
  const values = getSheetValues_("MATERIAL_RAW");
  const items = [];
  let totalRequired = 0;
  let totalIssued = 0;
  let pendingCount = 0;
  let pendingValue = 0;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (normalizeWbs_(r[0]) !== key) continue;

    const required = toNumber_(r[7]);
    const issued = toNumber_(r[8]);
    const price = toNumber_(r[9]);
    const pending = Math.max(required - issued, 0);
    const value = pending * price;

    totalRequired += required;
    totalIssued += issued;
    if (pending > 0) {
      pendingCount++;
      pendingValue += value;
    }

    items.push({
      wbs: r[0] || "",
      network: r[1] || "",
      materialCode: r[2] || "",
      materialName: r[3] || "",
      movement: r[4] || "",
      plant: r[5] || "",
      storage: r[6] || "",
      requiredQty: required,
      issuedQty: issued,
      pendingQty: pending,
      price: price,
      pendingValue: value,
      status: pending > 0 ? "PENDING" : "PASS"
    });
  }

  const percent = totalRequired ? (totalIssued / totalRequired) * 100 : 0;

  return {
    success: true,
    wbs: key,
    totalItems: items.length,
    totalRequired,
    totalIssued,
    materialPercent: percent.toFixed(2) + "%",
    pendingCount,
    pendingValue,
    items,
    pendingItems: items.filter(x => x.pendingQty > 0)
  };
}

function getDocumentDetail_(wbs) {
  const key = normalizeWbs_(wbs);
  const values = getSheetValues_("DOCUMENT_AUDIT");
  const items = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (normalizeWbs_(r[0]) !== key) continue;
    items.push({
      wbs: r[0] || "",
      jobName: r[1] || "",
      docCode: r[2] || "",
      category: r[3] || "",
      documentName: r[4] || "",
      status: r[5] || "",
      missingQty: r[6] || "",
      refNo: r[7] || "",
      remark: r[8] || "",
      importance: r[9] || "",
      required: r[10] || "",
      auditor: r[11] || "",
      auditDate: r[12] || "",
      documentPass: r[13] || "",
      score: r[14] || ""
    });
  }
  return {
    success: true,
    wbs: key,
    total: items.length,
    missing: items.filter(x => !isPass_(x.status) && String(x.status || "").trim() !== "ครบ").length,
    items,
    missingItems: items.filter(x => !isPass_(x.status) && String(x.status || "").trim() !== "ครบ")
  };
}

function getTimeDetail_(wbs) {
  const key = normalizeWbs_(wbs);
  const values = getSheetValues_("TIME_STATUS");
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (normalizeWbs_(r[0]) !== key) continue;
    return {
      success: true,
      wbs: key,
      jobName: r[1] || "",
      planTime: r[2] || "",
      actualTime: r[3] || "",
      timePercent: r[4] || "",
      timeStatus: r[5] || ""
    };
  }
  return { success: false, message: "ไม่พบข้อมูล TIME_STATUS: " + key };
}

function exportActiveProjectExcel() {
  const ss = getSs_();
  const sh = ss.getSheetByName("ACTIVE_PROJECT");
  if (!sh) throw new Error("ไม่พบชีท ACTIVE_PROJECT");

  const values = sh.getDataRange().getDisplayValues();
  const fileName = "PEA_CARS_ACTIVE_PROJECT_" + Utilities.formatDate(new Date(), TZ, "yyyyMMdd_HHmmss");
  const tempSs = SpreadsheetApp.create(fileName);
  const tempSh = tempSs.getSheets()[0];
  tempSh.setName("ACTIVE_PROJECT");
  tempSh.getRange(1, 1, values.length, values[0].length).setValues(values);
  tempSh.setFrozenRows(1);
  tempSh.autoResizeColumns(1, values[0].length);

  return {
    success: true,
    fileName: fileName + ".xlsx",
    url: "https://docs.google.com/spreadsheets/d/" + tempSs.getId() + "/export?format=xlsx"
  };
}

function exportDocumentPdf(wbs) {
  const detail = getDocumentDetail_(wbs);
  const project = (getActiveProjects_().find(p => normalizeWbs_(p.wbs) === normalizeWbs_(wbs)) || {});
  const fileName = "Checklist_" + normalizeWbs_(wbs) + "_" + Utilities.formatDate(new Date(), TZ, "yyyyMMdd_HHmmss");
  const tempSs = SpreadsheetApp.create(fileName);
  const sh = tempSs.getSheets()[0];
  sh.setName("Checklist");

  sh.getRange("A1:H1").merge().setValue("PEA CARS+ V3 Document Checklist").setFontWeight("bold").setFontSize(14);
  sh.getRange("A3").setValue("WBS"); sh.getRange("B3").setValue(project.wbs || wbs);
  sh.getRange("A4").setValue("ชื่องาน"); sh.getRange("B4").setValue(project.jobName || "");
  sh.getRange("A5").setValue("ผู้รับผิดชอบ"); sh.getRange("B5").setValue(project.owner || "");
  sh.getRange("A6").setValue("วันที่ส่งออก"); sh.getRange("B6").setValue(Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm"));

  const header = [["DocCode", "หมวด", "รายการเอกสาร", "สถานะ", "จำนวนขาด", "หมายเหตุ", "ความสำคัญ", "จำเป็น"]];
  sh.getRange(8, 1, 1, header[0].length).setValues(header).setFontWeight("bold").setBackground("#1f4e79").setFontColor("#ffffff");

  const rows = (detail.items || []).map(x => [
    x.docCode, x.category, x.documentName, x.status, x.missingQty, x.remark, x.importance, x.required
  ]);
  if (rows.length) sh.getRange(9, 1, rows.length, 8).setValues(rows);

  sh.setFrozenRows(8);
  sh.autoResizeColumns(1, 8);
  sh.getRange(1, 1, Math.max(rows.length + 8, 10), 8).setWrap(true).setVerticalAlignment("middle");

  const url = "https://docs.google.com/spreadsheets/d/" + tempSs.getId() + "/export?format=pdf&portrait=false&size=A4&fitw=true&sheetnames=false&printtitle=false&pagenumbers=true&gridlines=true&fzr=false";

  return {
    success: true,
    fileName: fileName + ".pdf",
    url
  };
}
