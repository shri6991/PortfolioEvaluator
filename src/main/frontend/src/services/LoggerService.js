/**
 * LoggerService - A service for consistent logging throughout the application
 * Provides different log levels and prefixes for better debugging
 */
class LoggerService {
  constructor() {
    this.logLevel = this.getLogLevel();
    
    // Log level constants
    this.LOG_LEVELS = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      NONE: 4
    };
    
    // Colors for console logs
    this.COLORS = {
      DEBUG: 'color: #6c757d', // Gray
      INFO: 'color: #0d6efd',  // Blue
      WARN: 'color: #fd7e14',  // Orange
      ERROR: 'color: #dc3545', // Red
      RESET: 'color: inherit'
    };
  }
  
  /**
   * Get the current log level from localStorage or environment
   * @returns {number} - The log level value
   */
  getLogLevel() {
    try {
      const storedLevel = localStorage.getItem('logLevel');
      if (storedLevel) {
        return parseInt(storedLevel, 10);
      }
      
      // Default to INFO in production, DEBUG in development
      return process.env.NODE_ENV === 'production' ? 1 : 0;
    } catch (error) {
      console.error('Error retrieving log level:', error);
      return 1; // Default to INFO
    }
  }
  
  /**
   * Set the current log level
   * @param {number} level - The log level to set
   */
  setLogLevel(level) {
    try {
      this.logLevel = level;
      localStorage.setItem('logLevel', level.toString());
    } catch (error) {
      console.error('Error setting log level:', error);
    }
  }
  
  /**
   * Format the log message with timestamp, module, and level
   * @param {string} level - The log level
   * @param {string} module - The module name
   * @param {string} message - The log message
   * @returns {string} - The formatted log message
   */
  formatLog(level, module, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${module}] ${message}`;
  }
  
  /**
   * Log a debug message
   * @param {string} module - The module name
   * @param {string} message - The log message
   * @param {any} data - Optional data to log
   */
  debug(module, message, data) {
    if (this.logLevel <= this.LOG_LEVELS.DEBUG) {
      const formattedMessage = this.formatLog('DEBUG', module, message);
      console.log(`%c${formattedMessage}`, this.COLORS.DEBUG);
      if (data !== undefined) {
        console.log('%cDebug data:', this.COLORS.DEBUG, data);
        console.log('%c---', this.COLORS.DEBUG);
      }
    }
  }
  
  /**
   * Log an info message
   * @param {string} module - The module name
   * @param {string} message - The log message
   * @param {any} data - Optional data to log
   */
  info(module, message, data) {
    if (this.logLevel <= this.LOG_LEVELS.INFO) {
      const formattedMessage = this.formatLog('INFO', module, message);
      console.log(`%c${formattedMessage}`, this.COLORS.INFO);
      if (data !== undefined) {
        console.log('%cInfo data:', this.COLORS.INFO, data);
        console.log('%c---', this.COLORS.INFO);
      }
    }
  }
  
  /**
   * Log a warning message
   * @param {string} module - The module name
   * @param {string} message - The log message
   * @param {any} data - Optional data to log
   */
  warn(module, message, data) {
    if (this.logLevel <= this.LOG_LEVELS.WARN) {
      const formattedMessage = this.formatLog('WARN', module, message);
      console.warn(`%c${formattedMessage}`, this.COLORS.WARN);
      if (data !== undefined) {
        console.warn('%cWarning data:', this.COLORS.WARN, data);
        console.warn('%c---', this.COLORS.WARN);
      }
    }
  }
  
  /**
   * Log an error message
   * @param {string} module - The module name
   * @param {string} message - The log message
   * @param {Error|any} error - Optional error object or data
   */
  error(module, message, error) {
    if (this.logLevel <= this.LOG_LEVELS.ERROR) {
      const formattedMessage = this.formatLog('ERROR', module, message);
      console.error(`%c${formattedMessage}`, this.COLORS.ERROR);
      if (error) {
        if (error instanceof Error) {
          console.error('%cError details:', this.COLORS.ERROR, error.message);
          console.error('%cStack trace:', this.COLORS.ERROR, error.stack);
        } else {
          console.error('%cError data:', this.COLORS.ERROR, error);
        }
        console.error('%c---', this.COLORS.ERROR);
      }
    }
  }
  
  /**
   * Group related logs together with a label
   * @param {string} module - The module name
   * @param {string} label - The group label
   */
  group(module, label) {
    if (this.logLevel <= this.LOG_LEVELS.DEBUG) {
      const formattedLabel = this.formatLog('GROUP', module, label);
      console.group(formattedLabel);
    }
  }
  
  /**
   * End the current log group
   */
  groupEnd() {
    if (this.logLevel <= this.LOG_LEVELS.DEBUG) {
      console.groupEnd();
    }
  }
}

// Export a singleton instance
const logger = new LoggerService();
export default logger; 