(function () {

    if (window.DataTablesCalculationEngine) return;

    window.DataTablesCalculationEngine = {

        /* ================= STATE ================= */

        FIELD_META: {},
        fieldCalculateMap: {},
        BASE_URL: "",
        CALCULATION_URL: "",
        formDefId: "",
        calcToken: 0,

        /* ================= INIT ================= */

        init(config) {
            this.FIELD_META = config.fieldMeta || {};
            this.initFieldCalculateMap();
            this.validateDependencyGraph();
            this.BASE_URL = config.baseUrl || "";
            this.CALCULATION_URL = config.calculationUrl || "";
            this.formDefId = config.formDefId || "";

        },

        /* ================= MAIN ENTRY ================= */

        async run({ editedField, rowData, newValue }) {

            const token = ++this.calcToken;

            let newRowData = structuredClone(rowData || {});

            if (typeof newValue !== "undefined") {
                newRowData[editedField] = newValue;
            }

            const queue = (this.fieldCalculateMap[editedField] || []).slice();
            const visited = new Set();

            while (queue.length > 0) {

                const fieldKey = queue.shift();
                if (visited.has(fieldKey)) continue;
                visited.add(fieldKey);

                const fieldId = DataTablesFactory.getCleanFieldId(fieldKey, this.FIELD_META);

                const result = await this.computeField(fieldKey, newRowData, token);

                if (token !== this.calcToken) return null;

                newRowData[fieldId] = result;

                const children = this.fieldCalculateMap[fieldId] || [];
                queue.push(...children);
            }

            return newRowData;
        },

        /* ================= INIT FIELD ================= */
        initFieldCalculateMap: function() {
            this.fieldCalculateMap = {};
            Object.keys(this.FIELD_META).forEach(key => {
                const meta = this.FIELD_META[key];
                const calc = meta.calculationLoadBinder;
                if (calc?.variables) {
                    calc.variables.forEach(v => {
                        const varKey = v.variableName;
                        this.fieldCalculateMap[varKey] = this.fieldCalculateMap[varKey] || [];
                        if (!this.fieldCalculateMap[varKey].includes(key)) {
                            this.fieldCalculateMap[varKey].push(key);
                        }
                    });
                }
            });
        },

        /* ================= COMPUTATION ================= */
        async computeField(fieldKey, rowData, token) {

            const meta = this.FIELD_META[fieldKey];
            if (!meta?.calculationLoadBinder) {
                const fieldId = this.cleanFieldId(fieldKey);
                return rowData[fieldId] || 0;
            }

            const calc = meta.calculationLoadBinder;

            if (calc.useJsEquation === true || calc.useJsEquation === "true") {
                return this.computeLocal(calc, rowData);
            }

            return this.computeRemote(fieldKey, calc, rowData, token);
        },

        /* ================= LOCAL JS ================= */
        computeLocal(calc, rowData) {

            let equation = calc.equation;

            (calc.variables || []).forEach(v => {

                const value =
                    (DataTablesFactory?.normalizeNumber?.(
                        rowData[v.variableName]
                    ) ?? Number(rowData[v.variableName]) ?? 0);

                equation = equation.replace(
                    new RegExp("\\b" + v.variableName + "\\b", "g"),
                    value
                );
            });

            try {
                let result = Function('"use strict"; return (' + equation + ')')();

                if (!isFinite(result) || isNaN(result)) {
                    result = 0;
                }

                if (calc.roundNumber?.isRoundNumber === true ||
                    calc.roundNumber?.isRoundNumber === "true") {

                    result = this.applyRounding(result, calc.roundNumber);
                }

                return result;

            } catch (e) {
                console.error("Local calculation error:", e);
                return 0;
            }
        },

        /* ================= REMOTE AJAX ================= */
        computeRemote(fieldKey, calc, rowData, token) {
            const fieldId = DataTablesFactory.getCleanFieldId(fieldKey, this.FIELD_META);

            return new Promise((resolve) => {
                const params = {};

                (calc.variables || []).forEach(v => {
                    params[v.variableName] =
                        (DataTablesFactory?.normalizeNumber?.(
                            rowData[v.variableName]
                        ) ?? Number(rowData[v.variableName]) ?? 0);
                });

                $.ajax({
                    url: `${this.BASE_URL}${this.CALCULATION_URL}?action=calculate`,
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        formDefId: this.formDefId,
                        fieldId: fieldId,
                        primaryKey: rowData.id,
                        requestParams: params
                    }),
                    success: (res) => {
                        if (token !== this.calcToken) return;
                        resolve(res?.value ?? 0);
                    },
                    error: () => resolve(0)
                });
            });
        },

        /* ================= ROUNDING ================= */
        applyRounding(value, cfg) {

            const decimals = parseInt(cfg.decimalPlaces || 0);
            const factor = Math.pow(10, decimals);
            const tempValue = value * factor;

            let rounded;

            switch (cfg.roundingMode) {
                case "round_down":
                    rounded = Math.floor(tempValue);
                    break;
                case "round_up":
                    rounded = Math.ceil(tempValue);
                    break;
                case "round_half_up":
                    rounded = Math.round(tempValue);
                    break;
                default:
                    rounded = tempValue;
            }

            return rounded / factor;
        },

        /* ================= HELPERS ================= */
        validateDependencyGraph: function () {
            const graph = {};

            Object.keys(this.FIELD_META).forEach(field => {
                const meta = this.FIELD_META[field];
                const vars = meta?.calculationLoadBinder?.variables || [];

                graph[field] = vars.map(v => v.variableName);
            });

            const visited = {};
            const stack = {};

            const hasCycle = (node) => {
                if (!visited[node]) {
                    visited[node] = true;
                    stack[node] = true;

                    for (const neighbor of (graph[node] || [])) {
                        if (!visited[neighbor] && hasCycle(neighbor)) {
                            return true;
                        } else if (stack[neighbor]) {
                            return true;
                        }
                    }
                }
                stack[node] = false;
                return false;
            };

            for (const field in graph) {
                if (hasCycle(field)) {
                    console.error("Circular dependency detected in calculation:", field);
                    alert("Circular calculation detected. Please fix field configuration.");
                }
            }

            console.log("Dependency graph validated. No circular reference.");
        },

    };

})();
