// ═══════════════════════════════════════════════════════════════════════
// MetaTrader 5 Expert Advisor — Execution Layer
// ═══════════════════════════════════════════════════════════════════════
//
// This EA is the execution arm of the autonomous trading system.
// It receives JSON signals from the OpenClaw Brain via shared files,
// validates them, executes orders, and reports back.
//
// STRUCTURAL PSEUDOCODE — not compilable MQL5, but follows MQL5
// conventions and structure closely.
// ═══════════════════════════════════════════════════════════════════════

#property copyright "OpenClaw Trading System"
#property version   "1.0"
#property strict

#include <Trade/Trade.mqh>
#include <Trade/PositionInfo.mqh>
#include <JAson.mqh>  // JSON parsing library for MQL5

// ═══════════════════════════════════════════════════════════════════════
// INPUT PARAMETERS
// ═══════════════════════════════════════════════════════════════════════

input string   SharedDir           = "C:\\shared\\";           // Shared directory
input int      PollIntervalMs      = 500;                     // Signal poll interval
input int      HeartbeatIntervalS  = 10;                      // Heartbeat interval
input double   MaxDailyDrawdownPct = 5.0;                     // Hard daily DD cap
input double   MaxPortfolioRiskPct = 6.0;                     // Max total risk
input int      MaxPositionsTotal   = 4;                       // Max concurrent positions
input int      MaxPositionsPerAsset= 2;                       // Max per asset
input int      BrainTimeoutSec     = 120;                     // Brain heartbeat timeout
input double   MaxSlippagePoints   = 50;                      // Max acceptable slippage
input int      MaxRetries          = 3;                       // Order retry attempts

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════

enum EA_STATE {
    EA_ACTIVE,
    EA_SAFE_MODE,
    EA_HALTED
};

EA_STATE        g_eaState = EA_ACTIVE;
double          g_dailyStartEquity = 0;
datetime        g_dailyStartTime = 0;
datetime        g_lastBrainHeartbeat = 0;
datetime        g_lastEAHeartbeat = 0;
int             g_heartbeatSequence = 0;
string          g_assets[] = {"BTCUSD", "ETHUSD", "XAUUSD"};
CTrade          g_trade;
CPositionInfo   g_posInfo;

// Price history for flash crash detection
struct PriceSnapshot {
    double price;
    datetime time;
};
PriceSnapshot   g_priceHistory[][60];  // Last 60 snapshots per asset

// ═══════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

int OnInit() {
    // Set magic number for this EA
    g_trade.SetExpertMagicNumber(20260303);
    g_trade.SetDeviationInPoints(MaxSlippagePoints);
    g_trade.SetTypeFilling(ORDER_FILLING_IOC);

    // Initialize daily equity baseline
    g_dailyStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
    g_dailyStartTime = TimeCurrent();

    // Load persisted state (halt status, etc.)
    LoadPersistedState();

    // Verify shared directory exists
    if (!FolderExists(SharedDir)) {
        Print("ERROR: Shared directory not found: ", SharedDir);
        return INIT_FAILED;
    }

    // Subscribe to all asset symbols
    for (int i = 0; i < ArraySize(g_assets); i++) {
        if (!SymbolSelect(g_assets[i], true)) {
            Print("WARNING: Could not select symbol ", g_assets[i]);
        }
    }

    // Set timer for periodic operations
    EventSetMillisecondTimer(PollIntervalMs);

    Print("EA initialized. State: ", EnumToString(g_eaState));
    Print("Daily start equity: ", g_dailyStartEquity);

    return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
    EventKillTimer();
    Print("EA deinitialized. Reason: ", reason);
}


// ═══════════════════════════════════════════════════════════════════════
// MAIN TIMER LOOP (runs every PollIntervalMs)
// ═══════════════════════════════════════════════════════════════════════

void OnTimer() {
    // ── 1. Kill-switch checks (highest priority, always runs) ──
    CheckKillSwitch();
    if (g_eaState == EA_HALTED) return;

    // ── 2. Daily reset check ──
    CheckDailyReset();

    // ── 3. Heartbeat exchange ──
    if (TimeCurrent() - g_lastEAHeartbeat >= HeartbeatIntervalS) {
        WriteEAHeartbeat();
        CheckBrainHeartbeat();
        g_lastEAHeartbeat = TimeCurrent();
    }

    // ── 4. Check for kill-switch file from brain ──
    CheckKillSwitchFile();

    // ── 5. Process pending signals (only if ACTIVE) ──
    if (g_eaState == EA_ACTIVE) {
        ProcessPendingSignals();
    }

    // ── 6. Update position status report ──
    WritePositionUpdate();

    // ── 7. Update price history for flash crash detection ──
    UpdatePriceHistory();
}


