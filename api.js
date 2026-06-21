/* =====================================================
   PEA CARS+ V4 Professional
   api.js
===================================================== */

class CarsAPI {

    // ======================
    // JSONP Request
    // ======================
    static request(action, params = {}) {

        return new Promise((resolve, reject) => {

            const callbackName =
                'jsonp_callback_' + Math.round(Math.random() * 1000000);

            params.action = action;
            params.callback = callbackName;

            const queryString = new URLSearchParams(params).toString();

            const script = document.createElement('script');

            script.src =
                CONFIG.API_URL + '?' + queryString;

            window[callbackName] = function (data) {

                resolve(data);

                delete window[callbackName];

                document.body.removeChild(script);

            };

            script.onerror = function () {

                reject(new Error("Failed to fetch"));

                delete window[callbackName];

            };

            document.body.appendChild(script);

        });

    }



    // ===================================
    // Dashboard
    // ===================================

    static async getDashboard() {

        return await this.request('dashboard');

    }


    // ===================================
    // Projects
    // ===================================

    static async getProjects() {

        return await this.request('projects');

    }


    // ===================================
    // Project Detail
    // ===================================

    static async getProjectDetail(wbs) {

        return await this.request('projectdetail', {

            wbs: wbs

        });

    }


    // ===================================
    // Work Queue
    // ===================================

    static async getWorkQueue() {

        return await this.request('workqueue');

    }


    // ===================================
    // Alert Center
    // ===================================

    static async getAlertCenter() {

        return await this.request('alerts');

    }


    // ===================================
    // Cost Detail
    // ===================================

    static async getCostDetail(wbs) {

        return await this.request('costdetail', {

            wbs: wbs

        });

    }


    // ===================================
    // Material Detail
    // ===================================

    static async getMaterialDetail(wbs) {

        return await this.request('materialdetail', {

            wbs: wbs

        });

    }


    // ===================================
    // Document Detail
    // ===================================

    static async getDocumentDetail(wbs) {

        return await this.request('documentdetail', {

            wbs: wbs

        });

    }


    // ===================================
    // Time Detail
    // ===================================

    static async getTimeDetail(wbs) {

        return await this.request('timedetail', {

            wbs: wbs

        });

    }


    // ===================================
    // Export Excel
    // ===================================

    static async exportExcel() {

        return await this.request('exportexcel');

    }


    // ===================================
    // Export PDF
    // ===================================

    static async exportPdf(wbs) {

        return await this.request('exportpdf', {

            wbs: wbs

        });

    }

}
