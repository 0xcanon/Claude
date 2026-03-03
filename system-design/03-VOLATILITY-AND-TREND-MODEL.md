# Volatility & Trend Detection Model

## 1. Multi-Timeframe Analysis Framework

The system operates on a **top-down timeframe cascade**. Higher timeframes establish direction and context; lower timeframes provide entry precision.

```
┌─────────────────────────────────────────────────┐
│  DAILY (1D) — Strategic Context                  │
│  Purpose: Identify dominant trend direction       │
│  Indicators: 50 EMA, 200 EMA, ADX(14)           │
│  Update: Once per day                            │
├─────────────────────────────────────────────────┤
│  4-HOUR (4H) — Tactical Direction                │
│  Purpose: Confirm trend, identify regime          │
│  Indicators: 21 EMA, 50 EMA, ATR(14), BBW       │
│  Update: Every 4 hours                           │
├─────────────────────────────────────────────────┤
│  1-HOUR (1H) — Operational Timing                │
│  Purpose: Entry zone identification               │
│  Indicators: 9 EMA, 21 EMA, RSI(14), MACD       │
│  Update: Every hour                              │
├─────────────────────────────────────────────────┤
│  15-MINUTE (15m) — Entry Execution               │
│  Purpose: Precise entry trigger                   │
│  Indicators: 9 EMA, Supertrend(10,3), Vol Spike  │
│  Update: Every 15 minutes                        │
├─────────────────────────────────────────────────┤
│  5-MINUTE (5m) — Optional Micro-Timing           │
│  Purpose: Reduce entry slippage                   │
│  Indicators: Price action, order flow proxy       │
│  Update: Every 5 minutes (only during entry)     │
└─────────────────────────────────────────────────┘
```

### 1.1 Multi-TF Alignment Scoring

```python
def compute_mtf_alignment(asset: str) -> dict:
    """
    Returns alignment score and breakdown.
    Score range: -1.0 (fully bearish aligned) to +1.0 (fully bullish aligned)
    """
    scores = {}

    # Daily: Weight 0.30
    daily_trend = classify_trend_daily(asset)  # BULLISH, BEARISH, NEUTRAL
    scores["1D"] = {"direction": daily_trend, "weight": 0.30}

    # 4H: Weight 0.30
    h4_trend = classify_trend_4h(asset)
    scores["4H"] = {"direction": h4_trend, "weight": 0.30}

    # 1H: Weight 0.25
    h1_trend = classify_trend_1h(asset)
    scores["1H"] = {"direction": h1_trend, "weight": 0.25}

    # 15m: Weight 0.15
    m15_trend = classify_trend_15m(asset)
    scores["15m"] = {"direction": m15_trend, "weight": 0.15}

    # Compute weighted alignment score
    direction_values = {"BULLISH": 1.0, "BEARISH": -1.0, "NEUTRAL": 0.0}
    alignment_score = sum(
        direction_values[tf["direction"]] * tf["weight"]
        for tf in scores.values()
    )

    # Alignment quality
    all_directions = [tf["direction"] for tf in scores.values()]
    if all(d == all_directions[0] for d in all_directions) and all_directions[0] != "NEUTRAL":
        alignment_quality = "PERFECT"
    elif all_directions.count(all_directions[0]) >= 3:
        alignment_quality = "STRONG"
    else:
        alignment_quality = "WEAK"

    return {
        "score": alignment_score,
        "quality": alignment_quality,
        "breakdown": scores,
        "tradeable": abs(alignment_score) >= 0.60 and alignment_quality != "WEAK"
    }
```

---

## 2. Trend Classification Per Timeframe

### 2.1 Daily Trend

```python
def classify_trend_daily(asset: str) -> str:
    close = get_close(asset, "1D")
    ema_50 = EMA(close, 50)
    ema_200 = EMA(close, 200)
    adx = ADX(asset, "1D", 14)

    price_above_50 = close[-1] > ema_50[-1]
    price_above_200 = close[-1] > ema_200[-1]
    ema_50_above_200 = ema_50[-1] > ema_200[-1]
    trend_strength = adx[-1]

    if price_above_50 and price_above_200 and ema_50_above_200 and trend_strength > 20:
        return "BULLISH"
    elif not price_above_50 and not price_above_200 and not ema_50_above_200 and trend_strength > 20:
        return "BEARISH"
    else:
        return "NEUTRAL"
```

### 2.2 4-Hour Trend

