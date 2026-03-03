# Backtesting Methodology

## 1. Critical Principles

### 1.1 Why Most Backtests Are Lies

Most retail backtests fail because they:

1. **Use unrealistic fills** — assuming you can always get the bar close price
2. **Ignore slippage** — especially on crypto where slippage is material
3. **Ignore spread variability** — using fixed spread instead of variable
4. **Ignore execution latency** — the price moves between signal and fill
5. **Look-ahead bias** — using information that wasn't available at signal time
6. **Survivorship bias** — only testing on current data, not data that existed at the time
7. **Over-optimization** — fitting parameters to past data until they "work"
8. **Insufficient data** — testing on 6 months and expecting it to work for years

### 1.2 Our Approach

```
We use a multi-stage validation pipeline:
1. In-sample optimization (40% of data)
2. Out-of-sample validation (30% of data)
3. Walk-forward analysis (remaining 30%, rolling windows)
4. Monte Carlo simulation (shuffle trade order)
5. Stress testing (inject adverse conditions)
```

---

## 2. Data Requirements

### 2.1 Minimum Data

| Asset | Minimum History | Recommended | Timeframes Needed |
|---|---|---|---|
| BTCUSD | 3 years | 5+ years | M5, M15, H1, H4, D1 |
| ETHUSD | 3 years | 5+ years | M5, M15, H1, H4, D1 |
| XAUUSD | 5 years | 10+ years | M5, M15, H1, H4, D1 |

### 2.2 Data Quality Checklist

```
□ No gaps in data (or gaps documented and handled)
□ Bid/Ask spread data included (not just mid-price)
□ Volume data included where available
□ Data from the same broker being used for live trading
□ Timezone consistency (all UTC)
□ Weekend/holiday gaps handled correctly
□ Corporate events/splits/forks handled for crypto
□ Multiple data sources cross-validated
```

### 2.3 Data Sources

| Source | Type | Quality |
|---|---|---|
| MT5 broker historical data | OHLCV | Broker-specific (best for execution realism) |
| Dukascopy tick data | Tick | Very high quality, free |
| Binance/Coinbase API | OHLCV + trades | Excellent for crypto |
| TradingView export | OHLCV | Good for cross-validation |

---

## 3. Realistic Execution Modeling

### 3.1 Slippage Model

```python
class SlippageModel:
    """
    Models realistic slippage based on:
    - Time of day (liquidity proxy)
    - Volatility at execution time
    - Position size relative to typical volume
    """

    SLIPPAGE_PROFILES = {
        "BTCUSD": {
            "base_slippage_pct": 0.015,    # 0.015% base slippage
            "high_vol_multiplier": 2.5,     # During high vol
            "low_liquidity_multiplier": 2.0, # During low liquidity hours
            "large_size_multiplier": 1.5,    # For size > average
        },
        "ETHUSD": {
            "base_slippage_pct": 0.020,
            "high_vol_multiplier": 3.0,
            "low_liquidity_multiplier": 2.5,
            "large_size_multiplier": 1.5,
        },
        "XAUUSD": {
            "base_slippage_pct": 0.005,
            "high_vol_multiplier": 2.0,
            "low_liquidity_multiplier": 1.5,
            "large_size_multiplier": 1.3,
        }
    }

    def estimate_slippage(self, asset, entry_price, atr_percentile, hour_utc, lot_size):
        profile = self.SLIPPAGE_PROFILES[asset]
        slippage = entry_price * profile["base_slippage_pct"] / 100

        if atr_percentile > 80:
            slippage *= profile["high_vol_multiplier"]
        elif atr_percentile > 60:
            slippage *= 1.5

        if hour_utc in range(0, 8):  # Asian session / low liquidity
            slippage *= profile["low_liquidity_multiplier"]

        return slippage
```

### 3.2 Spread Model

