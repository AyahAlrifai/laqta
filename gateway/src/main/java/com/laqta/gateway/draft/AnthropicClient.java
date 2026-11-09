package com.laqta.gateway.draft;

import com.laqta.gateway.LaqtaProperties;
import com.laqta.gateway.web.ApiException;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Messages API with one forced tool used as a structured-output channel (spec section 7). */
@Component
public class AnthropicClient {

    public record ToolCall(JsonNode input, long inputTokens, long outputTokens) {}

    private final RestClient http;
    private final LaqtaProperties.Anthropic config;
    private final ObjectMapper json;

    public AnthropicClient(RestClient.Builder builder, LaqtaProperties props, ObjectMapper json) {
        this.config = props.anthropic();
        this.json = json;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(config.timeoutSeconds()));
        this.http = builder.baseUrl(config.baseUrl()).requestFactory(factory).build();
    }

    public ToolCall call(byte[] png, DraftPayload payload, String validationErrors) {
        if (config.apiKey() == null || config.apiKey().isBlank()) throw ApiException.aiUnavailable();
        Map<String, Object> body = Map.of(
            "model", config.model(),
            "max_tokens", 1500,
            "system", Prompt.SYSTEM,
            "tools", List.of(Map.of(
                "name", Prompt.TOOL_NAME,
                "description", "Submit the Jira bug draft. This is the only way to answer.",
                "input_schema", Prompt.toolSchema())),
            "tool_choice", Map.of("type", "tool", "name", Prompt.TOOL_NAME),
            "messages", List.of(Map.of("role", "user", "content", List.of(
                Map.of("type", "image", "source", Map.of(
                    "type", "base64", "media_type", "image/png", "data", Base64.getEncoder().encodeToString(png))),
                Map.of("type", "text", "text", Prompt.userText(payload, json, validationErrors))))));
        JsonNode response;
        try {
            response = http.post().uri("/v1/messages")
                .header("x-api-key", config.apiKey())
                .header("anthropic-version", "2023-06-01")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class);
        } catch (RestClientException e) {
            throw ApiException.aiUnavailable();
        }
        if (response == null) throw ApiException.aiUnavailable();
        JsonNode input = null;
        for (JsonNode block : response.path("content")) {
            if ("tool_use".equals(block.path("type").asString()) && Prompt.TOOL_NAME.equals(block.path("name").asString())) {
                input = block.get("input");
            }
        }
        JsonNode usage = response.path("usage");
        return new ToolCall(input, usage.path("input_tokens").asLong(0), usage.path("output_tokens").asLong(0));
    }
}