```python
def classify_trend_4h(asset: str) -> str:
    close = get_close(asset, "4H")
    ema_21 = EMA(close, 21)
    ema_50 = EMA(close, 50)
    adx = ADX(asset, "4H", 14)

    # Trend direction
    ema_cross_bullish = ema_21[-1] > ema_50[-1]
    price_above_ema21 = close[-1] > ema_21[-1]
    adx_trending = adx[-1] > 20

    # Trend momentum: Are EMAs diverging?
    ema_spread = abs(ema_21[-1] - ema_50[-1])
    ema_spread_expanding = ema_spread > EMA([abs(ema_21[i] - ema_50[i]) for i in range(-10, 0)], 5)[-1]

    if ema_cross_bullish and price_above_ema21 and adx_trending:
        return "BULLISH"
    elif not ema_cross_bullish and not price_above_ema21 and adx_trending:
        return "BEARISH"
    else:
        return "NEUTRAL"
```

### 2.3 1-Hour and 15-Minute (Similar structure with faster indicators)

```python
def classify_trend_1h(asset: str) -> str:
    close = get_close(asset, "1H")
    ema_9 = EMA(close, 9)
    ema_21 = EMA(close, 21)
    macd_line, signal_line, histogram = MACD(close, 12, 26, 9)

    bullish = ema_9[-1] > ema_21[-1] and macd_line[-1] > signal_line[-1] and histogram[-1] > 0
    bearish = ema_9[-1] < ema_21[-1] and macd_line[-1] < signal_line[-1] and histogram[-1] < 0

    if bullish:
        return "BULLISH"
    elif bearish:
        return "BEARISH"
    return "NEUTRAL"

def classify_trend_15m(asset: str) -> str:
    close = get_close(asset, "15m")
    supertrend_dir = Supertrend(asset, "15m", period=10, multiplier=3.0)
    ema_9 = EMA(close, 9)

    if supertrend_dir[-1] == "UP" and close[-1] > ema_9[-1]:
        return "BULLISH"
    elif supertrend_dir[-1] == "DOWN" and close[-1] < ema_9[-1]:
        return "BEARISH"
    return "NEUTRAL"
```

---

## 3. Regime Detection Engine

The regime detector classifies the current market state for each asset independently.

### 3.1 Regime Categories

| Regime | Description | Trading Action |
|---|---|---|
| TRENDING_STRONG | Clear directional move, ADX > 30, vol expanding | Full trade |
| TRENDING_WEAK | Directional but losing momentum, ADX 20-30 | Reduced size |
| VOLATILE_EXPANSION | Sudden vol spike with direction | Full trade |
| VOLATILE_CHAOTIC | High vol but no clear direction | Careful/small |
| RANGING | Low ADX, price between levels, BB squeeze | NO TRADE |
| LOW_VOLATILITY | ATR percentile < 20, BB width compressed | Minimal/wait |

### 3.2 Regime Classification Algorithm

```python
def classify_regime(asset: str) -> dict:
    # Gather features
    atr_14 = ATR(asset, "1H", 14)
    atr_current = atr_14[-1]
    atr_percentile = percentile_rank(atr_14, lookback=100)

    adx_14 = ADX(asset, "1H", 14)
    adx_current = adx_14[-1]

    bb_width = BollingerBandWidth(asset, "1H", 20, 2.0)
    bb_width_current = bb_width[-1]
    bb_width_percentile = percentile_rank(bb_width, lookback=100)

    # Volatility state
    vol_expanding = atr_percentile > 60 and atr_current > atr_14[-2]
    vol_contracting = atr_percentile < 30
    vol_spike = atr_current > atr_14[-2] * 1.5  # 50%+ ATR jump

    # Trend state
    trending = adx_current > 25
    strong_trend = adx_current > 30
    no_trend = adx_current < 20

    # Range detection
    bb_squeeze = bb_width_percentile < 20
    price_oscillating = detect_oscillation(asset, "1H", lookback=20)

    # Classification logic
    if strong_trend and vol_expanding:
        regime = "TRENDING_STRONG"
        confidence = min(0.95, (adx_current - 25) / 30 + atr_percentile / 200)
    elif trending and not vol_contracting:
        regime = "TRENDING_WEAK"
        confidence = min(0.80, adx_current / 50)
    elif vol_spike and trending:
        regime = "VOLATILE_EXPANSION"
        confidence = min(0.90, atr_percentile / 100)
    elif vol_spike and not trending:
        regime = "VOLATILE_CHAOTIC"
        confidence = 0.70
    elif no_trend and (bb_squeeze or price_oscillating):
        regime = "RANGING"
        confidence = min(0.85, 1.0 - adx_current / 40)
    elif vol_contracting and no_trend:
        regime = "LOW_VOLATILITY"
        confidence = min(0.85, 1.0 - atr_percentile / 50)
    else:
        regime = "TRENDING_WEAK"  # Default conservative
        confidence = 0.50

    return {
        "regime": regime,
        "confidence": confidence,
        "features": {
            "atr_current": atr_current,
            "atr_percentile": atr_percentile,
            "adx_current": adx_current,
            "bb_width_percentile": bb_width_percentile,
            "vol_expanding": vol_expanding,
            "vol_spike": vol_spike
        }
    }

def detect_oscillation(asset: str, timeframe: str, lookback: int) -> bool:
    """
    Detect if price is oscillating between levels (ranging).
    Uses zero-crossing rate of detrended price.
    """
    close = get_close(asset, timeframe, lookback)
    detrended = close - EMA(close, lookback // 2)
    zero_crossings = sum(1 for i in range(1, len(detrended))
                         if detrended[i] * detrended[i-1] < 0)
    # High crossing rate = oscillation = ranging
    crossing_rate = zero_crossings / lookback
    return crossing_rate > 0.25  # More than 25% of bars cross zero
```

