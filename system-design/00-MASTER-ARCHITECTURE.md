# OpenClaw x MetaTrader 5 — Autonomous Trading System
## Master Architecture Document v1.0

---

## 1. System Philosophy

This system separates **intelligence** from **execution**. OpenClaw serves as the
centralized decision brain — performing market analysis, regime detection, signal
generation, risk computation, and adaptive learning. MetaTrader 5 serves strictly
as the execution layer — receiving atomic instructions and managing order lifecycle.

Neither layer trusts the other implicitly. The EA validates every instruction against
its own risk guardrails before execution. The brain validates every fill report
against expected outcomes. This adversarial redundancy is the foundation of
survivability.

**Core Invariants (never violated):**
- Every position has a stop-loss at entry time. No exceptions.
- No martingale. No grid. No averaging down.
- Stop-losses are never widened or removed after placement.
- Maximum risk per trade: 2% of equity (base model), 4% (aggressive variant).
- Daily drawdown hard cap halts all new entries.
- Monthly drawdown hard cap halts all new entries for the remainder of the month.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VPS HOST (Linux/Windows)                     │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     OPENCLAW BRAIN (Python)                   │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │  │
│  │  │  Data Ingest │  │ Regime       │  │ Signal Generator     │ │  │
│  │  │  Engine      │──│ Detector     │──│ (Multi-TF Alignment) │ │  │
│  │  └─────────────┘  └──────────────┘  └──────────┬───────────┘ │  │
│  │                                                 │             │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────▼───────────┐ │  │
│  │  │ Performance │  │ Adaptive     │  │ Risk Engine          │ │  │
│  │  │ Tracker     │──│ Allocator    │──│ (Position Sizing,    │ │  │
│  │  └─────────────┘  └──────────────┘  │  Drawdown Guards)    │ │  │
│  │                                      └──────────┬───────────┘ │  │
│  │                                                 │             │  │
│  │                                      ┌──────────▼───────────┐ │  │
│  │                                      │ Signal Dispatcher    │ │  │
│  │                                      │ (JSON via TCP/File)  │ │  │
│  │                                      └──────────┬───────────┘ │  │
│  └──────────────────────────────────────────────────┼────────────┘  │
│                                                     │               │
│  ┌──────────────────────────────────────────────────┼────────────┐  │
│  │                    METATRADER 5 (EA)              │            │  │
│  │                                                   │            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────▼──────────┐│  │
│  │  │ Order        │  │ Risk         │  │ Signal Receiver      ││  │
│  │  │ Manager      │──│ Validator    │──│ (JSON Parser)        ││  │
│  │  └──────┬───────┘  └──────────────┘  └──────────────────────┘│  │
│  │         │                                                     │  │
│  │  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────────┐│  │
│  │  │ Fill/Status  │  │ Heartbeat    │  │ Kill Switch          ││  │
│  │  │ Reporter     │──│ Monitor      │──│ (Emergency Close)    ││  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘│  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     SHARED INFRASTRUCTURE                     │  │
│  │                                                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│  │
│  │  │ PostgreSQL   │  │ Redis        │  │ Monitoring           ││  │
│  │  │ (Persistent  │  │ (Real-time   │  │ (Prometheus +        ││  │
│  │  │  Logging)    │  │  State)      │  │  Grafana + Alerts)   ││  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘│  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Responsibilities

### 3.1 OpenClaw Brain (Python Process)

| Component | Responsibility |
|---|---|
| **Data Ingest Engine** | Pulls OHLCV from MT5 via Python MT5 API. Maintains rolling buffers for M5, M15, H1, H4, D1. Computes derived features (ATR, Bollinger Width, ADX, RSI, volume profile). |
| **Regime Detector** | Classifies current market state per asset: TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE_EXPANSION, VOLATILE_CONTRACTION, UNKNOWN. Uses ADX + Bollinger Bandwidth + price structure. |
| **Signal Generator** | Produces trade signals only during VOLATILE_EXPANSION + trend alignment across M15/H1/H4. Requires minimum 1:2 R:R. |
| **Risk Engine** | Computes position size from equity, ATR-based stop distance, and per-trade risk %. Enforces daily/monthly drawdown caps. Applies volatility scaling. |
| **Adaptive Allocator** | Reallocates exposure budget across BTC/ETH/XAU based on trailing 30-day per-asset Sharpe, win rate, and drawdown. Reduces allocation to underperforming assets. |
| **Performance Tracker** | Maintains running P&L, win/loss streaks, per-asset metrics, expectancy, Sharpe, max drawdown. Feeds adaptive allocator. |
| **Signal Dispatcher** | Serializes validated signals to JSON files (primary) and TCP socket (secondary). Implements delivery confirmation. |

### 3.2 MetaTrader 5 EA (MQL5 Process)

