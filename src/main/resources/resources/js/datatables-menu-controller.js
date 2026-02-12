/**
 * DataTables Controller
 * @author: tiyojati (Refactored)
 */
(function() {
    if (window.DataTablesMenuController) return;

    window.DataTablesMenuController = {
        /* ================= STATE ================= */
        table: null,
        FIELD_META: null,
        BASE_URL: null,
        ADD_FORM_URL: null,
        EDIT_FORM_URL: null,
        CALCULATION_URL: null,
        SUBMIT_TASK_URL: null,

        editable: false,
        userId: null,
        createFormDefId: null,
        editFormDefId: null,
        jsonForm: null,
        nonce: null,

        editingCell: null,
        originalRowData: null,
        calculatedRowData: null,
        isSaving: false,
        fieldCalculateMap: null,

        appId: null,
        appVersion: null,

        calcToken: 0,

        /* ================= INIT ================= */
        init: function(opts) {
            Object.assign(this, {
                table: opts.table,
                FIELD_META: opts.fieldMeta,
                BASE_URL: opts.baseUrl,
                ADD_FORM_URL: opts.addFormUrl,
                EDIT_FORM_URL: opts.editFormUrl,
                CALCULATION_URL: opts.calculationUrl,
                SUBMIT_TASK_URL: opts.submitTaskUrl,
                editable: opts.editable,
                userId: opts.userId,
                createFormDefId: opts.createFormDefId,
                editFormDefId: opts.editFormDefId,
                jsonForm: opts.jsonForm,
                nonce: opts.nonce,
                appId: opts.appId,
                appVersion: opts.appVersion
            });

            this.fieldCalcMap();
            this.validateDependencyGraph();

            this.bindEvents();
            this.bindEmptyState();
        },

        /* ================= EMPTY STATE ================= */
        toggleEmptyState: function(options) {
            const opts = $.extend({
                show: false,
                title: 'No Data Found',
                description: 'Nothing found to display',
                icon: '📭'
            }, options);

            if (!this.table) return;

            const tableNode = $(this.table.table().node());
            let $empty = $('#dt-empty-state');

            if ($empty.length === 0) {
                $empty = $('<div id="dt-empty-state" class="dt-empty-state"></div>').hide();
                tableNode.before($empty);
            }

            if (opts.show) {
                $empty.html(`
                    <div class="dt-empty-box">
                        <div class="dt-empty-icon">${opts.icon}</div>
                        <div class="dt-empty-title">${opts.title}</div>
                        <div class="dt-empty-desc">${opts.description}</div>
                    </div>
                `).show();
                tableNode.hide();
            } else {
                $empty.hide();
                tableNode.show();
            }
        },

        bindEmptyState: function() {
            if (!this.table) return;

            this.table.on('xhr.dt', (e, settings, json) => {
                const data = json && Array.isArray(json.data) ? json.data : [];
                this.toggleEmptyState({
                    show: data.length === 0
                });
            });

            this.table.on('draw.dt', () => {
                const count = this.table.rows({
                    filter: 'applied'
                }).data().length;
                this.toggleEmptyState({
                    show: count === 0
                });
            });
        },

        /* ================= EVENTS ================= */
        bindEvents: function() {
            const $body = $('body');
            const $table = $('#inlineTable');
            const self = this;

            // Cell interaction
            $table.find('tbody')
                .on('click', 'td[data-field]', (e) => this.onCellClick($(e.currentTarget)))
                .on('click', '.dt-row-delete', (e) => {
                    e.stopPropagation();
                    this.onDelete($(e.currentTarget).closest('tr'));
                });

            // Editor controls
            $(document).on('keydown', '.cell-editor', (e) => {
                const keys = {
                    Enter: () => {
                        e.preventDefault();
                        this.save();
                    },
                    Tab: () => {
                        e.preventDefault();
                        this.save();
                    },
                    Escape: () => {
                        e.preventDefault();
                        this.cancel();
                    }
                };
                if (keys[e.key]) keys[e.key]();
            });

            // Click outside to cancel
            $(document).on('mousedown', (e) => {
                if (!this.editingCell || this.isSaving) return;
                if (!$(e.target).closest('.cell-editor, td').length) this.cancel();
            });

            $(document).on('click', '#btnAddRow', () => this.openAddForm());

            // Workflow actions
            $table.on('change', '.dt-action-select', function(e) {
                $(this).toggleClass('selected', !!this.value);
            });

            $table.on('click', '.dt-action-submit', (e) => {
                const $wrapper = $(e.currentTarget).closest('.dt-action-wrapper');
                this.submitTask($wrapper.data('activity-id'), $wrapper.find('.dt-action-select').val());
            });

            // Autofill select handler
            $(document).on('change', '.cell-editor', (e) => {
                const $editor = $(e.currentTarget);
                const $cell = $editor.closest('td');
                const meta = $cell.data('meta');

                if (meta?.autofillLoadBinder && meta.type === 'select') {
                    this.handleAutofill($cell, $editor.val(), meta);
                }
            });
        },

        /* ================= INLINE EDIT ================= */
        onCellClick: function($cell) {
            if (!this.editable || this.editingCell || this.isSaving) return;

            const field = $cell.data('field');
            const meta = this.FIELD_META[field];

            if (!meta || meta.readonly || meta.calculationLoadBinder || meta.isHidden) return;

            const row = this.table.row($cell.closest('tr'));
            this.originalRowData = $.extend(true, {}, row.data());
            this.editingCell = $cell;

            $cell.addClass('editing')
                .data('meta', meta)
                .empty()
                .append(this.buildEditor(meta.type, $cell.attr('data-value'), meta))
                .find('.cell-editor')
                .focus();
        },

        save: function() {
            const self = this;
            if (!this.editingCell || this.isSaving) return;

            const newValue = this.editingCell.find('.cell-editor').val();

            this.isSaving = true;

            this.triggerCalculate()
                .then(function() {
                    if (newValue === self.editingCell.attr('data-value')) {
                        self.resetState();
                        showToast('No changes detected', 'info');
                        return;
                    }

                    self.doSave(newValue);
                })
                .catch(function(err) {
                    console.error("Gagal saat kalkulasi:", err);
                    showToast('Error calculation', 'error');
                    self.resetState();
                });
        },

        doSave: function(newValue) {
            this.isSaving = true;
            const self = this;
            
            const $cell = this.editingCell;
            const field = $cell.data('field');
            const id = $cell.data('id');
            const meta = $cell.data('meta');
            const formId = meta.isSubForm ? meta.formDefId : this.editFormDefId;

            const row = this.table.row($cell.closest('tr'));
            const rowData = self.calculatedRowData ?
                $.extend({}, self.calculatedRowData) :
                $.extend({}, row.data());
            let saveValue = (meta.type === 'date') ? DataTablesFactory.ensureDateString(newValue) : newValue;
            rowData[field] = saveValue;

            const body = {
                id: id
            };
            Object.keys(this.FIELD_META).forEach(f => {
                if (rowData[f] != null) {
                    const m = this.FIELD_META[f] || {};
                    body[f] = (m.type === 'date') ? DataTablesFactory.ensureDateString(rowData[f]) : rowData[f];
                }
            });

            $.ajax({
                url: `${this.BASE_URL}${this.EDIT_FORM_URL}${formId}`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(body),
                success: () => {
                    Object.keys(body).forEach(([field, value]) => {
                        const fm = self.FIELD_META[field];
                        const commitValue = (fm && fm.type === 'date') ? newValue : value;
                        this.commitRowChange(field, commitValue);
                    });
                    this.calculatedRowData = null;
                    this.applyValue($cell, newValue, meta);
                    $cell.addClass('saved');
                    showToast('Changes saved successfully', 'success');
                    this.resetState();
                },
                error: () => {
                    this.restoreRow();
                    showToast('Failed to save changes', 'error');
                },
                complete: () => {
                    this.isSaving = false;
                }
            });
        },

        commitRowChange: function(field, value) {
            const row = this.table.row(this.editingCell.closest('tr'));
            const data = row.data();
            const meta = this.FIELD_META[field];
            let commitValue = value;

            if (meta) {
                if (meta.type === 'select') {
                    const opt = (meta.options || []).find(o => o.value === value);
                    if (opt) commitValue = opt.label;
                }
                if (meta.formatter || meta.type === 'number') {
                    commitValue = DataTablesFactory.normalizeNumber(value, meta);
                }
            }

            data[field] = commitValue;
            row.data(data).invalidate();
        },

        cancel: function() {
            if (!this.editingCell || this.isSaving) return;
            this.restoreRow();
            showToast('Edit cancelled', 'info');
        },

        restoreRow: function() {
            const row = this.table.row(this.editingCell.closest('tr'));
            row.data(this.originalRowData);

            Object.keys(this.FIELD_META).forEach(f => {
                const meta = this.FIELD_META[f];
                if (meta.isHidden) return;
                const cell = this.findCellByField(f, row);
                if (cell) this.applyValue(cell, this.originalRowData[f], meta);
            });

            this.resetState();
        },

        resetState: function() {
            this.editingCell = null;
            this.originalRowData = null;
            this.isSaving = false;
        },

        /* ================= DELETE ================= */
        onDelete: function(row) {
            if (!this.editable || this.isSaving) return;

            const data = this.table.row(row).data();
            if (!data?.id) return;

            showConfirm({
                    title: 'Delete Confirmation',
                    message: 'Are you sure you want to delete this record?'
                },
                () => this.doDelete(data.id, row),
                () => showToast('Delete cancelled', 'info'));
        },

        doDelete: function(id, row) {
            this.isSaving = true;
            $.ajax({
                url: `${this.BASE_URL}${this.EDIT_FORM_URL}${this.createFormDefId}/${id}`,
                type: 'DELETE',
                success: () => {
                    this.table.row(row).remove().draw(false);
                    this.toggleEmptyState({
                        show: this.table.rows().data().length === 0
                    });
                    showToast('Record deleted successfully', 'success');
                },
                error: () => showToast('Failed to delete record', 'error'),
                complete: () => {
                    this.isSaving = false;
                }
            });
        },

        /* ================= POPUP / ADD ================= */
        openAddForm: function() {
            if (!this.createFormDefId) return;

            const args = {
                frameId: 'Frame_' + this.createFormDefId
            };
            const formUrl = this.BASE_URL + this.ADD_FORM_URL + UI.userviewThemeParams();
            const params = {
                _json: this.jsonForm,
                _callback: 'DataTablesMenuController.onSubmitted',
                _setting: JSON.stringify(args).replace(/"/g, "'"),
                _jsonrow: JSON.stringify({}),
                _nonce: this.nonce
            };

            JPopup.show(args.frameId, formUrl, params, '', 900, 800);
        },

        onSubmitted: function(args) {
            try {
                JPopup.hide(args.frameId);
            } catch (e) {}
            if (this.table) this.table.ajax.reload(null, false);
            showToast('Data added successfully', 'success');
        },

        /* ================= UI HELPERS ================= */
        applyValue: function($cell, value, meta) {
            let text = value;
            if (meta.type === 'select') {
                const opt = (meta.options || []).find(o => o.value === value);
                text = opt ? opt.label : value;
            } else if (meta.formatter) {
                text = DataTablesFactory.formatNumber(value, meta);
            }

            $cell.attr('data-value', value).html(text).removeClass('editing');
        },

        buildEditor: function(type, value, meta) {
            const val = value ?? '';
            const $editor = (() => {
                switch (type) {
                    case 'textarea':
                        return $('<textarea/>');
                    case 'select':
                        const $sel = $('<select/>');
                        (meta.options || []).forEach(o => $sel.append($('<option/>').val(o.value).text(o.label)));
                        return $sel;
                    case 'number':
                        return $('<input type="number"/>');
                    case 'date':
                        return $('<input type="date"/>');
                    default:
                        return $('<input type="text"/>');
                }
            })();
            return $editor.addClass('cell-editor').val(val);
        },

        /* ================= CALCULATION ================= */
        fieldCalcMap: function() {
            const map = {};
            Object.entries(this.FIELD_META).forEach(([field, meta]) => {
                const vars = meta.calculationLoadBinder?.variables;
                if (vars) {
                    vars.forEach(v => {
                        map[v.variableName] = map[v.variableName] || [];
                        map[v.variableName].push(field);
                    });
                }
            });
            this.fieldCalculateMap = map;
        },

        validateDependencyGraph: function () {
            const graph = {};

            // Build forward graph
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

        triggerCalculate: async function () {
            if (!this.editingCell) return;

            const token = ++this.calcToken;

            const $row = this.editingCell.closest('tr');
            const row = this.table.row($row);

            let rowData = structuredClone(row.data());

            const editedField = this.editingCell.data('field');
            const newValue = this.editingCell.find('.cell-editor').val();
            rowData[editedField] = newValue;

            const queue = (this.fieldCalculateMap[editedField] || []).slice();
            const visited = new Set();

            while (queue.length > 0) {
                const field = queue.shift();

                if (visited.has(field)) continue;
                visited.add(field);

                const result = await this.computeField(field, rowData, token);
                if (token !== this.calcToken) return;

                rowData[field] = result;

                const children = this.fieldCalculateMap[field] || [];
                queue.push(...children);
            }

            this.calculatedRowData = rowData;
            row.data(rowData).invalidate();
        },

        computeField: function (fieldId, rowData, token) {
            const meta = this.FIELD_META[fieldId];
            if (!meta?.calculationLoadBinder) {
                return Promise.resolve(rowData[fieldId] || 0);
            }

            const calc = meta.calculationLoadBinder;

            if (calc.useJsEquation === true || calc.useJsEquation === "true") {
                return Promise.resolve(this.computeLocal(calc, rowData));
            }

            return this.computeRemote(fieldId, calc, rowData, token);
        },

        computeLocal: function (calc, rowData) {
            let equation = calc.equation;

            (calc.variables || []).forEach(v => {
                const val = DataTablesFactory.normalizeNumber(rowData[v.variableName]) || 0;
                equation = equation.replace(
                    new RegExp("\\b" + v.variableName + "\\b", "g"),
                    val
                );
            });

            try {
                let result = Function('"use strict"; return (' + equation + ')')();

                if (calc.roundNumber?.isRoundNumber === "true") {
                    result = this.applyAdvancedRounding(result, calc.roundNumber);
                }

                return isFinite(result) ? result : 0;
            } catch (e) {
                console.error("Local calc error:", e);
                return 0;
            }
        },

        computeRemote: function (fieldId, calc, rowData, token) {
            return new Promise((resolve) => {

                const params = {};
                (calc.variables || []).forEach(v => {
                    params[v.variableName] =
                        DataTablesFactory.normalizeNumber(rowData[v.variableName]) || 0;
                });

                $.ajax({
                    url: `${this.BASE_URL}${this.CALCULATION_URL}?action=calculate`,
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        formDefId: this.editFormDefId,
                        fieldId: fieldId,
                        primaryKey: rowData.id,
                        requestParams: params
                    }),
                    success: (res) => {
                        if (token !== this.calcToken) return;
                        resolve(res?.value ?? 0);
                    },
                    error: () => {
                        resolve(0);
                    }
                });
            });
        },

        applyAdvancedRounding: function(value, cfg) {
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
                    rounded = Math.round((tempValue + Number.EPSILON) * 100) / 100;
                    rounded = Math.round(tempValue);
                    break;

                default:
                    rounded = tempValue;
                    break;
            }

            return rounded / factor;
        },

        /* ================= WORKFLOW ================= */
        submitTask: function(activityId, actionValue) {
            if (!activityId || !actionValue) {
                alert(activityId ? 'Please select an action first' : 'Activity ID not found');
                return;
            }

            const formData = new FormData();
            formData.append('status', actionValue);

            $.ajax({
                url: `${this.BASE_URL}${this.SUBMIT_TASK_URL}${activityId}?loginAs=${this.userId}`,
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: (res) => {
                    if (res?.message === 'Success') {
                        showToast('Submit data successfully', 'success');
                        this.table?.ajax.reload(null, false);
                    } else {
                        showToast('Failed to submit action', 'error');
                    }
                },
                error: () => showToast('Failed to submit data', 'error')
            });
        },

        findCellByField: function(field, row) {
            const node = row?.node();
            if (!node) return null;
            const $cell = $(node).find(`td[data-field="${field}"]`);
            return $cell.length ? $cell : null;
        },

        handleAutofill: function($cell, selectedValue, meta) {
            const autofill = meta.autofillLoadBinder;
            if (!autofill) return;

            const serviceUrl = autofill.serviceUrl;
            if (!serviceUrl) return;

            const $row = this.table.row($cell.closest('tr'));
            const rowData = $.extend({}, $row.data());

            const payload = {
                appId: this.jsonForm?.properties?.appId,
                appVersion: this.jsonForm?.properties?.appVersion,
                id: selectedValue,
                FIELD_ID: $cell.data('field'),
                FORM_ID: meta.isSubForm ? meta.formDefId : this.editFormDefId,
                SECTION_ID: meta.sectionId,
                requestParameter: {}
            };

            $.ajax({
                url: serviceUrl,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(payload),
                success: (res) => {
                    if (!res || typeof res !== 'object') return;

                    (autofill.fields || []).forEach(map => {
                        const targetField = map.formField;
                        const sourceKey = map.resultField;

                        if (!(sourceKey in res)) return;

                        const value = res[sourceKey];
                        const targetMeta = this.FIELD_META[targetField];
                        if (!targetMeta) return;

                        rowData[targetField] = value;

                        const cell = this.findCellByField(targetField, $row);
                        if (cell && !cell.hasClass('editing')) {
                            this.applyValue(cell, value, targetMeta);
                        }
                    });

                    $row.data(rowData).invalidate();
                },
                error: (err) => {
                    console.error('Autofill failed', err);
                }
            });
        }
    };
})();