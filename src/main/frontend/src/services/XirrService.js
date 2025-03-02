/**
 * XirrService.js
 * 
 * Service for calculating XIRR (Internal Rate of Return) for portfolios and individual securities
 * Based on the Newton-Raphson method for finding the rate that makes the net present value of cash flows zero
 */

import logger from './LoggerService';

class XirrService {
  constructor() {
    this.DAYS_IN_YEAR = 365.0;
    this.MAX_ITERATIONS = 100;
    this.PRECISION = 1e-6;
    this.DEFAULT_GUESS = 0.1; // 10% initial guess
  }

  /**
   * Calculate XIRR for a portfolio based on transactions and current value
   * 
   * @param {Array} transactions - Array of transaction objects with amount, date, and symbol properties
   * @param {Object} currentHoldings - Object with current holdings and their values
   * @returns {Object} - XIRR for the portfolio and each security
   */
  calculatePortfolioXirr(transactions, currentHoldings) {
    try {
      // Validate inputs
      if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
        logger.warn('XirrService', 'No transactions provided for XIRR calculation');
        return { portfolioXirr: 0, securitiesXirr: {} };
      }

      if (!currentHoldings || !Array.isArray(currentHoldings) || currentHoldings.length === 0) {
        logger.warn('XirrService', 'No current holdings provided for XIRR calculation');
        return { portfolioXirr: 0, securitiesXirr: {} };
      }

      logger.info('XirrService', 'Starting portfolio XIRR calculation', {
        transactionsCount: transactions.length,
        holdingsCount: currentHoldings.length
      });

      // Log sample transaction for debugging
      if (transactions.length > 0) {
        const sampleTx = transactions[0];
        logger.debug('XirrService', 'Sample transaction:', {
          sample: JSON.stringify(sampleTx),
          keys: Object.keys(sampleTx),
          dateFields: Object.keys(sampleTx).filter(k => k.toLowerCase().includes('date'))
        });
      }

      // Filter out invalid transactions
      const validTransactions = transactions.filter(tx => {
        // Check if date is valid
        const isValidDate = tx.date && (tx.date instanceof Date || !isNaN(new Date(tx.date).getTime()));
        
        if (!tx.amount || !isValidDate || isNaN(tx.amount)) {
          logger.warn('XirrService', 'Invalid transaction found:', {
            amount: tx.amount,
            date: tx.date,
            symbol: tx.symbol,
            isValidDate: isValidDate,
            dateValue: tx.date ? String(tx.date) : 'undefined'
          });
          return false;
        }
        return true;
      });

      if (validTransactions.length === 0) {
        logger.warn('XirrService', 'No valid transactions found');
        return { portfolioXirr: 0, securitiesXirr: {} };
      }

      logger.info('XirrService', `Found ${validTransactions.length} valid transactions`);

      // Group transactions by security
      const transactionsBySymbol = this.groupTransactionsBySymbol(validTransactions);
      
      // Add current values as "transactions" with positive amounts
      const today = new Date();
      const cashFlowsWithCurrentValues = this.addCurrentValuesToTransactions(
        validTransactions, 
        currentHoldings, 
        today
      );

      logger.debug('XirrService', 'Combined cash flows:', {
        totalCashFlows: cashFlowsWithCurrentValues.length,
        firstDate: cashFlowsWithCurrentValues[0]?.date,
        lastDate: cashFlowsWithCurrentValues[cashFlowsWithCurrentValues.length - 1]?.date
      });

      // Validate combined cash flows
      if (cashFlowsWithCurrentValues.length < 2) {
        logger.warn('XirrService', 'Insufficient cash flows for XIRR calculation');
        return { portfolioXirr: 0, securitiesXirr: {} };
      }

      // Calculate total invested amount and current value
      const totalInvested = validTransactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum - tx.amount, 0);

      const totalCurrentValue = currentHoldings
        .reduce((sum, holding) => sum + (holding.currentValue || 0), 0);

      logger.info('XirrService', 'Portfolio totals:', {
        totalInvested,
        totalCurrentValue,
        absoluteReturn: totalCurrentValue - totalInvested,
        percentageReturn: ((totalCurrentValue - totalInvested) / totalInvested * 100).toFixed(2) + '%'
      });

      if (totalInvested === 0 || totalCurrentValue === 0) {
        logger.warn('XirrService', 'Invalid investment amounts detected');
        return { portfolioXirr: 0, securitiesXirr: {} };
      }
      
      // Calculate XIRR for the entire portfolio
      let portfolioXirr = 0;
      try {
        portfolioXirr = this.calculateXirr(cashFlowsWithCurrentValues);
        logger.info('XirrService', 'Portfolio XIRR calculated:', {
          xirr: portfolioXirr,
          xirrPercentage: (portfolioXirr * 100).toFixed(2) + '%'
        });
      } catch (error) {
        logger.error('XirrService', 'Error calculating portfolio XIRR:', error);
      }
      
