package com.portfolio.evaluator.exception;

/**
 * Exception thrown when the derivative becomes zero during XIRR calculation.
 */
public class ZeroValuedDerivativeException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;

    /**
     * Constructs a new exception with the specified detail message.
     * 
     * @param message the detail message
     */
    public ZeroValuedDerivativeException(String message) {
        super(message);
    }
    
    /**
     * Constructs a new exception with the specified detail message and cause.
     * 
     * @param message the detail message
     * @param cause the cause
     */
    public ZeroValuedDerivativeException(String message, Throwable cause) {
        super(message, cause);
    }
} 