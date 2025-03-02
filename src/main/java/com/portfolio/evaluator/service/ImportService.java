package com.portfolio.evaluator.service;

import com.portfolio.evaluator.model.Portfolio;
import com.portfolio.evaluator.model.Security;
import com.portfolio.evaluator.model.Transaction;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service for importing portfolio data from various file formats (CSV, Excel, JSON).
 */
@Service
public class ImportService {

    /**
     * Import portfolio data from a CSV file
     * 
     * @param file the CSV file
     * @param columnMapping the mapping of column indices to data fields
     * @param hasHeader whether the file has a header row
     * @return the imported portfolio
     */
    public Portfolio importFromCsv(MultipartFile file, Map<String, Integer> columnMapping, boolean hasHeader) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
            CSVParser csvParser = new CSVParser(reader, CSVFormat.DEFAULT);
            
            Portfolio portfolio = Portfolio.builder()
                    .name(file.getOriginalFilename())
                    .startDate(LocalDate.now())
                    .lastUpdated(LocalDate.now())
                    .securities(new ArrayList<>())
                    .build();
            
            Map<String, Security> securitiesMap = new HashMap<>();
            boolean isFirstRow = true;
            
            for (CSVRecord record : csvParser) {
                // Skip header row if needed
                if (isFirstRow && hasHeader) {
                    isFirstRow = false;
                    continue;
                }
                
                // Extract data using the column mapping
                String ticker = getStringValue(record, columnMapping.getOrDefault("ticker", 0));
                String name = getStringValue(record, columnMapping.getOrDefault("name", 1));
                String txTypeStr = getStringValue(record, columnMapping.getOrDefault("transactionType", 3));
                int quantity = getIntValue(record, columnMapping.getOrDefault("quantity", 4), 0);
                double price = getDoubleValue(record, columnMapping.getOrDefault("price", 5), 0.0);
                String dateStr = getStringValue(record, columnMapping.getOrDefault("date", 12));
                
                Transaction.TransactionType txType = mapTransactionType(txTypeStr);
                LocalDate txDate = parseDate(dateStr);
                
                // Get or create security
                Security security = securitiesMap.computeIfAbsent(ticker, k -> 
                    Security.builder()
                        .ticker(ticker)
                        .name(name)
                        .currentPrice(price) // Use the latest price as current price
                        .transactions(new ArrayList<>())
                        .build()
                );
                
                // Create transaction
                double amount = txType == Transaction.TransactionType.BUY ? 
                        -1 * quantity * price : quantity * price;
                
                Transaction transaction = Transaction.builder()
                        .security(security)
                        .transactionType(txType)
                        .amount(amount)
                        .quantity(quantity)
                        .price(price)
                        .transactionDate(txDate)
                        .build();
                
                security.getTransactions().add(transaction);
            }
            