| Component | Responsibility |
|---|---|
| **Signal Receiver** | Reads JSON signal files from shared directory. Parses and validates schema. |
| **Risk Validator** | Independent sanity checks: lot size within broker limits, stop-loss present and reasonable, no duplicate signals, equity sufficient. |
| **Order Manager** | Executes market orders with SL/TP. Manages trailing stops. Handles partial closes. Reports fill prices and slippage. |
| **Fill Reporter** | Writes execution confirmations back to shared directory as JSON. Includes actual fill price, slippage, commission. |
| **Heartbeat Monitor** | Sends periodic heartbeat. If brain goes silent >60s, enters safe mode (tighten stops, no new entries). |
| **Kill Switch** | On critical conditions (equity drop >X%, connection loss >5min, invalid signal flood), closes all positions and halts. |

### 3.3 Shared Infrastructure

| Component | Responsibility |
|---|---|
| **PostgreSQL** | Persistent storage for all trades, signals, regime classifications, daily snapshots, configuration history. |
| **Redis** | Real-time state: current positions, pending signals, latest prices, regime state, heartbeat timestamps. |
| **Prometheus + Grafana** | System metrics (latency, signal count, CPU/memory), trading metrics (P&L curve, drawdown, hit rate). |
| **Alerting** | Telegram/email alerts on: kill-switch activation, drawdown threshold breach, heartbeat failure, new trade entry, daily summary. |

---

## 4. Communication Flow

### 4.1 Signal Lifecycle

```
Brain computes signal
    │
    ▼
Risk Engine validates (size, drawdown budget)
    │
    ▼
Signal written to /signals/pending/{timestamp}_{asset}.json
Signal published to Redis channel "signals:new"
    │
    ▼
EA polls /signals/pending/ every 500ms
EA reads and validates signal
    │
    ├─► VALID: Execute order
    │       │
    │       ▼
    │   Write confirmation to /signals/filled/{signal_id}.json
    │   Move original to /signals/processed/
    │   Publish to Redis "signals:filled"
    │
    └─► INVALID: Write rejection to /signals/rejected/{signal_id}.json
            Move original to /signals/rejected_source/
            Publish to Redis "signals:rejected"
```

### 4.2 File-Based Communication (Primary)

File-based is the primary channel because:
- MT5/MQL5 has limited TCP socket support
- Files are inspectable, debuggable, and survive process restarts
- Atomic file operations prevent partial reads (write to .tmp, rename)

### 4.3 Heartbeat Protocol

```
Every 10 seconds:
    Brain writes: /heartbeat/brain_{timestamp}.json
    EA writes:    /heartbeat/ea_{timestamp}.json

Brain monitors EA heartbeat:
    Missing 3 consecutive (30s) → WARNING state (log, alert)
    Missing 6 consecutive (60s) → CRITICAL (halt new signals)
    Missing 12 consecutive (120s) → EMERGENCY (assume EA dead, alert)

EA monitors Brain heartbeat:
    Missing 6 consecutive (60s) → SAFE MODE (tighten all stops to breakeven-or-better)
    Missing 12 consecutive (120s) → EMERGENCY (close all positions, halt)
```

---

## 5. Asset Configuration

| Asset | Session Focus | Typical ATR(H1) | Spread Budget | Min R:R |
|-------|---------------|------------------|---------------|---------|
| BTCUSD | 24/7, emphasis on US+Asia overlap | 200-800 USD | 30 USD | 1:2 |
| ETHUSD | 24/7, emphasis on US+Asia overlap | 15-60 USD | 3 USD | 1:2 |
| XAUUSD | London+NY sessions, reduced Asia | 5-20 USD | 0.30 USD | 1:2 |

---

## 6. Timeframe Hierarchy

| Timeframe | Role |
|-----------|------|
| D1 | Macro trend direction, major S/R, regime context |
| H4 | Intermediate trend, swing structure, regime confirmation |
| H1 | Primary signal timeframe, entry bias, ATR for position sizing |
| M15 | Entry timing, breakout confirmation, precise SL placement |
| M5 | Execution refinement (optional, for reducing slippage) |

**Alignment Rule:** A long signal requires D1 or H4 bias bullish/neutral, H1 trend bullish,
M15 volatility expansion with bullish breakout. All three higher timeframes must agree on
direction. Ranging regime on H1 or H4 vetoes all signals.

---

## 7. Document Index

| Document | Location |
|----------|----------|
| Risk Engine Specification | `system-design/01-RISK-ENGINE.md` |
| Signal Format & Protocol | `system-design/02-SIGNAL-FORMAT.md` |
| Volatility & Trend Model | `system-design/03-VOLATILITY-TREND-MODEL.md` |
| Adaptive Allocation Logic | `system-design/04-ADAPTIVE-ALLOCATION.md` |
| Kill-Switch Logic | `system-design/05-KILL-SWITCH.md` |
| Performance Tracking | `system-design/06-PERFORMANCE-TRACKING.md` |
| Critical Analysis & Improvements | `system-design/07-CRITICAL-ANALYSIS.md` |
| High-Risk Compounding Variant | `system-design/08-HIGH-RISK-VARIANT.md` |
| OpenClaw Decision Engine | `pseudocode/openclaw_brain.py` |
| MT5 EA Execution Layer | `pseudocode/mt5_ea.mqh` |
| Database Schema | `schemas/database_schema.sql` |
| Backtest Guide | `deployment/BACKTEST-GUIDE.md` |
| VPS Deployment Guide | `deployment/VPS-DEPLOYMENT.md` |
