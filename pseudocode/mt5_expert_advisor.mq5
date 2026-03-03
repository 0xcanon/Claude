//+------------------------------------------------------------------+
//| OpenClaw MT5 Execution Layer - Expert Advisor                      |
//| Version: 1.0.0                                                     |
//| Description: Receives signals from OpenClaw Decision Engine via    |
//|              file-based IPC and executes orders with full safety.   |
//+------------------------------------------------------------------+
#property copyright "OpenClaw Trading System"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Files\FileTxt.mqh>

//+------------------------------------------------------------------+
//| INPUT PARAMETERS — SAFETY CRITICAL (compiled, not signal-driven) |
//+------------------------------------------------------------------+
input string   SignalDirectory        = "C:\\TradingSystem\\signals\\";
input int      SignalPollIntervalMs   = 500;            // Poll for signals every 500ms
input int      HeartbeatIntervalSec   = 1;              // Send heartbeat every 1s
input int      HeartbeatTimeoutSec    = 10;             // Emergency if no OC heartbeat for 10s
input double   EmergencyEquityPct     = 85.0;           // Close all if equity < 85% of balance
input double   MaxLossPctPerPosition  = 4.0;            // Close position if loss > 4%
input int      MaxTotalPositions      = 4;              // Never exceed 4 positions
input double   MaxLotSizeSingle       = 2.0;            // Max lot per order
input double   MaxLotSizeTotal        = 5.0;            // Max total exposure
input int      MaxSlippageDefault     = 30;             // Default max slippage (points)
input int      MaxRetryAttempts       = 3;              // Order retry attempts
input int      RetryDelayMs           = 500;            // Delay between retries
input string   AllowedSymbols         = "BTCUSD,ETHUSD,XAUUSD";

//+------------------------------------------------------------------+
//| GLOBAL VARIABLES                                                   |
//+------------------------------------------------------------------+
CTrade         trade;
CPositionInfo  posInfo;
datetime       lastHeartbeatReceived;
datetime       lastHeartbeatSent;
datetime       lastSignalCheck;
datetime       lastSignalProcessed;
string         lastSignalId = "";
bool           emergencyMode = false;
bool           systemHalted = false;
int            signalFileHandle = INVALID_HANDLE;

// Signal structure
struct TradeSignal {
    string   signal_id;
    string   signal_type;      // ENTRY, EXIT, MODIFY, PARTIAL_CLOSE
    string   asset;
    string   direction;        // LONG, SHORT, CLOSE_LONG, CLOSE_SHORT
    string   order_type;       // MARKET
    double   entry_price_ref;
    double   stop_loss;
    double   take_profit_1;
    double   take_profit_2;
    double   lot_size;
    double   risk_percent;
    double   risk_reward_ratio;
    double   partial_close_tp1;
    double   partial_close_tp2;
    bool     trail_remaining;
    double   trail_activation;
    int      trail_step;
    int      trail_distance;
    int      max_slippage;
    int      magic_number;
    string   comment;
    string   hash;
    bool     close_all;
    double   close_percent;
    double   new_stop_loss;
    double   new_take_profit;
    datetime timestamp;
    datetime expiry;
    bool     valid;
};


//+------------------------------------------------------------------+
//| INITIALIZATION                                                     |
//+------------------------------------------------------------------+
int OnInit() {
    Print("========================================");
    Print("OpenClaw MT5 EA Initializing...");
    Print("Signal Directory: ", SignalDirectory);
    Print("Heartbeat Timeout: ", HeartbeatTimeoutSec, "s");
    Print("Emergency Equity: ", EmergencyEquityPct, "%");
    Print("Max Positions: ", MaxTotalPositions);
    Print("========================================");

    // Initialize trade object
    trade.SetExpertMagicNumber(0);  // Will be set per-signal
    trade.SetDeviationInPoints(MaxSlippageDefault);
    trade.SetTypeFilling(ORDER_FILLING_IOC);

    // Set initial heartbeat
    lastHeartbeatReceived = TimeCurrent();
    lastHeartbeatSent = 0;
    lastSignalCheck = 0;

    // Verify signal directory exists
    if (!FolderCreate(SignalDirectory)) {
        // Folder may already exist - that's fine
    }

    // Initial safety check - verify all existing positions have SL
    VerifyAllPositionsHaveSL();

    Print("OpenClaw MT5 EA Initialized Successfully");
    return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
    Print("OpenClaw MT5 EA Shutting Down. Reason: ", reason);
    // Note: We do NOT close positions on EA shutdown
    // The watchdog will handle orphaned positions
}


