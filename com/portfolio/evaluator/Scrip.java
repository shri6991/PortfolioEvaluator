package com.portfolio.evaluator;

import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@RequiredArgsConstructor
public class Scrip {
    private final String scripCode;
    private final String scripName;
    private int holdingQty;
    private final List<Transaction> transactions = new ArrayList<>();

    public void addQuantity(final int qty) {
        this.holdingQty += qty;
    }

    public void reduceQuantity(final int qty) {
        this.holdingQty -= qty;
    }

    public int hashCode() {
        return scripCode.hashCode();
    }

    public boolean equals(Object o) {
        if(o == null) return false;
        return o instanceof Scrip && ((Scrip) o).getScripCode().equals(this.getScripCode());
    }
}
