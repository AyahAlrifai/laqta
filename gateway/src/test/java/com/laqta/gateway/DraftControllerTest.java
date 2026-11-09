package com.laqta.gateway;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.notNull;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.laqta.gateway.draft.AnthropicClient;
import com.laqta.gateway.draft.DraftPayload;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(properties = {"laqta.limits.requests-per-minute=3", "laqta.anthropic.api-key=test"})
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class DraftControllerTest {

    private static final byte[] PNG = {(byte) 137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13};
    private static final String PAYLOAD = """
        {"prompt":"The total is shown twice","context":{"appName":"Billing","windowTitle":"Invoice","os":"win32 10"},
         "bugLanguage":"en","allowed":{"issueTypes":["Bug","Task"],"priorities":["High","Medium"]}}""";
    private static final String VALID = """
        {"summary":"Invoice total is displayed twice","environment":"Billing","stepsToReproduce":[],
         "actualResult":"Twice","expectedResult":"Once","issueType":"Bug","priority":null,"assigneeQuery":null,
         "assigneeTransliteration":null,"labels":[],"missingInfo":[]}""";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @MockitoBean AnthropicClient anthropic;

    private AnthropicClient.ToolCall call(String input) {
        JsonNode node = json.readTree(input);
        return new AnthropicClient.ToolCall(node, 1000, 100);
    }

    private org.springframework.test.web.servlet.ResultActions post(byte[] image, String payload) throws Exception {
        return mvc.perform(multipart("/v1/draft")
            .file(new MockMultipartFile("image", "image.png", "image/png", image.clone()))
            .file(new MockMultipartFile("payload", "", MediaType.APPLICATION_JSON_VALUE, payload.getBytes())));
    }

    @Test
    void returnsTheValidatedDraft() throws Exception {
        when(anthropic.call(any(), any(DraftPayload.class), isNull())).thenReturn(call(VALID));
        post(PNG, PAYLOAD).andExpect(status().isOk()).andExpect(jsonPath("$.summary").value("Invoice total is displayed twice"));
    }

    @Test
    void retriesOnceWithTheValidationErrors() throws Exception {
        when(anthropic.call(any(), any(DraftPayload.class), isNull())).thenReturn(call("{\"summary\":\"\"}"));
        when(anthropic.call(any(), any(DraftPayload.class), notNull())).thenReturn(call(VALID));
        post(PNG, PAYLOAD).andExpect(status().isOk());
        verify(anthropic, times(2)).call(any(), any(DraftPayload.class), any());
    }

    @Test
    void invalidTwiceIsAiInvalidOutput() throws Exception {
        when(anthropic.call(any(), any(DraftPayload.class), any())).thenReturn(call("{\"nope\":1}"));
        post(PNG, PAYLOAD).andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.code").value("AI_INVALID_OUTPUT"));
    }

    @Test
    void rejectsAnImageThatIsNotPng() throws Exception {
        post("GIF89a-not-png".getBytes(), PAYLOAD).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void rejectsAnInvalidPayload() throws Exception {
        post(PNG, "{\"prompt\":\"x\",\"bugLanguage\":\"fr\"}").andExpect(status().isBadRequest());
    }

    @Test
    void overTheRateLimitReturnsAClearCode() throws Exception {
        when(anthropic.call(any(), any(DraftPayload.class), any())).thenReturn(call(VALID));
        for (int i = 0; i < 3; i++) post(PNG, PAYLOAD).andExpect(status().isOk());
        post(PNG, PAYLOAD).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }

    @Test
    void transcribeIsNotConfiguredUntilDStt() throws Exception {
        mvc.perform(multipart("/v1/transcribe")
                .file(new MockMultipartFile("audio", "a.webm", "audio/webm", new byte[] {1, 2}))
                .file(new MockMultipartFile("language", "", "text/plain", "en".getBytes())))
            .andExpect(status().isNotImplemented())
            .andExpect(jsonPath("$.code").value("STT_NOT_CONFIGURED"));
    }
}