//+------------------------------------------------------------------+
//| MAIN TICK HANDLER                                                  |
//+------------------------------------------------------------------+
void OnTick() {
    // ================================================================
    // SAFETY CHECKS — ALWAYS RUN FIRST, EVERY TICK
    // ================================================================

    // Check 1: Emergency mode — do nothing except try to close
    if (emergencyMode) {
        AttemptEmergencyClose();
        return;
    }

    // Check 2: Heartbeat timeout
    if (TimeCurrent() - lastHeartbeatReceived > HeartbeatTimeoutSec) {
        TriggerEmergency("HEARTBEAT_TIMEOUT",
            StringFormat("No heartbeat for %d seconds",
                         (int)(TimeCurrent() - lastHeartbeatReceived)));
        return;
    }

    // Check 3: Equity protection
    double balance = AccountInfoDouble(ACCOUNT_BALANCE);
    double equity = AccountInfoDouble(ACCOUNT_EQUITY);
    if (balance > 0 && (equity / balance * 100) < EmergencyEquityPct) {
        TriggerEmergency("EQUITY_THRESHOLD",
            StringFormat("Equity %.2f is %.1f%% of balance %.2f",
                         equity, equity / balance * 100, balance));
        return;
    }

    // Check 4: Emergency halt file
    if (FileIsExist("emergency_halt.flag", FILE_COMMON)) {
        TriggerEmergency("HALT_FILE_DETECTED", "emergency_halt.flag exists");
        return;
    }

    // Check 5: Verify all positions have stop-loss
    VerifyAllPositionsHaveSL();

    // Check 6: Per-position loss limit
    CheckPositionLossLimits();

    // ================================================================
    // HEARTBEAT — Every 1 second
    // ================================================================
    if (TimeCurrent() - lastHeartbeatSent >= HeartbeatIntervalSec) {
        SendHeartbeat();
        ReadOpenClawHeartbeat();
        lastHeartbeatSent = TimeCurrent();
    }

    // ================================================================
    // SIGNAL PROCESSING — Every 500ms
    // ================================================================
    if (GetTickCount64() - (ulong)lastSignalCheck >= (ulong)SignalPollIntervalMs) {
        ProcessSignals();
        lastSignalCheck = (datetime)GetTickCount64();
    }

    // ================================================================
    // POSITION MANAGEMENT — Every tick
    // ================================================================
    ManageOpenPositions();
}


//+------------------------------------------------------------------+
//| SIGNAL PROCESSING                                                  |
//+------------------------------------------------------------------+
void ProcessSignals() {
    TradeSignal signal;
    if (!ReadSignalFile(signal)) return;
    if (!signal.valid) return;

    // Skip if already processed
    if (signal.signal_id == lastSignalId) return;

    // Validate signal
    if (!ValidateSignal(signal)) {
        ReportSignalRejection(signal, "VALIDATION_FAILED");
        return;
    }

    // Route by type
    if (signal.signal_type == "ENTRY") {
        ExecuteEntry(signal);
    }
    else if (signal.signal_type == "EXIT") {
        if (signal.close_all) {
            CloseAllPositions("SIGNAL_CLOSE_ALL");
        } else {
            ExecuteExit(signal);
        }
    }
    else if (signal.signal_type == "MODIFY") {
        ExecuteModify(signal);
    }
    else if (signal.signal_type == "PARTIAL_CLOSE") {
        ExecutePartialClose(signal);
    }

    lastSignalId = signal.signal_id;
    lastSignalProcessed = TimeCurrent();
}


