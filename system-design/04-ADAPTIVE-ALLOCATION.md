# Adaptive Allocation Logic

---

## 1. Philosophy

The allocation engine dynamically distributes risk budget across BTC, ETH, and XAU
based on each asset's recent performance, current regime favorability, and
cross-asset correlations. It rewards consistent performers and penalizes assets
experiencing drawdowns or unfavorable regimes — without ever increasing total
portfolio risk.

**Key principle:** Adaptive allocation shifts *where* risk is deployed, not *how
much* total risk is taken. Total risk remains governed by the Risk Engine.

---

## 2. Allocation Budget

```
Total allocation budget = 100% (abstract units)

Each asset receives a weight between 10% and 60%.
Weights must sum to 100%.

Minimum floor = 10% (never fully exclude an asset — regime can change fast)
Maximum ceiling = 60% (never over-concentrate)

Default (equal) allocation:
    BTCUSD: 34%
    ETHUSD: 33%
    XAUUSD: 33%
```

When computing position size, the per-trade risk is scaled by the asset's allocation weight:

```
effective_risk = base_risk × (asset_allocation_weight / reference_weight)

where reference_weight = 0.333 (equal allocation)

Example:
    base_risk = 2%
    BTCUSD allocation = 45%
    effective_risk = 2% × (0.45 / 0.333) = 2.7% → capped at 2.5% (hard cap)

    ETHUSD allocation = 20%
    effective_risk = 2% × (0.20 / 0.333) = 1.2%
```

---

## 3. Performance Scoring

### 3.1 Per-Asset Performance Metrics (Rolling 30-Day)

```python
def compute_asset_performance(asset, lookback_days=30):
    trades = get_closed_trades(asset, days=lookback_days)

    if len(trades) < 5:
        return {"score": 50, "confidence": "LOW", "reason": "Insufficient trades"}

    # Core metrics
    win_rate = count_winners(trades) / len(trades)
    avg_rr_achieved = mean(t.actual_rr for t in trades)
    expectancy = (win_rate * avg_win(trades)) - ((1 - win_rate) * avg_loss(trades))
    profit_factor = sum_wins(trades) / max(sum_losses(trades), 0.01)

    # Sharpe-like ratio (daily returns basis)
    daily_returns = compute_daily_returns(trades)
    sharpe = mean(daily_returns) / max(std(daily_returns), 0.0001) * sqrt(252)

    # Max drawdown during period
    max_dd = compute_max_drawdown(trades)

    # Score computation (0-100 scale)
    score = 50  # Baseline

    # Win rate component (±15)
    if win_rate > 0.55:
        score += min((win_rate - 0.50) * 100, 15)
    elif win_rate < 0.40:
        score -= min((0.40 - win_rate) * 100, 15)

    # Expectancy component (±15)
    if expectancy > 0:
        score += min(expectancy * 50, 15)
    else:
        score += max(expectancy * 50, -15)

    # Profit factor component (±10)
    if profit_factor > 1.5:
        score += min((profit_factor - 1.0) * 10, 10)
    elif profit_factor < 1.0:
        score -= min((1.0 - profit_factor) * 20, 10)

    # Sharpe component (±10)
    if sharpe > 1.0:
        score += min((sharpe - 0.5) * 10, 10)
    elif sharpe < 0:
        score -= min(abs(sharpe) * 10, 10)

    return {
        "score": max(0, min(100, score)),
        "win_rate": win_rate,
        "expectancy": expectancy,
        "profit_factor": profit_factor,
        "sharpe": sharpe,
        "max_drawdown": max_dd,
        "trade_count": len(trades),
        "confidence": "HIGH" if len(trades) >= 15 else "MEDIUM"
    }
```

### 3.2 Regime Favorability Score

```python
def compute_regime_favorability(asset):
    regime_h1 = classify_regime(asset, "H1")
    regime_h4 = classify_regime(asset, "H4")
    vol_score = compute_volatility_score(asset, "H1")

    favorability = 50  # Baseline

    # Regime quality
    favorable_regimes = ["VOLATILE_EXPANSION", "TRENDING_UP", "TRENDING_DOWN"]

    if regime_h1 in favorable_regimes:
        favorability += 20
    elif regime_h1 == "RANGING":
        favorability -= 25
    elif regime_h1 == "VOLATILE_CONTRACTION":
        favorability -= 15

    if regime_h4 in favorable_regimes:
        favorability += 10
    elif regime_h4 == "RANGING":
        favorability -= 10

    # Volatility quality
    if vol_score["tradeable"]:
        favorability += 10
    else:
        favorability -= 10

    return max(0, min(100, favorability))
```

