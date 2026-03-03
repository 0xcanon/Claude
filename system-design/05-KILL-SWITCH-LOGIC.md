# Kill-Switch Logic

## 1. Kill-Switch Architecture

The kill-switch is a **multi-layered, independent safety system** that can halt trading from multiple trigger points. It is designed so that NO single component failure can prevent the kill-switch from activating.

```
┌────────────────────────────────────────────────────────────┐
│                    KILL-SWITCH LAYERS                       │
│                                                            │
│  Layer 1: OpenClaw Software Kill-Switch                    │
│  ├── Drawdown circuit breakers (daily/monthly/rolling)     │
│  ├── Consecutive loss counter                              │
│  ├── Anomaly detection (unusual P&L, slippage, spread)     │
│  └── System health monitors                                │
│                                                            │
│  Layer 2: MT5 EA Hardware Kill-Switch                      │
│  ├── Heartbeat timeout (10s = emergency close all)         │
│  ├── Local equity check (if equity < X → close all)        │
│  ├── Max loss per position guard                           │
│  └── Emergency file flag detector                          │
│                                                            │
│  Layer 3: External Watchdog                                │
│  ├── Separate process monitoring both OC and EA            │
│  ├── Independent equity check via MT5 API                  │
│  └── Telegram command listener (/halt, /status, /resume)   │
│                                                            │
│  Layer 4: Operator Manual Override                         │
│  ├── Telegram bot commands                                 │
│  ├── Web dashboard emergency button                        │
│  ├── Physical emergency halt file                          │
│  └── MT5 terminal manual intervention                      │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: OpenClaw Software Kill-Switch

### 2.1 Trigger Conditions

```python
class KillSwitchController:
    def __init__(self, config):
        self.config = config
        self.state = "ACTIVE"
        self.halt_reason = None
        self.halt_time = None

    def evaluate(self, risk_state: RiskEngineState, system_health: SystemHealth) -> str:
        """
        Evaluate all kill-switch conditions.
        Returns: "ACTIVE", "REDUCED", "DEFENSIVE", "HALTED", "EMERGENCY"
        Called every 1 second.
        """
        # === EMERGENCY TRIGGERS (immediate close all) ===

        # E1: Data feed failure
        if system_health.data_feed_age_seconds > 30:
            return self._trigger("EMERGENCY", "DATA_FEED_STALE",
                f"No data for {system_health.data_feed_age_seconds}s")

        # E2: Database unreachable
        if not system_health.database_connected:
            return self._trigger("EMERGENCY", "DATABASE_DOWN",
                "Cannot log trades — safety critical")

        # E3: Account equity anomaly (sudden drop beyond any open risk)
        expected_max_loss = risk_state.current_heat * risk_state.account_equity / 100
        actual_loss = risk_state.daily_high_watermark - risk_state.account_equity
        if actual_loss > expected_max_loss * 2.0 and actual_loss > 0:
            return self._trigger("EMERGENCY", "EQUITY_ANOMALY",
                f"Loss ${actual_loss:.2f} exceeds 2x expected max ${expected_max_loss:.2f}")

        # E4: Spread anomaly (broker manipulation or extreme conditions)
        for asset in ["BTCUSD", "ETHUSD", "XAUUSD"]:
            current_spread = get_spread(asset)
            normal_spread = get_average_spread(asset, lookback_hours=24)
            if current_spread > normal_spread * 5:
                return self._trigger("EMERGENCY", "SPREAD_ANOMALY",
                    f"{asset} spread {current_spread} is 5x normal {normal_spread}")

        # E5: Slippage anomaly
        recent_fills = get_recent_fills(count=5)
        avg_slippage = mean([abs(f.slippage_points) for f in recent_fills]) if recent_fills else 0
        if avg_slippage > 50:  # Asset-specific thresholds in production
            return self._trigger("EMERGENCY", "SLIPPAGE_ANOMALY",
                f"Average slippage {avg_slippage} points over last 5 fills")

        # === HALT TRIGGERS (close all, wait for manual restart) ===

        # H1: Daily drawdown exceeded
        if risk_state.daily_drawdown_pct < -7.0:
            return self._trigger("HALTED", "DAILY_DRAWDOWN",
                f"Daily drawdown {risk_state.daily_drawdown_pct:.2f}%")

        # H2: Monthly drawdown exceeded
        if risk_state.monthly_drawdown_pct < -12.0:
            return self._trigger("HALTED", "MONTHLY_DRAWDOWN",
                f"Monthly drawdown {risk_state.monthly_drawdown_pct:.2f}%")

        # H3: Rolling 30-day drawdown
        if risk_state.rolling_30d_drawdown_pct < -15.0:
            return self._trigger("HALTED", "ROLLING_DRAWDOWN",
                f"30-day rolling drawdown {risk_state.rolling_30d_drawdown_pct:.2f}%")

        # H4: Consecutive losses
        if risk_state.consecutive_losses >= 7:
            return self._trigger("HALTED", "CONSECUTIVE_LOSSES",
                f"{risk_state.consecutive_losses} consecutive losses")

        # H5: Too many trades (runaway)
        if risk_state.trades_today > risk_state.max_trades_per_day:
            return self._trigger("HALTED", "TRADE_LIMIT",
                f"{risk_state.trades_today} trades today exceeds limit {risk_state.max_trades_per_day}")

        # === DEFENSIVE TRIGGERS ===

        if risk_state.daily_drawdown_pct < -5.0:
            return self._trigger("DEFENSIVE", "DAILY_DD_WARNING",
                f"Daily drawdown {risk_state.daily_drawdown_pct:.2f}%")

        if risk_state.consecutive_losses >= 5:
            return self._trigger("DEFENSIVE", "CONSEC_LOSS_WARNING",
                f"{risk_state.consecutive_losses} consecutive losses")

        # === REDUCED TRIGGERS ===

        if risk_state.daily_drawdown_pct < -3.0:
            return self._trigger("REDUCED", "DAILY_DD_CAUTION",
                f"Daily drawdown {risk_state.daily_drawdown_pct:.2f}%")

        if risk_state.consecutive_losses >= 3:
            return self._trigger("REDUCED", "CONSEC_LOSS_CAUTION",
                f"{risk_state.consecutive_losses} consecutive losses")

        # === ALL CLEAR ===
        return "ACTIVE"

    def _trigger(self, mode: str, reason: str, detail: str) -> str:
        if self.state != mode:
            self.state = mode
            self.halt_reason = reason
            self.halt_time = utcnow()
            log_kill_switch_event(mode, reason, detail)
            send_alert(mode, reason, detail)

            if mode in ("HALTED", "EMERGENCY"):
                publish_close_all_signal()
                write_emergency_halt_file()

        return mode
