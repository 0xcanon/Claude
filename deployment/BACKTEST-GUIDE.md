# Backtesting Guide

---

## 1. Backtesting Philosophy

**The backtest is not the strategy.** The backtest is a hypothesis validation tool.
It answers: "Would this logic have survived historically?" It does NOT answer:
"Will this work going forward?"

### 1.1 Rules for Honest Backtesting

1. **No future information leakage.** Every indicator, every decision must use
   only data available at the time of the decision. This includes:
   - No peeking at future bars for SL/TP optimization
   - No using today's volatility to size yesterday's position
   - ATR, EMA, ADX values must be computed with a strict lookback window

2. **Realistic fills.** Assume:
   - Entry slippage: 1-3 points for XAU, 10-30 points for BTC, 1-5 points for ETH
   - Exit slippage on SL: 2× entry slippage (stop hunts, gaps)
   - Spread: Use historical spread data, or 1.5× current typical spread

3. **Realistic commissions.** Model actual broker commission structure.

4. **No optimization on the test set.** Use walk-forward validation (below).

5. **Account for correlation.** When backtesting portfolio (all 3 assets), model
   correlation-based position sizing, not independent position sizing.

6. **Model partial fills** for crypto during low-liquidity periods.

7. **Model weekends** for XAU (gaps on Monday open).

---

## 2. Data Requirements

### 2.1 Minimum Data Periods

| Asset | Minimum History | Ideal History |
|-------|----------------|---------------|
| BTCUSD | 3 years | 5+ years (captures 2020-2025 regimes) |
| ETHUSD | 3 years | 5+ years |
| XAUUSD | 5 years | 10+ years |

### 2.2 Timeframe Data Needed

- M5: For execution simulation (entry/exit price accuracy)
- M15: For entry trigger backtesting
- H1: For primary signal generation
- H4: For intermediate trend
- D1: For macro context

### 2.3 Data Sources

| Source | Pros | Cons |
|--------|------|------|
| MT5 built-in history | Free, easy | Limited depth, broker-specific |
| Dukascopy tick data | High quality, free | Requires conversion |
| TradingView export | Clean | Limited to chart timeframes |
| Binance API (crypto) | Deep history, free | Only crypto |
| Custom data vendor | Full control | Cost |

### 2.4 Data Quality Checks

Before backtesting, validate data:
```python
def validate_data(df, asset, timeframe):
    checks = []

    # Check for gaps
    expected_interval = {"M5": 300, "M15": 900, "H1": 3600, "H4": 14400, "D1": 86400}
    gaps = find_time_gaps(df, expected_interval[timeframe])
    checks.append(("GAPS", len(gaps), f"Found {len(gaps)} gaps"))

    # Check for duplicate timestamps
    dupes = df['time'].duplicated().sum()
    checks.append(("DUPLICATES", dupes, f"{dupes} duplicates"))

    # Check for zero/negative values
    bad_prices = ((df['high'] <= 0) | (df['low'] <= 0) |
                  (df['open'] <= 0) | (df['close'] <= 0)).sum()
    checks.append(("BAD_PRICES", bad_prices, f"{bad_prices} bad prices"))

    # Check OHLC consistency
    inconsistent = ((df['high'] < df['low']) |
                    (df['high'] < df['open']) |
                    (df['high'] < df['close']) |
                    (df['low'] > df['open']) |
                    (df['low'] > df['close'])).sum()
    checks.append(("OHLC_INCONSISTENT", inconsistent, f"{inconsistent} bars"))

    return checks
```

---

## 3. Walk-Forward Optimization (WFO)

### 3.1 Method

Do NOT optimize on the full dataset and then test on the same dataset.
Use walk-forward:

