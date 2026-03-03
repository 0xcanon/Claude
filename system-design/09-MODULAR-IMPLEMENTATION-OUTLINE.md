# Clean Modular Implementation Outline

## 1. Module Dependency Graph

```
                    ┌──────────────┐
                    │   main.py    │
                    │  (Entry)     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  engine.py   │
                    │ (Orchestrator)│
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼─────┐    ┌─────▼─────┐    ┌─────▼──────┐
    │  Signal   │    │   Risk    │    │  Publisher  │
    │ Generator │    │  Engine   │    │            │
    └────┬─────┘    └─────┬─────┘    └────────────┘
         │                │
    ┌────┼────┐     ┌─────┼──────────┐
    │    │    │     │     │          │
┌───▼┐ ┌▼──┐ ┌▼──┐ ┌▼──┐ ┌▼────┐ ┌──▼──────┐
│Rgm │ │MTF│ │Vol│ │KS │ │Adpt │ │Self-Impr│
│Det │ │Eng│ │Det│ │Ctl│ │Sizer│ │Module   │
└─┬──┘ └─┬─┘ └─┬─┘ └───┘ └─────┘ └─────────┘
  │       │     │
  └───────┼─────┘
          │
   ┌──────▼───────┐
   │  Data Manager │
   │ + Indicators  │
   └──────┬────────┘
          │
   ┌──────▼───────┐
   │   MT5 API    │
   │ (Data Feed)  │
   └──────────────┘
```

---

## 2. Module Specifications

### 2.1 config.py
```
Purpose: Centralized configuration management
Dependencies: None (leaf module)
Inputs: .env file, config.yaml
Outputs: Config dataclass

Responsibilities:
  - Load all parameters from environment/config files
  - Validate parameter bounds on startup
  - Provide immutable configuration to all modules
  - Separate base model and high-risk variant configs
```

### 2.2 data_manager.py
```
Purpose: Market data ingestion and caching
Dependencies: config, MT5 API
Inputs: Asset symbols, timeframes
Outputs: MarketData objects (OHLCV arrays)

Responsibilities:
  - Fetch historical data on initialization
  - Maintain rolling buffers per asset/timeframe
  - Incremental updates (append new bars)
  - Data freshness tracking
  - Data quality validation (no gaps, no NaN)

Key Methods:
  initialize()                         → Load 500 bars for all assets/TFs
  update(asset, timeframe)             → Fetch and append latest bars
  get(asset, timeframe) → MarketData   → Return cached data
  is_fresh(asset, timeframe) → bool    → Check data age
```

### 2.3 indicators.py
```
Purpose: Technical indicator calculations
Dependencies: None (pure math)
Inputs: Price arrays (lists/numpy)
Outputs: Indicator values

Responsibilities:
  - EMA, SMA, ATR, ADX, RSI, MACD, Bollinger Bands
  - Supertrend, Stochastic
  - Percentile rank
  - All functions are stateless and pure

Key Methods:
  ema(data, period) → list
  sma(data, period) → list
  atr(high, low, close, period) → list
  adx(high, low, close, period) → list
  rsi(close, period) → list
  macd(close, fast, slow, signal) → tuple
  bollinger_band_width(close, period, std) → list
  supertrend(high, low, close, period, mult) → list
  percentile_rank(data, lookback) → float
```

### 2.4 regime_detector.py
```
Purpose: Market regime classification
Dependencies: data_manager, indicators
Inputs: Asset symbol
Outputs: RegimeState (regime, confidence, features)

Responsibilities:
  - Classify market into 6 regimes per asset
  - Maintain regime history for transition detection
  - Oscillation detection for range identification
  - Confidence scoring

Key Methods:
  classify(asset) → RegimeState
  get_recent_regimes(asset, count) → List[RegimeState]
  detect_oscillation(close, lookback) → bool
```

### 2.5 mtf_alignment.py
```
Purpose: Multi-timeframe trend alignment analysis
Dependencies: data_manager, indicators
Inputs: Asset symbol
Outputs: AlignmentState (score, quality, tradeable, breakdown)

Responsibilities:
  - Classify trend direction per timeframe (D1, H4, H1, M15)
  - Compute weighted alignment score
  - Determine alignment quality (PERFECT, STRONG, WEAK)
  - Tradeable decision (is alignment sufficient?)

Key Methods:
  compute_alignment(asset) → AlignmentState
```

