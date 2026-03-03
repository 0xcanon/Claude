# Risk Engine Design

## 1. Risk Engine Architecture

The risk engine is the most critical component. It operates as a **multi-layered filter** — every signal must pass through ALL layers before execution is permitted.

```
[Raw Signal from Strategy]
        │
        ▼
┌─────────────────────────────┐
│  LAYER 1: Per-Trade Risk    │  → Position sizing, SL validation
└──────────────┬──────────────┘
               │ PASS
               ▼
┌─────────────────────────────┐
│  LAYER 2: Portfolio Risk    │  → Heat check, correlation, exposure
└──────────────┬──────────────┘
               │ PASS
               ▼
┌─────────────────────────────┐
│  LAYER 3: Drawdown Guards   │  → Daily/monthly limits
└──────────────┬──────────────┘
               │ PASS
               ▼
┌─────────────────────────────┐
│  LAYER 4: Regime Adjustment │  → Volatility/regime multipliers
└──────────────┬──────────────┘
               │ PASS
               ▼
┌─────────────────────────────┐
│  LAYER 5: Adaptive Sizing   │  → Performance-based adjustment
└──────────────┬──────────────┘
               │ PASS
               ▼
[Approved Signal → Publish to EA]
```

---

## 2. Layer 1: Per-Trade Risk Calculation

### 2.1 Base Position Sizing

```
RISK_PER_TRADE = 2.0% of account equity

Position Size (lots) = (Account_Equity × Risk_Percent) / (SL_Distance_Points × Point_Value_Per_Lot)
```

**Asset-Specific Parameters:**

| Asset | Typical SL (ATR-based) | Point Value (1 lot) | Min Lot | Lot Step |
|---|---|---|---|---|
| BTCUSD | 1.5 × ATR(14, 1H) | $1 per point | 0.01 | 0.01 |
| ETHUSD | 1.5 × ATR(14, 1H) | $1 per point | 0.01 | 0.01 |
| XAUUSD | 2.0 × ATR(14, 1H) | $1 per point | 0.01 | 0.01 |

**Note:** Actual point values depend on broker contract specifications. These must be read dynamically from MT5 `SymbolInfoDouble(SYMBOL_TRADE_TICK_VALUE)`.

### 2.2 Stop-Loss Placement Rules

```
SL is ALWAYS placed based on market structure + ATR buffer.
Never based on a fixed dollar/pip amount.

For LONG entries:
  SL = max(
    recent_swing_low - (0.5 × ATR_14_entry_TF),
    entry_price - (2.0 × ATR_14_entry_TF)
  )

For SHORT entries:
  SL = min(
    recent_swing_high + (0.5 × ATR_14_entry_TF),
    entry_price + (2.0 × ATR_14_entry_TF)
  )

HARD CONSTRAINT: SL must exist. If SL cannot be computed → signal is rejected.
HARD CONSTRAINT: SL distance must yield R:R >= 1:2 → otherwise signal is rejected.
```

### 2.3 Risk/Reward Gate

```
TP1 distance must be >= 2.0 × SL distance
If no TP can be identified that meets this → signal is rejected.

R:R calculation:
  reward = abs(TP1 - entry)
  risk = abs(entry - SL)
  rr_ratio = reward / risk

  IF rr_ratio < 2.0 → REJECT
```

---

## 3. Layer 2: Portfolio Risk (Heat Monitor)

"Portfolio heat" = total risk of all open positions combined.

### 3.1 Heat Calculation

```
portfolio_heat = sum(risk_percent for each open_position)

where risk_percent per position:
  = (current_lot_size × SL_distance_points × point_value) / account_equity × 100
```

### 3.2 Heat Limits

| Metric | Base Model Limit | High-Risk Variant |
|---|---|---|
| Max heat per asset | 4.0% | 6.0% |
| Max heat total portfolio | 6.0% | 10.0% |
| Max simultaneous positions | 3 | 4 |
| Max positions per asset | 1 | 2 |

### 3.3 Correlation Guard (BTC/ETH)

BTC and ETH are significantly correlated. Taking full-size positions on both simultaneously is effectively doubling exposure.

