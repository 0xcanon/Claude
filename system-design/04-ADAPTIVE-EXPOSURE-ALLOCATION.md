# Adaptive Exposure Allocation

## 1. Philosophy

The system does NOT treat all three assets equally at all times. Asset allocation weights shift based on:

1. **Rolling performance** — assets that are performing well get more allocation
2. **Regime suitability** — assets in trending regimes get more allocation
3. **Volatility conditions** — assets with favorable volatility get more allocation
4. **Correlation dynamics** — correlated assets share allocation budget
5. **Win rate by asset** — poor-performing assets get less until they recover

---

## 2. Base Allocation

```python
BASE_ALLOCATION = {
    "BTCUSD": 0.40,   # 40% of risk budget
    "ETHUSD": 0.30,   # 30% of risk budget
    "XAUUSD": 0.30,   # 30% of risk budget
}

# These sum to 1.0. The total risk budget is the max portfolio heat (6%).
# So BTCUSD can use up to 0.40 × 6% = 2.4% of equity in risk.
```

---

## 3. Performance-Based Reallocation

Rebalancing happens **daily at 00:00 UTC**.

### 3.1 Rolling Performance Score

```python
def compute_asset_performance_score(asset: str, lookback_trades: int = 20) -> float:
    """
    Compute a performance score for an asset based on recent trades.
    Score range: 0.0 (terrible) to 2.0 (exceptional)
    """
    trades = get_recent_trades(asset, lookback_trades)
    if len(trades) < 5:
        return 1.0  # Not enough data — use neutral weight

    win_rate = sum(1 for t in trades if t.pnl > 0) / len(trades)
    avg_rr_achieved = mean([t.actual_rr for t in trades if t.pnl > 0]) if win_rate > 0 else 0
    profit_factor = sum(t.pnl for t in trades if t.pnl > 0) / max(1, abs(sum(t.pnl for t in trades if t.pnl < 0)))

    # Composite score
    score = (
        (win_rate / 0.50) * 0.30 +           # Normalized to 50% baseline
        (avg_rr_achieved / 2.0) * 0.30 +      # Normalized to 2:1 baseline
        (min(profit_factor, 3.0) / 1.5) * 0.40  # Normalized to 1.5 baseline
    )

    return max(0.3, min(2.0, score))  # Clamp to [0.3, 2.0]
```

### 3.2 Regime Suitability Score

```python
def compute_regime_suitability(asset: str) -> float:
    """
    How suitable is the current regime for our strategy?
    """
    regime = classify_regime(asset)

    SUITABILITY = {
        "TRENDING_STRONG":    1.5,
        "VOLATILE_EXPANSION": 1.4,
        "TRENDING_WEAK":      0.8,
        "VOLATILE_CHAOTIC":   0.5,
        "RANGING":            0.1,
        "LOW_VOLATILITY":     0.2,
    }

    return SUITABILITY.get(regime["regime"], 0.5)
```

### 3.3 Combined Weight Calculation

```python
def compute_dynamic_allocation() -> dict:
    """
    Compute dynamic allocation weights for each asset.
    Called daily at 00:00 UTC.
    """
    raw_weights = {}

    for asset in ["BTCUSD", "ETHUSD", "XAUUSD"]:
        base = BASE_ALLOCATION[asset]
        perf = compute_asset_performance_score(asset)
        regime = compute_regime_suitability(asset)

        # Weighted combination
        raw_weights[asset] = base * perf * regime

    # Normalize to sum = 1.0
    total = sum(raw_weights.values())
    normalized = {k: v / total for k, v in raw_weights.items()}

    # Apply bounds: no asset below 10% or above 60%
    bounded = apply_allocation_bounds(normalized, min_weight=0.10, max_weight=0.60)

    # Apply correlation penalty (BTC/ETH)
    final = apply_correlation_adjustment(bounded)

    return final

def apply_allocation_bounds(weights: dict, min_weight: float, max_weight: float) -> dict:
    """
    Ensure no asset exceeds bounds. Redistribute excess proportionally.
    """
    adjusted = {}
    excess = 0.0
    deficit_assets = []

    for asset, weight in weights.items():
        if weight > max_weight:
            excess += weight - max_weight
            adjusted[asset] = max_weight
        elif weight < min_weight:
            excess -= (min_weight - weight)
            adjusted[asset] = min_weight
        else:
            adjusted[asset] = weight
            deficit_assets.append(asset)

    # Redistribute excess proportionally among non-capped assets
    if deficit_assets and excess > 0:
        per_asset = excess / len(deficit_assets)
        for asset in deficit_assets:
            adjusted[asset] = min(max_weight, adjusted[asset] + per_asset)

    # Re-normalize
    total = sum(adjusted.values())
    return {k: v / total for k, v in adjusted.items()}

def apply_correlation_adjustment(weights: dict) -> dict:
    """
    If BTC and ETH are highly correlated, reduce combined allocation.
    """
    btc_eth_corr = compute_btc_eth_correlation()

    if btc_eth_corr > 0.80:
        # Highly correlated — combined weight should not exceed 55%
        combined = weights["BTCUSD"] + weights["ETHUSD"]
        if combined > 0.55:
            reduction_factor = 0.55 / combined
            weights["BTCUSD"] *= reduction_factor
            weights["ETHUSD"] *= reduction_factor
            # Give excess to gold
            excess = 1.0 - sum(weights.values())
            weights["XAUUSD"] += excess

    elif btc_eth_corr > 0.70:
        combined = weights["BTCUSD"] + weights["ETHUSD"]
        if combined > 0.65:
            reduction_factor = 0.65 / combined
            weights["BTCUSD"] *= reduction_factor
            weights["ETHUSD"] *= reduction_factor
            excess = 1.0 - sum(weights.values())
            weights["XAUUSD"] += excess

    return weights
```

