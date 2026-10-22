package com.flightrec.search.model;

import java.time.LocalDate;

public record DatePair(LocalDate depart, LocalDate returnDate) {

    @Override
    public String toString() {
        return depart + "~" + returnDate;
    }
}
