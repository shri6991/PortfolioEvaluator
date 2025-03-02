package com.portfolio.evaluator.model;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Enhanced Security model that replaces the old Scrip class with additional features
 * for categorization, performance tracking, and market data.
 */
@Data
@NoArgsConstructor
public class Security {
    private String id;
    private String symbol;
    private String name;
    private String isin;
    private String sector;
    private String assetClass;
    private int quantity;
    private BigDecimal averageCost = BigDecimal.ZERO;
    private BigDecimal currentPrice = BigDecimal.ZERO;
    private BigDecimal marketValue = BigDecimal.ZERO;
    private BigDecimal costBasis = BigDecimal.ZERO;
    private BigDecimal realizedProfit = BigDecimal.ZERO;
    private BigDecimal unrealizedProfit = BigDecimal.ZERO;
    
    public BigDecimal getReturnPercent() {
        if (costBasis.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return unrealizedProfit
                .divide(costBasis, 4, BigDecimal.ROUND_HALF_UP)
                .multiply(new BigDecimal(100));
    }
} 