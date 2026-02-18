<#assign elementId = element.properties.id!>

<div class="form-cell datatables-grid" ${elementMetaData!}>
    <#assign formGridId = "formgrid_" + elementParamName! + "_row_" >

        <link href="${request.contextPath}/plugin/${className}/core/css/dataTables.min.css" rel="stylesheet" type="text/css" />
        <script type="text/javascript" src="${request.contextPath}/plugin/${className}/core/js/dataTables.min.js"></script>

        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>
        <!-- CONFIRM DIALOG -->
        <script src="${request.contextPath}/plugin/${className}/js/confirm-dialog.js"></script>
        <link rel="stylesheet" href="${request.contextPath}/plugin/${className}/css/confirm-dialog.css"/>

        <script type="text/javascript" src="${request.contextPath}/plugin/${className}/js/datatables-factory.js"></script>
        <script type="text/javascript" src="${request.contextPath}/plugin/${className}/js/datatables-calculation-engine.js"></script>
        <script type="text/javascript" src="${request.contextPath}/plugin/${className}/js/datatables-grid-controller.js"></script>
        <link href="${request.contextPath}/plugin/${className}/css/datatables-grid.css" rel="stylesheet" type="text/css" />

        <div id="${formGridId}" name="${elementParamName!}" class="datatable-form-wrapper datatable-card grid form-element">
            <input type="hidden" disabled="disabled" id="appId" value="${appId!}">
            <input type="hidden" disabled="disabled" id="appVersion" value="${appVersion!}">
            <input type="hidden" disabled="disabled" id="contextPath" value="${request.contextPath}">
            <input type="hidden" id="elementParamName" name="elementParamName" value="${elementParamName!}_jsonrow_">
            <input type="hidden" id="rowCount" name="rowCount" value="0">

            <table id="${elementId}" class="display" style="width:100%">
                <thead>
                <tr>
                    <#list element.properties.options![] as col>
                        <th style="text-align:${col.alignment!'left'};<#if col.width??>width:${col.width};</#if>">
                            ${col.label!}
                        </th>
                    </#list>
                        <th></th>

                </tr>
                </thead>
                <tbody></tbody>
            </table>

            <div class="dt-toolbar">
                <span class="dt-add-row"><i class="fa fa-plus-circle"></i></span>
            </div>

        </div>

    <script>
        $(function () {
            var FIELD_META = ${fieldMeta};
            
            var rawDataRows = [
                <#list dataRows![] as row>
                {
                    <#list row?keys as key>
                        "${key?js_string}": "${row[key]?js_string}"<#if key_has_next>,</#if>
                    </#list>
                }<#if row_has_next>,</#if>
                </#list>
            ];

            var columns = [
                <#list element.properties.options![] as column>
                { name: '${column.value!}', label: '${column.label!}' }<#if column_has_next>,</#if>
                </#list>
            ];

            // 1. Create Machine
            var table = DataTablesFactory.create({
                menuType: 'inlineGrid',
                tableElement: $("#${elementId}"),
                fieldMeta: FIELD_META,
                columns: columns
            });

            // 2. Start Controller (Data diolah di sini)
            DataTablesGridController.init({
                table: table,
                columns: columns,
                elementId: '${elementId!}',
                elementParamName: '${elementParamName!}',
                formGridId: '${formGridId!}',
                fieldMeta: FIELD_META,
                formDefId: '${formDefId!}',
                baseUrl: '${request.contextPath}',
                calculationUrl: '${calculationUrl}',
                appId: '${appId!}',
                appVersion: '${appVersion!}'
            }, rawDataRows);
        });
    </script>
</div>
