/**
 * DataTables Factory
 * Build DataTables instance based on menuType
 * @author: tiyojati
 */
(function () {

    if (window.DataTablesFactory) return;

    window.DataTablesFactory = {

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
                autoWidth: false,
                columns: this.buildColumns(opts)
            };

            /* ================= DATA SOURCE ================= */
            if (!isInlineGrid) {
                dtOpts.pageLength = 20;
                dtOpts.lengthChange = false;
                dtOpts.ajax = this.buildAjax(opts);
                dtOpts.layout = {
                    topStart: () => $('.dt-toolbar'),
                    topEnd: null,
                    bottomStart: 'info',
                    bottomEnd: 'paging'
                };
            } else {
                dtOpts.data = opts.data || [];
                dtOpts.ordering = false;
                dtOpts.info = false;
                dtOpts.paging = false;
                dtOpts.lengthChange = false;
                dtOpts.language = {
                    emptyTable: '',
                    zeroRecords: ''
                };
                dtOpts.layout = {
                    topStart: null,
                    topEnd: null,
                    bottomStart: null,
                    bottomEnd: null
                };
            }

            var tableEl = opts.tableElement || '#inlineTable';

            /* ================= INIT  ================= */
            var table = new DataTable(tableEl, dtOpts);

            /* ================= TOGGLE INFO & PAGING ================= */
            if (!isInlineGrid) {
                this.toggleDtInfoPaging(table);

                table.on('draw', function () {
                    DataTablesFactory.toggleDtInfoPaging(table);
                });
            }

            /* ================= STORE INSTANCE ================= */
            this.table = table;

            /* ================= INIT CUSTOM TOOLBAR ================= */
            if (!isInlineGrid) {
                this.initCustomToolbar(opts);
            }

            return table;
        },

        initCustomToolbar: function (opts) {
            var self = this;

            if (opts.canEdit === true) {
                $('#btnAddRow')
                    .show()
                    .off('click')
                    .on('click', function () {
                        self.openAddForm();
                    });
            } else {
                $('#btnAddRow').hide();
            }

            $('#btnReload')
                .off('click')
                .on('click', function () {
                    if (self.table) {
                        self.table.ajax.reload(null, false);
                    }
                });
        },

        toggleDtInfoPaging: function (table) {
            var info = table.page.info();
            var hasData = info.recordsDisplay > 0;

            var $wrapper = $(table.table().container());

            $wrapper.find('.dt-info').toggle(hasData);
            $wrapper.find('.dt-paging').toggle(hasData);
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
            if (self.menuType === self.MENU_TYPE.DATALIST || self.menuType === self.MENU_TYPE.INLINE_GRID) {
                cols.push(self.buildDeleteColumn());
            }

            if (self.menuType === self.MENU_TYPE.INBOX) {
                cols.push(self.buildWorkflowActionColumn(opts));
            }

            return cols;
        },

        buildDataColumn: function (col, menuType, fieldMeta) {
            var self = this;
            return {
                data: col.name,
                name: col.name,
                render: function (data, type, row) {
                    const meta = fieldMeta?.[col.name] || {};
                    const value = data;
                    if (type === 'display') {
                        if (value === null || value === undefined || value === '') {
                            return '';
                        }
                        if (meta.type === 'select') {
                            const opt = (meta.options || [])
                                .find(o => String(o.value) === String(value));
                            return opt ? opt.label : '';
                        }else if (meta.formatter) {
                            return self.formatNumber(value, meta);
                        }
                        return value;
                    }
                    return value;
                },

                createdCell: function (td, cellData, rowData) {
                    const meta = fieldMeta?.[col.name] || {};

                    $(td)
                        .attr('data-id', rowData.id)
                        .attr('data-field', col.name)
                        .attr('data-value', cellData ?? '')
                        .attr('data-type', meta.type || 'text')
                        .toggleClass(
                            'readonly',
                            meta.readonly === true ||
                            meta.calculationLoadBinder ||
                            meta.isHidden === true
                        );
                }
            };
        },

        buildDeleteColumn: function () {
            return {
                data: null,
                orderable: false,
                searchable: false,
                className: 'dt-action-col',
                width: '40px',
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
                className: 'dt-action-inbox',
                width: '165px',
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

        /* ================= NORMALIZER ================= */
        normalizeMenuType: function (type) {
            return Object.values(this.MENU_TYPE).includes(type)
                ? type
                : this.MENU_TYPE.DATALIST;
        },

        normalizeNumber: function (val) {
            if (val == null) return null;
            if (typeof val === 'number') return val;

            val = String(val).trim();
            if (!val) return null;

            val = val.replace(/\s+/g, '');

            const hasComma = val.includes(',');
            const hasDot   = val.includes('.');

            if (hasComma && hasDot) {
                if (val.lastIndexOf(',') > val.lastIndexOf('.')) {
                    // EU
                    val = val.replace(/\./g, '').replace(',', '.');
                } else {
                    // US
                    val = val.replace(/,/g, '');
                }
            } else if (hasComma) {
                val = val.replace(',', '.');
            }

            const num = parseFloat(val);
            return isNaN(num) ? null : num;
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

        ensureDateString: function (value) {
            if (!value) return '';

            // sudah DD/MM/YYYY
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
                return value;
            }

            // ISO string YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                const [yyyy, mm, dd] = value.split('-');
                return `${dd}/${mm}/${yyyy}`;
            }

            // Date object
            if (value instanceof Date) {
                const dd = String(value.getDate()).padStart(2, '0');
                const mm = String(value.getMonth() + 1).padStart(2, '0');
                const yyyy = value.getFullYear();
                return `${dd}/${mm}/${yyyy}`;
            }

            return String(value);
        }
    };
})();
