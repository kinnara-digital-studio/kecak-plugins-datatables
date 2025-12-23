package com.kinnarastudio.kecakplugins.datatables.userview;

import com.kinnarastudio.kecakplugins.datatables.exception.RestApiException;
import com.kinnarastudio.kecakplugins.datatables.userview.biz.DataTablesMenuBiz;
import com.kinnarastudio.kecakplugins.datatables.util.DataTablesUtil;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.datalist.model.DataList;
import org.joget.apps.datalist.model.DataListColumnFormatDefault;
import org.joget.apps.form.model.*;
import org.joget.apps.form.service.FormUtil;
import org.joget.apps.userview.model.UserviewMenu;
import org.joget.commons.util.LogUtil;
import org.joget.plugin.base.PluginManager;
import org.joget.plugin.base.PluginWebSupport;
import org.json.JSONException;
import org.json.JSONObject;

import org.springframework.context.ApplicationContext;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.math.BigDecimal;

import java.util.*;


/**
 * DataTables Menu
 * @author tiyojati
 */
public class DataTablesMenu extends UserviewMenu implements PluginWebSupport {

    private transient DataTablesMenuBiz dataTablesMenuBiz;

    protected DataTablesMenuBiz dataTablesMenuBiz() {
        if (dataTablesMenuBiz == null) {
            dataTablesMenuBiz = new DataTablesMenuBiz();
        }
        return dataTablesMenuBiz;
    }

    private final static String LABEL = "DataTables Menu";

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
        final String template = "/templates/DataTablesMenu.ftl";

        dataModel.put("className", getClass().getName());

        UserviewMenu userviewMenu = getUserview().getCurrent();
        final String dataListId = userviewMenu.getPropertyString("dataListId");
        DataList dataList = dataTablesMenuBiz().getDataList(dataListId);
        dataModel.put("dataListId", dataListId);
        dataModel.put("dataList", dataList);

        final AppDefinition appDefinition = AppUtil.getCurrentAppDefinition();
        dataModel.put("appId", appDefinition.getAppId());
        dataModel.put("appVersion", appDefinition.getVersion());

        final String formDefIdCreate = userviewMenu.getPropertyString("formDefIdCreate");
        dataModel.put("formDefIdCreate", formDefIdCreate);

        final JSONObject jsonFormCreate = dataTablesMenuBiz().getJsonForm(formDefIdCreate);
        dataModel.put("jsonForm", jsonFormCreate.toString());

        final String nonce = dataTablesMenuBiz().generateNonce(appDefinition, jsonFormCreate.toString());
        dataModel.put("nonce", nonce);

        final String formDefId = userviewMenu.getPropertyString("formDefId");
        dataModel.put("formDefId", formDefId);

        final JSONObject jsonForm = dataTablesMenuBiz().getJsonForm(formDefId);
        Map<String, Map<String, Object>> fieldMeta = new HashMap<>();
        try {
            fieldMeta = DataTablesUtil.extractFieldMeta(jsonForm);
        } catch (JSONException e) {
            LogUtil.error(getClassName(), e, e.getMessage());
        }

        String fieldMetaJson = new JSONObject(fieldMeta).toString();
        dataModel.put("fieldMeta", fieldMetaJson);

        final boolean permissionToEdit = dataTablesMenuBiz().getPermissionToEdit(userviewMenu);
        dataModel.put("permissionToEdit", permissionToEdit);

        String serviceUrl = "/web/json/app/" + appDefinition.getAppId() + "/" + appDefinition.getVersion() + "/plugin/" + getClassName() + "/service";
        dataModel.put("serviceUrl", serviceUrl);

        return pluginManager.getPluginFreeMarkerTemplate(dataModel, getClassName(), template, "/messages/DataTablesMenu");
    }

    @Override
    public void webService(HttpServletRequest request, HttpServletResponse response) throws IOException {
        ApplicationContext appContext = AppUtil.getApplicationContext();
        PluginManager pluginManager = (PluginManager) appContext.getBean("pluginManager");
        AppDefinition appDef = AppUtil.getCurrentAppDefinition();

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
        return AppUtil.readPluginResource(getClass().getName(), "/properties/DataTablesMenu.json", null, true, "/messages/DataTablesMenu");
    }
}