// ═══════════════════════════════════════════════════════════════════════
// SIGNAL PROCESSING
// ═══════════════════════════════════════════════════════════════════════

void ProcessPendingSignals() {
    string path = SharedDir + "signals\\pending\\";

    // List all .json files in pending directory
    string filename = "";
    long handle = FileFindFirst(path + "*.json", filename, 0);
    if (handle == INVALID_HANDLE) return;

    do {
        // Skip .tmp files (atomic write in progress)
        if (StringFind(filename, ".tmp") >= 0) continue;

        // Read and parse signal
        string fullpath = path + filename;
        string content = ReadFileContents(fullpath);
        if (content == "") continue;

        CJAVal signal;
        if (!signal.Deserialize(content)) {
            Print("ERROR: Failed to parse signal: ", filename);
            MoveFile(fullpath, SharedDir + "signals\\rejected_source\\" + filename);
            WriteRejection(signal, "PARSE_ERROR", "Failed to parse JSON");
            continue;
        }

        // Process the signal
        ProcessSignal(signal, filename);

    } while (FileFindNext(handle, filename));

    FileFindClose(handle);
}

void ProcessSignal(CJAVal &signal, string filename) {
    string signalId = signal["signal_id"].ToStr();
    string action   = signal["action"].ToStr();
    string asset    = signal["asset"].ToStr();

    Print("Processing signal: ", signalId, " Action: ", action);

    // ── Check expiry ──
    string expiresStr = signal["expires_utc"].ToStr();
    datetime expiresTime = StringToTime(expiresStr);
    if (TimeCurrent() > expiresTime) {
        Print("Signal expired: ", signalId);
        WriteConfirmation(signalId, asset, "EXPIRED", 0, 0, 0, "Signal expired");
        MoveToProcessed(filename);
        return;
    }

    // ── Validate checksum ──
    if (!ValidateChecksum(signal)) {
        Print("Checksum failed: ", signalId);
        WriteRejection(signal, "CHECKSUM_FAILED", "Checksum validation failed");
        MoveToRejected(filename);
        return;
    }

    // ── Route by action type ──
    if (action == "OPEN_LONG" || action == "OPEN_SHORT") {
        ExecuteOpenOrder(signal, filename);
    }
    else if (action == "CLOSE_POSITION") {
        ExecuteClosePosition(signal, filename);
    }
    else if (action == "CLOSE_ALL_ASSET") {
        ExecuteCloseAllAsset(signal, filename);
    }
    else if (action == "CLOSE_ALL") {
        ExecuteCloseAll(signal, filename);
    }
    else if (action == "MODIFY_SL") {
        ExecuteModifySL(signal, filename);
    }
    else if (action == "PARTIAL_CLOSE") {
        ExecutePartialClose(signal, filename);
    }
    else if (action == "NOP") {
        // Heartbeat signal — just acknowledge
        WriteConfirmation(signalId, asset, "FILLED", 0, 0, 0, "NOP acknowledged");
        MoveToProcessed(filename);
    }
    else {
        WriteRejection(signal, "UNKNOWN_ACTION", "Unknown action: " + action);
        MoveToRejected(filename);
    }
}


// ═══════════════════════════════════════════════════════════════════════
// ORDER EXECUTION
// ═══════════════════════════════════════════════════════════════════════

