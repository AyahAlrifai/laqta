package com.laqta.gateway.draft;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import tools.jackson.databind.JsonNode;

/** Mirrors the app's BugDraftSchema so an invalid answer triggers the single retry here. */
public final class DraftValidator {
    private DraftValidator() {}

    private static final Set<String> PRIORITIES = Set.of("Highest", "High", "Medium", "Low", "Lowest");

    public sealed interface Result permits Valid, Invalid {}

    public record Valid(BugDraft draft) implements Result {}

    public record Invalid(String errors) implements Result {}

    public static Result validate(JsonNode in) {
        List<String> errors = new ArrayList<>();
        if (in == null || !in.isObject()) return new Invalid("(root): expected an object");
        String summary = str(in, "summary", 120, false, errors);
        if (summary != null && summary.trim().isEmpty()) errors.add("summary: must not be empty");
        String environment = str(in, "environment", 4000, false, errors);
        List<String> steps = list(in, "stepsToReproduce", 30, 1000, errors);
        String actual = str(in, "actualResult", 4000, false, errors);
        String expected = str(in, "expectedResult", 4000, false, errors);
        String issueType = str(in, "issueType", 100, false, errors);
        String priority = str(in, "priority", 20, true, errors);
        if (priority != null && !PRIORITIES.contains(priority)) errors.add("priority: not an allowed value");
        String query = str(in, "assigneeQuery", 100, true, errors);
        String translit = str(in, "assigneeTransliteration", 100, true, errors);
        List<String> labels = list(in, "labels", 5, 50, errors);
        List<String> missing = list(in, "missingInfo", 5, 500, errors);
        if (!errors.isEmpty()) return new Invalid(String.join("; ", errors.subList(0, Math.min(10, errors.size()))));
        return new Valid(new BugDraft(summary.trim(), environment, steps, actual, expected, issueType, priority, query, translit, labels, missing));
    }

    private static String str(JsonNode in, String field, int max, boolean nullable, List<String> errors) {
        JsonNode node = in.get(field);
        if (node == null || node.isNull()) {
            if (!nullable) errors.add(field + ": required");
            return null;
        }
        if (!node.isString()) {
            errors.add(field + ": expected a string");
            return null;
        }
        String value = node.asString();
        if (value.length() > max) errors.add(field + ": longer than " + max);
        return value;
    }

    private static List<String> list(JsonNode in, String field, int maxItems, int maxLen, List<String> errors) {
        JsonNode node = in.get(field);
        if (node == null || !node.isArray()) {
            errors.add(field + ": expected an array");
            return List.of();
        }
        if (node.size() > maxItems) errors.add(field + ": more than " + maxItems + " items");
        List<String> out = new ArrayList<>();
        for (JsonNode item : node) {
            if (!item.isString() || item.asString().length() > maxLen) {
                errors.add(field + ": invalid item");
                continue;
            }
            out.add(item.asString());
        }
        return out;
    }
}
