# Risk Engine Specification

---

## 1. Position Sizing Model

### 1.1 Core Formula

```
Position Size (lots) = (Equity × Risk%) / (SL_Distance_Points × Point_Value_Per_Lot)
```

Where:
- **Equity**: Current account equity (not balance — equity reflects unrealized P&L)
- **Risk%**: Per-trade risk allocation (base: 2.0%, range: 0.5% – 2.0%)
- **SL_Distance_Points**: Distance from entry to stop-loss in price points
- **Point_Value_Per_Lot**: Dollar value of one point movement per standard lot

### 1.2 Stop-Loss Distance Calculation

Stop-loss is always ATR-derived, never arbitrary:

```
SL_Distance = ATR(H1, 14) × SL_Multiplier

SL_Multiplier by asset:
    BTCUSD:  1.5 (crypto needs breathing room)
    ETHUSD:  1.5
    XAUUSD:  1.2 (gold is more structured)

Minimum SL distance (absolute floor):
    BTCUSD:  150 USD
    ETHUSD:  10 USD
    XAUUSD:  3.0 USD

Maximum SL distance (if exceeded, skip trade):
    BTCUSD:  1200 USD
    ETHUSD:  80 USD
    XAUUSD:  25 USD
```

If ATR-derived SL exceeds the maximum, the market is too volatile for controlled
entry — the signal is discarded. This prevents oversized stops that compress
position sizes to meaninglessness.

### 1.3 Volatility-Adjusted Risk Scaling

Base risk (2%) is further modulated by current volatility relative to its own
20-day average:

```
vol_ratio = ATR(H1, 14) / SMA(ATR(H1, 14), 20)

if vol_ratio > 2.0:
    adjusted_risk = base_risk × 0.50    # Extremely volatile — halve risk
elif vol_ratio > 1.5:
    adjusted_risk = base_risk × 0.75    # High volatility — reduce risk
elif vol_ratio > 1.0:
    adjusted_risk = base_risk × 1.00    # Normal volatility — full risk
elif vol_ratio > 0.6:
    adjusted_risk = base_risk × 0.75    # Low volatility — reduce (signals less reliable)
else:
    adjusted_risk = 0.00                 # Ultra-low volatility — no trading
```

This creates a volatility band where risk is maximized during *normal-to-slightly-
elevated* volatility and reduced at extremes in both directions.

### 1.4 Position Size Capping

```
Max lots per trade:
    BTCUSD:  5.0 lots (broker-dependent)
    ETHUSD:  50.0 lots
    XAUUSD:  10.0 lots

Max simultaneous positions per asset: 2
Max total simultaneous positions: 4

Max total portfolio risk (sum of all open position risks): 6%
```

If a new signal would push total portfolio risk beyond 6%, it is queued
(not discarded) and re-evaluated on next tick cycle. If still valid after
3 re-evaluation cycles and portfolio risk has not cleared, it is discarded.

---

## 2. Drawdown Protection

### 2.1 Daily Drawdown Guard

```
daily_start_equity = equity at 00:00 UTC (snapshot)
current_drawdown = (daily_start_equity - current_equity) / daily_start_equity

Thresholds:
    WARNING:     3% daily drawdown → Reduce risk to 1% per trade, alert
    SOFT_HALT:   4% daily drawdown → No new entries, manage existing only, alert
    HARD_HALT:   5% daily drawdown → Close all positions, no trading until next day, alert

Recovery:
    Next day at 00:00 UTC, if previous day ended in SOFT_HALT or HARD_HALT:
        → Resume with 50% risk for first 4 hours
        → If no further drawdown, restore full risk
        → If drawdown continues, remain at 50% risk for 24 hours
```

### 2.2 Monthly Drawdown Guard

```
monthly_start_equity = equity at 1st of month 00:00 UTC (snapshot)
monthly_drawdown = (monthly_start_equity - current_equity) / monthly_start_equity

Thresholds:
    WARNING:     6% monthly drawdown → Reduce risk to 1%, increase minimum R:R to 1:3
    SOFT_HALT:   8% monthly drawdown → No new entries until month-end, manage exits only
    HARD_HALT:   10% monthly drawdown → Close all, full halt until manual review + restart

Recovery after monthly SOFT_HALT:
    New month starts → Resume with 50% risk for first 5 trading days
    If profitable over those 5 days → Restore full risk
    If not → Remain at 50% for another 5 days
```