```python
class SpreadModel:
    """Model variable spread based on historical patterns."""

    def get_spread(self, asset, timestamp):
        hour = timestamp.hour
        day_of_week = timestamp.weekday()

        # Base spread (in price units)
        base_spreads = {
            "BTCUSD": {"peak": 15.0, "off_peak": 40.0, "weekend": 80.0},
            "ETHUSD": {"peak": 0.50, "off_peak": 1.50, "weekend": 3.00},
            "XAUUSD": {"peak": 0.15, "off_peak": 0.35, "weekend": 0.60},
        }

        spread_profile = base_spreads[asset]

        if day_of_week >= 5:  # Weekend
            return spread_profile["weekend"]
        elif 13 <= hour <= 20:  # Peak (London+NY overlap)
            return spread_profile["peak"]
        else:
            return spread_profile["off_peak"]
```

---

## 4. Walk-Forward Analysis

### 4.1 Protocol

```
WALK-FORWARD PARAMETERS:
  Total data: 5 years
  Training window: 12 months (rolling)
  Testing window: 3 months (rolling)
  Step size: 3 months
  Minimum windows: 12 (covers 4.5 years)

PROCESS:
  Window 1: Train on months 1-12,  Test on months 13-15
  Window 2: Train on months 4-15,  Test on months 16-18
  Window 3: Train on months 7-18,  Test on months 19-21
  ...

FOR EACH WINDOW:
  1. Optimize parameters on training data
  2. Run strategy with optimized params on test data
  3. Record test performance metrics

EVALUATION:
  - Walk-forward efficiency = mean(test_returns) / mean(train_returns)
  - If WFE > 0.50 → strategy likely has real edge
  - If WFE < 0.30 → strategy is likely overfit

  - Test that strategy is profitable in at least 8/12 windows
  - Test that max drawdown in test < 1.5x max drawdown in train
```

### 4.2 Implementation

```python
class WalkForwardAnalyzer:
    def __init__(self, data, strategy, train_months=12, test_months=3, step_months=3):
        self.data = data
        self.strategy = strategy
        self.train_months = train_months
        self.test_months = test_months
        self.step_months = step_months

    def run(self):
        results = []
        total_months = len(self.data) // 30  # Approximate

        for start in range(0, total_months - self.train_months - self.test_months + 1,
                           self.step_months):
            train_start = start
            train_end = start + self.train_months
            test_start = train_end
            test_end = test_start + self.test_months

            # Get data slices
            train_data = self.data.slice(train_start, train_end)
            test_data = self.data.slice(test_start, test_end)

            # Optimize on training data
            best_params = self.strategy.optimize(train_data)

            # Test with optimized params
            train_result = self.strategy.backtest(train_data, best_params)
            test_result = self.strategy.backtest(test_data, best_params)

            results.append({
                "window": f"{train_start}-{test_end}",
                "train_return": train_result.total_return,
                "test_return": test_result.total_return,
                "train_sharpe": train_result.sharpe_ratio,
                "test_sharpe": test_result.sharpe_ratio,
                "train_max_dd": train_result.max_drawdown,
                "test_max_dd": test_result.max_drawdown,
                "wfe": test_result.total_return / train_result.total_return
                        if train_result.total_return > 0 else 0,
                "params_used": best_params,
            })

        return self._compile_report(results)

    def _compile_report(self, results):
        avg_wfe = mean([r["wfe"] for r in results])
        profitable_windows = sum(1 for r in results if r["test_return"] > 0)

        return {
            "walk_forward_efficiency": avg_wfe,
            "profitable_windows": profitable_windows,
            "total_windows": len(results),
            "avg_test_return": mean([r["test_return"] for r in results]),
            "avg_test_sharpe": mean([r["test_sharpe"] for r in results]),
            "worst_test_dd": min(r["test_max_dd"] for r in results),
            "verdict": "VIABLE" if avg_wfe > 0.50 and profitable_windows >= len(results) * 0.67
                       else "SUSPECT",
            "details": results,
        }
```

---

## 5. Monte Carlo Simulation

### 5.1 Purpose

