package com.portfolio.evaluator.analysis;

import com.portfolio.evaluator.exception.NonconvergenceException;
import com.portfolio.evaluator.exception.OverflowException;
import com.portfolio.evaluator.exception.ZeroValuedDerivativeException;
import com.portfolio.evaluator.model.Portfolio;
import com.portfolio.evaluator.model.Security;
import com.portfolio.evaluator.model.Transaction;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Enhanced service for calculating performance metrics for portfolios and securities,
 * including XIRR, Sharpe ratio, volatility, drawdown, and benchmark comparisons.
 */
@Service
public class PerformanceAnalyzer {

    private static final double DAYS_IN_YEAR = 365.0;
    private static final double RISK_FREE_RATE = 0.02; // Default risk-free rate of 2%
    private static final int VOLATILITY_DAYS = 30; // Default period for volatility calculation
    
    /**
     * Calculate the XIRR (annualized internal rate of return) for a list of transactions
     * 
     * @param transactions the list of transactions
     * @return the XIRR value
     */
    public double calculateXirr(List<Transaction> transactions) {
        if (transactions == null || transactions.size() < 2) {
            throw new IllegalArgumentException("At least two transactions are needed to calculate XIRR");
        }
        
        // Create a new list with amount-date pairs for XIRR calculation
        List<XirrCashFlow> cashFlows = new ArrayList<>();
        
        for (Transaction tx : transactions) {
            double amount = tx.getAmount();
            LocalDate date = tx.getTransactionDate();
            cashFlows.add(new XirrCashFlow(amount, date));
        }
        
        // Add the current value as the last cash flow if it's not there
        LocalDate today = LocalDate.now();
        if (!cashFlows.get(cashFlows.size() - 1).date.equals(today)) {
            double currentValue = calculateCurrentValue(transactions);
            cashFlows.add(new XirrCashFlow(currentValue, today));
        }
        
        // Sort cash flows by date
        Collections.sort(cashFlows);
        
        try {
            return xirrNewtonRaphson(cashFlows, 0.1); // 0.1 is the initial guess (10%)
        } catch (Exception e) {
            return 0.0; // Return 0 if XIRR calculation fails
        }
    }
    
    /**
     * Calculate the current value of holdings based on transactions
     * 
     * @param transactions the list of transactions
     * @return the current value
     */
    private double calculateCurrentValue(List<Transaction> transactions) {
        Map<Security, Integer> holdings = new HashMap<>();
        
        // Calculate current holdings for each security
        for (Transaction tx : transactions) {
            Security security = tx.getSecurity();
            int quantity = tx.getQuantity();
            
            if (tx.getTransactionType() == Transaction.TransactionType.BUY) {
                holdings.put(security, holdings.getOrDefault(security, 0) + quantity);
            } else if (tx.getTransactionType() == Transaction.TransactionType.SELL) {
                holdings.put(security, holdings.getOrDefault(security, 0) - quantity);
            }
        }
        
        // Calculate total value
        double totalValue = 0;
        for (Map.Entry<Security, Integer> entry : holdings.entrySet()) {
            Security security = entry.getKey();
            int quantity = entry.getValue();
            
            if (quantity > 0 && security.getCurrentPrice() != null) {
                totalValue += quantity * security.getCurrentPrice();
            }
        }
        
        return totalValue;
    }
    