void ExecuteOpenOrder(CJAVal &signal, string filename) {
    string signalId = signal["signal_id"].ToStr();
    string asset    = signal["asset"].ToStr();
    string action   = signal["action"].ToStr();
    double lots     = signal["position_size_lots"].ToDbl();
    double sl       = signal["stop_loss"].ToDbl();
    double tp1      = signal["take_profit_1"].ToDbl();
    double riskPct  = signal["risk_percent"].ToDbl();
    double refPrice = signal["entry_price_reference"].ToDbl();

    bool isLong = (action == "OPEN_LONG");

    // ═══════════════════════════════════
    // RISK VALIDATION (EA-side independent)
    // ═══════════════════════════════════

    // 1. Stop-loss must be present
    if (sl <= 0) {
        WriteRejection(signal, "NO_STOP_LOSS", "Stop-loss missing or zero");
        MoveToRejected(filename);
        return;
    }

    // 2. Lot size within broker limits
    double minLot = SymbolInfoDouble(asset, SYMBOL_VOLUME_MIN);
    double maxLot = SymbolInfoDouble(asset, SYMBOL_VOLUME_MAX);
    double lotStep = SymbolInfoDouble(asset, SYMBOL_VOLUME_STEP);

    if (lots < minLot || lots > maxLot) {
        WriteRejection(signal, "LOT_SIZE_INVALID",
            StringFormat("Lots %.4f outside [%.4f, %.4f]", lots, minLot, maxLot));
        MoveToRejected(filename);
        return;
    }

    // Normalize lot size
    lots = MathFloor(lots / lotStep) * lotStep;

    // 3. Position count limits
    int totalPositions = PositionsTotal();
    if (totalPositions >= MaxPositionsTotal) {
        WriteRejection(signal, "MAX_POSITIONS_REACHED",
            StringFormat("Total positions %d >= %d", totalPositions, MaxPositionsTotal));
        MoveToRejected(filename);
        return;
    }

    int assetPositions = CountPositionsForAsset(asset);
    if (assetPositions >= MaxPositionsPerAsset) {
        WriteRejection(signal, "MAX_ASSET_POSITIONS",
            StringFormat("Asset positions %d >= %d", assetPositions, MaxPositionsPerAsset));
        MoveToRejected(filename);
        return;
    }

    // 4. Portfolio risk check
    double currentRisk = ComputePortfolioRisk();
    if (currentRisk + riskPct > MaxPortfolioRiskPct / 100.0) {
        WriteRejection(signal, "PORTFOLIO_RISK_EXCEEDED",
            StringFormat("Adding %.2f%% would push risk to %.2f%%",
                riskPct * 100, (currentRisk + riskPct) * 100));
        MoveToRejected(filename);
        return;
    }

    // 5. Daily drawdown check
    double equity = AccountInfoDouble(ACCOUNT_EQUITY);
    double dailyDD = (g_dailyStartEquity - equity) / g_dailyStartEquity * 100;
    if (dailyDD >= MaxDailyDrawdownPct) {
        WriteRejection(signal, "DAILY_DD_EXCEEDED",
            StringFormat("Daily DD %.2f%% >= %.2f%%", dailyDD, MaxDailyDrawdownPct));
        MoveToRejected(filename);
        return;
    }

    // 6. Spread sanity check
    double ask = SymbolInfoDouble(asset, SYMBOL_ASK);
    double bid = SymbolInfoDouble(asset, SYMBOL_BID);
    double spread = ask - bid;
    double typicalSpread = GetTypicalSpread(asset);
    if (spread > typicalSpread * 3) {
        WriteRejection(signal, "SPREAD_TOO_WIDE",
            StringFormat("Spread %.2f > 3x typical %.2f", spread, typicalSpread));
        MoveToRejected(filename);
        return;
    }

    // 7. SL sanity — must be on correct side
    if (isLong && sl >= bid) {
        WriteRejection(signal, "SL_WRONG_SIDE", "Long SL >= current bid");
        MoveToRejected(filename);
        return;
    }
    if (!isLong && sl <= ask) {
        WriteRejection(signal, "SL_WRONG_SIDE", "Short SL <= current ask");
        MoveToRejected(filename);
        return;
    }

    // ═══════════════════════════════════
    // EXECUTE ORDER
    // ═══════════════════════════════════

    ulong startTime = GetMicrosecondCount();
    bool success = false;
    int attempts = 0;

    while (!success && attempts < MaxRetries) {
        attempts++;

        if (isLong) {
            double price = SymbolInfoDouble(asset, SYMBOL_ASK);
            success = g_trade.Buy(lots, asset, price, sl, tp1,
                        StringFormat("OC|%s", signalId));
        } else {
            double price = SymbolInfoDouble(asset, SYMBOL_BID);
            success = g_trade.Sell(lots, asset, price, sl, tp1,
                        StringFormat("OC|%s", signalId));
        }

        if (!success) {
            Print("Order attempt ", attempts, " failed: ",
                  g_trade.ResultRetcode(), " ", g_trade.ResultRetcodeDescription());

            if (g_trade.ResultRetcode() == TRADE_RETCODE_REQUOTE) {
                Sleep(100);  // Brief pause before retry on requote
                continue;
            }

            // Non-requote failure — don't retry
            break;
        }
    }

    ulong endTime = GetMicrosecondCount();
    double executionTimeMs = (endTime - startTime) / 1000.0;

    if (success) {
        ulong ticket = g_trade.ResultOrder();
        double fillPrice = g_trade.ResultPrice();
        double slippage = isLong ?
            fillPrice - SymbolInfoDouble(asset, SYMBOL_ASK) :
            SymbolInfoDouble(asset, SYMBOL_BID) - fillPrice;

        Print(StringFormat("ORDER FILLED: %s | Ticket: %d | Price: %.5f | Slippage: %.2f",
            signalId, ticket, fillPrice, slippage));

        WriteConfirmation(signalId, asset, "FILLED",
            ticket, fillPrice, slippage,
            StringFormat("Filled in %.1fms", executionTimeMs));

        MoveToProcessed(filename);
    } else {
        uint retcode = g_trade.ResultRetcode();
        string retdesc = g_trade.ResultRetcodeDescription();

        Print(StringFormat("ORDER FAILED: %s | Code: %d | %s",
            signalId, retcode, retdesc));

        if (retcode == TRADE_RETCODE_REQUOTE) {
            WriteConfirmation(signalId, asset, "REQUOTE", 0, 0, 0, retdesc);
        } else {
            WriteConfirmation(signalId, asset, "REJECTED_BROKER", 0, 0, 0,
                StringFormat("Code %d: %s", retcode, retdesc));
        }

        MoveToRejected(filename);
    }
}


