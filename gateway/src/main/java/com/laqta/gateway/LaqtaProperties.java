package com.laqta.gateway;

import java.math.BigDecimal;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "laqta")
public record LaqtaProperties(Auth auth, Anthropic anthropic, Limits limits, Pricing pricing) {

    public record Auth(String mode) {
        public boolean jwt() {
            return !"disabled-dev".equals(mode);
        }
    }

    public record Anthropic(String apiKey, String baseUrl, String model, int timeoutSeconds) {}

    public record Limits(int requestsPerMinute, BigDecimal monthlyCostCapUsd) {}

    public record Pricing(BigDecimal inputPerMillion, BigDecimal outputPerMillion) {}
}
