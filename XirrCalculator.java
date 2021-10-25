package com.amazon.epi.automationdetective.xirr;

import com.amazon.cmt.constants.Seperator;
import com.amazon.epi.automationdetective.xirr.Scrip;
import com.amazon.epi.automationdetective.xirr.Transaction;
import com.google.common.base.Joiner;
import com.google.common.collect.Lists;
import com.amazon.epi.automationdetective.xirr.Xirr;
import com.google.common.collect.Maps;
import lombok.SneakyThrows;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.lang.StringUtils;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.Collection;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class XirrCalculator {

    private static final int SCRIP_CODE_INDEX = 0;
    private static final int SCRIP_NAME_INDEX = 1;
    private static final int TX_DATE_INDEX = 12;
    private static final int TX_TYPE_INDEX = 3;
    private static final int TX_QTY = 4;
    private static final int TX_PRICE = 5;

    private static final int SUMMARY_MARKET_VALUE = 8;
    private static final int SUMMARY_HOLDING_QTY = 3;
    private static final SimpleDateFormat sdf = new SimpleDateFormat("dd-MMM-yy");
    private static final String TX_BUY = "Buy";
    private static final String TX_SELL = "Sell";
    private static final Map<String, String> scripCodeToExchangeCode = getScripCodeToExchangeCodeMap();
    final List<String> headerFields = Lists.newArrayList(
            "Code", "Name", "XIRR%", "No. of transactions", "Total Holding period", "Currently held qty.",
            "Total invested sum", "Total P/L", "Weighted returns score (XIRR * holding period years * allocation)");
    static double currentPFValue;

    @Test
    @SneakyThrows
    public void test() {
        boolean headerFlag = false;
        boolean pfValueFlag = false;
        final BufferedReader br = new BufferedReader(
                new FileReader("src/com/amazon/epi/automationdetective/PF_Transactions_Shri.csv"));

        CSVParser parser = new CSVParser(br);
        final Map<String, Scrip> scrips = Maps.newHashMap();

        while (true) {
            String[] record = parser.getLine();
            if (record == null || record.length == 0) {
                break;
            }

            if(!headerFlag) {
                headerFlag = true;
                continue;
            }

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

            if(StringUtils.equals(txType, TX_BUY)) {
                //calculate outflow
                txAmount = -1 * qty * price;
            } else {
                //calculate inflow after sell tx
                txAmount = qty * price;
            }

            final Transaction currTx = new Transaction(txAmount, txDate);
            scrip.getTransactions().add(currTx);
        }

        final BufferedReader br2 = new BufferedReader(
                new FileReader("src/com/amazon/epi/automationdetective/PF_Summary_Shri.csv"));
        CSVParser parser2 = new CSVParser(br2);

        //Use summary file to get the current market value and holdings
        headerFlag = false;
        while (true) {
            String[] record = parser2.getLine();
            if (record == null || record.length == 0) {
                break;
            }

            if(!headerFlag) {
                headerFlag = true;
                continue;
            }

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

            final int qty = Integer.parseInt(record[SUMMARY_HOLDING_QTY]);
            final double currentMarketValue = Double.parseDouble(record[SUMMARY_MARKET_VALUE]);

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
        final Joiner csvJoiner = Joiner.on(Seperator.COMMA.getValue());
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

    private double getTotalOutflow(List<Transaction> transactions) {
        return transactions.stream().mapToDouble(Transaction::getAmount).filter(amount -> amount > 0).sum();
    }

    private double getTotalInvested(List<Transaction> transactions) {
        return transactions.stream().mapToDouble(tx -> -1 * tx.getAmount()).filter(amount -> amount > 0).sum();
    }

    private long getHoldingPeriodDays(List<Transaction> masterTransactions) {
        final List<LocalDate> txDates = masterTransactions.stream()
                .filter(tx -> tx.getAmount()!= 0)
                .map(Transaction::getWhen)
                .sorted(Comparator.comparingLong(LocalDate::toEpochDay))
                .collect(Collectors.toList());

        return txDates.get(txDates.size() - 1).toEpochDay() - txDates.get(0).toEpochDay();
    }

    private List<Transaction> getAllPortfolioTransactions(final Collection<Scrip> scrips) {

        final List<Transaction> masterTransactions = Lists.newArrayList();
        scrips.forEach(scrip -> {
            if(!scrip.getScripCode().equals("CRISIL")) {
                masterTransactions.addAll(scrip.getTransactions());
            }
        });

        return masterTransactions;
    }

    @SneakyThrows
    private double getQuote(final String scripExchangeCode) {
        if(StringUtils.isBlank(scripExchangeCode)) return 0;
        final String mainToken = "6f66fc6b764caa60473d1821ae7f7908";
        final String altToken = "b70ddca545a07672897b8e6bd138d70c";
        URL url = new URL(
                "https://financialmodelingprep.com/api/v3/quote-short/"
                        + scripExchangeCode
                        + "?apikey="
                        + altToken);

        StringBuilder response = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(url.openStream(), StandardCharsets.UTF_8))) {
            for (String line; (line = reader.readLine()) != null;) {
                response.append(line);
            }
        }

        try {
            final String responseStr = response.toString().trim();
            final JSONArray quotes = new JSONArray(responseStr);
            final JSONObject quote = quotes.getJSONObject(0);
            return quote.getDouble("price");
        } catch (Exception e) {
            return 0;
        }
    }

    @SneakyThrows
    private static Map<String, String> getScripCodeToExchangeCodeMap() {
        final Map<String, String> scripCodeToExchCode = Maps.newHashMap();
        final BufferedReader br = new BufferedReader(
                new FileReader("src/com/amazon/epi/automationdetective/ICICI_TO_EXCHANGE_STOCK_CODE.csv"));

        CSVParser parser = new CSVParser(br);
        while (true) {
            String[] record = parser.getLine();
            if (record == null || record.length == 0) {
                break;
            }

            scripCodeToExchCode.put(record[0], record[1]);
        }

        return scripCodeToExchCode;
    }

    public static Date strToDate(final String str) {
        try {
            return sdf.parse(str);
        } catch (ParseException ex) {
            return null;
        }
    }
}
