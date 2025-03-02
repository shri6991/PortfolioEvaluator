import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { Container, Row, Col, Card, Table, Badge, Alert, Spinner, Nav, Tab, ButtonGroup, Button, Tabs } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { Line, Pie, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement } from 'chart.js';
import 'chart.js/auto'; // Import Chart.js auto to include all necessary components
import { format } from 'date-fns';
import logger from '../services/LoggerService';
import breezeService from '../services/BreezeService';
import xirrService from '../services/XirrService';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

// Helper function to safely format currency
const formatCurrency = (value) => {
  if (value === undefined || value === null) return '₹0.00';
  return '₹' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Helper function to safely format percentage
const formatPercentage = (value) => {
  if (value === undefined || value === null || isNaN(value)) return '0.00%';
  return value.toFixed(2) + '%';
};

// Helper function to safely format number
const formatNumber = (value) => {
  if (value === undefined || value === null) return '0';
  return value.toLocaleString();
};

// Helper function to format XIRR
const formatXirr = (value) => {
  if (value === undefined || value === null || isNaN(value)) return 'N/A';
  return (value * 100).toFixed(2) + '%';
};

// Helper function to get sector color
const getSectorColor = (sector) => {
  const colors = {
    'Technology': '#007bff',
    'Financial Services': '#6610f2',
    'Healthcare': '#6f42c1',
    'Consumer Discretionary': '#e83e8c',
    'Consumer Staples': '#dc3545',
    'Industrials': '#fd7e14',
    'Energy': '#ffc107',
    'Materials': '#28a745',
    'Utilities': '#20c997',
    'Real Estate': '#17a2b8',
    'Communication Services': '#6c757d',
    'Other': '#343a40'
  };
  
  return colors[sector] || colors['Other'];
};

const PortfolioDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { portfolio, getPortfolioById, loading, error, calculatePortfolioValueOnDate, getHistoricalPricesForPortfolio, updateHoldingPrices } = usePortfolio();
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('MAX');
  const [performanceData, setPerformanceData] = useState(null);
  const [historicalPrices, setHistoricalPrices] = useState({});
  const [isLoadingHistoricalData, setIsLoadingHistoricalData] = useState(false);
  const [historicalPriceError, setHistoricalPriceError] = useState('');
  const [selectedTab, setSelectedTab] = useState('overview');
  const [portfolioXirr, setPortfolioXirr] = useState(null);
  const [securitiesXirr, setSecuritiesXirr] = useState({});
  const [isCalculatingXirr, setIsCalculatingXirr] = useState(false);
  const [xirrError, setXirrError] = useState('');
  
  // Add refs for charts
  const lineChartRef = useRef(null);
  const pieChartRef = useRef(null);
  const barChartRef = useRef(null);
  const historyChartRef = useRef(null);
  
  // Get start and end dates based on time range
  const getDateRangeForTimeRange = useCallback((range) => {
    const endDate = new Date();
    let startDate = new Date();
    
    // If portfolio has transactions, use the earliest transaction date as the start date for MAX
    const sortedTransactions = portfolio && portfolio.transactions && Array.isArray(portfolio.transactions) && portfolio.transactions.length > 0
      ? [...portfolio.transactions]
          .filter(t => t && t.date)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
      : [];
      
    const earliestTransactionDate = sortedTransactions.length > 0 
      ? new Date(sortedTransactions[0].date)
      : new Date();
    
    switch (range) {
      case '1D':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '1W':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '1M':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case '1Y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'MAX':
      default:
        startDate = new Date(earliestTransactionDate);
        break;
    }
    
    return { startDate, endDate };
  }, [portfolio]);

  // Function to load historical prices based on time range
  const loadHistoricalPrices = useCallback(async (range) => {
    if (!portfolio || !portfolio.transactions || portfolio.transactions.length === 0) {
      logger.warn('PortfolioDetail', 'No portfolio or transactions available');
      setPerformanceData([]);
      return;
    }
    
    logger.info('PortfolioDetail', `Loading historical prices for time range: ${range}`);
    setIsLoadingHistoricalData(true);
    setHistoricalPriceError('');
    
    try {
      const { startDate, endDate } = getDateRangeForTimeRange(range);
      logger.debug('PortfolioDetail', 'Date range calculated', { startDate, endDate });
      
      // Use a simplified approach: Create a transaction map for price lookup
      const priceMap = {};
      
      // Sort transactions by date (ascending)
      const sortedTransactions = [...portfolio.transactions]
        .filter(tx => tx && tx.date && tx.symbol && tx.price)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      logger.debug('PortfolioDetail', `Processing ${sortedTransactions.length} transactions for price map`);
      
      // Record the last known price for each symbol on each date
      sortedTransactions.forEach(tx => {
        const symbol = tx.symbol;
        const dateStr = new Date(tx.date).toISOString().split('T')[0];
        const price = parseFloat(tx.price);
        
        if (!isNaN(price) && price > 0) {
          if (!priceMap[symbol]) {
            priceMap[symbol] = {};
          }
          priceMap[symbol][dateStr] = price;
        }
      });
      
      // Generate a list of dates between startDate and endDate
      const dates = [];
      const current = new Date(startDate);
      const end = new Date(endDate);
      
      // Limit to 1 year maximum to prevent performance issues
      const oneYearAgo = new Date(end);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      if (current < oneYearAgo) {
        logger.info('PortfolioDetail', 'Limiting date range to 1 year');
        current.setTime(oneYearAgo.getTime());
      }
      
      // Generate dates (maximum 100 data points)
      const totalDays = Math.ceil((end - current) / (86400000)); // milliseconds in a day
      const skipDays = Math.max(1, Math.floor(totalDays / 100));
      
      logger.debug('PortfolioDetail', `Generating dates with skipDays=${skipDays} for total days=${totalDays}`);
      
      let dayCounter = 0;
      while (current <= end) {
        if (dayCounter % skipDays === 0) {
          dates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
        dayCounter++;
      }
      
      // Ensure we include the end date
      if (dates.length === 0 || dates[dates.length - 1] < end) {
        dates.push(new Date(end));
      }
      
      logger.info('PortfolioDetail', `Generated ${dates.length} dates for historical data`);
      
      // Calculate holdings and portfolio value for each date
      const performanceData = [];
      
      for (const date of dates) {
        const dateStr = date.toISOString().split('T')[0];
        // Use simple locale string format for consistent display
        const formattedDate = format(date, 'MMM d, yyyy');
        
        // Calculate portfolio value on this date
        let portfolioValue = 0;
        
        // Track holdings for each symbol as of this date
        const holdingsAsOfDate = {};
        
        // Process all transactions up to this date to determine holdings
        for (const tx of sortedTransactions) {
          const txDate = new Date(tx.date);
          
          if (txDate > date) {
            // Skip transactions after this date
            continue;
          }
          
          const symbol = tx.symbol;
          const isBuy = (tx.action || '').toUpperCase() === 'BUY';
          const quantity = parseFloat(tx.quantity) || 0;
          
          if (!holdingsAsOfDate[symbol]) {
            holdingsAsOfDate[symbol] = 0;
          }
          
          if (isBuy) {
            holdingsAsOfDate[symbol] += quantity;
          } else {
            holdingsAsOfDate[symbol] -= quantity;
          }
        }
        
        // Log for debugging
        if (dates.indexOf(date) === 0 || dates.indexOf(date) === dates.length - 1) {
          logger.debug('PortfolioDetail', `Holdings as of ${formattedDate}:`, holdingsAsOfDate);
        }
        
        // Calculate value for each holding using last known price
        Object.keys(holdingsAsOfDate).forEach(symbol => {
          const quantity = holdingsAsOfDate[symbol];
          
          if (quantity <= 0) {
            return; // Skip if not holding any shares
          }
          
          // Find the most recent price for this symbol on or before this date
          let price = null;
          
          if (priceMap[symbol]) {
            // Find the latest date in the price map that's on or before current date
            const availableDates = Object.keys(priceMap[symbol])
              .filter(d => d <= dateStr)
              .sort();
            
            if (availableDates.length > 0) {
              const latestDate = availableDates[availableDates.length - 1];
              price = priceMap[symbol][latestDate];
            }
          }
          
          // If no historical price found, try using current price from holdings
          if (!price || price <= 0) {
            const holding = portfolio.holdings.find(h => h.symbol === symbol);
            if (holding) {
              price = holding.avgCostPrice || holding.currentPrice;
            }
          }
          
          // Add to portfolio value if we have a valid price
          if (price && price > 0 && quantity > 0) {
            const holdingValue = quantity * price;
            
            // Safety check - ignore unrealistically large values
            if (holdingValue < 1e10) { // 10 billion limit
              portfolioValue += holdingValue;
            } else {
              logger.warn('PortfolioDetail', `Ignoring suspicious holding value for ${symbol}:`, {
                quantity,
                price,
                value: holdingValue
              });
            }
          }
        });
        
        // Log extreme values for debugging
        if (portfolioValue > 1e9) { // log if over 1 billion
          logger.warn('PortfolioDetail', `Very high portfolio value on ${formattedDate}:`, {
            value: portfolioValue
          });
        }
        
        // Only add points with valid values
        if (portfolioValue > 0 && portfolioValue < 1e10) { // Cap at 10 billion
          performanceData.push({
            date: formattedDate,
            value: portfolioValue
          });
        }
      }
      
      logger.info('PortfolioDetail', `Generated ${performanceData.length} performance data points`);
      logger.debug('PortfolioDetail', 'Sample data points:', {
        first: performanceData.length > 0 ? performanceData[0] : null,
        last: performanceData.length > 0 ? performanceData[performanceData.length - 1] : null
      });
      
      setPerformanceData(performanceData);
    } catch (error) {
      logger.error('PortfolioDetail', 'Error loading historical prices', error);
      setHistoricalPriceError(`Failed to load historical prices: ${error.message}`);
      setPerformanceData([]);
    } finally {
      setIsLoadingHistoricalData(false);
    }
  }, [portfolio, getDateRangeForTimeRange]);

  // Function to calculate XIRR values for portfolio and securities
  const calculateXirrValues = useCallback(() => {
    if (!portfolio || !portfolio.transactions || !portfolio.holdings) {
      logger.warn('PortfolioDetail', 'Cannot calculate XIRR: missing portfolio data');
      return;
    }

    try {
      setIsCalculatingXirr(true);
      setXirrError('');

      logger.info('PortfolioDetail', 'Starting XIRR calculation', {
        transactionsCount: portfolio.transactions.length,
        holdingsCount: portfolio.holdings.length
      });
      
      // Log sample transaction for debugging
      if (portfolio.transactions.length > 0) {
        const sampleTx = portfolio.transactions[0];
        logger.debug('PortfolioDetail', 'Sample transaction:', {
          sample: JSON.stringify(sampleTx),
          keys: Object.keys(sampleTx)
        });
      }
      
      // Prepare transactions for XIRR calculation
      const transactions = portfolio.transactions
        .filter(tx => {
          // Validate transaction data
          if (!tx.date || !tx.price || !tx.quantity || !tx.symbol) {
            logger.warn('PortfolioDetail', 'Invalid transaction data:', {
              date: tx.date, 
              price: tx.price,
              quantity: tx.quantity,
              symbol: tx.symbol
            });
            return false;
          }
          return true;
        })
        .map(tx => {
          // Ensure date is a proper Date object
          let date;
          try {
            date = new Date(tx.date);
            if (isNaN(date.getTime())) {
              logger.warn('PortfolioDetail', 'Invalid date format:', {
                originalDate: tx.date,
                parsedDate: date
              });
              return null;
            }
          } catch (error) {
            logger.warn('PortfolioDetail', 'Error parsing date:', {
              date: tx.date,
              error: error.message
            });
            return null;
          }
          
          // Determine transaction type and calculate amount
          const isBuy = tx.action?.toUpperCase() === 'BUY' || tx.transactionType?.toUpperCase() === 'BUY';
          const amount = isBuy ? -tx.price * tx.quantity : tx.price * tx.quantity;
          
          logger.debug('PortfolioDetail', 'Processing transaction:', {
            symbol: tx.symbol,
            date: date.toISOString(),
            amount: amount,
            type: tx.action || tx.transactionType
          });
          
          return {
            amount,
            date,
            symbol: tx.symbol
          };
        })
        .filter(tx => tx !== null); // Remove any transactions with invalid dates

      logger.info('PortfolioDetail', `Processed ${transactions.length} valid transactions`);

      // Prepare current holdings for XIRR calculation
      const currentHoldings = portfolio.holdings
        .filter(holding => {
          // Validate holding data
          if (!holding.symbol || !holding.currentPrice || !holding.quantity) {
            logger.warn('PortfolioDetail', 'Invalid holding data:', {
              symbol: holding.symbol,
              currentPrice: holding.currentPrice,
              quantity: holding.quantity
            });
            return false;
          }
          return true;
        })
        .map(holding => {
          const currentValue = holding.currentValue || (holding.currentPrice * holding.quantity);
          
          logger.debug('PortfolioDetail', 'Processing holding:', {
            symbol: holding.symbol,
            currentValue: currentValue
          });
          
          return {
            symbol: holding.symbol,
            currentValue
          };
        });

      logger.info('PortfolioDetail', `Processed ${currentHoldings.length} valid holdings`);

      // Calculate XIRR values
      const xirrResults = xirrService.calculatePortfolioXirr(transactions, currentHoldings);
      
      logger.info('PortfolioDetail', 'XIRR calculation results:', {
        portfolioXirr: xirrResults.portfolioXirr,
        securitiesCount: Object.keys(xirrResults.securitiesXirr).length,
        securitiesXirr: xirrResults.securitiesXirr
      });
      
      setPortfolioXirr(xirrResults.portfolioXirr);
      setSecuritiesXirr(xirrResults.securitiesXirr);
    } catch (error) {
      logger.error('PortfolioDetail', 'Error calculating XIRR', error);
      setXirrError(`Failed to calculate XIRR: ${error.message}`);
    } finally {
      setIsCalculatingXirr(false);
    }
  }, [portfolio]);
  
  // Debug logging for Chart.js registered scales
  useEffect(() => {
    logger.info('PortfolioDetail', 'Registered Chart.js scales:', {
      scales: Object.keys(ChartJS.defaults.scales || {})
    });
    logger.info('PortfolioDetail', 'Chart.js version:', {
      version: ChartJS.version
    });
  }, []);

  useEffect(() => {
    if (id) {
      logger.info('PortfolioDetail', `Loading portfolio with ID: ${id}`);
      getPortfolioById(id);
    }
  }, [id, getPortfolioById]);

  useEffect(() => {
    if (portfolio) {
      logger.info('PortfolioDetail', 'Portfolio loaded, loading historical prices');
      loadHistoricalPrices(timeRange);
      calculateXirrValues();
    }
  }, [portfolio, timeRange, loadHistoricalPrices, calculateXirrValues]);
  
  // Cleanup chart instances when component unmounts or when tab changes
  useEffect(() => {
    return () => {
      logger.info('PortfolioDetail', 'Cleaning up chart instances');
      // Destroy all chart instances
      const charts = [lineChartRef, pieChartRef, barChartRef, historyChartRef];
      charts.forEach(chartRef => {
        if (chartRef.current && chartRef.current.chartInstance) {
          logger.info('PortfolioDetail', 'Destroying chart instance');
          chartRef.current.chartInstance.destroy();
        }
      });
    };
  }, [selectedTab]);
  
  // Log whenever the chart is about to render
  useEffect(() => {
    if (performanceData && performanceData.length > 0) {
      logger.info('PortfolioDetail', 'Performance chart about to render with data', {
        count: performanceData.length,
        timeRange
      });
    }
  }, [performanceData, timeRange]);

  if (loading || isLoadingHistoricalData) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading portfolio data...</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          <Alert.Heading>Error Loading Portfolio</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  if (!portfolio) {
    return (
      <Container className="mt-5">
        <Alert variant="info">
          <Alert.Heading>No Portfolio Found</Alert.Heading>
          <p>You don't have a portfolio loaded yet. Please import your portfolio data first.</p>
        </Alert>
      </Container>
    );
  }

  // Ensure portfolio properties exist with default values
  const safePortfolio = {
    name: portfolio.name || 'My Portfolio',
    totalValue: portfolio.totalValue || 0,
    investedValue: portfolio.investedValue || 0,
    totalGainLoss: portfolio.totalGainLoss || 0,
    totalGainLossPercentage: portfolio.totalGainLossPercentage || 0,
    holdings: portfolio.holdings || [],
    transactions: portfolio.transactions || [],
    history: portfolio.history || [],
    sectorAllocation: portfolio.sectorAllocation || {},
    lastUpdated: portfolio.lastUpdated || new Date().toISOString()
  };

  // Prepare data for charts
  const preparePerformanceChartData = () => {
    if (!performanceData || !Array.isArray(performanceData) || performanceData.length === 0) {
      logger.warn('PortfolioDetail', 'No performance data available for chart');
      return null;
    }

    // Sort data points by date
    const sortedData = [...performanceData].sort((a, b) => {
      return new Date(a.date) - new Date(b.date);
    });

    // Filter out any invalid data points
    const validData = sortedData.filter(point => 
      point && 
      point.date && 
      typeof point.value === 'number' && 
      !isNaN(point.value) && 
      point.value > 0
    );

    if (validData.length === 0) {
      logger.warn('PortfolioDetail', 'No valid data points after filtering');
      return null;
    }
    
    logger.info('PortfolioDetail', `Prepared ${validData.length} valid data points for chart`);
    logger.debug('PortfolioDetail', 'Data range:', {
      first: validData[0],
      last: validData[validData.length - 1]
    });

    // Ensure the last data point matches the current portfolio value in summary
    if (validData.length > 0 && safePortfolio.totalValue) {
      const lastDataPoint = validData[validData.length - 1];
      const tolerance = 0.05; // 5% tolerance
      const difference = Math.abs(lastDataPoint.value - safePortfolio.totalValue) / safePortfolio.totalValue;
      
      if (difference > tolerance) {
        logger.info('PortfolioDetail', 'Correcting last data point to match summary value', {
          lastChartValue: lastDataPoint.value,
          summaryValue: safePortfolio.totalValue,
          difference: difference * 100 + '%'
        });
        lastDataPoint.value = safePortfolio.totalValue;
      }
    }

    // Limit to maximum 100 data points to improve performance
    let dataToUse = validData;
    if (validData.length > 100) {
      const skipPoints = Math.floor(validData.length / 100);
      dataToUse = validData.filter((_, index) => index % skipPoints === 0 || index === validData.length - 1);
    }
    
    // Get the initial invested value
    const initialInvestedValue = validData[0]?.value || 0;
    
    // Calculate cost basis for each point in time based on transactions
    const costBasisData = [];
    
    if (Array.isArray(portfolio.transactions) && portfolio.transactions.length > 0) {
      // Track cumulative investments over time
      let cumulativeInvestment = initialInvestedValue;
      
      dataToUse.forEach((point, index) => {
        const currentDate = new Date(point.date);
        
        // Count all buys up to this date
        const investmentUpToDate = portfolio.transactions
          .filter(tx => {
            const txDate = new Date(tx.date);
            return txDate <= currentDate && tx.action?.toUpperCase() === 'BUY';
          })
          .reduce((sum, tx) => sum + (tx.price * tx.quantity), 0);
          
        // Count all sells up to this date
        const divestmentUpToDate = portfolio.transactions
          .filter(tx => {
            const txDate = new Date(tx.date);
            return txDate <= currentDate && tx.action?.toUpperCase() === 'SELL';
          })
          .reduce((sum, tx) => sum + (tx.price * tx.quantity), 0);
        
        // Cost basis is buys minus sells
        costBasisData.push(Math.max(0, investmentUpToDate - divestmentUpToDate));
      });
      
      // Ensure cost basis never exceeds market value by unrealistic amounts
      for (let i = 0; i < costBasisData.length; i++) {
        // Cap cost basis at 150% of market value to avoid unrealistic scaling
        costBasisData[i] = Math.min(costBasisData[i], dataToUse[i].value * 1.5);
      }
    } else {
      // If no transaction data, use invested value from summary
      dataToUse.forEach(() => {
        costBasisData.push(safePortfolio.investedValue || 0);
      });
    }
    
    logger.debug('PortfolioDetail', 'Generated cost basis data', {
      first: costBasisData[0],
      last: costBasisData[costBasisData.length - 1]
    });

    return {
      labels: dataToUse.map(point => point.date), // Use string dates instead of Date objects
      datasets: [
        {
          label: 'Portfolio Value',
          data: dataToUse.map(point => point.value),
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          tension: 0.1,
          fill: true,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: 'Cost Basis',
          data: costBasisData,
          borderColor: 'rgba(153, 102, 255, 0.8)',
          backgroundColor: 'rgba(153, 102, 255, 0.1)',
          tension: 0.1,
          fill: true,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [5, 5]
        }
      ]
    };
  };

  const prepareSectorAllocationData = () => {
    if (!safePortfolio.sectorAllocation || Object.keys(safePortfolio.sectorAllocation).length === 0) {
      return null;
    }

    const sectors = Object.keys(safePortfolio.sectorAllocation);
    const values = sectors.map(sector => safePortfolio.sectorAllocation[sector] || 0);

    // Generate colors for each sector
    const backgroundColors = [
      'rgba(255, 99, 132, 0.6)',
      'rgba(54, 162, 235, 0.6)',
      'rgba(255, 206, 86, 0.6)',
      'rgba(75, 192, 192, 0.6)',
      'rgba(153, 102, 255, 0.6)',
      'rgba(255, 159, 64, 0.6)',
      'rgba(199, 199, 199, 0.6)',
      'rgba(83, 102, 255, 0.6)',
      'rgba(40, 159, 64, 0.6)',
      'rgba(210, 99, 132, 0.6)',
    ];

    return {
      labels: sectors,
      datasets: [
        {
          data: values,
          backgroundColor: backgroundColors.slice(0, sectors.length),
          borderWidth: 1,
        }
      ]
    };
  };

  const prepareHoldingsChartData = () => {
    if (!safePortfolio.holdings || safePortfolio.holdings.length === 0) {
      return null;
    }

    // Sort holdings by current value in descending order
    const sortedHoldings = [...safePortfolio.holdings]
      .filter(holding => holding && typeof holding.currentValue === 'number')
      .sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
    
    // Take top 10 holdings
    const topHoldings = sortedHoldings.slice(0, 10);
    
    const labels = topHoldings.map(holding => holding.symbol || 'Unknown');
    const marketValues = topHoldings.map(holding => holding.currentValue || 0);
    const costValues = topHoldings.map(holding => holding.costBasis || 0);
    
    const maxValue = Math.max(...marketValues);
    
    logger.debug('PortfolioDetail', 'Holdings chart data', {
      maxValue,
      topHolding: labels[0],
      topValue: marketValues[0]
    });

    return {
      labels,
      datasets: [
        {
          label: 'Market Value',
          data: marketValues,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
        },
        {
          label: 'Cost Basis',
          data: costValues,
          backgroundColor: 'rgba(153, 102, 255, 0.6)',
        }
      ]
    };
  };

  const prepareHistoryChartData = () => {
    if (!safePortfolio.transactions || safePortfolio.transactions.length === 0) {
      return null;
    }

    // Create a map to count actions by type
    const actionCounts = {};
    
    safePortfolio.transactions.forEach(transaction => {
      if (!transaction || !transaction.action) return;
      
      const action = transaction.action.toUpperCase();
      if (!actionCounts[action]) {
        actionCounts[action] = 0;
      }
      actionCounts[action]++;
    });

    const labels = Object.keys(actionCounts);
    const data = Object.values(actionCounts);
    
    // Generate colors for each action type
    const backgroundColors = [
      'rgba(75, 192, 192, 0.6)',  // BUY - green
      'rgba(255, 99, 132, 0.6)',  // SELL - red
      'rgba(255, 206, 86, 0.6)',  // DIVIDEND - yellow
      'rgba(153, 102, 255, 0.6)', // Other
    ];

    return {
      labels,
      datasets: [
        {
          label: 'Transaction Count by Type',
          data,
          backgroundColor: backgroundColors.slice(0, labels.length),
        }
      ]
    };
  };

  const performanceChartData = preparePerformanceChartData();
  const sectorAllocationData = prepareSectorAllocationData();
  const holdingsChartData = prepareHoldingsChartData();
  const historyChartData = prepareHistoryChartData();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            if (context && context.raw) {
              try {
                return `${context.dataset.label}: ₹${context.raw.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
              } catch (error) {
                logger.error('PortfolioDetail', 'Error formatting tooltip value', error);
                return `${context.dataset.label}: ₹${context.raw}`;
              }
            }
            return '';
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        grace: '5%',
        suggestedMax: (safePortfolio.totalValue || 0) * 1.2, // 20% higher than current value
        ticks: {
          callback: function(value) {
            if (value == null || value === undefined) return '';
            try {
              return '₹' + value.toLocaleString('en-IN', {
                maximumFractionDigits: 0
              });
            } catch (error) {
              logger.error('PortfolioDetail', 'Error formatting y-axis tick', error);
              return '₹' + value;
            }
          }
        }
      },
      x: {
        type: 'category', // Use category scale for string labels
        ticks: {
          maxTicksLimit: 10
        }
      }
    }
  };

  // Create holdings chart options with better scaling
  const holdingsChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        // Scale to make top holding use 90% of chart height
        suggestedMax: function(context) {
          if (context.chart && context.chart.data && context.chart.data.datasets && context.chart.data.datasets.length > 0) {
            const data = context.chart.data.datasets[0].data;
            const maxValue = Math.max(...data);
            return maxValue * 1.1; // 110% of max value
          }
          return null;
        }
      }
    }
  };

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
      },
    },
  };

  // Create chart options for the history chart
  const historyChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        // Scale to make highest value use 90% of chart height
        suggestedMax: function(context) {
          if (context.chart && context.chart.data && context.chart.data.datasets && context.chart.data.datasets.length > 0) {
            const data = context.chart.data.datasets[0].data;
            const maxValue = Math.max(...data);
            return maxValue * 1.1; // 110% of max value
          }
          return null;
        }
      },
      x: {
        type: 'category'
      }
    }
  };

  // Helper function to safely render holdings
  const getSafeHoldings = () => {
    if (!safePortfolio.holdings || !Array.isArray(safePortfolio.holdings)) {
      return [];
    }
    
    return safePortfolio.holdings
      .filter(holding => holding && (typeof holding.currentValue === 'number' || holding.fullyExited))
      .sort((a, b) => {
        // Sort by fully exited first (exited holdings at bottom)
        if (a.fullyExited && !b.fullyExited) return 1;
        if (!a.fullyExited && b.fullyExited) return -1;
        
        // Then sort by market value (for active holdings) or realized PL (for exited holdings)
        const aValue = a.fullyExited ? a.realizedPL || 0 : a.currentValue || 0;
        const bValue = b.fullyExited ? b.realizedPL || 0 : b.currentValue || 0;
        return bValue - aValue;
      });
  };

  // Helper function to safely render transactions
  const getSafeTransactions = () => {
    if (!safePortfolio.transactions || !Array.isArray(safePortfolio.transactions)) {
      return [];
    }
    
    return safePortfolio.transactions
      .filter(transaction => transaction && transaction.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  // Helper function to safely render history
  const getSafeHistory = () => {
    if (!safePortfolio.history || !Array.isArray(safePortfolio.history)) {
      return [];
    }
    
    return safePortfolio.history
      .filter(entry => entry && entry.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  // Handle time range change
  const handleTimeRangeChange = (range) => {
    logger.info('PortfolioDetail', `Time range changed from ${timeRange} to ${range}`);
    setTimeRange(range);
  };

  // Calculate some performance metrics based on the performance data
  const calculatePerformanceMetrics = () => {
    if (!performanceData || !Array.isArray(performanceData) || performanceData.length === 0) {
      return {
        currentValue: safePortfolio.totalValue,
        investedValue: safePortfolio.investedValue,
        absoluteReturn: safePortfolio.totalGainLoss,
        percentReturn: safePortfolio.totalGainLossPercentage
      };
    }
    
    const currentValue = performanceData[performanceData.length - 1].value;
    const investedValue = performanceData[0].value;
    const absoluteReturn = currentValue - investedValue;
    const percentReturn = investedValue > 0 ? (absoluteReturn / investedValue) * 100 : 0;
    
    return {
      currentValue,
      investedValue,
      absoluteReturn,
      percentReturn
    };
  };
  
  const metrics = calculatePerformanceMetrics();

  // Update real-time prices for portfolio holdings
  const refreshPrices = async () => {
    if (!portfolio || !portfolio.holdings || portfolio.holdings.length === 0) {
      logger.warn('PortfolioDetail', 'No portfolio or holdings to refresh');
      return;
    }
    
    logger.info('PortfolioDetail', 'Refreshing current prices');
    setIsLoadingHistoricalData(true);
    
    try {
      if (portfolio.broker === 'ICICI' && breezeService.isReady()) {
        logger.info('PortfolioDetail', 'Using Breeze API for current prices');
        
        // Get all stock symbols
        const symbols = portfolio.holdings && Array.isArray(portfolio.holdings) ? portfolio.holdings.map(holding => holding.symbol) : [];
        
        // Fetch current prices
        const prices = await breezeService.batchGetCurrentPrices(symbols);
        
        logger.debug('PortfolioDetail', 'Current prices fetched', prices);
        
        // Update portfolio context with new prices
        // This would need to be implemented in PortfolioContext
        if (typeof updateHoldingPrices === 'function') {
          updateHoldingPrices(portfolio.id, prices);
          logger.info('PortfolioDetail', 'Portfolio prices updated successfully');
        } else {
          logger.warn('PortfolioDetail', 'updateHoldingPrices function not available');
        }
      }
      
      // Refresh performance data with new prices
      loadHistoricalPrices(timeRange);
    } catch (error) {
      logger.error('PortfolioDetail', 'Error refreshing prices', error);
      setHistoricalPriceError(`Failed to refresh prices: ${error.message}`);
    } finally {
      setIsLoadingHistoricalData(false);
    }
  };

  // Add broker badge to portfolio header
  const renderBrokerBadge = () => {
    if (portfolio.broker && portfolio.broker !== 'generic') {
      return (
        <Badge 
          bg={portfolio.broker === 'ICICI' ? 'primary' : 'secondary'} 
          className="ms-2"
        >
          {portfolio.broker === 'ICICI' ? 'ICICI Direct' : portfolio.broker}
        </Badge>
      );
    }
    return null;
  };

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>
          {safePortfolio.name} {renderBrokerBadge()}
        </h1>
        <div>
          <Button 
            variant="outline-secondary" 
            size="sm" 
            className="me-2"
            onClick={refreshPrices}
            disabled={isLoadingHistoricalData}
          >
            {isLoadingHistoricalData ? (
              <Spinner animation="border" size="sm" />
            ) : (
              'Refresh Prices'
            )}
          </Button>
          <Button 
            variant="outline-primary" 
            size="sm" 
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
      
      {historicalPriceError && (
        <Alert variant="warning" className="mb-4">
          {historicalPriceError}
        </Alert>
      )}
      
      <Tabs
        activeKey={selectedTab}
        onSelect={(k) => {
          logger.info('PortfolioDetail', `Tab changed from ${selectedTab} to ${k}`);
          setSelectedTab(k);
        }}
        className="mb-4"
      >
        <Tab eventKey="overview" title="Overview">
          <Row>
            <Col lg={8}>
              <Card className="shadow-sm mb-4">
                <Card.Body>
                  <Card.Title className="d-flex justify-content-between">
                    <span>Portfolio Performance</span>
                    <div className="btn-group btn-group-sm">
                      {['1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL'].map(range => (
                        <Button
                          key={range}
                          variant={timeRange === range ? 'primary' : 'outline-secondary'}
                          onClick={() => {
                            logger.info('PortfolioDetail', `Time range changed from ${timeRange} to ${range}`);
                            handleTimeRangeChange(range);
                          }}
                          size="sm"
                        >
                          {range}
                        </Button>
                      ))}
                    </div>
                  </Card.Title>
                  
                  {isLoadingHistoricalData ? (
                    <div className="text-center py-5">
                      <Spinner animation="border" role="status">
                        <span className="visually-hidden">Loading performance data...</span>
                      </Spinner>
                    </div>
                  ) : performanceChartData ? (
                    <div style={{ height: '300px', maxHeight: '300px' }}>
                      <Line
                        data={performanceChartData}
                        options={chartOptions}
                        height={300}
                        ref={lineChartRef}
                        key={`line-${selectedTab}-${timeRange}`}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-muted">Could not prepare chart data.</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
            
            <Col md={4}>
              <Card className="h-100">
                <Card.Body>
                  <Card.Title>Portfolio Summary</Card.Title>
                  <div className="d-flex flex-column">
                    <div className="d-flex justify-content-between mb-2">
                      <span>Total Market Value:</span>
                      <span className="fw-bold">₹{safePortfolio.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Total Invested:</span>
                      <span className="fw-bold">₹{safePortfolio.investedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Total Gain/Loss:</span>
                      <span className={`fw-bold ${safePortfolio.totalGainLoss >= 0 ? 'text-success' : 'text-danger'}`}>
                        ₹{safePortfolio.totalGainLoss.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        {' '}
                        ({safePortfolio.totalGainLossPercentage.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>XIRR:</span>
                      <span className={`fw-bold ${portfolioXirr >= 0 ? 'text-success' : 'text-danger'}`}>
                        {isCalculatingXirr ? (
                          <Spinner animation="border" size="sm" />
                        ) : xirrError ? (
                          <span title={xirrError} className="text-warning">Error calculating</span>
                        ) : (
                          formatXirr(portfolioXirr)
                        )}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Number of Holdings:</span>
                      <span className="fw-bold">{safePortfolio.holdings && Array.isArray(safePortfolio.holdings) ? safePortfolio.holdings.length : 0}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Last Updated:</span>
                      <span className="fw-bold">{new Date(safePortfolio.lastUpdated).toLocaleDateString()}</span>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
          
          <Row>
            <Col md={6} className="mb-4">
              <Card>
                <Card.Body>
                  <Card.Title>Sector Allocation</Card.Title>
                  {sectorAllocationData ? (
                    <div style={{ height: '300px', maxHeight: '300px' }}>
                      <Pie 
                        data={sectorAllocationData} 
                        options={pieChartOptions} 
                        ref={pieChartRef}
                        key={`pie-${selectedTab}`}
                      />
                    </div>
                  ) : (
                    <Alert variant="info">
                      No sector allocation data available.
                    </Alert>
                  )}
                </Card.Body>
              </Card>
            </Col>
            
            <Col md={6} className="mb-4">
              <Card>
                <Card.Body>
                  <Card.Title>Top Holdings</Card.Title>
                  {holdingsChartData ? (
                    <div style={{ height: '300px', maxHeight: '300px' }}>
                      <Bar 
                        data={holdingsChartData} 
                        options={holdingsChartOptions}
                        ref={barChartRef}
                        key={`bar-${selectedTab}`}
                      />
                    </div>
                  ) : (
                    <Alert variant="info">
                      No holdings data available.
                    </Alert>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
          
          <Row>
            <Col md={12} className="mb-4">
              <Card>
                <Card.Body>
                  <Card.Title>Top 5 Holdings (by Market Value)</Card.Title>
                  <div className="table-responsive">
                    <Table striped hover>
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Company</th>
                          <th>Quantity</th>
                          <th>Avg. Cost</th>
                          <th>Current Price</th>
                          <th>Market Value</th>
                          <th>Gain/Loss</th>
                          <th>Gain/Loss %</th>
                          <th>Realized P/L</th>
                          <th>Total P/L</th>
                          <th>XIRR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSafeHoldings()
                          .slice(0, 5)
                          .map((holding, index) => (
                            <tr key={index} className={holding.fullyExited ? 'table-secondary' : ''}>
                              <td>{holding.symbol || 'Unknown'}</td>
                              <td>{holding.companyName || holding.symbol || 'Unknown'}</td>
                              <td>{holding.quantity || 0}{holding.fullyExited && ' (Sold)'}</td>
                              <td>₹{(holding.avgCostPrice || 0).toFixed(2)}</td>
                              <td>₹{(holding.currentPrice || 0).toFixed(2)}</td>
                              <td>₹{(holding.currentValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                              <td className={(holding.unrealizedPL || 0) >= 0 ? 'text-success' : 'text-danger'}>
                                ₹{(holding.unrealizedPL || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                              <td className={(holding.unrealizedPLPercent || 0) >= 0 ? 'text-success' : 'text-danger'}>
                                {(holding.unrealizedPLPercent || 0).toFixed(2)}%
                              </td>
                              <td className={(holding.realizedPL || 0) >= 0 ? 'text-success' : 'text-danger'}>
                                ₹{(holding.realizedPL || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                              <td className={(holding.totalPL || 0) >= 0 ? 'text-success' : 'text-danger'}>
                                ₹{(holding.totalPL || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                {' '}
                                ({(holding.totalPLPercent || 0).toFixed(2)}%)
                              </td>
                              <td className={securitiesXirr[holding.symbol] >= 0 ? 'text-success' : 'text-danger'}>
                                {isCalculatingXirr ? (
                                  <Spinner animation="border" size="sm" />
                                ) : (
                                  formatXirr(securitiesXirr[holding.symbol])
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </Table>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>
        <Tab eventKey="holdings" title="Holdings">
          <Card>
            <Card.Body>
              <Card.Title>All Holdings</Card.Title>
              <div className="table-responsive">
                <Table striped hover>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Company</th>
                      <th>Quantity</th>
                      <th>Avg. Cost</th>
                      <th>Current Price</th>
                      <th>Cost Basis</th>
                      <th>Market Value</th>
                      <th>Gain/Loss</th>
                      <th>Gain/Loss %</th>
                      <th>Realized P/L</th>
                      <th>Total P/L</th>
                      <th>XIRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSafeHoldings()
                      .map((holding, index) => (
                        <tr key={index} className={holding.fullyExited ? 'table-secondary' : ''}>
                          <td>{holding.symbol || 'Unknown'}</td>
                          <td>{holding.companyName || holding.symbol || 'Unknown'}</td>
                          <td>{holding.quantity || 0}{holding.fullyExited && ' (Sold)'}</td>
                          <td>₹{(holding.avgCostPrice || 0).toFixed(2)}</td>
                          <td>₹{(holding.currentPrice || 0).toFixed(2)}</td>
                          <td>₹{(holding.costBasis || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td>₹{(holding.currentValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className={(holding.unrealizedPL || 0) >= 0 ? 'text-success' : 'text-danger'}>
                            ₹{(holding.unrealizedPL || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className={(holding.unrealizedPLPercent || 0) >= 0 ? 'text-success' : 'text-danger'}>
                            {(holding.unrealizedPLPercent || 0).toFixed(2)}%
                          </td>
                          <td className={(holding.realizedPL || 0) >= 0 ? 'text-success' : 'text-danger'}>
                            ₹{(holding.realizedPL || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className={(holding.totalPL || 0) >= 0 ? 'text-success' : 'text-danger'}>
                            ₹{(holding.totalPL || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            {' '}
                            ({(holding.totalPLPercent || 0).toFixed(2)}%)
                          </td>
                          <td className={securitiesXirr[holding.symbol] >= 0 ? 'text-success' : 'text-danger'}>
                            {isCalculatingXirr ? (
                              <Spinner animation="border" size="sm" />
                            ) : (
                              formatXirr(securitiesXirr[holding.symbol])
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Tab>
        <Tab eventKey="transactions" title="Transactions">
          <Card>
            <Card.Body>
              <Card.Title>Transaction History</Card.Title>
              <div className="table-responsive">
                <Table striped hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Symbol</th>
                      <th>Company</th>
                      <th>Action</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSafeTransactions()
                      .map((transaction, index) => (
                        <tr key={index}>
                          <td>{new Date(transaction.date).toLocaleDateString()}</td>
                          <td>{transaction.symbol || 'Unknown'}</td>
                          <td>{transaction.companyName || transaction.symbol || 'Unknown'}</td>
                          <td>
                            <Badge bg={(transaction.action || '').toUpperCase() === 'BUY' ? 'success' : 'danger'}>
                              {(transaction.action || 'Unknown').toUpperCase()}
                            </Badge>
                          </td>
                          <td>{transaction.quantity || 0}</td>
                          <td>₹{(transaction.price || 0).toFixed(2)}</td>
                          <td>₹{((transaction.quantity || 0) * (transaction.price || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Tab>
        <Tab eventKey="history" title="History">
          <Row>
            <Col md={6} className="mb-4">
              <Card>
                <Card.Body>
                  <Card.Title>Transaction Types</Card.Title>
                  {historyChartData ? (
                    <div style={{ height: '300px', maxHeight: '300px' }}>
                      <Bar 
                        data={historyChartData} 
                        options={historyChartOptions}
                        ref={historyChartRef}
                        key={`history-${selectedTab}`}
                      />
                    </div>
                  ) : (
                    <Alert variant="info">
                      No transaction history data available.
                    </Alert>
                  )}
                </Card.Body>
              </Card>
            </Col>
            
            <Col md={6} className="mb-4">
              <Card>
                <Card.Body>
                  <Card.Title>Portfolio Update History</Card.Title>
                  <div className="table-responsive">
                    <Table striped hover>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Action</th>
                          <th>Market Value</th>
                          <th>Invested Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSafeHistory()
                          .map((entry, index) => (
                            <tr key={index}>
                              <td>{new Date(entry.date).toLocaleDateString()}</td>
                              <td>{entry.action || 'Update'}</td>
                              <td>₹{(entry.totalValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                              <td>₹{(entry.investedValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                      </tbody>
                    </Table>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>
      </Tabs>
    </Container>
  );
};

export default PortfolioDetail; 