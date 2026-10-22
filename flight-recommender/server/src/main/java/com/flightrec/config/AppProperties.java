package com.flightrec.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Anthropic anthropic,
        Search search,
        Cors cors,
        List<InviteCodeSeed> inviteCodes) {

    public record Anthropic(
            String apiKey,
            String parseModel,
            String searchModel,
            boolean fallbacksEnabled,
            double inputPricePerMtok,
            double outputPricePerMtok,
            double webSearchPrice) {

        public double costUsd(long inputTokens, long outputTokens, long webSearches) {
            return (inputTokens * inputPricePerMtok + outputTokens * outputPricePerMtok) / 1_000_000
                    + webSearches * webSearchPrice;
        }
    }

    public record Search(
            int maxWebSearches,
            int maxCities,
            int maxDatePairs,
            int maxResults,
            Duration timeout,
            Duration cacheTtl,
            double priceWeight,
            double timeWeight,
            double monthlyBudgetUsd) {
    }

    public record Cors(List<String> allowedOrigins) {
    }

    public record InviteCodeSeed(String code, String name, int dailyLimit) {
    }
}