### 2.3 Consecutive Loss Guard

```
consecutive_losses = count of sequential losing trades (across all assets)

if consecutive_losses >= 3:
    risk_multiplier = 0.75     # Reduce to 75% of calculated risk
    alert("3 consecutive losses — reducing exposure")

if consecutive_losses >= 5:
    risk_multiplier = 0.50     # Reduce to 50%
    alert("5 consecutive losses — significant exposure reduction")
    mandatory_cooldown = 2 hours (no new entries)

if consecutive_losses >= 7:
    risk_multiplier = 0.00     # Full halt
    alert("7 consecutive losses — system halted for review")
    requires_manual_restart = True
```

### 2.4 Streak Reset

A single winning trade resets the consecutive loss counter to 0. However, risk
restoration is gradual:

```
After streak broken:
    First trade:  risk_multiplier = 0.75
    Second trade: risk_multiplier = 1.00
```

---

## 3. Correlation Risk Management

### 3.1 BTC-ETH Correlation

BTC and ETH are structurally correlated. Treating them as independent positions
underestimates true portfolio risk.

```
rolling_correlation = pearson_correlation(BTC_returns_H1, ETH_returns_H1, window=100)

if rolling_correlation > 0.85:
    # Highly correlated — treat as single exposure
    combined_risk_budget = single_asset_risk (2%)
    if BTC position open:
        ETH max risk = 2% - BTC_current_risk
    if both signals fire simultaneously:
        take the one with better R:R ratio

if rolling_correlation between 0.60 and 0.85:
    # Moderately correlated — partial overlap
    combined_risk_budget = 1.5 × single_asset_risk (3%)

if rolling_correlation < 0.60:
    # Decorrelated — treat as independent
    each asset gets full individual risk budget
```

### 3.2 XAU Inverse Correlation Check

Gold sometimes inversely correlates with crypto during risk-off events:

```
btc_xau_correlation = pearson_correlation(BTC_returns_H4, XAU_returns_H4, window=50)

if btc_xau_correlation < -0.50:
    # Gold is hedging crypto — allow full independent allocation
    # This is a favorable diversification state
    log("Favorable hedge state detected")
```

---

## 4. Risk State Machine

```
                  ┌──────────┐
                  │  NORMAL  │
                  │ Risk=100%│
                  └────┬─────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ CAUTION  │ │ REDUCED  │ │ ELEVATED │
   │ Risk=75% │ │ Risk=50% │ │ Risk=125%│
   │ (streak) │ │ (dd/vol) │ │ (hot str)│
   └────┬─────┘ └────┬─────┘ └────┬─────┘
        │             │             │
        ▼             ▼             │
   ┌──────────┐ ┌──────────┐       │
   │ HALTED   │ │ CRITICAL │       │
   │ Risk=0%  │ │ Risk=25% │       │
   │ (manual) │ │ (dd cap) │       │
   └──────────┘ └──────────┘       │
                                   │
                           ┌───────┘
                           ▼
                    ┌──────────┐
                    │  NORMAL  │◄── returns after
                    │ Risk=100%│    recovery window
                    └──────────┘
```

**Note on ELEVATED state:** Only available after 5+ consecutive wins AND positive
monthly P&L AND below 50% of monthly drawdown cap. Maximum elevation: 125% of base
risk (i.e., 2.5% per trade). Reverts to NORMAL after first loss.

---

## 5. Pre-Trade Risk Checklist

Before any signal is dispatched, every item must pass:

```
□ Stop-loss is defined and within min/max bounds
□ Risk per trade ≤ adjusted_risk_percentage
□ Total portfolio risk with new position ≤ 6%
□ Daily drawdown is below SOFT_HALT threshold
□ Monthly drawdown is below SOFT_HALT threshold
□ Consecutive loss count is below halt threshold
□ Asset does not already have max concurrent positions
□ Total positions do not exceed 4
□ Correlation budget allows this asset
□ Minimum R:R ratio ≥ 1:2 (or 1:3 under monthly warning)
□ Current regime is not RANGING for this asset
□ Spread is within acceptable bounds (< 2× typical)
□ Heartbeat from EA confirmed within last 30 seconds
□ No pending kill-switch conditions
```

If any item fails, the signal is rejected with the specific reason logged.
