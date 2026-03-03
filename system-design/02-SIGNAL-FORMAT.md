# Signal Format & Communication Protocol

---

## 1. Signal JSON Schema

### 1.1 Trade Signal (Brain → EA)

```json
{
    "signal_id": "SIG-20260303-143022-BTCUSD-L-7a3f",
    "version": "1.0",
    "timestamp_utc": "2026-03-03T14:30:22.418Z",
    "expires_utc": "2026-03-03T14:35:22.418Z",
    "action": "OPEN_LONG",
    "asset": "BTCUSD",
    "entry_type": "MARKET",
    "entry_price_reference": 62450.00,
    "stop_loss": 62050.00,
    "take_profit_1": 63250.00,
    "take_profit_2": 63850.00,
    "take_profit_3": null,
    "position_size_lots": 0.15,
    "risk_percent": 1.85,
    "risk_usd": 370.00,
    "sl_distance_usd": 400.00,
    "rr_ratio": 2.0,
    "trailing_stop": {
        "enabled": true,
        "activation_rr": 1.0,
        "trail_distance_atr_mult": 1.0
    },
    "partial_close": {
        "enabled": true,
        "tp1_close_percent": 50,
        "tp2_close_percent": 30,
        "tp3_close_percent": 20
    },
    "context": {
        "regime": "VOLATILE_EXPANSION",
        "d1_bias": "BULLISH",
        "h4_bias": "BULLISH",
        "h1_trend": "BULLISH",
        "m15_trigger": "BREAKOUT_ABOVE_RESISTANCE",
        "atr_h1": 320.50,
        "adx_h1": 32.4,
        "rsi_h1": 58.2,
        "bb_width_percentile": 78,
        "vol_ratio": 1.35,
        "btc_eth_correlation": 0.72,
        "spread_at_signal": 18.5,
        "consecutive_losses": 0,
        "daily_drawdown_pct": 0.8,
        "monthly_drawdown_pct": 2.1,
        "risk_state": "NORMAL",
        "allocation_weight": 0.45
    },
    "checksum": "sha256:a1b2c3d4e5f6..."
}
```

### 1.2 Supported Action Types

| Action | Description |
|--------|-------------|
| `OPEN_LONG` | Open a new long position |
| `OPEN_SHORT` | Open a new short position |
| `CLOSE_POSITION` | Close a specific position by ticket |
| `CLOSE_ALL_ASSET` | Close all positions for an asset |
| `CLOSE_ALL` | Close all positions (kill-switch) |
| `MODIFY_SL` | Tighten stop-loss (never widen) |
| `MODIFY_TP` | Adjust take-profit |
| `PARTIAL_CLOSE` | Close a percentage of a position |
| `TRAILING_ACTIVATE` | Activate trailing stop on a position |
| `NOP` | No operation (heartbeat with context update) |

### 1.3 Signal ID Format

```
SIG-{YYYYMMDD}-{HHmmss}-{ASSET}-{DIRECTION}-{4char_random_hex}

Examples:
    SIG-20260303-143022-BTCUSD-L-7a3f
    SIG-20260303-143022-ETHUSD-S-b2e1
    SIG-20260303-143022-XAUUSD-L-9c4d
```

---

## 2. Execution Confirmation (EA → Brain)

```json
{
    "confirmation_id": "CONF-20260303-143023-7a3f",
    "signal_id": "SIG-20260303-143022-BTCUSD-L-7a3f",
    "timestamp_utc": "2026-03-03T14:30:23.102Z",
    "status": "FILLED",
    "ticket": 184729361,
    "asset": "BTCUSD",
    "direction": "LONG",
    "fill_price": 62452.50,
    "requested_price": 62450.00,
    "slippage_usd": 2.50,
    "slippage_points": 25,
    "actual_lots": 0.15,
    "actual_sl": 62050.00,
    "actual_tp": 63250.00,
    "commission": 4.50,
    "swap": 0.00,
    "spread_at_fill": 19.0,
    "execution_time_ms": 684,
    "broker_comment": "",
    "account_equity_after": 19630.00,
    "account_balance": 20000.00,
    "open_positions_count": 2,
    "checksum": "sha256:f6e5d4c3b2a1..."
}
```

### 2.1 Confirmation Status Codes

| Status | Description |
|--------|-------------|
| `FILLED` | Order executed successfully |
| `PARTIAL_FILL` | Partially filled (includes filled_lots) |
| `REJECTED_BROKER` | Broker rejected (includes reason) |
| `REJECTED_VALIDATOR` | EA risk validator rejected (includes reason) |
| `EXPIRED` | Signal expired before execution |
| `REQUOTE` | Requote received, not filled |
| `MODIFIED` | SL/TP modification confirmed |
| `CLOSED` | Position closed as requested |
| `ERROR` | Unexpected error (includes error_code and message) |