### 2.6 vol_detector.py
```
Purpose: Volatility expansion detection
Dependencies: data_manager, indicators, regime_detector
Inputs: Asset symbol
Outputs: Expansion state dict, entry window bool

Responsibilities:
  - Multi-signal volatility expansion confirmation
  - Entry timing (early expansion detection)
  - Requires 3/5 expansion signals for confirmation

Key Methods:
  is_expanding(asset) → dict (details + is_expanding bool)
  is_entry_window(asset) → bool
```

### 2.7 signal_generator.py
```
Purpose: Generate trade signals
Dependencies: regime_detector, mtf_alignment, vol_detector, data_manager
Inputs: Asset symbol
Outputs: Signal object or None

Responsibilities:
  - Evaluate all entry criteria (10-step process)
  - Compute entry price, SL, TP
  - Validate R:R ratio
  - Compute signal quality score
  - Signal ID generation

Key Methods:
  evaluate(asset) → Optional[Signal]
```

### 2.8 risk_engine.py
```
Purpose: Multi-layered risk management
Dependencies: config
Inputs: Signal, account state
Outputs: Approved Signal (with lot_size) or None

Responsibilities:
  - 5-layer risk processing (per-trade, portfolio, drawdown, regime, adaptive)
  - Position size computation
  - Portfolio heat monitoring
  - Correlation guard (BTC/ETH)
  - Hard cap enforcement
  - State management (watermarks, counters)

Key Methods:
  process_signal(signal) → Optional[Signal]
  update_state(account_info, positions) → None
  get_state() → RiskEngineState
```

### 2.9 kill_switch.py
```
Purpose: Emergency safety system
Dependencies: risk_engine
Inputs: Risk state, system health
Outputs: OperationalMode

Responsibilities:
  - Evaluate all kill-switch conditions every second
  - Trigger mode changes (NORMAL → REDUCED → DEFENSIVE → HALTED → EMERGENCY)
  - Publish close-all signals when triggered
  - Alert operator on mode changes
  - Write emergency halt file

Key Methods:
  evaluate() → OperationalMode
```

### 2.10 publisher.py
```
Purpose: Signal publication via IPC
Dependencies: config
Inputs: Signal objects
Outputs: JSON files (atomic writes)

Responsibilities:
  - Format signals as JSON
  - Compute integrity hash
  - Atomic file writes (tmp → rename)
  - Heartbeat publication
  - Close-all publication
  - Execution report reading

Key Methods:
  publish(signal) → None
  publish_heartbeat(risk_state) → None
  publish_close_all() → None
  read_execution_report() → Optional[ExecutionReport]
```

### 2.11 self_improvement.py
```
Purpose: Adaptive parameter tuning
Dependencies: config, database
Inputs: Performance history, risk state
Outputs: Parameter adjustments (bounded)

Responsibilities:
  - Daily asset allocation rebalancing
  - Weekly signal threshold adjustment
  - Weekly SL distance tuning
  - Hard bounds enforcement (safety net)
  - Change rate limiting
  - Audit logging of all changes

Key Methods:
  run_daily(risk_state) → dict (changes made)
  enforce_hard_bounds() → None
```

### 2.12 database.py
```
Purpose: PostgreSQL interface
Dependencies: psycopg2, config
Inputs: Various data objects
Outputs: Stored/retrieved data

Responsibilities:
  - Connection pooling
  - CRUD for all tables (signals, trades, summaries, etc.)
  - Materialized view refresh
  - Performance query methods

Key Methods:
  log_signal(signal) → None
  log_trade(trade) → None
  log_risk_event(event) → None
  log_self_improvement(changes) → None
  get_recent_trades(asset, count) → list
  get_daily_summary(date) → dict
  refresh_views() → None
```

### 2.13 alerts.py
```
Purpose: Operator notification system
Dependencies: python-telegram-bot, config
Inputs: Alert messages, severity
Outputs: Telegram/email notifications

Responsibilities:
  - Send Telegram alerts (mode changes, kills, daily summaries)
  - Command handling (/status, /halt, /resume, etc.)
  - Alert throttling (prevent spam)
  - Authentication (only authorized users)

Key Methods:
  send_alert(severity, message) → None
  handle_command(command) → str (response)
  send_daily_summary(summary) → None
```

