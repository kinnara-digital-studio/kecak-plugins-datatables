package com.kinnarastudio.kecakplugins.datatables.exception;

public class RestApiException extends Exception {
    private int httpErrorCode;

    public RestApiException(int errorCode, String message) {
        super(message);
        this.httpErrorCode = errorCode;
    }

    public RestApiException(int errorCode, Throwable throwable) {
        super(throwable);
        this.httpErrorCode = errorCode;
    }

    public int getErrorCode() {
        return httpErrorCode;
    }
}
