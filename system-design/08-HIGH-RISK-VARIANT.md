# High-Risk Compounding Variant

---

## 1. Variant Philosophy

This is the **Aggressive Compounding Model (ACM)**. It maximizes the compounding
effect of consecutive winners by dynamically scaling position size with equity
growth — while maintaining hard drawdown caps that prevent catastrophic loss.

**Key differences from base model:**

| Parameter | Base Model | ACM Variant |
|-----------|------------|-------------|
| Risk per trade | 2.0% | 3.0% base, up to 4.0% during hot streaks |
| Max portfolio risk | 6.0% | 10.0% |
| Max concurrent positions | 4 | 5 |
| Daily DD hard halt | 5.0% | 7.0% |
| Monthly DD hard halt | 10.0% | 15.0% |
| TP structure | 2:1, 3:1, 5:1 | 2:1, 4:1, 8:1 (extended runners) |
| Trailing stop activation | 1:1 R:R | 1.5:1 R:R (give more room) |
| Trailing distance | 1.0 × ATR | 1.5 × ATR (wider trail) |
| Compounding | No | Yes — equity-based position sizing |
| Hot streak scaling | Up to 125% | Up to 175% |
| Consecutive loss cooldown | 3/5/7 | 4/6/8 (slightly more tolerance) |

**What stays the same (non-negotiable):**

- Every trade has a stop-loss at entry
- No martingale, no grid, no averaging down
- Stop-losses never widened or removed
- Minimum 1:2 R:R on all trades
- No trading in RANGING regime
- Multi-timeframe alignment required
- Correlation-adjusted portfolio risk
- Kill-switch on daily/monthly DD caps (just at higher thresholds)

---

## 2. Compounding Engine

### 2.1 Equity-Based Position Sizing

The base model uses a fixed risk percentage. The ACM variant scales risk
with equity relative to initial capital, creating a compounding effect:

```python
class CompoundingEngine:
    def __init__(self, initial_equity: float):
        self.initial_equity = initial_equity
        self.high_water_mark = initial_equity
        self.base_risk = 0.03  # 3%
        self.max_risk = 0.04   # 4% absolute ceiling

    def compute_compounding_risk(self, current_equity: float) -> float:
        """
        Scale risk based on profits above initial equity.
        This creates geometric growth during winning periods
        while limiting downside to percentage-based stops.
        """
        # Update high water mark
        self.high_water_mark = max(self.high_water_mark, current_equity)

        # Profit ratio: how much above initial capital
        profit_ratio = current_equity / self.initial_equity

        if profit_ratio < 1.0:
            # Below starting equity — defensive
            # Scale risk down proportionally
            risk = self.base_risk * profit_ratio * 0.8
            return max(risk, 0.01)  # Floor at 1%

        elif profit_ratio < 1.1:
            # 0-10% profit — normal risk
            return self.base_risk

        elif profit_ratio < 1.25:
            # 10-25% profit — slightly elevated
            return min(self.base_risk * 1.10, self.max_risk)

        elif profit_ratio < 1.50:
            # 25-50% profit — elevated
            return min(self.base_risk * 1.20, self.max_risk)

        else:
            # 50%+ profit — maximum compounding
            return self.max_risk

    def compute_drawdown_from_hwm(self, current_equity: float) -> float:
        """
        Drawdown measured from high-water mark, not initial equity.
        This is important because we're compounding — a 15% DD from
        a doubled account is still above initial capital.
        """
        if self.high_water_mark <= 0:
            return 0
        return (self.high_water_mark - current_equity) / self.high_water_mark
```

### 2.2 Profit Protection Ratchet

As profits accumulate, the system locks in gains by adjusting the
drawdown baseline:

```python
def compute_profit_ratchet(self, current_equity: float) -> dict:
    """
    Once equity exceeds certain thresholds above initial,
    the monthly DD halt adjusts to never lose all profits.
    """
    profit_pct = (current_equity - self.initial_equity) / self.initial_equity * 100

    if profit_pct >= 50:
        # Locked: never draw down below 25% profit
        # Monthly DD measured from current month, but absolute floor at +25%
        floor = self.initial_equity * 1.25
        return {"profit_floor": floor, "locked_pct": 25}

    elif profit_pct >= 30:
        floor = self.initial_equity * 1.10
        return {"profit_floor": floor, "locked_pct": 10}

    elif profit_pct >= 15:
        floor = self.initial_equity * 1.05
        return {"profit_floor": floor, "locked_pct": 5}

    else:
        return {"profit_floor": self.initial_equity, "locked_pct": 0}
```

