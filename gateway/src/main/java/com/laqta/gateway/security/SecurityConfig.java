package com.laqta.gateway.security;

import com.laqta.gateway.LaqtaProperties;
import java.util.Arrays;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * T-071, decision D-AUTH (spec section 15): employees authenticate with a JWT from the company
 * identity provider (`LAQTA_JWT_ISSUER_URI`). `disabled-dev` is refused outside the dev profile.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, LaqtaProperties props, Environment env) throws Exception {
        http.csrf(c -> c.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        if (props.auth().jwt()) {
            http.authorizeHttpRequests(a -> a.requestMatchers("/actuator/health").permitAll().anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()));
        } else {
            if (!Arrays.asList(env.getActiveProfiles()).contains("dev")) {
                throw new IllegalStateException("laqta.auth.mode=disabled-dev requires the dev profile");
            }
            http.authorizeHttpRequests(a -> a.anyRequest().permitAll());
        }
        return http.build();
    }
}
