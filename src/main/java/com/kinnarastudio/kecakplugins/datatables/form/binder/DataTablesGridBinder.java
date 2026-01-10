package com.kinnarastudio.kecakplugins.datatables.form.binder;

import com.kinnarastudio.kecakplugins.datatables.form.biz.DataTablesGridBinderBiz;
import com.kinnarastudio.kecakplugins.datatables.util.Validator;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.service.AppService;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.form.dao.FormDataDao;
import org.joget.apps.form.lib.HiddenField;
import org.joget.apps.form.model.*;
import org.joget.apps.form.service.FormUtil;
import org.joget.commons.util.LogUtil;
import org.joget.plugin.base.PluginManager;
import org.joget.plugin.base.PluginWebSupport;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.kecak.apps.exception.ApiException;
import org.springframework.beans.BeansException;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.*;

/**
 * DataTables Grid Binder (For DataTablesGridElement)
 * @author tiyojati
 */
public class DataTablesGridBinder extends FormBinder
        implements FormLoadBinder,
        FormStoreBinder,
        FormLoadMultiRowElementBinder,
        FormStoreMultiRowElementBinder,
        FormDataDeletableBinder,
        PluginWebSupport {

    private String tableName = null;

    private final static String LABEL = "DataTables Grid Binder";

    private transient DataTablesGridBinderBiz dataTablesGridBinderBiz;

    protected DataTablesGridBinderBiz dataTablesBinderBiz() {
        if (dataTablesGridBinderBiz == null) {
            dataTablesGridBinderBiz = new DataTablesGridBinderBiz();
        }
        return dataTablesGridBinderBiz;
    }

    @Override
    public String getFormId() {
        return getPropertyString("formDefId");
    }

    @Override
    public String getTableName() {
        if (tableName == null) {
            AppService appService = (AppService) AppUtil.getApplicationContext().getBean("appService");
            AppDefinition appDef = AppUtil.getCurrentAppDefinition();
            String formDefId = getFormId();
            tableName = appService.getFormTableName(appDef, formDefId);
        }
        return tableName;
    }

    @Override
    public FormRowSet load(Element element, String primaryKey, FormData formData) {
        FormRowSet rows = new FormRowSet();
        Form form = dataTablesBinderBiz().getSelectedForm(getFormId());
        if (form != null && primaryKey != null) {
            try {
                final FormDataDao formDataDao = (FormDataDao) AppUtil.getApplicationContext().getBean("formDataDao");
                final String propertyName = dataTablesBinderBiz().getFormPropertyName(form, this.getPropertyString("foreignKey"));
                final StringBuilder condition = new StringBuilder(propertyName != null && !propertyName.isEmpty() ? " WHERE " + propertyName + " = ?" : "");
                List<Object> paramsArray = new ArrayList<>();
                paramsArray.add(primaryKey);
                rows = formDataDao.find(form, condition.toString(), paramsArray.toArray(), "dateCreated", false, null, null);
            } catch (BeansException e) {
                LogUtil.error(getClassName(), e, e.getMessage());
            }
        }
        rows.setMultiRow(true);
        return rows;

    }

    @Override
    public FormRowSet store(Element element, FormRowSet formRowSet, FormData formData) {
        LogUtil.warn(getClassName(), "Execute DataTablesBinder [" + getFormId() + "]");
        LogUtil.warn(getClassName(), "DataTablesBinder ELEMENT [" + element.toString() + "]");
        LogUtil.warn(getClassName(), "DataTablesBinder FormData getRequestParams [" + formData.getRequestParams().toString() + "]");
        LogUtil.warn(getClassName(), "DataTablesBinder formRowSet initialRequest [" + formRowSet.toString() + "]");

        String elementParamName = formData.getRequestParameter("elementParamName");
        LogUtil.warn(getClassName(), "DataTablesBinder FormData elementParamName [" + elementParamName + "]");
        FormRowSet rows = new FormRowSet();
        if (Validator.isNotNullOrEmpty(elementParamName)){
            FormDataDao formDataDao = (FormDataDao) FormUtil.getApplicationContext().getBean("formDataDao");
            AppService appService = (AppService) FormUtil.getApplicationContext().getBean("appService");
            Form form = dataTablesBinderBiz().getSelectedForm(getFormId());
            if (Validator.isNotNullOrEmpty(form)){
                int rowCount = Integer.parseInt(formData.getRequestParameter("rowCount"));
                if (rowCount > 1){
                    rows.setMultiRow(true);
                }
                for (int i = 0; i < rowCount; i++) {
                    String fieldName = elementParamName + i;
                    String json = formData.getRequestParameter(fieldName);

                    if (Validator.isNullOrEmpty(json)) continue;

                    JSONObject obj = new JSONObject();
                    try {
                        obj = new JSONObject(json);
                    } catch (JSONException e) {
                        LogUtil.error(this.getClass().getName(), e, e.getMessage());
                    }

                    FormRow row = new FormRow();
                    for (Iterator<String> it = obj.keys(); it.hasNext();) {
                        String key = it.next();
                        row.put(key, obj.optString(key));
                    }
                    rows.add(row);
                }
                Form parentForm = FormUtil.findRootForm(element);
                String primaryKeyValue = parentForm.getPrimaryKeyValue(formData);
                LogUtil.warn(getClassName(), "DataTablesBinder FormData parentForm  primaryKeyValue[" + primaryKeyValue + "]");
                FormRowSet originalRowSet = this.load(element, primaryKeyValue, formData);
                LogUtil.warn(getClassName(), "DataTablesBinder formRowSet originalRowSet [" + originalRowSet.toString() + "]");
                if (Validator.isNotNullOrEmpty(originalRowSet)) {
                    List<String> ids = new ArrayList<>();
                    for (FormRow r : originalRowSet) {
                        if (rows.contains(r)) {
                            continue;
                        }
                        ids.add(r.getId());
                    }
                    if (ids.size() > 0) {
                        formDataDao.delete(form, ids.toArray(new String[0]));
                    }
                }
                for (FormRow row : rows) {
                    row.put(this.getPropertyString("foreignKey"), primaryKeyValue);
                }
                LogUtil.warn(getClassName(), "DataTablesBinder FormData rowSet check step 1 [" + rows.toString() + "]");
                formRowSet = appService.storeFormData(form, rows, null);
                LogUtil.warn(getClassName(), "DataTablesBinder FormData rowSet .storeFormData step 2 [" + formRowSet.toString() + "]");
            }
        }
        return formRowSet;
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
    public void webService(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        try {
            String formDefId = request.getParameter("formDefId");
            Form form = Optional.of(formDefId)
                    .map(dataTablesBinderBiz()::getForm)
                    .orElseThrow(() -> new ApiException(HttpServletResponse.SC_BAD_REQUEST, "Unknown form [" + formDefId + "]"));

            JSONArray jsonArray = new JSONArray();
            dataTablesBinderBiz().getChildren(form, e -> e instanceof HiddenField, element -> {
                String elementId = element.getPropertyString("id");
                String elementName = Optional.ofNullable(element.getPropertyString("label"))
                        .filter(s -> !s.isEmpty())
                        .orElse(elementId);
                try {
                    JSONObject jsonElement = new JSONObject();
                    jsonElement.put("value", elementId);
                    jsonElement.put("label", elementName);
                    jsonArray.put(jsonElement);
                } catch (JSONException e) {
                    LogUtil.error(getClassName(), e, e.getMessage());
                }
            });

            response.setStatus(HttpServletResponse.SC_OK);
            response.getWriter().write(jsonArray.toString());

        } catch (ApiException e) {
            LogUtil.error(getClassName(), e, e.getMessage());
            response.sendError(e.getErrorCode(), e.getMessage());
        }
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
        Object[] arguments = {getClassName()};
        return AppUtil.readPluginResource(getClass().getName(),
                "/properties/form/DataTablesBinder.json", arguments, true);
    }
}
