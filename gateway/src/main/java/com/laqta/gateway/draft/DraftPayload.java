package com.laqta.gateway.draft;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** The `payload` part of `POST /v1/draft`: DraftInput without the image (spec section 7). */
public record DraftPayload(
    @NotNull @Size(max = 2000) String prompt,
    @NotNull @Valid Context context,
    @NotNull @Pattern(regexp = "en|ar") String bugLanguage,
    @NotNull @Valid Allowed allowed) {

    public record Context(@Size(max = 200) String appName, @Size(max = 300) String windowTitle, @NotNull @Size(max = 100) String os) {}

    public record Allowed(
        @NotEmpty @Size(max = 50) List<@NotNull @Size(min = 1, max = 100) String> issueTypes,
        @NotNull @Size(max = 10) List<@NotNull @Size(max = 20) String> priorities) {}
}
