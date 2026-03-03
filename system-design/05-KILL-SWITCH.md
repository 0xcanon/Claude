# Kill-Switch Logic

---

## 1. Kill-Switch Philosophy

The kill-switch is the system's last line of defense. It is designed to be
**impossible to accidentally disable** and **trivial to trigger**. When in
doubt, the system halts. False positives (unnecessary halts) are strongly
preferred over false negatives (missed catastrophic events).

---

## 2. Kill-Switch Trigger Conditions

### 2.1 Financial Triggers

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Daily equity drawdown | ≥ 5% from daily open equity | CLOSE_ALL + HALT_24H |
| Monthly equity drawdown | ≥ 10% from month-start equity | CLOSE_ALL + HALT_MANUAL |
| Single trade loss | > 3% of equity (shouldn't happen with sizing) | CLOSE_POSITION + INVESTIGATE |
| Flash crash detection | > 5% price move in < 5 minutes on any asset | CLOSE_ALL + HALT_1H + ALERT |
| Equity curve anomaly | Equity below lowest point in last 30 days × 0.97 | REDUCE_RISK_50% + ALERT |

### 2.2 System Triggers

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Brain heartbeat missing | > 120 seconds | EA: CLOSE_ALL + HALT |
| EA heartbeat missing | > 120 seconds | Brain: HALT_SIGNALS + ALERT |
| Connection to broker lost | > 300 seconds | EA: attempt reconnect, then CLOSE_ALL |
| Signal validation failures | > 3 consecutive invalid signals | HALT_SIGNALS + ALERT |
| Execution anomalies | > 3 consecutive rejected/failed orders | HALT_SIGNALS + ALERT |
| Disk space critical | < 500MB free | HALT_SIGNALS + ALERT |
| CPU/Memory anomaly | > 95% for > 5 minutes | HALT_SIGNALS + ALERT |

### 2.3 Market Condition Triggers

| Trigger | Detection | Action |
|---------|-----------|--------|
| Spread blow-up | Spread > 5× normal average | HALT_NEW_ENTRIES until normalized |
| Liquidity void | No ticks received for > 30 seconds | HALT_NEW_ENTRIES + ALERT |
| All assets RANGING | All three assets classified as RANGING | HALT_NEW_ENTRIES (natural) |
| Weekend gap risk | Friday 21:00 UTC for crypto: N/A; for XAU: close all | CLOSE_XAU_POSITIONS |

---

## 3. Kill-Switch Execution Protocol

### 3.1 CLOSE_ALL Sequence

```python
def execute_kill_switch(reason, severity="CRITICAL"):
    """
    Atomic kill-switch execution. Cannot be partially executed.
    """
    timestamp = utc_now()

    # 1. Log the kill-switch activation
    log_kill_switch(timestamp, reason, severity)

    # 2. Write kill-switch file (EA reads this independently)
    write_kill_switch_file({
        "activated": True,
        "timestamp_utc": timestamp,
        "reason": reason,
        "severity": severity,
        "action": "CLOSE_ALL"
    })

    # 3. Send CLOSE_ALL signal for each asset
    for asset in ["BTCUSD", "ETHUSD", "XAUUSD"]:
        dispatch_signal({
            "action": "CLOSE_ALL_ASSET",
            "asset": asset,
            "reason": f"KILL_SWITCH: {reason}",
            "urgency": "IMMEDIATE"
        })

    # 4. Set system state to HALTED
    set_system_state("HALTED")

    # 5. Send alerts
    send_alert_telegram(f"KILL SWITCH ACTIVATED: {reason}")
    send_alert_email(f"Kill Switch - {severity}", reason)

    # 6. Write post-mortem snapshot
    write_snapshot({
        "trigger": reason,
        "equity_at_trigger": get_current_equity(),
        "open_positions": get_all_positions(),
        "regime_state": get_all_regimes(),
        "recent_signals": get_recent_signals(count=20),
        "recent_trades": get_recent_trades(count=20)
    })
```

### 3.2 EA-Side Independent Kill-Switch

The EA runs its own kill-switch logic independently of the brain. This is
critical because the brain might be the component that fails.

```
// MQL5 EA Kill-Switch (runs every tick)
void CheckKillSwitch() {
    // 1. Check kill-switch file
    if (FileExists("control/kill_switch.json")) {
        KillSwitchData ks = ReadKillSwitchFile();
        if (ks.activated) {
            CloseAllPositions("Kill switch file detected: " + ks.reason);
            SetEAState(EA_HALTED);
            return;
        }
    }

    // 2. Check brain heartbeat
    double brain_silence = TimeSinceLastBrainHeartbeat();
    if (brain_silence > 120.0) {
        CloseAllPositions("Brain heartbeat lost for " + brain_silence + "s");
        SetEAState(EA_HALTED);
        SendAlert("EA Kill Switch: Brain heartbeat lost");
        return;
    }

    // 3. Check equity drawdown
    double daily_dd = (g_dailyStartEquity - AccountInfoDouble(ACCOUNT_EQUITY))
                      / g_dailyStartEquity;
    if (daily_dd >= 0.05) {
        CloseAllPositions("Daily drawdown exceeded 5%: " + daily_dd);
        SetEAState(EA_HALTED);
        SendAlert("EA Kill Switch: Daily DD " + daily_dd);
        return;
    }

    // 4. Check for flash crash
    for (int i = 0; i < ArraySize(g_assets); i++) {
        double priceNow = SymbolInfoDouble(g_assets[i], SYMBOL_BID);
        double price5min = GetPrice5MinAgo(g_assets[i]);
        double move_pct = MathAbs(priceNow - price5min) / price5min;
        if (move_pct > 0.05) {
            CloseAllPositions("Flash crash detected on " + g_assets[i]);
            SetEAState(EA_HALTED);
            SendAlert("Flash crash: " + g_assets[i] + " moved " + move_pct);
            return;
        }
    }
}
```

---

## 4. Recovery Protocol

### 4.1 After HALT_24H

```
1. System remains halted for 24 hours (enforced by timestamp check)
2. After 24 hours, system enters RECOVERY state:
    - Risk reduced to 50%
    - Only VOLATILE_EXPANSION + STRONG trend signals accepted
    - Maximum 1 position at a time
3. After 4 successful trades (or 48 hours without incident):
    - Restore to NORMAL state
    - Gradually increase to full risk over 24 hours
```

### 4.2 After HALT_MANUAL

```
1. System remains halted until manual restart command issued
2. Manual restart requires:
    - Review of post-mortem snapshot
    - Explicit restart command with acknowledgment
    - Optional: parameter adjustment before restart
3. Upon restart:
    - System enters RECOVERY state (same as above)
    - Full audit trail of restart with operator notes
```

### 4.3 Recovery Command Format

```json
{
    "type": "RESTART",
    "timestamp_utc": "2026-03-04T10:00:00Z",
    "operator": "manual",
    "acknowledged_reason": "Daily DD exceeded during BTC flash crash",
    "config_changes": {
        "risk_per_trade": 0.01,
        "max_portfolio_risk": 0.04
    },
    "recovery_mode_hours": 48,
    "notes": "Reducing risk after unexpected volatility event"
}
```

---

## 5. Kill-Switch File Format

```json
{
    "activated": true,
    "timestamp_utc": "2026-03-03T14:55:00Z",
    "reason": "Daily drawdown exceeded 5%",
    "severity": "CRITICAL",
    "action": "CLOSE_ALL",
    "halt_type": "HALT_24H",
    "resume_after_utc": "2026-03-04T14:55:00Z",
    "equity_at_trigger": 19000.00,
    "daily_start_equity": 20000.00,
    "drawdown_pct": 5.0,
    "positions_closed": 3,
    "total_pnl_at_close": -1000.00
}
```

---

## 6. Anti-Tampering Safeguards

1. **Kill-switch cannot be disabled via signal** — Only a dedicated restart
   command (separate from trade signals) can resume trading.

2. **EA validates kill-switch independently** — Even if brain sends trades
   during a halt, EA rejects them.

3. **Timestamps are monotonic** — Kill-switch activation time cannot be
   backdated or overridden.

4. **Halt state persists across restarts** — Stored in both file and database.
   If either process restarts, it checks halt state before doing anything.

5. **Alert on silence** — If the monitoring system stops receiving heartbeats
   from both brain AND EA for > 5 minutes, external monitoring (cron job)
   sends an alert. This catches the scenario where the entire VPS is down.
