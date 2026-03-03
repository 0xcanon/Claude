# OpenClaw x MetaTrader 5 Autonomous Trading System
## Institutional-Grade Architecture Design Document

**Version:** 1.0.0
**Classification:** Production System Design
**Assets:** BTCUSD, ETHUSD, XAUUSD
**Runtime:** 24/7 VPS Deployment
**Risk Profile:** Aggressive-Controlled (Base) / High-Compounding (Variant)

---

## Table of Contents

1. [System Philosophy](#1-system-philosophy)
2. [Architecture Overview](#2-architecture-overview)
3. [Component Separation Model](#3-component-separation-model)
4. [Data Flow Diagram](#4-data-flow-diagram)
5. [Technology Stack](#5-technology-stack)
6. [Operational Modes](#6-operational-modes)

---

## 1. System Philosophy

This system operates on the principle of **strict separation of concerns**:

- **OpenClaw** is the **brain**: signal generation, regime detection, risk computation, portfolio allocation, performance analysis, and self-improvement logic.
- **MetaTrader 5 EA** is the **hands**: order execution, position management, stop-loss enforcement, and local safety checks.

The brain never touches execution. The hands never make decisions. This separation ensures:

1. No single point of failure can bypass risk controls
2. The decision engine can be swapped, upgraded, or retrained without touching execution
3. Execution latency is minimized because the EA operates on pre-computed instructions
4. Auditability: every decision is logged before execution begins

**Core Trading Philosophy:**
- Trade volatility expansion exclusively — never trade into compression
- Require multi-timeframe trend alignment before entry
- Minimum 1:2 risk/reward enforced at signal generation, not execution
- Avoid ranging/choppy markets through regime classification
- Dynamically reduce exposure during low-volatility regimes
- Adapt asset allocation based on rolling performance attribution

**Absolute Prohibitions:**
- No martingale or anti-martingale position sizing
- No grid trading
- No removal or widening of stop-losses post-entry
- No averaging down into losing positions
- No correlation-blind simultaneous entries on BTC+ETH

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VPS HOST (Linux/Windows)                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              OPENCLAW DECISION ENGINE                     │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐     │   │
│  │  │  Market     │ │  Regime    │ │  Signal          │     │   │
│  │  │  Data       │ │  Detector  │ │  Generator       │     │   │
│  │  │  Ingestion  │ │            │ │                  │     │   │
│  │  └──────┬─────┘ └──────┬─────┘ └────────┬─────────┘     │   │
│  │         │              │                 │               │   │
│  │  ┌──────▼──────────────▼─────────────────▼───────────┐   │   │
│  │  │              STRATEGY ORCHESTRATOR                  │   │   │
│  │  │  - Multi-Timeframe Alignment Engine                │   │   │
│  │  │  - Volatility Expansion Filter                     │   │   │
│  │  │  - Trend Strength Scorer                           │   │   │
│  │  │  - Range Detection & Rejection                     │   │   │
│  │  └──────────────────────┬────────────────────────────┘   │   │
│  │                         │                                │   │
│  │  ┌──────────────────────▼────────────────────────────┐   │   │
│  │  │              RISK ENGINE                           │   │   │
│  │  │  - Position Sizing (Kelly-fraction derived)        │   │   │
│  │  │  - Portfolio Heat Monitor                          │   │   │
│  │  │  - Correlation Guard (BTC/ETH)                     │   │   │
│  │  │  - Drawdown Circuit Breakers                       │   │   │
│  │  │  - Adaptive Exposure Allocator                     │   │   │
│  │  └──────────────────────┬────────────────────────────┘   │   │
│  │                         │                                │   │
│  │  ┌──────────────────────▼────────────────────────────┐   │   │
│  │  │         SELF-IMPROVEMENT MODULE                    │   │   │
│  │  │  - Rolling Performance Attribution                 │   │   │
│  │  │  - Strategy Parameter Tuning (constrained)         │   │   │
│  │  │  - Regime-Performance Correlation Analysis          │   │   │
│  │  │  - Asset Weight Rebalancing                        │   │   │
│  │  └──────────────────────┬────────────────────────────┘   │   │
│  │                         │                                │   │
│  │  ┌──────────────────────▼────────────────────────────┐   │   │
│  │  │         SIGNAL PUBLISHER                           │   │   │
│  │  │  - JSON Signal Formatter                           │   │   │
│  │  │  - File/Socket/Redis Writer                        │   │   │
│  │  │  - Signal Integrity Hash                           │   │   │
│  │  └──────────────────────┬────────────────────────────┘   │   │
│  └─────────────────────────┼────────────────────────────────┘   │
│                            │                                     │
│              ──────────────┼──────────────── IPC BOUNDARY        │
│                            │                                     │
│  ┌─────────────────────────▼────────────────────────────────┐   │
│  │              MT5 EXPERT ADVISOR                            │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐     │   │
│  │  │  Signal     │ │  Order     │ │  Position        │     │   │
│  │  │  Reader     │ │  Executor  │ │  Manager         │     │   │
│  │  └──────┬─────┘ └──────┬─────┘ └────────┬─────────┘     │   │
│  │         │              │                 │               │   │
│  │  ┌──────▼──────────────▼─────────────────▼───────────┐   │   │
│  │  │         LOCAL SAFETY LAYER                         │   │   │
│  │  │  - SL Enforcement (never remove)                   │   │   │
│  │  │  - Max Position Size Guard                         │   │   │
│  │  │  - Max Open Positions Guard                        │   │   │
│  │  │  - Heartbeat Monitor (kill if brain disconnects)   │   │   │
│  │  │  - Emergency Close-All                             │   │   │
│  │  └───────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              SHARED INFRASTRUCTURE                        │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐     │   │
│  │  │  PostgreSQL │ │  Redis     │ │  Monitoring       │     │   │
│  │  │  Database   │ │  Pub/Sub   │ │  (Grafana/Prom)   │     │   │
│  │  └────────────┘ └────────────┘ └──────────────────┘     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Separation Model

### 3.1 OpenClaw Decision Engine (Python)

| Component | Responsibility | Update Frequency |
|---|---|---|
| Market Data Ingestion | Fetch OHLCV from MT5 API / external feeds | Every 1s (tick), 1m, 5m, 15m, 1H, 4H, 1D |
| Regime Detector | Classify market as trending/ranging/volatile/quiet | Every 5 minutes |
| Signal Generator | Produce entry/exit/modify signals | On new candle close (multi-TF) |
| Risk Engine | Size positions, enforce drawdown limits | Per-signal + continuous monitoring |
| Self-Improvement Module | Adjust parameters within constrained bounds | Daily at 00:00 UTC |
| Signal Publisher | Write validated signals to IPC channel | On signal generation |
| Kill Switch Controller | Emergency halt all trading | Continuous (1s heartbeat) |

### 3.2 MT5 Expert Advisor (MQL5)

| Component | Responsibility | Update Frequency |
|---|---|---|
| Signal Reader | Read signals from file/pipe/socket | Every 500ms poll |
| Order Executor | Place/modify/close orders per signal | On valid signal receipt |
| Position Manager | Trail stops, manage partials | Every tick |
| Local Safety Layer | Enforce hard limits regardless of signal | Every tick |
| Heartbeat Reporter | Confirm EA alive to OpenClaw | Every 1s |
| State Reporter | Report fills, positions, equity to OpenClaw | Every 1s |

### 3.3 Why This Separation Matters

1. **OpenClaw crash** → EA detects heartbeat loss → closes all positions safely
2. **MT5 crash** → OpenClaw detects no heartbeat response → halts signal generation, alerts operator
3. **Bad signal** → EA validates against local safety rules → rejects if invalid
4. **Network partition** → Both sides have independent safety → system degrades gracefully

---

## 4. Data Flow Diagram

```
[Market Data Sources]
        │
        ▼
[OpenClaw: Data Ingestion Layer]
        │
        ├──► [Feature Engineering Pipeline]
        │           │
        │           ├──► Volatility Features (ATR, Bollinger Width, ADX)
        │           ├──► Trend Features (EMA Cross, Supertrend, MACD)
        │           ├──► Momentum Features (RSI, Stochastic, MFI)
        │           └──► Market Structure (S/R Levels, Fair Value Gaps)
        │
        ▼
[Regime Classification Engine]
        │
        ├──► TRENDING_STRONG   → Full exposure allowed
        ├──► TRENDING_WEAK     → Reduced exposure (0.7x)
        ├──► RANGING           → NO TRADE (skip)
        ├──► VOLATILE_EXPANSION → Full exposure allowed
        ├──► VOLATILE_CHAOTIC  → Reduced exposure (0.5x)
        └──► LOW_VOLATILITY    → Minimal exposure (0.3x) or NO TRADE
        │
        ▼
[Multi-Timeframe Alignment Check]
        │
        ├──► 4H trend direction
        ├──► 1H trend confirmation
        ├──► 15m entry timing
        └──► 5m precision entry (optional)
        │
        ▼
[Signal Generation]
        │
        ├──► Validate R:R >= 1:2
        ├──► Validate not in range regime
        ├──► Validate volatility expansion active
        └──► Validate multi-TF aligned
        │
        ▼
[Risk Engine Processing]
        │
        ├──► Calculate position size (2% risk base)
        ├──► Apply regime multiplier
        ├──► Apply asset allocation weight
        ├──► Apply correlation discount (BTC+ETH)
        ├──► Apply drawdown reduction factor
        └──► Apply portfolio heat limit
        │
        ▼
[Signal Published via IPC]
        │
        ▼
[MT5 EA: Signal Validation]
        │
        ├──► Verify signal integrity (hash check)
        ├──► Verify signal freshness (< 5s old)
        ├──► Verify against local safety limits
        └──► Verify SL is present and valid
        │
        ▼
[MT5 EA: Order Execution]
        │
        ├──► Market order with SL + TP
        ├──► Slippage tolerance: 3 points
        └──► Retry logic: 3 attempts, 500ms apart
        │
        ▼
[MT5 EA: State Report Back to OpenClaw]
        │
        ▼
[OpenClaw: Performance Tracking & Database Logging]
```

---

## 5. Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| Decision Engine | Python 3.11+ | Rich ML/statistics ecosystem, OpenClaw integration |
| MT5 Integration | MetaTrader5 Python package | Native bridge for data + account info |
| EA Execution | MQL5 | Native MT5 execution, lowest latency |
| IPC Primary | Named Pipe (Windows) / Unix Socket (Linux) | Sub-millisecond latency |
| IPC Fallback | File-based JSON (shared directory) | Universal compatibility |
| IPC Optional | Redis Pub/Sub | If components on separate machines |
| Database | PostgreSQL 15+ | ACID compliance, time-series extensions |
| Cache/State | Redis 7+ | Signal queue, real-time state, pub/sub |
| Monitoring | Prometheus + Grafana | Industry standard metrics + dashboards |
| Alerting | Telegram Bot API + Email (SMTP) | Real-time operator notifications |
| VPS OS | Windows Server 2022 (MT5 requirement) | MT5 requires Windows; Linux via Wine not recommended for production |
| Process Manager | NSSM (Windows service wrapper) | Auto-restart, logging |

---

## 6. Operational Modes

### 6.1 NORMAL
- All systems operational
- Full signal generation and execution
- Standard risk parameters active

### 6.2 REDUCED
- Triggered by moderate drawdown (daily > 3%)
- Position sizes reduced by 50%
- Only highest-confidence signals taken (score >= 0.8)
- Alert sent to operator

### 6.3 DEFENSIVE
- Triggered by significant drawdown (daily > 5%)
- Position sizes reduced by 75%
- Only 1 position open at a time
- Hourly alerts to operator

### 6.4 HALTED
- Triggered by critical drawdown (daily > 7% or monthly > 12%)
- All positions closed
- No new trades until manual operator reset
- Immediate alert to operator

### 6.5 EMERGENCY
- Triggered by system failure (heartbeat loss, data feed failure, broker disconnect)
- All positions closed immediately
- System enters safe mode
- Requires manual intervention to restart

### 6.6 MAINTENANCE
- Manually triggered by operator
- Existing positions managed (trailing stops continue)
- No new entries
- Used for updates, parameter changes, system checks
