package com.kinnarastudio.kecakplugins.datatables.userview.biz;

import com.kinnarastudio.commons.Try;
import com.kinnarastudio.kecakplugins.datatables.exception.RestApiException;
import com.kinnarastudio.kecakplugins.datatables.util.DataTablesUtil;
import com.kinnarastudio.kecakplugins.datatables.util.Validator;
import org.joget.apps.app.dao.DatalistDefinitionDao;
import org.joget.apps.app.dao.FormDefinitionDao;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.model.DatalistDefinition;
import org.joget.apps.app.model.FormDefinition;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.datalist.model.DataList;
import org.joget.apps.datalist.model.DataListColumnFormatDefault;
import org.joget.apps.datalist.service.DataListService;
import org.joget.apps.form.lib.Grid;
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
    /* ================= FORM JSON CACHE (TTL) ================= */
    private static final long FORM_CACHE_TTL = 5 * 60 * 1000; // 5 menit
    private static final long OPTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 menit

    private static final Map<String, CachedFormJson> FORM_JSON_CACHE =
            new java.util.concurrent.ConcurrentHashMap<>();

    private static final Map<String, CachedElementOptions> OPTIONS_JSON_CACHE =
            new java.util.concurrent.ConcurrentHashMap<>();

    protected static class CachedFormJson {
        JSONObject json;
        long expireAt;

        CachedFormJson(JSONObject json, long expireAt) {
            this.json = json;
            this.expireAt = expireAt;
        }
    }

    protected static class CachedElementOptions {
        JSONArray jsonArray;
        long expireAt;

        CachedElementOptions(JSONArray jsonArray, long expireAt) {
            this.jsonArray = jsonArray;
            this.expireAt = expireAt;
        }
    }

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

    public Map<String, Map<String, Object>> extractFieldMeta(String formDefId) throws JSONException {
        JSONObject jsonForm = this.getJsonFormCached(formDefId);
        Map<String, Map<String, Object>> result = new HashMap<>();
        this.walkElements(jsonForm.getJSONArray("elements"), result);
        return result;
    }

    protected void walkElements(JSONArray elements, Map<String, Map<String, Object>> result)
            throws JSONException {
        walkElements(elements, result, false, null);
    }

    protected void walkElements(JSONArray elements, Map<String, Map<String, Object>> result, boolean inSubForm, String subFormDefId) throws JSONException {
        for (int i = 0; i < elements.length(); i++) {

            JSONObject element = elements.getJSONObject(i);
            String className   = element.optString("className", "");
            JSONObject props   = element.optJSONObject("properties");

            if (Validator.isNullOrEmpty(props)) continue;

            /* ================= SUBFORM ================= */
            if ("org.joget.apps.form.lib.SubForm".equals(className)) {

                String sfDefId = props.optString("formDefId");

                if (Validator.isNotNullOrEmpty(sfDefId)) {
                    JSONObject subFormJson = this.getJsonFormCached(sfDefId);
                    if (subFormJson != null) {
                        JSONArray subElements = subFormJson.optJSONArray("elements");
                        if (subElements != null) {
                            walkElements(subElements, result, true, sfDefId);
                        }
                    }
                }
                continue;
            }

            /* ================= FIELD (NORMAL / SUBFORM) ================= */
            if (className.startsWith("org.joget.apps.form.lib")
                    || className.startsWith("com.kinnarastudio")) {

                String fieldId = props.optString("id");
                if (Validator.isNullOrEmpty(fieldId)) continue;

                Map<String, Object> meta = new HashMap<>();

                /* === COMMON META === */
                meta.put("readonly", "true".equalsIgnoreCase(props.optString("readonly")));
                meta.put("isHidden", "true".equalsIgnoreCase(props.optString("hidden")));
                meta.put("className", className);

                boolean mandatory = false;
                boolean isNumeric = false;
                if (props.has("validator")) {
                    JSONObject v = props.getJSONObject("validator").optJSONObject("properties");
                    if (v != null) {
                        mandatory = "true".equalsIgnoreCase(v.optString("mandatory"));
                    }
                    String vClassName = props.getJSONObject("validator").optString("className");
                    if (Validator.isNotNullOrEmpty(vClassName)){
                        if (vClassName.contains("NumericValidator")){
                            isNumeric = true;
                        }
                    }
                }
                meta.put("mandatory", mandatory);

                String type = DataTablesUtil.CLASSNAME_TYPE_MAP
                        .getOrDefault(className, "text");
                if (isNumeric){
                    type = "number";
                }
                meta.put("type", type);

                if ("select".equals(type)) {
                    JSONArray options = props.optJSONArray("options");
                    if (Validator.isNullOrEmpty(options)){
                        try {
                            options = this.getJsonOptionsCached(element, fieldId);
                        } catch (Exception e) {
                            LogUtil.error(DataTablesMenuBiz.class.getName(), e, "Error parsing element form options binder");
                        }
                    }
                    meta.put("options", options);
                }

                Map<String, Object> formatter = new HashMap<>();
                String formatStyle = props.optString("style");
                if (Validator.isNotNullOrEmpty(formatStyle)){
                    formatter.put("style", formatStyle);
                    formatter.put("useThousandSeparator", "true".equalsIgnoreCase(props.optString("useThousandSeparator")));
                    formatter.put("numOfDecimal", props.optString("numOfDecimal"));

                    meta.put("formatter", formatter);
                }else {
                    meta.put("formatter", null);
                }

                /* === calculationLoadBinder === */
                if (props.has("calculationLoadBinder")) {
                    JSONObject calc = props.getJSONObject("calculationLoadBinder");
                    Map<String, Object> calcMeta = new HashMap<>();
                    calcMeta.put("className", calc.optString("className"));

                    JSONObject cp = calc.optJSONObject("properties");
                    if (cp != null) {
                        calcMeta.put("equation", cp.optString("equation"));
                        calcMeta.put("debug", cp.optString("debug"));
                    }
                    if (props.has("variables")) {
                        calcMeta.put("variables", props.getJSONArray("variables"));
                    }
                    meta.put("calculationLoadBinder", calcMeta);
                } else {
                    meta.put("calculationLoadBinder", null);
                }

                /* ================= SUBFORM CONTEXT FLAG ================= */
                meta.put("isSubForm", inSubForm);
                if (inSubForm) {
                    meta.put("formDefId", subFormDefId);
                }

                result.put(fieldId, meta);
            }

            /* ================= CHILD ELEMENTS ================= */
            if (element.has("elements")) {
                walkElements(element.getJSONArray("elements"), result, inSubForm, subFormDefId);
            }
        }
    }

    protected JSONObject getJsonFormCached(String formDefId) {
        long now = System.currentTimeMillis();
        CachedFormJson cached = FORM_JSON_CACHE.get(formDefId);

        if (cached != null && cached.expireAt > now) {
            return cached.json;
        }

        JSONObject json = getJsonForm(formDefId);
        if (json != null && json.length() > 0) {
            FORM_JSON_CACHE.put(
                    formDefId,
                    new CachedFormJson(json, now + FORM_CACHE_TTL)
            );
        }

        return json;
    }

    protected JSONArray getJsonOptionsCached(JSONObject element, String fieldId) throws Exception {
        long now = System.currentTimeMillis();
        CachedElementOptions cached = OPTIONS_JSON_CACHE.get(fieldId);

        if (cached != null && cached.expireAt > now) {
            return cached.jsonArray;
        }

        JSONArray jsonArray = getElementOptions(element, fieldId);
        if (Validator.isNotNullOrEmpty(jsonArray)) {
            OPTIONS_JSON_CACHE.put(
                    fieldId,
                    new CachedElementOptions(jsonArray, now + FORM_CACHE_TTL)
            );
        }

        return jsonArray;
    }

    private JSONArray getElementOptions(JSONObject element, String fieldId) throws Exception {
        final Element el = FormUtil.findAndParseElementFromJsonObject(element, fieldId);
        LogUtil.warn(getClassName(), "DataTablesGridElement fieldMeta select element [" + el.toString() + "]");
        final FormData formData = getFormService().executeFormOptionsBinders(el, new FormData());
        final Collection<FormRow> optionMap = FormUtil.getElementPropertyOptionsMap(el, formData);
        return optionMap.stream()
                .map(row -> {
                    LogUtil.warn(getClassName(), "DataTablesGridElement fieldMeta select element row [" + row.toString() + "]");
                    JSONObject o = new JSONObject();
                    try {
                        o.put("value", row.getProperty("value"));
                        o.put("label", row.getProperty("label"));
                    } catch (JSONException e) {
                        LogUtil.error(DataTablesMenuBiz.class.getName(), e, "Error parsing element form options binder");
                    }
                    return o;
                })
                .collect(
                        JSONArray::new,
                        JSONArray::put,
                        JSONArray::put
                );
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

    private FormService getFormService() {
        ApplicationContext appContext = AppUtil.getApplicationContext();
        return (FormService) appContext.getBean("formService");
    }
}