---

## 4. Volatility Expansion Detection

This is the **primary trade filter**. We only trade when volatility is expanding.

### 4.1 Multi-Signal Volatility Expansion Confirmation

```python
def is_volatility_expanding(asset: str) -> dict:
    """
    Returns True only if multiple volatility measures confirm expansion.
    Requires at least 3 of 5 confirmations.
    """
    confirmations = 0
    details = {}

    # 1. ATR Expansion
    atr = ATR(asset, "1H", 14)
    atr_expanding = atr[-1] > atr[-2] > atr[-3]
    if atr_expanding:
        confirmations += 1
    details["atr_expanding"] = atr_expanding

    # 2. ATR Percentile
    atr_pct = percentile_rank(atr, 100)
    atr_above_median = atr_pct > 50
    if atr_above_median:
        confirmations += 1
    details["atr_above_median"] = atr_above_median

    # 3. Bollinger Band Width Expansion
    bb_width = BollingerBandWidth(asset, "1H", 20, 2.0)
    bb_expanding = bb_width[-1] > bb_width[-2] and bb_width[-1] > bb_width[-5]
    if bb_expanding:
        confirmations += 1
    details["bb_expanding"] = bb_expanding

    # 4. Candle Range Expansion
    high = get_high(asset, "1H")
    low = get_low(asset, "1H")
    candle_range = [high[i] - low[i] for i in range(-5, 0)]
    avg_range = sum(candle_range[:-1]) / len(candle_range[:-1])
    range_expanding = candle_range[-1] > avg_range * 1.3
    if range_expanding:
        confirmations += 1
    details["range_expanding"] = range_expanding

    # 5. Volume Surge (where available)
    volume = get_volume(asset, "1H")
    if volume is not None:
        vol_avg = SMA(volume, 20)[-1]
        volume_surge = volume[-1] > vol_avg * 1.5
        if volume_surge:
            confirmations += 1
        details["volume_surge"] = volume_surge
    else:
        # For assets without reliable volume, lower threshold
        details["volume_surge"] = None

    is_expanding = confirmations >= 3
    details["confirmations"] = confirmations
    details["is_expanding"] = is_expanding

    return details
```

### 4.2 Volatility Expansion Entry Timing

```
We don't just trade because volatility expanded.
We trade the BEGINNING of the expansion, not the middle or end.

Timing criteria:
1. Volatility was LOW or CONTRACTING in the previous period
2. Volatility is NOW expanding (confirmed by multi-signal)
3. A directional breakout has occurred (price broke out of range/squeeze)

This captures the "volatility breakout" — the most profitable pattern.

AVOID:
- Entering after volatility has been high for multiple periods (late entry)
- Entering during volatility contraction (wrong timing)
- Entering during chaotic volatility without direction (whipsaw risk)
```

```python
def is_vol_expansion_entry_window(asset: str) -> bool:
    """
    Determines if we are in the early phase of a volatility expansion.
    This is the optimal entry window.
    """
    regime_history = get_regime_history(asset, lookback=6)  # Last 6 periods (30min at 5min intervals)

    # Previous regime should have been LOW_VOL or RANGING
    recent_low_vol = any(
        r["regime"] in ("LOW_VOLATILITY", "RANGING")
        for r in regime_history[-6:-1]
    )

    # Current regime should be expansion
    current = regime_history[-1]
    currently_expanding = current["regime"] in ("TRENDING_STRONG", "VOLATILE_EXPANSION")

    # Duration of current expansion
    expansion_duration = 0
    for r in reversed(regime_history):
        if r["regime"] in ("TRENDING_STRONG", "VOLATILE_EXPANSION"):
            expansion_duration += 1
        else:
            break

    # Early expansion: less than 4 periods into the move
    early_expansion = expansion_duration <= 4

    return recent_low_vol and currently_expanding and early_expansion
```

---

## 5. Range Detection and Avoidance

### 5.1 Range Detection Methods

