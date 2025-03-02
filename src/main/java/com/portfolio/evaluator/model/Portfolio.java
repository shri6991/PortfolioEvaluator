package com.portfolio.evaluator.model;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
public class Portfolio {
    private String id;
    private String name;
    private LocalDate createdDate;
    private LocalDate lastUpdated;
    private List<Security> securities = new ArrayList<>();
    private List<Transaction> transactions = new ArrayList<>();
    private BigDecimal marketValue = BigDecimal.ZERO;
    private BigDecimal costBasis = BigDecimal.ZERO;
    private BigDecimal realizedProfit = BigDecimal.ZERO;
    private BigDecimal unrealizedProfit = BigDecimal.ZERO;
    
    public Portfolio(String id, String name, LocalDate createdDate) {
        this.id = id;
        this.name = name;
        this.createdDate = createdDate;
        this.lastUpdated = createdDate;
    }
    
    public BigDecimal getTotalReturn() {
        if (costBasis.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return unrealizedProfit.add(realizedProfit)
                .divide(costBasis, 4, BigDecimal.ROUND_HALF_UP)
                .multiply(new BigDecimal(100));
    }
    
    public String getRiskRating() {
        // Simplified risk rating logic - in a real app, this would be more sophisticated
        BigDecimal returnPct = getTotalReturn();
        if (returnPct.compareTo(new BigDecimal(10)) > 0) {
            return "High";
        } else if (returnPct.compareTo(new BigDecimal(5)) > 0) {
            return "Moderate";
        } else {
            return "Low";
        }
    }
    
    public int getAssetCount() {
        return (int) securities.stream()
                .filter(s -> s.getQuantity() > 0)
                .count();
    }
} 