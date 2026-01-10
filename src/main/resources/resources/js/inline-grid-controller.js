/**
 * Inline Grid DataTables Controller
 * @author: tiyojati
 */
(function () {

    if (window.InlineGridController) return;

    window.InlineGridController = {

        /* ================= STATE ================= */
        table: null,
        tableEl: null,

        FIELD_META: null,
        FIELD_MAP: null,
        elementId: null,
        elementParamName: null,
        formGridId: null,

        BASE_URL: null,
        CALCULATION_URL: null,
        fieldCalculateMap: null,
        formDefId: null,

        /* ================= INIT ================= */
        init: function (opts) {
            if (!opts || !opts.table) {
                throw new Error('DataTable instance is required');
            }

            this.table            = opts.table;
            this.tableEl          = $(this.table.table().node());
            this.elementId        = opts.elementId;
            this.elementParamName = opts.elementParamName;
            this.formGridId       = opts.formGridId;
            this.FIELD_META       = opts.fieldMeta || {};
            this.formDefId        = opts.formDefId;
            this.BASE_URL         = opts.baseUrl;
            this.CALCULATION_URL  = opts.calculationUrl;

            this.FIELD_MAP = opts.fieldMap
                ? opts.fieldMap
                : this.buildFieldMapFromColumns(opts.columns);

            this.fieldCalcMap();
            this.bind();
            this.updateRowCount();
        },

        buildFieldMapFromColumns: function (columns) {
            var map = [];

            (columns || []).forEach(function (col) {
                if (col && col.name) {
                    map.push(col.name);
                } else {
                    map.push(null);
                }
            });

            return map;
        },

        /* ================= EVENTS ================= */
        bind: function () {
            var self = this;

            $(document).on('click', '.dt-add-row', function () {
                self.addRow();
            });

            self.tableEl.on('click', '.dt-row-delete', function () {
                self.deleteRow($(this).closest('tr'));
            });

            self.tableEl.on('click', 'tbody td', function () {
                self.onCellClick($(this));
            });

            // $(document).on('input change', '.cell-editor', function () {
            //     self.liveCalculate();
            // });
        },

        /* ================= ADD ROW ================= */
        addRow: function () {
            var self = this;

            var emptyRow = {};
            self.FIELD_MAP.forEach(function (f) {
                if (f) emptyRow[f] = '';
            });

            var node = self.table.row.add(emptyRow).draw(false).node();
            var rowIndex = self.table.row(node).index();

            $(node).attr('id', self.formGridId + '_row_' + rowIndex);

            self.appendJsonRow(node, rowIndex);
            self.updateRowCount();
        },

        appendJsonRow: function (row, rowIndex) {
            var json = {};
            Object.keys(this.FIELD_META).forEach(function (k) {
                json[k] = '';
            });

            $(row).append(
                '<td style="display:none;">' +
                '<textarea name="' +
                this.elementParamName + '_jsonrow_' + rowIndex +
                '">' +
                JSON.stringify(json) +
                '</textarea></td>'
            );
        },

        updateRowCount: function () {
            $('#rowCount').val(this.table.rows().count());
        },

        /* ================= DELETE ================= */
        deleteRow: function (row) {
            if (!confirm('Delete row?')) return;

            this.table.row(row).remove().draw(false);
            this.updateRowCount();
        },

        /* ================= INLINE EDIT ================= */
        onCellClick: function ($td) {
            var self = this;

            if ($td.hasClass('editing')) return;
            if ($td.find('input,textarea,select').length) return;

            var idx = self.table.cell($td).index();
            if (!idx) return;

            var field = self.FIELD_MAP[idx.column];
            if (!field) return;

            var meta = self.FIELD_META[field];
            if (!meta || meta.readonly || meta.calculationLoadBinder || meta.isHidden) return;

            /* ================= SET EDITING CELL (INI YANG HILANG) ================= */
            self.editingCell = $td;

            var rowIndex = idx.row;
            var rowData  = self.table.row(rowIndex).data();
            var oldValue = rowData[field] ?? '';

            $td.addClass('editing');

            var $editor = self.createInlineEditor($td, oldValue, meta);

            $editor.on('keydown', function (e) {
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    self.commit($td, field, rowIndex, $editor.val());
                    self.editingCell = null;
                }

                if (e.key === 'Escape') {
                    $td.removeClass('editing').text(oldValue);
                    self.editingCell = null;
                }
            });
        },

        commit: function ($td, field, rowIndex, newValue) {
            var self = this;
            var meta = self.FIELD_META[field] || {};

            /* ================= RAW VALUE (UNTUK DATA & JSON) ================= */
            var rawValue = newValue;

            if (meta.formatter || meta.type === 'number') {
                rawValue = self.normalizeNumber(newValue);
            }

            /* ================= UPDATE ROW DATA (RAW) ================= */
            var rowData = self.table.row(rowIndex).data();
            rowData[field] = rawValue;

            /* ================= APPLY DISPLAY (FORMAT ONLY) ================= */
            self.applyValue($td, rawValue, meta); // 👈 formatter di sini

            /* ================= SYNC JSON (RAW ONLY) ================= */
            self.syncJsonRow(rowIndex, field, rawValue);

            /* ================= LIVE CALCULATE ================= */
            self.liveCalculate(field, rowIndex, rowData);
        },

        syncJsonRow: function (rowIndex, field, value) {
            var $ta = $('textarea[name="' +
                this.elementParamName + '_jsonrow_' + rowIndex + '"]');

            if (!$ta.length) return;

            try {
                var json = JSON.parse($ta.val());
                json[field] = value;
                $ta.val(JSON.stringify(json));
            } catch (e) {
                console.error('jsonrow sync failed', e);
            }
        },

        /* ================= EDITOR ================= */
        createInlineEditor: function ($td, value, meta) {
            var $editor = this.buildEditor(meta.type, value, meta);

            $td.empty().append($editor);
            $editor.focus();

            return $editor;
        },

        buildEditor: function (type, value, meta) {
            value = value ?? '';

            switch (type) {
                case 'textarea':
                    return $('<textarea class="cell-editor"/>').val(value);

                case 'select':
                    var $s = $('<select class="cell-editor"/>');
                    (meta.options || []).forEach(function (o) {
                        $('<option/>').val(o.value).text(o.label).appendTo($s);
                    });
                    return $s.val(value);

                case 'number':
                    return $('<input type="number" class="cell-editor"/>').val(value);

                case 'date':
                    return $('<input type="date" class="cell-editor"/>').val(value);

                default:
                    return $('<input type="text" class="cell-editor"/>').val(value);
            }
        },

        /* ================= CALCULATION ================= */
        fieldCalcMap: function () {
            var map = {};
            var self = this;

            Object.keys(this.FIELD_META).forEach(function (field) {
                var calc = self.FIELD_META[field].calculationLoadBinder;
                if (!calc || !calc.variables) return;

                calc.variables.forEach(function (v) {
                    map[v.variableName] = map[v.variableName] || [];
                    map[v.variableName].push(field);
                });
            });

            this.fieldCalculateMap = map;
        },

        liveCalculate: function (field, rowIndex, rowData) {
            var self = this;

            var calcFields = self.fieldCalculateMap[field];
            if (!calcFields || !calcFields.length) return;

            calcFields.forEach(function (targetField) {
                self.calculateField(targetField, rowIndex, rowData);
            });
        },

        calculateField: function (field, rowIndex, rowData) {
            var self = this;

            var meta = self.FIELD_META[field];
            var calc = meta && meta.calculationLoadBinder;
            if (!calc || !calc.variables) return;

            var params = {};
            calc.variables.forEach(function (v) {
                params[v.variableName] =
                    self.normalizeNumber(rowData[v.variableName]) || 0;
            });

            $.ajax({
                url: self.BASE_URL + self.CALCULATION_URL + '?action=calculate',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    formDefId: self.formDefId,
                    fieldId: field,
                    primaryKey: rowData.id || 'id',
                    requestParams: params
                }),

                success: function (res) {
                    if (!res || res.value == null) return;

                    rowData[field] = res.value;
                    self.syncJsonRow(rowIndex, field, res.value);

                    var colIndex = self.FIELD_MAP.indexOf(field);
                    if (colIndex !== -1) {
                        var cell = $(self.table.cell(rowIndex, colIndex).node());
                        if (!cell.hasClass('editing')) {
                            self.applyValue(cell, res.value, meta);
                        }
                    }

                    var next = self.fieldCalculateMap[field] || [];
                    next.forEach(function (f) {
                        self.calculateField(f, rowIndex, rowData);
                    });
                },

                error: function () {
                    console.warn('InlineGrid calculation failed:', field);
                }
            });
        },

        applyValue: function ($cell, value, meta) {
            var self = this;
            var display = value ?? '';

            /* ================= SELECT ================= */
            if (meta.type === 'select') {
                display = '';

                (meta.options || []).some(function (o) {
                    if (String(o.value) === String(value)) {
                        display = o.label;
                        return true;
                    }
                    return false;
                });
            }

            /* ================= NUMBER / FORMATTER ================= */
            else if (meta.formatter && typeof self.formatNumber === 'function') {
                display = self.formatNumber(value, meta);
            }

            /* ================= CHECKBOX ================= */
            else if (meta.type === 'checkbox') {
                display = value === 'true' || value === true
                    ? '<i class="fa fa-check"></i>'
                    : '';
            }

            /* ================= DEFAULT ================= */
            else {
                display = String(display);
            }

            /* ================= APPLY ================= */
            $cell
                .attr('data-value', value ?? '')
                .html(display)
                .removeClass('editing');
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
        }

    };

})();
