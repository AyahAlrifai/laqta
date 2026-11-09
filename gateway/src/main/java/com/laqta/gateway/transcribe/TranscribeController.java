package com.laqta.gateway.transcribe;

import com.laqta.gateway.limits.UsageLimiter;
import com.laqta.gateway.security.CurrentUser;
import com.laqta.gateway.web.ApiException;
import java.io.IOException;
import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * T-073: `POST /v1/transcribe`. Answers 501 STT_NOT_CONFIGURED until a SpeechToText bean
 * exists (D-STT). Audio is held in memory only and zeroed after the call.
 */
@RestController
public class TranscribeController {
    private static final Set<String> LANGUAGES = Set.of("ar-JO", "en", "auto");

    private final Optional<SpeechToText> stt;
    private final UsageLimiter limiter;

    public TranscribeController(Optional<SpeechToText> stt, UsageLimiter limiter) {
        this.stt = stt;
        this.limiter = limiter;
    }

    @PostMapping(path = "/v1/transcribe", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, String> transcribe(@RequestPart("audio") MultipartFile audio, @RequestPart("language") String language) throws IOException {
        if (stt.isEmpty()) throw new ApiException(HttpStatus.NOT_IMPLEMENTED, "STT_NOT_CONFIGURED");
        if (!LANGUAGES.contains(language)) throw ApiException.invalid();
        limiter.admit(CurrentUser.id());
        byte[] bytes = audio.getBytes();
        try {
            return Map.of("text", stt.get().transcribe(bytes, audio.getContentType(), language));
        } finally {
            Arrays.fill(bytes, (byte) 0);
        }
    }
}
