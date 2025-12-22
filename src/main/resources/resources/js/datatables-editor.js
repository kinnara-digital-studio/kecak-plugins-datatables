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

        // add form
        formDefId: null,
        jsonForm: null,
        nonce: null,
        ADD_BASE_URL: null,

        editingCell: null,
        originalValue: '',
        isSaving: false,

        /* ================= INIT ================= */

        init: function (opts) {
            this.table       = opts.table;
            this.FIELD_META  = opts.fieldMeta;
            this.editable    = opts.editable;
            this.BASE_URL    = opts.baseUrl;

            // add form (optional)
            this.formDefId   = opts.formDefId;
            this.jsonForm    = opts.jsonForm;
            this.nonce       = opts.nonce;
            this.ADD_BASE_URL = opts.addBaseUrl;

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
                    self.editingCell?.next('td[data-field]').trigger('click');
                }
            });

            // esc cancel
            $(document).on('keydown', function (e) {
                if (e.key === 'Escape') self.cancel();
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
                DataTablesEditor.liveCalculate();
            });
        },

        /* ================= INLINE EDIT ================= */

        onCellClick: function (cell) {
            if (this.editable === false) return;

            if (this.editingCell || this.isSaving) return;

            var field = cell.data('field');
            var meta  = this.FIELD_META[field];
            if (!meta || meta.readonly === true || meta.calculationLoadBinder || meta.isHidden === true) return;

            this.editingCell  = cell;
            this.originalValue =
                cell.attr('data-value') ?? $.trim(cell.text());

            cell
                .addClass('editing')
                .data('meta', meta)
                .empty()
                .append(this.buildEditor(meta.type, this.originalValue, meta))
                .find('.cell-editor')
                .focus();
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

            var row = self.table.row(cell.closest('tr'));
            var rowData = $.extend({}, row.data());

            rowData[field] = newValue;

            // update calculation fields (jika ada)
            self.applyCalculations(rowData);

            var body = { id: id };
            body[field] = newValue;
            $.each(self.FIELD_META, function (f) {
                if (f !== field && rowData[f] != null) {
                    body[f] = rowData[f];
                }
            });

            $.ajax({
                url: self.BASE_URL,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(body),

                success: function () {
                    $.each(body, function (field, value) {
                        self.commitRowChange(field, value);
                    });
                    self.applyValue(cell, newValue, meta);
                    cell.addClass('saved');
                    showToast('Changes saved successfully', 'success');
                    self.reset();
                },

                error: function () {
                    self.rollback();
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
            this.rollback();
            showToast('Edit cancelled', 'info');
        },

        rollback: function () {
            if (!this.editingCell) return;
            var meta = this.editingCell.data('meta');
            this.applyValue(this.editingCell, this.originalValue, meta);
            this.markCancelled(this.editingCell);
            this.reset();
        },

        reset: function () {
            this.editingCell = null;
            this.originalValue = '';
            this.isSaving = false;
        },

        /* ================= DELETE ================= */

        onDelete: function (row) {
            if (!window.CAN_EDIT) return;

            var self = this;
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

            $.ajax({
                url: self.BASE_URL + '/' + id,
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
            if (!this.formDefId) return;

            this.popupForm(
                this.formDefId,
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

            cell
                .attr('data-value', value)
                .html(text)
                .removeClass('editing');
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

        liveCalculate: function () {
            if (!this.editingCell) return;

            var self = this;

            var row = this.table.row(this.editingCell.closest('tr'));
            var rowData = $.extend({}, row.data());

            var editedField = this.editingCell.data('field');
            var editorVal   = this.editingCell.find('.cell-editor').val();

            rowData[editedField] = editorVal || '0';

            var calcFields = Object.keys(this.FIELD_META).filter(function (f) {
                return self.FIELD_META[f].calculationLoadBinder &&
                       self.FIELD_META[f].calculationLoadBinder.equation;
            });

            for (var pass = 0; pass < calcFields.length; pass++) {
                calcFields.forEach(function (field) {
                    var meta = self.FIELD_META[field];
                    var eq   = meta.calculationLoadBinder.equation;

                    try {
                        rowData[field] = self.evaluateEquation(eq, rowData);
                    } catch (e) {
                        console.warn('Live calc failed:', field, e);
                    }
                });
            }

            calcFields.forEach(function (field) {
                var meta = self.FIELD_META[field];

                if (meta.isHidden === true) return;
                if (field === editedField) return;

                var cell = self.findCellByField(field, row);
                if (!cell || cell.hasClass('editing')) return;

                self.applyValue(cell, rowData[field], meta);
            });
        },

        evaluateEquation: function (equation, rowData) {
            var expr = equation;

            Object.keys(rowData).forEach(function (key) {
                var value = rowData[key];
                if (value === undefined || value === null || value === '') {
                    value = '0';
                }
                expr = expr.replace(
                    new RegExp('\\b' + key + '\\b', 'g'),
                    'new Decimal("' + value + '")'
                );
            });

            try {
                return eval(expr).toString();
            } catch (e) {
                console.error('Equation error:', equation, rowData);
                return '0';
            }
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
        },

        applyCalculations: function (rowData) {
            var self = this;

            // Ambil hanya field yang punya calculation
            var calcFields = Object.keys(self.FIELD_META).filter(function (field) {
                return self.FIELD_META[field].calculationLoadBinder &&
                       self.FIELD_META[field].calculationLoadBinder.equation;
            });

            // Multi-pass supaya dependency resolve tanpa hardcode
            for (var pass = 0; pass < calcFields.length; pass++) {
                calcFields.forEach(function (field) {
                    var meta = self.FIELD_META[field];
                    var equation = meta.calculationLoadBinder.equation;

                    rowData[field] = self.evaluateEquation(equation, rowData);
                });
            }
        },

        markCancelled: function (cell) {
            cell.addClass('edit-cancelled');
            setTimeout(function () {
                cell.removeClass('edit-cancelled');
            }, 800);
        }
    };

})();