Monte Carlo simulation answers: "Given the same set of trades, how much could results vary just from different trade ordering?"

### 5.2 Implementation

```python
class MonteCarloSimulator:
    def __init__(self, trades: list, initial_equity: float, simulations: int = 10000):
        self.trades = trades
        self.initial_equity = initial_equity
        self.simulations = simulations

    def run(self):
        results = []
        for _ in range(self.simulations):
            shuffled = random.sample(self.trades, len(self.trades))
            equity_curve = self._simulate_equity(shuffled)
            results.append({
                "final_equity": equity_curve[-1],
                "max_drawdown": self._calc_max_dd(equity_curve),
                "total_return": (equity_curve[-1] - self.initial_equity) / self.initial_equity * 100,
            })

        return {
            "median_return": median([r["total_return"] for r in results]),
            "p5_return": percentile([r["total_return"] for r in results], 5),
            "p95_return": percentile([r["total_return"] for r in results], 95),
            "median_max_dd": median([r["max_drawdown"] for r in results]),
            "p95_max_dd": percentile([r["max_drawdown"] for r in results], 95),
            "probability_of_profit": sum(1 for r in results if r["total_return"] > 0) / len(results),
            "ruin_probability": sum(1 for r in results if r["max_drawdown"] > 50) / len(results),
        }

    def _simulate_equity(self, trades):
        equity = [self.initial_equity]
        for trade in trades:
            pnl_pct = trade["pnl_percent"] / 100
            new_equity = equity[-1] * (1 + pnl_pct)
            equity.append(new_equity)
        return equity

    def _calc_max_dd(self, equity_curve):
        peak = equity_curve[0]
        max_dd = 0
        for eq in equity_curve:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak * 100
            if dd > max_dd:
                max_dd = dd
        return max_dd
```

### 5.3 What Results Mean

```
Good results:
  - Median return > 0 with >80% probability of profit
  - 5th percentile return > -20% (worst case survivable)
  - 95th percentile max drawdown < 30%
  - Ruin probability (DD > 50%) < 1%

Warning signs:
  - Wide spread between P5 and P95 returns → high variance strategy
  - Median return positive but P5 deeply negative → fragile edge
  - Ruin probability > 5% → position sizing too aggressive
```

---

## 6. Stress Testing

### 6.1 Scenarios to Test

```
Scenario 1: Flash Crash
  - Inject a -10% gap on BTCUSD at a random point
  - Verify system survives and SL behavior is correct

Scenario 2: Extended Range
  - Force 30 days of ranging data on all assets
  - Verify system doesn't overtrade and survives the drawdown

Scenario 3: Correlation Spike
  - Force BTC/ETH correlation to 0.95 for 2 weeks
  - Verify correlation guard prevents excessive exposure

Scenario 4: Spread Blowout
  - Multiply all spreads by 5x for 48 hours
  - Verify slippage impact is survivable

Scenario 5: Winning Streak → Losing Streak
  - Take the best 10 trades and follow them with the worst 10
  - Verify the system doesn't over-lever during the win streak
  - Verify drawdown protection activates correctly during loss streak

Scenario 6: Regime Whipsaw
  - Alternate between trending and ranging every 3 days
  - Verify regime detector handles rapid transitions without excess trading
```

---

## 7. Backtest Validation Checklist

```
□ Walk-forward efficiency > 0.50
□ Profitable in >67% of walk-forward windows
□ Monte Carlo median return positive
□ Monte Carlo P5 return > -25%
□ Monte Carlo ruin probability < 2%
□ Live-like spread and slippage modeled
□ No look-ahead bias (verified by code audit)
□ Sample size > 200 trades per variant
□ Tested across multiple market regimes
□ Stress tested against 6 adversarial scenarios
□ Parameter sensitivity analysis performed
□ No single parameter accounts for >30% of edge
□ Performance degrades gracefully with ±20% parameter variation
□ Transaction costs modeled realistically
□ Maximum drawdown in backtest < live drawdown threshold / 1.5
```
