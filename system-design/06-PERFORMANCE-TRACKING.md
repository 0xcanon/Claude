# Performance Tracking Structure

## 1. Metrics Framework

### 1.1 Real-Time Metrics (Updated Every Second)

```python
@dataclass
class RealTimeMetrics:
    timestamp: datetime
    account_equity: float
    account_balance: float
    unrealized_pnl: float
    margin_used: float
    margin_free: float
    margin_level_pct: float
    open_positions_count: int
    portfolio_heat: float
    daily_pnl_dollars: float
    daily_pnl_percent: float
    daily_high_watermark: float
    daily_drawdown_percent: float
    operational_mode: str
    data_feed_latency_ms: int
    ipc_latency_ms: int
```

### 1.2 Per-Trade Metrics (Recorded on Trade Close)

```python
@dataclass
class TradeMetrics:
    trade_id: str
    signal_id: str
    asset: str
    direction: str
    entry_time: datetime
    exit_time: datetime
    hold_duration_minutes: int
    entry_price: float
    exit_price: float
    stop_loss: float
    take_profit: float
    lot_size: float
    risk_percent: float
    risk_dollars: float
    pnl_dollars: float
    pnl_percent: float
    pnl_pips: float
    actual_rr: float                  # Actual risk/reward achieved
    planned_rr: float                 # Planned R:R at entry
    max_favorable_excursion: float    # MFE: max profit during trade
    max_adverse_excursion: float      # MAE: max loss during trade
    slippage_entry: float
    slippage_exit: float
    spread_at_entry: float
    spread_at_exit: float
    commission: float
    swap: float
    regime_at_entry: str
    regime_at_exit: str
    signal_score: float
    mtf_alignment_score: float
    exit_reason: str                  # TP_HIT, SL_HIT, TRAILING_STOP, SIGNAL_EXIT, EMERGENCY
    partial_closes: list              # List of partial close events
    strategy_id: str
    notes: str
```

### 1.3 Daily Summary Metrics

```python
@dataclass
class DailySummary:
    date: date
    starting_equity: float
    ending_equity: float
    high_watermark: float
    low_watermark: float
    daily_pnl_dollars: float
    daily_pnl_percent: float
    max_drawdown_intraday: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    profit_factor: float
    average_win_dollars: float
    average_loss_dollars: float
    average_rr_achieved: float
    largest_win: float
    largest_loss: float
    total_commission: float
    total_swap: float
    total_slippage_cost: float
    trades_by_asset: dict             # {"BTCUSD": 3, "ETHUSD": 2, "XAUUSD": 1}
    pnl_by_asset: dict
    trades_by_regime: dict
    pnl_by_regime: dict
    allocation_weights_used: dict
    operational_mode_time: dict       # {"NORMAL": 20, "REDUCED": 4, ...} hours
    signals_generated: int
    signals_filtered: int
    signals_executed: int
    signals_rejected_by_ea: int
    self_improvement_actions: list
```

### 1.4 Monthly Summary Metrics

```python
@dataclass
class MonthlySummary:
    month: str                        # "2026-03"
    starting_equity: float
    ending_equity: float
    monthly_pnl_dollars: float
    monthly_pnl_percent: float
    max_drawdown_monthly: float
    total_trades: int
    win_rate: float
    profit_factor: float
    sharpe_ratio_daily: float         # Annualized from daily returns
    sortino_ratio_daily: float
    calmar_ratio: float               # Return / Max DD
    average_daily_return: float
    daily_return_std: float
    best_day_pnl: float
    worst_day_pnl: float
    consecutive_win_max: int
    consecutive_loss_max: int
    avg_hold_time_minutes: float
    total_costs: float                # Commission + swap + slippage
    net_pnl_after_costs: float
    performance_by_asset: dict
    performance_by_regime: dict
    regime_distribution: dict         # % time in each regime
    allocation_drift: dict            # How much allocation changed
    kill_switch_activations: int
    system_uptime_percent: float
```

---

## 2. Key Performance Indicators (KPIs)

### 2.1 Primary KPIs (Dashboard Top Row)

| KPI | Formula | Target (Base) | Target (High-Risk) |
|---|---|---|---|
| Monthly Return | monthly_pnl / starting_equity | 5-15% | 15-30% |
| Max Daily Drawdown | Worst single day loss | < 7% | < 10% |
| Max Monthly Drawdown | Worst month drawdown | < 12% | < 18% |
| Win Rate | Wins / Total Trades | > 45% | > 42% |
| Profit Factor | Gross Profit / Gross Loss | > 1.5 | > 1.4 |
| Sharpe Ratio | (Avg Return - Rf) / StdDev | > 1.5 | > 1.2 |
| Sortino Ratio | (Avg Return - Rf) / Downside StdDev | > 2.0 | > 1.5 |

### 2.2 Risk KPIs

| KPI | Formula | Alert Threshold |
|---|---|---|
| Portfolio Heat | Sum of open risk % | > 5% |
| Correlation Exposure | BTC+ETH combined heat | > 4% |
| Average Slippage | Mean slippage in points | > 20 points |
| Cost Ratio | Total costs / Gross profit | > 15% |
| Stop-Hit Rate | SL exits / Total exits | > 55% |
| Edge Ratio | MFE / MAE average | < 1.5 |

