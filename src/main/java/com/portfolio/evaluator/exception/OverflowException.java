package com.portfolio.evaluator.exception;

/**
 * Exception thrown when a numerical overflow occurs during XIRR calculation.
 */
public class OverflowException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;

    /**
     * Constructs a new exception with the specified detail message.
     * 
     * @param message the detail message
     */
    public OverflowException(String message) {
        super(message);
    }
    
    /**
     * Constructs a new exception with the specified detail message and cause.
     * 
     * @param message the detail message
     * @param cause the cause
     */
    public OverflowException(String message, Throwable cause) {
        super(message, cause);
    }
} 