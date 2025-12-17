package com.kinnarastudio.kecakplugins.datatables.util;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

public class DataTablesUtil {
    protected static final Map<String, String> CLASSNAME_TYPE_MAP = Map.ofEntries(
            Map.entry("org.joget.apps.form.lib.TextField", "text"),
            Map.entry("org.joget.apps.form.lib.TextArea", "textarea"),
            Map.entry("org.joget.apps.form.lib.SelectBox", "select"),
            Map.entry("org.joget.apps.form.lib.CheckBox", "checkbox"),
            Map.entry("org.joget.apps.form.lib.Radio", "radio"),
            Map.entry("org.joget.apps.form.lib.DatePicker", "date"),
            Map.entry("org.joget.apps.form.lib.NumberField", "number")
    );

    public static Map<String, Map<String, Object>> extractFieldMeta(JSONObject jsonForm) throws JSONException {
        Map<String, Map<String, Object>> result = new HashMap<>();
        walkElements(jsonForm.getJSONArray("elements"), result);
        return result;
    }

    protected static void walkElements(JSONArray elements, Map<String, Map<String, Object>> result) throws JSONException {
        for (int i = 0; i < elements.length(); i++) {
            JSONObject el = elements.getJSONObject(i);

            if (el.has("className") && el.getString("className").startsWith("org.joget.apps.form.lib")) {

                String className = el.getString("className");
                JSONObject props = el.getJSONObject("properties");

                String fieldId = props.optString("id");
                if (!fieldId.isEmpty()) {
                    Map<String, Object> meta = new HashMap<>();

                    boolean readonly = "true".equalsIgnoreCase(props.optString("readonly"));
                    meta.put("readonly", readonly);

                    boolean mandatory = false;
                    if (props.has("validator")) {
                        JSONObject validator = props.getJSONObject("validator");
                        if (validator.has("properties")) {
                            mandatory = "true".equalsIgnoreCase(
                                    validator
                                            .getJSONObject("properties")
                                            .optString("mandatory")
                            );
                        }
                    }
                    meta.put("mandatory", mandatory);

                    String type = CLASSNAME_TYPE_MAP.getOrDefault(className, "text");
                    meta.put("type", type);

                    if ("select".equals(type)) {
                        meta.put("options", props.optJSONArray("options"));
                    }

                    result.put(fieldId, meta);
                }
            }

            if (el.has("elements")) {
                walkElements(el.getJSONArray("elements"), result);
            }
        }
    }
}
