package com.laqta.gateway;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** T-071: without the dev profile every request needs a JWT from the identity provider. */
@SpringBootTest(properties = "laqta.auth.mode=jwt")
@AutoConfigureMockMvc
class JwtAuthTest {

    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;

    @Test
    void rejectsRequestsWithoutAToken() throws Exception {
        mvc.perform(multipart("/v1/draft")).andExpect(status().isUnauthorized());
    }

    @Test
    void acceptsAnAuthenticatedEmployee() throws Exception {
        mvc.perform(multipart("/v1/transcribe")
                .file(new MockMultipartFile("audio", "a.webm", "audio/webm", new byte[] {1}))
                .file(new MockMultipartFile("language", "", "text/plain", "en".getBytes()))
                .with(jwt().jwt(j -> j.subject("employee-1"))))
            .andExpect(status().isNotImplemented());
    }
}
