package com.portfolio.evaluator.exception;

/**
 * Exception thrown when the XIRR calculation does not converge.
 */
public class NonconvergenceException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;

    /**
     * Constructs a new exception with the specified detail message.
     * 
     * @param message the detail message
     */
    public NonconvergenceException(String message) {
        super(message);
    }
    
    /**
     * Constructs a new exception with the specified detail message and cause.
     * 
     * @param message the detail message
     * @param cause the cause
     */
    public NonconvergenceException(String message, Throwable cause) {
        super(message, cause);
    }
} 