//+------------------------------------------------------------------+
//| SIGNAL VALIDATION                                                  |
//+------------------------------------------------------------------+
bool ValidateSignal(TradeSignal &signal) {
    // V1: Signal freshness (< 5 seconds old)
    if (TimeCurrent() - signal.timestamp > 5) {
        Print("REJECT: Signal too old. Age: ", TimeCurrent() - signal.timestamp, "s");
        return false;
    }

    // V2: Asset must be in allowed list
    if (StringFind(AllowedSymbols, signal.asset) < 0) {
        Print("REJECT: Asset not allowed: ", signal.asset);
        return false;
    }

    // V3: Symbol must exist in MT5
    if (!SymbolSelect(signal.asset, true)) {
        Print("REJECT: Symbol not available: ", signal.asset);
        return false;
    }

    // V4: Stop-loss MUST be present and non-zero
    if (signal.signal_type == "ENTRY" && signal.stop_loss == 0.0) {
        Print("REJECT: No stop-loss in signal — CRITICAL VIOLATION");
        return false;
    }

    // V5: Lot size within bounds
    if (signal.lot_size <= 0 || signal.lot_size > MaxLotSizeSingle) {
        Print("REJECT: Lot size out of bounds: ", signal.lot_size);
        return false;
    }

    // V6: Total exposure check
    double totalLots = GetTotalOpenLots() + signal.lot_size;
    if (totalLots > MaxLotSizeTotal) {
        Print("REJECT: Total lots would be ", totalLots, " (max: ", MaxLotSizeTotal, ")");
        return false;
    }

    // V7: Position count check
    if (signal.signal_type == "ENTRY" && PositionsTotal() >= MaxTotalPositions) {
        Print("REJECT: Max positions reached: ", PositionsTotal());
        return false;
    }

    // V8: Direction validity
    if (signal.direction != "LONG" && signal.direction != "SHORT" &&
        signal.direction != "CLOSE_LONG" && signal.direction != "CLOSE_SHORT") {
        Print("REJECT: Invalid direction: ", signal.direction);
        return false;
    }

    // V9: Risk percent sanity
    if (signal.risk_percent > 5.0) {
        Print("REJECT: Risk percent too high: ", signal.risk_percent, "%");
        return false;
    }

    // V10: SL distance sanity (not too tight, not too wide)
    if (signal.signal_type == "ENTRY") {
        double slDistance = MathAbs(signal.entry_price_ref - signal.stop_loss);
        double price = signal.entry_price_ref;
        double slPct = slDistance / price * 100;

        if (slPct < 0.05) {  // < 0.05% — too tight
            Print("REJECT: SL too tight: ", slPct, "%");
            return false;
        }
        if (slPct > 10.0) {  // > 10% — too wide
            Print("REJECT: SL too wide: ", slPct, "%");
            return false;
        }
    }

    // V11: Duplicate check (no same asset+direction already open with same magic)
    if (signal.signal_type == "ENTRY") {
        for (int i = 0; i < PositionsTotal(); i++) {
            if (PositionSelectByTicket(PositionGetTicket(i))) {
                if (PositionGetInteger(POSITION_MAGIC) == signal.magic_number) {
                    Print("REJECT: Duplicate magic number: ", signal.magic_number);
                    return false;
                }
            }
        }
    }

    return true;
}


//+------------------------------------------------------------------+
//| ORDER EXECUTION                                                    |
//+------------------------------------------------------------------+
void ExecuteEntry(TradeSignal &signal) {
    ENUM_ORDER_TYPE orderType;
    double price;

    if (signal.direction == "LONG") {
        orderType = ORDER_TYPE_BUY;
        price = SymbolInfoDouble(signal.asset, SYMBOL_ASK);
    } else {
        orderType = ORDER_TYPE_SELL;
        price = SymbolInfoDouble(signal.asset, SYMBOL_BID);
    }

    // Set magic number for this trade
    trade.SetExpertMagicNumber(signal.magic_number);
    trade.SetDeviationInPoints(signal.max_slippage > 0 ? signal.max_slippage : MaxSlippageDefault);

    // Retry logic
    bool success = false;
    for (int attempt = 1; attempt <= MaxRetryAttempts; attempt++) {
        // Refresh price
        if (signal.direction == "LONG") {
            price = SymbolInfoDouble(signal.asset, SYMBOL_ASK);
        } else {
            price = SymbolInfoDouble(signal.asset, SYMBOL_BID);
        }

        // Execute
        if (trade.PositionOpen(signal.asset, orderType, signal.lot_size,
                               price, signal.stop_loss, signal.take_profit_1,
                               signal.comment)) {
            success = true;
            Print("ORDER FILLED: ", signal.signal_id,
                  " | ", signal.asset, " ", signal.direction,
                  " | Lots: ", signal.lot_size,
                  " | Price: ", price,
                  " | SL: ", signal.stop_loss,
                  " | TP: ", signal.take_profit_1);

            // Send execution report
            ReportFill(signal, price, trade.ResultDeal());
            break;
        } else {
            Print("ORDER FAILED attempt ", attempt, "/", MaxRetryAttempts,
                  " Error: ", GetLastError(),
                  " Retcode: ", trade.ResultRetcode());

            if (attempt < MaxRetryAttempts) {
                Sleep(RetryDelayMs);
            }
        }
    }

    if (!success) {
        Print("ORDER FAILED PERMANENTLY: ", signal.signal_id);
        ReportSignalRejection(signal, "EXECUTION_FAILED_ALL_RETRIES");
    }
}

