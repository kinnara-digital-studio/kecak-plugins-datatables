<!-- CORE -->
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/core/css/jquery.dataTables.min.css" type="text/css"/>
<script src="${request.contextPath}/plugin/${className}/core/js/jquery.dataTables.min.js"></script>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/core/css/dataTables.buttons.min.css" type="text/css"/>
<script src="${request.contextPath}/plugin/${className}/core/js/dataTables.buttons.min.js"></script>
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

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>

<table id="inlineTable" class="display" width="100%">
    <thead>
        <tr>
            <#list dataList.columns as c>
                <th>${c.label}</th>
            </#list>
            <th style="width:10px;">&nbsp;</th>
        </tr>
    </thead>
    <tbody></tbody>
</table>

<script>
$(function () {
    var FIELD_META = ${fieldMeta};
    var CAN_EDIT = ${permissionToEdit?string("true","false")};

    // ================= INIT TABLE =================
    var table = $('#inlineTable').DataTable({
        processing: true,
        serverSide: false,
        searching: false,
        dom: 'Bfrtip',
        buttons: [
            CAN_EDIT ? {
                text: '<i class="fa fa-plus"></i> Add',
                init: function (api, node) {
                    $(node).attr('id', 'btnAddRow');
                }
            } : null,
            {
                text: '<i class="fa fa-refresh "/>',
                action: function () {
                    table.ajax.reload();
                }
            }
        ].filter(Boolean),
        ajax: {
            url: '${request.contextPath}/web/json/data/app/${appId!}/${appVersion}/datalist/${dataListId!}',
            dataSrc: function (json) {
                const data = (json && Array.isArray(json.data)) ? json.data : [];
                return data;
            }
        },
        columns: [
            <#list dataList.columns as c>
            {
                data: '${c.name}',
                createdCell: function (td, cellData, rowData) {
                    var meta = FIELD_META['${c.name}'] || {};
                    var value = rowData?.['${c.name}'] ?? '';

                    $(td).attr('data-value', cellData);

                    if (meta.type === 'select') {
                        var label = cellData;
                        (meta.options || []).forEach(function (o) {
                            if (o.value == cellData) {
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
                        .toggleClass('readonly', meta.readonly === true || meta.calculationLoadBinder || meta.isHidden === true)
                }
            }<#if c_has_next>,</#if>
            </#list>,
            /* ===== ACTION COLUMN ===== */
            {
                data: null,
                orderable: false,
                searchable: false,
                className: 'col-action',
                render: function () {
                    return `<i class="fa-solid fa-trash cell-delete" title="Delete"></i>`;
                }
            }
        ]
    });

    if (!CAN_EDIT) {
        table.column('.col-action').visible(false);
    }

    /* ================= INIT DATATABLES EDITOR ================= */
    DataTablesEditor.init({
        table: table,
        fieldMeta: FIELD_META,
        editable: CAN_EDIT,
        formDefIdCreate: '${formDefIdCreate!}',
        formDefId: '${formDefId!}',
        jsonForm: '${jsonForm!}',
        nonce: '${nonce!}',
        baseUrl: '${request.contextPath}/web/json/data/app/${appId!}/${appVersion}/form/',
        addBaseUrl: '${request.contextPath}/web/app/${appId!}/${appVersion}/form/embed?_submitButtonLabel=Submit',
        serviceUrl: '${request.contextPath}${serviceUrl}'
    });


});
</script>
