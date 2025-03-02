import React, { useState, useEffect, useContext } from 'react';
import { Container, Row, Col, Card, Table, Badge, Alert, Spinner, Nav, Tab, ButtonGroup, Button, Tabs } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { Line, Pie, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement } from 'chart.js';
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
  }, [portfolio, timeRange]);

  // Function to load historical prices based on time range
  const loadHistoricalPrices = async (range) => {
    if (!portfolio || !portfolio.holdings || portfolio.holdings.length === 0) {
      logger.warn('PortfolioDetail', 'No portfolio or holdings available');
      return;
    }
    
    logger.info('PortfolioDetail', `Loading historical prices for time range: ${range}`);
    setIsLoadingHistoricalData(true);
    setHistoricalPriceError('');
    
    try {
      const { startDate, endDate } = getDateRangeForTimeRange(range);
      
      logger.debug('PortfolioDetail', 'Date range calculated', { startDate, endDate });
      
      // If using ICICI Direct, use real historical prices
      if (portfolio.broker === 'ICICI' && breezeService.isReady()) {
        logger.info('PortfolioDetail', 'Using Breeze API for historical prices');
        
        // Get historical prices for each stock in the portfolio
        const historicalPricesMap = {};
        
        for (const holding of portfolio.holdings) {
          try {
            logger.debug('PortfolioDetail', `Fetching historical prices for ${holding.symbol}`);
            const prices = await breezeService.getHistoricalPrices(
              holding.symbol, 
              startDate.toISOString().split('T')[0], 
              endDate.toISOString().split('T')[0]
            );
            historicalPricesMap[holding.symbol] = prices;
          } catch (error) {
            logger.error('PortfolioDetail', `Error fetching historical prices for ${holding.symbol}`, error);
          }
        }
        
        // Calculate daily values based on real historical prices
        const dailyValues = calculateDailyPortfolioValuesWithHistoricalPrices(
          portfolio,
          historicalPricesMap,
          startDate,
          endDate
        );
        
        logger.info('PortfolioDetail', `Generated ${dailyValues.length} daily performance data points`);
        setPerformanceData(dailyValues);
      } else {
        // Fall back to simulated historical prices
        logger.info('PortfolioDetail', 'Using simulated historical prices');
        const dailyValues = calculateDailyPortfolioValues(portfolio, startDate, endDate);
        setPerformanceData(dailyValues);
      }
    } catch (error) {
      logger.error('PortfolioDetail', 'Error loading historical prices', error);
      setHistoricalPriceError(`Failed to load historical prices: ${error.message}`);
    } finally {
      setIsLoadingHistoricalData(false);
    }
  };

  // Calculate portfolio values using historical price data from Breeze
  const calculateDailyPortfolioValuesWithHistoricalPrices = (portfolio, historicalPricesMap, startDate, endDate) => {
    logger.debug('PortfolioDetail', 'Calculating daily portfolio values with historical prices');
    
    const dailyValues = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Calculate portfolio value for this date
      let portfolioValue = 0;
      
      for (const holding of portfolio.holdings) {
        // Get historical price for this stock on this date
        const historicalPrices = historicalPricesMap[holding.symbol] || {};
        const price = historicalPrices[dateStr];
        
        if (price) {
          portfolioValue += holding.quantity * price;
        } else {
          // If no price available for this date, use the most recent price
          const availableDates = Object.keys(historicalPrices || {})
            .filter(date => date <= dateStr)
            .sort();
          
          const mostRecentDate = availableDates[availableDates.length - 1];
          const mostRecentPrice = mostRecentDate ? historicalPrices[mostRecentDate] : null;
          
          if (mostRecentPrice) {
            portfolioValue += holding.quantity * mostRecentPrice;
          } else {
            // Fallback to current price if no historical price available
            portfolioValue += holding.quantity * (holding.currentPrice || holding.avgCostPrice);
          }
        }
      }
      
      // Add data point
      dailyValues.push({
        date: dateStr,
        value: portfolioValue
      });
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dailyValues;
  };

  // Get start and end dates based on time range
  const getDateRangeForTimeRange = (range) => {
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
  };

  // Calculate daily portfolio values using historical prices
  const calculateDailyPortfolioValues = async (historicalPriceData, startDate, endDate) => {
    if (!portfolio || !portfolio.transactions || portfolio.transactions.length === 0) {
      return;
    }
    
    const priceData = historicalPriceData || historicalPrices;
    
    // Sort transactions by date (oldest first)
    const sortedTransactions = [...portfolio.transactions]
      .filter(t => t && t.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (sortedTransactions.length === 0) return;
    
    const dates = [];
    const marketValues = [];
    const investedValues = [];
    
    // Loop through each day in the range
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dates.push(dateStr);
      
      try {
        // Use the portfolio context function to calculate portfolio value on this date
        const { portfolioValue, investedValue } = await calculatePortfolioValueOnDate(dateStr, sortedTransactions);
        
        marketValues.push(portfolioValue);
        investedValues.push(investedValue);
      } catch (error) {
        console.error(`Error calculating portfolio value for ${dateStr}:`, error);
        // If there's an error, push the last known values or zeros
        marketValues.push(marketValues.length > 0 ? marketValues[marketValues.length - 1] : 0);
        investedValues.push(investedValues.length > 0 ? investedValues[investedValues.length - 1] : 0);
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Format dates for display
    const formattedDates = dates.map(date => {
      const d = new Date(date);
      return d.toLocaleDateString();
    });
    
    setPerformanceData({
      labels: formattedDates,
      marketValues: marketValues,
      investedValues: investedValues
    });
  };

  // Function to calculate XIRR values for portfolio and securities
  const calculateXirrValues = () => {
    if (!portfolio || !portfolio.transactions || !portfolio.holdings) {
      logger.warn('PortfolioDetail', 'Cannot calculate XIRR: missing portfolio data');
      return;
    }

    try {
      setIsCalculatingXirr(true);
      setXirrError('');

      logger.info('PortfolioDetail', 'Calculating XIRR values');
      
      // Prepare transactions for XIRR calculation
      const transactions = portfolio.transactions.map(tx => ({
        amount: tx.transactionType === 'BUY' ? -tx.price * tx.quantity : tx.price * tx.quantity,
        date: new Date(tx.transactionDate),
        symbol: tx.symbol
      }));

      // Prepare current holdings for XIRR calculation
      const currentHoldings = portfolio.holdings.map(holding => ({
        symbol: holding.symbol,
        currentValue: holding.currentValue || (holding.currentPrice * holding.quantity)
      }));

      // Calculate XIRR values
      const xirrResults = xirrService.calculatePortfolioXirr(transactions, currentHoldings);
      
      setPortfolioXirr(xirrResults.portfolioXirr);
      setSecuritiesXirr(xirrResults.securitiesXirr);
      
      logger.info('PortfolioDetail', 'XIRR calculation completed', {
        portfolioXirr: xirrResults.portfolioXirr,
        securitiesCount: Object.keys(xirrResults.securitiesXirr).length
      });
    } catch (error) {
      logger.error('PortfolioDetail', 'Error calculating XIRR', error);
      setXirrError(`Failed to calculate XIRR: ${error.message}`);
    } finally {
      setIsCalculatingXirr(false);
    }
  };

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
      return null;
    }

    return {
      labels: performanceData.map(dataPoint => dataPoint.date),
      datasets: [
        {
          label: 'Portfolio Value',
          data: performanceData.map(dataPoint => dataPoint.value),
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1,
          fill: true
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
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += '₹' + context.parsed.y.toLocaleString('en-IN', { maximumFractionDigits: 2 });
            }
            return label;
          }
        }
      }
    },
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

  // Helper function to safely render holdings
  const getSafeHoldings = () => {
    if (!safePortfolio.holdings || !Array.isArray(safePortfolio.holdings)) {
      return [];
    }
    
    return safePortfolio.holdings
      .filter(holding => holding && typeof holding.currentValue === 'number')
      .sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
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
    logger.info('PortfolioDetail', `Time range changed to: ${range}`);
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
        onSelect={(k) => setSelectedTab(k)}
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
                          onClick={() => handleTimeRangeChange(range)}
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
                  ) : performanceData && Array.isArray(performanceData) && performanceData.length > 0 ? (
                    <Line
                      data={{
                        labels: performanceData.map(dataPoint => dataPoint.date),
                        datasets: [
                          {
                            label: 'Portfolio Value',
                            data: performanceData.map(dataPoint => dataPoint.value),
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            tension: 0.1,
                            fill: true
                          }
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            display: false
                          },
                          tooltip: {
                            callbacks: {
                              label: function(context) {
                                return `Value: $${context.raw.toFixed(2)}`;
                              }
                            }
                          }
                        },
                        scales: {
                          x: {
                            ticks: {
                              maxTicksLimit: 8
                            }
                          }
                        }
                      }}
                      height={300}
                    />
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-muted">No performance data available for the selected time range.</p>
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
                    <div style={{ height: '300px' }}>
                      <Pie data={sectorAllocationData} options={pieChartOptions} />
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
                    <div style={{ height: '300px' }}>
                      <Bar data={holdingsChartData} options={chartOptions} />
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
                          <th>XIRR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSafeHoldings()
                          .slice(0, 5)
                          .map((holding, index) => (
                            <tr key={index}>
                              <td>{holding.symbol || 'Unknown'}</td>
                              <td>{holding.companyName || holding.symbol || 'Unknown'}</td>
                              <td>{holding.quantity || 0}</td>
                              <td>₹{(holding.avgCostPrice || 0).toFixed(2)}</td>
                              <td>₹{(holding.currentPrice || 0).toFixed(2)}</td>
                              <td>₹{(holding.currentValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                              <td className={(holding.unrealizedPL || 0) >= 0 ? 'text-success' : 'text-danger'}>
                                ₹{(holding.unrealizedPL || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                              <td className={(holding.unrealizedPLPercent || 0) >= 0 ? 'text-success' : 'text-danger'}>
                                {(holding.unrealizedPLPercent || 0).toFixed(2)}%
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
                      <th>XIRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSafeHoldings()
                      .map((holding, index) => (
                        <tr key={index}>
                          <td>{holding.symbol || 'Unknown'}</td>
                          <td>{holding.companyName || holding.symbol || 'Unknown'}</td>
                          <td>{holding.quantity || 0}</td>
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
                    <div style={{ height: '300px' }}>
                      <Bar data={historyChartData} options={chartOptions} />
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