package com.laqta.gateway.limits;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.laqta.gateway.LaqtaProperties;
import com.laqta.gateway.web.ApiException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class UsageLimiterTest {

    private static LaqtaProperties props(int rpm, String cap) {
        return new LaqtaProperties(
            new LaqtaProperties.Auth("jwt"),
            new LaqtaProperties.Anthropic("k", "https://api.anthropic.com", "m", 45),
            new LaqtaProperties.Limits(rpm, new BigDecimal(cap)),
            new LaqtaProperties.Pricing(new BigDecimal("3"), new BigDecimal("15")));
    }

    @Test
    void monthlyCostCapBlocksFurtherRequests() {
        UsageLimiter limiter = new UsageLimiter(props(100, "0.01"), Clock.fixed(Instant.parse("2026-11-09T10:00:00Z"), ZoneOffset.UTC));
        limiter.admit("u");
        limiter.recordTokens("u", 2000, 400);
        assertThat(limiter.spent("u")).isEqualByComparingTo("0.012");
        assertThatThrownBy(() -> limiter.admit("u")).isInstanceOf(ApiException.class).hasMessage("COST_CAP_REACHED");
        limiter.admit("other-user");
    }

    @Test
    void costResetsInANewMonth() {
        UsageLimiter november = new UsageLimiter(props(100, "0.01"), Clock.fixed(Instant.parse("2026-11-30T23:00:00Z"), ZoneOffset.UTC));
        november.recordTokens("u", 10_000, 0);
        assertThat(november.spent("u")).isEqualByComparingTo("0.03");
    }
}
