/**
 * DataTables Factory
 * Build DataTables instance based on menuType
 * @author: tiyojati
 */
(function () {
    if (window.DataTablesFactory) return;

    window.DataTablesFactory = {
        /* ================= CONSTANTS ================= */
        MENU_TYPE: {
            DATALIST: 'datalistMenu',
            INBOX: 'inboxMenu',
            INLINE_GRID: 'inlineGrid'
        },

        /* ================= STATE ================= */
        table: null,
        menuType: null,

        /* ================= CREATE TABLE ================= */
        create: function (opts) {
            if (!opts?.menuType) {
                throw new Error('DataTablesFactory: menuType is required');
            }

            this.menuType = this.normalizeMenuType(opts.menuType);
            const isInlineGrid = this.menuType === this.MENU_TYPE.INLINE_GRID;
            const tableEl = opts.tableElement || '#inlineTable';

            // Base Configuration
            const dtOpts = {
                processing: true,
                serverSide: false,
                searching: false,
                autoWidth: false,
                columns: this.buildColumns(opts),
                lengthChange: false
            };

            // config based on Menu Type
            if (isInlineGrid) {
                this._applyInlineGridConfig(dtOpts, opts);
            } else {
                this._applyStandardConfig(dtOpts, opts);
            }

            /* ================= INITIALIZATION ================= */
            const table = new DataTable(tableEl, dtOpts);
            this.table = table;

            if (!isInlineGrid) {
                this._initStandardFeatures(table, opts);
            }

            return table;
        },

        /* ================= CONFIG ================= */
        _applyStandardConfig: function(dtOpts, opts) {
            dtOpts.pageLength = 20;
            dtOpts.ajax = this.buildAjax(opts);
            dtOpts.layout = {
                topStart: () => $('.dt-toolbar'),
                topEnd: null,
                bottomStart: 'info',
                bottomEnd: 'paging'
            };
        },

        _applyInlineGridConfig: function(dtOpts, opts) {
            dtOpts.data = opts.data || [];
            dtOpts.ordering = false;
            dtOpts.info = false;
            dtOpts.paging = false;
            dtOpts.language = { emptyTable: '', zeroRecords: '' };
            dtOpts.layout = {
                topStart: null,
                topEnd: null,
                bottomStart: () => $('.dt-toolbar'),
                bottomEnd: null
            };
        },

        _initStandardFeatures: function(table, opts) {
            this.toggleDtInfoPaging(table);
            table.on('draw', () => this.toggleDtInfoPaging(table));
            this.initCustomToolbar(opts);
        },

        initCustomToolbar: function (opts) {
            const $btnAdd = $('#btnAddRow');

            if (opts.canEdit) {
                $btnAdd.show().off('click').on('click', () => this.openAddForm?.());
            } else {
                $btnAdd.hide();
            }

            $('#btnReload').off('click').on('click', () => {
                this.table?.ajax.reload(null, false);
            });
        },

        toggleDtInfoPaging: function (table) {
            const info = table.page.info();
            const hasData = info.recordsDisplay > 0;
            const $wrapper = $(table.table().container());

            $wrapper.find('.dt-info, .dt-paging').toggle(hasData);
        },

        /* ================= BUILDERS ================= */
        buildAjax: function (opts) {
            if (this.menuType === this.MENU_TYPE.INLINE_GRID) return null;

            const ajaxConfig = {
                url: opts.baseUrl + opts.dataUrl,
                dataSrc: (json) => (json && Array.isArray(json.data) ? json.data : [])
            };

            if (this.menuType === this.MENU_TYPE.INBOX) {
                ajaxConfig.data = (d) => ({
                    ...d,
                    action: 'getDatalist',
                    dataListId: opts.dataListId,
                    assignmentFilter: opts.assignmentFilter,
                    processId: opts.processId || '',
                    activityDefIds: opts.activityDefIds || ''
                });
            }

            return ajaxConfig;
        },

        buildColumns: function (opts) {
            const cols = opts.columns.map(col =>
                this.buildDataColumn(col, this.menuType, opts.fieldMeta)
            );

            // Add Action Columns
            if (this.menuType !== this.MENU_TYPE.INBOX) {
                cols.push(this.buildDeleteColumn());
            } else {
                cols.push(this.buildWorkflowActionColumn(opts));
            }

            return cols;
        },

        buildDataColumn: function (col, menuType, fieldMeta) {
            return {
                data: col.name || null,
                name: col.name || '',
                defaultContent: '',
                render: (data, type, row) => {
                    if (data === undefined || data === null) return '';

                    if (type === 'display') {
                        const meta = fieldMeta?.[col.name] || {};

                        if (meta.type === 'select') {
                            const opt = (meta.options || []).find(o => String(o.value) === String(data));
                            return opt ? opt.label : data;
                        }

                        if (meta.formatter) {
                            return this.formatNumber(data, meta);
                        }
                    }
                    return data;
                },
                createdCell: (td, cellData, rowData) => {
                    const meta = fieldMeta?.[col.name] || {};
                    $(td).attr({
                        'data-id': rowData.id,
                        'data-field': col.name,
                        'data-value': cellData ?? '',
                        'data-type': meta.type || 'text'
                    }).toggleClass('readonly', !!(meta.readonly || meta.calculationLoadBinder || meta.isHidden));
                }
            };
        },

        buildDeleteColumn: () => ({
            data: null,
            orderable: false,
            searchable: false,
            className: 'dt-action-col',
            width: '40px',
            render: () => '<span class="fa-solid fa-trash dt-row-delete" title="Delete"></span>'
        }),

        buildWorkflowActionColumn: function (opts) {
            return {
                title: 'Action',
                data: null,
                orderable: false,
                searchable: false,
                className: 'dt-action-inbox',
                width: '165px',
                render: (data, type, row) => {
                    if (!row?.id) return '';

                    const options = (opts.workflowVariables || [])
                        .map(o => `<option value="${o.value}">${o.label}</option>`)
                        .join('');

                    return `
                        <div class="dt-action-wrapper" data-activity-id="${row.activityId || ''}">
                            <select class="dt-action-select">
                                <option value=""></option>
                                ${options}
                            </select>
                            <button type="button" class="dt-action-submit">Submit</button>
                        </div>`;
                }
            };
        },

        /* ================= UTILS / NORMALIZERS ================= */
        normalizeMenuType: function (type) {
            return Object.values(this.MENU_TYPE).includes(type) ? type : this.MENU_TYPE.DATALIST;
        },

        normalizeNumber: function (val) {
            if (val == null || val === '') return null;
            if (typeof val === 'number') return val;

            let str = String(val).replace(/\s+/g, '');
            const hasComma = str.includes(',');
            const hasDot = str.includes('.');

            if (hasComma && hasDot) {
                str = str.lastIndexOf(',') > str.lastIndexOf('.')
                    ? str.replace(/\./g, '').replace(',', '.') // EU
                    : str.replace(/,/g, ''); // US
            } else if (hasComma) {
                str = str.replace(',', '.');
            }

            const num = parseFloat(str);
            return isNaN(num) ? null : num;
        },

        formatNumber: function (value, meta) {
            const num = this.normalizeNumber(value);
            if (num === null) return value;

            const fmt = meta.formatter;
            if (!fmt) return num;

            const decimals = parseInt(fmt.numOfDecimal ?? 0, 10);
            const style = fmt.style || 'us';

            const formatter = new Intl.NumberFormat(style === 'euro' ? 'de-DE' : 'en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
                useGrouping: fmt.useThousandSeparator !== false
            });

            return formatter.format(num);
        },

        ensureDateString: function (value) {
            if (!value) return '';
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

            let date = value instanceof Date ? value : new Date(value);
            if (isNaN(date.getTime())) return String(value);

            const dd = String(date.getDate()).padStart(2, '0');
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            return `${mm}/${dd}/${date.getFullYear()}`;
        }
    };
})();