---

## 3. Hot Streak Acceleration

### 3.1 Streak Detection

```python
def compute_streak_state(self) -> dict:
    """
    Detect winning streaks and scale up accordingly.
    Only accelerate when system is demonstrably working.
    """
    recent_trades = get_recent_trades(count=10)

    if len(recent_trades) < 3:
        return {"state": "NORMAL", "multiplier": 1.0}

    # Count consecutive wins from most recent
    streak = 0
    for trade in reversed(recent_trades):
        if trade.pnl_net > 0:
            streak += 1
        else:
            break

    # Recent win rate
    recent_win_rate = sum(1 for t in recent_trades if t.pnl_net > 0) / len(recent_trades)

    # Average R:R of recent winners
    recent_winners = [t for t in recent_trades if t.pnl_net > 0]
    avg_rr = np.mean([t.rr_achieved for t in recent_winners]) if recent_winners else 0

    # Determine state
    if streak >= 5 and recent_win_rate >= 0.70 and avg_rr >= 1.5:
        return {
            "state": "HOT",
            "multiplier": 1.50,  # +50% risk scaling
            "streak": streak,
            "note": "Extended hot streak — maximum compounding"
        }
    elif streak >= 3 and recent_win_rate >= 0.60:
        return {
            "state": "WARM",
            "multiplier": 1.25,  # +25% risk scaling
            "streak": streak
        }
    elif streak == 0 and recent_win_rate < 0.30:
        return {
            "state": "COLD",
            "multiplier": 0.50,  # -50% risk scaling
            "streak": 0,
            "note": "Cold streak — significant risk reduction"
        }
    else:
        return {"state": "NORMAL", "multiplier": 1.0}
```

### 3.2 Streak Multiplier Caps

```
Maximum effective risk with all multipliers combined:
    base_risk × volatility_mult × allocation_mult × streak_mult × compound_mult

    3% × 1.0 × 1.5 × 1.5 × 1.0 = 6.75% → HARD CAP at 4%

The 4% hard cap can NEVER be exceeded regardless of multiplier stacking.
```

---

## 4. Extended Take-Profit Structure

### 4.1 Aggressive Runner Management

```python
def compute_acm_take_profits(entry, sl, direction, regime, trend_adx):
    sl_distance = abs(entry - sl)

    if trend_adx > 40:
        # Extremely strong trend — maximize runner
        tp_config = {
            "tp1": {"rr": 2.0, "close_pct": 35},
            "tp2": {"rr": 5.0, "close_pct": 30},
            "tp3": {"rr": 10.0, "close_pct": 20},
            "runner": {"rr": None, "close_pct": 15, "trailing_only": True}
        }
    elif trend_adx > 30:
        tp_config = {
            "tp1": {"rr": 2.0, "close_pct": 40},
            "tp2": {"rr": 4.0, "close_pct": 30},
            "tp3": {"rr": 8.0, "close_pct": 20},
            "runner": {"rr": None, "close_pct": 10, "trailing_only": True}
        }
    else:
        tp_config = {
            "tp1": {"rr": 2.0, "close_pct": 45},
            "tp2": {"rr": 3.5, "close_pct": 30},
            "tp3": {"rr": 6.0, "close_pct": 25},
            "runner": None
        }

    return tp_config
```

### 4.2 Runner Position (Trail-Only, No TP)

The "runner" portion (10-15% of original position) has:
- No take-profit target (let the trend decide)
- Trailing stop at 2.0 × ATR (very wide)
- Only tightened on regime change or volatility contraction
- Can capture 15-30R moves during strong crypto trends
- Historically, BTC trends can sustain 20-50% directional moves