```
Total data: 2020-01-01 to 2025-12-31 (6 years)

Window 1: Train 2020-01 to 2021-06 → Test 2021-07 to 2021-12
Window 2: Train 2020-07 to 2022-00 → Test 2022-01 to 2022-06
Window 3: Train 2021-01 to 2022-06 → Test 2022-07 to 2022-12
Window 4: Train 2021-07 to 2023-00 → Test 2023-01 to 2023-06
Window 5: Train 2022-01 to 2023-06 → Test 2023-07 to 2023-12
Window 6: Train 2022-07 to 2024-00 → Test 2024-01 to 2024-06
Window 7: Train 2023-01 to 2024-06 → Test 2024-07 to 2024-12
Window 8: Train 2023-07 to 2025-00 → Test 2025-01 to 2025-06
Window 9: Train 2024-01 to 2025-06 → Test 2025-07 to 2025-12

Each window:
    Training: 18 months → Optimize parameters
    Testing:  6 months  → Validate with frozen parameters
```

### 3.2 Parameters to Optimize (Carefully)

Only optimize parameters with clear logical basis:

| Parameter | Range | Step |
|-----------|-------|------|
| ATR period | 10-20 | 2 |
| SL multiplier | 1.0-2.0 | 0.1 |
| ADX threshold | 20-30 | 2 |
| BB width lookback | 80-120 | 10 |
| EMA periods | Various | — |
| Volatility ratio thresholds | 0.5-2.5 | 0.1 |

Do NOT optimize:
- Risk per trade (fixed at 2%)
- Drawdown caps (fixed)
- R:R ratio (fixed minimum 1:2)
- Position limits (fixed)

### 3.3 Overfitting Detection

```python
def check_overfitting(train_results, test_results):
    """
    Compare in-sample vs out-of-sample performance.
    Large degradation = overfitting.
    """
    degradation = {}

    degradation["sharpe"] = (train_results.sharpe - test_results.sharpe) / train_results.sharpe
    degradation["win_rate"] = (train_results.win_rate - test_results.win_rate) / train_results.win_rate
    degradation["profit_factor"] = (train_results.pf - test_results.pf) / train_results.pf

    overfit_score = np.mean(list(degradation.values()))

    if overfit_score > 0.40:
        return "SEVERE OVERFITTING — parameters unreliable"
    elif overfit_score > 0.25:
        return "MODERATE OVERFITTING — proceed with caution"
    elif overfit_score > 0.10:
        return "MILD OVERFITTING — acceptable"
    else:
        return "ROBUST — minimal in-sample/out-of-sample gap"
```

---

## 4. Backtest Engine Structure

