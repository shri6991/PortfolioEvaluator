package com.portfolio.evaluator.controller;

import com.portfolio.evaluator.exception.ImportException;
import com.portfolio.evaluator.model.Portfolio;
import com.portfolio.evaluator.service.PortfolioService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/portfolios")
public class PortfolioController {

    @Autowired
    private PortfolioService portfolioService;

    @GetMapping
    public ResponseEntity<List<Portfolio>> getAllPortfolios() {
        List<Portfolio> portfolios = portfolioService.getAllPortfolios();
        return ResponseEntity.ok(portfolios);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Portfolio> getPortfolioById(@PathVariable String id) {
        Portfolio portfolio = portfolioService.getPortfolioById(id);
        if (portfolio == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(portfolio);
    }

    @PostMapping("/import")
    public ResponseEntity<?> importPortfolio(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "fileType", defaultValue = "auto") String fileType,
            @RequestParam Map<String, String> allParams) {
        
        try {
            // Extract field mappings from parameters
            Map<String, String> fieldMappings = new HashMap<>();
            allParams.forEach((key, value) -> {
                if (key.startsWith("field_")) {
                    String fieldName = key.substring(6); // Remove "field_" prefix
                    fieldMappings.put(fieldName, value);
                }
            });
            
            // Auto-detect file type if "auto" is specified
            if ("auto".equals(fileType)) {
                // This would have more sophisticated detection in a real application
                if (file.getOriginalFilename().toLowerCase().contains("transaction")) {
                    fileType = "transactions";
                } else if (file.getOriginalFilename().toLowerCase().contains("summary") || 
                           file.getOriginalFilename().toLowerCase().contains("holding")) {
                    fileType = "summary";
                } else {
                    // Default to transactions
                    fileType = "transactions";
                }
            }
            
            String portfolioId = portfolioService.importPortfolioData(file, fileType, fieldMappings);
            
            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("message", "Portfolio data imported successfully");
            response.put("portfolioId", portfolioId);
            response.put("fileType", fileType);
            
            return ResponseEntity.ok(response);
            
        } catch (ImportException e) {
            Map<String, Object> response = new HashMap<>();
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
} 