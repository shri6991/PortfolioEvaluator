import axios from 'axios';
import { BreezeConnect } from 'breezeconnect';
import logger from './LoggerService';

/**
 * BreezeService - Service for interacting with the ICICI Direct Breeze API
 * This service provides methods to initialize the connection, 
 * look up stock codes, retrieve historical price data, and download portfolio data
 */
class BreezeService {
  constructor() {
    logger.debug('BreezeService', 'Creating new BreezeService instance');
    
    // Initialize with empty values
    this.apiKey = null;
    this.apiSecret = null;
    this.sessionKey = null;
    this.breeze = null;
    this.isInitialized = false;
    this.stockMapping = {}; // Cache for ICICI stock code -> NSE ticker
    
    // Note: We no longer auto-initialize with stored credentials
    logger.info('BreezeService', 'Service created but not initialized');
  }

  /**
   * Initialize the BreezeConnect API with credentials
   * @param {string} apiKey - ICICI Direct API key
   * @param {string} apiSecret - ICICI Direct API secret
   * @param {string} sessionKey - ICICI Direct session key
   */
  initialize(apiKey, apiSecret, sessionKey) {
    logger.info('BreezeService', 'Initializing Breeze API client');
    
    // Validate credentials
    if (!apiKey || !apiSecret || !sessionKey) {
      logger.warn('BreezeService', 'Missing required credentials');
      this.isInitialized = false;
      throw new Error('Missing required credentials. Please provide API key, secret, and session key.');
    }

    try {
      // Store the credentials
      this.apiKey = apiKey;
      this.apiSecret = apiSecret;
      this.sessionKey = sessionKey;
      
      // Create a new BreezeConnect instance
      this.breeze = new BreezeConnect({
        apiKey: this.apiKey,
        debug: true // Enable debug mode for easier troubleshooting
      });
      
      // Set the session token
      this.breeze.setSessionToken({
        sessionToken: this.sessionKey
      });
      
      // Store credentials for later use
      this.saveCredentials({
        apiKey: this.apiKey,
        apiSecret: this.apiSecret,
        sessionKey: this.sessionKey
      });
      
      this.isInitialized = true;
      logger.info('BreezeService', 'Breeze API client initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('BreezeService', 'Error initializing Breeze API client', error);
      this.isInitialized = false;
      throw new Error(`Failed to initialize Breeze API client: ${error.message}`);
    }
  }
  
  /**
   * Test if the Breeze API connection is working
   * @returns {Promise<boolean>} - True if connection is successful
   */
  async testConnection() {
    try {
      if (!this.breeze) {
        logger.error('BreezeService', 'Breeze API client not initialized');
        throw new Error('Breeze API client not initialized');
      }
      
      // Try to get the customer details or profile to test the connection
      logger.debug('BreezeService', 'Testing Breeze API connection by fetching user profile');
      
      // Check available methods to determine the correct method to use
      const availableMethods = Object.keys(this.breeze)
        .filter(key => typeof this.breeze[key] === 'function')
        .join(', ');
      logger.debug('BreezeService', 'Available methods:', availableMethods);
      
      let profileMethod = null;
      if (typeof this.breeze.getCustomerDetails === 'function') {
        profileMethod = 'getCustomerDetails';
      } else if (typeof this.breeze.getUserProfile === 'function') {
        profileMethod = 'getUserProfile';
      } else if (typeof this.breeze.getProfile === 'function') {
        profileMethod = 'getProfile';
      }
      
      if (!profileMethod) {
        logger.warn('BreezeService', 'No profile method found to test connection');
        return false;
      }
      
      // Call the profile method to test the connection
      logger.debug('BreezeService', `Testing connection using ${profileMethod} method`);
      const result = await this.breeze[profileMethod]();
      
      if (result) {
        logger.info('BreezeService', 'Connection test successful', result);
        return true;
      } else {
        logger.warn('BreezeService', 'Empty response from profile API');
        return false;
      }
    } catch (error) {
      logger.error('BreezeService', 'Error testing Breeze API connection', error);
      throw new Error(`Failed to connect to ICICI Direct: ${error.message}`);
    }
  }

  /**
   * Get a session key for the Breeze API
   * @param {string} apiKey - The Breeze API key
   * @param {string} apiSecret - The Breeze API secret
   * @returns {Promise<string>} - The session key
   */
  async getSessionKey(apiKey, apiSecret) {
    logger.info('BreezeService', 'Attempting to generate session key directly');
    
    try {
      // We'll make a direct API call to the Breeze API to get a session key
      const response = await fetch('https://api.icicidirect.com/apiuser/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': apiKey
        },
        body: JSON.stringify({
          api_secret: apiSecret
        })
      });
      
      if (!response.ok) {
        // If the request failed, parse the error message if possible
        let errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          errorText = errorJson.message || errorJson.error || errorText;
        } catch (e) {
          // If parsing fails, use the raw text
        }
        
        throw new Error(`Failed to get session key: ${response.status} ${errorText}`);
      }
      
