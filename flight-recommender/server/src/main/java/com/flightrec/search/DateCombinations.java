package com.flightrec.search;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.IsoFields;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.flightrec.search.model.DatePair;
import com.flightrec.search.model.TripQuery;

/** PRD F3: 조건에 맞는 출발·귀국일 조합을 만들고, 검색 횟수 상한에 맞게 고른다. */
public final class DateCombinations {

    /** 보통 화·수 출발이 싸서 먼저 고른다. */
    private static final List<DayOfWeek> PREFERRED_DEPARTURE = List.of(
            DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.MONDAY, DayOfWeek.THURSDAY,
            DayOfWeek.SUNDAY, DayOfWeek.SATURDAY, DayOfWeek.FRIDAY);

    private DateCombinations() {
    }

    public static List<DatePair> generate(TripQuery query, LocalDate today, int maxPairs) {
        LocalDate from = LocalDate.parse(query.dateFrom());
        LocalDate to = LocalDate.parse(query.dateTo());
        if (!from.isAfter(today)) {
            from = today.plusDays(1);
        }
        int nights = Math.max(0, query.nights());
        Set<DayOfWeek> excluded = query.excludedWeekdays() == null ? Set.of()
                : query.excludedWeekdays().stream().map(DayOfWeek::valueOf).collect(Collectors.toSet());

        List<DatePair> all = new ArrayList<>();
        for (LocalDate depart = from; !depart.plusDays(nights).isAfter(to); depart = depart.plusDays(1)) {
            LocalDate ret = depart.plusDays(nights);
            if (depart.datesUntil(ret.plusDays(1)).allMatch(d -> allowed(d, query.weekdaysOnly(), excluded))) {
                all.add(new DatePair(depart, ret));
            }
        }
        return pickSpread(all, maxPairs);
    }

    private static boolean allowed(LocalDate date, boolean weekdaysOnly, Set<DayOfWeek> excluded) {
        DayOfWeek day = date.getDayOfWeek();
        if (weekdaysOnly && (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY)) {
            return false;
        }
        return !excluded.contains(day);
    }

    /** 주마다 선호 요일 순으로 하나씩 돌아가며 골라 기간 전체에 고르게 퍼뜨린다. */
    private static List<DatePair> pickSpread(List<DatePair> all, int maxPairs) {
        Comparator<DatePair> byPreference = Comparator.comparingInt(p -> PREFERRED_DEPARTURE.indexOf(p.depart().getDayOfWeek()));
        Map<Integer, List<DatePair>> byWeek = new LinkedHashMap<>();
        for (DatePair pair : all) {
            byWeek.computeIfAbsent(pair.depart().get(IsoFields.WEEK_OF_WEEK_BASED_YEAR), k -> new ArrayList<>()).add(pair);
        }
        byWeek.values().forEach(week -> week.sort(byPreference));

        List<DatePair> picked = new ArrayList<>();
        for (int round = 0; picked.size() < maxPairs; round++) {
            boolean added = false;
            for (List<DatePair> week : byWeek.values()) {
                if (round < week.size() && picked.size() < maxPairs) {
                    picked.add(week.get(round));
                    added = true;
                }
            }
            if (!added) {
                break;
            }
        }
        picked.sort(Comparator.comparing(DatePair::depart));
        return picked;
    }
}
