package com.kinnarastudio.kecakplugins.datatables.core;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import javax.annotation.Nullable;

import org.joget.apps.app.dao.FormDefinitionDao;
import org.joget.apps.app.dao.PackageDefinitionDao;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.model.FormDefinition;
import org.joget.apps.app.model.PackageDefinition;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.form.model.Element;
import org.joget.apps.form.model.Form;
import org.joget.apps.form.model.FormData;
import org.joget.apps.form.model.FormRow;
import org.joget.apps.form.service.FormService;
import org.joget.apps.form.service.FormUtil;
import org.joget.commons.util.LogUtil;
import org.joget.workflow.model.WorkflowAssignment;
import org.joget.workflow.model.service.WorkflowManager;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.springframework.context.ApplicationContext;

import com.kinnarastudio.commons.Try;
import com.kinnarastudio.kecakplugins.datatables.userview.biz.DataTablesMenuBiz;
import com.kinnarastudio.kecakplugins.datatables.util.Validator;
import com.kinnarastudio.kecakplugins.datatables.util.enums.FormElementType;

/**
 *  META BUILDER
 *
 * - Support Section
 * - Support SubForm
 * - Preserve sectionId
 * - Preserve subForm context
 *
 * @author tiyojati
 */
public class FormMetaBuilder {
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

    private FormService getFormService() {
        ApplicationContext appContext = AppUtil.getApplicationContext();
        return (FormService) appContext.getBean("formService");
    }

    public Map<String, Map<String, Object>> extractFieldMeta(String formDefId, FormData formData) throws JSONException {
        JSONObject jsonForm;
        boolean isUserview = false;
        if (Validator.isNotNullOrEmpty(formData)){
            jsonForm = this.getSelectedJsonForm(formData, formDefId);
        }else {
            jsonForm = this.getJsonFormCached(formDefId);
            isUserview = true;
        }
        Map<String, Map<String, Object>> result = new HashMap<>();
        this.walkElements(jsonForm.getJSONArray("elements"), result, isUserview);
        return result;
    }

    protected void walkElements(JSONArray elements, Map<String, Map<String, Object>> result, boolean isUserview)
            throws JSONException {
        walkElements(elements, result, false, null, null, isUserview);
    }

    protected void walkElements(
            JSONArray elements,
            Map<String, Map<String, Object>> result,
            boolean inSubForm,
            String subFormDefId,
            String sectionId,
            boolean isUserview
    ) throws JSONException {

        for (int i = 0; i < elements.length(); i++) {
            JSONObject element = elements.getJSONObject(i);
            String className   = element.optString("className", "");
            JSONObject props   = element.optJSONObject("properties");

            /* ================= SECTION ================= */
            if (handleSection(element, className, result, inSubForm, subFormDefId, sectionId, isUserview)) {
                continue;
            }

            if (Validator.isNullOrEmpty(props)) continue;

            /* ================= SUBFORM ================= */
            if (handleSubForm(element, props, className, result, sectionId, isUserview)) {
                continue;
            }

            /* ================= FIELD ================= */
            if (isField(className) && !isCustomHTML(className)) {
                handleField(
                        element,
                        props,
                        className,
                        result,
                        inSubForm,
                        subFormDefId,
                        sectionId,
                        isUserview
                );
            }

            /* ================= CHILD ================= */
            walkChildren(element, result, inSubForm, subFormDefId, sectionId, isUserview);
        }
    }

    /* ==========================================================
     * SECTION
     * ========================================================== */

    private boolean handleSection(
            JSONObject element,
            String className,
            Map<String, Map<String, Object>> result,
            boolean inSubForm,
            String subFormDefId,
            String sectionId,
            boolean isUserview
    ) throws JSONException {

        if (!FormElementType.isSection(className)) return false;

        JSONObject props = element.optJSONObject("properties");
        String currentSectionId = props != null ? props.optString("id") : sectionId;

        /* ==========================================================
        * EXTRACT VISIBILITY META
        * ========================================================== */
        if (props != null && props.has("visibilityControl") && !isUserview) {
            Map<String, Object> visibilityMeta = new HashMap<>();
            visibilityMeta.put("id", currentSectionId);
            visibilityMeta.put("type", "section");
            visibilityMeta.put("visibilityControl", props.optString("visibilityControl"));
            visibilityMeta.put("visibilityValue", props.optString("visibilityValue"));
            visibilityMeta.put("join", props.optString("join"));
            visibilityMeta.put("regex", props.optString("regex"));
            visibilityMeta.put("reverse", props.optString("reverse"));

            result.put(currentSectionId, visibilityMeta);
        }

        if (element.has("elements")) {
            walkElements(
                    element.getJSONArray("elements"),
                    result,
                    inSubForm,
                    subFormDefId,
                    currentSectionId,
                    isUserview
            );
        }
        return true;
    }

