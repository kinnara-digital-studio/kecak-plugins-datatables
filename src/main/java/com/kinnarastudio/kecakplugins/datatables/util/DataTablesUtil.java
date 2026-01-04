package com.kinnarastudio.kecakplugins.datatables.util;

import com.kinnarastudio.kecakplugins.datatables.exception.RestApiException;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.datalist.model.DataList;
import org.joget.apps.datalist.model.DataListCollection;
import org.joget.apps.datalist.model.DataListColumn;
import org.joget.apps.datalist.model.DataListColumnFormatDefault;
import org.joget.apps.form.dao.FormDataDao;
import org.joget.apps.form.model.Form;
import org.joget.apps.form.model.FormData;
import org.joget.apps.form.model.FormRow;
import org.joget.apps.form.service.FormUtil;
import org.joget.commons.util.LogUtil;
import org.joget.plugin.base.PluginManager;
import org.joget.plugin.property.model.PropertyEditable;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import javax.annotation.Nonnull;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.text.ParseException;
import java.util.*;
import java.util.stream.Collectors;

public class DataTablesUtil {
    public static final Map<String, String> CLASSNAME_TYPE_MAP = Map.ofEntries(
            Map.entry("org.joget.apps.form.lib.TextField", "text"),
            Map.entry("org.joget.apps.form.lib.TextArea", "textarea"),
            Map.entry("org.joget.apps.form.lib.SelectBox", "select"),
            Map.entry("org.joget.apps.form.lib.CheckBox", "checkbox"),
            Map.entry("org.joget.apps.form.lib.Radio", "radio"),
            Map.entry("org.joget.apps.form.lib.DatePicker", "date"),
            Map.entry("org.joget.apps.form.lib.NumberField", "number")
    );

    /**
     * Generate plugins
     * @param elementSelect
     * @param <T>
     * @return
     */
    public static <T extends PropertyEditable> T getPluginObject(Map<String, Object> elementSelect, PluginManager pluginManager) {
        if(elementSelect == null)
            return null;

        String className = (String)elementSelect.get("className");
        Map<String, Object> properties = (Map<String, Object>)elementSelect.get("properties");

        T  plugin = (T) pluginManager.getPlugin(className);
        if(plugin == null) {
            return null;
        }

        properties.forEach(plugin::setProperty);

        return plugin;
    }

    /**
     * Determine the numeric value of input string
     *
     * @param input input string
     * @return numeric representation
     */
    public static BigDecimal determineNumber(String input, Locale locale) {
        try {
            NumberFormat numberFormat = NumberFormat.getNumberInstance(locale);
            if (numberFormat == null) {
                return new BigDecimal("0");
            }

            try {
                Number number;
                if (locale.getLanguage().equals("in")) {
                    number = numberFormat.parse(input.replace(".", ","));
                } else {
                    number = numberFormat.parse(input);
                }

                return BigDecimal.valueOf(number.doubleValue());
            } catch (ParseException ignored) {
            }

            try {
                String assumptionAsInternationalFormat = input.replaceAll(",", "").replaceAll("\\.", ".");
                Number number = numberFormat.parse(assumptionAsInternationalFormat);
                return BigDecimal.valueOf(number.doubleValue());
            } catch (ParseException ignored) {
            }

            try {
                String assumptionAsDotAsThousands = input.replaceAll("\\.", "").replaceAll(",", ".");
                Number number = numberFormat.parse(assumptionAsDotAsThousands);
                return BigDecimal.valueOf(number.doubleValue());
            } catch (ParseException ignored) {
            }

        } catch (NumberFormatException e) {
            LogUtil.error(DataTablesUtil.class.getName(), e, e.getMessage());
        }

        return new BigDecimal("0");
    }

    public static Locale getLocale(String locale) {
        String value = locale == null || locale.isEmpty() ? "en_US" : locale;
        String[] split = value.split("_");
        return new Locale(split[0].trim(), split.length > 1 ? split[1].trim() : "");
    }

    public static String reformatValue(@Nonnull String fieldId, @Nonnull String value, Form form, @Nonnull FormData formData, DataListColumnFormatDefault formatterPlugin) {
        FormDataDao formDataDao = (FormDataDao) AppUtil.getApplicationContext().getBean("formDataDao");
        String primaryKey = formData.getPrimaryKeyValue();

        // get initial row from database
        Map<String, String> row = Optional.ofNullable(primaryKey)
                .map(s -> formDataDao.load(form, s))
                .orElse(new FormRow())
                .entrySet().stream()
                .collect(HashMap::new, (m, e) -> m.put(String.valueOf(e.getKey()), String.valueOf(e.getValue())), Map::putAll);

        // replace some key with data passed from formData
        formData.getRequestParams().forEach((key, value1) -> row.put(key, String.join(";", value1)));

        if (formatterPlugin == null)
            return value;

        DataListColumn col = new DataListColumn();
        col.setName(formatterPlugin.getPropertyString(FormUtil.PROPERTY_ID));
        col.setLabel(formatterPlugin.getPropertyString(FormUtil.PROPERTY_LABEL));
        col.setFormats(Collections.singleton(formatterPlugin));
        DataList dataList = new DataList();
        dataList.setColumns(new DataListColumn[]{col});
        DataListCollection<Map<String, String>> rows = new DataListCollection<>();
        rows.add(row);
        dataList.setRows(rows);
        String formattedValue = formatterPlugin.format(dataList, col, row, value);

        if (formattedValue == null) {
            return value;
        } else {
            return formattedValue.replaceAll("<[^>]+>", "");
        }
    }

    public static JSONObject constructRequestBody(HttpServletRequest request) throws JSONException, RestApiException {
        String jsonString = "";
        try (BufferedReader bf = request.getReader()) {
            jsonString = bf.lines().collect(Collectors.joining());
            return new JSONObject(jsonString);
        } catch (IOException | JSONException e) {
            throw new RestApiException(HttpServletResponse.SC_BAD_REQUEST, e);
        }
    }
}
