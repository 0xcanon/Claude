# Volatility & Trend Detection Model

---

## 1. Regime Classification Framework

The system classifies each asset into one of six market regimes. Regime
determines whether signals are generated, how risk is sized, and which
filters are applied.

### 1.1 Regime Definitions

| Regime | Definition | Trading Action |
|--------|------------|----------------|
| `TRENDING_UP` | Strong directional bias upward with sustained momentum | Trade longs only |
| `TRENDING_DOWN` | Strong directional bias downward with sustained momentum | Trade shorts only |
| `VOLATILE_EXPANSION` | Increasing volatility with directional bias emerging | Primary trading regime — highest conviction |
| `VOLATILE_CONTRACTION` | Decreasing volatility, compression phase | No trading — wait for expansion |
| `RANGING` | No directional bias, mean-reverting price action | No trading — filter out |
| `UNKNOWN` | Insufficient data or conflicting signals | No trading — wait for clarity |

### 1.2 Regime Detection Algorithm

```python
def classify_regime(asset, timeframe="H1"):
    # Indicators
    adx = ADX(asset, timeframe, period=14)
    atr = ATR(asset, timeframe, period=14)
    atr_sma = SMA(atr, period=20)
    bb_width = BollingerBandWidth(asset, timeframe, period=20, std=2.0)
    bb_width_percentile = percentile_rank(bb_width, lookback=100)
    ema_20 = EMA(asset, timeframe, period=20)
    ema_50 = EMA(asset, timeframe, period=50)
    price = close(asset, timeframe)

    # Derived
    vol_ratio = atr / atr_sma
    trend_slope = linear_regression_slope(price, period=20)
    trend_slope_normalized = trend_slope / atr  # Normalize by volatility

    # Higher Highs / Lower Lows structure
    hh_hl = is_higher_highs_higher_lows(asset, timeframe, lookback=20)
    ll_lh = is_lower_lows_lower_highs(asset, timeframe, lookback=20)

    # Classification logic
    if adx < 20 and bb_width_percentile < 30:
        return "RANGING"

    if adx < 20 and bb_width_percentile < 15:
        return "VOLATILE_CONTRACTION"

    if vol_ratio > 1.3 and bb_width_percentile > 60:
        if adx > 25 and abs(trend_slope_normalized) > 0.5:
            if trend_slope_normalized > 0 and hh_hl:
                return "VOLATILE_EXPANSION"  # With bullish bias
            elif trend_slope_normalized < 0 and ll_lh:
                return "VOLATILE_EXPANSION"  # With bearish bias
            else:
                return "VOLATILE_EXPANSION"  # Direction ambiguous
        else:
            return "VOLATILE_EXPANSION"  # Pure vol expansion, direction TBD

    if adx > 25:
        if ema_20 > ema_50 and price > ema_20 and hh_hl:
            return "TRENDING_UP"
        elif ema_20 < ema_50 and price < ema_20 and ll_lh:
            return "TRENDING_DOWN"

    return "UNKNOWN"
```

---

## 2. Multi-Timeframe Alignment

### 2.1 Timeframe Confluence Scoring

Each timeframe contributes a weighted score to the overall directional bias:

```python
def compute_mtf_alignment(asset):
    weights = {
        "D1":  0.10,   # Macro context — light weight to avoid lag
        "H4":  0.25,   # Intermediate trend — significant weight
        "H1":  0.35,   # Primary trading timeframe — heaviest weight
        "M15": 0.30,   # Entry timing — significant for precision
    }

    scores = {}
    for tf, weight in weights.items():
        bias = compute_bias(asset, tf)  # Returns -1.0 to +1.0
        regime = classify_regime(asset, tf)
        scores[tf] = {
            "bias": bias,
            "regime": regime,
            "weighted_bias": bias * weight
        }

    total_bias = sum(s["weighted_bias"] for s in scores.values())

    # Alignment quality: how much do timeframes agree?
    biases = [s["bias"] for s in scores.values()]
    all_positive = all(b > 0 for b in biases)
    all_negative = all(b < 0 for b in biases)
    alignment_quality = "STRONG" if (all_positive or all_negative) else "MIXED"

    return {
        "total_bias": total_bias,           # -1.0 to +1.0
        "alignment_quality": alignment_quality,
        "direction": "LONG" if total_bias > 0 else "SHORT",
        "details": scores
    }
```

### 2.2 Bias Computation Per Timeframe