### 2.14 engine.py (Orchestrator)
```
Purpose: Main loop orchestration
Dependencies: ALL modules
Inputs: None (self-contained)
Outputs: Trading operations

Responsibilities:
  - Initialize all components
  - Run main loop (heartbeat, regime updates, signal evaluation)
  - Route signals through risk engine → publisher
  - Handle daily resets
  - Graceful shutdown

Key Methods:
  initialize() → None
  run() → None (blocking main loop)
  shutdown() → None
```

---

## 3. Testing Strategy

### 3.1 Unit Tests

```
tests/
├── test_indicators.py        # Pure math — easy to test
├── test_regime_detector.py   # Feed known data, verify classification
├── test_mtf_alignment.py     # Feed known trends, verify scoring
├── test_vol_detector.py      # Feed known vol patterns, verify detection
├── test_signal_generator.py  # Integration of above, verify signal/no-signal
├── test_risk_engine.py       # Critical — test every layer independently
├── test_kill_switch.py       # Test every trigger condition
├── test_publisher.py         # Test JSON format, hash, atomic writes
├── test_self_improvement.py  # Test bounds, rate limits, safety
└── test_database.py          # Test CRUD operations
```

### 3.2 Integration Tests

```
tests/integration/
├── test_signal_to_publish.py      # Signal generation → risk → publish
├── test_kill_switch_cascade.py    # Drawdown → mode change → close all
├── test_daily_cycle.py            # Full daily cycle including reset
└── test_recovery_protocol.py      # Halt → cooldown → restart
```

### 3.3 Simulation Tests

```
tests/simulation/
├── test_backtest_engine.py        # Walk-forward on historical data
├── test_monte_carlo.py            # Monte Carlo simulation
└── test_stress_scenarios.py       # Flash crash, correlation spike, etc.
```

---

## 4. Risk-Adjustment Logic Examples

### Example 1: Normal Conditions

```
Account equity: $10,000
Regime: TRENDING_STRONG
MTF Alignment: PERFECT (score = 0.85)
Signal Score: 0.82
Asset: BTCUSD
Daily DD: -0.5%
Monthly DD: -1.2%
Consecutive losses: 0
BTC/ETH correlation: 0.72
Current portfolio heat: 0%
ETHUSD open: No

Computation:
  Base risk: 2.0%
  Drawdown factor: 1.0 (no reduction)
  Regime factor: 1.0 (TRENDING_STRONG)
  Performance factor: 1.0 (normal)
  Correlation factor: 1.0 (no crypto positions open)

  Final risk: 2.0% × 1.0 × 1.0 × 1.0 × 1.0 = 2.0%
  Risk dollars: $10,000 × 0.02 = $200

  Entry: 87,432.50
  SL: 86,580.00 (852.50 points)
  Tick value: $1/point per lot

  Lot size: $200 / (852.50 × $1) = 0.23 lots

  Signal: APPROVED
  Lot: 0.23
  Risk: 2.0%
```

### Example 2: Moderate Drawdown + Correlated Exposure

```
Account equity: $9,400 (was $10,000)
Regime: TRENDING_WEAK
Signal Score: 0.72
Asset: ETHUSD
Daily DD: -3.5% (REDUCED mode)
Monthly DD: -6.0%
Consecutive losses: 2
BTC/ETH correlation: 0.82
Current portfolio heat: 2.0% (BTCUSD position open)
BTCUSD open: Yes, using 2.0% heat

Computation:
  Base risk: 2.0%
  Drawdown factor: 0.50 (REDUCED mode)
  Regime factor: 0.70 (TRENDING_WEAK)
  Performance factor: 0.95 (slight underperformance)
  Correlation factor: 0.70 (BTC open + corr > 0.70)

  Final risk: 2.0% × 0.50 × 0.70 × 0.95 × 0.70 = 0.47%

  But: min risk = 0.5% → adjusted to 0.5%
  Risk dollars: $9,400 × 0.005 = $47.00

  Entry: 3,245.00
  SL: 3,195.00 (50 points)
  Tick value: $1/point per lot

  Lot size: $47 / (50 × $1) = 0.94 lots → round to 0.94

  Heat check: Current 2.0% + 0.5% = 2.5% < 6.0% max → OK
  Crypto combined: 2.0% + 0.5% = 2.5% < 4.0% (corr-adjusted max) → OK

  Signal: APPROVED (small size due to drawdown + correlation)
```