```
btc_eth_correlation = rolling_correlation(BTC_returns, ETH_returns, window=30_days)

IF btc_eth_correlation > 0.70:
    combined_heat_limit = max_heat_per_asset × 1.3  (instead of 2×)
    // i.e., if BTC uses 3% heat, ETH can only use 1.0% (total 4.0%, not 6.0%)

IF btc_eth_correlation > 0.85:
    combined_heat_limit = max_heat_per_asset × 1.1
    // Treat BTC+ETH as essentially one position

IF btc_eth_correlation < 0.40:
    combined_heat_limit = max_heat_per_asset × 2.0
    // True diversification — full allocation allowed
```

### 3.4 Gold as a Hedge Consideration

```
gold_crypto_correlation = rolling_correlation(
    XAUUSD_returns,
    0.6 * BTC_returns + 0.4 * ETH_returns,
    window=30_days
)

IF gold_crypto_correlation < -0.2:
    gold_heat_bonus = 1.2  // Gold adds diversification — slight increase allowed
ELSE:
    gold_heat_bonus = 1.0  // No special treatment
```

---

## 4. Layer 3: Drawdown Circuit Breakers

### 4.1 Daily Drawdown Protection

```
daily_high_watermark = max equity reached today (resets at 00:00 UTC)
daily_drawdown = (current_equity - daily_high_watermark) / daily_high_watermark × 100

THRESHOLDS (Base Model):
  daily_drawdown > -3.0%  →  MODE: REDUCED
    - Position sizes × 0.50
    - Minimum signal score: 0.80
    - Alert: Telegram warning

  daily_drawdown > -5.0%  →  MODE: DEFENSIVE
    - Position sizes × 0.25
    - Max 1 open position
    - Alert: Telegram + Email urgent

  daily_drawdown > -7.0%  →  MODE: HALTED
    - Close ALL positions immediately
    - Zero new trades
    - Alert: Telegram + Email + SMS
    - Requires manual reset by operator
    - Cooldown: minimum 4 hours before restart allowed
```

### 4.2 Monthly Drawdown Protection

```
monthly_high_watermark = max equity reached this month (resets 1st of month)
monthly_drawdown = (current_equity - monthly_high_watermark) / monthly_high_watermark × 100

THRESHOLDS (Base Model):
  monthly_drawdown > -8.0%   →  MODE: REDUCED (if not already)
  monthly_drawdown > -12.0%  →  MODE: HALTED
    - Close ALL positions
    - System offline for remainder of month (or manual override)
    - Full performance review triggered
```

### 4.3 Rolling Drawdown (Continuous)

```
rolling_max_equity = max(equity) over trailing 30 days
rolling_drawdown = (current_equity - rolling_max_equity) / rolling_max_equity × 100

IF rolling_drawdown > -15.0%:
    MODE: EMERGENCY
    - Close all positions
    - System offline
    - Operator must review and approve restart
    - Strategy parameters frozen until post-mortem complete
```

### 4.4 Consecutive Loss Protection

```
consecutive_losses = count of consecutive losing trades

IF consecutive_losses >= 3:
    position_size_multiplier *= 0.75
    log("3 consecutive losses — reducing size by 25%")

IF consecutive_losses >= 5:
    position_size_multiplier *= 0.50
    log("5 consecutive losses — reducing size by 50%")
    alert("5 consecutive losses — operator review recommended")

IF consecutive_losses >= 7:
    MODE: HALTED
    log("7 consecutive losses — system halted")
    alert("CRITICAL: 7 consecutive losses — manual intervention required")
```

---

## 5. Layer 4: Regime-Based Adjustment

```
REGIME_MULTIPLIERS = {
    "TRENDING_STRONG":    1.00,  # Full allocation
    "TRENDING_WEAK":      0.70,  # Reduced
    "VOLATILE_EXPANSION": 1.00,  # Full — this is our target
    "VOLATILE_CHAOTIC":   0.50,  # Careful
    "RANGING":            0.00,  # NO TRADE
    "LOW_VOLATILITY":     0.30,  # Minimal
}

# Applied to position size:
adjusted_lot_size = base_lot_size × regime_multiplier
```

---

## 6. Layer 5: Adaptive Sizing (Performance-Based)

