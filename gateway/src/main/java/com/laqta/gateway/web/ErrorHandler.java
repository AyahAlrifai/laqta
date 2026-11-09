package com.laqta.gateway.web;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/** Answers `{ "code": "..." }` only; never echoes request content. */
@RestControllerAdvice
public class ErrorHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ErrorHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> api(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("code", e.code()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, MissingServletRequestPartException.class,
        org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<Map<String, String>> invalid(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("code", "INVALID_REQUEST"));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> tooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE).body(Map.of("code", "REQUEST_TOO_LARGE"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> other(Exception e) {
        LOG.error("unexpected error type={}", e.getClass().getSimpleName());
        return ResponseEntity.internalServerError().body(Map.of("code", "UNKNOWN"));
    }
}
