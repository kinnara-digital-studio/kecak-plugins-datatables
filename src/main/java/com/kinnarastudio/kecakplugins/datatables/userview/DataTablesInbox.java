package com.kinnarastudio.kecakplugins.datatables.userview;

import com.kinnarastudio.kecakplugins.datatables.exception.RestApiException;
import com.kinnarastudio.kecakplugins.datatables.userview.biz.DataTablesInboxBiz;
import com.kinnarastudio.kecakplugins.datatables.userview.biz.DataTablesMenuBiz;
import com.kinnarastudio.kecakplugins.datatables.util.DataTablesUtil;
import com.kinnarastudio.kecakplugins.datatables.util.Validator;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.model.PackageDefinition;
import org.joget.apps.app.service.AppService;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.datalist.model.DataList;
import org.joget.apps.datalist.model.DataListCollection;
import org.joget.apps.datalist.model.DataListColumnFormatDefault;
import org.joget.apps.form.model.Element;
import org.joget.apps.form.model.Form;
import org.joget.apps.form.model.FormData;
import org.joget.apps.form.model.FormLoadBinder;
import org.joget.apps.form.service.FormUtil;
import org.joget.apps.userview.model.UserviewMenu;
import org.joget.commons.util.LogUtil;
import org.joget.directory.model.User;
import org.joget.plugin.base.PluginManager;
import org.joget.plugin.base.PluginWebSupport;
import org.joget.workflow.model.WorkflowActivity;
import org.joget.workflow.model.WorkflowProcess;
import org.joget.workflow.model.service.WorkflowManager;
import org.joget.workflow.model.service.WorkflowUserManager;
import org.joget.workflow.util.WorkflowUtil;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.springframework.context.ApplicationContext;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.*;


/**
 * DataTables Inbox
 * @author tiyojati
 */
public class DataTablesInbox extends UserviewMenu implements PluginWebSupport {

    private transient DataTablesMenuBiz dataTablesMenuBiz;
    private transient DataTablesInboxBiz dataTablesInboxBiz;

    protected DataTablesMenuBiz dataTablesMenuBiz() {
        if (dataTablesMenuBiz == null) {
            dataTablesMenuBiz = new DataTablesMenuBiz();
        }
        return dataTablesMenuBiz;
    }
    protected DataTablesInboxBiz dataTablesInboxBiz() {
        if (dataTablesInboxBiz == null) {
            dataTablesInboxBiz = new DataTablesInboxBiz();
        }
        return dataTablesInboxBiz;
    }

    private final static String LABEL = "DataTables Inbox";

    @Override
    public String getCategory() {
        return "Kecak";
    }

    @Override
    public String getIcon() {
        return "<i class=\"fas fa-table\"></i>";
    }

    @Override
    public String getRenderPage() {
        final ApplicationContext appContext = AppUtil.getApplicationContext();
        final PluginManager pluginManager = (PluginManager) appContext.getBean("pluginManager");
        final Map<String, Object> dataModel = new HashMap<>();
        final String template = "/templates/DataTablesInbox.ftl";

        WorkflowUserManager workflowUserManager = (WorkflowUserManager) appContext.getBean("workflowUserManager");
        final User currentUser = workflowUserManager.getCurrentUser();
        String userId = "";
        if (Validator.isNotNullOrEmpty(currentUser)){
            userId = currentUser.getId();
        }
        dataModel.put("userId", userId);

        dataModel.put("className", getClass().getName());

        final AppDefinition appDefinition = AppUtil.getCurrentAppDefinition();
        UserviewMenu userviewMenu = getUserview().getCurrent();

        dataModel.put("appId", appDefinition.getAppId());
        dataModel.put("appVersion", appDefinition.getVersion());

        final String formDefId = userviewMenu.getPropertyString("formDefId");
        dataModel.put("formDefId", formDefId);

        Map<String, Map<String, Object>> fieldMeta = new HashMap<>();
        try {
            fieldMeta = dataTablesMenuBiz().extractFieldMeta(formDefId);
        } catch (JSONException e) {
            LogUtil.error(getClassName(), e, e.getMessage());
        }

        String fieldMetaJson = new JSONObject(fieldMeta).toString();
        dataModel.put("fieldMeta", fieldMetaJson);
        LogUtil.warn(getClassName(), "fieldMetaJson: (" + fieldMetaJson +")");

        String serviceUrl = "/web/json/app/" + appDefinition.getAppId() + "/" + appDefinition.getVersion() + "/plugin/" + getClassName() + "/service";
        dataModel.put("serviceUrl", serviceUrl);

        String assignmentFilter = userviewMenu.getPropertyString("assignmentFilter");
        dataModel.put("assignmentFilter", assignmentFilter);

        String processId = userviewMenu.getPropertyString("processId");
        dataModel.put("processId", processId);

        String activityDefIds = userviewMenu.getPropertyString("activityDefId");
        dataModel.put("activityDefIds", activityDefIds);

        String dataListId = userviewMenu.getPropertyString("dataListId");
        DataList dataList = dataTablesInboxBiz().getDataListColumns(dataListId, appDefinition);
        dataModel.put("dataListId", dataListId);
        dataModel.put("dataList", dataList);

        return pluginManager.getPluginFreeMarkerTemplate(dataModel, getClassName(), template, "/messages/DataTablesMenu");
    }