// ═══════════════════════════════════════════════════════════════════════
// POSITION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

void ExecuteClosePosition(CJAVal &signal, string filename) {
    string signalId = signal["signal_id"].ToStr();
    ulong ticket = (ulong)signal["ticket"].ToInt();

    if (PositionSelectByTicket(ticket)) {
        string asset = PositionGetString(POSITION_SYMBOL);
        double lots = PositionGetDouble(POSITION_VOLUME);

        if (g_trade.PositionClose(ticket)) {
            double closePrice = g_trade.ResultPrice();
            WriteConfirmation(signalId, asset, "CLOSED", ticket, closePrice, 0,
                "Position closed");
        } else {
            WriteConfirmation(signalId, asset, "ERROR", ticket, 0, 0,
                StringFormat("Close failed: %s", g_trade.ResultRetcodeDescription()));
        }
    } else {
        WriteConfirmation(signalId, "", "ERROR", ticket, 0, 0,
            "Position not found");
    }

    MoveToProcessed(filename);
}

void ExecuteCloseAllAsset(CJAVal &signal, string filename) {
    string signalId = signal["signal_id"].ToStr();
    string asset = signal["asset"].ToStr();
    int closed = 0;

    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        if (g_posInfo.SelectByIndex(i)) {
            if (g_posInfo.Symbol() == asset) {
                if (g_trade.PositionClose(g_posInfo.Ticket())) {
                    closed++;
                }
            }
        }
    }

    WriteConfirmation(signalId, asset, "CLOSED", 0, 0, 0,
        StringFormat("Closed %d positions for %s", closed, asset));
    MoveToProcessed(filename);
}

void ExecuteCloseAll(CJAVal &signal, string filename) {
    string signalId = signal["signal_id"].ToStr();
    int closed = 0;

    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        if (g_posInfo.SelectByIndex(i)) {
            if (g_trade.PositionClose(g_posInfo.Ticket())) {
                closed++;
            }
        }
    }

    WriteConfirmation(signalId, "", "CLOSED", 0, 0, 0,
        StringFormat("CLOSE_ALL: Closed %d positions", closed));
    MoveToProcessed(filename);
}

void ExecuteModifySL(CJAVal &signal, string filename) {
    string signalId = signal["signal_id"].ToStr();
    ulong ticket = (ulong)signal["ticket"].ToInt();
    double newSL = signal["new_sl"].ToDbl();

    if (PositionSelectByTicket(ticket)) {
        string asset = PositionGetString(POSITION_SYMBOL);
        double currentSL = PositionGetDouble(POSITION_SL);
        double tp = PositionGetDouble(POSITION_TP);
        long posType = PositionGetInteger(POSITION_TYPE);

        // CRITICAL: Never widen stop-loss
        if (posType == POSITION_TYPE_BUY && newSL < currentSL && currentSL > 0) {
            WriteRejection(signal, "SL_WIDEN_BLOCKED",
                StringFormat("Attempted to lower long SL from %.5f to %.5f",
                    currentSL, newSL));
            MoveToRejected(filename);
            return;
        }
        if (posType == POSITION_TYPE_SELL && newSL > currentSL && currentSL > 0) {
            WriteRejection(signal, "SL_WIDEN_BLOCKED",
                StringFormat("Attempted to raise short SL from %.5f to %.5f",
                    currentSL, newSL));
            MoveToRejected(filename);
            return;
        }

        if (g_trade.PositionModify(ticket, newSL, tp)) {
            WriteConfirmation(signalId, asset, "MODIFIED", ticket, 0, 0,
                StringFormat("SL modified: %.5f -> %.5f", currentSL, newSL));
        } else {
            WriteConfirmation(signalId, asset, "ERROR", ticket, 0, 0,
                StringFormat("SL modify failed: %s",
                    g_trade.ResultRetcodeDescription()));
        }
    } else {
        WriteConfirmation(signalId, "", "ERROR", ticket, 0, 0,
            "Position not found for SL modify");
    }

    MoveToProcessed(filename);
}

