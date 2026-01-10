package com.kinnarastudio.kecakplugins.datatables.form.element;

import com.kinnarastudio.commons.Declutter;
import com.kinnarastudio.kecakplugins.datatables.userview.DataTablesMenu;
import com.kinnarastudio.kecakplugins.datatables.userview.biz.DataTablesMenuBiz;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.form.model.*;
import org.joget.apps.form.service.FormUtil;
import org.joget.commons.util.LogUtil;
import org.joget.plugin.base.PluginManager;
import org.joget.plugin.base.PluginWebSupport;
import org.json.JSONException;
import org.json.JSONObject;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.*;

public class DataTablesGridElement extends Element implements FormBuilderPaletteElement, PluginWebSupport, Declutter {
    private final static String LABEL = "DataTables Grid Element";
    private final static String CATEGORY = "Kecak";

    private transient DataTablesMenuBiz dataTablesMenuBiz;

    protected DataTablesMenuBiz dataTablesMenuBiz() {
        if (dataTablesMenuBiz == null) {
            dataTablesMenuBiz = new DataTablesMenuBiz();
        }
        return dataTablesMenuBiz;
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
            fieldMeta = dataTablesMenuBiz().extractFieldMeta(formDefId);
        } catch (JSONException e) {
            LogUtil.error(getClassName(), e, e.getMessage());
        }
        String fieldMetaJson = new JSONObject(fieldMeta).toString();
        dataModel.put("fieldMeta", fieldMetaJson);

        String calculationUrl = "/web/json/app/" + appId + "/" + appVersion + "/plugin/" + DataTablesMenu.class.getName() + "/service";
        dataModel.put("calculationUrl", calculationUrl);

        return FormUtil.generateElementHtml(
                this,
                formData,
                "DataTablesGridElement.ftl",
                dataModel
        );
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