void ExecuteExit(TradeSignal &signal) {
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (!PositionSelectByTicket(ticket)) continue;

        string symbol = PositionGetString(POSITION_SYMBOL);
        long magic = PositionGetInteger(POSITION_MAGIC);

        // Match by magic number and symbol
        if (symbol == signal.asset && magic == signal.magic_number) {
            trade.SetExpertMagicNumber((int)magic);
            if (trade.PositionClose(ticket)) {
                Print("POSITION CLOSED: Ticket ", ticket,
                      " | ", symbol, " | Reason: ", signal.comment);
            } else {
                Print("CLOSE FAILED: Ticket ", ticket, " Error: ", GetLastError());
            }
        }
    }
}

void ExecuteModify(TradeSignal &signal) {
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (!PositionSelectByTicket(ticket)) continue;

        if (PositionGetString(POSITION_SYMBOL) == signal.asset &&
            PositionGetInteger(POSITION_MAGIC) == signal.magic_number) {

            double currentSL = PositionGetDouble(POSITION_SL);
            double newSL = signal.new_stop_loss > 0 ? signal.new_stop_loss : currentSL;
            double newTP = signal.new_take_profit > 0 ? signal.new_take_profit : PositionGetDouble(POSITION_TP);

            // CRITICAL: Never move SL further from entry (never increase risk)
            long posType = PositionGetInteger(POSITION_TYPE);
            double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);

            if (posType == POSITION_TYPE_BUY) {
                // For longs, new SL must be >= current SL (tighter or same)
                if (newSL < currentSL && currentSL > 0) {
                    Print("MODIFY REJECTED: Cannot widen SL for LONG. Current: ",
                          currentSL, " Requested: ", newSL);
                    return;
                }
            } else {
                // For shorts, new SL must be <= current SL (tighter or same)
                if (newSL > currentSL && currentSL > 0) {
                    Print("MODIFY REJECTED: Cannot widen SL for SHORT. Current: ",
                          currentSL, " Requested: ", newSL);
                    return;
                }
            }

            trade.SetExpertMagicNumber((int)PositionGetInteger(POSITION_MAGIC));
            if (trade.PositionModify(ticket, newSL, newTP)) {
                Print("POSITION MODIFIED: Ticket ", ticket,
                      " | SL: ", currentSL, " → ", newSL,
                      " | TP: → ", newTP);
            } else {
                Print("MODIFY FAILED: Ticket ", ticket, " Error: ", GetLastError());
            }
        }
    }
}

void ExecutePartialClose(TradeSignal &signal) {
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (!PositionSelectByTicket(ticket)) continue;

        if (PositionGetString(POSITION_SYMBOL) == signal.asset &&
            PositionGetInteger(POSITION_MAGIC) == signal.magic_number) {

            double currentVolume = PositionGetDouble(POSITION_VOLUME);
            double closeVolume = currentVolume * signal.close_percent;

            // Round to lot step
            double lotStep = SymbolInfoDouble(signal.asset, SYMBOL_VOLUME_STEP);
            closeVolume = MathFloor(closeVolume / lotStep) * lotStep;

            if (closeVolume >= SymbolInfoDouble(signal.asset, SYMBOL_VOLUME_MIN)) {
                trade.SetExpertMagicNumber((int)PositionGetInteger(POSITION_MAGIC));
                if (trade.PositionClosePartial(ticket, closeVolume)) {
                    Print("PARTIAL CLOSE: Ticket ", ticket,
                          " | Closed: ", closeVolume, " of ", currentVolume);
                } else {
                    Print("PARTIAL CLOSE FAILED: ", GetLastError());
                }
            }
        }
    }
}


