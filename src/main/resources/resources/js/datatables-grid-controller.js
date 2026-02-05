/**
 * DataTables Grid Controller
 * @author: tiyojati
 */
(function () {
    if (window.DataTablesGridController) return;

    window.DataTablesGridController = {
        /* ================= STATE ================= */
        table: null,
        tableEl: null,
        FIELD_META: {},
        FIELD_MAP: [],
        elementParamName: null,
        formGridId: null,
        BASE_URL: null,
        CALCULATION_URL: null,
        fieldCalculateMap: {},
        formDefId: null,
        editingCell: null,

        appId: null,
        appVersion: null,

        /* ================= CORE INIT ================= */
        init: function (opts, dataRows) {
            if (!opts || !opts.table) throw new Error('DataTable instance is required');

            this.table            = opts.table;
            this.tableEl          = $(this.table.table().node());
            this.elementId        = opts.elementId;
            this.elementParamName = opts.elementParamName;
            this.formGridId       = opts.formGridId;
            this.FIELD_META       = opts.fieldMeta || {};
            this.formDefId        = opts.formDefId;
            this.BASE_URL         = opts.baseUrl;
            this.CALCULATION_URL  = opts.calculationUrl;
            this.appId            = opts.appId;
            this.appVersion       = opts.appVersion;

            this.FIELD_MAP = opts.fieldMap || this._buildFieldMap(opts.columns);

            this._initFieldCalcMap();
            this.bindEvents();
            this.bindEmptyState();

            if (dataRows && dataRows.length > 0) {
                this.loadExistingData(dataRows);
            } else {
                this.updateRowCount();
            }
        },

        loadExistingData: function (data) {
            const cleanedData = data.map(item => {
                if (typeof item === 'string') {
                    try { return JSON.parse(item); } catch (e) { return {}; }
                }
                if (item && typeof item.jsonrow === 'string') {
                    try { return JSON.parse(item.jsonrow); } catch (e) { return item; }
                }
                return item;
            });

            this.table.rows.add(cleanedData).draw(false);
            this.reindexRows();
            this.updateRowCount();
        },

        _buildFieldMap: function (columns) {
            return (columns || []).map(col => (col && col.name ? col.name : null));
        },

        /* ================= EMPTY STATE ================= */
        toggleEmptyState: function (options) {
            const opts = $.extend({
                show: false,
                title: 'Start by adding a row',
                description: 'Add your first row to begin working with this grid.',
                icon: '✨'
            }, options || {});

            if (!this.table) return;

            const $table = $(this.table.table().node());
            const $tbody = $table.find('tbody');
            let $empty = $('#dt-empty-state');

            if ($empty.length === 0) {
                $empty = $('<div id="dt-empty-state" class="dt-empty-state"></div>').hide();
                $table.after($empty);
            }

            if (opts.show) {
                $empty.html(
                    '<div class="dt-empty-box">' +
                    '<span class="dt-empty-icon">' + opts.icon + '</span>' +
                    '<span class="dt-empty-title">' + opts.title + '</span>' +
                    '<span class="dt-empty-desc">' + opts.description + '</span>' +
                    '</div>'
                ).show();
                $tbody.hide();
            } else {
                $empty.hide();
                $tbody.show();
            }
        },

        bindEmptyState: function () {
            var self = this;
            if (!self.table) return;
            function evaluateEmpty() {
                const total = self.table.rows().count();
                self.toggleEmptyState({ show: total === 0 });
            }
            self.table.on('draw.dt', () => evaluateEmpty());
            setTimeout(() => evaluateEmpty(), 0);
        },

        /* ================= EVENTS ================= */
        bindEvents: function () {
            const self = this;
            $(document).on('click', '.dt-add-row', () => self.addRow());
            this.tableEl.on('click', '.dt-row-delete', function () {
                self.deleteRow($(this).closest('tr'));
            });
            this.tableEl.on('click', 'tbody td', function () {
                self.onCellClick($(this));
            });
            $(document).on('keydown', '.cell-editor', function (e) {
                const $editor = $(this);
                const $td = $editor.closest('td');
                const idx = self.table.cell($td).index();
                const field = self.FIELD_MAP[idx.column];

                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    self.commit($td, field, idx.row, $editor.val());
                    self.editingCell = null;
                    if (e.key === 'Tab') self._focusNextCell($td, e.shiftKey);
                }
                if (e.key === 'Escape') self.cancelEdit($td);
            });
            $(document).on('mousedown', function (e) {
                if (!self.editingCell) return;
                if (!$(e.target).closest('.cell-editor, .editing').length) {
                    self.cancelEdit(self.editingCell);
                }
            });
        },

        /* ================= ROW OPERATIONS ================= */
        addRow: function () {
            const emptyData = {};
            this.FIELD_MAP.forEach(f => { if (f) emptyData[f] = ''; });
            this.table.row.add(emptyData).draw(false);
            this.reindexRows();
            this.updateRowCount();
        },

        _appendJsonRowMarkup: function (row, rowIndex, existingData) {
            // Gunakan data baris yang ada (jika sedang reindex baris lama)
            const json = existingData || {};
            Object.keys(this.FIELD_META).forEach(k => { if (!(k in json)) json[k] = ''; });

            $(row).append(`
                <td style="display:none;">
                    <textarea name="${this.elementParamName}_jsonrow_${rowIndex}">
                        ${JSON.stringify(json)}
                    </textarea>
                </td>
            `);
        },

        deleteRow: function (row) {
            const self = this;
            showConfirm({
                title: 'Delete Confirmation',
                message: 'Are you sure you want to delete this row?'
            }, () => {
                self.table.row(row).remove().draw(false);
                self.reindexRows();
                self.updateRowCount();
            });
        },

        reindexRows: function () {
            const self = this;
            const $rows = this.tableEl.find('tbody tr');

            $rows.each(function (newIndex) {
                const $row = $(this);
                $row.attr('id', `${self.formGridId}_row_${newIndex}`);
                $row.find('td:first').text(newIndex + 1);

                let $ta = $row.find(`textarea[name*="_jsonrow_"]`);
                // Ambil data asli dari DataTable agar data dari backend tidak hilang
                const rowData = self.table.row($row).data();

                if ($ta.length === 0) {
                    self._appendJsonRowMarkup($row, newIndex, rowData);
                } else {
                    $ta.attr('name', `${self.elementParamName}_jsonrow_${newIndex}`);
                }
            });
            this.table.rows().invalidate();
        },

        /* ================= INLINE EDITING ================= */
        onCellClick: function ($td) {
            if (this.editingCell && !this.editingCell.is($td)) this.cancelEdit(this.editingCell);
            if ($td.hasClass('editing') || $td.find('.cell-editor').length) return;

            const idx = this.table.cell($td).index();
            const field = this.FIELD_MAP[idx.column];
            const meta = this.FIELD_META[field];
            if (!meta || meta.readonly || meta.calculationLoadBinder || meta.isHidden) return;

            this.editingCell = $td;
            const rowData = this.table.row(idx.row).data();
            const value = rowData[field] ?? '';
            $td.data('old-value', value).addClass('editing');

            const $editor = this.buildEditorMarkup(meta.type, value, meta);
            $td.empty().append($editor);
            $editor.focus();
        },

        commit: function ($td, field, rowIndex, inputValue) {
            const meta = this.FIELD_META[field] || {};
            let rawValue = (meta.formatter || meta.type === 'number') ? DataTablesFactory.normalizeNumber(inputValue) : inputValue;

            const rowData = this.table.row(rowIndex).data();
            rowData[field] = rawValue;

            this.applyValueToCell($td, rawValue, meta);
            this.syncJsonRow(rowIndex, field, rawValue);
            this.triggerAutofill(field, rowIndex, rawValue, rowData);
            this.triggerCalculate(field, rowIndex, rowData);
        },

        cancelEdit: function ($td) {
            if (!$td) return;
            const oldValue = $td.data('old-value');
            const idx = this.table.cell($td).index();
            const field = this.FIELD_MAP[idx.column];
            const meta = this.FIELD_META[field] || {};
            this.applyValueToCell($td, oldValue, meta);
            this.editingCell = null;
            $td.removeClass('editing');
        },

        /* ================= CALCULATION ENGINE ================= */
        _initFieldCalcMap: function () {
            this.fieldCalculateMap = {};
            Object.keys(this.FIELD_META).forEach(field => {
                const calc = this.FIELD_META[field].calculationLoadBinder;
                if (calc?.variables) {
                    calc.variables.forEach(v => {
                        this.fieldCalculateMap[v.variableName] = this.fieldCalculateMap[v.variableName] || [];
                        this.fieldCalculateMap[v.variableName].push(field);
                    });
                }
            });
        },

        triggerCalculate: function (field, rowIndex, rowData) {
            const targets = this.fieldCalculateMap[field];
            if (targets) targets.forEach(target => this.calculateFieldRemote(target, rowIndex, rowData));
        },

        calculateFieldRemote: function (field, rowIndex, rowData) {
            const self = this;
            const meta = this.FIELD_META[field];
            const calc = meta?.calculationLoadBinder;
            if (!calc) return;

            if (calc?.useJsEquation === "true" && calc?.equation) {
                try {
                    const argNames = [];
                    const argValues = [];

                    calc.variables?.forEach(v => {
                        argNames.push(v.variableName);
                        const rawVal = rowData[v.variableName];
                        const numVal = DataTablesFactory.normalizeNumber(rawVal) || 0;
                        argValues.push(numVal);
                    });

                    const equationFormula = calc.equation;
                    const func = new Function(...argNames, `return ${equationFormula};`);
                    let result = func(...argValues);

                    if (calc.roundNumber?.roundNumber === "true") {
                        const decimals = parseInt(calc.roundNumber.decimalPlaces) || 0;
                        const factor = Math.pow(10, decimals);
                        result = Math.floor(result * factor) / factor;
                    }

                    if (!isFinite(result)) result = 0;

                    rowData[field] = result;
                    self.syncJsonRow(rowIndex, field, result);

                    const rowNode = self.table.row(rowIndex).node();
                    const $cell = $(rowNode).find(`td[data-field="${field}"]`);
                    if ($cell.length && !$cell.hasClass('editing')) {
                        self.applyValueToCell($cell, result, meta);
                    }

                    self.triggerCalculate(field, rowIndex, rowData);

                } catch (err) {
                    console.error(`Client-side calculation error for field ${field}:`, err);
                }
                return;
            } else {
            const params = {};
            calc.variables.forEach(v => {
                params[v.variableName] = DataTablesFactory.normalizeNumber(rowData[v.variableName]);
            });

            $.ajax({
                url: `${this.BASE_URL}${this.CALCULATION_URL}?action=calculate`,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    formDefId: this.formDefId,
                    fieldId: field,
                    primaryKey: rowData.id || 'id',
                    requestParams: params
                }),
                success: function (res) {
                    if (res?.value == null) return;

                    rowData[field] = res.value;
                    self.syncJsonRow(rowIndex, field, res.value);

                    const rowNode = self.table.row(rowIndex).node();
                    const $cell = $(rowNode).find(`td[data-field="${field}"]`);

                    if ($cell.length > 0 && !$cell.hasClass('editing')) {
                        self.applyValueToCell($cell, res.value, meta);
                    }

                    self.triggerCalculate(field, rowIndex, rowData);
                },
                error: function(err) {
                    console.error(`Calculation failed for field: ${field}`, err);
                }
            });
        }
        },

        triggerAutofill: function (field, rowIndex, value, rowData) {
            const meta = this.FIELD_META[field];
            const autofill = meta?.autofillLoadBinder;
            const serviceUrl = autofill?.serviceUrl;

            if (!autofill || value == null || value === '') return;

            const selectedId = value;
            if (selectedId == null || selectedId === '') return;

            const payload = {
                appId: this.appId,
                appVersion: this.appVersion,
                id: selectedId,
                FIELD_ID: field,
                FORM_ID: this.formDefId,
                SECTION_ID: meta.sectionId,
                requestParameter: {}
            };

            const self = this;

            $.ajax({
                url: self.BASE_URL + serviceUrl,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(payload),
                success: function (res) {
                    if (!res || typeof res !== 'object') return;

                    (autofill.fields || []).forEach(map => {
                        const resultValue = res[map.resultField];
                        if (resultValue == null) return;

                        const targetField = map.formField;
                        rowData[targetField] = resultValue;

                        self.syncJsonRow(rowIndex, targetField, resultValue);

                        const rowNode = self.table.row(rowIndex).node();
                        const $cell = $(rowNode).find(`td[data-field="${targetField}"]`);
                        const targetMeta = self.FIELD_META[targetField];

                        if ($cell.length && targetMeta && !$cell.hasClass('editing')) {
                            self.applyValueToCell($cell, resultValue, targetMeta);
                        }

                        self.triggerCalculate(targetField, rowIndex, rowData);
                    });
                },
                error: function (err) {
                    console.error(`Autofill failed for field ${field}`, err);
                }
            });
        },

        /* ================= HELPERS ================= */
        syncJsonRow: function (rowIndex, field, value) {
            const rowNode = this.table.row(rowIndex).node();
            const $ta = $(rowNode).find(`textarea[name*="_jsonrow_"]`);
            if (!$ta.length) return;
            try {
                const json = JSON.parse($ta.val());
                json[field] = value;
                $ta.val(JSON.stringify(json));
                $ta.trigger('change');
            } catch (e) { console.error('Sync JSON failed', e); }
        },

        applyValueToCell: function ($cell, value, meta) {
            let display = value ?? '';
            if (meta.type === 'select') {
                const option = (meta.options || []).find(o => String(o.value) === String(value));
                display = option ? option.label : '';
            } else if (meta.formatter) display = DataTablesFactory.formatNumber(value, meta);
            $cell.attr('data-value', value ?? '').html(display).removeClass('editing');
        },

        buildEditorMarkup: function (type, value, meta) {
            const val = value ?? '';
            switch (type) {
                case 'textarea': return $('<textarea class="cell-editor"/>').val(val);
                case 'select':
                    const $s = $('<select class="cell-editor"/>');
                    (meta.options || []).forEach(o => $('<option/>').val(o.value).text(o.label).appendTo($s));
                    return $s.val(val);
                case 'number': return $('<input type="number" class="cell-editor"/>').val(val);
                default: return $('<input type="text" class="cell-editor"/>').val(val);
            }
        },

        updateRowCount: function () { $('#rowCount').val(this.table.rows().count()); },

        _focusNextCell: function ($currentTd, reverse) {
            const self = this;
            const $row = $currentTd.closest('tr');
            const $allCells = $row.find('td');
            const currentIndex = $allCells.index($currentTd);
            let nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;

            while (nextIndex >= 0 && nextIndex < $allCells.length) {
                const $nextTd = $($allCells[nextIndex]);
                const idx = self.table.cell($nextTd).index();
                if (idx) {
                    const field = self.FIELD_MAP[idx.column];
                    const meta = self.FIELD_META[field];
                    if (meta && !meta.readonly && !meta.calculationLoadBinder && !meta.isHidden) {
                        setTimeout(() => $nextTd.trigger('click'), 50);
                        return;
                    }
                }
                reverse ? nextIndex-- : nextIndex++;
            }
        }
    };
})();