### 2.3 System Health KPIs

| KPI | Target | Alert Threshold |
|---|---|---|
| System Uptime | > 99.5% | < 99% |
| Signal-to-Execution Latency | < 200ms | > 500ms |
| Data Feed Freshness | < 2s | > 5s |
| Heartbeat Round-Trip | < 500ms | > 2s |
| Database Write Latency | < 50ms | > 200ms |

---

## 3. Performance Attribution

### 3.1 By Asset

```python
def compute_asset_attribution(period: str = "monthly") -> dict:
    """
    Break down P&L contribution by asset.
    """
    trades = get_trades(period)
    attribution = {}

    for asset in ["BTCUSD", "ETHUSD", "XAUUSD"]:
        asset_trades = [t for t in trades if t.asset == asset]
        attribution[asset] = {
            "total_pnl": sum(t.pnl_dollars for t in asset_trades),
            "trade_count": len(asset_trades),
            "win_rate": safe_div(
                sum(1 for t in asset_trades if t.pnl_dollars > 0),
                len(asset_trades)
            ),
            "profit_factor": safe_div(
                sum(t.pnl_dollars for t in asset_trades if t.pnl_dollars > 0),
                abs(sum(t.pnl_dollars for t in asset_trades if t.pnl_dollars < 0))
            ),
            "avg_rr": mean([t.actual_rr for t in asset_trades]) if asset_trades else 0,
            "contribution_pct": 0  # Filled below
        }

    total = sum(a["total_pnl"] for a in attribution.values())
    for asset in attribution:
        attribution[asset]["contribution_pct"] = (
            attribution[asset]["total_pnl"] / total * 100 if total != 0 else 0
        )

    return attribution
```

### 3.2 By Regime

```python
def compute_regime_attribution(period: str = "monthly") -> dict:
    """
    Break down P&L by market regime at entry.
    Identifies which regimes the strategy thrives in.
    """
    trades = get_trades(period)
    regimes = {}

    for trade in trades:
        regime = trade.regime_at_entry
        if regime not in regimes:
            regimes[regime] = {"trades": [], "pnl": 0}
        regimes[regime]["trades"].append(trade)
        regimes[regime]["pnl"] += trade.pnl_dollars

    for regime in regimes:
        regime_trades = regimes[regime]["trades"]
        regimes[regime]["win_rate"] = safe_div(
            sum(1 for t in regime_trades if t.pnl_dollars > 0),
            len(regime_trades)
        )
        regimes[regime]["avg_rr"] = mean([t.actual_rr for t in regime_trades])
        regimes[regime]["trade_count"] = len(regime_trades)

    return regimes
```

### 3.3 By Time of Day

```python
def compute_time_attribution(period: str = "monthly") -> dict:
    """
    Break down P&L by hour of entry (UTC).
    Identifies optimal trading hours.
    """
    trades = get_trades(period)
    hours = {h: {"pnl": 0, "count": 0, "wins": 0} for h in range(24)}

    for trade in trades:
        hour = trade.entry_time.hour
        hours[hour]["pnl"] += trade.pnl_dollars
        hours[hour]["count"] += 1
        if trade.pnl_dollars > 0:
            hours[hour]["wins"] += 1

    return hours
```

---

## 4. Grafana Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ROW 1: SYSTEM STATUS                                           │
│  [Mode: NORMAL] [Uptime: 99.8%] [Equity: $6,589] [Heat: 3.8%] │
│  [Daily P&L: +$42.15 (+0.64%)] [Monthly: +$312 (+4.97%)]       │
├──────────────────────────────┬──────────────────────────────────┤
│  ROW 2: EQUITY CURVE         │  ROW 2: DRAWDOWN CHART           │
│  [Line chart: Equity vs Time]│  [Area chart: DD% vs Time]       │
│                              │  [Daily DD line, Monthly DD line] │
├──────────────────────────────┼──────────────────────────────────┤
│  ROW 3: ASSET PERFORMANCE    │  ROW 3: REGIME PERFORMANCE       │
│  [Bar chart: P&L by asset]   │  [Bar chart: P&L by regime]      │
│  [BTCUSD, ETHUSD, XAUUSD]   │  [Trending, Expansion, etc.]     │
├──────────────────────────────┼──────────────────────────────────┤
│  ROW 4: RECENT TRADES TABLE  │  ROW 4: ALLOCATION WEIGHTS       │
│  [Last 20 trades with P&L,  │  [Pie chart: Current allocation]  │
│   R:R, regime, score]        │  [Line: Weight changes over time] │
├──────────────────────────────┼──────────────────────────────────┤
│  ROW 5: SIGNAL QUALITY       │  ROW 5: RISK METRICS             │
│  [Score distribution]        │  [Heat gauge]                     │
│  [Win rate by score bucket]  │  [Consecutive loss counter]       │
│                              │  [Correlation BTC/ETH]            │
├──────────────────────────────┴──────────────────────────────────┤
│  ROW 6: SYSTEM HEALTH                                           │
│  [Heartbeat status] [Latency] [CPU/Memory] [DB status]          │
└─────────────────────────────────────────────────────────────────┘
```
