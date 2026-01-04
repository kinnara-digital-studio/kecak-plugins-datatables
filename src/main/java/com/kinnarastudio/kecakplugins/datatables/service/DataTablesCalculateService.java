package com.kinnarastudio.kecakplugins.datatables.service;

import com.kinnarastudio.kecakplugins.datatables.exception.RestApiException;
import com.kinnarastudio.kecakplugins.datatables.userview.biz.DataTablesMenuBiz;
import com.kinnarastudio.kecakplugins.datatables.util.DataTablesUtil;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.datalist.model.DataListColumnFormatDefault;
import org.joget.apps.form.model.Element;
import org.joget.apps.form.model.Form;
import org.joget.apps.form.model.FormData;
import org.joget.apps.form.model.FormLoadBinder;
import org.joget.apps.form.service.FormUtil;
import org.joget.commons.util.LogUtil;
import org.joget.plugin.base.PluginManager;
import org.joget.plugin.base.PluginWebSupport;
import org.json.JSONException;
import org.json.JSONObject;
import org.springframework.context.ApplicationContext;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;

/**
 * DataTables Calculate Service
 * @author tiyojati
 */
public class DataTablesCalculateService implements PluginWebSupport {
    private transient DataTablesMenuBiz dataTablesMenuBiz;

    protected DataTablesMenuBiz dataTablesMenuBiz() {
        if (dataTablesMenuBiz == null) {
            dataTablesMenuBiz = new DataTablesMenuBiz();
        }
        return dataTablesMenuBiz;
    }

    public String getClassName() {
        return getClass().getName();
    }

    /**
     * JSON API for handle datatables calculation load binder
     */
    @Override
    public void webService(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        LogUtil.warn(getClassName(), " Hit DataTables Calculate Service");

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
}