            portfolio.getSecurities().addAll(securitiesMap.values());
            return portfolio;
        }
    }
    
    /**
     * Import portfolio data from an Excel file
     * 
     * @param file the Excel file
     * @param columnMapping the mapping of column indices to data fields
     * @param hasHeader whether the file has a header row
     * @return the imported portfolio
     */
    public Portfolio importFromExcel(MultipartFile file, Map<String, Integer> columnMapping, boolean hasHeader) throws IOException {
        try (InputStream is = file.getInputStream(); Workbook workbook = new XSSFWorkbook(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            
            Portfolio portfolio = Portfolio.builder()
                    .name(file.getOriginalFilename())
                    .startDate(LocalDate.now())
                    .lastUpdated(LocalDate.now())
                    .securities(new ArrayList<>())
                    .build();
            
            Map<String, Security> securitiesMap = new HashMap<>();
            boolean isFirstRow = true;
            
            for (Row row : sheet) {
                // Skip header row if needed
                if (isFirstRow && hasHeader) {
                    isFirstRow = false;
                    continue;
                }
                
                // Extract data using the column mapping
                String ticker = getStringValue(row, columnMapping.getOrDefault("ticker", 0));
                String name = getStringValue(row, columnMapping.getOrDefault("name", 1));
                String txTypeStr = getStringValue(row, columnMapping.getOrDefault("transactionType", 3));
                int quantity = getIntValue(row, columnMapping.getOrDefault("quantity", 4), 0);
                double price = getDoubleValue(row, columnMapping.getOrDefault("price", 5), 0.0);
                String dateStr = getStringValue(row, columnMapping.getOrDefault("date", 12));
                
                if (ticker == null || ticker.isEmpty()) {
                    continue; // Skip rows without ticker
                }
                
                Transaction.TransactionType txType = mapTransactionType(txTypeStr);
                LocalDate txDate = parseDate(dateStr);
                
                // Get or create security
                Security security = securitiesMap.computeIfAbsent(ticker, k -> 
                    Security.builder()
                        .ticker(ticker)
                        .name(name)
                        .currentPrice(price) // Use the latest price as current price
                        .transactions(new ArrayList<>())
                        .build()
                );
                
                // Create transaction
                double amount = txType == Transaction.TransactionType.BUY ? 
                        -1 * quantity * price : quantity * price;
                
                Transaction transaction = Transaction.builder()
                        .security(security)
                        .transactionType(txType)
                        .amount(amount)
                        .quantity(quantity)
                        .price(price)
                        .transactionDate(txDate)
                        .build();
                
                security.getTransactions().add(transaction);
            }
            
            portfolio.getSecurities().addAll(securitiesMap.values());
            return portfolio;
        }
    }
    
    /**
     * Map a string transaction type to the enum
     * 
     * @param txTypeStr the transaction type string
     * @return the transaction type enum
     */
    private Transaction.TransactionType mapTransactionType(String txTypeStr) {
        if (txTypeStr == null) {
            return Transaction.TransactionType.OTHER;
        }
        
        txTypeStr = txTypeStr.toLowerCase();
        
        if (txTypeStr.contains("buy") || txTypeStr.equals("b")) {
            return Transaction.TransactionType.BUY;
        } else if (txTypeStr.contains("sell") || txTypeStr.equals("s")) {
            return Transaction.TransactionType.SELL;
        } else if (txTypeStr.contains("div")) {
            return Transaction.TransactionType.DIVIDEND;
        } else if (txTypeStr.contains("int")) {
            return Transaction.TransactionType.INTEREST;
        } else if (txTypeStr.contains("dep")) {
            return Transaction.TransactionType.DEPOSIT;
        } else if (txTypeStr.contains("with")) {
            return Transaction.TransactionType.WITHDRAWAL;
        } else if (txTypeStr.contains("split")) {
            return Transaction.TransactionType.SPLIT;
        } else {
            return Transaction.TransactionType.OTHER;
        }
    }
    
    /**
     * Parse a date string into a LocalDate
     * 
     * @param dateStr the date string
     * @return the parsed date
     */
    private LocalDate parseDate(String dateStr) {
        try {
            return LocalDate.parse(dateStr, DateTimeFormatter.ofPattern("dd-MMM-yy"));
        } catch (Exception e) {
            try {
                return LocalDate.parse(dateStr, DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            } catch (Exception e2) {
                return LocalDate.now(); // Default to today if parsing fails
            }
        }
    }
    
    // Helper methods for CSV
    private String getStringValue(CSVRecord record, int index) {
        return record.size() > index ? record.get(index) : "";
    }
    
    private int getIntValue(CSVRecord record, int index, int defaultValue) {
        try {
            return record.size() > index ? Integer.parseInt(record.get(index)) : defaultValue;
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
    
    private double getDoubleValue(CSVRecord record, int index, double defaultValue) {
        try {
            return record.size() > index ? Double.parseDouble(record.get(index)) : defaultValue;
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
    
    // Helper methods for Excel
    private String getStringValue(Row row, int index) {
        Cell cell = row.getCell(index);
        return cell != null ? cell.toString() : "";
    }
    
    private int getIntValue(Row row, int index, int defaultValue) {
        Cell cell = row.getCell(index);
        if (cell == null) {
            return defaultValue;
        }
        
        try {
            return (int) cell.getNumericCellValue();
        } catch (Exception e) {
            try {
                return Integer.parseInt(cell.toString());
            } catch (NumberFormatException ex) {
                return defaultValue;
            }
        }
    }
    
    private double getDoubleValue(Row row, int index, double defaultValue) {
        Cell cell = row.getCell(index);
        if (cell == null) {
            return defaultValue;
        }
        
        try {
            return cell.getNumericCellValue();
        } catch (Exception e) {
            try {
                return Double.parseDouble(cell.toString());
            } catch (NumberFormatException ex) {
                return defaultValue;
            }
        }
    }
} 