---

## 4. Weight Computation

```python
def compute_allocation_weights():
    """
    Called every 4 hours to rebalance allocation weights.
    """
    assets = ["BTCUSD", "ETHUSD", "XAUUSD"]
    raw_scores = {}

    for asset in assets:
        perf = compute_asset_performance(asset)
        regime = compute_regime_favorability(asset)

        # Composite score: 60% performance, 40% regime favorability
        composite = perf["score"] * 0.60 + regime * 0.40

        # Confidence adjustment: reduce impact if few trades
        if perf["confidence"] == "LOW":
            composite = 50 + (composite - 50) * 0.3  # Pull toward neutral
        elif perf["confidence"] == "MEDIUM":
            composite = 50 + (composite - 50) * 0.7

        raw_scores[asset] = composite

    # Normalize to percentages
    total = sum(raw_scores.values())
    weights = {asset: score / total for asset, score in raw_scores.items()}

    # Apply floor and ceiling
    for asset in assets:
        weights[asset] = max(0.10, min(0.60, weights[asset]))

    # Re-normalize after capping
    total = sum(weights.values())
    weights = {asset: w / total for asset, w in weights.items()}

    # Smoothing: blend with previous weights (80% new, 20% old)
    prev_weights = get_previous_weights()
    if prev_weights:
        for asset in assets:
            weights[asset] = weights[asset] * 0.80 + prev_weights[asset] * 0.20

    # Final re-normalize
    total = sum(weights.values())
    weights = {asset: w / total for asset, w in weights.items()}

    return weights
```

---

## 5. Correlation-Adjusted Allocation

```python
def apply_correlation_adjustment(weights):
    """
    If BTC and ETH are highly correlated, cap their combined allocation.
    """
    btc_eth_corr = compute_rolling_correlation("BTCUSD", "ETHUSD", "H1", window=100)

    max_combined_crypto = {
        "high_corr": 0.55,     # correlation > 0.85
        "medium_corr": 0.70,   # correlation 0.60-0.85
        "low_corr": 1.00       # correlation < 0.60 (no constraint)
    }

    if btc_eth_corr > 0.85:
        cap = max_combined_crypto["high_corr"]
    elif btc_eth_corr > 0.60:
        cap = max_combined_crypto["medium_corr"]
    else:
        return weights  # No adjustment needed

    combined = weights["BTCUSD"] + weights["ETHUSD"]
    if combined > cap:
        # Scale down crypto proportionally
        scale = cap / combined
        weights["BTCUSD"] *= scale
        weights["ETHUSD"] *= scale
        # Give excess to XAU
        weights["XAUUSD"] = 1.0 - weights["BTCUSD"] - weights["ETHUSD"]

    return weights
```

---

## 6. Allocation State Transitions

```
State: EQUAL (default startup)
    → All assets at 33.3%
    → Minimum 5 trading days or 15 total trades before first rebalance

State: PERFORMANCE_WEIGHTED
    → Normal operation after warmup
    → Rebalanced every 4 hours
    → Smooth transitions (80/20 blend)

State: DEFENSIVE
    → Triggered by monthly drawdown WARNING (6%)
    → Equal allocation restored
    → Risk reduced to 1% per trade
    → Remains until drawdown recovers to 3% or new month

State: SINGLE_ASSET_FOCUS
    → Triggered only by manual override
    → One asset gets 60%, others split remaining 40%
    → Never triggered automatically
```

---

## 7. Allocation Change Logging

Every rebalance writes to the database and logs:

```json
{
    "timestamp_utc": "2026-03-03T16:00:00Z",
    "previous_weights": {"BTCUSD": 0.34, "ETHUSD": 0.33, "XAUUSD": 0.33},
    "new_weights": {"BTCUSD": 0.42, "ETHUSD": 0.28, "XAUUSD": 0.30},
    "scores": {
        "BTCUSD": {"performance": 68, "regime": 72, "composite": 69.6},
        "ETHUSD": {"performance": 42, "regime": 35, "composite": 39.2},
        "XAUUSD": {"performance": 55, "regime": 60, "composite": 57.0}
    },
    "btc_eth_correlation": 0.78,
    "allocation_state": "PERFORMANCE_WEIGHTED",
    "reason": "Scheduled 4-hour rebalance"
}
```
