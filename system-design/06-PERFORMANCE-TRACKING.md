# Performance Tracking Structure

---

## 1. Real-Time Metrics (Redis)

Updated on every trade event and position update:

```
Key: perf:realtime
{
    "last_updated_utc": "2026-03-03T14:30:00Z",
    "account": {
        "balance": 20000.00,
        "equity": 20034.13,
        "floating_pnl": 34.13,
        "margin_used": 937.88,
        "margin_level_pct": 2135.22
    },
    "today": {
        "start_equity": 20000.00,
        "current_equity": 20034.13,
        "pnl_usd": 34.13,
        "pnl_pct": 0.17,
        "trades_taken": 3,
        "wins": 2,
        "losses": 1,
        "open_positions": 2,
        "drawdown_pct": 0.0,
        "max_drawdown_pct": 0.8,
        "risk_state": "NORMAL"
    },
    "month": {
        "start_equity": 19500.00,
        "current_equity": 20034.13,
        "pnl_usd": 534.13,
        "pnl_pct": 2.74,
        "trades_taken": 42,
        "wins": 25,
        "losses": 17,
        "drawdown_pct": 0.0,
        "max_drawdown_pct": 3.2
    }
}
```

---

## 2. Per-Asset Metrics (Rolling 30-Day, stored in PostgreSQL)

```
Table: asset_performance_snapshot
Computed and stored every 4 hours.

Fields:
    snapshot_id         SERIAL PRIMARY KEY
    timestamp_utc       TIMESTAMP
    asset               VARCHAR(10)
    period_days         INTEGER         -- 30
    trade_count         INTEGER
    win_count           INTEGER
    loss_count          INTEGER
    win_rate            DECIMAL(5,4)
    avg_win_usd         DECIMAL(12,2)
    avg_loss_usd        DECIMAL(12,2)
    avg_rr_achieved     DECIMAL(5,2)
    expectancy_usd      DECIMAL(12,2)
    profit_factor       DECIMAL(6,2)
    sharpe_ratio        DECIMAL(6,3)
    max_drawdown_pct    DECIMAL(5,2)
    max_consecutive_wins    INTEGER
    max_consecutive_losses  INTEGER
    total_pnl_usd       DECIMAL(12,2)
    total_commission     DECIMAL(10,2)
    total_swap           DECIMAL(10,2)
    avg_hold_duration_min   INTEGER
    avg_slippage_usd     DECIMAL(8,2)
    allocation_weight    DECIMAL(5,4)
    regime_distribution  JSONB          -- % time in each regime
```

---

## 3. Trade Journal (Every Closed Trade)

```
Table: trade_journal

Fields:
    trade_id            SERIAL PRIMARY KEY
    signal_id           VARCHAR(50) UNIQUE
    ticket              BIGINT
    asset               VARCHAR(10)
    direction           VARCHAR(5)        -- LONG / SHORT
    entry_time_utc      TIMESTAMP
    exit_time_utc       TIMESTAMP
    hold_duration_min   INTEGER
    entry_price         DECIMAL(14,5)
    exit_price          DECIMAL(14,5)
    stop_loss_initial   DECIMAL(14,5)
    stop_loss_final     DECIMAL(14,5)
    take_profit_target  DECIMAL(14,5)
    lots                DECIMAL(8,4)
    risk_pct_planned    DECIMAL(5,4)
    risk_usd_planned    DECIMAL(10,2)
    pnl_gross           DECIMAL(12,2)
    pnl_net             DECIMAL(12,2)     -- After commission + swap
    commission          DECIMAL(8,2)
    swap                DECIMAL(8,2)
    slippage_entry      DECIMAL(8,2)
    slippage_exit       DECIMAL(8,2)
    rr_planned          DECIMAL(5,2)
    rr_achieved         DECIMAL(5,2)
    exit_reason         VARCHAR(30)       -- TP1, TP2, TP3, SL, TRAILING, MANUAL, KILL_SWITCH
    partial_closes      JSONB             -- Array of partial close events

    -- Context at entry
    regime_at_entry     VARCHAR(25)
    adx_at_entry        DECIMAL(5,1)
    atr_at_entry        DECIMAL(14,5)
    vol_ratio_at_entry  DECIMAL(5,2)
    bb_width_pctl       INTEGER
    mtf_bias_score      DECIMAL(5,2)
    alignment_quality   VARCHAR(10)
    d1_bias             VARCHAR(10)
    h4_bias             VARCHAR(10)
    h1_trend            VARCHAR(10)
    m15_trigger_type    VARCHAR(40)
    spread_at_entry     DECIMAL(8,2)
    allocation_weight   DECIMAL(5,4)
    risk_state          VARCHAR(15)
    consecutive_losses  INTEGER
    daily_dd_at_entry   DECIMAL(5,2)
    monthly_dd_at_entry DECIMAL(5,2)
    btc_eth_corr        DECIMAL(5,3)

    -- Post-trade analysis
    max_favorable_excursion   DECIMAL(12,2)   -- MFE
    max_adverse_excursion     DECIMAL(12,2)   -- MAE
    time_to_max_profit_min    INTEGER
    was_optimal_exit          BOOLEAN          -- Could more profit have been captured?
```

