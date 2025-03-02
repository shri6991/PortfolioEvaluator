import React, { createContext, useState, useContext, useEffect } from 'react';
import breezeService from '../services/BreezeService';
import BreezeConfig from '../services/BreezeConfig';
import logger from '../services/LoggerService';

// Create the context
const PortfolioContext = createContext();

// Create a provider component
export const PortfolioProvider = ({ children }) => {
  const [portfolio, setPortfolio] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSummaryPrompt, setShowSummaryPrompt] = useState(false);
  const [portfolioHistory, setPortfolioHistory] = useState([]);
  const [selectedBroker, setSelectedBroker] = useState('generic'); // 'generic' or 'icici'
  const [isBreezeInitialized, setIsBreezeInitialized] = useState(false);

  // Initialize Breeze API on component mount
  useEffect(() => {
    const initializeBreeze = async () => {
      if (selectedBroker === 'icici' && !isBreezeInitialized) {
        try {
          setLoading(true);
          
          // Get credentials from config
          const apiKey = BreezeConfig.apiKey;
          const apiSecret = BreezeConfig.apiSecret;
          const sessionKey = BreezeConfig.sessionKey;
          
          // Skip initialization if using default credentials
          if (apiKey === 'YOUR_API_KEY' || apiSecret === 'YOUR_API_SECRET') {
            logger.info('PortfolioContext', 'Using default credentials, skipping Breeze initialization');
            setIsBreezeInitialized(false);
            setLoading(false);
            return;
          }
          
          // Initialize Breeze API
          await breezeService.initialize(apiKey, apiSecret, sessionKey);
          setIsBreezeInitialized(true);
          setLoading(false);
        } catch (error) {
          console.error('Failed to initialize Breeze API:', error);
          setError('Failed to initialize Breeze API: ' + error.message);
          setLoading(false);
        }
      }
    };
    
    initializeBreeze();
  }, [selectedBroker, isBreezeInitialized]);

  // Function to set the broker
  const setBroker = (broker) => {
    setSelectedBroker(broker);
  };

  // Function to process transactions file
  const processTransactionsFile = async (file, headers, mappedFields, portfolioName = 'My Portfolio', broker = 'generic') => {
    setLoading(true);
    setError(null);
    
    try {
      // Update the selected broker
      setSelectedBroker(broker);
      
      // Initialize Breeze API if ICICIDirect is selected
      if (broker === 'icici' && !isBreezeInitialized) {
        const credentials = {
          apiKey: BreezeConfig.apiKey,
          apiSecret: BreezeConfig.apiSecret,
          sessionKey: BreezeConfig.sessionKey
        };
        
        await breezeService.initialize(credentials);
        setIsBreezeInitialized(true);
      }
      
      // Read the file
      const text = await readFileAsText(file);
      const lines = text.split('\n');
      
      if (lines.length <= 1) {
        throw new Error('File is empty or contains only headers');
      }
      
      // Parse headers
      const headerLine = lines[0];
      const headerFields = headerLine.split(',').map(h => h.trim());
      
      // Parse transactions
      const transactions = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        const values = line.split(',').map(v => v.trim());
        const transaction = {};
        
        // Map fields based on the provided mappings
        Object.keys(mappedFields).forEach(field => {
          const headerIndex = headerFields.indexOf(mappedFields[field]);
          if (headerIndex !== -1) {
            transaction[field] = values[headerIndex];
          }
        });
        
        // Add only if we have the minimum required fields
        if (transaction.symbol && transaction.date && transaction.action && transaction.quantity && transaction.price) {
          // Convert quantity and price to numbers
          transaction.quantity = parseFloat(transaction.quantity);
          transaction.price = parseFloat(transaction.price);
          transaction.brokerage = transaction.brokerage ? parseFloat(transaction.brokerage) : 0;
          
          transactions.push(transaction);
        }
      }
      
      // Calculate portfolio summary from transactions
      let holdings;
      
      if (broker === 'icici') {
        // Use Breeze API to resolve stock codes and get current prices
        holdings = await calculateHoldingsWithBreezeAPI(transactions);
      } else {
        // Use regular calculation for other brokers
        holdings = calculateHoldings(transactions);
        holdings = simulateCurrentPrices(holdings);
      }
      
      // Create portfolio object
      const newPortfolio = {
        name: portfolioName,
        type: 'Transactions-based',
        broker: broker,
        lastUpdated: new Date().toISOString(),
        transactions: transactions,
        holdings: holdings,
        totalValue: holdings.reduce((sum, h) => sum + h.currentValue, 0),
        investedValue: holdings.reduce((sum, h) => sum + h.valueAtCost, 0),
        performanceMetrics: calculatePerformanceMetrics(holdings, transactions),
        history: [{
          date: new Date().toISOString(),
          action: 'Created',
          totalValue: holdings.reduce((sum, h) => sum + h.currentValue, 0),
          investedValue: holdings.reduce((sum, h) => sum + h.valueAtCost, 0)
        }]
      };
      
      // Calculate sector allocation
      newPortfolio.sectorAllocation = calculateSectorAllocation(holdings);
      
      // Calculate unrealized return
      if (newPortfolio.investedValue > 0) {
        newPortfolio.totalGainLoss = newPortfolio.totalValue - newPortfolio.investedValue;
        newPortfolio.totalGainLossPercentage = (newPortfolio.totalGainLoss / newPortfolio.investedValue) * 100;
      } else {
        newPortfolio.totalGainLoss = 0;
        newPortfolio.totalGainLossPercentage = 0;
      }
      
      setPortfolio(newPortfolio);
      setLoading(false);
      setShowSummaryPrompt(broker === 'generic'); // Only show summary prompt for non-ICICI
      
      // Add to portfolio history
      setPortfolioHistory(prev => [...prev, {
        date: new Date().toISOString(),
        action: 'Created portfolio from transactions',
        portfolioName: portfolioName,
        broker: broker
      }]);
      
      return newPortfolio;
      
    } catch (error) {
      console.error('Error processing transactions file:', error);
      setError('Failed to process transactions file: ' + error.message);
      setLoading(false);
      return null;
    }
  };
  
  // Function to update transactions file
  const updateTransactionsFile = async (file, headers, mappedFields, broker = null) => {
    if (!portfolio) {
      return processTransactionsFile(file, headers, mappedFields, 'My Portfolio', broker || 'generic');
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Use the existing broker from portfolio if not provided
      const activeBroker = broker || portfolio.broker || 'generic';
      setSelectedBroker(activeBroker);
      
      // Initialize Breeze API if ICICIDirect is selected and not already initialized
      if (activeBroker === 'icici' && !isBreezeInitialized) {
        const credentials = {
          apiKey: BreezeConfig.apiKey,
          apiSecret: BreezeConfig.apiSecret,
          sessionKey: BreezeConfig.sessionKey
        };
        
        await breezeService.initialize(credentials);
        setIsBreezeInitialized(true);
      }
      
      // Read the file
      const text = await readFileAsText(file);
      const lines = text.split('\n');
      
      if (lines.length <= 1) {
        throw new Error('File is empty or contains only headers');
      }
      
      // Parse headers
      const headerLine = lines[0];
      const headerFields = headerLine.split(',').map(h => h.trim());
      
      // Parse transactions
      const transactions = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        const values = line.split(',').map(v => v.trim());
        const transaction = {};
        
        // Map fields based on the provided mappings
        Object.keys(mappedFields).forEach(field => {
          const headerIndex = headerFields.indexOf(mappedFields[field]);
          if (headerIndex !== -1) {
            transaction[field] = values[headerIndex];
          }
        });
        
        // Add only if we have the minimum required fields
        if (transaction.symbol && transaction.date && transaction.action && transaction.quantity && transaction.price) {
          // Convert quantity and price to numbers
          transaction.quantity = parseFloat(transaction.quantity);
          transaction.price = parseFloat(transaction.price);
          transaction.brokerage = transaction.brokerage ? parseFloat(transaction.brokerage) : 0;
          
          transactions.push(transaction);
        }
      }
      
      // Calculate portfolio summary from transactions
      let holdings;
      
      if (activeBroker === 'icici') {
        // Use Breeze API to resolve stock codes and get current prices
        holdings = await calculateHoldingsWithBreezeAPI(transactions);
      } else {
        // Use regular calculation for other brokers
        holdings = calculateHoldings(transactions);
        holdings = simulateCurrentPrices(holdings);
      }
      
      // Create updated portfolio object
      const updatedPortfolio = {
        ...portfolio,
        type: 'Transactions-based',
        broker: activeBroker,
        lastUpdated: new Date().toISOString(),
        transactions: transactions,
        holdings: holdings,
        totalValue: holdings.reduce((sum, h) => sum + h.currentValue, 0),
        investedValue: holdings.reduce((sum, h) => sum + h.valueAtCost, 0),
        performanceMetrics: calculatePerformanceMetrics(holdings, transactions)
      };
      
      // Calculate sector allocation
      updatedPortfolio.sectorAllocation = calculateSectorAllocation(holdings);
      
      // Calculate gain/loss
      if (updatedPortfolio.investedValue > 0) {
        updatedPortfolio.totalGainLoss = updatedPortfolio.totalValue - updatedPortfolio.investedValue;
        updatedPortfolio.totalGainLossPercentage = (updatedPortfolio.totalGainLoss / updatedPortfolio.investedValue) * 100;
      } else {
        updatedPortfolio.totalGainLoss = 0;
        updatedPortfolio.totalGainLossPercentage = 0;
      }
      
      // Add history entry
      if (!updatedPortfolio.history) {
        updatedPortfolio.history = [];
      }
      
      updatedPortfolio.history.push({
        date: new Date().toISOString(),
        action: 'Updated transactions',
        totalValue: updatedPortfolio.totalValue,
        investedValue: updatedPortfolio.investedValue
      });
      
      setPortfolio(updatedPortfolio);
      setLoading(false);
      setShowSummaryPrompt(activeBroker === 'generic'); // Only show summary prompt for non-ICICI
      
      // Add to portfolio history
      setPortfolioHistory(prev => [...prev, {
        date: new Date().toISOString(),
        action: 'Updated portfolio transactions',
        portfolioName: updatedPortfolio.name,
        broker: activeBroker
      }]);
      
      return updatedPortfolio;
      
    } catch (error) {
      console.error('Error updating transactions file:', error);
      setError('Failed to update transactions file: ' + error.message);
      setLoading(false);
      return null;
    }
  };

  // Calculate holdings with Breeze API (for ICICIDirect)
  const calculateHoldingsWithBreezeAPI = async (transactions) => {
    // First calculate basic holdings
    const basicHoldings = calculateHoldings(transactions);
    
    // Get unique stock codes
    const stockCodes = [...new Set(basicHoldings.map(h => h.symbol))];
    
    // Batch get current prices using Breeze API
    const currentPrices = await breezeService.batchGetCurrentPrices(stockCodes);
    
    // Update holdings with real-time prices
    const updatedHoldings = basicHoldings.map(holding => {
      const currentPrice = currentPrices[holding.symbol] || holding.avgCostPrice;
      const currentValue = holding.quantity * currentPrice;
      const unrealizedPL = currentValue - holding.valueAtCost;
      const unrealizedPLPercent = holding.valueAtCost > 0 ? (unrealizedPL / holding.valueAtCost) * 100 : 0;
      
      return {
        ...holding,
        currentPrice,
        currentValue,
        unrealizedPL,
        unrealizedPLPercent
      };
    });
    
    return updatedHoldings;
  };
  
  // Function to get historical prices for a portfolio
  const getHistoricalPricesForPortfolio = async (startDate, endDate) => {
    if (!portfolio || !portfolio.holdings || portfolio.holdings.length === 0) {
      return {};
    }
    
    // Use Breeze API for ICICIDirect portfolios
    if (portfolio.broker === 'icici' && isBreezeInitialized) {
      const stockCodes = [...new Set(portfolio.holdings.map(h => h.symbol))];
      const historicalData = {};
      
      for (const stockCode of stockCodes) {
        try {
          const prices = await breezeService.getHistoricalPrices(stockCode, startDate, endDate);
          historicalData[stockCode] = prices;
        } catch (error) {
          console.error(`Error getting historical prices for ${stockCode}:`, error);
          // Use a fallback for this stock
          const fallback = {};
          const start = new Date(startDate);
          const end = new Date(endDate);
          const currentDate = new Date(start);
          
          while (currentDate <= end) {
            const dateStr = currentDate.toISOString().split('T')[0];
            fallback[dateStr] = portfolio.holdings.find(h => h.symbol === stockCode)?.currentPrice || 100;
            currentDate.setDate(currentDate.getDate() + 1);
          }
          
          historicalData[stockCode] = fallback;
        }
      }
      
      return historicalData;
    }
    
    // For non-ICICI portfolios, return simulated prices
    return simulateHistoricalPrices(portfolio.holdings, startDate, endDate);
  };
  
  // Simulated historical prices for non-ICICI portfolios
  const simulateHistoricalPrices = (holdings, startDate, endDate) => {
    const historicalData = {};
    
    for (const holding of holdings) {
      const prices = {};
      const seed = holding.symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const basePrice = holding.avgCostPrice;
      const volatility = 0.01 + (seed % 5) * 0.005; // 1% to 3.5% daily volatility
      
      let currentPrice = basePrice;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Random daily change
        const dailyChange = (Math.random() - 0.45) * volatility; // Slight upward bias
        currentPrice = Math.max(currentPrice * (1 + dailyChange), 0.1 * basePrice); // Don't go below 10% of base
        
        prices[dateStr] = parseFloat(currentPrice.toFixed(2));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Ensure the final price is close to the current price
      const lastDateStr = new Date(end).toISOString().split('T')[0];
      const drift = holding.currentPrice / prices[lastDateStr];
      
      // Adjust all prices to trend toward the current price
      Object.keys(prices).forEach(date => {
        const daysDiff = (new Date(date) - start) / (1000 * 60 * 60 * 24);
        const totalDays = (end - start) / (1000 * 60 * 60 * 24);
        const adjustmentFactor = daysDiff / totalDays;
        
        prices[date] = parseFloat((prices[date] * (1 + (drift - 1) * adjustmentFactor)).toFixed(2));
      });
      
      historicalData[holding.symbol] = prices;
    }
    
    return historicalData;
  };

  // Function to calculate portfolio value on a specific date
  const calculatePortfolioValueOnDate = async (date, transactions) => {
    const txs = transactions || (portfolio ? portfolio.transactions : []);
    if (!txs || txs.length === 0) return { portfolioValue: 0, investedValue: 0 };
    
    // Filter transactions up to the given date
    const filteredTransactions = txs.filter(tx => new Date(tx.date) <= new Date(date));
    
    // Calculate holdings as of the given date
    const holdings = calculateHoldings(filteredTransactions);
    
    // For ICICI portfolios, get actual prices from BreezeAPI
    if (portfolio && portfolio.broker === 'icici' && isBreezeInitialized) {
      const stockCodes = [...new Set(holdings.map(h => h.symbol))];
      let portfolioValue = 0;
      
      for (const holding of holdings) {
        try {
          const price = await breezeService.getHistoricalPrice(holding.symbol, date);
          portfolioValue += holding.quantity * price;
        } catch (error) {
          console.error(`Error getting price for ${holding.symbol} on ${date}:`, error);
          // Fallback to average cost
          portfolioValue += holding.valueAtCost;
        }
      }
      
      return {
        portfolioValue,
        investedValue: holdings.reduce((sum, h) => sum + h.valueAtCost, 0)
      };
    }
    
    // For other portfolios, simulate prices
    const simulatedHoldings = simulateCurrentPrices(holdings, date);
    
    return {
      portfolioValue: simulatedHoldings.reduce((sum, h) => sum + h.currentValue, 0),
      investedValue: simulatedHoldings.reduce((sum, h) => sum + h.valueAtCost, 0)
    };
  };
  
  // Simulate getting current prices on a specific date (for non-ICICI portfolios)
  const simulateCurrentPrices = (holdings, dateStr = null) => {
    return holdings.map(holding => {
      // Generate a random multiplier for the current price, biased slightly upward
      const seed = holding.symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      
      let multiplier;
      if (dateStr) {
        // For historical prices, generate based on the date
        const dateSeed = new Date(dateStr).getTime() / (1000 * 60 * 60 * 24);
        multiplier = 1 + (Math.sin(seed + dateSeed / 10) * 0.2 + 0.05);
      } else {
        // For current prices, use a random multiplier
        multiplier = 1 + ((seed % 20) / 100) + (Math.random() * 0.1); // 1.0-1.3x
      }
      
      const currentPrice = holding.avgCostPrice * multiplier;
      const currentValue = holding.quantity * currentPrice;
      const unrealizedPL = currentValue - holding.valueAtCost;
      const unrealizedPLPercent = holding.valueAtCost > 0 ? (unrealizedPL / holding.valueAtCost) * 100 : 0;
      
      return {
        ...holding,
        currentPrice,
        currentValue,
        unrealizedPL,
        unrealizedPLPercent
      };
    });
  };

  // Helper function to read file as text
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  // Helper function to calculate holdings from transactions
  const calculateHoldings = (transactions) => {
    const holdingsMap = {};
    
    transactions.forEach(transaction => {
      const symbol = transaction.symbol;
      const quantity = transaction.quantity;
      const price = transaction.price;
      const action = transaction.action.toLowerCase();
      const value = quantity * price;
      
      if (!holdingsMap[symbol]) {
        holdingsMap[symbol] = {
          symbol: symbol,
          name: transaction.companyName || symbol,
          quantity: 0,
          totalCost: 0,
          totalSold: 0,
          totalSoldValue: 0,
          realizedPL: 0
        };
      }
      
      const holding = holdingsMap[symbol];
      
      if (action === 'buy') {
        const newQuantity = holding.quantity + quantity;
        const newTotalCost = holding.totalCost + value;
        holding.avgCostPrice = newTotalCost / newQuantity;
        holding.quantity = newQuantity;
        holding.totalCost = newTotalCost;
      } else if (action === 'sell') {
        holding.quantity -= quantity;
        holding.totalSold += quantity;
        holding.totalSoldValue += value;
        
        // Calculate realized P/L for this sale
        const costBasis = quantity * holding.avgCostPrice;
        const saleValue = value;
        const realizedPL = saleValue - costBasis;
        holding.realizedPL += realizedPL;
        
        // Adjust total cost for remaining shares
        if (holding.quantity > 0) {
          holding.totalCost = holding.avgCostPrice * holding.quantity;
        } else {
          holding.totalCost = 0;
          holding.avgCostPrice = 0;
        }
      }
    });
    
    // Convert map to array and filter out positions with zero quantity
    return Object.values(holdingsMap)
      .filter(holding => holding.quantity > 0)
      .map(holding => ({
        symbol: holding.symbol,
        name: holding.name,
        quantity: holding.quantity,
        avgCostPrice: holding.avgCostPrice,
        valueAtCost: holding.quantity * holding.avgCostPrice,
        realizedPL: holding.realizedPL,
        sector: assignSector(holding.symbol, holding.name)
      }));
  };
  
  // Helper function to calculate performance metrics
  const calculatePerformanceMetrics = (holdings, transactions) => {
    // In a real app, these would be calculated based on actual data
    // For now, we'll use placeholder values
    return {
      xirr: 14.5,
      sharpeRatio: 1.8,
      volatility: 15.2,
      drawdown: 8.5,
      alpha: 2.3,
      beta: 0.92
    };
  };
  
  // Helper function to calculate sector allocation
  const calculateSectorAllocation = (holdings) => {
    const sectorMap = {};
    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    
    if (totalValue === 0) return [];
    
    holdings.forEach(holding => {
      const sector = holding.sector || 'Other';
      if (!sectorMap[sector]) {
        sectorMap[sector] = 0;
      }
      sectorMap[sector] += (holding.currentValue || 0);
    });
    
    return Object.entries(sectorMap).map(([sector, value]) => ({
      sector,
      percentage: (value / totalValue) * 100
    }));
  };
  
  // Helper function to assign a sector based on symbol or company name
  const assignSector = (symbol, companyName) => {
    // In a real app, this would use an API or database
    // For now, we'll use a simple mapping based on keywords
    const sectorKeywords = {
      'Technology': ['tech', 'software', 'hardware', 'semiconductor', 'apple', 'microsoft', 'google', 'amazon', 'meta', 'nvidia'],
      'Financial Services': ['bank', 'insurance', 'finance', 'financial', 'capital', 'jpmorgan', 'visa', 'mastercard'],
      'Healthcare': ['health', 'pharma', 'medical', 'biotech', 'pfizer', 'johnson', 'unitedhealth'],
      'Consumer Discretionary': ['retail', 'consumer', 'luxury', 'restaurant', 'travel', 'amazon', 'tesla', 'mcdonald'],
      'Consumer Staples': ['food', 'beverage', 'household', 'personal', 'walmart', 'coca-cola', 'pepsi'],
      'Industrials': ['industrial', 'manufacturing', 'aerospace', 'defense', 'transportation', 'boeing', 'caterpillar'],
      'Energy': ['oil', 'gas', 'energy', 'renewable', 'exxon', 'chevron', 'shell'],
      'Materials': ['material', 'chemical', 'mining', 'metal', 'steel', 'gold', 'silver'],
      'Utilities': ['utility', 'electric', 'water', 'gas', 'power', 'nextera', 'duke'],
      'Real Estate': ['real estate', 'property', 'reit', 'american tower', 'prologis'],
      'Communication Services': ['telecom', 'media', 'entertainment', 'verizon', 'at&t', 'comcast', 'netflix']
    };
    
    const name = (companyName || symbol || '').toLowerCase();
    
    for (const [sector, keywords] of Object.entries(sectorKeywords)) {
      if (keywords.some(keyword => name.includes(keyword.toLowerCase()))) {
        return sector;
      }
    }
    
    return 'Other';
  };
  
  // Function to process summary file
  const processSummaryFile = async (file, headers, mappedFields, portfolioName = 'My Portfolio') => {
    setLoading(true);
    setError(null);
    
    try {
      // Read the file
      const text = await readFileAsText(file);
      const lines = text.split('\n');
      
      if (lines.length <= 1) {
        throw new Error('File is empty or contains only headers');
      }
      
      // Parse headers
      const headerLine = lines[0];
      const headerFields = headerLine.split(',').map(h => h.trim());
      
      // Parse holdings
      const holdings = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        const values = line.split(',').map(v => v.trim());
        const holding = {};
        
        // Map fields based on the provided mappings
        Object.keys(mappedFields).forEach(field => {
          const headerIndex = headerFields.indexOf(mappedFields[field]);
          if (headerIndex !== -1) {
            holding[field] = values[headerIndex];
          }
        });
        
        // Add only if we have the minimum required fields
        if (holding.symbol && holding.quantity && holding.avgCostPrice && holding.currentPrice) {
          // Convert numeric fields to numbers
          holding.quantity = parseFloat(holding.quantity);
          holding.avgCostPrice = parseFloat(holding.avgCostPrice);
          holding.currentPrice = parseFloat(holding.currentPrice);
          
          // Calculate values if not provided
          if (!holding.valueAtCost) {
            holding.valueAtCost = holding.quantity * holding.avgCostPrice;
          } else {
            holding.valueAtCost = parseFloat(holding.valueAtCost);
          }
          
          if (!holding.currentValue) {
            holding.currentValue = holding.quantity * holding.currentPrice;
          } else {
            holding.currentValue = parseFloat(holding.currentValue);
          }
          
          if (!holding.unrealizedPL) {
            holding.unrealizedPL = holding.currentValue - holding.valueAtCost;
          } else {
            holding.unrealizedPL = parseFloat(holding.unrealizedPL);
          }
          
          if (!holding.unrealizedPLPercent) {
            holding.unrealizedPLPercent = holding.valueAtCost > 0 ? (holding.unrealizedPL / holding.valueAtCost) * 100 : 0;
          } else {
            holding.unrealizedPLPercent = parseFloat(holding.unrealizedPLPercent);
          }
          
          // Add sector
          holding.sector = assignSector(holding.symbol, holding.companyName);
          
          holdings.push(holding);
        }
      }
      
      // Check if we already have a portfolio
      if (portfolio) {
        // Update existing portfolio
        const updatedPortfolio = {
          ...portfolio,
          name: portfolioName || portfolio.name,
          type: 'Summary-based',
          lastUpdated: new Date().toISOString(),
          holdings: holdings,
          totalValue: holdings.reduce((sum, h) => sum + h.currentValue, 0),
          investedValue: holdings.reduce((sum, h) => sum + h.valueAtCost, 0)
        };
        
        // Calculate sector allocation
        updatedPortfolio.sectorAllocation = calculateSectorAllocation(holdings);
        
        // Calculate gain/loss
        if (updatedPortfolio.investedValue > 0) {
          updatedPortfolio.totalGainLoss = updatedPortfolio.totalValue - updatedPortfolio.investedValue;
          updatedPortfolio.totalGainLossPercentage = (updatedPortfolio.totalGainLoss / updatedPortfolio.investedValue) * 100;
        } else {
          updatedPortfolio.totalGainLoss = 0;
          updatedPortfolio.totalGainLossPercentage = 0;
        }
        
        // Add history entry
        if (!updatedPortfolio.history) {
          updatedPortfolio.history = [];
        }
        
        updatedPortfolio.history.push({
          date: new Date().toISOString(),
          action: 'Updated summary',
          totalValue: updatedPortfolio.totalValue,
          investedValue: updatedPortfolio.investedValue
        });
        
        setPortfolio(updatedPortfolio);
        setLoading(false);
        
        // Add to portfolio history
        setPortfolioHistory(prev => [...prev, {
          date: new Date().toISOString(),
          action: 'Updated portfolio summary',
          portfolioName: updatedPortfolio.name
        }]);
        
        return updatedPortfolio;
      } else {
        // Create new portfolio
        const newPortfolio = {
          name: portfolioName,
          type: 'Summary-based',
          broker: 'generic',
          lastUpdated: new Date().toISOString(),
          holdings: holdings,
          totalValue: holdings.reduce((sum, h) => sum + h.currentValue, 0),
          investedValue: holdings.reduce((sum, h) => sum + h.valueAtCost, 0),
          performanceMetrics: {
            xirr: null,
            sharpeRatio: null,
            volatility: null,
            drawdown: null,
            alpha: null,
            beta: null
          },
          history: [{
            date: new Date().toISOString(),
            action: 'Created',
            totalValue: holdings.reduce((sum, h) => sum + h.currentValue, 0),
            investedValue: holdings.reduce((sum, h) => sum + h.valueAtCost, 0)
          }]
        };
        
        // Calculate sector allocation
        newPortfolio.sectorAllocation = calculateSectorAllocation(holdings);
        
        // Calculate gain/loss
        if (newPortfolio.investedValue > 0) {
          newPortfolio.totalGainLoss = newPortfolio.totalValue - newPortfolio.investedValue;
          newPortfolio.totalGainLossPercentage = (newPortfolio.totalGainLoss / newPortfolio.investedValue) * 100;
        } else {
          newPortfolio.totalGainLoss = 0;
          newPortfolio.totalGainLossPercentage = 0;
        }
        
        setPortfolio(newPortfolio);
        setLoading(false);
        
        // Add to portfolio history
        setPortfolioHistory(prev => [...prev, {
          date: new Date().toISOString(),
          action: 'Created portfolio from summary',
          portfolioName: portfolioName
        }]);
        
        return newPortfolio;
      }
    } catch (error) {
      console.error('Error processing summary file:', error);
      setError('Failed to process summary file: ' + error.message);
      setLoading(false);
      return null;
    }
  };
  
  // Update holding prices with real-time data
  const updateHoldingPrices = (portfolioId, priceMap) => {
    logger.info('PortfolioContext', `Updating prices for portfolio ${portfolioId}`);
    
    if (!portfolio || portfolio.id !== portfolioId) {
      logger.warn('PortfolioContext', 'Cannot update prices: portfolio not found or ID mismatch');
      return false;
    }
    
    try {
      // Create a copy of the portfolio
      const updatedPortfolio = { ...portfolio };
      
      // Update each holding with the new price
      updatedPortfolio.holdings = updatedPortfolio.holdings.map(holding => {
        const newPrice = priceMap[holding.symbol];
        
        if (newPrice) {
          const currentValue = holding.quantity * newPrice;
          const unrealizedPL = currentValue - holding.valueAtCost;
          const unrealizedPLPercent = holding.valueAtCost > 0 ? (unrealizedPL / holding.valueAtCost) * 100 : 0;
          
          return {
            ...holding,
            currentPrice: newPrice,
            currentValue,
            unrealizedPL,
            unrealizedPLPercent
          };
        }
        
        return holding;
      });
      
      // Recalculate portfolio totals
      const totalValueAtCost = updatedPortfolio.holdings.reduce((sum, h) => sum + h.valueAtCost, 0);
      const totalCurrentValue = updatedPortfolio.holdings.reduce((sum, h) => sum + h.currentValue, 0);
      const totalUnrealizedPL = totalCurrentValue - totalValueAtCost;
      const totalUnrealizedPLPercent = totalValueAtCost > 0 ? (totalUnrealizedPL / totalValueAtCost) * 100 : 0;
      
      updatedPortfolio.totalValueAtCost = totalValueAtCost;
      updatedPortfolio.totalCurrentValue = totalCurrentValue;
      updatedPortfolio.totalUnrealizedPL = totalUnrealizedPL;
      updatedPortfolio.totalUnrealizedPLPercent = totalUnrealizedPLPercent;
      
      // Update sector allocation
      updatedPortfolio.sectorAllocation = calculateSectorAllocation(updatedPortfolio.holdings);
      
      // Update the portfolio state
      setPortfolio(updatedPortfolio);
      
      logger.info('PortfolioContext', 'Portfolio prices updated successfully');
      return true;
    } catch (error) {
      logger.error('PortfolioContext', 'Error updating portfolio prices', error);
      return false;
    }
  };
  
  // Clear portfolio data
  const clearPortfolio = () => {
    setPortfolio(null);
    setError(null);
    setShowSummaryPrompt(false);
  };
  
  // Dismiss summary prompt
  const dismissSummaryPrompt = () => {
    setShowSummaryPrompt(false);
  };

  /**
   * Upload a portfolio file
   * @param {File} file - The file to upload
   * @param {Object} options - Upload options
   */
  const uploadPortfolioFile = async (file, options = {}) => {
    const { 
      fileType = 'transactions', 
      broker = 'generic', 
      mappedFields = null,
      portfolioName = 'My Portfolio',
      isUpdate = false,
      breezeCredentials = null
    } = options;
    
    setLoading(true);
    setError(null);
    
    try {
      logger.info('PortfolioContext', 'Uploading portfolio file', { fileType, broker });
      
      // Set the broker
      setBroker(broker);
      
      // Initialize Breeze API for ICICI if needed
      if (broker === 'icici' && breezeCredentials) {
        logger.info('PortfolioContext', 'Initializing Breeze API with provided credentials');
        
        // Extract credentials
        const { apiKey, apiSecret, sessionKey } = breezeCredentials;
        
        // Initialize Breeze API
        await breezeService.initialize(apiKey, apiSecret, sessionKey);
        setIsBreezeInitialized(true);
      }
      
      // Read the file
      const text = await readFileAsText(file);
      const lines = text.split('\n');
      
      // Process the file based on type
      if (fileType === 'transactions') {
        const transactions = parseCSV(lines, mappedFields?.transactions);
        const portfolio = await processTransactions(transactions, portfolioName, isUpdate);
        return portfolio;
      } else if (fileType === 'summary') {
        const holdings = parseCSV(lines, mappedFields?.summary);
        const portfolio = await processHoldings(holdings, portfolioName);
        return portfolio;
      }
    } catch (error) {
      logger.error('PortfolioContext', 'Error uploading portfolio file', error);
      setError(`Failed to upload portfolio: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Process a file upload from a URL
   * @param {string} url - The URL to load
   * @param {Object} options - Options for processing
   */
  const processFileFromURL = async (url, options = {}) => {
    const { 
      fileType = 'transactions', 
      broker = 'generic',
      mappedFields = null,
      portfolioName = 'My Portfolio',
      breezeCredentials = null
    } = options;
    
    setLoading(true);
    setError(null);
    
    try {
      logger.info('PortfolioContext', 'Processing file from URL', { fileType, broker, url });
      
      // Set the broker
      setBroker(broker);
      
      // Initialize Breeze API for ICICI if needed
      if (broker === 'icici' && breezeCredentials) {
        logger.info('PortfolioContext', 'Initializing Breeze API with provided credentials');
        
        // Extract credentials
        const { apiKey, apiSecret, sessionKey } = breezeCredentials;
        
        // Initialize Breeze API
        await breezeService.initialize(apiKey, apiSecret, sessionKey);
        setIsBreezeInitialized(true);
      }
      
      // Fetch the file
      const response = await fetch(url);
      const text = await response.text();
      const lines = text.split('\n');
      
      // Process the file based on type
      if (fileType === 'transactions') {
        const transactions = parseCSV(lines, mappedFields?.transactions);
        const portfolio = await processTransactions(transactions, portfolioName);
        return portfolio;
      } else if (fileType === 'summary') {
        const holdings = parseCSV(lines, mappedFields?.summary);
        const portfolio = await processHoldings(holdings, portfolioName);
        return portfolio;
      }
    } catch (error) {
      logger.error('PortfolioContext', 'Error processing file from URL', error);
      setError(`Failed to process file: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Helper function to parse CSV data with field mapping
  const parseCSV = (lines, fieldMapping) => {
    if (!lines || lines.length <= 1) {
      throw new Error('Invalid CSV data: File is empty or contains only headers');
    }

    // Parse headers
    const headerLine = lines[0];
    const headerFields = headerLine.split(',').map(h => h.trim());

    // Parse data rows
    const parsedData = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = line.split(',').map(v => v.trim());
      const row = {};

      // Map fields based on the provided mappings
      if (fieldMapping) {
        Object.keys(fieldMapping).forEach(field => {
          const headerIndex = headerFields.indexOf(fieldMapping[field]);
          if (headerIndex !== -1) {
            // Convert numeric fields
            const value = values[headerIndex];
            if (['quantity', 'price', 'avgCostPrice', 'currentPrice', 'valueAtCost', 'valueAtMarket', 'unrealizedPL', 'unrealizedPLPercent', 'brokerage'].includes(field)) {
              row[field] = parseFloat(value) || 0;
            } else {
              row[field] = value;
            }
          }
        });
      } else {
        // If no mapping provided, use header names as keys
        headerFields.forEach((header, index) => {
          row[header] = values[index];
        });
      }

      // Add row if it has required fields based on context
      if (Object.keys(row).length > 0) {
        parsedData.push(row);
      }
    }

    return parsedData;
  };

  // Process transactions and calculate portfolio
  const processTransactions = async (transactions, portfolioName, isUpdate = false) => {
    try {
      // Calculate holdings from transactions
      let holdings;
      
      if (selectedBroker === 'icici' && isBreezeInitialized) {
        // Use Breeze API to resolve stock codes and get current prices
        holdings = await calculateHoldingsWithBreezeAPI(transactions);
      } else {
        // Use regular calculation for other brokers
        holdings = calculateHoldings(transactions);
        holdings = simulateCurrentPrices(holdings);
      }
      
      // Create or update portfolio object
      const portfolioData = {
        name: portfolioName,
        type: 'Transactions-based',
        broker: selectedBroker,
        lastUpdated: new Date().toISOString(),
        transactions: transactions,
        holdings: holdings,
        totalValue: holdings.reduce((sum, h) => sum + h.currentValue, 0),
        investedValue: holdings.reduce((sum, h) => sum + h.valueAtCost, 0),
        performanceMetrics: calculatePerformanceMetrics(holdings, transactions)
      };

      // If updating existing portfolio
      if (isUpdate && portfolio) {
        portfolioData.id = portfolio.id;
        portfolioData.history = [...(portfolio.history || [])];
      } else {
        portfolioData.history = [];
      }
      
      // Calculate sector allocation
      portfolioData.sectorAllocation = calculateSectorAllocation(holdings);
      
      // Calculate gain/loss
      if (portfolioData.investedValue > 0) {
        portfolioData.totalGainLoss = portfolioData.totalValue - portfolioData.investedValue;
        portfolioData.totalGainLossPercentage = (portfolioData.totalGainLoss / portfolioData.investedValue) * 100;
      } else {
        portfolioData.totalGainLoss = 0;
        portfolioData.totalGainLossPercentage = 0;
      }
      
      // Add history entry
      portfolioData.history.push({
        date: new Date().toISOString(),
        action: isUpdate ? 'Updated transactions' : 'Created',
        totalValue: portfolioData.totalValue,
        investedValue: portfolioData.investedValue
      });
      
      setPortfolio(portfolioData);
      setShowSummaryPrompt(selectedBroker === 'generic'); // Only show summary prompt for non-ICICI
      
      // Add to portfolio history
      setPortfolioHistory(prev => [...prev, {
        date: new Date().toISOString(),
        action: isUpdate ? 'Updated portfolio transactions' : 'Created portfolio from transactions',
        portfolioName: portfolioData.name,
        broker: selectedBroker
      }]);
      
      return portfolioData;
    } catch (error) {
      logger.error('PortfolioContext', 'Error processing transactions', error);
      setError(`Failed to process transactions: ${error.message}`);
      return null;
    }
  };

  // Process holdings data from summary file
  const processHoldings = async (holdings, portfolioName) => {
    try {
      // Process holdings data
      const processedHoldings = holdings.map(holding => {
        // Required fields from summary file
        const symbol = holding.symbol;
        const quantity = parseFloat(holding.quantity) || 0;
        const companyName = holding.companyName || symbol;
        
        // Derive current market value - this is required
        const currentValue = parseFloat(holding.currentValue) || 0;
        
        // Calculate current price from quantity and current value if not provided
        const currentPrice = parseFloat(holding.currentPrice) || (quantity > 0 ? currentValue / quantity : 0);
        
        // Try to get cost basis from transactions if available
        let avgCostPrice = parseFloat(holding.avgCostPrice);
        let valueAtCost = parseFloat(holding.valueAtCost);
        let unrealizedPL = parseFloat(holding.unrealizedPL);
        let unrealizedPLPercent = parseFloat(holding.unrealizedPLPercent);
        
        // If no cost basis provided, try to derive from transactions if we have them
        if ((!avgCostPrice || !valueAtCost) && portfolio && portfolio.transactions && portfolio.transactions.length > 0) {
          // Filter transactions for this symbol
          const symbolTransactions = portfolio.transactions.filter(tx => tx.symbol === symbol);
          
          if (symbolTransactions.length > 0) {
            // Calculate holdings for this symbol only
            const calculatedHolding = calculateHoldings(symbolTransactions)
              .find(h => h.symbol === symbol);
            
            if (calculatedHolding) {
              avgCostPrice = calculatedHolding.avgCostPrice;
              valueAtCost = calculatedHolding.valueAtCost;
              logger.info('PortfolioContext', `Derived cost basis for ${symbol} from transactions: ${avgCostPrice}`);
            }
          }
        }
        
        // Set defaults if still missing
        avgCostPrice = avgCostPrice || currentPrice || 0;
        valueAtCost = valueAtCost || (quantity * avgCostPrice);
        
        // Calculate P&L if not provided
        unrealizedPL = unrealizedPL || (currentValue - valueAtCost);
        unrealizedPLPercent = unrealizedPLPercent || 
          (valueAtCost > 0 ? (unrealizedPL / valueAtCost) * 100 : 0);
        
        return {
          symbol,
          name: companyName,
          quantity,
          avgCostPrice,
          currentPrice,
          valueAtCost,
          currentValue,
          unrealizedPL,
          unrealizedPLPercent,
          // Add sector if not present
          sector: holding.sector || assignSector(symbol, companyName)
        };
      });
      
      // Create portfolio object
      const portfolioData = {
        name: portfolioName,
        type: 'Summary-based',
        broker: selectedBroker,
        lastUpdated: new Date().toISOString(),
        holdings: processedHoldings,
        transactions: portfolio?.transactions || [], // Keep transactions if updating existing portfolio
        totalValue: processedHoldings.reduce((sum, h) => sum + h.currentValue, 0),
        investedValue: processedHoldings.reduce((sum, h) => sum + h.valueAtCost, 0)
      };
      
      // Calculate sector allocation
      portfolioData.sectorAllocation = calculateSectorAllocation(processedHoldings);
      
      // Calculate gain/loss
      if (portfolioData.investedValue > 0) {
        portfolioData.totalGainLoss = portfolioData.totalValue - portfolioData.investedValue;
        portfolioData.totalGainLossPercentage = (portfolioData.totalGainLoss / portfolioData.investedValue) * 100;
      } else {
        portfolioData.totalGainLoss = 0;
        portfolioData.totalGainLossPercentage = 0;
      }
      
      // Initialize history
      portfolioData.history = portfolio?.history || [];
      portfolioData.history.push({
        date: new Date().toISOString(),
        action: 'Updated from summary',
        totalValue: portfolioData.totalValue,
        investedValue: portfolioData.investedValue
      });
      
      setPortfolio(portfolioData);
      
      // Add to portfolio history
      setPortfolioHistory(prev => [...prev, {
        date: new Date().toISOString(),
        action: 'Updated portfolio from summary',
        portfolioName: portfolioData.name,
        broker: selectedBroker
      }]);
      
      return portfolioData;
    } catch (error) {
      logger.error('PortfolioContext', 'Error processing holdings', error);
      setError(`Failed to process holdings: ${error.message}`);
      return null;
    }
  };

  // Provide all the context values
  return (
    <PortfolioContext.Provider
      value={{
        portfolio,
        loading,
        error,
        setLoading,
        setError,
        showSummaryPrompt,
        dismissSummaryPrompt,
        processTransactionsFile,
        processSummaryFile,
        updateTransactionsFile,
        selectedBroker,
        setBroker,
        isBreezeInitialized,
        getHistoricalPricesForPortfolio,
        calculatePortfolioValueOnDate,
        updateHoldingPrices,
        uploadPortfolioFile,
        processFileFromURL,
        getPortfolioById: async (id) => {
          try {
            setLoading(true);
            setError(null);
            logger.info('PortfolioContext', `Fetching portfolio with ID: ${id}`);
            
            const response = await fetch(`/api/portfolios/${id}`);
            
            if (!response.ok) {
              throw new Error(`Failed to fetch portfolio: ${response.statusText}`);
            }
            
            const portfolioData = await response.json();
            setPortfolio(portfolioData);
            setLoading(false);
            return portfolioData;
          } catch (error) {
            logger.error('PortfolioContext', `Error fetching portfolio with ID ${id}:`, error);
            setError(`Failed to fetch portfolio: ${error.message}`);
            setLoading(false);
            return null;
          }
        }
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
};

// Hook to use the portfolio context
export const usePortfolio = () => useContext(PortfolioContext);

export default PortfolioContext; 