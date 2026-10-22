package com.flightrec.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.flightrec.search.model.DatePair;
import com.flightrec.search.model.TripQuery;

class DateCombinationsTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 22);

    @Test
    void 평일_1박2일은_주말에_걸치지_않고_주마다_고르게_퍼진다() {
        List<DatePair> pairs = DateCombinations.generate(query("2026-11-01", "2026-11-30", 1, true, List.of()), TODAY, 8);

        assertThat(pairs).hasSize(8);
        assertThat(pairs).allSatisfy(p -> {
            assertThat(p.returnDate()).isEqualTo(p.depart().plusDays(1));
            assertThat(p.depart().getDayOfWeek()).isNotIn(DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY);
        });
        // 11월은 출발 가능한 주가 5주 → 주마다 최소 하나씩
        assertThat(pairs.stream().map(p -> p.depart().getDayOfMonth() / 7).distinct().count()).isGreaterThanOrEqualTo(4);
        // 주마다 첫 선택은 화요일
        assertThat(pairs.getFirst().depart()).isEqualTo(LocalDate.of(2026, 11, 3));
    }

    @Test
    void 제외_요일과_지난_날짜는_빠진다() {
        List<DatePair> pairs = DateCombinations.generate(
                query("2026-10-01", "2026-10-31", 1, false, List.of("FRIDAY")), TODAY, 50);

        assertThat(pairs).isNotEmpty().allSatisfy(p -> {
            assertThat(p.depart()).isAfter(TODAY);
            assertThat(p.depart().getDayOfWeek()).isNotEqualTo(DayOfWeek.FRIDAY);
            assertThat(p.returnDate().getDayOfWeek()).isNotEqualTo(DayOfWeek.FRIDAY);
            assertThat(p.returnDate()).isBeforeOrEqualTo(LocalDate.of(2026, 10, 31));
        });
    }

    static TripQuery query(String from, String to, int nights, boolean weekdaysOnly, List<String> excluded) {
        return new TripQuery("맛집", "일본", false, List.of(), from, to, nights, weekdaysOnly, excluded, 1, 0, List.of());
    }
}
