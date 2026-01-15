package com.kinnarastudio.kecakplugins.datatables.util;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collection;
import java.util.Enumeration;
import java.util.Iterator;
import java.util.Map;

public final class Validator {

    public static boolean isNullOrEmpty(Object value){
        if (value == null) {
            return true;
        }

        /* ================= STRING ================= */
        if (value instanceof String) {
            return ((String) value).trim().isEmpty();
        }

        /* ================= COLLECTION ================= */
        if (value instanceof Collection) {
            return ((Collection<?>) value).isEmpty();
        }

        /* ================= MAP ================= */
        if (value instanceof Map) {
            return ((Map<?, ?>) value).isEmpty();
        }

        /* ================= ENUMERATION ================= */
        if (value instanceof Enumeration) {
            return !((Enumeration<?>) value).hasMoreElements();
        }

        /* ================= ITERATOR ================= */
        if (value instanceof Iterator) {
            return !((Iterator<?>) value).hasNext();
        }

        /* ================= JSON ================= */
        if (value instanceof JSONArray) {
            return ((JSONArray) value).length() == 0;
        }

        if (value instanceof JSONObject) {
            return ((JSONObject) value).length() == 0;
        }

        /* ================= ARRAY ================= */
        boolean arrayFlag = arrayIsNullOrEmpty(value);
        if (arrayFlag){
            return true;
        }
        return false;
    }

    public static boolean isNotNullOrEmpty(Object value){
        return !isNullOrEmpty(value);
    }

    private static boolean arrayIsNullOrEmpty(Object value){
        if (value instanceof Object[]){
            return ((Object[]) value).length == 0;
        }

        if (value instanceof int[]){
            return ((int[]) value).length == 0;
        }

        if (value instanceof long[]){
            return ((long[]) value).length == 0;
        }

        if (value instanceof float[]){
            return ((float[]) value).length == 0;
        }

        if (value instanceof double[]){
            return ((double[]) value).length == 0;
        }

        if (value instanceof char[]){
            return ((char[]) value).length == 0;
        }

        if (value instanceof boolean[]){
            return ((boolean[]) value).length == 0;
        }

        if (value instanceof byte[]){
            return ((byte[]) value).length == 0;
        }

        if (value instanceof short[]){
            return ((short[]) value).length == 0;
        }
        return false;
    }


}