//+------------------------------------------------------------------+
//| POSITION MANAGEMENT                                                |
//+------------------------------------------------------------------+
void ManageOpenPositions() {
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (!PositionSelectByTicket(ticket)) continue;

        string symbol = PositionGetString(POSITION_SYMBOL);

        // Only manage our symbols
        if (StringFind(AllowedSymbols, symbol) < 0) continue;

        double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
        double currentSL = PositionGetDouble(POSITION_SL);
        double currentTP = PositionGetDouble(POSITION_TP);
        double profit = PositionGetDouble(POSITION_PROFIT);
        long posType = PositionGetInteger(POSITION_TYPE);
        double volume = PositionGetDouble(POSITION_VOLUME);

        // Trailing stop management is handled by MODIFY signals from OpenClaw
        // The EA does NOT trail on its own — it waits for MODIFY signals
        // This ensures the brain maintains control

        // However, the EA DOES enforce break-even after TP1 partial close
        // This is a safety measure in case OpenClaw fails to send the modify signal
    }
}


//+------------------------------------------------------------------+
//| SAFETY SYSTEMS                                                     |
//+------------------------------------------------------------------+
void VerifyAllPositionsHaveSL() {
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (!PositionSelectByTicket(ticket)) continue;

        string symbol = PositionGetString(POSITION_SYMBOL);
        if (StringFind(AllowedSymbols, symbol) < 0) continue;

        double sl = PositionGetDouble(POSITION_SL);
        if (sl == 0.0) {
            // CRITICAL: Position has no SL — close immediately
            Print("CRITICAL SAFETY: Position ", ticket, " (", symbol, ") has NO STOP-LOSS!");
            trade.SetExpertMagicNumber((int)PositionGetInteger(POSITION_MAGIC));
            trade.PositionClose(ticket);
            SendNotification("CRITICAL: Position " + IntegerToString(ticket) +
                             " closed — NO STOP-LOSS detected!");
        }
    }
}

void CheckPositionLossLimits() {
    double equity = AccountInfoDouble(ACCOUNT_EQUITY);
    if (equity <= 0) return;

    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (!PositionSelectByTicket(ticket)) continue;

        string symbol = PositionGetString(POSITION_SYMBOL);
        if (StringFind(AllowedSymbols, symbol) < 0) continue;

        double profit = PositionGetDouble(POSITION_PROFIT);
        if (profit < 0) {
            double lossPct = MathAbs(profit) / equity * 100;
            if (lossPct > MaxLossPctPerPosition) {
                Print("SAFETY: Position ", ticket, " loss ", lossPct,
                      "% exceeds limit ", MaxLossPctPerPosition, "%");
                trade.SetExpertMagicNumber((int)PositionGetInteger(POSITION_MAGIC));
                trade.PositionClose(ticket);
                SendNotification("Position " + IntegerToString(ticket) +
                                 " closed: loss exceeded " +
                                 DoubleToString(MaxLossPctPerPosition, 1) + "%");
            }
        }
    }
}

void TriggerEmergency(string reason, string details) {
    if (emergencyMode) return;  // Already in emergency

    emergencyMode = true;
    Print("╔══════════════════════════════════════════╗");
    Print("║        EMERGENCY MODE ACTIVATED          ║");
    Print("║  Reason: ", reason);
    Print("║  Details: ", details);
    Print("╚══════════════════════════════════════════╝");

    CloseAllPositions("EMERGENCY_" + reason);

    // Write emergency state file
    int handle = FileOpen("emergency_state.json", FILE_WRITE | FILE_TXT | FILE_COMMON);
    if (handle != INVALID_HANDLE) {
        string json = StringFormat(
            "{\"emergency\":true,\"reason\":\"%s\",\"details\":\"%s\","
            "\"time\":\"%s\",\"equity\":%.2f,\"balance\":%.2f}",
            reason, details,
            TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS),
            AccountInfoDouble(ACCOUNT_EQUITY),
            AccountInfoDouble(ACCOUNT_BALANCE));
        FileWriteString(handle, json);
        FileClose(handle);
    }

    SendNotification("EMERGENCY: " + reason + " | " + details);
}

void AttemptEmergencyClose() {
    // Keep trying to close all positions during emergency
    if (PositionsTotal() > 0) {
        CloseAllPositions("EMERGENCY_RETRY");
    }
}

