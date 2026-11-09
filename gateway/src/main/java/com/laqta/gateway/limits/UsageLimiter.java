package com.laqta.gateway.limits;

import com.laqta.gateway.LaqtaProperties;
import com.laqta.gateway.web.ApiException;
import java.math.BigDecimal;
import java.math.MathContext;
import java.time.Clock;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * T-071: per-user rate limit (requests per rolling minute) and monthly cost cap. In memory, so
 * one gateway instance; a shared store is needed before scaling out.
 */
@Component
public class UsageLimiter {
    private static final BigDecimal MILLION = BigDecimal.valueOf(1_000_000);

    private final LaqtaProperties props;
    private final Clock clock;
    private final Map<String, Deque<Instant>> recent = new ConcurrentHashMap<>();
    private final Map<String, BigDecimal> monthlyCost = new ConcurrentHashMap<>();

    @Autowired
    public UsageLimiter(LaqtaProperties props) {
        this(props, Clock.systemUTC());
    }

    UsageLimiter(LaqtaProperties props, Clock clock) {
        this.props = props;
        this.clock = clock;
    }

    /** Throws RATE_LIMITED or COST_CAP_REACHED; otherwise records the request. */
    public void admit(String user) {
        Instant now = clock.instant();
        if (spent(user).compareTo(props.limits().monthlyCostCapUsd()) >= 0) {
            throw ApiException.costCap();
        }
        Deque<Instant> window = recent.computeIfAbsent(user, k -> new ArrayDeque<>());
        synchronized (window) {
            while (!window.isEmpty() && window.peekFirst().isBefore(now.minusSeconds(60))) {
                window.pollFirst();
            }
            if (window.size() >= props.limits().requestsPerMinute()) {
                throw ApiException.rateLimited();
            }
            window.addLast(now);
        }
    }

    public void recordTokens(String user, long inputTokens, long outputTokens) {
        BigDecimal cost = props.pricing().inputPerMillion().multiply(BigDecimal.valueOf(inputTokens))
            .add(props.pricing().outputPerMillion().multiply(BigDecimal.valueOf(outputTokens)))
            .divide(MILLION, MathContext.DECIMAL64);
        monthlyCost.merge(key(user), cost, BigDecimal::add);
    }

    public BigDecimal spent(String user) {
        return monthlyCost.getOrDefault(key(user), BigDecimal.ZERO);
    }

    private String key(String user) {
        return YearMonth.from(clock.instant().atZone(ZoneOffset.UTC)) + ":" + user;
    }
}