      // Calculate XIRR for each security
      const securitiesXirr = {};
      
      for (const symbol in transactionsBySymbol) {
        const securityTransactions = transactionsBySymbol[symbol];
        
        // Find the current holding for this security
        const currentHolding = currentHoldings.find(h => h.symbol === symbol);
        
        if (currentHolding && currentHolding.currentValue > 0) {
          // Add current value as a positive cash flow
          const securityCashFlows = [...securityTransactions];
          securityCashFlows.push({
            amount: currentHolding.currentValue,
            date: today,
            symbol
          });
          
          // Calculate XIRR for this security
          try {
            securitiesXirr[symbol] = this.calculateXirr(securityCashFlows);
            logger.debug('XirrService', `XIRR calculated for ${symbol}:`, {
              xirr: securitiesXirr[symbol],
              xirrPercentage: (securitiesXirr[symbol] * 100).toFixed(2) + '%',
              cashFlowsCount: securityCashFlows.length
            });
          } catch (error) {
            logger.error('XirrService', `Error calculating XIRR for ${symbol}:`, error);
            securitiesXirr[symbol] = 0;
          }
        } else {
          // If the security is not currently held, XIRR is based only on past transactions
          try {
            securitiesXirr[symbol] = this.calculateXirr(securityTransactions);
            logger.debug('XirrService', `XIRR calculated for ${symbol} (not currently held):`, {
              xirr: securitiesXirr[symbol],
              xirrPercentage: (securitiesXirr[symbol] * 100).toFixed(2) + '%',
              cashFlowsCount: securityTransactions.length
            });
          } catch (error) {
            logger.error('XirrService', `Error calculating XIRR for ${symbol}:`, error);
            securitiesXirr[symbol] = 0;
          }
        }
      }
      
      logger.info('XirrService', 'XIRR calculation completed', {
        portfolioXirr,
        securitiesCount: Object.keys(securitiesXirr).length,
        averageSecurityXirr: Object.values(securitiesXirr).reduce((a, b) => a + b, 0) / Object.keys(securitiesXirr).length
      });
      
