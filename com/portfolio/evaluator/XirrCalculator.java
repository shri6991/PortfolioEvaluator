package com.portfolio.evaluator;

import com.google.common.base.Joiner;
import com.google.common.collect.Lists;
import lombok.SneakyThrows;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Scanner;
import java.util.stream.Collectors;

public class XirrCalculator {

    //Transactions file indices
    private static final int SCRIP_CODE_INDEX = 0;
    private static final int SCRIP_NAME_INDEX = 1;
    private static final int TX_DATE_INDEX = 12;
    private static final int TX_TYPE_INDEX = 3;
    private static final int TX_QTY = 4;
    private static final int TX_PRICE = 5;
    private static final SimpleDateFormat TX_DATE_FORMAT = new SimpleDateFormat("dd-MMM-yy");

    //Summary file column indices
    private static final int SUMMARY_MARKET_VALUE_INDEX = 8;
    private static final int SUMMARY_HOLDING_QTY_INDEX = 3;

    private static final String TX_BUY = "Buy";
    private static final String TX_SELL = "Sell";
    final static List<String> headerFields = new ArrayList<String>() {{
            add("Code");
            add("Name");
            add("XIRR%");
            add("No. of transactions");
            add("Total Holding period");
            add("Currently held qty.");
            add("Total invested sum");
            add("Total P/L");
            add("Weighted returns score (XIRR * holding period years * allocation)");
    }};