```

---

## 3. Layer 2: MT5 EA Hardware Kill-Switch

This layer operates INDEPENDENTLY of OpenClaw. Even if the Python process crashes completely, the EA will protect the account.

### 3.1 MQL5 Implementation

```mql5
// Constants — compiled into EA, cannot be changed by signals
input double EMERGENCY_EQUITY_PERCENT = 85.0;  // Close all if equity < 85% of balance
input int    HEARTBEAT_TIMEOUT_SEC = 10;        // Close all if no heartbeat for 10s
input double MAX_LOSS_PER_POSITION_PCT = 4.0;   // Close position if loss > 4% of equity
input int    MAX_TOTAL_POSITIONS = 4;            // Never exceed 4 positions
input double MAX_LOT_SIZE_SINGLE = 2.0;         // Never exceed 2.0 lots per order

datetime lastHeartbeat;
bool emergencyMode = false;

void OnTick() {
    // === HARDWARE KILL-SWITCH CHECKS (every tick) ===

    // Check 1: Heartbeat timeout
    if (TimeCurrent() - lastHeartbeat > HEARTBEAT_TIMEOUT_SEC) {
        EmergencyCloseAll("HEARTBEAT_TIMEOUT");
        return;
    }

    // Check 2: Equity protection
    double equityPercent = AccountInfoDouble(ACCOUNT_EQUITY) /
                           AccountInfoDouble(ACCOUNT_BALANCE) * 100;
    if (equityPercent < EMERGENCY_EQUITY_PERCENT) {
        EmergencyCloseAll("EQUITY_BELOW_THRESHOLD");
        return;
    }

    // Check 3: Emergency halt file exists
    if (FileIsExist("emergency_halt.flag")) {
        EmergencyCloseAll("EMERGENCY_FILE_DETECTED");
        return;
    }

    // Check 4: Per-position loss check
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        if (PositionSelectByTicket(PositionGetTicket(i))) {
            double posLoss = PositionGetDouble(POSITION_PROFIT);
            double equity = AccountInfoDouble(ACCOUNT_EQUITY);
            if (posLoss < 0 && (MathAbs(posLoss) / equity * 100) > MAX_LOSS_PER_POSITION_PCT) {
                ClosePosition(PositionGetTicket(i), "MAX_POSITION_LOSS_EXCEEDED");
            }
        }
    }

    // Check 5: SL existence verification (NEVER allow position without SL)
    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        if (PositionSelectByTicket(PositionGetTicket(i))) {
            double sl = PositionGetDouble(POSITION_SL);
            if (sl == 0.0) {
                // Position has no SL — this should NEVER happen
                // Emergency close this position immediately
                ClosePosition(PositionGetTicket(i), "NO_STOP_LOSS_DETECTED");
                AlertOperator("CRITICAL: Position found without SL — closed immediately");
            }
        }
    }
}