```python
class Backtester:
    def __init__(self, data, config):
        self.data = data           # Dict of DataFrames per asset per timeframe
        self.config = config       # Strategy parameters
        self.brain = BacktestBrain(config)  # Same logic as live brain
        self.positions = []
        self.closed_trades = []
        self.equity_curve = []
        self.starting_equity = config.starting_equity

    def run(self):
        """
        Bar-by-bar simulation. Process H1 bars sequentially.
        For each H1 bar, provide the brain with all available data
        up to (and including) that bar. No future data.
        """
        current_equity = self.starting_equity

        h1_bars = self.data["H1"]
        for i in range(200, len(h1_bars)):  # Start after warmup
            bar = h1_bars.iloc[i]
            timestamp = bar['time']

            # Build available data (no future leak)
            available_data = {
                tf: self.data[tf][self.data[tf]['time'] <= timestamp]
                for tf in ["M5", "M15", "H1", "H4", "D1"]
            }

            # Update equity with floating P&L
            current_equity = self._compute_equity(current_equity, bar)

            # Check stop-losses and take-profits hit during this bar
            self._process_exits(bar, current_equity)

            # Brain evaluation (same logic as live)
            signals = self.brain.evaluate(available_data, current_equity)

            for signal in signals:
                # Simulate fill with slippage
                fill = self._simulate_fill(signal, bar)
                if fill:
                    self.positions.append(fill)

            # Record equity
            self.equity_curve.append({
                "time": timestamp,
                "equity": current_equity,
                "positions": len(self.positions)
            })

        return self._compute_results()

    def _process_exits(self, bar, equity):
        """Check if any open position hit SL or TP during this bar."""
        for pos in self.positions[:]:  # Copy list for safe removal
            if pos.direction == "LONG":
                # SL check: did low touch SL?
                if bar['low'] <= pos.stop_loss:
                    self._close_position(pos, pos.stop_loss, "SL", bar, equity)
                    continue
                # TP1 check: did high touch TP1?
                if bar['high'] >= pos.take_profit_1 and pos.partial_state == 0:
                    self._partial_close(pos, pos.take_profit_1, 0.50, "TP1", bar)
                # TP2 check
                if bar['high'] >= pos.take_profit_2 and pos.partial_state == 1:
                    self._partial_close(pos, pos.take_profit_2, 0.60, "TP2", bar)
                    # 60% of remaining (which is 50%) = 30% of original
            else:  # SHORT
                if bar['high'] >= pos.stop_loss:
                    self._close_position(pos, pos.stop_loss, "SL", bar, equity)
                    continue
                if bar['low'] <= pos.take_profit_1 and pos.partial_state == 0:
                    self._partial_close(pos, pos.take_profit_1, 0.50, "TP1", bar)
                if bar['low'] <= pos.take_profit_2 and pos.partial_state == 1:
                    self._partial_close(pos, pos.take_profit_2, 0.60, "TP2", bar)

    def _simulate_fill(self, signal, bar):
        """Simulate realistic fill with slippage."""
        slippage = self._estimate_slippage(signal.asset, bar)

        if signal.direction == "LONG":
            fill_price = bar['close'] + slippage  # Worse fill
        else:
            fill_price = bar['close'] - slippage

        return FilledPosition(
            signal=signal,
            fill_price=fill_price,
            slippage=slippage,
            commission=self._estimate_commission(signal.asset, signal.lots)
        )

    def _compute_results(self):
        """Compute comprehensive backtest results."""
        return {
            "total_return_pct": ...,
            "annualized_return_pct": ...,
            "max_drawdown_pct": ...,
            "sharpe_ratio": ...,
            "sortino_ratio": ...,
            "calmar_ratio": ...,
            "total_trades": len(self.closed_trades),
            "win_rate": ...,
            "profit_factor": ...,
            "expectancy": ...,
            "avg_rr_achieved": ...,
            "max_consecutive_losses": ...,
            "max_consecutive_wins": ...,
            "equity_curve": self.equity_curve,
            "trades": self.closed_trades,
            "by_asset": ...,
            "by_regime": ...,
            "monthly_returns": ...,
        }
```

---

## 5. Backtest Validation Checklist

Before trusting any backtest result:

```
□ Walk-forward validation shows consistent OOS performance
□ Overfitting score < 0.25
□ Results survive ±20% parameter perturbation (robustness)
□ Minimum 100 trades per asset in test period
□ Profit factor > 1.3 out-of-sample
□ Win rate between 35% and 65% (extremes suggest data issues)
□ Maximum drawdown < 15% out-of-sample
□ No single trade accounts for >20% of total profit
□ Performance consistent across different market regimes
□ Slippage model is conservative (2× average observed)
□ Commission model matches actual broker rates
□ Equity curve shows no single long stretch of flat-to-negative
```

---

## 6. Monte Carlo Simulation

After backtesting, run Monte Carlo to stress-test:

```python
def monte_carlo(trades, n_simulations=10000, confidence=0.95):
    """
    Shuffle trade order to see range of possible outcomes.
    """
    results = []
    for _ in range(n_simulations):
        shuffled = np.random.permutation(trades)
        equity_curve = simulate_equity(shuffled)
        results.append({
            "final_equity": equity_curve[-1],
            "max_drawdown": compute_max_dd(equity_curve),
            "sharpe": compute_sharpe(equity_curve)
        })

    # Confidence intervals
    final_equities = sorted([r["final_equity"] for r in results])
    drawdowns = sorted([r["max_drawdown"] for r in results])

    return {
        "median_return": np.median(final_equities),
        "worst_case_return": final_equities[int(n_simulations * 0.05)],
        "best_case_return": final_equities[int(n_simulations * 0.95)],
        "median_max_dd": np.median(drawdowns),
        "worst_case_dd": drawdowns[int(n_simulations * 0.95)],
        "probability_of_profit": sum(1 for e in final_equities if e > starting) / n_simulations,
        "probability_of_ruin": sum(1 for e in final_equities if e < starting * 0.5) / n_simulations,
    }
```