---

## 4. Daily Summary Report

Generated at 00:00 UTC, stored in database, sent via Telegram/email.

```python
def generate_daily_report(date):
    trades = get_trades_for_date(date)
    equity_curve = get_equity_snapshots(date)

    report = {
        "date": date,
        "summary": {
            "starting_equity": equity_curve[0],
            "ending_equity": equity_curve[-1],
            "net_pnl_usd": equity_curve[-1] - equity_curve[0],
            "net_pnl_pct": (equity_curve[-1] - equity_curve[0]) / equity_curve[0] * 100,
            "max_drawdown_pct": compute_max_dd(equity_curve),
            "total_trades": len(trades),
            "winning_trades": count_winners(trades),
            "losing_trades": count_losers(trades),
            "win_rate": count_winners(trades) / max(len(trades), 1),
            "total_commission": sum(t.commission for t in trades),
            "total_swap": sum(t.swap for t in trades),
            "total_slippage": sum(t.slippage_entry + t.slippage_exit for t in trades),
        },
        "by_asset": {
            asset: {
                "trades": len([t for t in trades if t.asset == asset]),
                "pnl": sum(t.pnl_net for t in trades if t.asset == asset),
                "win_rate": win_rate_for(trades, asset),
                "regime_dominant": dominant_regime(asset, date)
            }
            for asset in ["BTCUSD", "ETHUSD", "XAUUSD"]
        },
        "risk_events": get_risk_events(date),
        "allocation_changes": get_allocation_changes(date),
        "system_health": {
            "heartbeat_gaps": count_heartbeat_gaps(date),
            "signal_rejections": count_rejections(date),
            "avg_execution_time_ms": avg_execution_time(trades),
            "max_execution_time_ms": max_execution_time(trades),
        }
    }

    store_daily_report(report)
    send_daily_report_alert(report)
    return report
```

---

## 5. Monthly Performance Report

```python
def generate_monthly_report(year, month):
    daily_reports = get_daily_reports(year, month)
    all_trades = get_trades_for_month(year, month)

    report = {
        "period": f"{year}-{month:02d}",
        "summary": {
            "starting_equity": daily_reports[0]["summary"]["starting_equity"],
            "ending_equity": daily_reports[-1]["summary"]["ending_equity"],
            "net_return_pct": compute_monthly_return(daily_reports),
            "annualized_return_pct": compute_monthly_return(daily_reports) * 12,
            "max_drawdown_pct": max(r["summary"]["max_drawdown_pct"] for r in daily_reports),
            "sharpe_ratio": compute_sharpe(daily_reports),
            "sortino_ratio": compute_sortino(daily_reports),
            "calmar_ratio": abs(compute_monthly_return(daily_reports) * 12 /
                            max(max_dd, 0.01)),
            "total_trades": len(all_trades),
            "win_rate": count_winners(all_trades) / max(len(all_trades), 1),
            "profit_factor": compute_profit_factor(all_trades),
            "expectancy": compute_expectancy(all_trades),
            "avg_rr_achieved": mean(t.rr_achieved for t in all_trades),
        },
        "best_day": best_daily_return(daily_reports),
        "worst_day": worst_daily_return(daily_reports),
        "trading_days": len(daily_reports),
        "days_with_trades": len([r for r in daily_reports if r["summary"]["total_trades"] > 0]),
        "kill_switch_activations": count_kill_switches(year, month),
        "by_asset": {
            asset: compute_asset_monthly_stats(all_trades, asset)
            for asset in ["BTCUSD", "ETHUSD", "XAUUSD"]
        },
        "by_regime": {
            regime: compute_regime_stats(all_trades, regime)
            for regime in ["VOLATILE_EXPANSION", "TRENDING_UP", "TRENDING_DOWN"]
        },
        "allocation_evolution": get_allocation_history(year, month),
    }

    store_monthly_report(report)
    return report
```