    /* ==========================================================
     * SUBFORM
     * ========================================================== */

    private boolean handleSubForm(
            JSONObject element,
            JSONObject props,
            String className,
            Map<String, Map<String, Object>> result,
            String sectionId,
            boolean isUserview
    ) throws JSONException {

        if (!FormElementType.isSubForm(className)) return false;

        String sfDefId = props.optString("formDefId");
        if (Validator.isNullOrEmpty(sfDefId)) return true;

        JSONObject subFormJson = getJsonFormCached(sfDefId);
        if (subFormJson == null) return true;

        JSONArray subElements = subFormJson.optJSONArray("elements");
        if (subElements != null) {
            walkElements(subElements, result, true, sfDefId, sectionId, isUserview);
        }
        return true;
    }

    /* ==========================================================
     * FIELD HANDLER
     * ========================================================== */

    private void handleField(
            JSONObject element,
            JSONObject props,
            String className,
            Map<String, Map<String, Object>> result,
            boolean inSubForm,
            String subFormDefId,
            String sectionId,
            boolean isUserview
    ) throws JSONException {

        String fieldId = props.optString("id");
        if (Validator.isNullOrEmpty(fieldId)) return;

        Map<String, Object> meta = new HashMap<>();

        /* ===== BASIC ===== */
        if (!isUserview) {
            meta.put("fieldId", fieldId);
        }
        meta.put("sectionId", sectionId);
        meta.put("className", className);
        meta.put("readonly", isTrue(props, "readonly"));
        meta.put("isHidden", isTrue(props, "hidden"));

        boolean mandatory = isMandatory(props);
        boolean numeric   = isNumericValidator(props);

        meta.put("mandatory", mandatory);
        meta.put("type", resolveType(className, numeric));

        /* ===== OPTIONS ===== */
        if ("select".equals(meta.get("type"))) {
            meta.put("options", resolveOptions(element, props, fieldId));
        }

        /* ===== FORMATTER ===== */
        meta.put("formatter", resolveFormatter(props));

        /* ===== CALCULATION ===== */
        meta.put("calculationLoadBinder", resolveCalculationBinder(props, sectionId, isUserview));

        /* ===== AUTOFILL ===== */
        meta.put("autofillLoadBinder", resolveAutofillBinder(props));

        /* ===== SUBFORM CONTEXT ===== */
        meta.put("isSubForm", inSubForm);
        if (inSubForm) {
            meta.put("formDefId", subFormDefId);
        }

        /* ===== FILE ===== */
        if (FormElementType.isFileUpload(className)){
            meta.put("readonly", true);
        }

        /* ===== USE COMPOSITE KEY FOR RESULT MAP ===== */
        if (!isUserview){
            String compositeKey = (Validator.isNotNullOrEmpty(sectionId)) ? sectionId + "." + fieldId : fieldId;
            result.put(compositeKey, meta);
        }else {
            result.put(fieldId, meta);
        }
    }

    /* ==========================================================
     * OPTIONS
     * ========================================================== */
    private JSONArray resolveOptions(JSONObject element, JSONObject props, String fieldId) {
        if (!props.has("optionsBinder")) {
            return props.optJSONArray("options");
        }

        JSONObject optionsBinder = props.optJSONObject("optionsBinder");
        JSONObject obProps = optionsBinder != null ? optionsBinder.optJSONObject("properties") : null;

        if (Validator.isNotNullOrEmpty(obProps)) {
            try {
                return getJsonOptionsCached(element, fieldId);
            } catch (Exception e) {
                LogUtil.error(
                        DataTablesMenuBiz.class.getName(),
                        e,
                        "Error parsing element form options binder"
                );
            }
        }

        return props.optJSONArray("options");
    }

    /* ==========================================================
     * FORMATTER
     * ========================================================== */
    private Map<String, Object> resolveFormatter(JSONObject props) {
        String style = props.optString("style");
        if (Validator.isNullOrEmpty(style)) return null;

        Map<String, Object> formatter = new HashMap<>();
        formatter.put("style", style);
        formatter.put("useThousandSeparator", isTrue(props, "useThousandSeparator"));
        formatter.put("numOfDecimal", props.optString("numOfDecimal"));
        return formatter;
    }