### Example 3: Kill-Switch Activation

```
Account equity: $8,600 (was $10,000)
Daily DD: -5.2% → DEFENSIVE mode triggered

At signal evaluation time:
  DEFENSIVE mode active
  Only signal scores >= 0.85 accepted
  Max 1 position at a time
  Position size × 0.25

Signal arrives: Score = 0.78
  → REJECTED (score 0.78 < defensive threshold 0.85)

Signal arrives: Score = 0.88
  But 1 position already open
  → REJECTED (DEFENSIVE: max 1 position)

Later: Daily DD hits -7.1%
  → HALTED mode triggered
  → CLOSE ALL POSITIONS immediately
  → Emergency halt file written
  → Telegram alert: "DAILY DRAWDOWN -7.1% — SYSTEM HALTED"
  → No new trades until operator /resume after 4-hour cooldown
```

### Example 4: High-Risk Variant Kelly Sizing

```
Account equity: $5,000
Variant: HIGH_RISK
Win rate (last 50 trades): 52%
Avg Win/Loss ratio: 2.3
Regime: VOLATILE_EXPANSION
Signal Score: 0.85
Asset: BTCUSD
No open positions, no drawdown

Kelly calculation:
  Kelly = 0.52 - (0.48 / 2.3) = 0.52 - 0.209 = 0.311 (31.1%)
  Half-Kelly = 15.5%
  Hard cap = 5.0%
  → Risk = 5.0%

  Confidence adjustment (50 trade sample):
  Confidence factor = 0.70
  Adjusted = 5.0% × 0.70 = 3.5%

  With regime factor = 1.0 (VOLATILE_EXPANSION)
  Final risk = 3.5%

  Risk dollars: $5,000 × 0.035 = $175

  Entry: 87,500
  SL: 86,500 (1,000 points)
  Lot: $175 / (1000 × $1) = 0.175 → 0.17

  Signal: APPROVED
  Lot: 0.17
  Risk: 3.4%
```

### Example 5: Self-Improvement Reallocation

```
Current allocation: BTCUSD=0.40, ETHUSD=0.30, XAUUSD=0.30

Performance scores (last 20 trades each):
  BTCUSD: win_rate=55%, avg_rr=2.4, PF=2.1 → score=1.45
  ETHUSD: win_rate=38%, avg_rr=1.8, PF=0.9 → score=0.65
  XAUUSD: win_rate=52%, avg_rr=2.1, PF=1.8 → score=1.25

Regime suitability:
  BTCUSD: TRENDING_STRONG → 1.5
  ETHUSD: RANGING → 0.1
  XAUUSD: TRENDING_WEAK → 0.8

Raw weights:
  BTCUSD: 0.40 × 1.45 × 1.5 = 0.870
  ETHUSD: 0.30 × 0.65 × 0.1 = 0.020
  XAUUSD: 0.30 × 1.25 × 0.8 = 0.300

Normalized: BTCUSD=0.731, ETHUSD=0.017, XAUUSD=0.252

Apply bounds (min 10%, max 60%):
  BTCUSD: 0.60 (capped)
  ETHUSD: 0.10 (floored)
  XAUUSD: 0.30

Re-normalize: BTCUSD=0.60, ETHUSD=0.10, XAUUSD=0.30

Apply max daily change (±10%):
  BTCUSD: 0.40 → 0.50 (max change of +0.10)
  ETHUSD: 0.30 → 0.20 (max change of -0.10)
  XAUUSD: 0.30 → 0.30 (no change needed)

Final allocation: BTCUSD=0.50, ETHUSD=0.20, XAUUSD=0.30

Result: BTC gets more capital (performing well + strong trend)
        ETH gets less (performing poorly + ranging)
        Gold stays stable (decent performance + weak trend)

Tomorrow the process repeats. Over multiple days:
  BTCUSD will continue getting more if it keeps performing
  ETHUSD will recover once regime shifts and performance improves
```
