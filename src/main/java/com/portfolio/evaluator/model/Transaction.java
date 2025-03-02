package com.portfolio.evaluator.model;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Enhanced Transaction model that includes transaction type, category, and tax information.
 */
@Data
@NoArgsConstructor
public class Transaction {
    private String id;
    private String securityId;
    private LocalDate date;
    private Type type;
    private int quantity;
    private BigDecimal price;
    private BigDecimal fees = BigDecimal.ZERO;
    private String exchange;
    private String notes;
    
    /**
     * Enum representing different types of transactions
     */
    public enum Type {
        BUY, SELL, DIVIDEND, INTEREST, FEE, TRANSFER_IN, TRANSFER_OUT, SPLIT, MERGER, OTHER
    }
    
    /**
     * Calculate the total value of the transaction (quantity * price)
     * 
     * @return the total value
     */
    public BigDecimal getTotalValue() {
        return price.multiply(new BigDecimal(quantity)).add(fees);
    }
} 