    @SneakyThrows
    public static void main(String[] args) {
        boolean headerFlag = false;
        //File containing all historical transactions
        Scanner txParser = new Scanner(new File("src/com/portfolio/evaluator/Shri_PF_Tx_05-01-2023.csv"));
        final Map<String, Scrip> scrips = new HashMap<>();

        while (txParser.hasNext()) {
            String line = txParser.nextLine();

            if(!headerFlag) {
                headerFlag = true;
                continue;
            }

            String[] record = line.split(",");
            final String scripCode = record[SCRIP_CODE_INDEX];
            final String scripName = record[SCRIP_NAME_INDEX];

            final Scrip scrip;
            if(scrips.containsKey(scripCode)) {
                scrip = scrips.get(scripCode);
            } else {
                scrip = new Scrip(scripCode, scripName);
                scrips.put(scripCode, scrip);
            }

            final Date txDate = strToDate(record[TX_DATE_INDEX]);
            if(txDate == null) {
                throw new IllegalStateException("Transaction date cannot be null");
            }

            final String txType = record[TX_TYPE_INDEX];
            final int qty = Integer.parseInt(record[TX_QTY]);
            final double price = Double.parseDouble(record[TX_PRICE]);
            final double txAmount;

            if(txType.toLowerCase(Locale.ROOT).equals(TX_BUY.toLowerCase(Locale.ROOT))
                    || txType.toLowerCase(Locale.ROOT).equals("b")) {
                //calculate outflow
                txAmount = -1 * qty * price;
            } else {
                //calculate inflow after sell tx
                txAmount = qty * price;
            }

            final Transaction currTx = new Transaction(txAmount, txDate);
            scrip.getTransactions().add(currTx);
        }

        //File containing PF summary [incl. 0 holdings]
        Scanner summaryParser = new Scanner(new File("src/com/portfolio/evaluator/Shri_PF_Summary_05-01-2023.csv"));

        //Use summary file to get the current market value and holdings
        headerFlag = false;
        while (summaryParser.hasNext()) {
            final String line = summaryParser.nextLine();
            if(!headerFlag) {
                headerFlag = true;
                continue;
            }

            String[] record = line.split(",");
            final String scripCode = record[SCRIP_CODE_INDEX];
            final String scripName = record[SCRIP_NAME_INDEX];

            final Scrip scrip;
            if(scrips.containsKey(scripCode)) {
                scrip = scrips.get(scripCode);
            } else {
                scrip = new Scrip(scripCode, scripName);
                scrips.put(scripCode, scrip);
            }

            final Date txDate = Date.from(Instant.now());

            final int qty = Integer.parseInt(record[SUMMARY_HOLDING_QTY_INDEX]);
            final double currentMarketValue = Double.parseDouble(record[SUMMARY_MARKET_VALUE_INDEX]);

            scrip.setHoldingQty(qty);
            if(currentMarketValue > 0 && qty > 0) {
                final Transaction currTx = new Transaction(currentMarketValue, txDate);
                scrip.getTransactions().add(currTx);
            }
        }

        final List<Transaction> masterTransactions = getAllPortfolioTransactions(scrips.values());
        Xirr xirr = new Xirr(masterTransactions);
        final double xirrPercent = xirr.xirr() * 100;

        final PrintWriter logWriter = new PrintWriter(
                new FileWriter("XIRR_Results_" + new SimpleDateFormat("dd-MM-yyyy")
                        .format(Date.from(Instant.now())) + ".csv", false));
        final Joiner csvJoiner = Joiner.on(",");
        logWriter.println(csvJoiner.join(headerFields));

        final double totalInvested = getTotalInvested(masterTransactions);
        final double totalPnl = getTotalOutflow(masterTransactions) - totalInvested;
        final long pfAgeDays = getHoldingPeriodDays(masterTransactions);
        final LocalDate now = LocalDate.now();
        final Period period = Period.between(now, now.plusDays(pfAgeDays));

        String msg = (csvJoiner.join("Portfolio", "Portfolio", xirrPercent, masterTransactions.size(), period, "", totalInvested, totalPnl));
        System.out.println(msg);
        logWriter.println(msg);

        scrips.values().forEach(scrip -> {
            try {
                final List<Transaction> txList = scrip.getTransactions();

                final Xirr scripXirr;
                final double scripXirrPercent;
                final double weightedReturnsScore;
                final boolean hasBuyTx = txList.stream().anyMatch(tx -> tx.getAmount() < 0);
                final double totalInvestedScrip = getTotalInvested(scrip.getTransactions());
                final long holdingPeriodDays = getHoldingPeriodDays(txList);

                if(hasBuyTx) {
                    scripXirr = new Xirr(txList);
                    scripXirrPercent = scripXirr.xirr() * 100;
                    weightedReturnsScore = totalInvestedScrip/totalInvested * 100 * holdingPeriodDays/365 * scripXirrPercent;
                } else {
                    scripXirrPercent = Double.NaN;
                    weightedReturnsScore = Double.NaN;
                }

                final double totalOutflow = getTotalOutflow(scrip.getTransactions());
                final double totalPnLScrip = totalOutflow - totalInvestedScrip;
                final Period scripHoldingPeriod = Period.between(now, now.plusDays(holdingPeriodDays));
                String msg2 = csvJoiner.join(
                        scrip.getScripCode(), scrip.getScripName(), scripXirrPercent, txList.size(), scripHoldingPeriod,
                        scrip.getHoldingQty(), totalInvestedScrip, totalPnLScrip, weightedReturnsScore);
                System.out.println(msg2);
                logWriter.println(msg2);
            } catch (Exception e) {
                System.out.println("Exception occurred while printing xirr for scrip name : " + scrip.getScripName());
            }
        });

        logWriter.close();
        logWriter.flush();
    }

    private static double getTotalOutflow(List<Transaction> transactions) {
        return transactions.stream().mapToDouble(Transaction::getAmount).filter(amount -> amount > 0).sum();
    }

    private static double getTotalInvested(List<Transaction> transactions) {
        return transactions.stream().mapToDouble(tx -> -1 * tx.getAmount()).filter(amount -> amount > 0).sum();
    }

    private static long getHoldingPeriodDays(List<Transaction> masterTransactions) {
        final List<LocalDate> txDates = masterTransactions.stream()
                .filter(tx -> tx.getAmount()!= 0)
                .map(Transaction::getWhen)
                .sorted(Comparator.comparingLong(LocalDate::toEpochDay))
                .collect(Collectors.toList());

        return txDates.get(txDates.size() - 1).toEpochDay() - txDates.get(0).toEpochDay();
    }

    private static List<Transaction> getAllPortfolioTransactions(final Collection<Scrip> scrips) {

        final List<Transaction> masterTransactions = Lists.newArrayList();
        scrips.forEach(scrip -> masterTransactions.addAll(scrip.getTransactions()));

        return masterTransactions;
    }

    public static Date strToDate(final String str) {
        try {
            return TX_DATE_FORMAT.parse(str);
        } catch (ParseException ex) {
            return null;
        }
    }
}
