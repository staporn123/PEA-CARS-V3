/* =====================================================
   PEA CARS+ V5.5.4B
   File: api.js
   Purpose: เชื่อม GitHub Pages กับ Apps Script API ด้วย JSONP
   Note: script.js ใช้ apiAction() เป็นหลัก แต่เก็บ CarsAPI ไว้เป็น utility/compatibility
===================================================== */

class CarsAPI {
  static request(action, params = {}, options = {}) {
    return new Promise((resolve, reject) => {
      if (typeof CONFIG === "undefined" || !CONFIG.API_URL) {
        reject(new Error("ไม่พบ CONFIG.API_URL ใน config.js"));
        return;
      }

      const callbackName =
        "peaCarsJsonp_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);

      const query = {
        action: action,
        callback: callbackName,
        _t: Date.now(),
        ...params
      };

      const queryString = new URLSearchParams(query).toString();
      const script = document.createElement("script");

      const baseTimeout = Number(CONFIG.API_TIMEOUT || 30000) || 30000;
      const timeout = Number(options.timeout || baseTimeout) || baseTimeout;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("API Timeout: " + action));
      }, timeout);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callbackName]; } catch (err) { window[callbackName] = undefined; }

        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function (data) {
        cleanup();

        if (data && data.success === false) {
          reject(new Error(data.message || "API Error"));
          return;
        }

        resolve(data);
      };

      script.onerror = function () {
        cleanup();
        reject(new Error("โหลดข้อมูลไม่สำเร็จ: " + action));
      };

      script.src = CONFIG.API_URL + "?" + queryString;
      document.body.appendChild(script);
    });
  }

  static async requestWithRetry(action, params = {}, options = {}) {
    const retryCount = Number(options.retryCount || CONFIG.API_RETRY_COUNT || 3) || 3;
    const delays = options.delays || [0, 1800, 4200];
    let lastError = null;

    for (let i = 0; i < retryCount; i++) {
      if (delays[i]) {
        await new Promise(resolve => setTimeout(resolve, delays[i]));
      }
      try {
        return await this.request(action, params, options);
      } catch (err) {
        lastError = err;
        console.warn("CarsAPI retry failed", action, i + 1, err);
      }
    }

    throw lastError || new Error("API Timeout: " + action);
  }

  static getInit() { return this.requestWithRetry("init"); }
  static getDashboard() { return this.request("dashboard"); }
  static getProjects() { return this.request("projects"); }
  static getProjectDetail(wbs) { return this.request("projectdetail", { wbs }); }
  static getWorkQueue() { return this.request("workqueue"); }
  static getAlertCenter() { return this.request("alerts"); }
  static getCostDetail(wbs) { return this.request("costdetail", { wbs }); }
  static getMaterialDetail(wbs) { return this.request("materialdetail", { wbs }); }
  static getDocumentDetail(wbs) { return this.request("documentdetail", { wbs }); }
  static getTimeDetail(wbs) { return this.request("timedetail", { wbs }); }
  static getTimelineDetail(wbs) { return this.request("timelinedetail", { wbs }); }
  static getMaterialWaiting() { return this.request("materialwaiting"); }
  static getLastUpdate() { return this.request("lastupdate"); }
  static exportExcel() { return this.request("exportexcel"); }
  static exportPdf(wbs) { return this.request("exportpdf", { wbs }); }
  static analyzeProjectAI(wbs) { return this.requestWithRetry("assistant", { wbs }); }
  static ping() { return this.request("ping"); }
  static saveChecklist(items) {
    return this.requestWithRetry("savechecklist", {
      items: JSON.stringify(items)
    }, { retryCount: 2 });
  }
}

if (typeof window !== "undefined") {
  window.CarsAPI = CarsAPI;
}
