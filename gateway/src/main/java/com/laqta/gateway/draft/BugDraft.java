package com.laqta.gateway.draft;

import java.util.List;

/** Spec section 4, BugDraft. The app validates and sanitizes it again. */
public record BugDraft(
    String summary,
    String environment,
    List<String> stepsToReproduce,
    String actualResult,
    String expectedResult,
    String issueType,
    String priority,
    String assigneeQuery,
    String assigneeTransliteration,
    List<String> labels,
    List<String> missingInfo) {}