```python
def compute_bias(asset, timeframe):
    """Returns directional bias from -1.0 (strong short) to +1.0 (strong long)"""

    ema_fast = EMA(asset, timeframe, period=9)
    ema_mid = EMA(asset, timeframe, period=21)
    ema_slow = EMA(asset, timeframe, period=50)
    price = close(asset, timeframe)
    rsi = RSI(asset, timeframe, period=14)
    macd_hist = MACD_Histogram(asset, timeframe, fast=12, slow=26, signal=9)

    score = 0.0

    # EMA stack (0 to ±0.4)
    if ema_fast > ema_mid > ema_slow:
        score += 0.4
    elif ema_fast < ema_mid < ema_slow:
        score -= 0.4
    elif ema_fast > ema_mid:
        score += 0.15
    elif ema_fast < ema_mid:
        score -= 0.15

    # Price relative to EMAs (0 to ±0.25)
    if price > ema_fast > ema_slow:
        score += 0.25
    elif price < ema_fast < ema_slow:
        score -= 0.25
    elif price > ema_mid:
        score += 0.1
    elif price < ema_mid:
        score -= 0.1

    # RSI bias (0 to ±0.15)
    if rsi > 60:
        score += 0.15 * min((rsi - 50) / 30, 1.0)
    elif rsi < 40:
        score -= 0.15 * min((50 - rsi) / 30, 1.0)

    # MACD histogram direction (0 to ±0.2)
    if macd_hist > 0:
        score += 0.2
    elif macd_hist < 0:
        score -= 0.2

    return max(-1.0, min(1.0, score))
```

### 2.3 Entry Veto Conditions

Even with positive alignment, the following conditions veto entry:

```python
def check_vetos(asset, mtf_result):
    vetos = []

    # H1 or H4 in RANGING regime
    for tf in ["H1", "H4"]:
        if mtf_result["details"][tf]["regime"] == "RANGING":
            vetos.append(f"{tf} is RANGING — no signals")

    # Weak total bias (below threshold)
    if abs(mtf_result["total_bias"]) < 0.30:
        vetos.append(f"Total bias too weak: {mtf_result['total_bias']:.2f}")

    # Mixed alignment
    if mtf_result["alignment_quality"] == "MIXED":
        # Allow if total_bias is strong enough
        if abs(mtf_result["total_bias"]) < 0.50:
            vetos.append("Mixed alignment with insufficient bias")

    # D1 opposing signal direction
    d1_bias = mtf_result["details"]["D1"]["bias"]
    signal_direction = 1 if mtf_result["direction"] == "LONG" else -1
    if d1_bias * signal_direction < -0.3:
        vetos.append(f"D1 strongly opposes signal direction")

    return vetos
```

---

## 3. Volatility Expansion Detection

### 3.1 Bollinger Band Squeeze Detection

```python
def detect_squeeze(asset, timeframe="H1"):
    """
    Detect Bollinger Band squeeze (volatility contraction)
    followed by expansion (breakout).
    """
    bb_width = BollingerBandWidth(asset, timeframe, period=20, std=2.0)
    bb_width_history = get_series(bb_width, lookback=50)

    # Current width percentile over last 100 bars
    current_percentile = percentile_rank(bb_width, lookback=100)

    # Was in squeeze (bottom 20th percentile) within last 10 bars?
    recent_min_percentile = min(
        percentile_rank(bb_width_history[i], lookback=100)
        for i in range(-10, 0)
    )
    was_squeezed = recent_min_percentile < 20

    # Is now expanding?
    is_expanding = current_percentile > recent_min_percentile + 15

    # Expansion velocity
    expansion_rate = (bb_width_history[-1] - bb_width_history[-5]) / bb_width_history[-5]

    return {
        "was_squeezed": was_squeezed,
        "is_expanding": is_expanding,
        "current_percentile": current_percentile,
        "expansion_rate": expansion_rate,
        "squeeze_to_expansion": was_squeezed and is_expanding
    }
```

### 3.2 ATR Breakout Detection

```python
def detect_atr_breakout(asset, timeframe="H1"):
    """
    Detect when current ATR breaks above its moving average,
    indicating volatility regime shift.
    """
    atr = ATR(asset, timeframe, period=14)
    atr_sma = SMA(atr, period=20)
    atr_std = STDDEV(atr, period=20)

    vol_ratio = atr / atr_sma
    vol_zscore = (atr - atr_sma) / atr_std

    return {
        "vol_ratio": vol_ratio,
        "vol_zscore": vol_zscore,
        "is_expanding": vol_ratio > 1.2,
        "is_explosive": vol_zscore > 2.0,
        "is_contracting": vol_ratio < 0.7
    }
```