```python
def is_ranging(asset: str, timeframe: str) -> dict:
    """
    Multi-method range detection. Requires 2 of 3 confirmations.
    """
    confirmations = 0

    # Method 1: ADX below threshold
    adx = ADX(asset, timeframe, 14)
    low_adx = adx[-1] < 20
    if low_adx:
        confirmations += 1

    # Method 2: Bollinger Band Squeeze
    bb_width = BollingerBandWidth(asset, timeframe, 20, 2.0)
    bb_pct = percentile_rank(bb_width, 100)
    squeezed = bb_pct < 25
    if squeezed:
        confirmations += 1

    # Method 3: Price contained within recent range
    high = max(get_high(asset, timeframe, 20))
    low = min(get_low(asset, timeframe, 20))
    current = get_close(asset, timeframe)[-1]
    range_size = high - low
    price_in_middle = low + range_size * 0.25 < current < high - range_size * 0.25
    if price_in_middle and range_size < ATR(asset, timeframe, 14)[-1] * 5:
        confirmations += 1

    is_range = confirmations >= 2

    return {
        "is_ranging": is_range,
        "confirmations": confirmations,
        "adx": adx[-1],
        "bb_percentile": bb_pct,
        "range_bound": price_in_middle
    }
```

### 5.2 Handling Range-to-Trend Transitions

```
When a range breaks:
1. Wait for the FIRST candle close outside the range on the entry timeframe (15m)
2. Confirm the breakout direction aligns with higher TFs
3. Confirm volatility is expanding (BB width increasing)
4. The breakout candle range should be > 1.5x average candle range
5. Enter on pullback to the breakout level (if it occurs within 3 candles)
   OR enter on momentum continuation if no pullback

FALSE BREAKOUT PROTECTION:
- Require the close to be outside the range, not just the wick
- Require at least 2 consecutive candles closing outside the range for confirmation
- If price re-enters the range within 2 candles → no trade (false breakout)
```

---

## 6. Entry Signal Generation

### 6.1 Master Entry Criteria (ALL must be true)

```python
def generate_entry_signal(asset: str) -> Optional[Signal]:
    # Step 1: Regime check
    regime = classify_regime(asset)
    if regime["regime"] in ("RANGING", "LOW_VOLATILITY"):
        return None  # No trade in these regimes

    # Step 2: MTF alignment check
    alignment = compute_mtf_alignment(asset)
    if not alignment["tradeable"]:
        return None  # Not enough alignment

    # Step 3: Volatility expansion check
    vol_state = is_volatility_expanding(asset)
    if not vol_state["is_expanding"]:
        return None  # Volatility not expanding

    # Step 4: Optimal entry window
    if not is_vol_expansion_entry_window(asset):
        return None  # Too late in the move

    # Step 5: Range avoidance
    if is_ranging(asset, "1H")["is_ranging"]:
        return None  # Still ranging on operational TF

    # Step 6: Determine direction
    direction = "LONG" if alignment["score"] > 0 else "SHORT"

    # Step 7: Compute entry, SL, TP
    entry = get_current_price(asset)
    sl = compute_stop_loss(asset, direction)
    tp1 = compute_take_profit(asset, direction, entry, sl, rr_ratio=2.0)
    tp2 = compute_take_profit(asset, direction, entry, sl, rr_ratio=3.0)

    # Step 8: Validate R:R
    rr = abs(tp1 - entry) / abs(entry - sl)
    if rr < 2.0:
        return None  # R:R too low

    # Step 9: Compute signal score
    score = compute_signal_score(regime, alignment, vol_state)
    if score < 0.65:
        return None  # Signal quality too low

    # Step 10: Pass through risk engine
    lot_size = risk_engine.compute_position_size(asset, entry, sl, direction)
    if lot_size == 0:
        return None  # Risk engine rejected

    return Signal(
        asset=asset,
        direction=direction,
        entry=entry,
        sl=sl,
        tp1=tp1,
        tp2=tp2,
        lot_size=lot_size,
        score=score,
        regime=regime,
        alignment=alignment
    )
```

### 6.2 Signal Scoring

```python
def compute_signal_score(regime, alignment, vol_state) -> float:
    """
    Composite score from 0.0 to 1.0.
    Higher score = higher confidence entry.
    """
    score = 0.0

    # Regime quality (0-0.30)
    regime_scores = {
        "TRENDING_STRONG": 0.30,
        "VOLATILE_EXPANSION": 0.28,
        "TRENDING_WEAK": 0.15,
        "VOLATILE_CHAOTIC": 0.10,
    }
    score += regime_scores.get(regime["regime"], 0.0)

    # MTF alignment quality (0-0.35)
    alignment_scores = {
        "PERFECT": 0.35,
        "STRONG": 0.25,
        "WEAK": 0.05,
    }
    score += alignment_scores.get(alignment["quality"], 0.0)

    # Volatility expansion strength (0-0.20)
    vol_confirmations = vol_state["confirmations"]
    score += min(0.20, vol_confirmations * 0.05)

    # Regime confidence bonus (0-0.15)
    score += regime["confidence"] * 0.15

    return min(1.0, score)
```