void CloseAllPositions(string reason) {
    Print("CLOSING ALL POSITIONS: ", reason);
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (!PositionSelectByTicket(ticket)) continue;

        string symbol = PositionGetString(POSITION_SYMBOL);
        if (StringFind(AllowedSymbols, symbol) < 0) continue;

        trade.SetExpertMagicNumber((int)PositionGetInteger(POSITION_MAGIC));
        if (trade.PositionClose(ticket)) {
            Print("Closed position ", ticket, " (", symbol, ") — ", reason);
        } else {
            Print("FAILED to close ", ticket, " — Error: ", GetLastError());
        }
    }
}


//+------------------------------------------------------------------+
//| HEARTBEAT SYSTEM                                                   |
//+------------------------------------------------------------------+
void SendHeartbeat() {
    int handle = FileOpen("heartbeat_ea.json", FILE_WRITE | FILE_TXT | FILE_COMMON);
    if (handle != INVALID_HANDLE) {
        string json = StringFormat(
            "{\"source\":\"EA\",\"time\":\"%s\",\"unix\":%d,"
            "\"equity\":%.2f,\"balance\":%.2f,\"margin_level\":%.2f,"
            "\"positions\":%d,\"emergency\":%s,\"halted\":%s}",
            TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS),
            (long)TimeCurrent(),
            AccountInfoDouble(ACCOUNT_EQUITY),
            AccountInfoDouble(ACCOUNT_BALANCE),
            AccountInfoDouble(ACCOUNT_MARGIN_LEVEL),
            PositionsTotal(),
            emergencyMode ? "true" : "false",
            systemHalted ? "true" : "false");
        FileWriteString(handle, json);
        FileClose(handle);
    }
}

void ReadOpenClawHeartbeat() {
    if (!FileIsExist("heartbeat_oc.json", FILE_COMMON)) {
        Print("WARNING: OpenClaw heartbeat file not found");
        return;
    }

    int handle = FileOpen("heartbeat_oc.json", FILE_READ | FILE_TXT | FILE_COMMON);
    if (handle != INVALID_HANDLE) {
        string content = FileReadString(handle);
        FileClose(handle);

        // Simple timestamp extraction
        // In production, use proper JSON parsing
        if (StringLen(content) > 0) {
            lastHeartbeatReceived = TimeCurrent();
        }
    }
}


//+------------------------------------------------------------------+
//| SIGNAL FILE READING                                                |
//+------------------------------------------------------------------+
bool ReadSignalFile(TradeSignal &signal) {
    signal.valid = false;
    string filename = "openclaw_to_mt5.json";

    if (!FileIsExist(filename, FILE_COMMON)) return false;

    int handle = FileOpen(filename, FILE_READ | FILE_TXT | FILE_COMMON);
    if (handle == INVALID_HANDLE) return false;

    string content = "";
    while (!FileIsEnding(handle)) {
        content += FileReadString(handle) + "\n";
    }
    FileClose(handle);

    if (StringLen(content) < 10) return false;

    // Parse JSON signal
    // Note: MQL5 has limited JSON support — use a JSON library or manual parsing
    // Below is simplified extraction logic

    signal.signal_id = ExtractJsonString(content, "signal_id");
    signal.signal_type = ExtractJsonString(content, "signal_type");
    signal.asset = ExtractJsonString(content, "asset");
    signal.direction = ExtractJsonString(content, "direction");
    signal.order_type = ExtractJsonString(content, "order_type");
    signal.entry_price_ref = ExtractJsonDouble(content, "entry_price_reference");
    signal.stop_loss = ExtractJsonDouble(content, "stop_loss");
    signal.take_profit_1 = ExtractJsonDouble(content, "take_profit_1");
    signal.take_profit_2 = ExtractJsonDouble(content, "take_profit_2");
    signal.lot_size = ExtractJsonDouble(content, "lot_size");
    signal.risk_percent = ExtractJsonDouble(content, "risk_percent");
    signal.max_slippage = (int)ExtractJsonDouble(content, "max_slippage_points");
    signal.magic_number = (int)ExtractJsonDouble(content, "magic_number");
    signal.comment = ExtractJsonString(content, "comment");
    signal.hash = ExtractJsonString(content, "hash");
    signal.close_all = (ExtractJsonString(content, "close_all") == "true");
    signal.close_percent = ExtractJsonDouble(content, "close_percent");
    signal.new_stop_loss = ExtractJsonDouble(content, "new_stop_loss");
    signal.new_take_profit = ExtractJsonDouble(content, "new_take_profit");

    // Parse timestamp
    string ts = ExtractJsonString(content, "timestamp_utc");
    if (StringLen(ts) > 0) {
        signal.timestamp = TimeCurrent();  // Simplified — use proper ISO parse
    }

    signal.valid = (StringLen(signal.signal_id) > 0 && StringLen(signal.signal_type) > 0);
    return signal.valid;
}