void ExecutePartialClose(CJAVal &signal, string filename) {
    string signalId = signal["signal_id"].ToStr();
    ulong ticket = (ulong)signal["ticket"].ToInt();
    double closePct = signal["close_percent"].ToDbl();

    if (PositionSelectByTicket(ticket)) {
        string asset = PositionGetString(POSITION_SYMBOL);
        double totalLots = PositionGetDouble(POSITION_VOLUME);
        double closeLots = totalLots * (closePct / 100.0);

        // Normalize to lot step
        double lotStep = SymbolInfoDouble(asset, SYMBOL_VOLUME_STEP);
        closeLots = MathFloor(closeLots / lotStep) * lotStep;

        double minLot = SymbolInfoDouble(asset, SYMBOL_VOLUME_MIN);
        if (closeLots < minLot) {
            closeLots = minLot;
        }

        // Don't close more than total
        if (closeLots >= totalLots) {
            closeLots = totalLots;
        }

        if (g_trade.PositionClosePartial(ticket, closeLots)) {
            WriteConfirmation(signalId, asset, "CLOSED", ticket,
                g_trade.ResultPrice(), 0,
                StringFormat("Partial close: %.4f of %.4f lots (%.0f%%)",
                    closeLots, totalLots, closePct));
        } else {
            WriteConfirmation(signalId, asset, "ERROR", ticket, 0, 0,
                StringFormat("Partial close failed: %s",
                    g_trade.ResultRetcodeDescription()));
        }
    }

    MoveToProcessed(filename);
}


// ═══════════════════════════════════════════════════════════════════════
// KILL SWITCH (EA-SIDE INDEPENDENT)
// ═══════════════════════════════════════════════════════════════════════

void CheckKillSwitch() {
    // 1. Daily drawdown hard check
    double equity = AccountInfoDouble(ACCOUNT_EQUITY);
    double dailyDD = 0;
    if (g_dailyStartEquity > 0) {
        dailyDD = (g_dailyStartEquity - equity) / g_dailyStartEquity * 100;
    }

    if (dailyDD >= MaxDailyDrawdownPct) {
        Print(StringFormat("KILL SWITCH: Daily DD %.2f%% >= %.2f%%",
            dailyDD, MaxDailyDrawdownPct));
        CloseAllPositions("Daily drawdown exceeded");
        g_eaState = EA_HALTED;
        SendNotification("EA KILL SWITCH: Daily DD " + DoubleToString(dailyDD, 2) + "%");
        WriteKillSwitchFile("Daily drawdown exceeded " +
            DoubleToString(MaxDailyDrawdownPct, 1) + "%");
        return;
    }

    // 2. Flash crash detection
    for (int i = 0; i < ArraySize(g_assets); i++) {
        double priceNow = SymbolInfoDouble(g_assets[i], SYMBOL_BID);
        double price5min = GetPrice5MinAgo(g_assets[i]);
        if (price5min > 0) {
            double movePct = MathAbs(priceNow - price5min) / price5min * 100;
            if (movePct > 5.0) {
                Print(StringFormat("KILL SWITCH: Flash crash %s moved %.2f%% in 5min",
                    g_assets[i], movePct));
                CloseAllPositions("Flash crash detected: " + g_assets[i]);
                g_eaState = EA_HALTED;
                SendNotification("FLASH CRASH: " + g_assets[i] +
                    " moved " + DoubleToString(movePct, 2) + "%");
                return;
            }
        }
    }

    // 3. Brain heartbeat timeout
    if (g_lastBrainHeartbeat > 0) {
        double brainSilence = (double)(TimeCurrent() - g_lastBrainHeartbeat);

        if (brainSilence > BrainTimeoutSec) {
            Print(StringFormat("KILL SWITCH: Brain silent for %.0fs", brainSilence));
            CloseAllPositions("Brain heartbeat lost");
            g_eaState = EA_HALTED;
            SendNotification("EA: Brain heartbeat lost for " +
                DoubleToString(brainSilence, 0) + "s");
            return;
        }
        else if (brainSilence > 60) {
            // Safe mode — tighten stops, no new entries
            if (g_eaState != EA_SAFE_MODE) {
                Print("Entering SAFE MODE: Brain silent for ", brainSilence, "s");
                g_eaState = EA_SAFE_MODE;
                TightenAllStopsToBreakeven();
            }
        }
    }

    // 4. Connection check
    if (!TerminalInfoInteger(TERMINAL_CONNECTED)) {
        static datetime lastDisconnect = 0;
        if (lastDisconnect == 0) {
            lastDisconnect = TimeCurrent();
        }
        double disconnectTime = (double)(TimeCurrent() - lastDisconnect);
        if (disconnectTime > 300) {
            CloseAllPositions("Connection lost > 5 minutes");
            g_eaState = EA_HALTED;
        }
    }
}