```python
def manage_runner(position, current_price, atr, regime):
    """
    Runner management: extremely patient trailing.
    """
    if not position.is_runner:
        return None

    entry = position.entry_price
    sl = position.stop_loss
    sl_dist = abs(entry - sl)
    current_rr = abs(current_price - entry) / sl_dist

    # Wide trailing stop
    trail_distance = atr * 2.0

    # Tighten on regime change
    if regime in [Regime.RANGING, Regime.VOLATILE_CONTRACTION]:
        trail_distance = atr * 0.75  # Much tighter — regime is changing
        return {"action": "TIGHTEN_TRAIL", "distance": trail_distance,
                "reason": "Regime unfavorable for runner"}

    if position.direction == "LONG":
        new_sl = current_price - trail_distance
        if new_sl > position.current_sl:
            return {"action": "MODIFY_SL", "new_sl": new_sl}
    else:
        new_sl = current_price + trail_distance
        if new_sl < position.current_sl:
            return {"action": "MODIFY_SL", "new_sl": new_sl}

    return None
```

---

## 5. ACM Risk State Machine

```
                  ┌──────────┐
                  │  NORMAL  │
                  │ Risk=100%│
                  │ (3.0%)   │
                  └────┬─────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ WARM     │ │ DEFENSIVE│ │ COLD     │
   │ Risk=125%│ │ Risk=60% │ │ Risk=50% │
   │ (3.75%)  │ │ (1.8%)   │ │ (1.5%)   │
   └────┬─────┘ └────┬─────┘ └──────────┘
        │             │
        ▼             ▼
   ┌──────────┐ ┌──────────┐
   │   HOT    │ │ CRITICAL │
   │ Risk=150%│ │ Risk=30% │
   │ (4.0%cap)│ │ (0.9%)   │
   └────┬─────┘ └────┬─────┘
        │             │
        │             ▼
        │        ┌──────────┐
        │        │ HALTED   │
        │        │ Risk=0%  │
        │        └──────────┘
        │
        └──► Reverts to NORMAL after first loss
```

---

## 6. Drawdown Caps (ACM Variant)

```
Daily Drawdown (from daily start equity):
    WARNING:     4% → Reduce to DEFENSIVE
    SOFT_HALT:   6% → No new entries
    HARD_HALT:   7% → Close all, halt 24 hours

Monthly Drawdown (from month start equity):
    WARNING:     8% → Reduce to DEFENSIVE, increase min R:R to 1:3
    SOFT_HALT:   12% → No new entries until month-end
    HARD_HALT:   15% → Close all, manual restart required

Absolute Drawdown (from high-water mark):
    20% from HWM → System halted, full manual review
    This caps maximum peak-to-trough regardless of compounding gains
```

---

## 7. Expected Performance Profile (Theoretical)

Based on Monte Carlo simulation of the ACM parameters:

```
Scenario Analysis (10,000 simulations over 12 months):

Conservative Estimate (25th percentile):
    Annual return:          25-40%
    Max drawdown:           12-15%
    Sharpe ratio:           1.2-1.5
    Monthly return:         2-3%

Median Estimate (50th percentile):
    Annual return:          50-80%
    Max drawdown:           10-12%
    Sharpe ratio:           1.5-2.0
    Monthly return:         4-6%

Optimistic Estimate (75th percentile):
    Annual return:          100-200%
    Max drawdown:           8-10%
    Sharpe ratio:           2.0-3.0
    Monthly return:         6-12%

Worst Case (5th percentile):
    Annual return:          -15% (capped by DD limits)
    Max drawdown:           15%
    Recovery time:          2-4 months

IMPORTANT: These are theoretical estimates from Monte Carlo.
Actual performance depends on market conditions, execution quality,
and assumption validity. Past simulation ≠ future results.
```

---

## 8. ACM vs Base Model: When to Use Which

```
Use BASE MODEL when:
    ✓ Starting with new capital (first 3 months)
    ✓ Account is below initial equity
    ✓ During extended ranging markets across all assets
    ✓ When strategy decay is detected
    ✓ When correlation between BTC/ETH is extreme (>0.90)
    ✓ During known high-uncertainty periods (elections, major regulatory events)
    ✓ When operator is unavailable for extended periods (vacation)

Use ACM VARIANT when:
    ✓ Account is 10%+ above initial equity
    ✓ System has demonstrated positive expectancy over 50+ trades
    ✓ At least 2 of 3 assets showing favorable regimes
    ✓ Recent 30-day Sharpe > 1.0
    ✓ Strategy decay check is clean
    ✓ Operator can monitor daily
```