### 3.3 Combined Volatility Score

```python
def compute_volatility_score(asset, timeframe="H1"):
    squeeze = detect_squeeze(asset, timeframe)
    atr_break = detect_atr_breakout(asset, timeframe)

    score = 0  # 0 to 100

    if squeeze["squeeze_to_expansion"]:
        score += 40  # High-value: post-squeeze expansion
    elif squeeze["is_expanding"]:
        score += 20

    if atr_break["is_expanding"]:
        score += 25
    if atr_break["is_explosive"]:
        score += 15

    if squeeze["expansion_rate"] > 0.20:
        score += 10  # Rapid expansion

    # Penalty for already-extended volatility
    if squeeze["current_percentile"] > 90:
        score -= 20  # Volatility may be peaking

    return {
        "score": max(0, min(100, score)),
        "tradeable": score >= 40,  # Minimum threshold
        "squeeze": squeeze,
        "atr": atr_break
    }
```

---

## 4. Trend Detection Model

### 4.1 Price Structure Analysis

```python
def analyze_structure(asset, timeframe, lookback=50):
    """
    Identify swing highs and swing lows to determine market structure.
    Uses zigzag with minimum swing size = 0.5 × ATR(14).
    """
    atr = ATR(asset, timeframe, period=14)
    min_swing = atr * 0.5

    swings = zigzag(asset, timeframe, min_swing, lookback)

    # Classify structure
    highs = [s for s in swings if s.type == "HIGH"]
    lows = [s for s in swings if s.type == "LOW"]

    if len(highs) >= 2 and len(lows) >= 2:
        hh = highs[-1].price > highs[-2].price  # Higher high
        hl = lows[-1].price > lows[-2].price     # Higher low
        lh = highs[-1].price < highs[-2].price   # Lower high
        ll = lows[-1].price < lows[-2].price     # Lower low

        if hh and hl:
            structure = "BULLISH"
        elif ll and lh:
            structure = "BEARISH"
        elif hh and ll:
            structure = "EXPANDING"  # Widening range
        elif lh and hl:
            structure = "CONTRACTING"  # Narrowing range
        else:
            structure = "MIXED"
    else:
        structure = "INSUFFICIENT_DATA"

    return {
        "structure": structure,
        "last_swing_high": highs[-1] if highs else None,
        "last_swing_low": lows[-1] if lows else None,
        "swing_count": len(swings)
    }
```

### 4.2 ADX Trend Strength

```python
def assess_trend_strength(asset, timeframe):
    adx = ADX(asset, timeframe, period=14)
    plus_di = PlusDI(asset, timeframe, period=14)
    minus_di = MinusDI(asset, timeframe, period=14)

    # ADX value interpretation
    if adx < 15:
        strength = "ABSENT"
    elif adx < 20:
        strength = "WEAK"
    elif adx < 30:
        strength = "MODERATE"
    elif adx < 45:
        strength = "STRONG"
    else:
        strength = "EXTREME"

    # ADX direction (is trend strengthening?)
    adx_slope = adx - ADX(asset, timeframe, period=14, shift=3)
    adx_rising = adx_slope > 0

    # Directional bias from DI
    di_diff = plus_di - minus_di
    if di_diff > 5:
        di_bias = "BULLISH"
    elif di_diff < -5:
        di_bias = "BEARISH"
    else:
        di_bias = "NEUTRAL"

    return {
        "adx": adx,
        "strength": strength,
        "adx_rising": adx_rising,
        "di_bias": di_bias,
        "plus_di": plus_di,
        "minus_di": minus_di,
        "tradeable": strength in ["MODERATE", "STRONG", "EXTREME"] and adx_rising
    }
```

---

## 5. Entry Signal Generation

### 5.1 Signal Requirements Matrix

| Condition | Required | Source |
|-----------|----------|--------|
| Regime = VOLATILE_EXPANSION or TRENDING_* | Yes | `classify_regime()` |
| Volatility score ≥ 40 | Yes | `compute_volatility_score()` |
| MTF alignment ≥ 0.30 absolute bias | Yes | `compute_mtf_alignment()` |
| No veto conditions | Yes | `check_vetos()` |
| ADX strength MODERATE+ and rising | Yes | `assess_trend_strength()` |
| Price structure BULLISH (for longs) or BEARISH (for shorts) | Yes | `analyze_structure()` |
| R:R ≥ 1:2 | Yes | Computed from SL and TP |
| All risk checks pass | Yes | Risk Engine |

