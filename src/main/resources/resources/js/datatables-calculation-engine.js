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
            // const visited = new Set();

            // GANTI Set visited dengan Object counter untuk deteksi loop
            const evalCount = {};

            while (queue.length > 0) {

                const fieldKey = queue.shift();

                const isWhitelistSection = DataTablesFactory.whitelistSection(fieldKey, this.FIELD_META);
                console.log("Whitelist Run Section: " + isWhitelistSection);

                let sectionKey = newRowData.activeSectionId;

                if (fieldKey.includes(".")) {
                    sectionKey = fieldKey.split('.')[0];
                }

                // if (!isWhitelistSection && sectionKey !== newRowData.activeSectionId) {
                //     visited.add(fieldKey);
                // }

                // SKIP jika tidak masuk kriteria whitelist / active section
                if (!isWhitelistSection && sectionKey !== newRowData.activeSectionId) {
                    continue; // Langsung skip, tidak perlu pakai visited.add
                }

                // if (visited.has(fieldKey)) continue;
                // visited.add(fieldKey);

                // CEGAH Infinite Loop (Maksimal 10x evaluasi per cycle untuk 1 field)
                evalCount[fieldKey] = (evalCount[fieldKey] || 0) + 1;
                if (evalCount[fieldKey] > 10) {
                    console.warn(`[Calculation Engine] Loop breaker triggered! Field ${fieldKey} dievaluasi lebih dari 10 kali dalam 1 siklus. Kalkulasi dihentikan untuk field ini.`);
                    continue;
                }

                const fieldId = DataTablesFactory.getCleanFieldId(fieldKey, this.FIELD_META);

                const result = await this.computeField(fieldKey, newRowData, token);

                console.log("Field ID: " + fieldId + ", Result: " + result);

                if (token !== this.calcToken) return null;

                // CEK APAKAH NILAI BERUBAH DARI SEBELUMNYA
                const isValueChanged = newRowData[fieldId] !== result;
                newRowData[fieldId] = result;

                // const children = this.fieldCalculateMap[fieldId] || [];
                // queue.push(...children);

                // Re-trigger anak-anaknya HANYA jika nilainya berubah, 
                // atau jika ini adalah evaluasi pertamanya.
                if (isValueChanged || evalCount[fieldKey] === 1) {
                    const children = this.fieldCalculateMap[fieldId] || [];
                    children.forEach(child => {
                        // Hindari menumpuk antrean duplikat di saat bersamaan
                        if (!queue.includes(child)) queue.push(child);
                    });
                }
            }

            return newRowData;
        },

        /* ================= INIT FIELD ================= */
        initFieldCalculateMap: function() {
            this.fieldCalculateMap = {};
            const reservedWords = new Set([
                "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
                "abs", "ceil", "floor", "round", "sqrt", "cbrt", "exp", "log", "log2", "log10",
                "pow", "min", "max", "sum", "avg", "count", "true", "false", "pi", "e"
            ]);

            Object.keys(this.FIELD_META).forEach(key => {
                const meta = this.FIELD_META[key];
                const calc = meta.calculationLoadBinder;
                if (!calc) return;

                let vars = (calc.variables || []).map(v => v.variableName);

                if (vars.length === 0 && calc.equation) {
                    const matches = calc.equation.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
                    vars = [...new Set(matches.filter(m => !reservedWords.has(m.toLowerCase())))];
                }

                vars.forEach(varKey => {
                    const cleanVarKey = DataTablesFactory.getCleanFieldId(varKey, this.FIELD_META);
                    [varKey, cleanVarKey].forEach(k => {
                        if (!k) return;
                        this.fieldCalculateMap[k] = this.fieldCalculateMap[k] || [];
                        if (!this.fieldCalculateMap[k].includes(key)) {
                            this.fieldCalculateMap[k].push(key);
                        }
                    });
                });
            });
        },

        /* ================= COMPUTATION ================= */
        async computeField(fieldKey, rowData, token) {
            console.log("Section: " + fieldKey);

            const meta = this.FIELD_META[fieldKey] || 
                         Object.values(this.FIELD_META).find(m => m && m.fieldId === fieldKey);
            if (!meta?.calculationLoadBinder) {
                const fieldId = DataTablesFactory.getCleanFieldId(fieldKey, this.FIELD_META);
                return rowData[fieldId] || 0;
            }

            const calc = meta.calculationLoadBinder;

            if (calc.useJsEquation === true || calc.useJsEquation === "true") {
                return this.computeLocal(calc, rowData);
            }

            const remoteResult = await this.computeRemote(fieldKey, calc, rowData, token);
            if (remoteResult !== null && remoteResult !== undefined && remoteResult !== 0 && remoteResult !== "0") {
                return remoteResult;
            }

            // Fallback to local computation if equation is present and remote returned 0/empty
            if (calc.equation) {
                const localResult = this.computeLocal(calc, rowData);
                if (localResult !== 0) {
                    return localResult;
                }
            }

            return remoteResult || 0;
        },

        /* ================= LOCAL JS ================= */
        computeLocal(calc, rowData) {
            let equation = calc.equation;
            if (!equation) return 0;

            console.log("Equation: " + equation);

            let vars = (calc.variables || []).map(v => v.variableName);
            if (vars.length === 0 && calc.equation) {
                const reservedWords = new Set([
                    "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
                    "abs", "ceil", "floor", "round", "sqrt", "cbrt", "exp", "log", "log2", "log10",
                    "pow", "min", "max", "sum", "avg", "count", "true", "false", "pi", "e"
                ]);
                const matches = calc.equation.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
                vars = [...new Set(matches.filter(m => !reservedWords.has(m.toLowerCase())))];
            }

            vars.forEach(varName => {
                const cleanName = DataTablesFactory.getCleanFieldId(varName, this.FIELD_META);
                const rawVal = rowData[varName] !== undefined ? rowData[varName] : rowData[cleanName];
                const value =
                    (DataTablesFactory?.normalizeNumber?.(
                        rawVal
                    ) ?? Number(rawVal) ?? 0);

                equation = equation.replace(
                    new RegExp("\\b" + varName + "\\b", "g"),
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

                // 1. Pass defined variables
                (calc.variables || []).forEach(v => {
                    const varName = v.variableName;
                    const cleanName = DataTablesFactory.getCleanFieldId(varName, this.FIELD_META);
                    const rawVal = rowData[varName] !== undefined ? rowData[varName] : rowData[cleanName];
                    const numVal = (DataTablesFactory?.normalizeNumber?.(rawVal) ?? Number(rawVal) ?? 0);
                    if (varName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
                        params[varName] = numVal;
                    }
                    if (cleanName && cleanName !== varName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleanName)) {
                        params[cleanName] = numVal;
                    }
                });

                // 2. Also extract from equation if variables was empty
                if (Object.keys(params).length === 0 && calc.equation) {
                    const matches = calc.equation.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
                    matches.forEach(m => {
                        const cleanName = DataTablesFactory.getCleanFieldId(m, this.FIELD_META);
                        const rawVal = rowData[m] !== undefined ? rowData[m] : rowData[cleanName];
                        if (rawVal !== undefined && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(m)) {
                            params[m] = (DataTablesFactory?.normalizeNumber?.(rawVal) ?? Number(rawVal) ?? 0);
                        }
                    });
                }

                // 3. Fallback pass other simple alphanumeric rowData keys (avoiding complex keys)
                Object.keys(rowData || {}).forEach(k => {
                    const cleanKey = DataTablesFactory.getCleanFieldId(k, this.FIELD_META);
                    if (cleanKey && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleanKey) && params[cleanKey] === undefined) {
                        params[cleanKey] = (DataTablesFactory?.normalizeNumber?.(rowData[k]) ?? rowData[k]);
                    }
                });

                const ajaxUrl = this.CALCULATION_URL.startsWith(this.BASE_URL)
                    ? `${this.CALCULATION_URL}?action=calculate`
                    : `${this.BASE_URL}${this.CALCULATION_URL}?action=calculate`;

                $.ajax({
                    url: ajaxUrl,
                    type: 'POST',
                    contentType: 'application/json',
                    dataType: 'json',
                    data: JSON.stringify({
                        formDefId: this.formDefId,
                        fieldId: fieldId,
                        primaryKey: rowData.id,
                        requestParams: params
                    }),
                    success: (res) => {
                        if (token !== this.calcToken) return;
                        if (typeof res === 'string') {
                            try { res = JSON.parse(res); } catch (e) {}
                        }
                        const val = res?.value ?? res?.mask_value ?? 0;
                        resolve(val);
                    },
                    error: (err) => {
                        console.error("Calculation remote error:", err);
                        // Fallback to local computation if equation is present
                        if (calc.equation) {
                            try {
                                const localVal = this.computeLocal(calc, rowData);
                                resolve(localVal);
                                return;
                            } catch (e) {}
                        }
                        resolve(0);
                    }
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