    @Override
    public void webService(HttpServletRequest request, HttpServletResponse response) throws IOException {
        ApplicationContext appContext = AppUtil.getApplicationContext();
        PluginManager pluginManager = (PluginManager) appContext.getBean("pluginManager");

        AppDefinition appDef = AppUtil.getCurrentAppDefinition();

        String action = request.getParameter("action");
        if (Validator.isNotNullOrEmpty(action)){
            boolean isAdmin = WorkflowUtil.isCurrentUserInRole((String) "ROLE_ADMIN");
            if (!isAdmin) {
                response.sendError(401);
                return;
            }

            String appId = appDef.getAppId();
            AppService appService = (AppService) appContext.getBean("appService");
            WorkflowManager workflowManager = (WorkflowManager) appContext.getBean("workflowManager");

            if ("getProcesses".equals(action)) {
                try {
                    JSONArray jsonArray = new JSONArray();
                    PackageDefinition packageDefinition = appDef.getPackageDefinition();
                    Long packageVersion = packageDefinition != null ? packageDefinition.getVersion() : new Long(1);
                    Collection<WorkflowProcess> processList = workflowManager.getProcessList(appId, packageVersion.toString());
                    HashMap<String, String> empty = new HashMap<String, String>();
                    empty.put("value", "");
                    empty.put("label", "");
                    jsonArray.put(empty);
                    for (WorkflowProcess p : processList) {
                        HashMap<String, String> option = new HashMap<String, String>();
                        option.put("value", p.getIdWithoutVersion());
                        option.put("label", p.getName() + " (" + p.getIdWithoutVersion() + ")");
                        jsonArray.put(option);
                    }
                    jsonArray.write(response.getWriter());
                } catch (Exception ex) {
                    LogUtil.error(getClassName(), ex, "Get Process options Error!");
                }
            } else if ("getActivities".equals(action)) {
                try {
                    JSONArray jsonArray = new JSONArray();
                    HashMap<String, String> empty = new HashMap<String, String>();
                    empty.put("value", "");
                    empty.put("label", "");
                    jsonArray.put(empty);
                    String processId = request.getParameter("processId");
                    if (Validator.isNotNullOrEmpty(processId)) {
                        String processDefId = "";
                        if (appDef != null) {
                            WorkflowProcess process = appService.getWorkflowProcessForApp(appDef.getId(), appDef.getVersion().toString(), processId);
                            processDefId = process.getId();
                        }
                        Collection<WorkflowActivity> activityList = workflowManager.getProcessActivityDefinitionList(processDefId);
                        for (WorkflowActivity a : activityList) {
                            if (a.getType().equals("route") || a.getType().equals("tool")) continue;
                            HashMap<String, String> option = new HashMap<String, String>();
                            option.put("value", a.getActivityDefId());
                            option.put("label", a.getName() + " (" + a.getActivityDefId() + ")");
                            jsonArray.put(option);
                        }
                    }
                    jsonArray.write(response.getWriter());
                } catch (Exception ex) {
                    LogUtil.error(getClass().getName(), ex, "Get activity options Error!");
                }
            }
        }else {
            String type = request.getParameter("type");
            if (Validator.isNotNullOrEmpty(type)){
                if ("getDatalist".equals(type)) {
                    String dataListId = request.getParameter("dataListId");
                    String assignmentFilter = request.getParameter("assignmentFilter");
                    String processId = request.getParameter("processId");
                    String activityDefIds = request.getParameter("activityDefIds");

                    DataListCollection<Map<String, Object>> rows = dataTablesInboxBiz().getDataListRows(dataListId, assignmentFilter, processId, activityDefIds, appDef);
                    JSONObject responseJson = new JSONObject();
                    JSONArray dataArray = new JSONArray();

                    if (rows != null) {
                        for (Map<String, Object> row : rows) {
                            dataArray.put(new JSONObject(row));
                        }
                    }
                    try {
                        responseJson.put("data", dataArray);
                    } catch (JSONException e) {
                        LogUtil.error(getClass().getName(), e, e.getMessage());
                    }
                    response.setContentType("application/json");
                    response.setStatus(HttpServletResponse.SC_OK);
                    response.getWriter().write(responseJson.toString());
                }
            }else {
                try {
                    if (appDef == null) {
                        throw new RestApiException(HttpServletResponse.SC_BAD_REQUEST, "Application definition cannot be defined");
                    }

                    JSONObject body = DataTablesUtil.constructRequestBody(request);
                    String formDefId = body.getString("formDefId");
                    String fieldId = body.getString("fieldId");
                    String primaryKey = body.optString("primaryKey");

                    Form form = dataTablesMenuBiz().generateForm(formDefId, appDef);
                    if (form == null) {
                        throw new RestApiException(HttpServletResponse.SC_BAD_REQUEST, "Form [" + formDefId + "] cannot be defined");
                    }

                    JSONObject requestParameters = body.optJSONObject("requestParams");
                    LogUtil.info(getClassName(), "requestParameters value : " + requestParameters.toString());
                    FormData formData = dataTablesMenuBiz().generateFormData(primaryKey, requestParameters);

                    Element element = FormUtil.findElement(fieldId, form, formData);

                    String currencyField = element.getPropertyString("currencyRefField");
                    Map<String, Object> calculationLoadBinder = (Map<String, Object>) element.getProperty("calculationLoadBinder");

                    BigDecimal value;

                    FormLoadBinder loadBinderPlugins = DataTablesUtil.getPluginObject(calculationLoadBinder, pluginManager);
                    if (loadBinderPlugins != null) {
                        // value is calculated by calculation load binder
                        element.setLoadBinder(loadBinderPlugins);
                        value = dataTablesMenuBiz().executeCalculation(element, formData);

                    } else {
                        // value from user input
                        Locale locale = DataTablesUtil.getLocale(requestParameters.optString(currencyField));
                        value = DataTablesUtil.determineNumber(body.optString("formatValue"), locale);
                    }

                    Map<String, Object> formatterPlugin = (Map<String, Object>) element.getProperty("formatterPlugin");
                    DataListColumnFormatDefault formatter = DataTablesUtil.getPluginObject(formatterPlugin, pluginManager);
                    String formattedValue = formatter == null ? value.toString()
                            : DataTablesUtil.reformatValue(fieldId, value.toString(), form, formData, formatter);

                    JSONObject data = new JSONObject();
                    data.put("value", value.toPlainString());
                    data.put("mask_value", formattedValue);

                    response.setStatus(HttpServletResponse.SC_OK);
                    response.getWriter().write(data.toString());

                } catch (RestApiException e) {
                    String appId = appDef == null ? "" : appDef.getAppId();
                    long appVersion = appDef == null ? 0 : appDef.getVersion();
                    LogUtil.error(getClassName(), e, "Application [" + appId + "] version [" + appVersion + "] message [" + e.getMessage() + "]");
                    response.sendError(e.getErrorCode(), "Response [" + e.getErrorCode() + "] : " + e.getMessage());
                } catch (JSONException e) {
                    String appId = appDef.getAppId();
                    long appVersion = appDef.getVersion();
                    LogUtil.error(getClassName(), e, "Application [" + appId + "] version [" + appVersion + "] message [" + e.getMessage() + "]");
                    response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
                }
            }
        }
    }

    @Override
    public boolean isHomePageSupported() {
        return false;
    }

    @Override
    public String getDecoratedMenu() {
        return "";
    }

    @Override
    public String getName() {
        return LABEL;
    }

    @Override
    public String getVersion() {
        PluginManager pluginManager = (PluginManager) AppUtil.getApplicationContext().getBean("pluginManager");
        ResourceBundle resourceBundle = pluginManager.getPluginMessageBundle(getClassName(), "/version/BuildNumber");
        return resourceBundle.getString("buildNumber");
    }

    @Override
    public String getDescription() {
        return getClass().getPackage().getImplementationTitle();
    }

    @Override
    public String getLabel() {
        return LABEL;
    }

    @Override
    public String getClassName() {
        return getClass().getName();
    }

    @Override
    public String getPropertyOptions() {
        AppDefinition appDef = AppUtil.getCurrentAppDefinition();
        String appId = appDef.getId();
        String appVersion = appDef.getVersion().toString();
        Object[] arguments = new Object[]{appId, appVersion, getClassName(), appId, appVersion, getClassName()};
        return AppUtil.readPluginResource(getClassName(), "/properties/DataTablesInbox.json", arguments, true, "/messages/DataTablesInbox");
    }
}
