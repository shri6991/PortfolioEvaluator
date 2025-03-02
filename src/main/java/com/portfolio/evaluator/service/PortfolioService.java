package com.portfolio.evaluator.service;

import com.portfolio.evaluator.model.Portfolio;
import com.portfolio.evaluator.model.Security;
import com.portfolio.evaluator.model.Transaction;
import com.portfolio.evaluator.exception.ImportException;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PortfolioService {

    private Map<String, Portfolio> portfolios = new HashMap<>();
    private static final String[] DATE_FORMATS = {
            "dd-MMM-yyyy", "yyyy-MM-dd", "MM/dd/yyyy", "dd/MM/yyyy"
    };

    public String importPortfolioData(MultipartFile file, String fileType, Map<String, String> fieldMappings) throws ImportException {
        try {
            // Create a default portfolio ID
            String portfolioId = UUID.randomUUID().toString();
            Portfolio portfolio = new Portfolio(portfolioId, "Imported Portfolio", LocalDate.now());
            
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream()))) {
                CSVParser csvParser = CSVFormat.DEFAULT.withFirstRecordAsHeader().parse(reader);
                
                if ("transactions".equalsIgnoreCase(fileType)) {
                    processTransactionsFile(csvParser, portfolio, fieldMappings);
                } else if ("summary".equalsIgnoreCase(fileType)) {
                    processSummaryFile(csvParser, portfolio, fieldMappings);
                } else {
                    throw new ImportException("Unsupported file type: " + fileType);
                }
            }
            
            // Store the portfolio
            portfolios.put(portfolioId, portfolio);
            return portfolioId;
            
        } catch (IOException e) {
            throw new ImportException("Failed to import portfolio data: " + e.getMessage(), e);
        }
    }
    
    private void processTransactionsFile(CSVParser csvParser, Portfolio portfolio, Map<String, String> fieldMappings) {
        String symbolField = getField(fieldMappings, "symbol", "Stock Symbol");
        String companyNameField = getField(fieldMappings, "companyName", "Company Name");
        String isinField = getField(fieldMappings, "isin", "ISIN Code");
        String dateField = getField(fieldMappings, "date", "Transaction Date");
        String actionField = getField(fieldMappings, "action", "Action");
        String quantityField = getField(fieldMappings, "quantity", "Quantity");
        String priceField = getField(fieldMappings, "price", "Transaction Price");
        String brokerageField = getField(fieldMappings, "brokerage", "Brokerage");
        String exchangeField = getField(fieldMappings, "exchange", "Exchange");
        
        List<Transaction> transactions = new ArrayList<>();
        Map<String, Security> securities = new HashMap<>();
        
        for (CSVRecord record : csvParser) {
            String symbol = record.get(symbolField);
            String companyName = record.get(companyNameField);
            String isin = record.get(isinField);
            String dateStr = record.get(dateField);
            String action = record.get(actionField);
            String quantityStr = record.get(quantityField);
            String priceStr = record.get(priceField);
            
            // Parse values
            LocalDate transactionDate = parseDate(dateStr);
            int quantity = Integer.parseInt(quantityStr.trim());
            BigDecimal price = new BigDecimal(priceStr.trim());
            BigDecimal brokerage = BigDecimal.ZERO;
            if (record.isMapped(brokerageField)) {
                try {
                    brokerage = new BigDecimal(record.get(brokerageField).trim());
                } catch (NumberFormatException e) {
                    // Ignore if brokerage can't be parsed
                }
            }
            
            // Create or update security
            String securityId = isin != null && !isin.isEmpty() ? isin : symbol;
            Security security = securities.computeIfAbsent(securityId, id -> {
                Security s = new Security();
                s.setId(id);
                s.setSymbol(symbol);
                s.setName(companyName);
                s.setIsin(isin);
                return s;
            });
            
            // Create transaction
            Transaction transaction = new Transaction();
            transaction.setId(UUID.randomUUID().toString());
            transaction.setSecurityId(securityId);
            transaction.setDate(transactionDate);
            transaction.setType(action.toLowerCase().contains("buy") ? Transaction.Type.BUY : Transaction.Type.SELL);
            transaction.setQuantity(quantity);
            transaction.setPrice(price);
            transaction.setFees(brokerage);
            
            transactions.add(transaction);
        }
        
        // Update portfolio with transactions and securities
        portfolio.setTransactions(transactions);
        portfolio.setSecurities(new ArrayList<>(securities.values()));
        
        // Calculate portfolio metrics based on transactions
        calculatePortfolioMetrics(portfolio);
    }
    
    private void processSummaryFile(CSVParser csvParser, Portfolio portfolio, Map<String, String> fieldMappings) {
        String symbolField = getField(fieldMappings, "symbol", "Stock Symbol");
        String companyNameField = getField(fieldMappings, "companyName", "Company Name");
        String isinField = getField(fieldMappings, "isin", "ISIN Code");
        String quantityField = getField(fieldMappings, "quantity", "Qty");
        String avgCostPriceField = getField(fieldMappings, "avgCostPrice", "Average Cost Price");
        String currentPriceField = getField(fieldMappings, "currentPrice", "Current Market Price");
        String valueAtCostField = getField(fieldMappings, "valueAtCost", "Value At Cost");
        String valueAtMarketField = getField(fieldMappings, "valueAtMarket", "Value At Market Price");
        String realizedPLField = getField(fieldMappings, "realizedPL", "Realized Profit / Loss");
        String unrealizedPLField = getField(fieldMappings, "unrealizedPL", "Unrealized Profit/Loss");
        
        List<Security> securities = new ArrayList<>();
        BigDecimal totalPortfolioValue = BigDecimal.ZERO;
        BigDecimal totalCostBasis = BigDecimal.ZERO;
        BigDecimal totalRealizedPL = BigDecimal.ZERO;
        
        for (CSVRecord record : csvParser) {
            String symbol = record.get(symbolField);
            String companyName = record.get(companyNameField);
            String isin = record.get(isinField);
            String quantityStr = record.get(quantityField);
            String avgCostPriceStr = record.get(avgCostPriceField);
            String currentPriceStr = record.get(currentPriceField);
            String valueAtCostStr = record.get(valueAtCostField);
            String valueAtMarketStr = record.get(valueAtMarketField);
            String realizedPLStr = record.get(realizedPLField);
            String unrealizedPLStr = record.get(unrealizedPLField);
            
            // Parse values
            int quantity = parseInt(quantityStr.trim());
            if (quantity <= 0) {
                // Skip if no holdings
                continue;
            }
            
            BigDecimal avgCostPrice = parseBigDecimal(avgCostPriceStr.trim());
            BigDecimal currentPrice = parseBigDecimal(currentPriceStr.trim());
            BigDecimal valueAtCost = parseBigDecimal(valueAtCostStr.trim());
            BigDecimal valueAtMarket = parseBigDecimal(valueAtMarketStr.trim());
            BigDecimal realizedPL = parseBigDecimal(realizedPLStr.trim());
            BigDecimal unrealizedPL = parseBigDecimal(unrealizedPLStr.trim());
            
            // Create security
            String securityId = isin != null && !isin.isEmpty() ? isin : symbol;
            Security security = new Security();
            security.setId(securityId);
            security.setSymbol(symbol);
            security.setName(companyName);
            security.setIsin(isin);
            security.setCurrentPrice(currentPrice);
            security.setQuantity(quantity);
            security.setAverageCost(avgCostPrice);
            security.setMarketValue(valueAtMarket);
            security.setCostBasis(valueAtCost);
            security.setRealizedProfit(realizedPL);
            security.setUnrealizedProfit(unrealizedPL);
            
            securities.add(security);
            
            // Update totals
            totalPortfolioValue = totalPortfolioValue.add(valueAtMarket);
            totalCostBasis = totalCostBasis.add(valueAtCost);
            totalRealizedPL = totalRealizedPL.add(realizedPL);
        }
        
        // Update portfolio
        portfolio.setSecurities(securities);
        portfolio.setMarketValue(totalPortfolioValue);
        portfolio.setCostBasis(totalCostBasis);
        portfolio.setRealizedProfit(totalRealizedPL);
        portfolio.setUnrealizedProfit(totalPortfolioValue.subtract(totalCostBasis));
        
        // Since we don't have transactions from summary file, create placeholder empty list
        portfolio.setTransactions(new ArrayList<>());
    }
    
    private void calculatePortfolioMetrics(Portfolio portfolio) {
        Map<String, Integer> holdings = new HashMap<>();
        Map<String, BigDecimal> costBasis = new HashMap<>();
        
        // Calculate holdings and cost basis based on transactions
        for (Transaction transaction : portfolio.getTransactions()) {
            String securityId = transaction.getSecurityId();
            int quantity = transaction.getQuantity();
            BigDecimal totalCost = transaction.getPrice().multiply(new BigDecimal(quantity)).add(transaction.getFees());
            
            if (transaction.getType() == Transaction.Type.BUY) {
                holdings.merge(securityId, quantity, Integer::sum);
                costBasis.merge(securityId, totalCost, BigDecimal::add);
            } else if (transaction.getType() == Transaction.Type.SELL) {
                holdings.merge(securityId, -quantity, Integer::sum);
                costBasis.merge(securityId, totalCost.negate(), BigDecimal::add);
            }
        }
        
        // Update securities with calculated values
        for (Security security : portfolio.getSecurities()) {
            String securityId = security.getId();
            int quantity = holdings.getOrDefault(securityId, 0);
            BigDecimal totalCost = costBasis.getOrDefault(securityId, BigDecimal.ZERO);
            
            security.setQuantity(quantity);
            if (quantity > 0) {
                security.setCostBasis(totalCost);
                security.setAverageCost(totalCost.divide(new BigDecimal(quantity), 2, BigDecimal.ROUND_HALF_UP));
                security.setMarketValue(security.getCurrentPrice().multiply(new BigDecimal(quantity)));
                security.setUnrealizedProfit(security.getMarketValue().subtract(totalCost));
            }
        }
        
        // Calculate portfolio totals
        BigDecimal totalMarketValue = portfolio.getSecurities().stream()
                .map(Security::getMarketValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        BigDecimal totalCostBasis = portfolio.getSecurities().stream()
                .map(Security::getCostBasis)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        BigDecimal totalUnrealizedProfit = portfolio.getSecurities().stream()
                .map(Security::getUnrealizedProfit)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        portfolio.setMarketValue(totalMarketValue);
        portfolio.setCostBasis(totalCostBasis);
        portfolio.setUnrealizedProfit(totalUnrealizedProfit);
    }
    
    public List<Portfolio> getAllPortfolios() {
        return new ArrayList<>(portfolios.values());
    }
    
    public Portfolio getPortfolioById(String id) {
        return portfolios.get(id);
    }
    
    private String getField(Map<String, String> fieldMappings, String key, String defaultValue) {
        return fieldMappings != null && fieldMappings.containsKey(key) ? fieldMappings.get(key) : defaultValue;
    }
    
    private LocalDate parseDate(String dateStr) {
        for (String format : DATE_FORMATS) {
            try {
                DateTimeFormatter formatter = DateTimeFormatter.ofPattern(format);
                return LocalDate.parse(dateStr, formatter);
            } catch (DateTimeParseException e) {
                // Try next format
            }
        }
        throw new IllegalArgumentException("Cannot parse date: " + dateStr);
    }
    
    private int parseInt(String value) {
        try {
            // Remove parentheses and commas
            value = value.replace(",", "").replace("(", "").replace(")", "");
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
    
    private BigDecimal parseBigDecimal(String value) {
        try {
            // Remove parentheses (negative values may be in parentheses), percentage signs and commas
            value = value.replace(",", "").replace("%", "");
            
            // Handle negative values in parentheses
            if (value.startsWith("(") && value.endsWith(")")) {
                value = "-" + value.substring(1, value.length() - 1);
            }
            
            return new BigDecimal(value);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }
} 