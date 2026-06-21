/* =====================================================
   PEA CARS+ V4 Professional
   File: api.js
   Purpose: เชื่อม GitHub Pages กับ Apps Script API ด้วย JSONP
===================================================== */

class CarsAPI {
  static request(action, params = {}) {
    return new Promise((resolve, reject) => {
      if (typeof API_URL === "undefined" || !API_URL) {
        reject(new Error("ไม่พบ API_URL ใน config.js"));
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

      let timer = setTimeout(() => {
        cleanup();
        reject(new Error("API Timeout"));
      }, typeof API_CONFIG !== "undefined" ? API_CONFIG.timeout : 30000);

      function cleanup() {
        clearTimeout(timer);
        delete window[callbackName];

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
        reject(new Error("โหลดข้อมูลไม่สำเร็จ"));
      };

      script.src = API_URL + "?" + queryString;
      document.body.appendChild(script);
    });
  }

  static getDashboard() {
    return this.request("dashboard");
  }

  static getProjects() {
    return this.request("projects");
  }

  static getProjectDetail(wbs) {
    return this.request("projectdetail", { wbs });
  }

  static getWorkQueue() {
    return this.request("workqueue");
  }

  static getAlertCenter() {
    return this.request("alerts");
  }

  static getCostDetail(wbs) {
    return this.request("costdetail", { wbs });
  }

  static getMaterialDetail(wbs) {
    return this.request("materialdetail", { wbs });
  }

  static getDocumentDetail(wbs) {
    return this.request("documentdetail", { wbs });
  }

  static getTimeDetail(wbs) {
    return this.request("timedetail", { wbs });
  }

  static exportExcel() {
    return this.request("exportexcel");
  }

  static exportPdf(wbs) {
    return this.request("exportpdf", { wbs });
  }

  static ping() {
    return this.request("ping");
  }
}