      return {
        portfolioXirr,
        securitiesXirr,
        securitiesCount: Object.keys(securitiesXirr).length
      };
    } catch (error) {
      logger.error('XirrService', 'Error in portfolio XIRR calculation:', error);
      return { portfolioXirr: 0, securitiesXirr: {}, securitiesCount: 0 };
    }
  }

  /**
   * Group transactions by security symbol
   * 
   * @param {Array} transactions - Array of transaction objects
   * @returns {Object} - Object with transactions grouped by symbol
   */
  groupTransactionsBySymbol(transactions) {
    const result = {};
    
    for (const tx of transactions) {
      if (!tx.symbol) continue;
      
      if (!result[tx.symbol]) {
        result[tx.symbol] = [];
      }
      
      result[tx.symbol].push(tx);
    }
    
    return result;
  }

  /**
   * Add current values to transactions array
   * 
   * @param {Array} transactions - Array of transaction objects
   * @param {Array} currentHoldings - Array of current holdings
   * @param {Date} valueDate - Date for the current value
   * @returns {Array} - Combined array with transactions and current values
   */
  addCurrentValuesToTransactions(transactions, currentHoldings, valueDate) {
    const result = [...transactions];
    
    // Add current values as positive cash flows
    for (const holding of currentHoldings) {
      if (holding.currentValue > 0) {
        result.push({
          amount: holding.currentValue,
          date: valueDate,
          symbol: holding.symbol
        });
      }
    }
    
    return result;
  }

  /**
   * Calculate XIRR for a set of cash flows
   * 
   * @param {Array} cashFlows - Array of cash flow objects with amount and date properties
   * @returns {Number} - XIRR value as a decimal (e.g., 0.1234 for 12.34%)
   */
  calculateXirr(cashFlows) {
    try {
      if (!cashFlows || cashFlows.length < 2) {
        logger.warn('XirrService', 'At least two cash flows are required to calculate XIRR');
        return 0;
      }

      // Filter out zero amount transactions
      const nonZeroCashFlows = cashFlows.filter(cf => cf.amount !== 0 && !isNaN(cf.amount));
      
      if (nonZeroCashFlows.length < 2) {
        logger.warn('XirrService', 'Insufficient non-zero cash flows for XIRR calculation');
        return 0;
      }

      // Validate that we have both positive and negative cash flows
      const hasPositive = nonZeroCashFlows.some(cf => cf.amount > 0);
      const hasNegative = nonZeroCashFlows.some(cf => cf.amount < 0);
      
      if (!hasPositive || !hasNegative) {
        logger.warn('XirrService', 'Cash flows must include both investments and returns');
        return 0;
      }
      
      // Sort cash flows by date
      const sortedCashFlows = [...nonZeroCashFlows].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      // Validate dates
      const firstDate = new Date(sortedCashFlows[0].date);
      const lastDate = new Date(sortedCashFlows[sortedCashFlows.length - 1].date);
      
      if (isNaN(firstDate.getTime()) || isNaN(lastDate.getTime())) {
        logger.error('XirrService', 'Invalid dates in cash flows');
        return 0;
      }
      
      if (firstDate.getTime() === lastDate.getTime()) {
        logger.warn('XirrService', 'All cash flows are on the same date');
        return 0;
      }
      
      // Convert dates to days from first cash flow
      const normalizedCashFlows = sortedCashFlows.map(cf => {
        const date = new Date(cf.date);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date in cash flow');
        }
        return {
          amount: cf.amount,
          daysFromFirst: (date.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
        };
      });
      
      // Calculate initial guess based on simple return
      const totalInvested = normalizedCashFlows
        .filter(cf => cf.amount < 0)
        .reduce((sum, cf) => sum - cf.amount, 0);
        
      const totalReturned = normalizedCashFlows
        .filter(cf => cf.amount > 0)
        .reduce((sum, cf) => sum + cf.amount, 0);
        
      const yearsFraction = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * this.DAYS_IN_YEAR);
      const simpleReturn = (totalReturned / totalInvested) - 1;
      const initialGuess = Math.max(-0.99, Math.min(10, simpleReturn / yearsFraction));
      
      // Apply Newton-Raphson method to find XIRR
      return this.findXirrByNewtonRaphson(normalizedCashFlows, initialGuess);
    } catch (error) {
      logger.error('XirrService', 'Error in XIRR calculation:', error);
      return 0;
    }
  }

  /**
   * Find XIRR using Newton-Raphson method
   * 
   * @param {Array} cashFlows - Array of cash flow objects with amount and daysFromFirst properties
   * @param {Number} guess - Initial guess for XIRR
   * @returns {Number} - XIRR value
   */
  findXirrByNewtonRaphson(cashFlows, guess) {
    // Validate input
    if (!cashFlows || cashFlows.length < 2) {
      logger.warn('XirrService', 'Insufficient cash flows for XIRR calculation');
      return 0;
    }

    // Check if all cash flows are on the same day
    const allSameDay = cashFlows.every(cf => cf.daysFromFirst === cashFlows[0].daysFromFirst);
    if (allSameDay) {
      logger.warn('XirrService', 'All cash flows are on the same day');
      return 0;
    }

    let x0 = guess;
    let x1;
    let iterations = 0;
    
    // Add bounds for reasonable XIRR values (-100% to 1000%)
    const MIN_RATE = -0.99;
    const MAX_RATE = 10;
    
    while (iterations < this.MAX_ITERATIONS) {
      // Calculate function value and derivative
      let fValue = 0;
      let fDerivative = 0;
      
      try {
        for (const cf of cashFlows) {
          const years = cf.daysFromFirst / this.DAYS_IN_YEAR;
          
          // Skip calculation if x0 is -1 to avoid division by zero
          if (Math.abs(x0 + 1) < this.PRECISION) {
            continue;
          }
          
          // Use safe Math.pow for large exponents
          const denominator = Math.pow(1 + x0, years);
          if (!isFinite(denominator)) {
            throw new Error('Overflow in denominator calculation');
          }
          
          fValue += cf.amount / denominator;
          fDerivative += -years * cf.amount / (denominator * (1 + x0));
        }
        
        // Check for convergence
        if (Math.abs(fValue) < this.PRECISION) {
          return Math.max(MIN_RATE, Math.min(MAX_RATE, x0)); // Converged, bound the result
        }
        
        // Check for zero derivative
        if (Math.abs(fDerivative) < this.PRECISION) {
          logger.warn('XirrService', 'Zero derivative encountered, trying different initial guess');
          x0 = x0 / 2; // Try a smaller guess
          continue;
        }
        
        // Calculate next approximation
        x1 = x0 - fValue / fDerivative;
        
        // Bound the next guess to prevent overflow
        x1 = Math.max(MIN_RATE, Math.min(MAX_RATE, x1));
        
        // Check for convergence
        if (Math.abs(x1 - x0) < this.PRECISION) {
          return x1; // Converged
        }
        
        // Check for oscillation
        if (iterations > 0 && Math.abs(x1) > Math.abs(x0) * 2) {
          logger.warn('XirrService', 'Oscillation detected, dampening the change');
          x1 = (x0 + x1) / 2; // Take average to dampen oscillation
        }
        
        x0 = x1;
        iterations++;
        
      } catch (error) {
        logger.warn('XirrService', 'Error in iteration, trying different initial guess:', error);
        x0 = x0 / 2; // Try a smaller guess
        if (Math.abs(x0) < this.PRECISION) {
          logger.error('XirrService', 'Failed to find valid XIRR value');
          return 0;
        }
        continue;
      }
    }
    
    logger.warn('XirrService', 'XIRR calculation did not converge');
    return 0; // Return 0 if no convergence
  }
}

const xirrService = new XirrService();
export default xirrService; 