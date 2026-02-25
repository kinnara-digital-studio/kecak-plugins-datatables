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

        appId: null,
        appVersion: null,

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

            DataTablesCalculationEngine.init({
                fieldMeta: this.FIELD_META,
                baseUrl: this.BASE_URL,
                calculationUrl: this.CALCULATION_URL,
                formDefId: this.editFormDefId
            });

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
            const $table = $('#inlineTable');

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
                    this.triggerAutofill($cell, $editor.val(), meta);
                }
            });
        },

        /* ================= INLINE EDIT ================= */
        onCellClick: function($cell) {
            if (!this.editable || this.editingCell || this.isSaving) return;

            const field = $cell.data('field');
            const row = this.table.row($cell.closest('tr'));
            this.originalRowData = structuredClone(row.data());
            
            const meta = DataTablesFactory.getMetaForField(field, row.data(), this.FIELD_META);

            if (!meta || meta.readonly || meta.calculationLoadBinder || meta.isHidden) return;

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
            const rowData = structuredClone(self.calculatedRowData ?? row.data());
            let saveValue = (meta.type === 'date') ? DataTablesFactory.ensureDateString(newValue) : newValue;
            rowData[field] = saveValue;

            const body = {
                id: id
            };
            Object.keys(rowData).forEach(field => {
                debugger;
                const meta = DataTablesFactory.getMetaForField(field, rowData, this.FIELD_META);
                if (!meta) return;

                if (meta.type === 'file') return;

                const fieldId = DataTablesFactory.getCleanFieldId(field, this.FIELD_META);
                const value = rowData[field];

                if (value == null) return;

                body[fieldId] = (meta.type === 'date')
                    ? DataTablesFactory.ensureDateString(value)
                    : value;
            });

            $.ajax({
                url: `${this.BASE_URL}${this.EDIT_FORM_URL}${formId}`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(body),
                success: () => {
                    Object.keys(body).forEach(([field, value]) => {
                        const fm = DataTablesFactory.getMetaForField(field, rowData, self.FIELD_META);
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
            const meta = DataTablesFactory.getMetaForField(field, data, this.FIELD_META);
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
                const meta = DataTablesFactory.getMetaForField(f, row.data(), this.FIELD_META)
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

            const frameId = 'formPopup_' + this.createFormDefId;

            if (window.JPopup) {
                JPopup.create(
                    frameId,
                    "Add Data",
                    "80%",
                    "80%"
                );
            }

            let url = this.BASE_URL + this.ADD_FORM_URL;

            if (typeof UI !== "undefined" && typeof UI.userviewThemeParams === "function") {
                url += UI.userviewThemeParams();
            } else if (window.ConnectionManager && window.ConnectionManager.tokenName) {
                url +=
                    "&" +
                    window.ConnectionManager.tokenName +
                    "=" +
                    window.ConnectionManager.tokenValue;
            }
            const params = {
                _json: this.jsonForm,
                _callback: 'DataTablesMenuController.onSubmitted',
                _nonce: this.nonce,
                _setting: "{}"
            };

            JPopup.show(frameId, url, params, '', 900, 800);
        },

        onSubmitted: function(args) {
            const frameId = 'formPopup_' + this.createFormDefId;
            try {
                JPopup.hide(frameId);
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
        triggerCalculate: async function () {
            if (!this.editingCell) return;

            const $row = this.editingCell.closest('tr');
            const row = this.table.row($row);

            const editedField = this.editingCell.data('field');
            const newValue = this.editingCell.find('.cell-editor').val();

            const newRowData = await DataTablesCalculationEngine.run({
                editedField: editedField,
                rowData: structuredClone(this.calculatedRowData ?? row.data()),
                newValue: newValue
            });

            if (!newRowData) return;

            this.calculatedRowData = newRowData;

            row.data(newRowData).invalidate();

            const rowNode = row.node();

            Object.keys(newRowData).forEach(field => {
                const $cell = $(rowNode).find(`td[data-field="${field}"]`);
                if (!$cell.length) return;

                const meta = DataTablesFactory.getMetaForField(field, newRowData, this.FIELD_META);
                if (!meta || $cell.hasClass('editing')) return;

                this.applyValue($cell, newRowData[field], meta);
            });
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

        triggerAutofill: function($cell, selectedValue, meta) {
            const autofill = meta.autofillLoadBinder;
            if (!autofill) return;

            const $row = this.table.row($cell.closest('tr'));
            const rowData = structuredClone($row.data());
            rowData[$cell.data('field')] = selectedValue;

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
                url: autofill.serviceUrl,
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
                        const targetMeta = DataTablesFactory.getMetaForField(targetField, rowData, this.FIELD_META);
                        if (!targetMeta) return;

                        rowData[targetField] = value;

                        const cell = this.findCellByField(targetField, $row);
                        if (cell && !cell.hasClass('editing')) {
                            this.applyValue(cell, value, targetMeta);
                        }
                    });

                    this.calculatedRowData = rowData;

                },
                error: (err) => {
                    console.error('Autofill failed', err);
                }
            });
        }
    };
})();