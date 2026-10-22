package com.flightrec.search.rank;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.flightrec.config.AppProperties;
import com.flightrec.search.model.FlightOffer;
import com.flightrec.search.model.FlightOffer.FlightLeg;
import com.flightrec.search.model.SearchResponse.Recommendation;

class RankerTest {

    private final Ranker ranker = new Ranker(new AppProperties(null,
            new AppProperties.Search(8, 3, 8, 5, Duration.ofSeconds(55), Duration.ofHours(6), 0.6, 0.4, 7.0),
            null, List.of()));

    @Test
    void 조금_비싸도_체류시간이_길면_앞선다() {
        var cheapShortStay = offer("FUK", "2026-11-18", "2026-11-19", "15:00", "16:20", "10:00", "11:30", 100_000);
        var slightlyPricierLongStay = offer("FUK", "2026-11-17", "2026-11-18", "07:30", "08:50", "20:40", "22:10", 105_000);

        List<Recommendation> result = ranker.rank(List.of(
                new Ranker.CityOffer("후쿠오카", cheapShortStay),
                new Ranker.CityOffer("후쿠오카", slightlyPricierLongStay)), 1, 1, 0);

        assertThat(result).extracting(Recommendation::departDate).containsExactly("2026-11-17", "2026-11-18");
        assertThat(result.getFirst().stayHours()).isEqualTo(35.8, org.assertj.core.data.Offset.offset(0.1));
        assertThat(result.getFirst().reason()).contains("오전 도착·저녁 귀국");
        assertThat(result.getFirst().bookingLinks()).hasSize(3);
    }

    @Test
    void 출처가_없거나_경유거나_예산을_넘으면_제외() {
        var noSource = new FlightOffer("ICN", "KIX", "2026-11-17", "2026-11-18", "A", null, null, 90_000,
                "exact_date", false, true, List.of());
        var connecting = new FlightOffer("ICN", "KIX", "2026-11-17", "2026-11-18", "B", null, null, 80_000,
                "exact_date", false, false, List.of("https://example.com"));
        var overBudget = offer("KIX", "2026-11-24", "2026-11-25", "09:00", "10:50", "19:00", "21:00", 300_000);
        var ok = offer("KIX", "2026-11-25", "2026-11-26", "09:00", "10:50", "19:00", "21:00", 150_000);

        List<Recommendation> result = ranker.rank(List.of(noSource, connecting, overBudget, ok).stream()
                .map(o -> new Ranker.CityOffer("오사카", o)).toList(), 1, 2, 200_000);

        assertThat(result).singleElement().satisfies(r -> {
            assertThat(r.pricePerPersonKrw()).isEqualTo(150_000);
            assertThat(r.reason()).contains("후보 중 최저가");
        });
    }

    @Test
    void 체류시간과_가격이_같으면_새벽_도착편이_뒤로() {
        var redEye = offer("BKK", "2026-11-16", "2026-11-18", "09:00", "12:50", "23:00", "02:30", 300_000);
        var day = offer("BKK", "2026-11-17", "2026-11-19", "09:00", "12:50", "23:00", "06:30", 300_000);

        List<Recommendation> result = ranker.rank(List.of(
                new Ranker.CityOffer("방콕", redEye), new Ranker.CityOffer("방콕", day)), 2, 1, 0);

        assertThat(result.getLast().departDate()).isEqualTo("2026-11-16");
        assertThat(result.getLast().reason()).contains("새벽 비행");
        assertThat(result.getFirst().score() - result.getLast().score()).isEqualTo(Ranker.RED_EYE_PENALTY,
                org.assertj.core.data.Offset.offset(0.001));
    }

    private static FlightOffer offer(String dest, String depart, String ret, String outDep, String outArr,
                                     String inDep, String inArr, int price) {
        return new FlightOffer("ICN", dest, depart, ret, "테스트항공",
                new FlightLeg("TS1", outDep, outArr), new FlightLeg("TS2", inDep, inArr),
                price, "exact_date", false, true, List.of("https://example.com/" + depart));
    }
}
