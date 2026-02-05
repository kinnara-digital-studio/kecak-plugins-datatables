/**
 * DataTables Controller
 * @author: tiyojati (Final Refactored)
 */
(function () {
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
        controlFields: [],

        appId: null,
        appVersion: null,

        /* ================= INIT ================= */
        init: function (opts) {
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
                appId:  opts.appId,
                appVersion: opts.appVersion,
                controlFields: window.DataTablesFactory ? DataTablesFactory.getControlFields(this.FIELD_META) : []
            });

            this.fieldCalcMap();
            this.bindEvents();
            this.bindEmptyState();
        },

        /* ================= LOOKUP STRATEGY ================= */
        getMetaForField: function (field, rowData) {
            if (!this.FIELD_META) return null;
            const activeSection = rowData?.activeSectionId;
            const compositeKey = activeSection ? `${activeSection}_${field}` : field;

            return this.FIELD_META[compositeKey] ||
                   this.FIELD_META[field] ||
                   Object.values(this.FIELD_META).find(m => m && (m.fieldId === field && m.type !== 'section'));
        },

        /* ================= EMPTY STATE ================= */
        toggleEmptyState: function (options) {
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

        bindEmptyState: function () {
            if (!this.table) return;

            this.table.on('xhr.dt', (e, settings, json) => {
                const data = json && Array.isArray(json.data) ? json.data : [];
                this.toggleEmptyState({ show: data.length === 0 });
            });

            this.table.on('draw.dt', () => {
                const count = this.table.rows({ filter: 'applied' }).data().length;
                this.toggleEmptyState({ show: count === 0 });
            });
        },

        /* ================= EVENTS ================= */
        bindEvents: function () {
            const $table = $('#inlineTable');

            // Cell interaction
            $table.find('tbody')
                .on('click', 'td[data-field]', (e) => this.onCellClick($(e.currentTarget)))
                .on('click', '.dt-row-delete', (e) => {
                    e.stopPropagation();
                    this.onDelete($(e.currentTarget).closest('tr'));
                });

            $(document).off('keydown', '.cell-editor').on('keydown', '.cell-editor', (e) => {
                const keys = {
                    Enter: () => { e.preventDefault(); this.save(); },
                    Tab: () => { e.preventDefault(); this.save(); },
                    Escape: () => { e.preventDefault(); this.cancel(); }
                };
                if (keys[e.key]) keys[e.key]();
            });

            $(document).off('mousedown.dtMenu').on('mousedown.dtMenu', (e) => {
                if (!this.editingCell || this.isSaving) return;
                if (!$(e.target).closest('.cell-editor, td').length) this.cancel();
            });

            $(document).off('click', '#btnAddRow').on('click', '#btnAddRow', () => this.openAddForm());

            $table.on('change', '.dt-action-select', function() {
                $(this).toggleClass('selected', !!this.value);
            });

            $table.on('click', '.dt-action-submit', (e) => {
                const $wrapper = $(e.currentTarget).closest('.dt-action-wrapper');
                this.submitTask($wrapper.data('activity-id'), $wrapper.find('.dt-action-select').val());
            });

            $(document).on('change', '.cell-editor', (e) => {
                const $editor = $(e.currentTarget);
                const $cell = $editor.closest('td');
                const rowData = this.table.row($cell.closest('tr')).data();
                const meta = this.getMetaForField($cell.data('field'), rowData);

                if (meta?.autofillLoadBinder && meta.type === 'select') {
                    this.handleAutofill($cell, $editor.val(), meta);
                }
            });
        },

        /* ================= INLINE EDIT ================= */
        onCellClick: function ($cell) {
            // Cegah edit jika sedang proses simpan atau sel yang sama diklik
            if (!this.editable || this.isSaving) return;
            if (this.editingCell && this.editingCell.is($cell)) return;

            const field = $cell.data('field');
            const row = this.table.row($cell.closest('tr'));
            const rowData = row.data();
            const meta = this.getMetaForField(field, rowData);

            if (!meta || meta.readonly || meta.calculationLoadBinder || meta.isHidden) {
                return;
            }

            if (this.editingCell) this.cancel();

            this.originalRowData = $.extend(true, {}, rowData);
            this.editingCell = $cell;

            $cell.addClass('editing')
                .data('meta', meta)
                .empty()
                .append(this.buildEditor(meta.type, $cell.attr('data-value'), meta))
                .find('.cell-editor')
                .focus();
        },

        save: function () {
            if (!this.editingCell || this.isSaving) return;
            const newValue = this.editingCell.find('.cell-editor').val();
            this.liveCalculate();

            setTimeout(() => {
                if (newValue === this.editingCell.attr('data-value')) {
                    this.resetState();
                    return;
                }
                this.doSave(newValue);
            }, 100);
        },

        doSave: function (newValue) {
            debugger;
            this.isSaving = true;
            const $cell = this.editingCell;
            const field = $cell.data('field');
            const id = $cell.data('id');
            const meta = $cell.data('meta');
            const row = this.table.row($cell.closest('tr'));
            const rowData = $.extend({}, (this.calculatedRowData || row.data()));

            let saveValue = (meta.type === 'date') ? DataTablesFactory.ensureDateString(newValue) : newValue;
            rowData[field] = saveValue;

            if (this.controlFields.includes(field)) {
                rowData.activeSectionId = DataTablesFactory.processVisibility(rowData, this.FIELD_META);
            }

            const formId = meta.isSubForm ? meta.formDefId : this.editFormDefId;
            let body = { id: id };
            Object.keys(this.FIELD_META).forEach(f => {
                const m = this.FIELD_META[f];
                const fieldId = m.fieldId;
                if (m && m.type !== 'section') {
                    body[fieldId] = (m.type === 'date') ? DataTablesFactory.ensureDateString(rowData[fieldId]) : rowData[fieldId];
                }
            });

            $.ajax({
                url: `${this.BASE_URL}${this.EDIT_FORM_URL}${formId}`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(body),
                success: () => {
                    row.data(rowData).invalidate();
                    this.applyValue($cell, newValue, meta);
                    $cell.addClass('saved');
                    showToast('Changes saved successfully', 'success');
                    row.draw(false);
                    this.resetState();
                },
                error: () => {
                    this.restoreRow();
                    showToast('Failed to save changes', 'error');
                },
                complete: () => { this.isSaving = false; }
            });
        },

        commitRowChange: function (field, value) {
            const row = this.table.row(this.editingCell.closest('tr'));
            const data = row.data();
            const meta = this.getMetaForField(field, data);
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

        cancel: function () {
            if (!this.editingCell || this.isSaving) return;
            this.restoreRow();
        },

        restoreRow: function () {
            const row = this.table.row(this.editingCell.closest('tr'));
            row.data(this.originalRowData);
            row.draw(false);
            this.resetState();
        },

        resetState: function () {
            this.editingCell = null;
            this.originalRowData = null;
            this.calculatedRowData = null;
            this.isSaving = false;
        },

        /* ================= POPUP / ADD ================= */
        openAddForm: function () {
            if (!this.createFormDefId) return;

            const args = { frameId: 'Frame_' + this.createFormDefId };
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

        onSubmitted: function (args) {
            try { JPopup.hide(args.frameId); } catch (e) {}
            if (this.table) this.table.ajax.reload(null, false);
            showToast('Data added successfully', 'success');
        },

        /* ================= DELETE ================= */
        onDelete: function (row) {
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

        doDelete: function (id, row) {
            this.isSaving = true;
            $.ajax({
                url: `${this.BASE_URL}${this.EDIT_FORM_URL}${this.createFormDefId}/${id}`,
                type: 'DELETE',
                success: () => {
                    this.table.row(row).remove().draw(false);
                    this.toggleEmptyState({ show: this.table.rows().data().length === 0 });
                    showToast('Record deleted successfully', 'success');
                },
                error: () => showToast('Failed to delete record', 'error'),
                complete: () => { this.isSaving = false; }
            });
        },

        /* ================= POPUP / ADD ================= */
        openAddForm: function () {
            if (!this.createFormDefId) return;

            const args = { frameId: 'Frame_' + this.createFormDefId };
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

        onSubmitted: function (args) {
            try { JPopup.hide(args.frameId); } catch (e) {}
            if (this.table) this.table.ajax.reload(null, false);
            showToast('Data added successfully', 'success');
        },

        /* ================= UI HELPERS ================= */
        applyValue: function ($cell, value, meta) {
            let text = value;
            if (meta.type === 'select') {
                const opt = (meta.options || []).find(o => o.value === value);
                text = opt ? opt.label : value;
            } else if (meta.formatter) {
                text = DataTablesFactory.formatNumber(value, meta);
            }

            $cell.attr('data-value', value).html(text).removeClass('editing');
        },

        buildEditor: function (type, value, meta) {
            const val = value ?? '';
            const $editor = (() => {
                switch (type) {
                    case 'textarea': return $('<textarea/>');
                    case 'select':
                        const $sel = $('<select/>');
                        (meta.options || []).forEach(o => $sel.append($('<option/>').val(o.value).text(o.label)));
                        return $sel;
                    case 'number': return $('<input type="number"/>');
                    case 'date': return $('<input type="date"/>');
                    default: return $('<input type="text"/>');
                }
            })();
            return $editor.addClass('cell-editor').val(val);
        },

        /* ================= CALCULATION ================= */
        fieldCalcMap: function () {
            this.fieldCalculateMap = {};
            Object.entries(this.FIELD_META || {}).forEach(([key, meta]) => {
                const vars = meta.calculationLoadBinder?.variables;
                if (vars && Array.isArray(vars)) {
                    vars.forEach(v => {
                        const varKey = v.variableName;
                        this.fieldCalculateMap[varKey] = this.fieldCalculateMap[varKey] || [];
                        if (!this.fieldCalculateMap[varKey].includes(key)) {
                            this.fieldCalculateMap[varKey].push(key);
                        }
                    });
                }
            });
        },

        liveCalculate: function () {
            if (!this.editingCell) return;
            const $row = this.table.row(this.editingCell.closest('tr'));

            const rowData = $.extend({}, $row.data());
            const field = this.editingCell.data('field');
            const activeSection = rowData.activeSectionId;

            const val = this.editingCell.find('.cell-editor').val() || '0';
            rowData[field] = val;

            $row.data(rowData);

            const dependents = this.fieldCalculateMap[field] || [];
            dependents.forEach(targetKey => {
                if (!activeSection || targetKey.startsWith(activeSection + "_") || !targetKey.includes("_")) {
                    this.calculateField(targetKey, $row, rowData);
                }
            });
        },

        calculateField: function (compositeKey, row, rowData) {
            const fieldId = compositeKey.includes("_") ? compositeKey.split('_').pop() : compositeKey;
            const meta = this.FIELD_META[compositeKey] || this.FIELD_META[fieldId];
            if (!meta || !meta.calculationLoadBinder) return;

            const finalizeCalculation = (newValue) => {
                rowData[fieldId] = newValue;

                row.data(rowData).invalidate();
                this.calculatedRowData = $.extend({}, rowData);

                if (!meta.isHidden) {
                    const cell = this.findCellByField(fieldId, row);
                    if (cell && !cell.hasClass('editing')) {
                        this.applyValue(cell, newValue, meta);
                    }
                }

                const dependents = this.fieldCalculateMap[fieldId] || [];
                dependents.forEach(f => this.calculateField(f, row, rowData));
            };

            const calc = meta.calculationLoadBinder;
            if (calc.useJsEquation === "true" || calc.useJsEquation === true) {
                this.calculateFieldLocal(compositeKey, row, rowData, finalizeCalculation);
            } else {
                this.calculateFieldRemote(compositeKey, row, rowData, finalizeCalculation);
            }
        },

        calculateFieldLocal: function (compositeKey, row, rowData, callback) {
            const fieldId = compositeKey.includes("_") ? compositeKey.split('_').pop() : compositeKey;
            const meta = this.FIELD_META[compositeKey] || this.FIELD_META[fieldId];
            const calc = meta.calculationLoadBinder;
            let equation = calc.equation;

            (calc.variables || []).forEach(v => {
                const val = DataTablesFactory.normalizeNumber(rowData[v.variableName]) || 0;
                equation = equation.replace(new RegExp("\\b" + v.variableName + "\\b", "g"), val);
            });

            try {
                let result = eval(equation);
                if (calc.roundNumber?.isRoundNumber === "true") {
                    result = this.applyAdvancedRounding(result, calc.roundNumber);
                }
                if (typeof callback === 'function') callback(result);
            } catch (e) { console.error("Local calc error", e); }
        },

        calculateFieldRemote: function (compositeKey, row, rowData, callback) {
            const fieldId = compositeKey.includes("_") ? compositeKey.split('_').pop() : compositeKey;
            const meta = this.FIELD_META[compositeKey] || this.FIELD_META[fieldId];
            const calc = meta.calculationLoadBinder;

            const params = {};
            calc.variables.forEach(v => {
                params[v.variableName] = DataTablesFactory.normalizeNumber(rowData[v.variableName]) || 0;
            });

            $.ajax({
                url: `${this.BASE_URL}${this.CALCULATION_URL}?action=calculate`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    formDefId: meta.isSubForm ? meta.formDefId : this.editFormDefId,
                    fieldId: fieldId,
                    primaryKey: rowData.id,
                    requestParams: params
                }),
                success: (res) => {
                    if (res?.value != null && typeof callback === 'function') {
                        callback(res.value);
                    }
                }
            });
        },

        applyAdvancedRounding: function (value, cfg) {
            const decimals = parseInt(cfg.decimalPlaces || 0);
            const factor = Math.pow(10, decimals);
            const tempValue = value * factor;
            let rounded;
            switch (cfg.roundingMode) {
                case "round_down": rounded = Math.floor(tempValue); break;
                case "round_up": rounded = Math.ceil(tempValue); break;
                case "round_half_up": rounded = Math.round(tempValue); break;
                default: rounded = tempValue; break;
            }
            return rounded / factor;
        },

        /* ================= UI HELPERS ================= */
        applyValue: function ($cell, value, meta) {
            debugger;
            let text = value ?? '';
            if (meta && typeof meta === 'object') {
                if (meta.type === 'select') {
                    const opt = (meta.options || []).find(o => String(o.value) === String(value));
                    text = opt ? opt.label : value;
                } else if (meta.formatter) {
                    text = DataTablesFactory.formatNumber(value, meta);
                }
            }
            $cell.attr('data-value', value).html(text).removeClass('editing');
        },

        buildEditor: function (type, value, meta) {
            const val = value ?? '';
            const $editor = (() => {
                switch (type) {
                    case 'textarea': return $('<textarea/>');
                    case 'select':
                        const $sel = $('<select/>');
                        (meta.options || []).forEach(o => $sel.append($('<option/>').val(o.value).text(o.label)));
                        return $sel;
                    case 'number': return $('<input type="number"/>');
                    case 'date': return $('<input type="date"/>');
                    default: return $('<input type="text"/>');
                }
            })();
            return $editor.addClass('cell-editor').val(val);
        },

        findCellByField: function (field, row) {
            const node = row?.node();
            return node ? $(node).find(`td[data-field="${field}"]`) : null;
        }
    };
})();