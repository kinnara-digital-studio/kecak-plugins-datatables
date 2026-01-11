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
<script src="${request.contextPath}/plugin/${className}/js/datatables-menu-controller.js"></script>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/custom-datatables.css" type="text/css"/>
<link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/datatables-inbox.css" type="text/css"/>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>

<div class="dt-toolbar">
    <button id="btnAddRow" class="dt-btn dt-btn-add" style="display:none">
        <i class="fa fa-plus"></i> Add
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

<script>
$(function () {
    var FIELD_META = ${fieldMeta};
    var USER_ID = '${userId}';
    var CAN_EDIT = ${permissionToEdit?string("true","false")};
    var MENU_TYPE = '${menuType}';

    var WORKFLOW_VARIABLES = [];
    if (FIELD_META.status && Array.isArray(FIELD_META.status.options)) {
        WORKFLOW_VARIABLES = FIELD_META.status.options;
    }

    var INLINE_TABLE_OPTS = {
        fieldMeta   : FIELD_META,
        menuType    : MENU_TYPE,
        baseUrl     : '${request.contextPath}',
        dataUrl     : '${dataUrl}',
        dataListId  : '${dataListId}',

        assignmentFilter : '${assignmentFilter!}',
        processId        : '${processId!}',
        activityDefIds   : '${activityDefIds!}',

        canEdit     : CAN_EDIT,

        columns : [
            <#list dataList.columns as column>
            {
                name  : '${column.name}',
                label : '${column.label}'
            }<#if column_has_next>,</#if>
            </#list>
        ],

        workflowVariables : WORKFLOW_VARIABLES
    };

    // ================= INIT TABLE =================
    var table = DataTablesFactory.create(INLINE_TABLE_OPTS);

    var DATATABLES_CONFIG = {}
    if (MENU_TYPE === "inboxMenu"){
        DATATABLES_CONFIG.table = table;
        DATATABLES_CONFIG.fieldMeta = FIELD_META;
        DATATABLES_CONFIG.editable = true;
        DATATABLES_CONFIG.editFormDefId = '${editFormDefId!}';
        DATATABLES_CONFIG.baseUrl = '${request.contextPath}';
        DATATABLES_CONFIG.calculationUrl = '${calculationUrl}';
        DATATABLES_CONFIG.editFormUrl = '${editFormUrl!}';
        DATATABLES_CONFIG.submitTaskUrl = '${submitTaskUrl!}';
        DATATABLES_CONFIG.userId = USER_ID;
    }else {
        DATATABLES_CONFIG.table = table;
        DATATABLES_CONFIG.fieldMeta = FIELD_META;
        DATATABLES_CONFIG.editable = CAN_EDIT;
        DATATABLES_CONFIG.createFormDefId = '${createFormDefId!}';
        DATATABLES_CONFIG.editFormDefId = '${editFormDefId!}';
        DATATABLES_CONFIG.baseUrl = '${request.contextPath}';
        DATATABLES_CONFIG.calculationUrl = '${calculationUrl}';
        DATATABLES_CONFIG.addFormUrl = '${addFormUrl!}';
        DATATABLES_CONFIG.editFormUrl = '${editFormUrl!}';
        DATATABLES_CONFIG.jsonForm = '${jsonForm!}';
        DATATABLES_CONFIG.nonce = '${nonce!}';
    }

    /* ================= INIT DATATABLES CONTROLLER ================= */
    DataTablesMenuController.init(DATATABLES_CONFIG);


});
</script>
