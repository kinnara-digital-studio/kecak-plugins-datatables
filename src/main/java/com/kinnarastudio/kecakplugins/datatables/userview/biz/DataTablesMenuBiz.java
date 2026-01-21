package com.kinnarastudio.kecakplugins.datatables.userview.biz;

import com.kinnarastudio.commons.Try;
import com.kinnarastudio.kecakplugins.datatables.exception.RestApiException;
import com.kinnarastudio.kecakplugins.datatables.util.DataTablesUtil;
import com.kinnarastudio.kecakplugins.datatables.util.Validator;
import com.kinnarastudio.kecakplugins.datatables.util.enums.FormElementType;
import org.joget.apps.app.dao.DatalistDefinitionDao;
import org.joget.apps.app.dao.FormDefinitionDao;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.model.DatalistDefinition;
import org.joget.apps.app.model.FormDefinition;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.datalist.model.DataList;
import org.joget.apps.datalist.model.DataListColumnFormatDefault;
import org.joget.apps.datalist.service.DataListService;
import org.joget.apps.form.model.*;
import org.joget.apps.form.service.FormService;
import org.joget.apps.form.service.FormUtil;
import org.joget.apps.userview.model.UserviewMenu;
import org.joget.apps.userview.model.UserviewPermission;
import org.joget.commons.util.LogUtil;
import org.joget.commons.util.SecurityUtil;
import org.joget.directory.model.User;
import org.joget.plugin.base.PluginManager;
import org.joget.workflow.model.service.WorkflowUserManager;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.springframework.context.ApplicationContext;

import javax.servlet.http.HttpServletResponse;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Stream;

public class DataTablesMenuBiz {
    private String getClassName() {
        return getClass().getName();
    }

    public boolean getPermissionToEdit(UserviewMenu userviewMenu) {
        ApplicationContext appContext = AppUtil.getApplicationContext();
        PluginManager pluginManager = (PluginManager) appContext.getBean("pluginManager");
        WorkflowUserManager workflowUserManager = (WorkflowUserManager) appContext.getBean("workflowUserManager");
        final User currentUser = workflowUserManager.getCurrentUser();
        Optional<UserviewPermission> optPermission = Optional.of("permission").map(userviewMenu::getProperty)
                .map(o -> (Map<String, Object>) o)
                .map(pluginManager::getPlugin);

        return optPermission
                .map(permission -> {
                    permission.setCurrentUser(currentUser);
                    return permission.isAuthorize();
                })
                .orElse(false);
    }

    public DataList getDataList(String dataListId) {
        ApplicationContext applicationContext = AppUtil.getApplicationContext();
        DatalistDefinitionDao datalistDefinitionDao = (DatalistDefinitionDao) applicationContext
                .getBean("datalistDefinitionDao");
        DataListService dataListService = (DataListService) applicationContext.getBean("dataListService");
        AppDefinition appDefinition = AppUtil.getCurrentAppDefinition();
        DatalistDefinition datalistDefinition = datalistDefinitionDao.loadById(dataListId, appDefinition);
        if (datalistDefinition == null) {
            LogUtil.warn(this.getClassName(), "DataList Definition [" + dataListId + "] not found");
            return null;
        }

        DataList dataList = dataListService.fromJson(datalistDefinition.getJson());
        if (dataList == null) {
            LogUtil.warn(this.getClassName(), "DataList [" + dataListId + "] not found");
            return null;
        }

        dataList.setPageSize(DataList.MAXIMUM_PAGE_SIZE);
        return dataList;
    }

    public JSONObject getJsonForm(String formDefId) {
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

    public String generateNonce(AppDefinition appDefinition, String jsonForm) {
        return SecurityUtil.generateNonce(
                new String[]{"EmbedForm", appDefinition.getAppId(), appDefinition.getVersion().toString(), jsonForm},
                1);
    }

    /**
     * Execute calculation load binder
     *
     * @param element
     * @param formData
     * @return
     */
    public BigDecimal executeCalculation(Element element, FormData formData) {
        ApplicationContext appContext = AppUtil.getApplicationContext();
        FormService formService = (FormService) appContext.getBean("formService");

        try {
            formData = formService.executeFormLoadBinders(element, formData);
        } catch (Exception e) {
        }

        FormRowSet rowSet = formData.getLoadBinderData(element);
        return Optional.ofNullable(rowSet)
                .map(Collection::stream)
                .orElse(Stream.empty())
                .findFirst()
                .map(row -> row.getProperty(element.getPropertyString(FormUtil.PROPERTY_ID)))
                .filter(Objects::nonNull)
                .filter(s -> !s.isEmpty())
                .map(BigDecimal::new)
                .orElse(new BigDecimal("0"));
    }

    /**
     * Generate FormData based on request
     *
     * @param primaryKey
     * @param requestParameters
     * @return
     */
    public FormData generateFormData(String primaryKey, JSONObject requestParameters) {
        FormData formData = new FormData();
        formData.setPrimaryKeyValue(primaryKey);

        if (requestParameters != null) {
            Iterator<String> i = requestParameters.keys();
            while (i.hasNext()) {
                String key = i.next();
                String requestValue = requestParameters.optString(key);
                formData.addRequestParameterValues(key, new String[]{requestValue});
            }
        }

        return formData;
    }

    public Form generateForm(String formDefId, AppDefinition appDef) {
        FormService formService = (FormService) AppUtil.getApplicationContext().getBean("formService");
        Form form;
        if (appDef != null && formDefId != null && !formDefId.isEmpty()) {
            FormDefinitionDao formDefinitionDao = (FormDefinitionDao) AppUtil.getApplicationContext().getBean("formDefinitionDao");
            FormDefinition formDef = formDefinitionDao.loadById(formDefId, appDef);
            if (formDef != null) {
                String json = formDef.getJson();
                form = (Form) formService.createElementFromJson(json);
                return form;
            }
        }
        return null;
    }

    public JSONObject calculationLoadBinder(JSONObject body, AppDefinition appDefinition, PluginManager pluginManager) throws RestApiException, JSONException {
        String formDefId = body.getString("formDefId");
        String fieldId = body.getString("fieldId");
        String primaryKey = body.optString("primaryKey");

        Form form = this.generateForm(formDefId, appDefinition);
        if (form == null) {
            throw new RestApiException(HttpServletResponse.SC_BAD_REQUEST, "Form [" + formDefId + "] cannot be defined");
        }

        JSONObject requestParameters = body.optJSONObject("requestParams");
        LogUtil.info(getClassName(), "requestParameters value : " + requestParameters.toString());
        FormData formData = this.generateFormData(primaryKey, requestParameters);

        Element element = FormUtil.findElement(fieldId, form, formData);

        String currencyField = element.getPropertyString("currencyRefField");
        Map<String, Object> calculationLoadBinder = (Map<String, Object>) element.getProperty("calculationLoadBinder");

        BigDecimal value;

        FormLoadBinder loadBinderPlugins = DataTablesUtil.getPluginObject(calculationLoadBinder, pluginManager);
        if (loadBinderPlugins != null) {
            // value is calculated by calculation load binder
            element.setLoadBinder(loadBinderPlugins);
            value = this.executeCalculation(element, formData);

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
        return data;
    }
}
