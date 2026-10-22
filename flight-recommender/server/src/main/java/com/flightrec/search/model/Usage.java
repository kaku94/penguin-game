package com.flightrec.search.model;

import com.anthropic.models.beta.messages.BetaServerToolUsage;
import com.anthropic.models.beta.messages.BetaUsage;

public record Usage(long inputTokens, long outputTokens, long webSearches) {

    public static final Usage ZERO = new Usage(0, 0, 0);

    public static Usage of(BetaUsage usage) {
        long searches = usage.serverToolUse().map(BetaServerToolUsage::webSearchRequests).orElse(0L);
        return new Usage(usage.inputTokens(), usage.outputTokens(), searches);
    }

    public Usage plus(Usage other) {
        return new Usage(inputTokens + other.inputTokens, outputTokens + other.outputTokens,
                webSearches + other.webSearches);
    }
}