### 6.1 Rolling Win Rate Factor

```
recent_win_rate = wins / total_trades  (trailing 20 trades)
historical_win_rate = wins / total_trades  (all time)

IF recent_win_rate > historical_win_rate × 1.15:
    performance_multiplier = min(1.20, 1.0 + (recent_win_rate - historical_win_rate))
    // Doing better than average → slight increase (max +20%)

ELIF recent_win_rate < historical_win_rate × 0.85:
    performance_multiplier = max(0.60, 1.0 - (historical_win_rate - recent_win_rate))
    // Doing worse than average → reduce (max -40%)

ELSE:
    performance_multiplier = 1.0
```

### 6.2 Safety Bounds on Adaptive Sizing

```
ABSOLUTE CONSTRAINTS:
  - performance_multiplier is ALWAYS in range [0.50, 1.30]
  - Final risk_percent is ALWAYS in range [0.5%, 2.6%]
  - Final risk_percent can NEVER exceed 3.0% (hard cap)
  - Increases are gradual: max +5% per day
  - Decreases are immediate: full reduction applied instantly
```

This asymmetry is intentional: cut losses fast, add size slowly.

---

## 7. Final Position Size Computation

```python
def compute_final_position_size(signal, account, risk_engine_state):
    # Base risk
    base_risk_pct = 2.0

    # Layer 3: Drawdown adjustment
    drawdown_factor = get_drawdown_factor(risk_engine_state)
    # Returns 1.0, 0.50, 0.25, or 0.0

    # Layer 4: Regime adjustment
    regime_factor = REGIME_MULTIPLIERS[signal.regime]

    # Layer 5: Performance adjustment
    perf_factor = compute_performance_multiplier(risk_engine_state)

    # Layer 2: Correlation adjustment (BTC/ETH)
    correlation_factor = compute_correlation_discount(signal.asset, risk_engine_state)

    # Compute adjusted risk
    adjusted_risk_pct = base_risk_pct * drawdown_factor * regime_factor * perf_factor * correlation_factor

    # Apply hard caps
    adjusted_risk_pct = max(0.5, min(adjusted_risk_pct, 3.0))

    # If system is HALTED, risk = 0
    if risk_engine_state.mode in ("HALTED", "EMERGENCY"):
        return 0.0

    # Compute lot size from adjusted risk
    risk_dollars = account.equity * (adjusted_risk_pct / 100)
    sl_distance_value = signal.sl_distance_points * signal.point_value
    lot_size = risk_dollars / sl_distance_value

    # Apply portfolio heat check
    if risk_engine_state.current_heat + adjusted_risk_pct > risk_engine_state.max_heat:
        available_heat = risk_engine_state.max_heat - risk_engine_state.current_heat
        if available_heat < 0.5:
            return 0.0  # Not enough room
        lot_size = lot_size * (available_heat / adjusted_risk_pct)
        adjusted_risk_pct = available_heat

    # Round to broker lot step
    lot_size = round_to_lot_step(lot_size, signal.asset)

    # Apply absolute min/max
    lot_size = max(signal.min_lot, min(lot_size, signal.max_lot))

    return lot_size
```

---

## 8. Risk Engine State Object

```python
@dataclass
class RiskEngineState:
    mode: str                          # NORMAL, REDUCED, DEFENSIVE, HALTED, EMERGENCY
    account_equity: float
    daily_high_watermark: float
    monthly_high_watermark: float
    daily_drawdown_pct: float
    monthly_drawdown_pct: float
    rolling_30d_drawdown_pct: float
    current_heat: float                # Total portfolio risk %
    heat_by_asset: dict                # {"BTCUSD": 2.0, "ETHUSD": 1.5, "XAUUSD": 0.0}
    open_positions: list               # List of position objects
    consecutive_losses: int
    recent_win_rate: float             # Trailing 20 trades
    historical_win_rate: float
    performance_multiplier: float
    btc_eth_correlation: float
    gold_crypto_correlation: float
    regime_by_asset: dict              # {"BTCUSD": "TRENDING_STRONG", ...}
    last_trade_time: datetime
    trades_today: int
    max_trades_per_day: int            # Hard limit: 10
    last_updated: datetime
```
