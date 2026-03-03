# Signal Format & Communication Structure

## 1. Signal Types

The system uses five signal types:

| Signal Type | Code | Description |
|---|---|---|
| ENTRY | `ENTRY` | Open a new position |
| EXIT | `EXIT` | Close an existing position |
| MODIFY | `MODIFY` | Adjust SL/TP of existing position |
| PARTIAL_CLOSE | `PARTIAL_CLOSE` | Close a fraction of an existing position |
| HEARTBEAT | `HEARTBEAT` | System alive confirmation |

---

## 2. Master Signal JSON Schema

### 2.1 ENTRY Signal

```json
{
  "signal_id": "OC-20260303-143022-BTCUSD-L-001",
  "signal_type": "ENTRY",
  "timestamp_utc": "2026-03-03T14:30:22.451Z",
  "timestamp_unix_ms": 1772649022451,
  "expiry_utc": "2026-03-03T14:30:27.451Z",
  "asset": "BTCUSD",
  "direction": "LONG",
  "order_type": "MARKET",
  "entry_price_reference": 87432.50,
  "stop_loss": 86580.00,
  "take_profit_1": 89137.00,
  "take_profit_2": 90841.50,
  "take_profit_3": null,
  "lot_size": 0.15,
  "risk_percent": 1.94,
  "risk_dollars": 127.88,
  "risk_reward_ratio": 2.0,
  "partial_close_at_tp1": 0.50,
  "partial_close_at_tp2": 0.30,
  "trail_remaining": true,
  "trail_activation_price": 89137.00,
  "trail_step_points": 500,
  "trail_distance_points": 1000,
  "max_slippage_points": 30,
  "magic_number": 100001,
  "comment": "OC_VOL_EXP_MTF_ALIGN",
  "metadata": {
    "regime": "TRENDING_STRONG",
    "regime_confidence": 0.87,
    "signal_score": 0.82,
    "mtf_alignment": {
      "4H": "BULLISH",
      "1H": "BULLISH",
      "15m": "BULLISH"
    },
    "volatility_state": "EXPANDING",
    "atr_14_1h": 425.30,
    "atr_percentile": 72,
    "trend_strength_adx": 34.2,
    "correlation_btc_eth": 0.78,
    "portfolio_heat_before": 1.94,
    "portfolio_heat_after": 3.88,
    "drawdown_daily_current": -0.42,
    "drawdown_monthly_current": -1.15,
    "operational_mode": "NORMAL",
    "asset_allocation_weight": 0.45,
    "strategy_id": "VOLATILITY_EXPANSION_V2",
    "generation_latency_ms": 12
  },
  "integrity": {
    "hash_algorithm": "SHA256",
    "hash": "a3f2b8c9d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0",
    "version": "1.0.0"
  }
}
```

### 2.2 EXIT Signal

```json
{
  "signal_id": "OC-20260303-151500-BTCUSD-EXIT-001",
  "signal_type": "EXIT",
  "timestamp_utc": "2026-03-03T15:15:00.123Z",
  "timestamp_unix_ms": 1772651700123,
  "expiry_utc": "2026-03-03T15:15:05.123Z",
  "asset": "BTCUSD",
  "direction": "CLOSE_LONG",
  "magic_number": 100001,
  "close_reason": "REGIME_SHIFT_TO_RANGING",
  "close_percent": 1.0,
  "max_slippage_points": 30,
  "metadata": {
    "pnl_unrealized": 245.60,
    "hold_duration_minutes": 45,
    "regime_at_close": "RANGING"
  },
  "integrity": {
    "hash_algorithm": "SHA256",
    "hash": "b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3",
    "version": "1.0.0"
  }
}
```

### 2.3 MODIFY Signal

```json
{
  "signal_id": "OC-20260303-153000-BTCUSD-MOD-001",
  "signal_type": "MODIFY",
  "timestamp_utc": "2026-03-03T15:30:00.789Z",
  "timestamp_unix_ms": 1772652600789,
  "expiry_utc": "2026-03-03T15:30:05.789Z",
  "asset": "BTCUSD",
  "magic_number": 100001,
  "new_stop_loss": 87432.50,
  "new_take_profit": 91500.00,
  "modify_reason": "MOVE_SL_TO_BREAKEVEN",
  "metadata": {
    "original_sl": 86580.00,
    "original_tp": 89137.00,
    "pnl_unrealized": 680.00
  },
  "integrity": {
    "hash_algorithm": "SHA256",
    "hash": "c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4",
    "version": "1.0.0"
  }
}
```

### 2.4 HEARTBEAT Signal

```json
{
  "signal_id": "OC-HB-20260303-143023",
  "signal_type": "HEARTBEAT",
  "timestamp_utc": "2026-03-03T14:30:23.000Z",
  "timestamp_unix_ms": 1772649023000,
  "system_state": {
    "operational_mode": "NORMAL",
    "openclaw_uptime_seconds": 86423,
    "open_positions": 2,
    "portfolio_heat": 3.88,
    "daily_pnl_percent": 0.42,
    "monthly_pnl_percent": 3.15,
    "daily_drawdown_percent": -0.42,
    "monthly_drawdown_percent": -1.15,
    "cpu_usage_percent": 12.4,
    "memory_usage_mb": 842,
    "last_signal_age_seconds": 312,
    "data_feed_status": "OK",
    "database_status": "OK"
  },
  "integrity": {
    "hash_algorithm": "SHA256",
    "hash": "d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5",
    "version": "1.0.0"
  }
}
```