void EmergencyCloseAll(string reason) {
    emergencyMode = true;
    Print("EMERGENCY CLOSE ALL: ", reason);

    for (int i = PositionsTotal() - 1; i >= 0; i--) {
        ulong ticket = PositionGetTicket(i);
        if (PositionSelectByTicket(ticket)) {
            ClosePosition(ticket, "EMERGENCY_" + reason);
        }
    }

    // Write emergency state file
    int handle = FileOpen("emergency_state.json", FILE_WRITE | FILE_TXT);
    if (handle != INVALID_HANDLE) {
        FileWrite(handle, StringFormat(
            "{\"emergency\":true,\"reason\":\"%s\",\"time\":\"%s\",\"equity\":%.2f}",
            reason, TimeToString(TimeCurrent()), AccountInfoDouble(ACCOUNT_EQUITY)));
        FileClose(handle);
    }

    // Alert
    SendNotification("EMERGENCY: All positions closed. Reason: " + reason);
}
```

---

## 4. Layer 3: External Watchdog Process

A separate lightweight process that monitors both OpenClaw and the EA.

```python
# watchdog.py — runs as a separate Windows service

import time
import MetaTrader5 as mt5
from telegram_bot import send_telegram

class TradingWatchdog:
    def __init__(self):
        self.check_interval = 5  # seconds
        self.openclaw_heartbeat_file = "C:\\TradingSystem\\signals\\heartbeat_oc.json"
        self.ea_heartbeat_file = "C:\\TradingSystem\\signals\\heartbeat_ea.json"
        self.emergency_equity_pct = 80.0  # Even stricter than EA
        self.initial_balance = None

    def run(self):
        mt5.initialize()
        self.initial_balance = mt5.account_info().balance

        while True:
            try:
                self.check_openclaw_alive()
                self.check_ea_alive()
                self.check_equity()
                self.check_position_sanity()
            except Exception as e:
                send_telegram(f"WATCHDOG ERROR: {e}")
            time.sleep(self.check_interval)

    def check_openclaw_alive(self):
        age = file_age_seconds(self.openclaw_heartbeat_file)
        if age > 30:
            send_telegram(f"WARNING: OpenClaw heartbeat stale ({age}s)")
        if age > 60:
            send_telegram("CRITICAL: OpenClaw appears dead. EA should auto-close.")

    def check_ea_alive(self):
        age = file_age_seconds(self.ea_heartbeat_file)
        if age > 30:
            send_telegram(f"WARNING: EA heartbeat stale ({age}s)")
        if age > 60:
            send_telegram("CRITICAL: EA appears dead. Manual intervention needed!")

    def check_equity(self):
        info = mt5.account_info()
        equity_pct = info.equity / info.balance * 100
        if equity_pct < self.emergency_equity_pct:
            send_telegram(f"WATCHDOG EMERGENCY: Equity at {equity_pct:.1f}%")
            self.force_close_all()

    def check_position_sanity(self):
        positions = mt5.positions_get()
        if positions is None:
            return

        for pos in positions:
            # Check every position has SL
            if pos.sl == 0.0:
                send_telegram(f"CRITICAL: Position {pos.ticket} has NO SL!")

            # Check no position exceeds loss threshold
            if pos.profit < 0:
                loss_pct = abs(pos.profit) / mt5.account_info().equity * 100
                if loss_pct > 5.0:
                    send_telegram(f"WARNING: Position {pos.ticket} losing {loss_pct:.1f}%")

    def force_close_all(self):
        """Last resort: close all positions via MT5 API."""
        positions = mt5.positions_get()
        if positions:
            for pos in positions:
                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "position": pos.ticket,
                    "symbol": pos.symbol,
                    "volume": pos.volume,
                    "type": mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY,
                    "price": mt5.symbol_info_tick(pos.symbol).bid if pos.type == 0 else mt5.symbol_info_tick(pos.symbol).ask,
                    "comment": "WATCHDOG_EMERGENCY",
                }
                mt5.order_send(request)
            send_telegram("WATCHDOG: All positions closed by emergency protocol.")

        # Write halt file
        with open("C:\\TradingSystem\\signals\\emergency_halt.flag", "w") as f:
            f.write("WATCHDOG_EMERGENCY")
