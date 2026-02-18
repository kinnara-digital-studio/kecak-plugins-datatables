/**
 * DataTables Grid Controller
 * Updated to support Section Visibility and Composite Meta Lookup
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
        FIELD_DATA: {},
        elementParamName: null,
        formGridId: null,
        BASE_URL: null,
        CALCULATION_URL: null,
        controlFields: [],
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

            this.FIELD_MAP = opts.fieldMap || this.buildFieldMap(opts.columns);

            this.controlFields = DataTablesFactory.getControlFields(this.FIELD_META);

            this.buildFieldData();

            DataTablesCalculationEngine.init({
                fieldMeta: this.FIELD_META,
                baseUrl: this.BASE_URL,
                calculationUrl: this.CALCULATION_URL,
                formDefId: this.formDefId
            });

            this.bindEvents();
            this.bindEmptyState();

            if (dataRows && dataRows.length > 0) {
                this.loadExistingData(dataRows);
            } else {
                this.updateRowCount();
            }
        },

        loadExistingData: function (data) {
            const self = this;
            const processedData = data.map(item => {
                let rowData = {};
                
                if (typeof item === 'string') {
                    try { rowData = JSON.parse(item); } catch (e) { rowData = {}; }
                } else if (item && typeof item.jsonrow === 'string') {
                    try { rowData = JSON.parse(item.jsonrow); } catch (e) { rowData = item; }
                } else {
                    rowData = item;
                }

                if (window.DataTablesFactory && typeof DataTablesFactory.processVisibility === 'function') {
                    rowData.activeSectionId = DataTablesFactory.processVisibility(rowData, self.FIELD_META);
                }

                return rowData;
            });

            this.table.rows.add(processedData).draw(false);
            this.reindexRows();
            this.updateRowCount();
        },

        triggerInitialCalculations: function () {
            const self = this;
            const fieldCalculateMap = DataTablesCalculationEngine.fieldCalculateMap;
            if (!this.table) return;

            this.table.rows().every(function (rowIdx) {
                const rowData = this.data();
                const rowIndex = rowIdx;

                self.FIELD_MAP.forEach(field => {
                    if (field && fieldCalculateMap[field]) {
                        self.triggerCalculate(field, rowIndex, rowData);
                    }
                });
            });
        },

        buildFieldMap: function (columns) {
            return (columns || []).map(col => (col && col.name ? col.name : null));
        },

        buildFieldData: function () {
            this.FIELD_DATA = {};
            Object.keys(this.FIELD_META).forEach(key => {
                const meta = this.FIELD_META[key];
                if(meta.type !== 'section'){
                    const fieldId = DataTablesFactory.getCleanFieldId(key, this.FIELD_META);
                    this.FIELD_DATA[fieldId] = '';
                }
            });
        },

        /* ================= EVENTS ================= */
        bindEvents: function () {
            const self = this;
            $(document).on('click', '.dt-add-row', () => self.addRow());
            this.tableEl.on('click', '.dt-row-delete', function () {
                self.deleteRow($(this).closest('tr'));
            });
            this.tableEl.find('tbody').off('click', 'td').on('click', 'td', function (e) {
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
                    if (e.key === 'Tab') self.focusNextCell($td, e.shiftKey);
                }
                if (e.key === 'Escape') self.cancelEdit($td);
            });
            $(document).on('change', '.cell-editor', function () {
                const $editor = $(this);
                const $td = $editor.closest('td');

                const cell = self.table.cell($td);
                if (!cell || !cell.index()) return;

                const idx = cell.index();
                const field = self.FIELD_MAP[idx.column];

                if (self.controlFields.includes(field)) {
                    debugger;
                    const newValue = $editor.val();
                    const rowData = self.table.row(idx.row).data();

                    const tempRowData = structuredClone(rowData);

                    const activeSection = rowData.activeSectionId;
                    const compositeKey = activeSection ? `${activeSection}.${field}` : field;
                    const meta = self.FIELD_META[compositeKey] || self.FIELD_META[field] || {};

                    let rawValue = newValue;
                    if (meta.formatter || meta.type === 'number') {
                        rawValue = DataTablesFactory.normalizeNumber(newValue);
                    }

                    tempRowData[field] = rawValue;

                    const currentSection = rowData.activeSectionId;
                    const newSectionId = DataTablesFactory.processVisibility(tempRowData, self.FIELD_META);

                    if (newSectionId !== currentSection) {
                        self.commit($td, field, idx.row, newValue);

                        self.editingCell = null;
                    }
                }
            });
        },

        /* ================= ROW OPERATIONS ================= */
        addRow: function () {
            const emptyData = {
                activeSectionId: null
            };

            Object.keys(this.FIELD_DATA).forEach(field => {
                 emptyData[field] = '';
            });

            const rowCount = this.table.rows().count();

            if (rowCount > 0) {
                const lastRowData = this.table.row(rowCount - 1).data();

                if (lastRowData && lastRowData.activeSectionId) {
                    emptyData.activeSectionId = lastRowData.activeSectionId;
                } else {
                    emptyData.activeSectionId = DataTablesFactory.processVisibility(emptyData, this.FIELD_META);
                }
            } else {
                emptyData.activeSectionId = DataTablesFactory.processVisibility(emptyData, this.FIELD_META);
            }
            
            this.table.row.add(emptyData).draw(false);
            this.reindexRows();
            this.updateRowCount();
        },

        appendJsonRowMarkup: function (row, rowIndex, existingData) {
            const jsonToStore = {};
            Object.keys(this.FIELD_DATA).forEach(field => {
                jsonToStore[field] = existingData[field] ?? '';
            });

            $(row).append(`
                <td style="display:none;">
                    <textarea name="${this.elementParamName}_jsonrow_${rowIndex}">
                        ${JSON.stringify(jsonToStore)}
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

        /* ================= INLINE EDITING ================= */
        onCellClick: function ($td) {
            if (this.editingCell && this.editingCell.is($td)) return;

            if (this.editingCell) this.cancelEdit(this.editingCell);

            const idx = this.table.cell($td).index();
            if (!idx) return;

            const field = this.FIELD_MAP[idx.column];
            const rowData = this.table.row(idx.row).data();
            const meta = DataTablesFactory.getMetaForField(field, rowData, this.FIELD_META);

            if (!meta || meta.readonly || meta.calculationLoadBinder || meta.isHidden) {
                return;
            }

            this.editingCell = $td;
            const value = rowData[field] ?? '';
            
            $td.data('old-value', value).addClass('editing');

            const $editor = this.buildEditorMarkup(meta.type, value, meta);
            $td.empty().append($editor);

            $editor.focus();
            if ($editor.is('input')) $editor.select();
        },

        cancelEdit: function ($td) {
            if (!$td || !$td.hasClass('editing')) return;
            
            const oldValue = $td.data('old-value');
            const idx = this.table.cell($td).index();
            const field = this.FIELD_MAP[idx.column];
            const rowData = this.table.row(idx.row).data();

            const activeSection = rowData.activeSectionId;
            const compositeKey = activeSection ? (activeSection + "." + field) : field;
            
            const meta = this.FIELD_META[compositeKey] || 
                        this.FIELD_META[field] || 
                        Object.values(this.FIELD_META).find(m => m.fieldId === field);

            this.applyValueToCell($td, oldValue, meta);
            this.editingCell = null;
            $td.removeClass('editing');
        },

        commit: function ($td, field, rowIndex, inputValue) {
            const rowData = this.table.row(rowIndex).data();
            const currentSection = rowData.activeSectionId;

            const compositeKey = currentSection ? `${currentSection}.${field}` : field;
            const meta = this.FIELD_META[compositeKey] || this.FIELD_META[field] || {};
            
            let rawValue = (meta.formatter || meta.type === 'number') ? DataTablesFactory.normalizeNumber(inputValue) : inputValue;
            rowData[field] = rawValue;

            if (this.controlFields.includes(field)) {
                const newSectionId = DataTablesFactory.processVisibility(rowData, this.FIELD_META);
                if (newSectionId !== currentSection) {
                    rowData.activeSectionId = newSectionId;
                    this.table.row(rowIndex).data(rowData);
                    this.table.row(rowIndex).invalidate().draw(false);

                    const $row = $(this.table.row(rowIndex).node());
                    const self = this;

                    $row.find('td[data-field]').each(function() {
                        const $cell = $(this);
                        const cellField = $cell.attr('data-field');

                        $cell.attr('data-section', newSectionId);

                        const newCompositeKey = `${newSectionId}.${cellField}`;
                        $cell.attr('data-composite-key', newCompositeKey);
                    });

                    this.syncJsonRow(rowIndex, field, rawValue);
                    this.triggerAutofill(field, rowIndex, rawValue, rowData);
                    this.triggerCalculate(field, rowIndex, rowData);

                    return;
                }
            }

            this.applyValueToCell($td, rawValue, meta);
            this.syncJsonRow(rowIndex, field, rawValue);
            this.triggerAutofill(field, rowIndex, rawValue, rowData);
            this.triggerCalculate(field, rowIndex, rowData);
        },

        /* ================= CALCULATION ================= */
        triggerCalculate: async function (field, rowIndex, rowData) {

            const row = this.table.row(rowIndex);

            const newRowData = await DataTablesCalculationEngine.run({
                editedField: field,
                rowData: row.data(),
                newValue: rowData[field]
            });

            if (!newRowData) return;

            row.data(newRowData).invalidate();

            Object.keys(newRowData).forEach(f => {
                this.syncJsonRow(rowIndex, f, newRowData[f]);
            });

            const rowNode = row.node();

            Object.keys(newRowData).forEach(f => {
                const $cell = $(rowNode).find(`td[data-field="${f}"]`);
                if ($cell.length && !$cell.hasClass('editing')) {
                    const meta = DataTablesFactory.getMetaForField(f, newRowData, this.FIELD_META);
                    this.applyValueToCell($cell, newRowData[f], meta);
                }
            });
        },

        /* ================= AUTOFILL ================= */
        triggerAutofill: function (field, rowIndex, value, rowData) {
            const activeSection = rowData.activeSectionId;
            const meta = DataTablesFactory.getMetaForField(field, rowData, this.FIELD_META);
            const autofill = meta?.autofillLoadBinder;
            if (!autofill || value == null || value === '') return;

            const payload = {
                appId: this.appId,
                appVersion: this.appVersion,
                id: value,
                FIELD_ID: field,
                FORM_ID: this.formDefId,
                SECTION_ID: activeSection || meta.sectionId,
                requestParameter: {}
            };

            const self = this;
            $.ajax({
                url: self.BASE_URL + autofill.serviceUrl,
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

                        const targetCompositeKey = activeSection ? `${activeSection}_${targetField}` : targetField;
                        const targetMeta = self.FIELD_META[targetCompositeKey] || self.FIELD_META[targetField];

                        if ($cell.length && targetMeta && !$cell.hasClass('editing')) {
                            self.applyValueToCell($cell, resultValue, targetMeta);
                        }

                        self.triggerCalculate(targetField, rowIndex, rowData);
                    });
                }
            });
        },

        /* ================= HELPERS ================= */
        syncJsonRow: function (rowIndex, field, value) {
            if (!Object.hasOwn(this.FIELD_DATA, field)) return;

            const rowNode = this.table.row(rowIndex).node();
            const $ta = $(rowNode).find(`textarea[name*="_jsonrow_"]`);
            if (!$ta.length) return;

            try {
                const json = JSON.parse($ta.val());

                json[field] = value;

                Object.keys(json).forEach(k => {
                    if (k.includes(".") && k !== field && !Object.hasOwn(this.FIELD_DATA, k)) {
                        delete json[k];
                    }
                });

                $ta.val(JSON.stringify(json));
                $ta.trigger('change');
            } catch (e) { console.error('failed sync JSON', e); }
        },

        applyValueToCell: function ($cell, value, meta) {
            let display = value ?? '';
            if (meta.type === 'select') {
                const option = (meta.options || []).find(o => String(o.value) === String(value));
                display = option ? option.label : '';
            } else if (meta.formatter) {
                display = DataTablesFactory.formatNumber(value, meta);
            }
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

        focusNextCell: function ($currentTd, reverse) {
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
                    const rowData = self.table.row(idx.row).data();
                    const compositeKey = rowData.activeSectionId ? `${rowData.activeSectionId}_${field}` : field;
                    const meta = self.FIELD_META[compositeKey] || self.FIELD_META[field];
                    
                    if (meta && !meta.readonly && !meta.calculationLoadBinder && !meta.isHidden) {
                        setTimeout(() => $nextTd.trigger('click'), 50);
                        return;
                    }
                }
                reverse ? nextIndex-- : nextIndex++;
            }
        },
        
        reindexRows: function () {
            const self = this;
            const $rows = this.tableEl.find('tbody tr');
            $rows.each(function (newIndex) {
                const $row = $(this);
                $row.attr('id', `${self.formGridId}_row_${newIndex}`);
                $row.find('td:first').text(newIndex + 1);
                let $ta = $row.find(`textarea[name*="_jsonrow_"]`);
                const rowData = self.table.row($row).data();
                if ($ta.length === 0) {
                    self.appendJsonRowMarkup($row, newIndex, rowData);
                } else {
                    $ta.attr('name', `${self.elementParamName}_jsonrow_${newIndex}`);
                }
            });
            this.table.rows().invalidate();
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
        }
    };
})();