      // Parse the response to get the session key
      const data = await response.json();
      
      // The response should contain a session key field
      if (!data.session_token) {
        throw new Error('Session key not found in API response');
      }
      
      logger.info('BreezeService', 'Successfully generated session key');
      return data.session_token;
    } catch (error) {
      logger.error('BreezeService', 'Error getting session key', error);
      
      // For development purposes, we'll provide a fallback method with a manual token
      if (process.env.NODE_ENV === 'development') {
        logger.warn('BreezeService', 'Falling back to manual session key input method');
        
        // In development, allow using a manually entered session key
        const manualKey = localStorage.getItem('breeze_manual_session_key');
        if (manualKey) {
          logger.info('BreezeService', 'Using manually entered session key from localStorage');
          return manualKey;
        }
        
        // If no manual key exists, explain the error and suggest a solution
        throw new Error(`Failed to generate session key: ${error.message}. In development mode, you can set a manual key using localStorage.setItem('breeze_manual_session_key', 'YOUR_KEY')`);
      }
      
      // In production, just throw the error
      throw new Error(`Failed to get session key: ${error.message}`);
    }
  }

  /**
   * Check if the API is ready to use
   * @returns {boolean} - Whether the API is ready
   */
  isReady() {
    if (!this.isInitialized) {
      logger.warn('BreezeService', 'Breeze API not initialized');
      return false;
    }
    
    if (!this.breeze) {
      logger.warn('BreezeService', 'Breeze API client not created');
      return false;
    }
    
    if (!this.sessionKey) {
      logger.warn('BreezeService', 'Breeze API session key not available');
      return false;
    }
    
    return true;
  }

  /**
   * Get credentials from local storage or environment
   * @returns {Object} - The stored credentials or empty object
   */
  getStoredCredentials() {
    try {
      const storedCreds = localStorage.getItem('breezeCredentials');
      logger.debug('BreezeService', 'Retrieved stored credentials', 
        storedCreds ? 'Credentials found' : 'No credentials found');
      return storedCreds ? JSON.parse(storedCreds) : {};
    } catch (error) {
      logger.error('BreezeService', 'Error retrieving stored credentials', error);
      return {};
    }
  }

  /**
   * Save credentials to local storage
   * @param {Object} credentials - The credentials to store
   */
  saveCredentials(credentials) {
    try {
      logger.debug('BreezeService', 'Saving credentials to local storage');
      localStorage.setItem('breezeCredentials', JSON.stringify({
        apiKey: credentials.apiKey,
        apiSecret: credentials.apiSecret,
        sessionKey: credentials.sessionKey,
        // Don't store API secret for security reasons
      }));
      logger.info('BreezeService', 'Credentials saved successfully');
    } catch (error) {
      logger.error('BreezeService', 'Error saving credentials', error);
    }
  }

  /**
   * Clear stored credentials
   */
  clearCredentials() {
    try {
      logger.info('BreezeService', 'Clearing stored credentials');
      localStorage.removeItem('breezeCredentials');
      this.isInitialized = false;
      this.breeze = null;
      this.apiKey = null;
      this.apiSecret = null;
      this.sessionKey = null;
      logger.info('BreezeService', 'Credentials cleared and service reset');
    } catch (error) {
      logger.error('BreezeService', 'Error clearing credentials', error);
    }
  }

  /**
   * Look up an ICICI Direct stock code and convert to NSE ticker
   * @param {string} stockCode - The ICICI Direct stock code
   * @returns {Promise<string>} - The corresponding NSE ticker
   */
  async lookupStock(stockCode) {
    if (!this.isReady()) {
      throw new Error('Breeze API not initialized');
    }

    logger.debug('BreezeService', `Looking up stock: ${stockCode}`);

    // Check cache first
    if (this.stockMapping[stockCode]) {
      logger.debug('BreezeService', `Cache hit for stock: ${stockCode} -> ${this.stockMapping[stockCode]}`);
      return this.stockMapping[stockCode];
    }

    try {
      // Get full stock details from Breeze API
      const stockInfo = await this.breeze.getQuote({
        stockCode: stockCode,
        exchangeCode: 'NSE',
      });
      
      logger.debug('BreezeService', `Stock lookup result`, stockInfo);
      
      // Extract NSE ticker
      const nseTicker = `${stockCode}.NS`;
      
      // Cache the mapping
      this.stockMapping[stockCode] = nseTicker;
      logger.info('BreezeService', `Stock lookup successful: ${stockCode} -> ${nseTicker}`);
      
      return nseTicker;
    } catch (error) {
      logger.error('BreezeService', `Error looking up stock ${stockCode}`, error);
      // Default to appending .NS as a fallback
      const fallbackTicker = `${stockCode}.NS`;
      this.stockMapping[stockCode] = fallbackTicker;
      logger.warn('BreezeService', `Using fallback ticker: ${fallbackTicker}`);
      return fallbackTicker;
    }
  }

  /**
   * Batch lookup multiple stock codes
   * @param {string[]} stockCodes - Array of ICICI Direct stock codes
   * @returns {Promise<Object>} - Map of stock codes to NSE tickers
   */
  async batchLookupStocks(stockCodes) {
    if (!this.isReady()) {
      throw new Error('Breeze API not initialized');
    }

    logger.info('BreezeService', `Batch lookup for ${stockCodes.length} stocks`);
    logger.debug('BreezeService', 'Stock codes in batch:', stockCodes);
    
    const results = {};
    
    // Process in batches to avoid rate limiting
    for (const code of stockCodes) {
      try {
        results[code] = await this.lookupStock(code);
      } catch (error) {
        logger.error('BreezeService', `Error in batch lookup for ${code}`, error);
        results[code] = `${code}.NS`; // Default fallback
      }
    }
    
    logger.debug('BreezeService', 'Batch lookup results:', results);
    return results;
  }

  /**
   * Get historical price data for a stock on a specific date
   * @param {string} stockCode - The ICICI Direct stock code
   * @param {string} date - The date in YYYY-MM-DD format
   * @returns {Promise<number>} - The closing price for that date
   */
  async getHistoricalPrice(stockCode, date) {
    if (!this.isReady()) {
      throw new Error('Breeze API not initialized');
    }
    
    logger.debug('BreezeService', `Getting historical price for ${stockCode} on ${date}`);
    
    try {
      // Format dates for the API request
      const fromDate = new Date(date);
      fromDate.setHours(0, 0, 0, 0);
      
      const toDate = new Date(date);
      toDate.setHours(23, 59, 59, 999);
      
      // Call Breeze API to get historical data
      const histData = await this.breeze.getHistoricalDataV2({
        interval: "1day",
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        stockCode: stockCode,
        exchangeCode: "NSE"
      });
      
      logger.debug('BreezeService', `Historical data response for ${stockCode}`, histData);
      
      if (!histData || !histData.success || !histData.data || histData.data.length === 0) {
        throw new Error(`No historical data available for ${stockCode} on ${date}`);
      }
      
      // Extract closing price from the response
      const closePrice = parseFloat(histData.data[0].close);
      
      logger.info('BreezeService', `Historical price for ${stockCode} on ${date}: ${closePrice}`);
      return closePrice;
    } catch (error) {
      logger.error('BreezeService', `Error getting historical price for ${stockCode} on ${date}`, error);
      
      // Fallback to Yahoo Finance API if Breeze fails
      try {
        logger.info('BreezeService', `Attempting fallback to Yahoo Finance for ${stockCode}`);
        const nseTicker = await this.lookupStock(stockCode);
        const yahooResponse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${nseTicker}?interval=1d&range=1d&period1=${Math.floor(new Date(date).getTime() / 1000)}&period2=${Math.floor(new Date(date).getTime() / 1000) + 86400}`);
        
        if (yahooResponse.data && yahooResponse.data.chart && yahooResponse.data.chart.result && yahooResponse.data.chart.result[0].indicators.quote[0].close) {
          const closePrice = yahooResponse.data.chart.result[0].indicators.quote[0].close[0];
          logger.info('BreezeService', `Yahoo Finance fallback successful: ${closePrice}`);
          return closePrice;
        }
        throw new Error('Yahoo Finance fallback failed');
      } catch (fallbackError) {
        logger.error('BreezeService', 'Fallback to Yahoo Finance failed', fallbackError);
        throw new Error(`Failed to get historical price: ${error.message}`);
      }
    }
  }

  /**
   * Get historical prices for a stock over a date range
   * @param {string} stockCode - The ICICI Direct stock code
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Map of dates to prices
   */
  async getHistoricalPrices(stockCode, startDate, endDate) {
    if (!this.isReady()) {
      throw new Error('Breeze API not initialized');
    }
    
    logger.info('BreezeService', `Getting historical prices for ${stockCode} from ${startDate} to ${endDate}`);
    
    try {
      // Format dates for the API request
      const fromDate = new Date(startDate);
      fromDate.setHours(0, 0, 0, 0);
      
      const toDate = new Date(endDate);
      toDate.setHours(23, 59, 59, 999);
      
      // Call Breeze API to get historical data
      const histData = await this.breeze.getHistoricalDataV2({
        interval: "1day",
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        stockCode: stockCode,
        exchangeCode: "NSE"
      });
      
      logger.debug('BreezeService', `Historical data response for ${stockCode}`, histData);
      
      if (!histData || !histData.success || !histData.data || histData.data.length === 0) {
        throw new Error(`No historical data available for ${stockCode} in the specified date range`);
      }
      
      // Extract prices from the response
      const prices = {};
      histData.data.forEach(candle => {
        const dateStr = new Date(candle.datetime).toISOString().split('T')[0];
        prices[dateStr] = parseFloat(candle.close);
      });
      
      logger.info('BreezeService', `Retrieved ${Object.keys(prices).length} days of historical prices for ${stockCode}`);
      logger.debug('BreezeService', 'Price data:', prices);
      
      return prices;
    } catch (error) {
      logger.error('BreezeService', `Error getting historical prices for ${stockCode}`, error);
      
      // Fallback to individual day lookups
      logger.info('BreezeService', 'Attempting fallback to individual day lookups');
      
      try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const prices = {};
        
        // Generate days in the range
        const days = [];
        const currentDate = new Date(start);
        
        while (currentDate <= end) {
          const dateStr = currentDate.toISOString().split('T')[0];
          days.push(dateStr);
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        logger.debug('BreezeService', `Attempting to fetch prices for ${days.length} individual days`);
        
        // Get price for each day, with rate limiting
        for (const day of days) {
          try {
            prices[day] = await this.getHistoricalPrice(stockCode, day);
            // Add a small delay to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (dayError) {
            logger.warn('BreezeService', `Could not get price for ${stockCode} on ${day}`, dayError);
          }
        }
        
        if (Object.keys(prices).length === 0) {
          throw new Error('Failed to retrieve any historical prices');
        }
        
        logger.info('BreezeService', `Fallback successful, retrieved ${Object.keys(prices).length} days of data`);
        return prices;
      } catch (fallbackError) {
        logger.error('BreezeService', 'Fallback strategy failed', fallbackError);
        throw new Error(`Failed to get historical prices: ${error.message}`);
      }
    }
  }

  /**
   * Get real-time price for a stock
   * @param {string} stockCode - The ICICI Direct stock code
   * @returns {Promise<number>} - The current price
   */
  async getCurrentPrice(stockCode) {
    if (!this.isReady()) {
      throw new Error('Breeze API not initialized');
    }
    
    logger.debug('BreezeService', `Getting current price for ${stockCode}`);
    
    try {
      // Call Breeze API to get current quote
      const quote = await this.breeze.getQuote({
        stockCode: stockCode,
        exchangeCode: "NSE"
      });
      
      logger.debug('BreezeService', `Quote response:`, quote);
      
      if (!quote || !quote.success || !quote.data) {
        throw new Error(`Failed to get quote for ${stockCode}`);
      }
      
      // Extract last price from the response
      const price = parseFloat(quote.data.last);
      
      logger.info('BreezeService', `Current price for ${stockCode}: ${price}`);
      return price;
    } catch (error) {
      logger.error('BreezeService', `Error getting current price for ${stockCode}`, error);
      
      // Fallback to Yahoo Finance API
      try {
        logger.info('BreezeService', `Attempting fallback to Yahoo Finance for ${stockCode}`);
        const nseTicker = await this.lookupStock(stockCode);
        const yahooResponse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${nseTicker}?interval=1d&range=1d`);
        
        if (yahooResponse.data && yahooResponse.data.chart && yahooResponse.data.chart.result && yahooResponse.data.chart.result[0].meta) {
          const regularMarketPrice = yahooResponse.data.chart.result[0].meta.regularMarketPrice;
          logger.info('BreezeService', `Yahoo Finance fallback successful: ${regularMarketPrice}`);
          return regularMarketPrice;
        }
        throw new Error('Yahoo Finance fallback failed');
      } catch (fallbackError) {
        logger.error('BreezeService', 'Fallback to Yahoo Finance failed', fallbackError);
        throw new Error(`Failed to get current price: ${error.message}`);
      }
    }
  }

  /**
   * Batch get current prices for multiple stocks
   * @param {string[]} stockCodes - Array of ICICI Direct stock codes
   * @returns {Promise<Object>} - Map of stock codes to current prices
   */
  async batchGetCurrentPrices(stockCodes) {
    if (!this.isReady()) {
      throw new Error('Breeze API not initialized');
    }
    
    logger.info('BreezeService', `Batch fetching current prices for ${stockCodes.length} stocks`);
    logger.debug('BreezeService', 'Stock codes:', stockCodes);
    
    const results = {};
    const batchSize = 5; // Process in small batches to avoid rate limiting
    
    // Process in batches
    for (let i = 0; i < stockCodes.length; i += batchSize) {
      const batch = stockCodes.slice(i, i + batchSize);
      logger.debug('BreezeService', `Processing batch ${i/batchSize + 1}`, batch);
      
      await Promise.all(batch.map(async (code) => {
        try {
          results[code] = await this.getCurrentPrice(code);
        } catch (error) {
          logger.error('BreezeService', `Error getting price for ${code}`, error);
          results[code] = null; // Mark as failed
        }
      }));
      
      // Add a small delay between batches to prevent rate limiting
      if (i + batchSize < stockCodes.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Count successful retrievals
    const successCount = Object.values(results).filter(price => price !== null).length;
    logger.info('BreezeService', `Batch price fetch complete. Success: ${successCount}/${stockCodes.length}`);
    
    return results;
  }
  
  /**
   * Download portfolio holdings from ICICI Direct
   * @returns {Promise<Array>} - Array of portfolio holdings
   */
  async getPortfolioHoldings() {
    if (!this.isReady()) {
      throw new Error('Breeze API not initialized');
    }
    
    logger.info('BreezeService', 'Downloading portfolio holdings from ICICI Direct');
    
    try {
      // Check if the method exists
      if (typeof this.breeze.getPortfolioHoldings !== 'function') {
        logger.error('BreezeService', 'getPortfolioHoldings method not found on Breeze API instance');
        
        // Check for alternative method names
        const availableMethods = Object.keys(this.breeze)
          .filter(key => typeof this.breeze[key] === 'function')
          .join(', ');
        logger.debug('BreezeService', 'Available methods:', availableMethods);
        
        // Try alternate method name: getPortfolioPositions
        if (typeof this.breeze.getPortfolioPositions === 'function') {
          logger.info('BreezeService', 'Using getPortfolioPositions as fallback');
          return this.getPortfolioPositions();
        }
        
        throw new Error('Portfolio holdings method not found in Breeze API');
      }
      
      // Call Breeze API to get portfolio holdings
      logger.debug('BreezeService', 'Calling getPortfolioHoldings method');
      const portfolio = await this.breeze.getPortfolioHoldings();
      
      logger.debug('BreezeService', 'Portfolio holdings response:', portfolio);
      
      if (!portfolio) {
        throw new Error('Empty response from portfolio holdings API');
      }
      
      // Check the format of the response
      if (portfolio.Success === false) {
        throw new Error(`API Error: ${portfolio.Error || 'Unknown error'}`);
      }
      
      if (!portfolio.Holdings && !portfolio.Success) {
        // Try to handle different response formats
        if (Array.isArray(portfolio)) {
          logger.info('BreezeService', 'Portfolio returned as array instead of object');
          
          // Transform the holdings into a more usable format
          const holdings = portfolio.map(holding => ({
            symbol: holding.symbol || holding.Symbol || '',
            quantity: parseFloat(holding.quantity || holding.Quantity || 0),
            averagePrice: parseFloat(holding.averagePrice || holding.AveragePrice || 0),
            lastPrice: parseFloat(holding.lastPrice || holding.LastPrice || 0),
            valueAtCost: parseFloat(holding.valueAtCost || holding.BuyValue || 0),
            currentValue: parseFloat(holding.currentValue || holding.CurrentValue || 0),
            unrealizedPL: parseFloat(holding.unrealizedPL || holding.UnrealizedPL || 0),
            unrealizedPLPercent: parseFloat(holding.unrealizedPLPercent || holding.UnrealizedPLPercent || 0),
            industry: holding.industry || holding.Industry || 'Unknown',
            isin: holding.isin || holding.ISIN || '',
            exchange: holding.exchange || holding.Exchange || 'NSE'
          }));
          
          logger.info('BreezeService', `Successfully retrieved ${holdings.length} holdings`);
          return holdings;
        } else {
          logger.error('BreezeService', 'Unexpected portfolio response format:', portfolio);
          throw new Error('Invalid response format from portfolio holdings API');
        }
      }
      
      // Transform the holdings into a more usable format
      const holdings = portfolio.Holdings.map(holding => ({
        symbol: holding.Symbol,
        quantity: parseFloat(holding.Quantity),
        averagePrice: parseFloat(holding.AveragePrice),
        lastPrice: parseFloat(holding.LastPrice),
        valueAtCost: parseFloat(holding.BuyValue),
        currentValue: parseFloat(holding.CurrentValue),
        unrealizedPL: parseFloat(holding.UnrealizedPL),
        unrealizedPLPercent: parseFloat(holding.UnrealizedPLPercent),
        industry: holding.Industry || 'Unknown',
        isin: holding.ISIN || '',
        exchange: holding.Exchange || 'NSE'
      }));
      
      logger.info('BreezeService', `Successfully retrieved ${holdings.length} holdings`);
      
      return holdings;
    } catch (error) {
      logger.error('BreezeService', 'Error downloading portfolio holdings', error);
      throw new Error(`Failed to download portfolio holdings: ${error.message}`);
    }
  }
  
  /**
   * Try alternative portfolio positions method
   * @returns {Promise<Array>} - Array of portfolio positions
   */
  async getPortfolioPositions() {
    try {
      logger.info('BreezeService', 'Attempting to get portfolio via getPortfolioPositions');
      
      const positions = await this.breeze.getPortfolioPositions();
      logger.debug('BreezeService', 'Portfolio positions response:', positions);
      
      if (!positions) {
        throw new Error('Empty response from portfolio positions API');
      }
      
      // Transform positions into the same format as holdings
      const holdings = Array.isArray(positions) ? positions.map(pos => ({
        symbol: pos.symbol || pos.trading_symbol || '',
        quantity: parseFloat(pos.quantity || pos.net_quantity || 0),
        averagePrice: parseFloat(pos.average_price || pos.buy_avg_price || 0),
        lastPrice: parseFloat(pos.last_price || pos.ltp || 0),
        valueAtCost: parseFloat(pos.buy_value || (pos.quantity * pos.average_price) || 0),
        currentValue: parseFloat(pos.current_value || (pos.quantity * pos.last_price) || 0),
        unrealizedPL: parseFloat(pos.pnl || (pos.current_value - pos.buy_value) || 0),
        unrealizedPLPercent: parseFloat(pos.pnl_percent || 0),
        industry: pos.industry || 'Unknown',
        isin: pos.isin || '',
        exchange: pos.exchange || 'NSE'
      })) : [];
      
      logger.info('BreezeService', `Successfully retrieved ${holdings.length} positions`);
      return holdings;
    } catch (error) {
      logger.error('BreezeService', 'Error getting portfolio positions', error);
      throw new Error(`Failed to get portfolio positions: ${error.message}`);
    }
  }
  
  /**
   * Download transaction history from ICICI Direct
   * @param {string} fromDate - Start date in YYYY-MM-DD format
   * @param {string} toDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of transactions
   */
  async getTransactionHistory(fromDate, toDate) {
    if (!this.isReady()) {
      throw new Error('Breeze API not initialized');
    }
    
    logger.info('BreezeService', `Downloading transaction history from ${fromDate} to ${toDate}`);
    
    try {
      // Format dates for the API request
      const startDate = new Date(fromDate);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      
      // Check if the method exists
      if (typeof this.breeze.getTradeHistory !== 'function') {
        logger.error('BreezeService', 'getTradeHistory method not found on Breeze API instance');
        
        // Check for alternative method names
        const availableMethods = Object.keys(this.breeze)
          .filter(key => typeof this.breeze[key] === 'function')
          .join(', ');
        logger.debug('BreezeService', 'Available methods:', availableMethods);
        
        // Try alternate method name: getTradeList
        if (typeof this.breeze.getTradeList === 'function') {
          logger.info('BreezeService', 'Using getTradeList as fallback');
          return this.getTradeList(startDate, endDate);
        }
        
        throw new Error('Trade history method not found in Breeze API');
      }
      
      // Call Breeze API to get transaction history
      logger.debug('BreezeService', 'Calling getTradeHistory method with params', {
        fromDate: startDate.toISOString(),
        toDate: endDate.toISOString()
      });
      
      const history = await this.breeze.getTradeHistory({
        fromDate: startDate.toISOString(),
        toDate: endDate.toISOString(),
        segment: 'E' // Equity segment
      });
      
      logger.debug('BreezeService', 'Transaction history response:', history);
      
      if (!history) {
        throw new Error('Empty response from trade history API');
      }
      
      // Check the format of the response
      if (history.Success === false) {
        throw new Error(`API Error: ${history.Error || 'Unknown error'}`);
      }
      
      if (!history.Transactions && !history.Success) {
        // Try to handle different response formats
        if (Array.isArray(history)) {
          logger.info('BreezeService', 'Transactions returned as array instead of object');
          
          // Transform the transactions into a more usable format
          const transactions = history.map(txn => ({
            date: new Date(txn.tradeDate || txn.trade_date || txn.date).toISOString().split('T')[0],
            type: (txn.buySell || txn.buy_sell || txn.transaction_type || '') === 'B' ? 'buy' : 'sell',
            symbol: txn.symbol || txn.trading_symbol || '',
            quantity: parseFloat(txn.quantity || txn.Quantity || 0),
            price: parseFloat(txn.tradePrice || txn.trade_price || txn.price || 0),
            totalValue: parseFloat(txn.tradeValue || txn.trade_value || txn.value || 0),
            exchange: txn.exchange || txn.Exchange || 'NSE',
            orderNumber: txn.orderNumber || txn.order_id || '',
            tradeNumber: txn.tradeNumber || txn.trade_id || ''
          }));
          
          logger.info('BreezeService', `Successfully retrieved ${transactions.length} transactions`);
          return transactions;
        } else {
          logger.error('BreezeService', 'Unexpected transactions response format:', history);
          throw new Error('Invalid response format from trade history API');
        }
      }
      
      // Transform the transactions into a more usable format
      const transactions = history.Transactions.map(txn => ({
        date: new Date(txn.TradeDate).toISOString().split('T')[0],
        type: txn.BuySell === 'B' ? 'buy' : 'sell',
        symbol: txn.Symbol,
        quantity: parseFloat(txn.Quantity),
        price: parseFloat(txn.TradePrice),
        totalValue: parseFloat(txn.TradeValue),
        exchange: txn.Exchange || 'NSE',
        orderNumber: txn.OrderNumber,
        tradeNumber: txn.TradeNumber
      }));
      
      logger.info('BreezeService', `Successfully retrieved ${transactions.length} transactions`);
      
      return transactions;
    } catch (error) {
      logger.error('BreezeService', 'Error downloading transaction history', error);
      throw new Error(`Failed to download transaction history: ${error.message}`);
    }
  }
  
  /**
   * Try alternative trade list method
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @returns {Promise<Array>} - Array of trades
   */
  async getTradeList(fromDate, toDate) {
    try {
      logger.info('BreezeService', 'Attempting to get trades via getTradeList');
      
      const trades = await this.breeze.getTradeList({
        from_date: fromDate.toISOString(),
        to_date: toDate.toISOString(),
        segment: 'E'
      });
      
      logger.debug('BreezeService', 'Trade list response:', trades);
      
      if (!trades) {
        throw new Error('Empty response from trade list API');
      }
      
      // Transform trades into the same format as transactions
      const transactions = Array.isArray(trades) ? trades.map(trade => ({
        date: new Date(trade.trade_date || trade.execution_date).toISOString().split('T')[0],
        type: (trade.buy_sell || trade.transaction_type || '').toLowerCase().includes('b') ? 'buy' : 'sell',
        symbol: trade.trading_symbol || trade.symbol || '',
        quantity: parseFloat(trade.quantity || 0),
        price: parseFloat(trade.price || trade.average_price || 0),
        totalValue: parseFloat(trade.value || (trade.quantity * trade.price) || 0),
        exchange: trade.exchange || 'NSE',
        orderNumber: trade.order_id || '',
        tradeNumber: trade.trade_id || ''
      })) : [];
      
      logger.info('BreezeService', `Successfully retrieved ${transactions.length} trades`);
      return transactions;
    } catch (error) {
      logger.error('BreezeService', 'Error getting trade list', error);
      throw new Error(`Failed to get trade list: ${error.message}`);
    }
  }

  /**
   * Convert portfolio holdings to a summary file format
   * @param {Array} holdings - Array of portfolio holdings
   * @returns {string} - CSV formatted summary data
   */
  formatHoldingsAsSummary(holdings) {
    logger.info('BreezeService', 'Formatting holdings as summary file');
    
    // Define CSV header
    const header = [
      'Symbol', 'Quantity', 'Average Price', 'Current Price', 
      'Cost Value', 'Current Value', 'Unrealized PL', 'Unrealized PL %', 'Industry'
    ].join(',');
    
    // Format each holding as a CSV row
    const rows = holdings.map(holding => [
      holding.symbol,
      holding.quantity,
      holding.averagePrice.toFixed(2),
      holding.lastPrice.toFixed(2),
      holding.valueAtCost.toFixed(2),
      holding.currentValue.toFixed(2),
      holding.unrealizedPL.toFixed(2),
      (holding.unrealizedPLPercent).toFixed(2),
      holding.industry
    ].join(','));
    
    // Combine header and rows
    const csv = [header, ...rows].join('\n');
    
    logger.debug('BreezeService', 'Generated summary CSV with header and rows:', {
      headerLength: header.length,
      rowCount: rows.length
    });
    
    return csv;
  }
  
  /**
   * Convert transaction history to a transactions file format
   * @param {Array} transactions - Array of transactions
   * @returns {string} - CSV formatted transaction data
   */
  formatTransactionsAsCSV(transactions) {
    logger.info('BreezeService', 'Formatting transactions as CSV file');
    
    // Define CSV header
    const header = [
      'Date', 'Type', 'Symbol', 'Quantity', 'Price', 'Total Value'
    ].join(',');
    
    // Format each transaction as a CSV row
    const rows = transactions.map(txn => [
      txn.date,
      txn.type,
      txn.symbol,
      txn.quantity,
      txn.price.toFixed(2),
      txn.totalValue.toFixed(2)
    ].join(','));
    
    // Combine header and rows
    const csv = [header, ...rows].join('\n');
    
    logger.debug('BreezeService', 'Generated transactions CSV with header and rows:', {
      headerLength: header.length,
      rowCount: rows.length
    });
    
    return csv;
  }
  
  /**
   * Download and create a portfolio summary file
   * @returns {Promise<File>} - A File object containing the summary data
   */
  async downloadPortfolioSummary() {
    logger.info('BreezeService', 'Starting portfolio summary download');
    
    try {
      // Get portfolio holdings
      const holdings = await this.getPortfolioHoldings();
      
      // Format as CSV
      const csvContent = this.formatHoldingsAsSummary(holdings);
      
      // Create a Blob and File
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const filename = `icici_portfolio_summary_${new Date().toISOString().split('T')[0]}.csv`;
      const file = new File([blob], filename, { type: 'text/csv' });
      
      logger.info('BreezeService', `Portfolio summary file created: ${filename}`);
      return file;
    } catch (error) {
      logger.error('BreezeService', 'Error creating portfolio summary file', error);
      throw new Error(`Failed to create portfolio summary: ${error.message}`);
    }
  }
  
  /**
   * Download and create a transactions file
   * @param {string} fromDate - Start date in YYYY-MM-DD format 
   * @param {string} toDate - End date in YYYY-MM-DD format
   * @returns {Promise<File>} - A File object containing the transaction data
   */
  async downloadTransactionsFile(fromDate, toDate) {
    logger.info('BreezeService', `Starting transactions download from ${fromDate} to ${toDate}`);
    
    try {
      // Get transaction history
      const transactions = await this.getTransactionHistory(fromDate, toDate);
      
      // Format as CSV
      const csvContent = this.formatTransactionsAsCSV(transactions);
      
      // Create a Blob and File
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const filename = `icici_transactions_${fromDate}_to_${toDate}.csv`;
      const file = new File([blob], filename, { type: 'text/csv' });
      
      logger.info('BreezeService', `Transactions file created: ${filename}`);
      return file;
    } catch (error) {
      logger.error('BreezeService', 'Error creating transactions file', error);
      throw new Error(`Failed to create transactions file: ${error.message}`);
    }
  }

  /**
   * Set a manual session key for development use
   * @param {string} sessionKey - The manual session key
   */
  setManualSessionKey(sessionKey) {
    if (!sessionKey) {
      logger.warn('BreezeService', 'Attempted to set empty manual session key');
      return;
    }
    
    logger.info('BreezeService', 'Setting manual session key for development use');
    localStorage.setItem('breeze_manual_session_key', sessionKey);
  }
}

// Export a singleton instance
const breezeService = new BreezeService();
export default breezeService; 