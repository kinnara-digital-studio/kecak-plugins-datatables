/**
 * DataTables Editor
 * Inline Edit + Delete + Add (JPopup)
 * @author: tiyojati
 */
(function () {

    if (window.DataTablesEditor) return;

    window.DataTablesEditor = {

        /* ================= STATE ================= */

        table: null,
        FIELD_META: null,
        editable: false,
        BASE_URL: null,
        SERVICE_URL: null,

        // add form
        formDefIdCreate: null,
        jsonForm: null,
        nonce: null,
        ADD_BASE_URL: null,

        editingCell: null,
        originalRowData: null,
        calculatedRowData: null,
        isSaving: false,
        fieldCalculateMap: null,

        formDefId: null,

        /* ================= INIT ================= */

        init: function (opts) {
            this.table       = opts.table;
            this.FIELD_META  = opts.fieldMeta;
            this.editable    = opts.editable;
            this.BASE_URL    = opts.baseUrl;
            this.SERVICE_URL = opts.serviceUrl;

            // add form (optional)
            this.formDefIdCreate   = opts.formDefIdCreate;
            this.jsonForm    = opts.jsonForm;
            this.nonce       = opts.nonce;
            this.ADD_BASE_URL = opts.addBaseUrl;

            this.formDefId  = opts.formDefId;

            this.fieldCalcMap();
            this.bind();
        },

        /* ================= EVENTS ================= */

        bind: function () {
            var self = this;

            // inline edit
            $('#inlineTable tbody')
                .on('click', 'td[data-field]', function () {
                    self.onCellClick($(this));
                })
                .on('click', '.cell-delete', function (e) {
                    e.stopPropagation();
                    self.onDelete($(this).closest('tr'));
                });

            // editor key
            $(document).on('keydown', '.cell-editor', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    self.save();
                }
                if (e.key === 'Tab') {
                    e.preventDefault();
                    self.save();
                    self.saveAndMoveNext(e.shiftKey === true);
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    self.cancel();
                }
            });

            // click outside cancel
            $(document).on('mousedown', function (e) {
                if (!self.editingCell || self.isSaving) return;
                if ($(e.target).closest('.cell-editor, td').length) return;
                self.cancel();
            });

            // add button
            $(document).on('click', '#btnAddRow', function () {
                self.openAddForm();
            });

            $(document).on('input change', '.cell-editor', function () {
                self.liveCalculate();
            });
        },

        /* ================= INLINE EDIT ================= */

        onCellClick: function (cell) {
            if (this.editable === false) return;

            if (this.editingCell || this.isSaving) return;

            var field = cell.data('field');
            var meta  = this.FIELD_META[field];
            if (!meta || meta.readonly === true || meta.calculationLoadBinder || meta.isHidden === true) return;

            var row = this.table.row(cell.closest('tr'));

            this.originalRowData = $.extend(true, {}, row.data());
            this.editingCell = cell;

            cell
                .addClass('editing')
                .data('meta', meta)
                .empty()
                .append(this.buildEditor(meta.type, cell.attr('data-value'), meta))
                .find('.cell-editor')
                .focus();
        },

        saveAndMoveNext: function (reverse) {
            if (!this.editingCell || this.isSaving) return;

            var self = this;
            var currentCell = self.editingCell;

            var nextCell = self.findNextEditableCell(currentCell, reverse);

            this.save();

            setTimeout(function () {
                if (nextCell) {
                    nextCell.trigger('click');
                }
            }, 150);
        },

        findNextEditableCell: function (cell, reverse) {
            var row = cell.closest('tr');
            var cells = row.find('td[data-field]');
            var index = cells.index(cell);
            var step = reverse ? -1 : 1;

            for (var i = index + step; i >= 0 && i < cells.length; i += step) {
                var next = $(cells[i]);
                var field = next.data('field');
                var meta  = this.FIELD_META[field];

                if (!meta) continue;
                if (meta.readonly === true) continue;
                if (meta.calculationLoadBinder) continue;
                if (meta.isHidden === true) continue;

                return next;
            }
            return null;
        },

        save: function () {
            if (!this.editingCell || this.isSaving) return;

            var editor = this.editingCell.find('.cell-editor');
            var newValue = editor.val();

            if (newValue === this.originalValue) {
                this.reset();
                showToast('No changes detected', 'info');
                return;
            }

            this.doSave(newValue);
        },

        doSave: function (newValue) {
            var self = this;
            self.isSaving = true;

            var cell = self.editingCell;
            var field = cell.data('field');
            var id    = cell.data('id');
            var meta  = cell.data('meta');
            var formId = self.formDefId;
            if(meta.isSubForm){
                formId = meta.formDefId;
            }

            var row = self.table.row(cell.closest('tr'));
            var rowData = self.calculatedRowData
                ? $.extend({}, self.calculatedRowData)
                : $.extend({}, row.data());

            rowData[field] = newValue;

            var body = { id: id };

            Object.keys(self.FIELD_META).forEach(function (f) {
                if (rowData[f] != null) {
                    body[f] = rowData[f];
                }
            });

            $.ajax({
                url: self.BASE_URL + formId,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(body),

                success: function () {
                    $.each(body, function (field, value) {
                        self.commitRowChange(field, value);
                    });

                    self.calculatedRowData = null;
                    self.applyValue(cell, newValue, meta);
                    cell.addClass('saved');

                    showToast('Changes saved successfully', 'success');
                    self.reset();
                },

                error: function () {
                    self.restoreRow();
                    showToast('Failed to save changes', 'error');
                }
            });
        },

        commitRowChange: function (field, value) {
            var row = this.table.row(this.editingCell.closest('tr'));
            var data = row.data();
            data[field] = value;
            row
                .data(data)
                .invalidate();
        },

        cancel: function () {
            if (!this.editingCell || this.isSaving) return;
            this.restoreRow();
            showToast('Edit cancelled', 'info');
        },

        restoreRow: function () {
            var row = this.table.row(this.editingCell.closest('tr'));
            var self = this;

            row.data(this.originalRowData);

            Object.keys(this.FIELD_META).forEach(function (f) {
                var meta = self.FIELD_META[f];
                if (meta.isHidden) return;
                var cell = self.findCellByField(f, row);
                if (cell) self.applyValue(cell, self.originalRowData[f], meta);
            });

            this.reset();
        },

        reset: function () {
            this.editingCell = null;
            this.originalRowData = null;
            this.isSaving = false;
        },

        /* ================= DELETE ================= */

        onDelete: function (row) {
            debugger;
            var self = this;
            if (!self.editable) return;

            if (self.isSaving) return;

            var data = self.table.row(row).data();
            if (!data || !data.id) return;

            showConfirm(
                {
                    title: 'Delete Confirmation',
                    message: 'Are you sure you want to delete this record?'
                },
                function () {
                    self.doDelete(data.id, row);
                },
                function () {
                    showToast('Delete cancelled', 'info');
                }
            );
        },

        doDelete: function (id, row) {
            var self = this;
            self.isSaving = true;
            var formId = self.formDefId;

            $.ajax({
                url: self.BASE_URL + formId + '/' + id,
                type: 'DELETE',

                success: function () {
                    self.table.row(row).remove().draw(false);
                    showToast('Record deleted successfully', 'success');
                    self.isSaving = false;
                },

                error: function () {
                    showToast('Failed to delete record', 'error');
                    self.isSaving = false;
                }
            });
        },

        /* ================= ADD ROW (JPOPUP) ================= */

        openAddForm: function () {
            if (!this.formDefIdCreate) return;

            this.popupForm(
                this.formDefIdCreate,
                JSON.parse(this.jsonForm),
                this.nonce,
                {},
                {},
                900,
                800
            );
        },

        popupForm: function (elementId, jsonForm, nonce, args, data, width, height) {
            var self = this;

            var frameId = args.frameId = 'Frame_' + elementId;
            var formUrl = self.ADD_BASE_URL + '&_mode=add';
            formUrl += UI.userviewThemeParams();

            var params = {
                _json: JSON.stringify(jsonForm || {}),
                _callback: 'DataTablesEditor.onSubmitted',
                _setting: JSON.stringify(args || {}).replace(/"/g, "'"),
                _jsonrow: JSON.stringify(data || {}),
                _nonce: nonce
            };

            JPopup.show(frameId, formUrl, params, '', width, height);
        },

        onSubmitted: function (args) {
            try {
                JPopup.hide(args.frameId);
            } catch (e) {}

            if (this.table) {
                this.table.ajax.reload(null, false);
            }

            showToast('Data added successfully', 'success');
        },

        /* ================= UI HELPERS ================= */

        applyValue: function (cell, value, meta) {
            var text = value;

            if (meta.type === 'select') {
                (meta.options || []).forEach(function (o) {
                    if (o.value == value) text = o.label;
                });
            }
            else if (meta.formatter) {
                text = this.formatNumber(value, meta);
            }

            cell
                .attr('data-value', value)
                .html(text)
                .removeClass('editing');
        },

        fieldCalcMap: function () {
            var map = {};

            Object.keys(this.FIELD_META).forEach(function (field) {
                var calc = DataTablesEditor.FIELD_META[field].calculationLoadBinder;
                if (!calc || !calc.variables) return;

                calc.variables.forEach(function (v) {
                    map[v.variableName] = map[v.variableName] || [];
                    map[v.variableName].push(field);
                });
            });

            this.fieldCalculateMap = map;
        },

        buildEditor: function (type, value, meta) {
            value = value ?? '';

            switch (type) {
                case 'textarea':
                    return $('<textarea class="cell-editor"/>').val(value);

                case 'select':
                    var sel = $('<select class="cell-editor"/>');
                    (meta.options || []).forEach(function (o) {
                        sel.append(
                            $('<option/>').val(o.value).text(o.label)
                        );
                    });
                    return sel.val(value);

                case 'number':
                    return $('<input type="number" class="cell-editor"/>').val(value);

                case 'date':
                    return $('<input type="date" class="cell-editor"/>').val(value);

                default:
                    return $('<input type="text" class="cell-editor"/>').val(value);
            }
        },

        /* ================= LIVE CALCULATION ================= */
        liveCalculate: function () {
            if (!this.editingCell) return;

            var self = this;
            var row = this.table.row(this.editingCell.closest('tr'));
            var rowData = $.extend({}, row.data());

            var editedField = this.editingCell.data('field');
            var editorVal   = this.editingCell.find('.cell-editor').val();

            rowData[editedField] = editorVal || '0';

            var calcFields = this.fieldCalculateMap[editedField] || [];
            if (!calcFields.length) return;

            calcFields.forEach(function (field) {
                self.calculateField(field, row, rowData);
            });
        },

        calculateField: function (field, row, rowData) {
            var self = this;
            var meta = this.FIELD_META[field];
            var calc = meta.calculationLoadBinder;

            if (!calc || !calc.variables) return;

            var params = {};
            calc.variables.forEach(function (v) {
                params[v.variableName] = self.normalizeNumber(rowData[v.variableName])|| 0;
            });

            var formId = self.formDefId;
            if (meta.isSubForm){
                formId = meta.formDefId;
            }

            $.ajax({
                url: self.SERVICE_URL,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    formDefId: formId,
                    fieldId: field,
                    primaryKey: rowData.id,
                    requestParams: params
                }),

                success: function (res) {
                    if (!res || res.value == null) return;

                    rowData[field] = res.value;

                    self.calculatedRowData = $.extend({}, rowData);

                    if (!meta.isHidden) {
                        var cell = self.findCellByField(field, row);
                        if (cell && !cell.hasClass('editing')) {
                            self.applyValue(cell, res.value, meta);
                        }
                    }

                    var nextCalcField = self.fieldCalculateMap[field] || [];
                    nextCalcField.forEach(function (f) {
                        self.calculateField(f, row, rowData);
                    });
                },

                error: function () {
                    console.warn('Calculation failed:', field);
                }
            });
        },

        normalizeNumber: function (val) {
            if (val == null) return 0;

            if (typeof val === 'number') return val;

            val = String(val).trim();
            if (!val) return 0;

            val = val.replace(/\s+/g, '');

            const hasComma = val.indexOf(',') !== -1;
            const hasDot   = val.indexOf('.') !== -1;

            if (hasComma && hasDot) {
                if (val.lastIndexOf(',') > val.lastIndexOf('.')) {
                    // 50.000,00 → EU
                    val = val.replace(/\./g, '').replace(',', '.');
                } else {
                    // 50,000.00 → US
                    val = val.replace(/,/g, '');
                }
            } else if (hasComma) {
                // 50000,00 → decimal
                val = val.replace(',', '.');
            } else {
                // 50000.00 or 50000
                val = val;
            }

            var num = parseFloat(val);
            return isNaN(num) ? 0 : num;
        },

        formatNumber: function (value, meta) {
            if (value == null || value === '') return '';

            var num = this.normalizeNumber(value);
            if (isNaN(num)) return value;

            var fmt = meta.formatter;
            if (!fmt) return num;

            var decimals = parseInt(fmt.numOfDecimal ?? 0, 10);
            var useThousand = fmt.useThousandSeparator === true;
            var style = fmt.style || 'us'; // us | euro

            var parts = num.toFixed(decimals).split('.');
            var intPart = parts[0];
            var decPart = parts[1] || '';

            if (useThousand) {
                intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g,
                    style === 'euro' ? '.' : ','
                );
            }

            if (decimals > 0) {
                return style === 'euro'
                    ? intPart + ',' + decPart
                    : intPart + '.' + decPart;
            }

            return intPart;
        },

        findCellByField: function (field, row) {
            var cell = null;
            row.nodes().to$().find('td').each(function () {
                if ($(this).data('field') === field) {
                    cell = $(this);
                    return false;
                }
            });
            return cell;
        }
    };

})();