---

## 6. Self-Improvement Metrics

These metrics feed the adaptive allocation and parameter tuning systems:

```python
def compute_self_improvement_inputs():
    """
    Computed weekly. Identifies systematic strengths and weaknesses.
    """
    trades_30d = get_closed_trades(days=30)

    analysis = {
        # Which entry triggers perform best?
        "trigger_performance": group_by_performance(trades_30d, key="m15_trigger_type"),

        # Which regimes are most profitable?
        "regime_performance": group_by_performance(trades_30d, key="regime_at_entry"),

        # Optimal hold duration (where is MFE typically reached?)
        "optimal_hold_duration": compute_optimal_hold(trades_30d),

        # Are stops too tight or too loose?
        "sl_analysis": {
            "pct_stopped_out": count_sl_exits(trades_30d) / max(len(trades_30d), 1),
            "avg_mae_vs_sl": mean(t.max_adverse_excursion / abs(t.entry_price - t.stop_loss_initial)
                                  for t in trades_30d),
            "recommendation": "tighter" if avg_mae_ratio < 0.4 else
                              "wider" if pct_stopped > 0.6 else "appropriate"
        },

        # Are TPs being reached or is price falling short?
        "tp_analysis": {
            "tp1_hit_rate": count_tp1_hits(trades_30d) / max(len(trades_30d), 1),
            "tp2_hit_rate": count_tp2_hits(trades_30d) / max(len(trades_30d), 1),
            "tp3_hit_rate": count_tp3_hits(trades_30d) / max(len(trades_30d), 1),
            "avg_mfe_vs_tp1": mean(t.max_favorable_excursion / abs(t.take_profit_target - t.entry_price)
                                   for t in trades_30d),
        },

        # Time-of-day performance
        "hourly_performance": group_by_performance(trades_30d,
                                key=lambda t: t.entry_time_utc.hour),

        # Day-of-week performance
        "dow_performance": group_by_performance(trades_30d,
                            key=lambda t: t.entry_time_utc.weekday()),
    }

    return analysis
```

### 6.1 Self-Improvement Guardrails

The self-improvement system can adjust:
- Allocation weights (within 10%-60% bounds)
- Entry signal minimum confidence thresholds (can only increase, not decrease)
- Time-of-day filters (can exclude underperforming hours)
- Regime filter sensitivity (can require stronger regime confirmation)

The self-improvement system **cannot** adjust:
- Per-trade risk percentage (hardcoded maximum)
- Stop-loss placement logic (ATR-based, not adjustable)
- Drawdown caps (hardcoded)
- Kill-switch thresholds (hardcoded)
- Maximum position counts (hardcoded)
- Minimum R:R requirement (1:2 floor)

This asymmetry ensures the system can become more selective and efficient
but cannot become more reckless.

---

## 7. Equity Curve Snapshots

```
Table: equity_snapshots
Recorded every 5 minutes.

Fields:
    id              SERIAL PRIMARY KEY
    timestamp_utc   TIMESTAMP
    balance         DECIMAL(14,2)
    equity          DECIMAL(14,2)
    floating_pnl    DECIMAL(12,2)
    margin_used     DECIMAL(12,2)
    open_positions  INTEGER
    daily_dd_pct    DECIMAL(5,2)
    monthly_dd_pct  DECIMAL(5,2)
    risk_state      VARCHAR(15)
```

This creates a high-resolution equity curve for backtesting comparison
and drawdown analysis.