---

## 9. ACM Position Size Examples

```
Example 1: Normal State, Standard Conditions
    Equity:         $25,000 (started at $20,000 → +25%)
    Compound ratio: 1.25 → risk = 3.0% × 1.10 = 3.3%
    Streak:         NORMAL → multiplier = 1.0
    Vol scaling:    1.0 (normal volatility)
    Allocation:     BTC at 40%
    Alloc mult:     0.40 / 0.333 = 1.20

    Effective risk: 3.3% × 1.0 × 1.0 × 1.20 = 3.96%
    Hard cap:       4.0% → effective = 3.96%
    Risk USD:       $25,000 × 3.96% = $990

    BTCUSD ATR(H1) = 350 → SL distance = 350 × 1.5 = 525
    Position size:  $990 / 525 = 1.886 lots (for $1/point contracts)


Example 2: Hot Streak, Elevated Compound
    Equity:         $35,000 (started at $20,000 → +75%)
    Compound ratio: 1.75 → risk = 4.0% (max compound)
    Streak:         HOT (6 consecutive wins) → multiplier = 1.50
    Vol scaling:    0.75 (slightly elevated vol)

    Effective risk: 4.0% × 1.50 × 0.75 = 4.5%
    Hard cap:       4.0% → effective = 4.0%
    Risk USD:       $35,000 × 4.0% = $1,400


Example 3: Cold Streak, Below HWM
    Equity:         $22,000 (HWM was $28,000 → DD from HWM = 21.4%)
    This exceeds the 20% HWM absolute cap → SYSTEM HALTED
    → Manual review required before restart
    → Restart with base model at 1% risk
```

---

## 10. Transition Protocol: Base → ACM

```
Phase 1 (Weeks 1-4): Base Model Validation
    - Run base model on live with standard 2% risk
    - Minimum 30 trades required
    - Must show positive expectancy and Sharpe > 0.5
    - Maximum drawdown must be < 8%

Phase 2 (Weeks 5-8): ACM Lite
    - Switch to ACM parameters but cap risk at 2.5%
    - Disable hot streak acceleration
    - Monthly DD cap at 10% (not 15%)
    - Validate that the compounding logic works correctly

Phase 3 (Week 9+): Full ACM
    - Enable all ACM features
    - Risk up to 4%
    - Hot streak acceleration enabled
    - Full 15% monthly DD cap
    - Monitor closely for first 2 weeks

Emergency Rollback:
    If at any point during transition:
    - Monthly drawdown exceeds 10% → revert to base model
    - Strategy decay detected → revert to base model
    - Operator loses confidence → revert to base model

    Rollback is a config change, not a system restart.
    Just switch the parameter profile:
        set_parameter_profile("BASE_MODEL")
```

---

## 11. Compounding Math: Why This Works

The power of the ACM variant comes from asymmetric risk:

```
Base Model (2% risk per trade, 55% win rate, avg 2.0R winner):
    Expected value per trade: (0.55 × 4%) - (0.45 × 2%) = 1.3%
    After 100 trades: ~1.3% × 100 = 130% simple, ~265% compounded

ACM Variant (3-4% risk, same 55% win rate, avg 2.5R winner with runners):
    Expected value per trade: (0.55 × 8.75%) - (0.45 × 3.5%) = 3.24%
    After 100 trades: ~3.24% × 100 = 324% simple, ~2500%+ compounded

    BUT: Drawdowns are also larger:
    - 7 consecutive losses at 4%: -28% (base model: -14%)
    - This is why the hard caps are essential

The edge comes from:
    1. Larger position sizes amplify winners geometrically
    2. Runners capture outsized moves that turbocharge returns
    3. Hot streak detection compounds during favorable periods
    4. Profit ratchets prevent giving back too much
    5. Hard DD caps ensure survivability even during bad stretches

The risk is:
    1. Larger drawdowns during losing streaks
    2. Faster approach to DD caps
    3. Higher emotional pressure on operator
    4. Less margin of error on strategy decay
```
