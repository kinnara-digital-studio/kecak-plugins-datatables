<!-- CORE -->
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/core/css/jquery.dataTables.min.css" type="text/css"/>
<script src="${request.contextPath}/plugin/${className}/core/js/jquery.dataTables.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/decimal.js@10.4.3/decimal.min.js"></script>

<!-- TOAST DIALOG -->
<script src="${request.contextPath}/plugin/${className}/js/toast-dialog.js"></script>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/toast-dialog.css"/>
<!-- CONFIRM DIALOG -->
<script src="${request.contextPath}/plugin/${className}/js/confirm-dialog.js"></script>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/confirm-dialog.css"/>

<!-- DATATABLES EDITOR -->
<script src="${request.contextPath}/plugin/${className}/js/datatables-editor.js"></script>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/custom-datatables.css" type="text/css"/>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/datatables-inbox.css" type="text/css"/>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>

<table id="inlineTable" class="display" width="100%">
    <thead>
    <tr>
        <#list dataList.columns as c>
            <th>${c.label}</th>
        </#list>
        <th></th>
    </tr>
    </thead>
    <tbody></tbody>
</table>

<script>
    $(function () {
        var FIELD_META = ${fieldMeta};
        var WORKFLOW_VARIABLES = FIELD_META['status'].options;
        var USER_ID = '${userId}';

        // ================= INIT TABLE =================
        var table = $('#inlineTable').DataTable({
            processing: true,
            serverSide: false,
            searching: false,
            dom: 'Bfrtip',
            language: {
                emptyTable: 'Nothing found to display',
                zeroRecords: 'Nothing found to display'
            },
            ajax: {
                url: '${request.contextPath}/web/json/app/${appId!}/${appVersion}/plugin/${className}/service',
                dataSrc: function (json) {
                    if (!json || !Array.isArray(json.data)) {
                        return [];
                    }
                    return json.data;
                },
                data: function (d) {
                    d.type     = 'getDatalist';
                    d.dataListId = '${dataListId!}';
                    d.assignmentFilter = '${assignmentFilter!}';
                    d.processId = '${processId!""}';
                    d.activityDefIds = '${activityDefIds!""}';
                }
            },
            columns: [
                <#list dataList.columns as c>
                {
                    data: null,
                    render: function (data, type, row) {
                        return row && row['${c.name}'] !== undefined
                            ? row['${c.name}']
                            : '';
                    },
                    createdCell: function (td, cellData, rowData) {
                        var meta = FIELD_META['${c.name}'] || {};
                        var value = rowData?.['${c.name}'] ?? '';

                        $(td).attr('data-value', value);

                        if (meta.type === 'select') {
                            var label = value;
                            (meta.options || []).forEach(function (o) {
                                if (o.value == value) {
                                    label = o.label;
                                }
                            });
                            $(td).text(label);
                        }

                        if (meta.formatter) {
                            $(td).text(DataTablesEditor.formatNumber(value, meta));
                        } else {
                            $(td).text(value);
                        }

                        $(td)
                            .attr('data-field', '${c.name}')
                            .attr('data-id', rowData.id)
                            .attr('data-type', meta.type || 'text')
                            .toggleClass(
                                'readonly',
                                meta.readonly === true ||
                                meta.calculationLoadBinder ||
                                meta.isHidden === true
                            );
                    }
                }<#if c_has_next>,</#if>
                </#list>,
                {
                    name: 'workflowAction',
                    title: 'Action',
                    data: null,
                    orderable: false,
                    searchable: false,
                    className: 'col-action',
                    defaultContent: '',
                    render: function (data, type, row) {
                        if (!row || !row.id) {
                            return '';
                        }

                        let html = '<div class="dt-action-wrapper" data-activity-id="' + (row.activityId || '') + '">';

                        html += '<select class="dt-action-select">';
                        html += '<option value=""></option>';

                        (WORKFLOW_VARIABLES || []).forEach(function (o) {
                            html += '<option value="' + o.value + '">' + o.label + '</option>';
                        });

                        html += '</select>';

                        html += '<button type="button" class="dt-action-submit">Submit</button>';

                        html += '</div>';

                        return html;
                    }
                }
            ]
        });

        $('#inlineTable').on('change', '.dt-action-select', function (e) {
            e.stopImmediatePropagation();
            e.preventDefault();

            const value = this.value;
            if (!value) return;

            $(this).addClass('selected');
        });

        $(document).on('click', '.dt-action-submit', function (e) {
            e.preventDefault();
            e.stopPropagation();

            debugger;
            const wrapper     = $(this).closest('.dt-action-wrapper');
            const activityId  = wrapper.data('activity-id');
            const actionValue = wrapper.find('.dt-action-select').val();

            if (!activityId) {
                alert('Activity ID not found');
                return;
            }

            if (!actionValue) {
                alert('Please select an action first');
                return;
            }

            const formData = new FormData();
            formData.append('status', actionValue);
            $.ajax({
                url: '${request.contextPath}/web/json/data/assignment/'+activityId+'?loginAs='+USER_ID,
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: function (res) {
                    console.log('SUCCESS', res);
                    if(res?.message === 'Success'){
                        showToast('Submit data successfully', 'success');
                        table.ajax.reload(null, false);
                    }else {
                        showToast('Failed to submit action', 'error');
                    }
                },
                error: function () {
                    showToast('Failed to submit data', 'error');
                }
            });
        });

        /* ================= INIT DATATABLES EDITOR ================= */
        DataTablesEditor.init({
            table: table,
            fieldMeta: FIELD_META,
            editable: true,
            formDefId: '${formDefId!}',
            baseUrl: '${request.contextPath}/web/json/data/app/${appId!}/${appVersion}/form/',
            serviceUrl: '${request.contextPath}${serviceUrl}'
        });


    });
</script>