    /* ==========================================================
     * CALCULATION
     * ========================================================== */
    private Map<String, Object> resolveCalculationBinder(JSONObject props, String sectionId, boolean isUserview) {
        JSONObject calc = props.optJSONObject("calculationLoadBinder");

        JSONArray originalVars = props.optJSONArray("variables");
        JSONArray mappedVars = new JSONArray();

        // Map variables to include targetCompositeKey
        if (originalVars != null && !isUserview) {
            for (int i = 0; i < originalVars.length(); i++) {
                try {
                    JSONObject varObj = new JSONObject(originalVars.getJSONObject(i).toString());
                    String varName = varObj.optString("variableName");
                    varObj.put("targetCompositeKey", (Validator.isNotNullOrEmpty(sectionId) ? sectionId + "_" : "") + varName);
                    mappedVars.put(varObj);
                } catch (Exception e) {
                LogUtil.error(
                        DataTablesMenuBiz.class.getName(),
                        e, e.getMessage());
                }
            }
        }

        boolean hasValidCalculationBinder =
                calc != null
                && Validator.isNotNullOrEmpty(calc.optString("className"))
                && Validator.isNotNullOrEmpty(calc.optJSONObject("properties"));

        if (!hasValidCalculationBinder) {
            // === TREAT AS NO calculationLoadBinder ===
            if (props.has("useJsEquation")) {
                Map<String, Object> meta = new HashMap<>();
                meta.put("useJsEquation", props.optString("useJsEquation"));
                meta.put("equation", props.optString("jsEquation"));
                if (!isUserview){
                    meta.put("variables", mappedVars);
                }else {
                    meta.put("variables", originalVars);
                }
                Map<String, Object> roundNumber = new HashMap<>();

                if (Validator.isNotNullOrEmpty(props.optString("roundNumber"))) {
                    roundNumber.put("isRoundNumber", props.optString("roundNumber"));
                    roundNumber.put("roundingMode", props.optString("roundingMode"));
                    roundNumber.put("decimalPlaces", props.optString("decimalPlaces"));
                    meta.put("roundNumber", roundNumber);
                }
                return meta;
            }
            return null;

        } else {
            // === calculationLoadBinder VALID ===
            Map<String, Object> meta = new HashMap<>();
            meta.put("className", calc.optString("className"));

            JSONObject cp = calc.optJSONObject("properties");
            meta.put("equation", cp.optString("equation"));
            meta.put("debug", cp.optString("debug"));
            if (!isUserview){
                meta.put("variables", mappedVars);
            }else {
                meta.put("variables", originalVars);
            }

            return meta;
        }
    }

    /* ==========================================================
     * AUTOFILL
     * ========================================================== */

    private Map<String, Object> resolveAutofillBinder(JSONObject props) {
        if (!props.has("autofillLoadBinder")) return null;

        JSONObject afl = props.optJSONObject("autofillLoadBinder");
        Map<String, Object> meta = new HashMap<>();

        meta.put("className", afl.optString("className"));

        JSONObject aflProps = afl.optJSONObject("properties");
        if (Validator.isNotNullOrEmpty(aflProps)) {
            meta.put("formDefId", aflProps.optString("formDefId"));
        }

        JSONArray fields = props.optJSONArray("autofillFields");
        meta.put("fields", Validator.isNotNullOrEmpty(fields) ? fields : new JSONArray());

        AppDefinition appDef = AppUtil.getCurrentAppDefinition();
        String appId = appDef.getAppId();
        String appVersion = String.valueOf(appDef.getVersion());

        meta.put("serviceUrl", "/web/json/app/" + appId + "/" + appVersion + "/plugin/com.kinnarastudio.kecakplugins.autofillselectbox.AutofillSelectBox/service");

        return meta;
    }

    private void walkChildren(
            JSONObject element,
            Map<String, Map<String, Object>> result,
            boolean inSubForm,
            String subFormDefId,
            String sectionId,
            boolean isUserview
    ) throws JSONException {

        if (element.has("elements")) {
            walkElements(
                    element.getJSONArray("elements"),
                    result,
                    inSubForm,
                    subFormDefId,
                    sectionId,
                    isUserview
            );
        }
    }

    private boolean isField(String className) {
        return className.startsWith("org.joget.apps.form.lib")
                || className.startsWith("com.kinnarastudio");
    }

    private boolean isCustomHTML(String className) {
        return className.equals("org.joget.apps.form.lib.CustomHTML");
    }

    private boolean isTrue(JSONObject obj, String key) {
        return "true".equalsIgnoreCase(obj.optString(key));
    }

    private boolean isMandatory(JSONObject props) {
        JSONObject v = props.optJSONObject("validator");
        JSONObject vp = v != null ? v.optJSONObject("properties") : null;
        return vp != null && "true".equalsIgnoreCase(vp.optString("mandatory"));
    }