### 5.2 Entry Trigger Types

```python
def detect_entry_trigger(asset, direction):
    """
    Specific entry trigger on M15 timeframe after all higher-TF
    conditions are met.
    """
    triggers = []

    # 1. Breakout above/below key level
    key_levels = compute_key_levels(asset, "H1")
    price = close(asset, "M15")
    prev_price = close(asset, "M15", shift=1)

    if direction == "LONG":
        for level in key_levels["resistance"]:
            if prev_price < level and price > level:
                triggers.append({
                    "type": "BREAKOUT_ABOVE_RESISTANCE",
                    "level": level,
                    "confidence": 0.8
                })
    elif direction == "SHORT":
        for level in key_levels["support"]:
            if prev_price > level and price < level:
                triggers.append({
                    "type": "BREAKOUT_BELOW_SUPPORT",
                    "level": level,
                    "confidence": 0.8
                })

    # 2. EMA crossover on M15
    ema9 = EMA(asset, "M15", period=9)
    ema21 = EMA(asset, "M15", period=21)
    prev_ema9 = EMA(asset, "M15", period=9, shift=1)
    prev_ema21 = EMA(asset, "M15", period=21, shift=1)

    if direction == "LONG" and prev_ema9 <= prev_ema21 and ema9 > ema21:
        triggers.append({"type": "EMA_CROSS_BULLISH", "confidence": 0.6})
    elif direction == "SHORT" and prev_ema9 >= prev_ema21 and ema9 < ema21:
        triggers.append({"type": "EMA_CROSS_BEARISH", "confidence": 0.6})

    # 3. Momentum candle (large body candle in trend direction)
    candle = get_candle(asset, "M15")
    body_ratio = abs(candle.close - candle.open) / (candle.high - candle.low + 0.0001)
    body_size = abs(candle.close - candle.open)
    avg_body = SMA(body_sizes(asset, "M15", 20), period=20)

    if body_ratio > 0.65 and body_size > avg_body * 1.5:
        if direction == "LONG" and candle.close > candle.open:
            triggers.append({"type": "MOMENTUM_CANDLE_BULLISH", "confidence": 0.7})
        elif direction == "SHORT" and candle.close < candle.open:
            triggers.append({"type": "MOMENTUM_CANDLE_BEARISH", "confidence": 0.7})

    return triggers
```

---

## 6. Take-Profit Structure

### 6.1 Multi-Level TP with Partial Closes

```python
def compute_take_profits(entry, sl, direction, asset):
    sl_distance = abs(entry - sl)

    if direction == "LONG":
        tp1 = entry + sl_distance * 2.0    # 1:2 R:R
        tp2 = entry + sl_distance * 3.0    # 1:3 R:R
        tp3 = entry + sl_distance * 5.0    # 1:5 R:R (runner)
    else:
        tp1 = entry - sl_distance * 2.0
        tp2 = entry - sl_distance * 3.0
        tp3 = entry - sl_distance * 5.0

    return {
        "tp1": {"price": tp1, "close_pct": 50, "rr": 2.0},
        "tp2": {"price": tp2, "close_pct": 30, "rr": 3.0},
        "tp3": {"price": tp3, "close_pct": 20, "rr": 5.0},
    }
```

### 6.2 Trailing Stop Activation

```python
def trailing_stop_logic(position, current_price, atr):
    """
    Activate trailing stop after price reaches 1:1 R:R.
    Trail distance = 1.0 × ATR(H1, 14).
    """
    entry = position.open_price
    sl = position.stop_loss
    sl_distance = abs(entry - sl)

    if position.direction == "LONG":
        current_rr = (current_price - entry) / sl_distance
        if current_rr >= 1.0:  # Activate at 1:1
            trail_stop = current_price - atr * 1.0
            new_sl = max(position.current_sl, trail_stop)  # Never lower SL
            if new_sl > position.current_sl:
                return {"action": "MODIFY_SL", "new_sl": new_sl}

    elif position.direction == "SHORT":
        current_rr = (entry - current_price) / sl_distance
        if current_rr >= 1.0:
            trail_stop = current_price + atr * 1.0
            new_sl = min(position.current_sl, trail_stop)  # Never raise SL
            if new_sl < position.current_sl:
                return {"action": "MODIFY_SL", "new_sl": new_sl}

    return None  # No modification
```
