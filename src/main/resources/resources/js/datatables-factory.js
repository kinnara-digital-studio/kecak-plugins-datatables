/**
 * DataTable Factory
 * Build DataTable instance based on menuType
 * @author: tiyojati
 */
(function () {

    if (window.DataTableFactory) return;

    window.DataTableFactory = {

        /* ================= CONSTANT ================= */
        MENU_TYPE: {
            DATALIST: 'datalistMenu',
            INBOX: 'inboxMenu',
            INLINE_GRID: 'inlineGrid'
        },

        /* ================= STATE ================= */
        menuType: null,

        /* ================= CREATE TABLE ================= */
        create: function (opts) {
            if (!opts || !opts.menuType) {
                throw new Error('menuType is required');
            }
            this.menuType = this.normalizeMenuType(opts.menuType);

            var isInlineGrid = this.menuType === this.MENU_TYPE.INLINE_GRID;

            var dtOpts = {
                processing: true,
                serverSide: false,
                searching: false,
                columns: this.buildColumns(opts)
            };

            if (!isInlineGrid) {
                dtOpts.dom = 'Bfrtip';
                dtOpts.ajax = this.buildAjax(opts);
                dtOpts.buttons = this.buildButtons(opts);
            } else {
                dtOpts.dom = 't';
                dtOpts.ordering = false;
                dtOpts.data = opts.data || [];
            }

            var $table = opts.tableElement
                ? $(opts.tableElement)
                : $('#inlineTable');

            return $table.DataTable(dtOpts);
        },

        /* ================= AJAX ================= */
        buildAjax: function (opts) {
            if (this.menuType === this.MENU_TYPE.INLINE_GRID) {
                return null;
            }

            if (this.menuType === this.MENU_TYPE.DATALIST) {
                return {
                    url: opts.baseUrl + opts.dataUrl,

                    dataSrc: function (json) {
                        return json && Array.isArray(json.data) ? json.data : [];
                    }
                };
            }

            if (this.menuType === this.MENU_TYPE.INBOX) {
                return {
                    url: opts.baseUrl + opts.dataUrl,

                    dataSrc: function (json) {
                        return json && Array.isArray(json.data) ? json.data : [];
                    },

                    data: function (d) {
                        d.action = 'getDatalist';
                        d.dataListId = opts.dataListId;
                        d.assignmentFilter = opts.assignmentFilter;
                        d.processId = opts.processId || '';
                        d.activityDefIds = opts.activityDefIds || '';
                    }
                };
            }
        },

        /* ================= COLUMNS ================= */
        buildColumns: function (opts) {
            var self = this;
            var cols = [];

            opts.columns.forEach(function (col) {
                cols.push(self.buildDataColumn(col, self.menuType, opts.fieldMeta));
            });

            // ===== ACTION COLUMN =====
            if (self.menuType === self.MENU_TYPE.DATALIST) {
                cols.push(self.buildDeleteColumn());
            }

            if (self.menuType === self.MENU_TYPE.INLINE_GRID) {
                cols.push(self.buildInlineGridDeleteColumn());
            }

            if (self.menuType === self.MENU_TYPE.INBOX) {
                cols.push(self.buildWorkflowActionColumn(opts));
            }

            return cols;
        },

        buildDataColumn: function (col, menuType, fieldMeta) {
            return {
                data: menuType === this.MENU_TYPE.DATALIST || menuType === this.MENU_TYPE.INLINE_GRID ? col.name : null,

                render:
                    menuType === this.MENU_TYPE.INBOX
                        ? function (data, type, row) {
                            return row && row[col.name] !== undefined
                                ? row[col.name]
                                : '';
                        }
                        : undefined,

                createdCell: this.createCellRenderer(col.name, fieldMeta, menuType)
            };
        },

        buildDeleteColumn: function () {
            return {
                data: null,
                orderable: false,
                searchable: false,
                className: 'col-action',
                width: '5px',
                render: function () {
                    return '<i class="fa-solid fa-trash cell-delete" title="Delete"></i>';
                }
            };
        },

        buildInlineGridDeleteColumn: function () {
            return {
                data: null,
                orderable: false,
                searchable: false,
                className: 'dt-action-col',
                width: '5px',
                render: function () {
                    return '<span class="fa-solid fa-trash dt-row-delete" title="Delete"></span>';
                }
            };
        },

        buildWorkflowActionColumn: function (opts) {
            return {
                title: 'Action',
                data: null,
                orderable: false,
                searchable: false,
                className: 'col-action',
                width: '30px',
                render: function (data, type, row) {
                    if (!row || !row.id) return '';

                    var html =
                        '<div class="dt-action-wrapper" data-activity-id="' +
                        (row.activityId || '') +
                        '">';

                    html += '<select class="dt-action-select">';
                    html += '<option value=""></option>';

                    (opts.workflowVariables || []).forEach(function (o) {
                        html +=
                            '<option value="' +
                            o.value +
                            '">' +
                            o.label +
                            '</option>';
                    });

                    html += '</select>';
                    html += '<button type="button" class="dt-action-submit">Submit</button>';
                    html += '</div>';

                    return html;
                }
            };
        },

        /* ================= BUTTONS ================= */
        buildButtons: function (opts) {
            var buttons = [];

            if (this.menuType !== this.MENU_TYPE.DATALIST) {
                return buttons;
            }

            if (opts.canEdit === true) {
                buttons.push({
                    text: '<i class="fa fa-plus"></i> Add',
                    init: function (api, node) {
                        $(node).attr('id', 'btnAddRow');
                    }
                });
            }

            buttons.push({
                text: '<i class="fa fa-refresh "/>',
                action: function () {
                    api = $('#inlineTable').DataTable();
                    api.ajax.reload();
                }
            });

            return buttons;
        },

        /* ================= NORMALIZER ================= */
        normalizeMenuType: function (type) {
            return Object.values(this.MENU_TYPE).includes(type)
                ? type
                : this.MENU_TYPE.DATALIST;
        },

        /* ================= CELL RENDERER ================= */
        createCellRenderer: function (fieldName, fieldMeta, menuType) {
            return function (td, cellData, rowData) {
                var meta = fieldMeta?.[fieldName] || {};
                var value = rowData?.[fieldName] ?? '';

                $(td).attr('data-value', value);

                if (meta.type === 'select') {
                    var label = value;
                    (meta.options || []).forEach(function (o) {
                        if (o.value === value) label = o.label;
                    });
                    $(td).text(label);
                }else if (meta.formatter) {
                    if (menuType === 'inlineGrid'){
                        $(td).text(
                            InlineGridController.formatNumber(value, meta)
                        );
                    }else {
                        $(td).text(
                            DataTableController.formatNumber(value, meta)
                        );
                    }
                } else {
                    $(td).text(value);
                }

                $(td)
                    .attr('data-field', fieldName)
                    .attr('data-id', rowData.id)
                    .attr('data-type', meta.type || 'text')
                    .toggleClass(
                        'readonly',
                        meta.readonly === true ||
                        meta.calculationLoadBinder ||
                        meta.isHidden === true
                    );
            };
        }
    };
})();
