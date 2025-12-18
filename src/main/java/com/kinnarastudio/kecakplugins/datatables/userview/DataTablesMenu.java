package com.kinnarastudio.kecakplugins.datatables.userview;

import com.kinnarastudio.commons.Try;
import com.kinnarastudio.kecakplugins.datatables.util.DataTablesUtil;
import org.joget.apps.app.dao.DatalistDefinitionDao;
import org.joget.apps.app.dao.FormDefinitionDao;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.model.DatalistDefinition;
import org.joget.apps.app.model.FormDefinition;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.datalist.model.DataList;
import org.joget.apps.datalist.service.DataListService;
import org.joget.apps.form.service.FormService;
import org.joget.apps.userview.model.UserviewMenu;
import org.joget.commons.util.LogUtil;
import org.joget.commons.util.SecurityUtil;
import org.joget.plugin.base.PluginManager;
import org.joget.plugin.base.PluginWebSupport;
import org.json.JSONException;
import org.json.JSONObject;
import org.springframework.context.ApplicationContext;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.util.*;

/**
 * DataTables Editor
 * @author tiyojati
 */
public class DataTablesMenu extends UserviewMenu implements PluginWebSupport {
    private final static String LABEL = "DataTables Editor Menu";

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

        final String dataListId = getUserview().getCurrent().getPropertyString("dataListId");
        DataList dataList = getDataList(dataListId);
        dataModel.put("dataListId", dataListId);
        dataModel.put("dataList", dataList);

        final AppDefinition appDefinition = AppUtil.getCurrentAppDefinition();
        dataModel.put("appId", appDefinition.getAppId());
        dataModel.put("appVersion", appDefinition.getVersion());

        final String formDefIdCreate = getUserview().getCurrent().getPropertyString("formDefIdCreate");
        dataModel.put("formDefIdCreate", formDefIdCreate);

        final JSONObject jsonFormCreate = getJsonForm(formDefIdCreate);
        dataModel.put("jsonForm", jsonFormCreate.toString());
        LogUtil.warn(getClassName(), "JSON_FORM [" + jsonFormCreate.toString() + "]");

        final String nonce = generateNonce(appDefinition, jsonFormCreate.toString());
        dataModel.put("nonce", nonce);

        final String formDefId = getUserview().getCurrent().getPropertyString("formDefId");
        dataModel.put("formDefId", formDefId);

        final JSONObject jsonForm = getJsonForm(formDefId);
        Map<String, Map<String, Object>> fieldMeta = new HashMap<>();
        try {
            fieldMeta = DataTablesUtil.extractFieldMeta(jsonForm);
        } catch (JSONException e) {
            LogUtil.error(getClassName(), e, e.getMessage());
        }

        String fieldMetaJson = new JSONObject(fieldMeta).toString();
        dataModel.put("fieldMeta", fieldMetaJson);
        LogUtil.warn(getClassName(), "FIELD_META_EDIT [" + fieldMeta + "]");

        return pluginManager.getPluginFreeMarkerTemplate(dataModel, getClassName(), template, "/messages/DataTablesMenu");
    }

    @Override
    public void webService(HttpServletRequest httpServletRequest, HttpServletResponse httpServletResponse) throws ServletException, IOException {

    }

    protected DataList getDataList(String dataListId) {
        ApplicationContext applicationContext = AppUtil.getApplicationContext();
        DatalistDefinitionDao datalistDefinitionDao = (DatalistDefinitionDao) applicationContext
                .getBean("datalistDefinitionDao");
        DataListService dataListService = (DataListService) applicationContext.getBean("dataListService");
        AppDefinition appDefinition = AppUtil.getCurrentAppDefinition();
        DatalistDefinition datalistDefinition = datalistDefinitionDao.loadById(dataListId, appDefinition);
        if (datalistDefinition == null) {
            LogUtil.warn(getClassName(), "DataList Definition [" + dataListId + "] not found");
            return null;
        }

        DataList dataList = dataListService.fromJson(datalistDefinition.getJson());
        if (dataList == null) {
            LogUtil.warn(getClassName(), "DataList [" + dataListId + "] not found");
            return null;
        }

        dataList.setPageSize(DataList.MAXIMUM_PAGE_SIZE);
        return dataList;
    }

    protected JSONObject getJsonForm(String formDefId) {
        ApplicationContext appContext = AppUtil.getApplicationContext();
        FormService formService = (FormService) appContext.getBean("formService");
        FormDefinitionDao formDefinitionDao = (FormDefinitionDao) appContext.getBean("formDefinitionDao");
        AppDefinition appDef = AppUtil.getCurrentAppDefinition();
        FormDefinition formDef = formDefinitionDao.loadById(formDefId, appDef);
        LogUtil.info("Form Definition Name: ", "[ " + formDef.getName() + " ]");

        return Optional.of(formDefId)
                .map(s -> formDefinitionDao.loadById(s, appDef))
                .map(FormDefinition::getJson)
                .map(formService::createElementFromJson)
                .map(formService::generateElementJson)
                .map(Try.onFunction(JSONObject::new))
                .orElseGet(JSONObject::new);
    }

    protected String generateNonce(AppDefinition appDefinition, String jsonForm) {
        return SecurityUtil.generateNonce(
                new String[]{"EmbedForm", appDefinition.getAppId(), appDefinition.getVersion().toString(), jsonForm},
                1);
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

    protected String getParameter(HttpServletRequest request, String name) throws ServletException {
        return optParameter(request, name)
                .orElseThrow(() -> new ServletException("Parameter [" + name + "] is required"));
    }

    protected Optional<String> optParameter(HttpServletRequest request, String name) {
        return Optional.ofNullable(request.getParameter(name));
    }
}