### 2.2 Rejection Detail (when status is REJECTED_VALIDATOR)

```json
{
    "status": "REJECTED_VALIDATOR",
    "rejection_reason": "PORTFOLIO_RISK_EXCEEDED",
    "rejection_detail": "Adding 1.85% would push total risk to 7.2%, exceeding 6% cap",
    "current_portfolio_risk_pct": 5.35,
    "max_portfolio_risk_pct": 6.00
}
```

---

## 3. Position Status Update (EA → Brain, periodic)

```json
{
    "type": "POSITION_UPDATE",
    "timestamp_utc": "2026-03-03T14:35:00.000Z",
    "positions": [
        {
            "ticket": 184729361,
            "signal_id": "SIG-20260303-143022-BTCUSD-L-7a3f",
            "asset": "BTCUSD",
            "direction": "LONG",
            "open_price": 62452.50,
            "current_price": 62680.00,
            "current_sl": 62050.00,
            "current_tp": 63250.00,
            "lots": 0.15,
            "unrealized_pnl": 34.13,
            "unrealized_pnl_pct": 0.17,
            "swap": -0.12,
            "commission": 4.50,
            "duration_minutes": 5,
            "current_rr": 0.57,
            "trailing_active": false,
            "partial_closes_executed": 0
        }
    ],
    "account": {
        "balance": 20000.00,
        "equity": 20034.13,
        "margin_used": 937.88,
        "margin_free": 19096.25,
        "margin_level_pct": 2135.22
    }
}
```

---

## 4. Heartbeat Message

### 4.1 Brain Heartbeat

```json
{
    "type": "HEARTBEAT",
    "source": "BRAIN",
    "timestamp_utc": "2026-03-03T14:30:10.000Z",
    "sequence": 48291,
    "state": "ACTIVE",
    "risk_state": "NORMAL",
    "daily_drawdown_pct": 0.8,
    "monthly_drawdown_pct": 2.1,
    "signals_generated_today": 3,
    "signals_filled_today": 2,
    "regime": {
        "BTCUSD": "VOLATILE_EXPANSION",
        "ETHUSD": "TRENDING_UP",
        "XAUUSD": "RANGING"
    },
    "next_evaluation_sec": 10
}
```

### 4.2 EA Heartbeat

```json
{
    "type": "HEARTBEAT",
    "source": "EA",
    "timestamp_utc": "2026-03-03T14:30:10.500Z",
    "sequence": 48291,
    "state": "ACTIVE",
    "open_positions": 2,
    "pending_signals": 0,
    "last_fill_timestamp": "2026-03-03T14:30:23.102Z",
    "connection_status": "CONNECTED",
    "ping_ms": 12,
    "terminal_connected": true,
    "account_server": "ICMarkets-Live07"
}
```

---

## 5. File System Protocol

### 5.1 Directory Structure

```
/shared/
├── signals/
│   ├── pending/          # Brain writes here, EA reads
│   ├── processed/        # EA moves signals here after fill
│   ├── filled/           # EA writes confirmations here
│   ├── rejected/         # EA writes rejections here
│   └── rejected_source/  # Original signal that was rejected
├── positions/
│   └── current.json      # EA writes current position snapshot
├── heartbeat/
│   ├── brain.json        # Brain overwrites every 10s
│   └── ea.json           # EA overwrites every 10s
├── control/
│   ├── kill_switch.json  # Either side can write to trigger
│   └── config.json       # Runtime config (brain writes, EA reads)
└── logs/
    ├── brain/            # Brain log files (daily rotation)
    └── ea/               # EA log files (daily rotation)
```

### 5.2 Atomic Write Protocol

All file writes follow this protocol to prevent partial reads:

```
1. Write content to {filename}.tmp
2. Flush and sync to disk
3. Rename {filename}.tmp to {filename}  (atomic on most filesystems)
4. Verify file exists at target path
```

### 5.3 Signal Expiry

Signals carry `expires_utc`. The EA must check:
- If `now > expires_utc`: discard signal, write EXPIRED confirmation
- Default expiry: 5 minutes from signal generation
- This prevents stale signals from executing after a brain restart

### 5.4 Checksum Validation

Every signal and confirmation includes a SHA-256 checksum of the payload
(excluding the checksum field itself). Receiver must validate before processing.

```
checksum = SHA256(json_payload_without_checksum_field)
```

If checksum fails, the message is logged as corrupted and discarded.
