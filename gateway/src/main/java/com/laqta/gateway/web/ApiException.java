package com.laqta.gateway.web;

import org.springframework.http.HttpStatus;

/** An error with a stable code the app maps to its own AppErrorCode. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public static ApiException rateLimited() {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED");
    }

    public static ApiException costCap() {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "COST_CAP_REACHED");
    }

    public static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
    }

    public static ApiException aiUnavailable() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "AI_UNAVAILABLE");
    }

    public static ApiException aiInvalidOutput() {
        return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "AI_INVALID_OUTPUT");
    }
}
