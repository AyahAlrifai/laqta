package com.laqta.gateway.draft;

import com.laqta.gateway.limits.UsageLimiter;
import com.laqta.gateway.security.CurrentUser;
import com.laqta.gateway.web.ApiException;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.Arrays;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * T-070: `POST /v1/draft`, multipart with `image` (PNG) and `payload` (JSON), answered with a
 * BugDraft (spec section 7). Logs metadata only: never the image, prompt or draft text.
 */
@RestController
public class DraftController {
    private static final Logger LOG = LoggerFactory.getLogger(DraftController.class);
    private static final byte[] PNG_MAGIC = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};

    private final AnthropicClient anthropic;
    private final UsageLimiter limiter;

    public DraftController(AnthropicClient anthropic, UsageLimiter limiter) {
        this.anthropic = anthropic;
        this.limiter = limiter;
    }

    @PostMapping(path = "/v1/draft", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public BugDraft draft(@RequestPart("image") MultipartFile image, @Valid @RequestPart("payload") DraftPayload payload) throws IOException {
        String user = CurrentUser.id();
        limiter.admit(user);
        byte[] png = image.getBytes();
        if (png.length < PNG_MAGIC.length || !Arrays.equals(Arrays.copyOf(png, PNG_MAGIC.length), PNG_MAGIC)) {
            throw ApiException.invalid();
        }
        long started = System.currentTimeMillis();
        String errors = null;
        try {
            for (int attempt = 0; attempt < 2; attempt++) {
                AnthropicClient.ToolCall call = anthropic.call(png, payload, errors);
                limiter.recordTokens(user, call.inputTokens(), call.outputTokens());
                DraftValidator.Result result = DraftValidator.validate(call.input());
                if (result instanceof DraftValidator.Valid valid) {
                    LOG.info("draft ok user={} ms={} attempt={} in={} out={}", CurrentUser.hash(user),
                        System.currentTimeMillis() - started, attempt, call.inputTokens(), call.outputTokens());
                    return valid.draft();
                }
                errors = ((DraftValidator.Invalid) result).errors();
            }
            LOG.info("draft invalid user={} ms={}", CurrentUser.hash(user), System.currentTimeMillis() - started);
            throw ApiException.aiInvalidOutput();
        } finally {
            Arrays.fill(png, (byte) 0);
        }
    }
}