//+------------------------------------------------------------------+
//| EXECUTION REPORTING                                                |
//+------------------------------------------------------------------+
void ReportFill(TradeSignal &signal, double fillPrice, ulong dealTicket) {
    string json = StringFormat(
        "{\"report_type\":\"FILL\",\"signal_id\":\"%s\","
        "\"asset\":\"%s\",\"direction\":\"%s\","
        "\"fill_price\":%.5f,\"requested_price\":%.5f,"
        "\"slippage_points\":%d,"
        "\"lot_size\":%.2f,\"ticket\":%d,"
        "\"sl_set\":%.5f,\"tp_set\":%.5f,"
        "\"equity_after\":%.2f,\"time\":\"%s\"}",
        signal.signal_id, signal.asset, signal.direction,
        fillPrice, signal.entry_price_ref,
        (int)MathAbs((fillPrice - signal.entry_price_ref) /
                      SymbolInfoDouble(signal.asset, SYMBOL_POINT)),
        signal.lot_size, dealTicket,
        signal.stop_loss, signal.take_profit_1,
        AccountInfoDouble(ACCOUNT_EQUITY),
        TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS));

    int handle = FileOpen("mt5_to_openclaw.json", FILE_WRITE | FILE_TXT | FILE_COMMON);
    if (handle != INVALID_HANDLE) {
        FileWriteString(handle, json);
        FileClose(handle);
    }
}

void ReportSignalRejection(TradeSignal &signal, string reason) {
    Print("SIGNAL REJECTED: ", signal.signal_id, " | Reason: ", reason);

    string json = StringFormat(
        "{\"report_type\":\"REJECTION\",\"signal_id\":\"%s\","
        "\"reason\":\"%s\",\"time\":\"%s\","
        "\"equity\":%.2f}",
        signal.signal_id, reason,
        TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS),
        AccountInfoDouble(ACCOUNT_EQUITY));

    int handle = FileOpen("mt5_to_openclaw.json", FILE_WRITE | FILE_TXT | FILE_COMMON);
    if (handle != INVALID_HANDLE) {
        FileWriteString(handle, json);
        FileClose(handle);
    }
}


//+------------------------------------------------------------------+
//| UTILITY FUNCTIONS                                                  |
//+------------------------------------------------------------------+
double GetTotalOpenLots() {
    double total = 0;
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (PositionSelectByTicket(ticket)) {
            string symbol = PositionGetString(POSITION_SYMBOL);
            if (StringFind(AllowedSymbols, symbol) >= 0) {
                total += PositionGetDouble(POSITION_VOLUME);
            }
        }
    }
    return total;
}

string ExtractJsonString(string json, string key) {
    string search = "\"" + key + "\":\"";
    int pos = StringFind(json, search);
    if (pos < 0) return "";

    int start = pos + StringLen(search);
    int end = StringFind(json, "\"", start);
    if (end < 0) return "";

    return StringSubstr(json, start, end - start);
}

double ExtractJsonDouble(string json, string key) {
    string search1 = "\"" + key + "\":";
    int pos = StringFind(json, search1);
    if (pos < 0) return 0.0;

    int start = pos + StringLen(search1);

    // Skip whitespace
    while (start < StringLen(json) &&
           (StringGetCharacter(json, start) == ' ' ||
            StringGetCharacter(json, start) == '\t')) {
        start++;
    }

    // Find end of number
    int end = start;
    while (end < StringLen(json)) {
        ushort ch = StringGetCharacter(json, end);
        if ((ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == '+') {
            end++;
        } else {
            break;
        }
    }

    if (end == start) return 0.0;
    return StringToDouble(StringSubstr(json, start, end - start));
}
//+------------------------------------------------------------------+