```

---

## 5. Layer 4: Operator Manual Override

### 5.1 Telegram Bot Commands

```
/status        → Current system state, equity, positions, drawdown
/halt          → Immediately halt trading, close all positions
/pause         → Stop new entries, manage existing positions
/resume        → Resume from HALTED state (with cooldown check)
/reduce        → Switch to REDUCED mode manually
/positions     → List all open positions with P&L
/performance   → Daily/weekly/monthly performance summary
/allocation    → Current asset allocation weights
/regime        → Current regime classification per asset
/force_close   → Force close a specific position by ticket
/restart_oc    → Restart OpenClaw process
/restart_ea    → Send restart signal to EA
```

### 5.2 Command Authentication

```python
AUTHORIZED_CHAT_IDS = [123456789]  # Only operator's Telegram ID

def handle_command(update):
    if update.message.chat_id not in AUTHORIZED_CHAT_IDS:
        return  # Silently ignore unauthorized commands

    command = update.message.text.split()[0]

    if command == "/halt":
        # Require confirmation
        if not awaiting_confirmation("halt"):
            send_message("⚠️ This will close ALL positions. Send /halt again to confirm.")
            set_confirmation_pending("halt", ttl=30)
            return
        execute_halt()
        clear_confirmation("halt")
```

---

## 6. Recovery Protocol

### 6.1 After HALTED State

```
RECOVERY CHECKLIST:
1. Minimum cooldown: 4 hours (daily halt) or end of month (monthly halt)
2. Operator must acknowledge via /resume command
3. System runs in REDUCED mode for first 2 hours after restart
4. Position sizes limited to 50% for first 5 trades
5. If another halt triggers within 24 hours of restart → HALTED for 48 hours
6. All self-improvement parameters frozen for 48 hours after restart
```

### 6.2 After EMERGENCY State

```
RECOVERY CHECKLIST:
1. Root cause must be identified and documented
2. Operator must manually restart both OpenClaw and EA
3. System runs comprehensive self-test before accepting trades:
   - Data feed connectivity verified
   - Database connectivity verified
   - IPC channel tested
   - Heartbeat round-trip confirmed
   - Account info readable
   - Spread within normal range
4. First 24 hours in DEFENSIVE mode
5. Full performance review before return to NORMAL
```
