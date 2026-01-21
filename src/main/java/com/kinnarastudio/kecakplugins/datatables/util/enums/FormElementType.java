package com.kinnarastudio.kecakplugins.datatables.util.enums;

import java.util.Arrays;
import java.util.Optional;

public enum FormElementType {
    SECTION(
            "org.joget.apps.form.model.Section",
            "section"
    ),
    SUBFORM(
            "org.joget.apps.form.lib.SubForm",
            "subform"
    ),
    TEXT_FIELD(
            "org.joget.apps.form.lib.TextField",
            "text"
    ),

    TEXT_AREA(
            "org.joget.apps.form.lib.TextArea",
            "textarea"
    ),

    SELECT_BOX(
            "org.joget.apps.form.lib.SelectBox",
            "select"
    ),

    CHECK_BOX(
            "org.joget.apps.form.lib.CheckBox",
            "checkbox"
    ),

    RADIO(
            "org.joget.apps.form.lib.Radio",
            "radio"
    ),

    DATE_PICKER(
            "org.joget.apps.form.lib.DatePicker",
            "date"
    ),

    NUMBER_FIELD(
            "org.joget.apps.form.lib.NumberField",
            "number"
    ),

    AUTOFILL_SELECT_BOX(
            "com.kinnarastudio.kecakplugins.autofillselectbox.AutofillSelectBox",
            "select"
    );

    private final String className;
    private final String type;

    FormElementType(String className, String type) {
        this.className = className;
        this.type = type;
    }

    public String getClassName() {
        return className;
    }

    public String getType() {
        return type;
    }

    /* ================= LOOKUP ================= */

    public static Optional<FormElementType> fromClassName(String className) {
        if (className == null) {
            return Optional.empty();
        }

        return Arrays.stream(values())
                .filter(e -> e.className.equals(className))
                .findFirst();
    }

    public static String resolveType(String className) {
        return fromClassName(className)
                .map(FormElementType::getType)
                .orElse("text");
    }

    public static boolean isSection(String className) {
        return fromClassName(className)
                .map(e -> e == SECTION)
                .orElse(false);
    }

    public static boolean isSubForm(String className) {
        return fromClassName(className)
                .map(e -> e == SUBFORM)
                .orElse(false);
    }
}