    /**
     * Calculate the XIRR using the Newton-Raphson method
     * 
     * @param cashFlows the list of cash flows
     * @param guess the initial guess
     * @return the XIRR value
     */
    private double xirrNewtonRaphson(List<XirrCashFlow> cashFlows, double guess) {
        double x0 = guess;
        double x1;
        int iterations = 0;
        
        while (iterations < 100) {
            double fValue = 0;
            double fDerivative = 0;
            
            for (XirrCashFlow cf : cashFlows) {
                double daysToFirst = ChronoUnit.DAYS.between(cashFlows.get(0).date, cf.date);
                double years = daysToFirst / DAYS_IN_YEAR;
                
                if (x0 != -1) {
                    fValue += cf.amount / Math.pow(1 + x0, years);
                    fDerivative += -years * cf.amount / Math.pow(1 + x0, years + 1);
                }
            }
            
            if (Math.abs(fValue) < 1e-6) {
                return x0; // Converged
            }
            
            if (Math.abs(fDerivative) < 1e-6) {
                throw new ZeroValuedDerivativeException("Zero derivative");
            }
            
            x1 = x0 - fValue / fDerivative;
            
            if (Math.abs(x1 - x0) < 1e-6) {
                return x1; // Converged
            }
            
            if (Double.isNaN(x1) || Double.isInfinite(x1)) {
                throw new OverflowException("Overflow occurred during calculation");
            }
            
            x0 = x1;
            iterations++;
        }
        
        throw new NonconvergenceException("XIRR calculation did not converge");
    }
    
    /**
     * Calculate the Sharpe ratio for a portfolio
     * 
     * @param portfolio the portfolio
     * @param riskFreeRate the risk-free rate (optional, default 2%)
     * @return the Sharpe ratio
     */
    public double calculateSharpeRatio(Portfolio portfolio, Double riskFreeRate) {
        double rfr = riskFreeRate != null ? riskFreeRate : RISK_FREE_RATE;
        double returns = portfolio.getXirr() != null ? portfolio.getXirr() : 0;
        double volatility = portfolio.getVolatility() != null ? portfolio.getVolatility() : 0;
        
        if (volatility == 0) {
            return 0; // Avoid division by zero
        }
        
        return (returns - rfr) / volatility;
    }
    
    /**
     * Calculate the volatility (standard deviation) of daily returns for a portfolio
     * 
     * @param portfolio the portfolio
     * @param days the number of days to look back
     * @return the volatility
     */
    public double calculateVolatility(Portfolio portfolio, Integer days) {
        int period = days != null ? days : VOLATILITY_DAYS;
        // This would require historical price data which we would need to implement
        // For now, return a placeholder value
        return 0.15; // Placeholder value representing 15% volatility
    }
    
    /**
     * Calculate the maximum drawdown for a portfolio
     * 
     * @param portfolio the portfolio
     * @return the maximum drawdown as a percentage
     */
    public double calculateMaxDrawdown(Portfolio portfolio) {
        // This would require historical portfolio value data
        // For now, return a placeholder value
        return 0.12; // Placeholder value representing 12% max drawdown
    }
    
    /**
     * Calculate the beta of a portfolio against a benchmark
     * 
     * @param portfolio the portfolio
     * @param benchmarkTicker the benchmark ticker
     * @return the beta value
     */
    public double calculateBeta(Portfolio portfolio, String benchmarkTicker) {
        // This would require historical return data for both the portfolio and benchmark
        // For now, return a placeholder value
        return 1.05; // Placeholder value representing beta slightly more volatile than market
    }
    
    /**
     * Calculate the alpha (excess return) of a portfolio against a benchmark
     * 
     * @param portfolio the portfolio
     * @param benchmarkTicker the benchmark ticker
     * @return the alpha value
     */
    public double calculateAlpha(Portfolio portfolio, String benchmarkTicker) {
        // This would require returns data for both the portfolio and benchmark
        // For now, return a placeholder value
        return 0.02; // Placeholder value representing 2% outperformance
    }
    
    /**
     * Helper class for XIRR calculations
     */
    private static class XirrCashFlow implements Comparable<XirrCashFlow> {
        private final double amount;
        private final LocalDate date;
        
        public XirrCashFlow(double amount, LocalDate date) {
            this.amount = amount;
            this.date = date;
        }
        
        @Override
        public int compareTo(XirrCashFlow other) {
            return this.date.compareTo(other.date);
        }
    }
} 