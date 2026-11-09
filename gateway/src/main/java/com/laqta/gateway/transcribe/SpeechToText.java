package com.laqta.gateway.transcribe;

/** The speech service behind `/v1/transcribe`; chosen by decision D-STT (spec section 15). */
public interface SpeechToText {
    String transcribe(byte[] audio, String mime, String language);
}