void CheckKillSwitchFile() {
    string path = SharedDir + "control\\kill_switch.json";
    if (!FileExists(path)) return;

    string content = ReadFileContents(path);
    if (content == "") return;

    CJAVal ks;
    if (!ks.Deserialize(content)) return;

    if (ks["activated"].ToBool()) {
        Print("Kill switch file detected: ", ks["reason"].ToStr());
        CloseAllPositions("Kill switch file: " + ks["reason"].ToStr());
        g_eaState = EA_HALTED;
    }
}

void CloseAllPositions(string reason) {
    Print("CLOSING ALL POSITIONS: ", reason);

    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        if (g_posInfo.SelectByIndex(i)) {
            string symbol = g_posInfo.Symbol();
            // Only close positions for our managed assets
            bool isOurAsset = false;
            for (int j = 0; j < ArraySize(g_assets); j++) {
                if (symbol == g_assets[j]) {
                    isOurAsset = true;
                    break;
                }
            }

            if (isOurAsset) {
                if (!g_trade.PositionClose(g_posInfo.Ticket())) {
                    Print("WARNING: Failed to close ", symbol,
                          " ticket ", g_posInfo.Ticket(),
                          ": ", g_trade.ResultRetcodeDescription());
                    // Retry once
                    Sleep(500);
                    g_trade.PositionClose(g_posInfo.Ticket());
                }
            }
        }
    }
}

