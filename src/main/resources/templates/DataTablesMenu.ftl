<!-- CORE -->
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/core/css/dataTables.min.css" type="text/css"/>
<script src="${request.contextPath}/plugin/${className}/core/js/dataTables.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/decimal.js@10.4.3/decimal.min.js"></script>

<!-- TOAST DIALOG -->
<script src="${request.contextPath}/plugin/${className}/js/toast-dialog.js"></script>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/toast-dialog.css"/>
<!-- CONFIRM DIALOG -->
<script src="${request.contextPath}/plugin/${className}/js/confirm-dialog.js"></script>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/confirm-dialog.css"/>

<!-- DATATABLES EDITOR -->
<script src="${request.contextPath}/plugin/${className}/js/datatables-factory.js"></script>
<script src="${request.contextPath}/plugin/${className}/js/datatables-calculation-engine.js"></script>
<script src="${request.contextPath}/plugin/${className}/js/datatables-menu-controller.js"></script>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/custom-datatables.css" type="text/css"/>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/datatables-inbox.css" type="text/css"/>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>

<div class="datatable-card">
    <div class="dt-toolbar">
        <button id="btnAddRow" class="dt-btn dt-btn-add" style="display:none">
            <i class="fa fa-plus"></i>
        </button>

        <button id="btnReload" class="dt-btn dt-btn-reload">
            <i class="fa fa-refresh"></i>
        </button>
    </div>
    <table id="inlineTable" class="display" style="width:100%">
        <thead>
            <tr>
                <#list dataList.columns as c>
                    <th>${c.label}</th>
                </#list>
                <#-- action column -->
                <#if menuType == "datalistMenu">
                    <th></th>
                </#if>
                <#if menuType == "inboxMenu">
                    <th>Action</th>
                </#if>
            </tr>
        </thead>
        <tbody></tbody>
    </table>
</div>
<script>
$(function () {
    /* ================= GLOBAL ================= */
    const FIELD_META = ${fieldMeta};
    const USER_ID    = '${userId}';
    const CAN_EDIT   = ${permissionToEdit?string("true","false")};
    const MENU_TYPE  = '${menuType}';

    /* ================= WORKFLOW VARIABLES ================= */
    const WORKFLOW_VARIABLES =
        FIELD_META.status?.options && Array.isArray(FIELD_META.status.options)
            ? FIELD_META.status.options
            : [];

    /* ================= DATATABLE FACTORY ================= */
    const INLINE_TABLE_OPTS = {
        fieldMeta   : FIELD_META,
        menuType    : MENU_TYPE,
        baseUrl     : '${request.contextPath}',
        dataUrl     : '${dataUrl}',
        dataListId  : '${dataListId}',

        assignmentFilter : '${assignmentFilter!}',
        processId        : '${processId!}',
        activityDefIds   : '${activityDefIds!}',

        canEdit     : CAN_EDIT,
        workflowVariables : WORKFLOW_VARIABLES,

        columns : [
            <#list dataList.columns as column>
            { name: '${column.name}', label: '${column.label}' }<#if column_has_next>,</#if>
            </#list>
        ]
    };

    const table = DataTablesFactory.create(INLINE_TABLE_OPTS);

    /* ================= BASE CONFIG ================= */
    const DATATABLES_CONFIG = {
        table          : table,
        fieldMeta      : FIELD_META,
        baseUrl        : '${request.contextPath}',
        calculationUrl : '${calculationUrl}',
        editFormUrl    : '${editFormUrl!}',

        appId      : '${appId!}',
        appVersion : '${appVersion!}'
    };

    /* ================= MENU TYPE OVERRIDE ================= */
    if (MENU_TYPE === 'inboxMenu') {
        Object.assign(DATATABLES_CONFIG, {
            editable        : true,
            editFormDefId   : '${editFormDefId!}',
            submitTaskUrl  : '${submitTaskUrl!}',
            userId         : USER_ID
        });
    } else {
        Object.assign(DATATABLES_CONFIG, {
            editable        : CAN_EDIT,
            createFormDefId : '${createFormDefId!}',
            editFormDefId   : '${editFormDefId!}',
            addFormUrl      : '${addFormUrl!}',
            jsonForm        : '${jsonForm!}',
            nonce           : '${nonce!}'
        });
    }

    /* ================= INIT CONTROLLER ================= */
    DataTablesMenuController.init(DATATABLES_CONFIG);
});
</script>