    private boolean isNumericValidator(JSONObject props) {
        JSONObject v = props.optJSONObject("validator");
        String cn = v != null ? v.optString("className") : "";
        return Validator.isNotNullOrEmpty(cn) && cn.contains("NumericValidator");
    }

    private String resolveType(String className, boolean numeric) {
        if (numeric) return "number";
        return FormElementType.resolveType(className);
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
                    new CachedElementOptions(jsonArray, now + OPTIONS_CACHE_TTL)
            );
        }

        return jsonArray;
    }

    public JSONObject getJsonForm(String formDefId) {
        ApplicationContext appContext = AppUtil.getApplicationContext();
        FormService formService = getFormService();
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

    private JSONArray getElementOptions(JSONObject element, String fieldId) throws Exception {
        final Element el = FormUtil.findAndParseElementFromJsonObject(element, fieldId);
        LogUtil.warn(FormMetaBuilder.class.getName(), "DataTablesGridElement fieldMeta select element [" + el.toString() + "]");
        final FormData formData = getFormService().executeFormOptionsBinders(el, new FormData());
        final Collection<FormRow> optionMap = FormUtil.getElementPropertyOptionsMap(el, formData);
        return optionMap.stream()
                .map(row -> {
                    LogUtil.warn(FormMetaBuilder.class.getName(), "DataTablesGridElement fieldMeta select element row [" + row.toString() + "]");
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

    /**
     * @param formData
     * @return
     */
    protected JSONObject getSelectedJsonForm(FormData formData, String formDefId) throws JSONException {
        FormService formService = (FormService) AppUtil.getApplicationContext().getBean("formService");
        String processId = formData.getProcessId();
        if (Validator.isNotNullOrEmpty(processId)) {
            processId = formData.getPrimaryKeyValue();
        }
        String formJson = "";
        Form form = generateForm(formDefId, processId, null);
        if (form != null) {
            formJson = formService.generateElementJson(form);
        }

        JSONObject jsonObject = new JSONObject();
        if (Validator.isNotNullOrEmpty(formJson)) {
            jsonObject = new JSONObject(formJson);
        }
        return jsonObject;
    }

    /**
     * Construct form from formId
     *
     * @param formDefId
     * @param processId
     * @param formCache
     * @return
     */
    @Nullable
    protected Form generateForm(String formDefId, String processId, Map<String, Form> formCache) {
        if (formDefId == null || formDefId.isEmpty())
            return null;

        // check in cache
        if (formCache != null && formCache.containsKey(formDefId))
            return formCache.get(formDefId);

        // proceed without cache
        FormService formService = (FormService) AppUtil.getApplicationContext().getBean("formService");
        Form form;
        WorkflowManager workflowManager = (WorkflowManager) AppUtil.getApplicationContext().getBean("workflowManager");
        PackageDefinitionDao packageDefinitionDao = (PackageDefinitionDao) AppUtil.getApplicationContext().getBean("packageDefinitionDao");

        AppDefinition appDef = Optional.ofNullable(processId)
                .map(workflowManager::getRunningProcessById)
                .filter(p -> p.getPackageId() != null && p.getVersion() != null)
                .map(Try.onFunction(process -> {
                    String packageId = process.getPackageId();
                    Long packageVersion = Long.parseLong(process.getVersion());
                    return packageDefinitionDao.loadPackageDefinition(packageId, packageVersion);
                }))
                .map(PackageDefinition::getAppDefinition)
                .orElseGet(AppUtil::getCurrentAppDefinition);

        if (appDef != null) {
            FormDefinitionDao formDefinitionDao = (FormDefinitionDao) AppUtil.getApplicationContext().getBean("formDefinitionDao");
            FormDefinition formDef = formDefinitionDao.loadById(formDefId, appDef);
            if (formDef != null) {
                FormData formData = new FormData();
                String json = formDef.getJson();
                if (processId != null && !processId.isEmpty()) {
                    formData.setProcessId(processId);
                    WorkflowManager wm = (WorkflowManager) AppUtil.getApplicationContext().getBean("workflowManager");
                    WorkflowAssignment wfAssignment = wm.getAssignmentByProcess(processId);
                    if (wfAssignment != null)
                        json = AppUtil.processHashVariable(json, wfAssignment, "json", null);
                }
                form = (Form) formService.createElementFromJson(json);

                // put in cache if possible
                if (formCache != null)
                    formCache.put(formDefId, form);

                return form;
            }
        }
        return null;
    }
}