void TightenAllStopsToBreakeven() {
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        if (g_posInfo.SelectByIndex(i)) {
            double entry = g_posInfo.PriceOpen();
            double currentSL = g_posInfo.StopLoss();
            double tp = g_posInfo.TakeProfit();
            long type = g_posInfo.PositionType();

            // Only tighten if position is in profit
            if (type == POSITION_TYPE_BUY) {
                double currentPrice = SymbolInfoDouble(g_posInfo.Symbol(), SYMBOL_BID);
                if (currentPrice > entry && (currentSL < entry || currentSL == 0)) {
                    g_trade.PositionModify(g_posInfo.Ticket(), entry, tp);
                    Print("Tightened long SL to breakeven: ", g_posInfo.Symbol());
                }
            } else {
                double currentPrice = SymbolInfoDouble(g_posInfo.Symbol(), SYMBOL_ASK);
                if (currentPrice < entry && (currentSL > entry || currentSL == 0)) {
                    g_trade.PositionModify(g_posInfo.Ticket(), entry, tp);
                    Print("Tightened short SL to breakeven: ", g_posInfo.Symbol());
                }
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════
// HEARTBEAT
// ═══════════════════════════════════════════════════════════════════════

void WriteEAHeartbeat() {
    g_heartbeatSequence++;

    string hb = StringFormat(
        "{"
        "\"type\":\"HEARTBEAT\","
        "\"source\":\"EA\","
        "\"timestamp_utc\":\"%s\","
        "\"sequence\":%d,"
        "\"state\":\"%s\","
        "\"open_positions\":%d,"
        "\"pending_signals\":%d,"
        "\"connection_status\":\"%s\","
        "\"terminal_connected\":%s"
        "}",
        TimeToString(TimeGMT(), TIME_DATE|TIME_SECONDS),
        g_heartbeatSequence,
        EnumToString(g_eaState),
        PositionsTotal(),
        CountPendingSignals(),
        TerminalInfoInteger(TERMINAL_CONNECTED) ? "CONNECTED" : "DISCONNECTED",
        TerminalInfoInteger(TERMINAL_CONNECTED) ? "true" : "false"
    );

    WriteFileAtomic(SharedDir + "heartbeat\\ea.json", hb);
}

void CheckBrainHeartbeat() {
    string path = SharedDir + "heartbeat\\brain.json";
    string content = ReadFileContents(path);
    if (content == "") return;

    CJAVal hb;
    if (!hb.Deserialize(content)) return;

    string tsStr = hb["timestamp_utc"].ToStr();
    datetime ts = StringToTime(tsStr);
    g_lastBrainHeartbeat = ts;
}


// ═══════════════════════════════════════════════════════════════════════
// CONFIRMATION AND REPORTING
// ═══════════════════════════════════════════════════════════════════════

void WriteConfirmation(string signalId, string asset, string status,
                       ulong ticket, double fillPrice, double slippage,
                       string comment) {

    double equity = AccountInfoDouble(ACCOUNT_EQUITY);
    double balance = AccountInfoDouble(ACCOUNT_BALANCE);

    string conf = StringFormat(
        "{"
        "\"confirmation_id\":\"CONF-%s-%s\","
        "\"signal_id\":\"%s\","
        "\"timestamp_utc\":\"%s\","
        "\"status\":\"%s\","
        "\"ticket\":%d,"
        "\"asset\":\"%s\","
        "\"fill_price\":%.5f,"
        "\"slippage_usd\":%.2f,"
        "\"execution_time_ms\":0,"
        "\"account_equity_after\":%.2f,"
        "\"account_balance\":%.2f,"
        "\"open_positions_count\":%d,"
        "\"comment\":\"%s\""
        "}",
        TimeToString(TimeGMT(), TIME_DATE|TIME_SECONDS),
        StringSubstr(signalId, StringLen(signalId) - 4),
        signalId,
        TimeToString(TimeGMT(), TIME_DATE|TIME_SECONDS),
        status,
        ticket,
        asset,
        fillPrice,
        slippage,
        equity,
        balance,
        PositionsTotal(),
        comment
    );

    string filename = StringFormat("CONF-%s.json",
        StringSubstr(signalId, 4));  // Remove "SIG-" prefix

    WriteFileAtomic(SharedDir + "signals\\filled\\" + filename, conf);
}

void WriteRejection(CJAVal &signal, string reason, string detail) {
    string signalId = signal["signal_id"].ToStr();
    string asset = signal["asset"].ToStr();

    string rej = StringFormat(
        "{"
        "\"signal_id\":\"%s\","
        "\"status\":\"REJECTED_VALIDATOR\","
        "\"rejection_reason\":\"%s\","
        "\"rejection_detail\":\"%s\","
        "\"timestamp_utc\":\"%s\""
        "}",
        signalId, reason, detail,
        TimeToString(TimeGMT(), TIME_DATE|TIME_SECONDS)
    );

    string filename = StringFormat("REJ-%s.json",
        StringSubstr(signalId, 4));

    WriteFileAtomic(SharedDir + "signals\\rejected\\" + filename, rej);
}

void WritePositionUpdate() {
    // Build current positions JSON array
    string positions = "[";
    bool first = true;

    for (int i = 0; i < PositionsTotal(); i++) {
        if (g_posInfo.SelectByIndex(i)) {
            string symbol = g_posInfo.Symbol();

            // Only report our managed assets
            bool isOurs = false;
            for (int j = 0; j < ArraySize(g_assets); j++) {
                if (symbol == g_assets[j]) { isOurs = true; break; }
            }
            if (!isOurs) continue;

            if (!first) positions += ",";
            first = false;

            double unrealizedPnl = g_posInfo.Profit() + g_posInfo.Swap();
            double slDist = MathAbs(g_posInfo.PriceOpen() - g_posInfo.StopLoss());
            double currentRR = 0;
            if (slDist > 0) {
                if (g_posInfo.PositionType() == POSITION_TYPE_BUY)
                    currentRR = (g_posInfo.PriceCurrent() - g_posInfo.PriceOpen()) / slDist;
                else
                    currentRR = (g_posInfo.PriceOpen() - g_posInfo.PriceCurrent()) / slDist;
            }

            positions += StringFormat(
                "{\"ticket\":%d,\"asset\":\"%s\",\"direction\":\"%s\","
                "\"open_price\":%.5f,\"current_price\":%.5f,"
                "\"current_sl\":%.5f,\"current_tp\":%.5f,"
                "\"lots\":%.4f,\"unrealized_pnl\":%.2f,"
                "\"current_rr\":%.2f}",
                g_posInfo.Ticket(), symbol,
                g_posInfo.PositionType() == POSITION_TYPE_BUY ? "LONG" : "SHORT",
                g_posInfo.PriceOpen(), g_posInfo.PriceCurrent(),
                g_posInfo.StopLoss(), g_posInfo.TakeProfit(),
                g_posInfo.Volume(), unrealizedPnl, currentRR
            );
        }
    }
    positions += "]";

    double equity = AccountInfoDouble(ACCOUNT_EQUITY);
    double balance = AccountInfoDouble(ACCOUNT_BALANCE);
    double marginUsed = AccountInfoDouble(ACCOUNT_MARGIN);
    double marginFree = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
    double marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);

    string update = StringFormat(
        "{\"type\":\"POSITION_UPDATE\","
        "\"timestamp_utc\":\"%s\","
        "\"positions\":%s,"
        "\"account\":{\"balance\":%.2f,\"equity\":%.2f,"
        "\"margin_used\":%.2f,\"margin_free\":%.2f,"
        "\"margin_level_pct\":%.2f}}",
        TimeToString(TimeGMT(), TIME_DATE|TIME_SECONDS),
        positions, balance, equity, marginUsed, marginFree, marginLevel
    );

    WriteFileAtomic(SharedDir + "positions\\current.json", update);
}


// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

void CheckDailyReset() {
    MqlDateTime dtNow;
    TimeGMT(dtNow);

    MqlDateTime dtStart;
    TimeToStruct(g_dailyStartTime, dtStart);

    // New day detected
    if (dtNow.day != dtStart.day) {
        Print("Daily reset. Previous equity: ", g_dailyStartEquity,
              " Current: ", AccountInfoDouble(ACCOUNT_EQUITY));
        g_dailyStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
        g_dailyStartTime = TimeGMT();

        // Clear halted state if it was a 24H halt and time has passed
        if (g_eaState == EA_HALTED) {
            // Check kill switch file for resume time
            // Only auto-resume if halt type was HALT_24H
            Print("New day — checking if halt can be lifted");
        }
    }
}

int CountPositionsForAsset(string asset) {
    int count = 0;
    for (int i = 0; i < PositionsTotal(); i++) {
        if (g_posInfo.SelectByIndex(i)) {
            if (g_posInfo.Symbol() == asset) count++;
        }
    }
    return count;
}

double ComputePortfolioRisk() {
    // Simplified: sum of (SL distance × lots × point value) / equity
    double totalRisk = 0;
    double equity = AccountInfoDouble(ACCOUNT_EQUITY);

    for (int i = 0; i < PositionsTotal(); i++) {
        if (g_posInfo.SelectByIndex(i)) {
            double entry = g_posInfo.PriceOpen();
            double sl = g_posInfo.StopLoss();
            if (sl <= 0) continue;

            double slDist = MathAbs(entry - sl);
            double lots = g_posInfo.Volume();
            double tickValue = SymbolInfoDouble(g_posInfo.Symbol(), SYMBOL_TRADE_TICK_VALUE);
            double tickSize = SymbolInfoDouble(g_posInfo.Symbol(), SYMBOL_TRADE_TICK_SIZE);

            double riskUSD = (slDist / tickSize) * tickValue * lots;
            totalRisk += riskUSD / equity;
        }
    }

    return totalRisk;
}

double GetTypicalSpread(string asset) {
    if (asset == "BTCUSD") return 30.0;
    if (asset == "ETHUSD") return 3.0;
    if (asset == "XAUUSD") return 0.30;
    return 1.0;
}

double GetPrice5MinAgo(string asset) {
    // Use stored price history
    // Stub — implement with g_priceHistory array
    return 0;
}

int CountPendingSignals() {
    string path = SharedDir + "signals\\pending\\";
    string filename;
    int count = 0;
    long handle = FileFindFirst(path + "*.json", filename, 0);
    if (handle != INVALID_HANDLE) {
        do { count++; } while (FileFindNext(handle, filename));
        FileFindClose(handle);
    }
    return count;
}

bool ValidateChecksum(CJAVal &signal) {
    // Remove checksum field, serialize, compute SHA256, compare
    // Stub — implement with SHA256 library
    return true;  // For now, trust
}

string ReadFileContents(string path) {
    int handle = FileOpen(path, FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON);
    if (handle == INVALID_HANDLE) return "";
    string content = "";
    while (!FileIsEnding(handle)) {
        content += FileReadString(handle) + "\n";
    }
    FileClose(handle);
    return content;
}

void WriteFileAtomic(string path, string content) {
    string tmpPath = path + ".tmp";
    int handle = FileOpen(tmpPath, FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
    if (handle != INVALID_HANDLE) {
        FileWriteString(handle, content);
        FileClose(handle);
        FileMove(tmpPath, 0, path, FILE_REWRITE);
    }
}

void MoveToProcessed(string filename) {
    string src = SharedDir + "signals\\pending\\" + filename;
    string dst = SharedDir + "signals\\processed\\" + filename;
    FileMove(src, 0, dst, FILE_REWRITE);
}

void MoveToRejected(string filename) {
    string src = SharedDir + "signals\\pending\\" + filename;
    string dst = SharedDir + "signals\\rejected_source\\" + filename;
    FileMove(src, 0, dst, FILE_REWRITE);
}

bool FileExists(string path) {
    int handle = FileOpen(path, FILE_READ|FILE_COMMON);
    if (handle != INVALID_HANDLE) {
        FileClose(handle);
        return true;
    }
    return false;
}

bool FolderExists(string path) {
    // MQL5 folder existence check
    return true;  // Stub
}

void LoadPersistedState() {
    // Check for halt state file, load previous equity baselines
    // Stub
}

void WriteKillSwitchFile(string reason) {
    string content = StringFormat(
        "{\"activated\":true,\"reason\":\"%s\",\"timestamp_utc\":\"%s\","
        "\"source\":\"EA\"}",
        reason, TimeToString(TimeGMT(), TIME_DATE|TIME_SECONDS));
    WriteFileAtomic(SharedDir + "control\\kill_switch.json", content);
}

void UpdatePriceHistory() {
    // Record current prices for flash crash detection
    // Stub — maintain circular buffer per asset
}