---

## 3. Communication Channels

### 3.1 Primary: Named Pipe / File-Based IPC

The most reliable method for same-machine communication between Python and MQL5.

**File-Based Protocol:**

```
Directory: C:\TradingSystem\signals\

Files:
  openclaw_to_mt5.json      ← OpenClaw writes, EA reads
  mt5_to_openclaw.json      ← EA writes, OpenClaw reads
  heartbeat_oc.json         ← OpenClaw heartbeat
  heartbeat_ea.json         ← EA heartbeat
  emergency_halt.flag       ← Existence = halt all trading
```

**Write Protocol (Atomic):**
1. OpenClaw writes signal to `openclaw_to_mt5.json.tmp`
2. OpenClaw renames `.tmp` to `.json` (atomic on NTFS)
3. EA polls for file modification timestamp change every 500ms
4. EA reads signal, validates hash
5. EA writes acknowledgment to `mt5_to_openclaw.json`
6. OpenClaw confirms acknowledgment

**Why atomic rename matters:** Prevents EA from reading a partially written file. The rename operation is atomic on both NTFS and ext4.

### 3.2 Secondary: Redis Pub/Sub

For multi-machine deployments or when lower latency is needed.

```
Channels:
  openclaw:signals:{asset}     ← Signal publication
  openclaw:heartbeat           ← Heartbeat stream
  mt5:execution_reports        ← Fill/rejection reports
  mt5:heartbeat                ← EA heartbeat
  system:emergency             ← Emergency broadcast
```

### 3.3 Heartbeat Protocol

```
OpenClaw → heartbeat_oc.json    every 1 second
EA       → heartbeat_ea.json    every 1 second

Timeout thresholds:
  WARNING:   3 seconds without heartbeat
  CRITICAL:  5 seconds without heartbeat
  EMERGENCY: 10 seconds without heartbeat → close all positions
```

---

## 4. Signal Validation Rules (EA-Side)

The EA MUST validate every signal before execution:

```
VALIDATION CHECKLIST:
├── Signal age < 5 seconds (prevent stale execution)
├── Hash integrity matches computed hash
├── Signal version compatible with EA version
├── Asset matches one of [BTCUSD, ETHUSD, XAUUSD]
├── Direction is valid [LONG, SHORT, CLOSE_LONG, CLOSE_SHORT]
├── SL is present and non-zero (NEVER execute without SL)
├── SL distance is within [min_sl_distance, max_sl_distance]
├── Lot size is within [min_lot, max_lot_per_signal]
├── Lot size does not exceed max_total_exposure
├── Total open positions does not exceed max_positions
├── No duplicate magic number for same asset+direction
├── Risk percent does not exceed max_risk_per_trade
├── Portfolio heat after trade does not exceed max_portfolio_heat
└── Operational mode is not HALTED or EMERGENCY
```

If ANY check fails, the signal is REJECTED, logged, and reported back to OpenClaw.

---

## 5. Execution Report Format (EA → OpenClaw)

```json
{
  "report_id": "EA-RPT-20260303-143023-001",
  "signal_id": "OC-20260303-143022-BTCUSD-L-001",
  "report_type": "FILL",
  "timestamp_utc": "2026-03-03T14:30:23.112Z",
  "status": "FILLED",
  "asset": "BTCUSD",
  "direction": "LONG",
  "fill_price": 87435.00,
  "requested_price": 87432.50,
  "slippage_points": 25,
  "lot_size_filled": 0.15,
  "ticket_number": 1284567,
  "magic_number": 100001,
  "stop_loss_set": 86580.00,
  "take_profit_set": 89137.00,
  "commission": -2.25,
  "spread_at_fill": 15,
  "execution_latency_ms": 89,
  "account_equity_after": 6589.42,
  "account_margin_used": 1311.52,
  "account_margin_free": 5277.90
}
```

**Rejection Report:**

```json
{
  "report_id": "EA-RPT-20260303-143023-002",
  "signal_id": "OC-20260303-143022-BTCUSD-L-001",
  "report_type": "REJECTION",
  "timestamp_utc": "2026-03-03T14:30:23.045Z",
  "status": "REJECTED",
  "rejection_reason": "MAX_PORTFOLIO_HEAT_EXCEEDED",
  "rejection_details": "Portfolio heat would be 8.2% (max: 8.0%)",
  "account_equity": 6589.42
}
```

---

## 6. Signal Integrity Hash Computation

```python
import hashlib
import json

def compute_signal_hash(signal: dict) -> str:
    """
    Compute SHA256 hash of signal for integrity verification.
    Hash is computed over all fields EXCEPT the integrity block itself.
    """
    signal_copy = {k: v for k, v in signal.items() if k != "integrity"}
    # Canonical JSON: sorted keys, no whitespace
    canonical = json.dumps(signal_copy, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()
```

This prevents signal tampering if IPC channel is compromised, and detects corruption during file writes.

---

## 7. Signal Lifecycle State Machine

```
GENERATED → PUBLISHED → ACKNOWLEDGED → EXECUTING → FILLED/REJECTED
    │            │            │             │
    │            │            │             └──► PARTIAL_FILL → FILLED
    │            │            │
    │            │            └──► VALIDATION_FAILED (EA rejected)
    │            │
    │            └──► EXPIRED (EA did not acknowledge within 5s)
    │
    └──► FILTERED (Risk engine rejected before publication)
```

Every state transition is logged to the database with timestamps. This creates a complete audit trail for every signal from inception to resolution.
