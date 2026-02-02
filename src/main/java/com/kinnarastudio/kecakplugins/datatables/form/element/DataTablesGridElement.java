package com.kinnarastudio.kecakplugins.datatables.form.element;

import com.kinnarastudio.commons.Declutter;
import com.kinnarastudio.commons.Try;
import com.kinnarastudio.commons.jsonstream.JSONStream;
import com.kinnarastudio.commons.jsonstream.model.JSONObjectEntry;
import com.kinnarastudio.kecakplugins.datatables.core.FormMetaBuilder;
import com.kinnarastudio.kecakplugins.datatables.userview.DataTablesMenu;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.form.model.*;
import org.joget.apps.form.service.FormUtil;
import org.joget.commons.util.LogUtil;
import org.joget.plugin.base.PluginManager;
import org.joget.plugin.base.PluginWebSupport;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import javax.annotation.Nonnull;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class DataTablesGridElement extends Element implements FormBuilderPaletteElement, PluginWebSupport, Declutter {
    private final static String LABEL = "DataTables Grid Element";
    private final static String CATEGORY = "Kecak";
    protected Map<FormData, FormRowSet> cachedRowSet = new HashMap<>();

    private transient FormMetaBuilder formMetaBuilder;

    protected FormMetaBuilder formMetaBuilder() {
        if (formMetaBuilder == null) {
            formMetaBuilder = new FormMetaBuilder();
        }
        return formMetaBuilder;
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
        Object[] arguments = new Object[]{};
        return AppUtil.readPluginResource(this.getClass().getName(), "/properties/form/DataTablesGridElement.json", arguments, true, "messages/DataTablesGridElement").replaceAll("\"", "'");
    }

    @Override
    public String renderTemplate(FormData formData, Map dataModel) {
        AppDefinition appDef = AppUtil.getCurrentAppDefinition();
        String appId = appDef.getAppId();
        String appVersion = String.valueOf(appDef.getVersion());
        dataModel.put("appId", appId);
        dataModel.put("appVersion", appVersion);
        dataModel.put("className", getClassName());
        dataModel.put("element", this);

        String formDefId = this.getPropertyFormDefId();
        dataModel.put("formDefId", formDefId);

        Map<String, Map<String, Object>> fieldMeta = new HashMap<>();
        try {
            fieldMeta = formMetaBuilder().extractFieldMeta(formDefId, formData);
        } catch (JSONException e) {
            LogUtil.error(getClassName(), e, e.getMessage());
        }
        String fieldMetaJson = new JSONObject(fieldMeta).toString();
        dataModel.put("fieldMeta", fieldMetaJson);
        LogUtil.warn(getClassName(), "DataTablesGridElement fieldMetaJson [->" + fieldMetaJson + "<-]");

        String calculationUrl = "/web/json/app/" + appId + "/" + appVersion + "/plugin/" + DataTablesMenu.class.getName() + "/service";
        dataModel.put("calculationUrl", calculationUrl);

        FormRowSet rows = getRows(formData);
        LogUtil.warn(getClassName(), "DataTablesGridElement rows [" + rows.toString() + "]");
        dataModel.put("dataRows", rows);

        return FormUtil.generateElementHtml(
                this,
                formData,
                "DataTablesGridElement.ftl",
                dataModel
        );
    }

    /**
     * Get rows
     * @param formData
     * @return
     */
    protected FormRowSet getRows(FormData formData) {
        if (!cachedRowSet.containsKey(formData)) {
            String id = getPropertyString(FormUtil.PROPERTY_ID);
            String param = FormUtil.getElementParameterName(this);

            FormRowSet rowSet = Optional.of(formData)
                    .map(FormData::getRequestParams)
                    .map(Map::entrySet)
                    .stream()
                    .flatMap(Collection::stream)
                    .filter(e -> e.getKey().equals(param) || e.getKey().contains(param + "_jsonrow"))
                    .map(Map.Entry::getValue)
                    .filter(Objects::nonNull)
                    .flatMap(Arrays::stream)
                    .filter(this::isNotEmpty)
                    .map(Try.onFunction(JSONObject::new))
                    .map(this::convertJsonToFormRow)
                    .collect(Collectors.toCollection(FormRowSet::new));

            final FormRowSet binderRowSet = formData.getLoadBinderData(this);
            if (!FormUtil.isFormSubmitted(this, formData) && binderRowSet != null) {
                if (!binderRowSet.isMultiRow()) {
                    if (!binderRowSet.isEmpty()) {
                        final FormRow row = binderRowSet.get(0);
                        final String jsonValue = row.getProperty(id);
                        rowSet = this.parseFormRowSetFromJson(jsonValue);
                    }
                } else {
                    rowSet = this.convertFormRowToJson(binderRowSet);
                }
            }
            cachedRowSet.put(formData, rowSet);
        }
        return cachedRowSet.get(formData);
    }

    protected FormRowSet parseFormRowSetFromJson(String json) {
        final FormRowSet rowSet = Optional.ofNullable(json)
                .map(String::trim)
                .map(Try.onFunction(JSONArray::new))
                .map(jsonArray -> JSONStream.of(jsonArray, Try.onBiFunction(JSONArray::getJSONObject)))
                .orElseGet(Stream::empty)
                .map(jsonRow -> JSONStream.of(jsonRow, Try.onBiFunction(JSONObject::getString))
                        .collect(() -> {
                            final FormRow row = new FormRow();
                            row.setProperty("jsonrow", jsonRow.toString());
                            return row;
                        }, (r, e) -> r.setProperty(e.getKey(), e.getValue()), FormRow::putAll))
                .collect(FormRowSet::new, FormRowSet::add, FormRowSet::addAll);

        rowSet.setMultiRow(true);

        return rowSet;
    }

    @Nonnull
    protected FormRow convertJsonToFormRow(JSONObject jsonObject) {
        FormRow newRow = new FormRow();
        newRow.setProperty("jsonrow", jsonObject.toString());

        JSONStream.of(jsonObject, Try.onBiFunction(JSONObject::getString))
                .forEach(Try.onConsumer(entry -> {
                    String fieldName = entry.getKey();
                    if (fieldName.equals(FormUtil.PROPERTY_TEMP_FILE_PATH)) {
                        Optional.of(entry)
                                .map(JSONObjectEntry::getValue)
                                .map(Try.onFunction(JSONObject::new))
                                .map(j -> JSONStream.of(j, Try.onBiFunction(JSONObject::getString)))
                                .orElseGet(Stream::empty)
                                .forEach(Try.onConsumer(e -> {
                                    String[] value = Optional.of(e)
                                            .map(Map.Entry::getValue)
                                            .map(Try.onFunction(JSONArray::new))
                                            .map(s -> JSONStream.of(s, Try.onBiFunction(JSONArray::getString)))
                                            .orElseGet(Stream::empty).toArray(String[]::new);
                                    newRow.putTempFilePath(e.getKey(), value);
                                }));

                    } else {
                        String value = entry.getValue();
                        newRow.setProperty(fieldName, value);
                    }
                }));

        return newRow;
    }

    protected FormRowSet convertFormRowToJson(FormRowSet oriRowSet) {
        final FormRowSet rowSet = Optional.ofNullable(oriRowSet)
                .map(Collection::stream)
                .orElseGet(Stream::empty)
                .map(Try.onFunction(row -> {
                    final JSONObject jsonObject = new JSONObject();
                    final FormRow newRow = new FormRow();

                    for (Map.Entry<Object, Object> entry : row.entrySet()) {
                        String key = entry.getKey().toString();
                        String value = entry.getValue().toString();

                        jsonObject.put(key, value);
                        newRow.setProperty(key, value);
                    }

                    newRow.setProperty("jsonrow", jsonObject.toString());
                    return newRow;
                }))
                .collect(FormRowSet::new, FormRowSet::add, FormRowSet::addAll);

        rowSet.setMultiRow(true);
        return rowSet;
    }

    protected String getPropertyFormDefId() {
        return getPropertyString("formDefId");
    }

    @Override
    public String getFormBuilderCategory() {
        return CATEGORY;
    }

    @Override
    public int getFormBuilderPosition() {
        return 100;
    }

    @Override
    public String getFormBuilderIcon() {
        return "<i class=\"fas fa-table\"></i>";
    }

    @Override
    public String getFormBuilderTemplate() {
        return "<table cellspacing='0'><tbody><tr><th>Header</th><th>Header</th></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table>";
    }

    @Override
    public void webService(HttpServletRequest httpServletRequest, HttpServletResponse httpServletResponse) throws ServletException, IOException {

    }
}
