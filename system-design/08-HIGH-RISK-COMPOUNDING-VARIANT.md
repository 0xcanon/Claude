# High-Risk Compounding Variant

## 1. Philosophy

The high-risk variant maximizes **compounding velocity** while maintaining defined drawdown caps. It accepts higher volatility of returns in exchange for faster account growth.

This is NOT a reckless variant. It is a **mathematically bounded aggressive model** that uses:

- Higher base risk per trade
- Kelly-fraction inspired sizing
- Compounding reinvestment of profits
- More aggressive trailing and scaling
- Tighter regime requirements (only trade the BEST setups)
- Defined drawdown caps that are wider but still enforced

**Target:** 15-30% monthly return with max 18% monthly drawdown cap.

---

## 2. Parameter Comparison

| Parameter | Base Model | High-Risk Variant | Rationale |
|---|---|---|---|
| Base risk per trade | 2.0% | 3.5% | Higher per-trade risk |
| Max risk per trade (hard cap) | 3.0% | 5.0% | Allows more flexibility |
| Max portfolio heat | 6.0% | 10.0% | More simultaneous exposure |
| Max heat per asset | 4.0% | 6.0% | More per-asset |
| Max positions total | 3 | 4 | One more concurrent |
| Max positions per asset | 1 | 2 | Can pyramid on strong trends |
| Min signal score | 0.65 | 0.75 | HIGHER quality threshold |
| Min R:R ratio | 2.0 | 2.0 | Same (don't compromise edge) |
| Daily DD → REDUCED | -3.0% | -5.0% | Wider tolerance |
| Daily DD → DEFENSIVE | -5.0% | -8.0% | Wider tolerance |
| Daily DD → HALTED | -7.0% | -10.0% | Hard cap |
| Monthly DD → REDUCED | -8.0% | -12.0% | Wider tolerance |
| Monthly DD → HALTED | -12.0% | -18.0% | Hard cap |
| Rolling 30d DD → HALTED | -15.0% | -22.0% | Hard cap |
| Consecutive loss → REDUCED | 3 | 4 | Slightly more tolerance |
| Consecutive loss → HALTED | 7 | 8 | Slightly more tolerance |
| Performance multiplier range | [0.50, 1.30] | [0.40, 1.60] | Wider adaptive range |
| Compounding | Not applied | Equity-based recalculation | Key differentiator |

---

## 3. Kelly-Fraction Inspired Sizing

### 3.1 Theory

The Kelly Criterion gives the optimal bet fraction for maximum long-term growth:

```
Kelly % = W - [(1 - W) / R]

Where:
  W = Win rate (probability of winning)
  R = Win/Loss ratio (average win / average loss)
```

### 3.2 Why Full Kelly Is Dangerous

Full Kelly sizing is mathematically optimal for INFINITE time horizons with KNOWN probabilities. In reality:
- We DON'T know exact probabilities (estimation error)
- We have a FINITE time horizon (drawdowns matter psychologically)
- Probability of ruin with full Kelly is high with estimation error

### 3.3 Fractional Kelly Implementation

```python
class KellyFractionSizer:
    """
    Uses half-Kelly (0.5x) as the aggressive target.
    Further constrained by hard caps and adaptive adjustments.
    """

    KELLY_FRACTION = 0.50  # Half-Kelly — aggressive but survivable

    def compute_kelly_size(self, win_rate: float, avg_win_loss_ratio: float,
                           account_equity: float, sl_distance: float,
                           point_value: float) -> float:
        """
        Compute position size using fractional Kelly Criterion.
        """
        # Kelly optimal fraction
        kelly_pct = win_rate - ((1 - win_rate) / avg_win_loss_ratio)

        if kelly_pct <= 0:
            # Negative Kelly = negative edge = don't trade
            return 0.0

        # Apply fraction
        adjusted_kelly = kelly_pct * self.KELLY_FRACTION

        # Convert to risk percentage
        risk_pct = adjusted_kelly * 100  # e.g., 0.07 → 7%

        # Hard cap at 5.0%
        risk_pct = min(risk_pct, 5.0)

        # Floor at 1.0% (minimum for the aggressive model)
        risk_pct = max(risk_pct, 1.0)

        # Compute lot size
        risk_dollars = account_equity * (risk_pct / 100)
        lot_size = risk_dollars / (sl_distance * point_value)

        return lot_size, risk_pct

    def compute_with_confidence(self, win_rate: float, win_loss_ratio: float,
                                 sample_size: int) -> float:
        """
        Adjust Kelly fraction based on confidence in the statistics.
        Fewer trades → less confidence → lower fraction.
        """
        base_kelly = win_rate - ((1 - win_rate) / win_loss_ratio)

        if base_kelly <= 0:
            return 0.0

        # Confidence factor based on sample size
        # 10 trades: 0.3x, 20: 0.5x, 50: 0.7x, 100+: 0.9x
        if sample_size < 10:
            confidence = 0.3
        elif sample_size < 20:
            confidence = 0.3 + (sample_size - 10) * 0.02  # Linear 0.3 → 0.5
        elif sample_size < 50:
            confidence = 0.5 + (sample_size - 20) * 0.0067  # Linear 0.5 → 0.7
        elif sample_size < 100:
            confidence = 0.7 + (sample_size - 50) * 0.004  # Linear 0.7 → 0.9
        else:
            confidence = 0.9

        return base_kelly * self.KELLY_FRACTION * confidence
```

### 3.4 Example Kelly Calculations

```
Example 1: Strong edge
  Win rate: 55%, Avg Win/Loss: 2.5
  Kelly = 0.55 - (0.45 / 2.5) = 0.55 - 0.18 = 0.37 (37%)
  Half Kelly = 18.5%
  Capped at 5.0% → Risk = 5.0% per trade

Example 2: Moderate edge
  Win rate: 48%, Avg Win/Loss: 2.2
  Kelly = 0.48 - (0.52 / 2.2) = 0.48 - 0.236 = 0.244 (24.4%)
  Half Kelly = 12.2%
  Capped at 5.0% → Risk = 5.0% per trade

Example 3: Weak edge
  Win rate: 42%, Avg Win/Loss: 2.0
  Kelly = 0.42 - (0.58 / 2.0) = 0.42 - 0.29 = 0.13 (13%)
  Half Kelly = 6.5%
  Capped at 5.0% → Risk = 5.0% per trade

Example 4: Marginal edge
  Win rate: 40%, Avg Win/Loss: 1.8
  Kelly = 0.40 - (0.60 / 1.8) = 0.40 - 0.333 = 0.067 (6.7%)
  Half Kelly = 3.35%
  → Risk = 3.35% per trade (below cap, use as-is)

Example 5: No edge
  Win rate: 38%, Avg Win/Loss: 1.5
  Kelly = 0.38 - (0.62 / 1.5) = 0.38 - 0.413 = -0.033
  → Kelly is NEGATIVE → DO NOT TRADE
```

---

## 4. Compounding Mechanism

### 4.1 Equity-Based Position Sizing

The key compounding mechanism: position sizes grow as equity grows because risk is calculated as a **percentage of current equity**, not initial balance.

```python
class CompoundingEngine:
    """
    Manages equity-based position sizing with compounding.
    """

    def __init__(self):
        self.initial_equity = None
        self.equity_milestones = []  # Track growth milestones

    def compute_compound_risk(self, current_equity: float, base_risk_pct: float) -> float:
        """
        Compute risk percentage with compounding adjustments.
        """
        if self.initial_equity is None:
            self.initial_equity = current_equity

        growth_ratio = current_equity / self.initial_equity

        # Compound normally up to 2x initial equity
        if growth_ratio <= 2.0:
            return base_risk_pct  # Use full equity for sizing

        # Between 2x-3x: slight reduction to protect gains
        elif growth_ratio <= 3.0:
            protected_equity = self.initial_equity * 2.0
            excess = current_equity - protected_equity
            # Risk the protected portion at full rate
            # Risk the excess at 75% rate
            effective_equity = protected_equity + excess * 0.75
            adjusted_risk = base_risk_pct * (effective_equity / current_equity)
            return adjusted_risk

        # Above 3x: protect more aggressively
        else:
            protected_equity = self.initial_equity * 2.5
            excess = current_equity - protected_equity
            effective_equity = protected_equity + excess * 0.50
            adjusted_risk = base_risk_pct * (effective_equity / current_equity)
            return max(adjusted_risk, base_risk_pct * 0.60)  # Floor at 60% of base

    def should_lock_profits(self, current_equity: float) -> dict:
        """
        Determine if profit-locking rules should activate.
        """
        if self.initial_equity is None:
            return {"lock": False}

        growth = (current_equity - self.initial_equity) / self.initial_equity * 100

        if growth >= 100:  # Doubled
            return {
                "lock": True,
                "action": "REDUCE_RISK_20PCT",
                "message": "Equity doubled — reducing risk by 20% to protect gains",
                "new_risk_multiplier": 0.80
            }
        elif growth >= 200:  # Tripled
            return {
                "lock": True,
                "action": "REDUCE_RISK_30PCT",
                "message": "Equity tripled — reducing risk by 30%",
                "new_risk_multiplier": 0.70
            }

        return {"lock": False}
```

### 4.2 Compounding Growth Projections

```
Assumptions: 48% win rate, 2.2 avg R:R, 3.5% risk/trade, ~60 trades/month

Conservative estimate (after costs, slippage):
  Monthly net expectancy per trade = (0.48 × 2.2 - 0.52 × 1.0) × 3.5% = 1.87%
  With ~60 trades: compound growth ≈ 15-25% per month

Note: These are theoretical. Real-world performance will be lower due to:
  - Regime-based filtering (not all trades taken)
  - Drawdown reductions (size cuts during DD)
  - Correlation discounts
  - Execution costs

Realistic target: 12-20% per month with high variance.

Growth trajectory ($5,000 start, 15% monthly):
  Month 1:  $5,750
  Month 3:  $7,604
  Month 6:  $11,565
  Month 12: $26,738
  Month 18: $61,778
  Month 24: $142,828

Growth trajectory ($5,000 start, 20% monthly):
  Month 1:  $6,000
  Month 3:  $8,640
  Month 6:  $14,930
  Month 12: $44,580
  Month 18: $133,107
  Month 24: $397,515

CRITICAL REALITY CHECK:
  - These assume NO months with significant drawdown
  - In practice, expect 2-3 months per year with negative returns
  - Actual annual return will be lower than monthly × 12
  - The drawdown caps (18% monthly) will activate during bad months
  - After a bad month, it takes time to recover
```

---

## 5. Aggressive Scaling Logic

### 5.1 Pyramid Into Winners

```python
class PyramidManager:
    """
    Adds to winning positions in strong trends.
    Only for the high-risk variant.
    """

    MAX_PYRAMIDS = 1  # Maximum 1 add-on per position
    PYRAMID_TRIGGER = 1.0  # Add when position is +1R
    PYRAMID_SIZE = 0.50  # 50% of original position size

    def evaluate_pyramid(self, position, current_price, regime) -> Optional[dict]:
        """
        Determine if a position should be pyramided.
        """
        # Only in strong trending regimes
        if regime not in ("TRENDING_STRONG", "VOLATILE_EXPANSION"):
            return None

        # Calculate current R-multiple
        entry = position.entry_price
        sl = position.stop_loss
        risk_distance = abs(entry - sl)

        if position.direction == "LONG":
            current_r = (current_price - entry) / risk_distance
        else:
            current_r = (entry - current_price) / risk_distance

        # Check if pyramid trigger reached
        if current_r < self.PYRAMID_TRIGGER:
            return None

        # Check if already pyramided
        if position.pyramid_count >= self.MAX_PYRAMIDS:
            return None

        # Calculate pyramid entry
        pyramid_lot = position.lot_size * self.PYRAMID_SIZE
        new_sl = entry  # Move SL of ENTIRE position to breakeven

        return {
            "action": "PYRAMID",
            "lot_size": pyramid_lot,
            "new_sl_for_all": new_sl,  # Breakeven on original
            "current_r": current_r,
            "note": "Pyramid at +1R, SL moved to breakeven"
        }
```

### 5.2 Aggressive Trailing

```python
class AggressiveTrailManager:
    """
    More aggressive trailing stop management for the high-risk variant.
    Locks in profits faster while still allowing room to run.
    """

    def compute_trail(self, position, current_price, atr) -> Optional[float]:
        entry = position.entry_price
        sl = position.stop_loss
        risk_distance = abs(entry - sl)

        if position.direction == "LONG":
            current_r = (current_price - entry) / risk_distance
        else:
            current_r = (entry - current_price) / risk_distance

        # Trail logic by R-multiple achieved
        if current_r >= 3.0:
            # At +3R: trail at +2.0R behind
            trail_distance = 1.0 * risk_distance
        elif current_r >= 2.0:
            # At +2R: trail at +1.2R behind
            trail_distance = 0.8 * risk_distance
        elif current_r >= 1.5:
            # At +1.5R: trail at +0.8R behind
            trail_distance = 0.7 * risk_distance
        elif current_r >= 1.0:
            # At +1R: move to breakeven + 0.2R
            trail_distance = current_r * risk_distance - 0.2 * risk_distance
        else:
            return None  # No trail yet

        if position.direction == "LONG":
            new_sl = current_price - trail_distance
            if new_sl > position.stop_loss:
                return new_sl
        else:
            new_sl = current_price + trail_distance
            if new_sl < position.stop_loss:
                return new_sl

        return None
```

---

## 6. High-Risk Variant Kill-Switch Thresholds

```python
class HighRiskKillSwitch:
    """
    Kill-switch thresholds for the high-risk variant.
    Wider tolerances but still enforced.
    """

    # Drawdown thresholds
    DAILY_DD_REDUCED    = -5.0   # (Base: -3.0%)
    DAILY_DD_DEFENSIVE  = -8.0   # (Base: -5.0%)
    DAILY_DD_HALTED     = -10.0  # (Base: -7.0%) — HARD CAP

    MONTHLY_DD_REDUCED  = -12.0  # (Base: -8.0%)
    MONTHLY_DD_HALTED   = -18.0  # (Base: -12.0%) — HARD CAP

    ROLLING_DD_HALTED   = -22.0  # (Base: -15.0%) — HARD CAP

    # Consecutive loss thresholds
    CONSEC_LOSS_REDUCED   = 4    # (Base: 3)
    CONSEC_LOSS_DEFENSIVE = 6    # (Base: 5)
    CONSEC_LOSS_HALTED    = 8    # (Base: 7)

    # Recovery protocol (stricter due to higher risk)
    COOLDOWN_AFTER_DAILY_HALT = 6     # hours (Base: 4)
    COOLDOWN_AFTER_MONTHLY_HALT = 48  # hours
    REDUCED_MODE_AFTER_RESTART = 4    # hours (Base: 2)
    REDUCED_SIZE_FIRST_TRADES = 10    # trades (Base: 5)
```

---

## 7. Risk of Ruin Analysis

### 7.1 Base Model

```
Parameters: 2% risk, 48% win rate, 2.0 avg R:R
Ruin = equity drops to 50% of starting value

Using simplified risk-of-ruin formula:
  Edge = (0.48 × 2.0 - 0.52) / 2.0 = 0.22
  Prob(ruin) ≈ ((1 - edge) / (1 + edge))^(initial_capital / risk_unit)
  ≈ (0.78 / 1.22)^50 ≈ 0.64^50 ≈ 0.00002 (0.002%)

Risk of ruin: effectively zero with the base model.
```

### 7.2 High-Risk Variant

```
Parameters: 3.5% risk, 48% win rate, 2.0 avg R:R, higher signal threshold
Ruin = equity drops to 50% of starting value

  Edge = 0.22 (same as base — same strategy, different sizing)
  Prob(ruin) ≈ (0.78 / 1.22)^(50/1.75) ≈ 0.64^28.6 ≈ 0.0003 (0.03%)

Still very low, but 15x higher than base model.

With the Kelly-fraction approach (variable sizing):
  Risk of ruin is higher because:
  - Larger positions during winning streaks → more to lose on reversal
  - The 18% monthly DD cap mitigates this but doesn't eliminate it

Practical assessment:
  - Chance of hitting monthly DD cap in any given month: ~15-20%
  - Chance of hitting two consecutive monthly DD caps: ~3-4%
  - Chance of account dropping 40% from peak: ~2-5% annually
  - Chance of account dropping 50% from peak: <1% annually

RECOMMENDATION:
  Only use the high-risk variant with capital you can afford to lose.
  Never use the high-risk variant with more than 30% of total trading capital.
  Keep 70% in the base model for stability.
```

---

## 8. Variant Selection Logic

```python
class VariantSelector:
    """
    Automatically selects between base and high-risk variant
    based on account state and market conditions.
    """

    def select_variant(self, account_state, market_state) -> str:
        """
        Returns 'BASE' or 'HIGH_RISK'.
        The operator can override this.
        """

        # Never use high-risk if in drawdown
        if account_state.monthly_drawdown_pct < -5.0:
            return "BASE"

        # Never use high-risk if consecutive losses >= 2
        if account_state.consecutive_losses >= 2:
            return "BASE"

        # Use high-risk only during optimal conditions
        favorable_regimes = sum(
            1 for asset in Config.ASSETS
            if market_state.regime[asset] in ("TRENDING_STRONG", "VOLATILE_EXPANSION")
        )

        if favorable_regimes >= 2:
            # At least 2 assets in favorable regimes
            return "HIGH_RISK"

        return "BASE"
```

---

## 9. Split Account Strategy

For operators with sufficient capital, the recommended approach:

```
TOTAL CAPITAL: $10,000

Account A (Conservative):  $7,000 (70%)
  - Base model parameters
  - Target: 5-15% monthly
  - Max DD: 12% monthly
  - Purpose: Stable growth and capital preservation

Account B (Aggressive):    $3,000 (30%)
  - High-risk variant
  - Target: 15-30% monthly
  - Max DD: 18% monthly
  - Purpose: Accelerated growth with defined risk

PROFIT REBALANCING (monthly):
  - If Account B grows to >35% of total → withdraw excess to Account A
  - If Account B drops to <20% of total → consider topping up from Account A
  - Never allocate more than 30% to Account B at any rebalance point

This structure ensures:
  - Total portfolio max drawdown ≈ 0.7 × 12% + 0.3 × 18% = 13.8%
  - If Account B is wiped out (worst case): total loss is 30%
  - Account A continues generating returns regardless
```