---

## 4. Allocation Change Constraints

To prevent thrashing:

```
REALLOCATION RULES:
1. Rebalance only once per day (00:00 UTC)
2. Maximum change per asset per day: ±10%
   (e.g., if BTCUSD is at 40%, it can move to 30-50% but not 20% or 70%)
3. Changes require minimum 5 new trades since last rebalance
4. Emergency reallocation triggered only by:
   - Regime shift to RANGING for an asset (→ reduce to minimum)
   - Kill switch activation (→ all to zero)
```

```python
def apply_change_limits(current_weights: dict, target_weights: dict) -> dict:
    """
    Limit the magnitude of daily allocation changes.
    """
    MAX_DAILY_CHANGE = 0.10  # 10%

    result = {}
    for asset in current_weights:
        current = current_weights[asset]
        target = target_weights[asset]
        change = target - current

        if abs(change) > MAX_DAILY_CHANGE:
            change = MAX_DAILY_CHANGE if change > 0 else -MAX_DAILY_CHANGE

        result[asset] = current + change

    # Normalize
    total = sum(result.values())
    return {k: v / total for k, v in result.items()}
```

---

## 5. Self-Improvement Logic

### 5.1 What CAN Be Adjusted Automatically

| Parameter | Adjustment Range | Frequency | Condition |
|---|---|---|---|
| Asset allocation weights | 10% - 60% per asset | Daily | Min 5 trades since last change |
| Signal score threshold | 0.60 - 0.85 | Weekly | Based on win rate trend |
| ATR multiplier for SL | 1.2x - 2.5x | Weekly | Based on stop-hit rate |
| Regime detector sensitivity | ±15% on thresholds | Monthly | Based on regime classification accuracy |
| Partial close ratios | 40%-60% at TP1 | Monthly | Based on average hold profit analysis |

### 5.2 What CANNOT Be Adjusted Automatically

| Parameter | Why It's Locked |
|---|---|
| Max risk per trade (2%) | Fundamental risk boundary |
| Max portfolio heat (6%) | Ruin prevention |
| Drawdown thresholds | Safety critical |
| Minimum R:R (1:2) | Edge preservation |
| Prohibited strategies | Architecture decision |
| Kill switch triggers | Safety critical |
| Max positions | Capital preservation |

### 5.3 Self-Improvement Workflow

```python
def daily_self_improvement():
    """
    Called at 00:05 UTC daily. Analyzes performance and makes bounded adjustments.
    """
    # 1. Compute rolling metrics
    metrics = compute_rolling_metrics(lookback_days=30)

    # 2. Asset reallocation
    new_weights = compute_dynamic_allocation()
    new_weights = apply_change_limits(current_weights, new_weights)
    save_allocation_weights(new_weights)

    # 3. Signal threshold adjustment (weekly)
    if is_weekly_rebalance_day():
        win_rate_20 = metrics["win_rate_trailing_20"]
        if win_rate_20 < 0.40:
            # Winning less — raise quality threshold
            adjust_signal_threshold(delta=+0.02, max=0.85)
        elif win_rate_20 > 0.55:
            # Winning more — can slightly lower threshold
            adjust_signal_threshold(delta=-0.01, min=0.60)

    # 4. SL distance tuning (weekly)
    if is_weekly_rebalance_day():
        stop_hit_rate = metrics["stop_hit_rate"]
        if stop_hit_rate > 0.60:
            # Too many stops hit — widen SL slightly
            adjust_atr_multiplier(delta=+0.1, max=2.5)
        elif stop_hit_rate < 0.30:
            # SL rarely hit — can tighten
            adjust_atr_multiplier(delta=-0.05, min=1.2)

    # 5. Log all changes
    log_self_improvement_action(new_weights, metrics)

    # 6. NEVER allow cumulative drift beyond bounds
    enforce_hard_bounds()
```

### 5.4 Anti-Recklessness Guards

```python
def enforce_hard_bounds():
    """
    Regardless of adaptive adjustments, these bounds are NEVER exceeded.
    This function runs after every self-improvement cycle.
    """
    config = load_current_config()

    # Hard bounds
    assert config.max_risk_per_trade <= 3.0, "Risk per trade exceeded hard cap"
    assert config.max_portfolio_heat <= 8.0, "Portfolio heat exceeded hard cap"
    assert config.min_rr_ratio >= 1.5, "R:R dropped below absolute minimum"
    assert config.signal_threshold >= 0.55, "Signal threshold too low"
    assert config.signal_threshold <= 0.90, "Signal threshold too high (no trades)"
    assert all(0.08 <= w <= 0.65 for w in config.allocation_weights.values()), "Allocation out of bounds"

    # Rate-of-change bounds
    changes_this_week = get_config_changes(days=7)
    total_change_magnitude = sum(abs(c.delta) for c in changes_this_week)
    assert total_change_magnitude < 0.50, "Too many parameter changes this week"
```
