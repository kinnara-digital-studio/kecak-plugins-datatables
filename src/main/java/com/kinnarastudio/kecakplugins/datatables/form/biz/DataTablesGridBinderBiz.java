package com.kinnarastudio.kecakplugins.datatables.form.biz;

import org.joget.apps.app.dao.FormDefinitionDao;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.model.FormDefinition;
import org.joget.apps.app.service.AppService;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.form.dao.FormDataDao;
import org.joget.apps.form.model.Element;
import org.joget.apps.form.model.Form;
import org.joget.apps.form.service.FormService;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Predicate;

public class DataTablesGridBinderBiz {
    private final Map<String, Form> formCache = new HashMap<>();

    public Form getSelectedForm(String formDefId) {
        Form form = null;
        FormDefinitionDao formDefinitionDao = (FormDefinitionDao) AppUtil.getApplicationContext().getBean("formDefinitionDao");
        FormService formService = (FormService) AppUtil.getApplicationContext().getBean("formService");
        if (formDefId != null) {
            String formJson;
            AppDefinition appDef = AppUtil.getCurrentAppDefinition();
            FormDefinition formDef = formDefinitionDao.loadById(formDefId, appDef);
            if (formDef != null && (formJson = formDef.getJson()) != null) {
                form = (Form) formService.createElementFromJson(formJson);
            }
        }
        return form;
    }

    public Form getForm(String formDefId) {
        return Optional.ofNullable(formCache.get(formDefId))
                .orElseGet(() -> {
                    AppDefinition appDefinition = AppUtil.getCurrentAppDefinition();
                    AppService appService = (AppService) AppUtil.getApplicationContext().getBean("appService");
                    Form form = appService.viewDataForm(appDefinition.getAppId(), appDefinition.getVersion().toString(), formDefId, null, null, null, null, null, null);
                    if (form != null) {
                        formCache.put(formDefId, form);
                    }
                    return form;
                });
    }

    public void getChildren(Element parent, Predicate<Element> filter, Consumer<Element> consumeChild) {
        if (parent == null)
            return;

        for (Element child : parent.getChildren()) {
            if (filter.test(child)) {
                consumeChild.accept(child);
            }

            getChildren(child, filter, consumeChild);
        }
    }

    public String getFormPropertyName(Form form, String propertyName) {
        if (propertyName != null && !propertyName.isEmpty() && (((FormDataDao) AppUtil.getApplicationContext().getBean("formDataDao")).getFormDefinitionColumnNames(form.getPropertyString("tableName"))).contains(propertyName) && !"id".equals(propertyName)) {
            propertyName = "customProperties." + propertyName;
        }
        return propertyName;
    }
}
