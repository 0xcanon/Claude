"""
OpenClaw Decision Engine — Full Pseudocode
============================================
This is the brain of the trading system. It runs as a persistent Python process
on the VPS, making all trading decisions and publishing signals to the MT5 EA.

IMPORTANT: This is pseudocode/design reference. It requires OpenClaw SDK,
MetaTrader5 Python package, and supporting infrastructure to run.
"""

import time
import json
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict, field
from typing import Optional, Dict, List
from enum import Enum

# ============================================================================
# CONFIGURATION
# ============================================================================

class Config:
    # Assets
    ASSETS = ["BTCUSD", "ETHUSD", "XAUUSD"]

    # Risk
    BASE_RISK_PCT = 2.0
    MAX_RISK_PCT_HARD_CAP = 3.0
    MAX_PORTFOLIO_HEAT = 6.0
    MAX_HEAT_PER_ASSET = 4.0
    MAX_POSITIONS_TOTAL = 3
    MAX_POSITIONS_PER_ASSET = 1
    MAX_TRADES_PER_DAY = 10
    MIN_RR_RATIO = 2.0

    # Drawdown thresholds
    DAILY_DD_REDUCED = -3.0
    DAILY_DD_DEFENSIVE = -5.0
    DAILY_DD_HALTED = -7.0
    MONTHLY_DD_REDUCED = -8.0
    MONTHLY_DD_HALTED = -12.0
    ROLLING_30D_DD_HALTED = -15.0
    CONSECUTIVE_LOSS_REDUCED = 3
    CONSECUTIVE_LOSS_DEFENSIVE = 5
    CONSECUTIVE_LOSS_HALTED = 7

    # Signal quality
    MIN_SIGNAL_SCORE = 0.65
    MIN_SIGNAL_SCORE_REDUCED = 0.80

    # Timeframes
    STRATEGIC_TF = "D1"
    TACTICAL_TF = "H4"
    OPERATIONAL_TF = "H1"
    ENTRY_TF = "M15"
    PRECISION_TF = "M5"

    # Communication
    SIGNAL_DIR = "C:\\TradingSystem\\signals"
    HEARTBEAT_INTERVAL = 1  # seconds
    SIGNAL_EXPIRY = 5  # seconds

    # Base allocation
    BASE_ALLOCATION = {"BTCUSD": 0.40, "ETHUSD": 0.30, "XAUUSD": 0.30}

    # Regime multipliers
    REGIME_MULTIPLIERS = {
        "TRENDING_STRONG": 1.00,
        "TRENDING_WEAK": 0.70,
        "VOLATILE_EXPANSION": 1.00,
        "VOLATILE_CHAOTIC": 0.50,
        "RANGING": 0.00,
        "LOW_VOLATILITY": 0.30,
    }

    # Self-improvement bounds
    SIGNAL_THRESHOLD_MIN = 0.60
    SIGNAL_THRESHOLD_MAX = 0.85
    ATR_MULTIPLIER_MIN = 1.2
    ATR_MULTIPLIER_MAX = 2.5
    ALLOCATION_MIN = 0.10
    ALLOCATION_MAX = 0.60


# ============================================================================
# ENUMS
# ============================================================================

class OperationalMode(Enum):
    NORMAL = "NORMAL"
    REDUCED = "REDUCED"
    DEFENSIVE = "DEFENSIVE"
    HALTED = "HALTED"
    EMERGENCY = "EMERGENCY"
    MAINTENANCE = "MAINTENANCE"

class Regime(Enum):
    TRENDING_STRONG = "TRENDING_STRONG"
    TRENDING_WEAK = "TRENDING_WEAK"
    VOLATILE_EXPANSION = "VOLATILE_EXPANSION"
    VOLATILE_CHAOTIC = "VOLATILE_CHAOTIC"
    RANGING = "RANGING"
    LOW_VOLATILITY = "LOW_VOLATILITY"

class Direction(Enum):
    LONG = "LONG"
    SHORT = "SHORT"


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class MarketData:
    asset: str
    timeframe: str
    open: List[float] = field(default_factory=list)
    high: List[float] = field(default_factory=list)
    low: List[float] = field(default_factory=list)
    close: List[float] = field(default_factory=list)
    volume: List[float] = field(default_factory=list)
    timestamp: List[datetime] = field(default_factory=list)

@dataclass
class RegimeState:
    regime: str
    confidence: float
    atr_current: float
    atr_percentile: float
    adx_current: float
    bb_width_percentile: float
    vol_expanding: bool
    vol_spike: bool

@dataclass
class AlignmentState:
    score: float          # -1.0 to +1.0
    quality: str          # PERFECT, STRONG, WEAK
    tradeable: bool
    breakdown: Dict       # Per-timeframe direction

@dataclass
class Signal:
    signal_id: str
    signal_type: str      # ENTRY, EXIT, MODIFY, PARTIAL_CLOSE, HEARTBEAT
    asset: str
    direction: str
    entry_price: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: Optional[float]
    lot_size: float
    risk_percent: float
    risk_dollars: float
    rr_ratio: float
    signal_score: float
    regime: str
    alignment_score: float
    metadata: Dict

@dataclass
class RiskEngineState:
    mode: OperationalMode
    account_equity: float
    daily_high_watermark: float
    monthly_high_watermark: float
    daily_drawdown_pct: float
    monthly_drawdown_pct: float
    rolling_30d_drawdown_pct: float
    current_heat: float
    heat_by_asset: Dict[str, float]
    open_positions: List
    consecutive_losses: int
    recent_win_rate: float
    historical_win_rate: float
    performance_multiplier: float
    btc_eth_correlation: float
    gold_crypto_correlation: float
    regime_by_asset: Dict[str, str]
    trades_today: int
    allocation_weights: Dict[str, float]


# ============================================================================
# MARKET DATA LAYER
# ============================================================================

class MarketDataManager:
    """
    Manages market data ingestion from MT5 and/or external sources.
    Maintains rolling buffers for each asset and timeframe.
    """

    def __init__(self):
        self.data_cache: Dict[str, Dict[str, MarketData]] = {}
        self.last_update: Dict[str, datetime] = {}

    def initialize(self):
        """Load initial historical data for all assets and timeframes."""
        for asset in Config.ASSETS:
            self.data_cache[asset] = {}
            for tf in [Config.STRATEGIC_TF, Config.TACTICAL_TF,
                       Config.OPERATIONAL_TF, Config.ENTRY_TF, Config.PRECISION_TF]:
                self.data_cache[asset][tf] = self._fetch_historical(asset, tf, bars=500)
                self.last_update[f"{asset}_{tf}"] = datetime.now(timezone.utc)

    def update(self, asset: str, timeframe: str):
        """Fetch latest bars and append to cache."""
        new_bars = self._fetch_latest(asset, timeframe)
        if new_bars:
            self._append_bars(asset, timeframe, new_bars)
            self.last_update[f"{asset}_{timeframe}"] = datetime.now(timezone.utc)

    def get(self, asset: str, timeframe: str) -> MarketData:
        """Get cached market data."""
        return self.data_cache[asset][timeframe]

    def is_fresh(self, asset: str, timeframe: str, max_age_seconds: int = 30) -> bool:
        """Check if data is fresh enough."""
        key = f"{asset}_{timeframe}"
        if key not in self.last_update:
            return False
        age = (datetime.now(timezone.utc) - self.last_update[key]).total_seconds()
        return age < max_age_seconds

    def _fetch_historical(self, asset: str, tf: str, bars: int) -> MarketData:
        """Fetch historical OHLCV from MT5 API."""
        # Implementation: mt5.copy_rates_from_pos(asset, tf_map[tf], 0, bars)
        pass

    def _fetch_latest(self, asset: str, tf: str) -> Optional[list]:
        """Fetch only the newest bars since last update."""
        pass

    def _append_bars(self, asset: str, tf: str, new_bars: list):
        """Append new bars to rolling buffer, maintaining max size."""
        pass


# ============================================================================
# INDICATOR LIBRARY
# ============================================================================

class Indicators:
    """
    Technical indicator calculations.
    All functions operate on numpy arrays / lists.
    """

    @staticmethod
    def ema(data: list, period: int) -> list:
        """Exponential Moving Average."""
        result = [0.0] * len(data)
        multiplier = 2.0 / (period + 1)
        result[0] = data[0]
        for i in range(1, len(data)):
            result[i] = (data[i] - result[i-1]) * multiplier + result[i-1]
        return result

    @staticmethod
    def sma(data: list, period: int) -> list:
        """Simple Moving Average."""
        result = []
        for i in range(len(data)):
            if i < period - 1:
                result.append(None)
            else:
                result.append(sum(data[i-period+1:i+1]) / period)
        return result

    @staticmethod
    def atr(high: list, low: list, close: list, period: int) -> list:
        """Average True Range."""
        tr = []
        for i in range(len(high)):
            if i == 0:
                tr.append(high[i] - low[i])
            else:
                tr.append(max(
                    high[i] - low[i],
                    abs(high[i] - close[i-1]),
                    abs(low[i] - close[i-1])
                ))
        return Indicators.ema(tr, period)

    @staticmethod
    def adx(high: list, low: list, close: list, period: int) -> list:
        """Average Directional Index."""
        # +DM, -DM computation
        plus_dm = []
        minus_dm = []
        for i in range(1, len(high)):
            up_move = high[i] - high[i-1]
            down_move = low[i-1] - low[i]
            plus_dm.append(up_move if up_move > down_move and up_move > 0 else 0)
            minus_dm.append(down_move if down_move > up_move and down_move > 0 else 0)

        atr_vals = Indicators.atr(high[1:], low[1:], close[1:], period)
        smooth_plus = Indicators.ema(plus_dm, period)
        smooth_minus = Indicators.ema(minus_dm, period)

        plus_di = [100 * sp / a if a != 0 else 0 for sp, a in zip(smooth_plus, atr_vals)]
        minus_di = [100 * sm / a if a != 0 else 0 for sm, a in zip(smooth_minus, atr_vals)]

        dx = [abs(p - m) / (p + m) * 100 if (p + m) != 0 else 0
              for p, m in zip(plus_di, minus_di)]

        adx_vals = Indicators.ema(dx, period)
        return adx_vals

    @staticmethod
    def bollinger_band_width(close: list, period: int, std_mult: float) -> list:
        """Bollinger Band Width = (Upper - Lower) / Middle."""
        sma_vals = Indicators.sma(close, period)
        result = []
        for i in range(len(close)):
            if sma_vals[i] is None:
                result.append(None)
                continue
            window = close[max(0, i-period+1):i+1]
            std = (sum((x - sma_vals[i])**2 for x in window) / len(window)) ** 0.5
            upper = sma_vals[i] + std_mult * std
            lower = sma_vals[i] - std_mult * std
            bbw = (upper - lower) / sma_vals[i] if sma_vals[i] != 0 else 0
            result.append(bbw)
        return result

    @staticmethod
    def rsi(close: list, period: int) -> list:
        """Relative Strength Index."""
        gains = []
        losses = []
        for i in range(1, len(close)):
            change = close[i] - close[i-1]
            gains.append(max(0, change))
            losses.append(max(0, -change))

        avg_gain = Indicators.ema(gains, period)
        avg_loss = Indicators.ema(losses, period)

        rsi_vals = []
        for g, l in zip(avg_gain, avg_loss):
            if l == 0:
                rsi_vals.append(100)
            else:
                rs = g / l
                rsi_vals.append(100 - (100 / (1 + rs)))
        return rsi_vals

    @staticmethod
    def macd(close: list, fast: int, slow: int, signal: int) -> tuple:
        """MACD: returns (macd_line, signal_line, histogram)."""
        ema_fast = Indicators.ema(close, fast)
        ema_slow = Indicators.ema(close, slow)
        macd_line = [f - s for f, s in zip(ema_fast, ema_slow)]
        signal_line = Indicators.ema(macd_line, signal)
        histogram = [m - s for m, s in zip(macd_line, signal_line)]
        return macd_line, signal_line, histogram

    @staticmethod
    def supertrend(high: list, low: list, close: list, period: int, multiplier: float) -> list:
        """Supertrend indicator. Returns list of 'UP' or 'DOWN'."""
        atr_vals = Indicators.atr(high, low, close, period)
        result = ['UP'] * len(close)
        upper_band = [0.0] * len(close)
        lower_band = [0.0] * len(close)

        for i in range(period, len(close)):
            mid = (high[i] + low[i]) / 2
            upper_band[i] = mid + multiplier * atr_vals[i]
            lower_band[i] = mid - multiplier * atr_vals[i]

            if close[i] > upper_band[i-1]:
                result[i] = 'UP'
            elif close[i] < lower_band[i-1]:
                result[i] = 'DOWN'
            else:
                result[i] = result[i-1]

        return result

    @staticmethod
    def percentile_rank(data: list, lookback: int) -> float:
        """Percentile rank of the last value within the lookback window."""
        window = data[-lookback:]
        current = data[-1]
        count_below = sum(1 for x in window if x < current)
        return (count_below / len(window)) * 100


# ============================================================================
# REGIME DETECTOR
# ============================================================================

class RegimeDetector:
    """
    Classifies the current market regime for each asset.
    Updated every 5 minutes.
    """

    def __init__(self, data_manager: MarketDataManager):
        self.data = data_manager
        self.history: Dict[str, List[RegimeState]] = {asset: [] for asset in Config.ASSETS}

    def classify(self, asset: str) -> RegimeState:
        """Classify current regime for an asset."""
        md = self.data.get(asset, Config.OPERATIONAL_TF)

        # Compute features
        atr_vals = Indicators.atr(md.high, md.low, md.close, 14)
        atr_current = atr_vals[-1]
        atr_percentile = Indicators.percentile_rank(atr_vals, 100)

        adx_vals = Indicators.adx(md.high, md.low, md.close, 14)
        adx_current = adx_vals[-1]

        bbw = Indicators.bollinger_band_width(md.close, 20, 2.0)
        bbw_percentile = Indicators.percentile_rank([b for b in bbw if b is not None], 100)

        # Volatility state
        vol_expanding = atr_percentile > 60 and atr_vals[-1] > atr_vals[-2]
        vol_contracting = atr_percentile < 30
        vol_spike = atr_vals[-1] > atr_vals[-2] * 1.5

        # Trend state
        strong_trend = adx_current > 30
        trending = adx_current > 25
        no_trend = adx_current < 20

        # Range detection
        bb_squeeze = bbw_percentile < 20
        oscillating = self._detect_oscillation(md.close, 20)

        # Classification
        if strong_trend and vol_expanding:
            regime = Regime.TRENDING_STRONG.value
            confidence = min(0.95, (adx_current - 25) / 30 + atr_percentile / 200)
        elif trending and not vol_contracting:
            regime = Regime.TRENDING_WEAK.value
            confidence = min(0.80, adx_current / 50)
        elif vol_spike and trending:
            regime = Regime.VOLATILE_EXPANSION.value
            confidence = min(0.90, atr_percentile / 100)
        elif vol_spike and not trending:
            regime = Regime.VOLATILE_CHAOTIC.value
            confidence = 0.70
        elif no_trend and (bb_squeeze or oscillating):
            regime = Regime.RANGING.value
            confidence = min(0.85, 1.0 - adx_current / 40)
        elif vol_contracting and no_trend:
            regime = Regime.LOW_VOLATILITY.value
            confidence = min(0.85, 1.0 - atr_percentile / 50)
        else:
            regime = Regime.TRENDING_WEAK.value
            confidence = 0.50

        state = RegimeState(
            regime=regime,
            confidence=confidence,
            atr_current=atr_current,
            atr_percentile=atr_percentile,
            adx_current=adx_current,
            bb_width_percentile=bbw_percentile,
            vol_expanding=vol_expanding,
            vol_spike=vol_spike
        )

        self.history[asset].append(state)
        if len(self.history[asset]) > 1000:
            self.history[asset] = self.history[asset][-500:]

        return state

    def _detect_oscillation(self, close: list, lookback: int) -> bool:
        """Detect price oscillation (ranging behavior)."""
        recent = close[-lookback:]
        ema_mid = Indicators.ema(recent, lookback // 2)
        detrended = [c - e for c, e in zip(recent, ema_mid)]
        crossings = sum(1 for i in range(1, len(detrended))
                        if detrended[i] * detrended[i-1] < 0)
        return (crossings / lookback) > 0.25

    def get_recent_regimes(self, asset: str, count: int = 6) -> List[RegimeState]:
        """Get recent regime history for entry timing."""
        return self.history[asset][-count:]


# ============================================================================
# MULTI-TIMEFRAME ALIGNMENT ENGINE
# ============================================================================

class MTFAlignmentEngine:
    """
    Computes multi-timeframe trend alignment.
    """

    TF_WEIGHTS = {
        "D1": 0.10,   # Strategic context
        "H4": 0.30,   # Tactical direction
        "H1": 0.35,   # Operational timing
        "M15": 0.25,  # Entry confirmation
    }

    def __init__(self, data_manager: MarketDataManager):
        self.data = data_manager

    def compute_alignment(self, asset: str) -> AlignmentState:
        """Compute MTF alignment score for an asset."""
        directions = {}

        # Daily trend
        md_d1 = self.data.get(asset, "D1")
        directions["D1"] = self._classify_daily(md_d1)

        # 4H trend
        md_h4 = self.data.get(asset, "H4")
        directions["H4"] = self._classify_4h(md_h4)

        # 1H trend
        md_h1 = self.data.get(asset, "H1")
        directions["H1"] = self._classify_1h(md_h1)

        # 15m trend
        md_m15 = self.data.get(asset, "M15")
        directions["M15"] = self._classify_15m(md_m15)

        # Compute weighted score
        dir_values = {"BULLISH": 1.0, "BEARISH": -1.0, "NEUTRAL": 0.0}
        score = sum(
            dir_values[directions[tf]] * self.TF_WEIGHTS[tf]
            for tf in directions
        )

        # Determine quality
        dir_list = list(directions.values())
        non_neutral = [d for d in dir_list if d != "NEUTRAL"]
        if len(non_neutral) >= 3 and len(set(non_neutral)) == 1:
            quality = "PERFECT" if len(non_neutral) == 4 else "STRONG"
        elif len(non_neutral) >= 2 and len(set(non_neutral)) == 1:
            quality = "STRONG"
        else:
            quality = "WEAK"

        tradeable = abs(score) >= 0.60 and quality != "WEAK"

        return AlignmentState(
            score=score,
            quality=quality,
            tradeable=tradeable,
            breakdown=directions
        )

    def _classify_daily(self, md: MarketData) -> str:
        ema_50 = Indicators.ema(md.close, 50)
        ema_200 = Indicators.ema(md.close, 200)
        adx = Indicators.adx(md.high, md.low, md.close, 14)

        if (md.close[-1] > ema_50[-1] and md.close[-1] > ema_200[-1]
                and ema_50[-1] > ema_200[-1] and adx[-1] > 20):
            return "BULLISH"
        elif (md.close[-1] < ema_50[-1] and md.close[-1] < ema_200[-1]
              and ema_50[-1] < ema_200[-1] and adx[-1] > 20):
            return "BEARISH"
        return "NEUTRAL"

    def _classify_4h(self, md: MarketData) -> str:
        ema_21 = Indicators.ema(md.close, 21)
        ema_50 = Indicators.ema(md.close, 50)
        adx = Indicators.adx(md.high, md.low, md.close, 14)

        if ema_21[-1] > ema_50[-1] and md.close[-1] > ema_21[-1] and adx[-1] > 20:
            return "BULLISH"
        elif ema_21[-1] < ema_50[-1] and md.close[-1] < ema_21[-1] and adx[-1] > 20:
            return "BEARISH"
        return "NEUTRAL"

    def _classify_1h(self, md: MarketData) -> str:
        ema_9 = Indicators.ema(md.close, 9)
        ema_21 = Indicators.ema(md.close, 21)
        macd_line, signal_line, histogram = Indicators.macd(md.close, 12, 26, 9)

        if ema_9[-1] > ema_21[-1] and macd_line[-1] > signal_line[-1] and histogram[-1] > 0:
            return "BULLISH"
        elif ema_9[-1] < ema_21[-1] and macd_line[-1] < signal_line[-1] and histogram[-1] < 0:
            return "BEARISH"
        return "NEUTRAL"

    def _classify_15m(self, md: MarketData) -> str:
        supertrend = Indicators.supertrend(md.high, md.low, md.close, 10, 3.0)
        ema_9 = Indicators.ema(md.close, 9)

        if supertrend[-1] == "UP" and md.close[-1] > ema_9[-1]:
            return "BULLISH"
        elif supertrend[-1] == "DOWN" and md.close[-1] < ema_9[-1]:
            return "BEARISH"
        return "NEUTRAL"


# ============================================================================
# VOLATILITY EXPANSION DETECTOR
# ============================================================================

class VolatilityExpansionDetector:
    """
    Determines if volatility is expanding — the primary trade filter.
    """

    def __init__(self, data_manager: MarketDataManager, regime_detector: RegimeDetector):
        self.data = data_manager
        self.regime = regime_detector

    def is_expanding(self, asset: str) -> dict:
        """Check if volatility is expanding via multi-signal confirmation."""
        md = self.data.get(asset, Config.OPERATIONAL_TF)
        confirmations = 0
        details = {}

        # 1. ATR Expansion (3 consecutive rising ATR)
        atr = Indicators.atr(md.high, md.low, md.close, 14)
        atr_expanding = atr[-1] > atr[-2] > atr[-3]
        details["atr_expanding"] = atr_expanding
        if atr_expanding:
            confirmations += 1

        # 2. ATR above median
        atr_pct = Indicators.percentile_rank(atr, 100)
        details["atr_above_median"] = atr_pct > 50
        if atr_pct > 50:
            confirmations += 1

        # 3. Bollinger Band Width expanding
        bbw = Indicators.bollinger_band_width(md.close, 20, 2.0)
        valid_bbw = [b for b in bbw if b is not None]
        bb_expanding = len(valid_bbw) >= 5 and valid_bbw[-1] > valid_bbw[-2] and valid_bbw[-1] > valid_bbw[-5]
        details["bb_expanding"] = bb_expanding
        if bb_expanding:
            confirmations += 1

        # 4. Candle range expansion
        candle_ranges = [md.high[i] - md.low[i] for i in range(-5, 0)]
        avg_range = sum(candle_ranges[:-1]) / max(1, len(candle_ranges) - 1)
        range_exp = candle_ranges[-1] > avg_range * 1.3
        details["range_expanding"] = range_exp
        if range_exp:
            confirmations += 1

        # 5. Volume surge (if available)
        if md.volume and len(md.volume) > 20:
            vol_sma = Indicators.sma(md.volume, 20)
            if vol_sma[-1] and vol_sma[-1] > 0:
                vol_surge = md.volume[-1] > vol_sma[-1] * 1.5
                details["volume_surge"] = vol_surge
                if vol_surge:
                    confirmations += 1
        else:
            details["volume_surge"] = None

        is_exp = confirmations >= 3
        details["confirmations"] = confirmations
        details["is_expanding"] = is_exp
        return details

    def is_entry_window(self, asset: str) -> bool:
        """
        Check if we're in the early phase of volatility expansion.
        We want to catch the beginning, not the middle or end.
        """
        recent_regimes = self.regime.get_recent_regimes(asset, count=6)
        if len(recent_regimes) < 2:
            return False

        # Previous period should have been low-vol or ranging
        prior_regimes = recent_regimes[:-1]
        had_low_vol = any(
            r.regime in (Regime.LOW_VOLATILITY.value, Regime.RANGING.value)
            for r in prior_regimes
        )

        # Current should be expansion
        current = recent_regimes[-1]
        currently_expanding = current.regime in (
            Regime.TRENDING_STRONG.value,
            Regime.VOLATILE_EXPANSION.value
        )

        # Count how long we've been in expansion
        expansion_count = 0
        for r in reversed(recent_regimes):
            if r.regime in (Regime.TRENDING_STRONG.value, Regime.VOLATILE_EXPANSION.value):
                expansion_count += 1
            else:
                break

        # Early = fewer than 4 periods into the expansion
        early = expansion_count <= 4

        return had_low_vol and currently_expanding and early


# ============================================================================
# SIGNAL GENERATOR
# ============================================================================

class SignalGenerator:
    """
    Generates trading signals by combining all analysis components.
    """

    def __init__(self, data_manager: MarketDataManager,
                 regime_detector: RegimeDetector,
                 alignment_engine: MTFAlignmentEngine,
                 vol_detector: VolatilityExpansionDetector):
        self.data = data_manager
        self.regime = regime_detector
        self.alignment = alignment_engine
        self.vol = vol_detector
        self.signal_counter = 0

    def evaluate(self, asset: str) -> Optional[Signal]:
        """
        Evaluate whether a trade signal should be generated for an asset.
        Returns Signal if all criteria are met, None otherwise.
        """
        # Step 1: Regime check — no trades in RANGING or LOW_VOLATILITY
        regime_state = self.regime.classify(asset)
        if regime_state.regime in (Regime.RANGING.value, Regime.LOW_VOLATILITY.value):
            logging.debug(f"{asset}: Rejected — regime is {regime_state.regime}")
            return None

        # Step 2: MTF alignment — must be tradeable
        alignment = self.alignment.compute_alignment(asset)
        if not alignment.tradeable:
            logging.debug(f"{asset}: Rejected — MTF alignment weak (score={alignment.score:.2f})")
            return None

        # Step 3: Volatility must be expanding
        vol_state = self.vol.is_expanding(asset)
        if not vol_state["is_expanding"]:
            logging.debug(f"{asset}: Rejected — vol not expanding ({vol_state['confirmations']}/3)")
            return None

        # Step 4: Must be in early expansion window
        if not self.vol.is_entry_window(asset):
            logging.debug(f"{asset}: Rejected — not in entry window")
            return None

        # Step 5: Direction from alignment
        direction = Direction.LONG if alignment.score > 0 else Direction.SHORT

        # Step 6: Compute entry, SL, TP
        md = self.data.get(asset, Config.ENTRY_TF)
        entry_price = md.close[-1]  # Market order at current price
        sl = self._compute_stop_loss(asset, direction, md)
        tp1 = self._compute_take_profit(entry_price, sl, rr=2.0, direction=direction)
        tp2 = self._compute_take_profit(entry_price, sl, rr=3.0, direction=direction)

        # Step 7: Validate R:R >= 2.0
        sl_distance = abs(entry_price - sl)
        tp1_distance = abs(tp1 - entry_price)
        if sl_distance == 0 or tp1_distance / sl_distance < Config.MIN_RR_RATIO:
            logging.debug(f"{asset}: Rejected — R:R < {Config.MIN_RR_RATIO}")
            return None

        # Step 8: Signal quality score
        score = self._compute_score(regime_state, alignment, vol_state)
        if score < Config.MIN_SIGNAL_SCORE:
            logging.debug(f"{asset}: Rejected — score {score:.2f} < {Config.MIN_SIGNAL_SCORE}")
            return None

        # Step 9: Build signal
        self.signal_counter += 1
        now = datetime.now(timezone.utc)
        signal_id = (f"OC-{now.strftime('%Y%m%d-%H%M%S')}-{asset}-"
                     f"{'L' if direction == Direction.LONG else 'S'}-"
                     f"{self.signal_counter:03d}")

        signal = Signal(
            signal_id=signal_id,
            signal_type="ENTRY",
            asset=asset,
            direction=direction.value,
            entry_price=entry_price,
            stop_loss=sl,
            take_profit_1=tp1,
            take_profit_2=tp2,
            lot_size=0.0,  # Set by risk engine
            risk_percent=0.0,
            risk_dollars=0.0,
            rr_ratio=round(tp1_distance / sl_distance, 2),
            signal_score=round(score, 2),
            regime=regime_state.regime,
            alignment_score=round(alignment.score, 2),
            metadata={
                "regime_confidence": regime_state.confidence,
                "mtf_alignment": alignment.breakdown,
                "volatility_state": "EXPANDING",
                "atr_current": regime_state.atr_current,
                "atr_percentile": regime_state.atr_percentile,
                "adx": regime_state.adx_current,
                "vol_confirmations": vol_state["confirmations"],
            }
        )

        logging.info(f"Signal generated: {signal_id} | {asset} {direction.value} | "
                     f"Score: {score:.2f} | R:R: {signal.rr_ratio}")
        return signal

    def _compute_stop_loss(self, asset: str, direction: Direction, md: MarketData) -> float:
        """Compute stop-loss based on market structure + ATR buffer."""
        atr = Indicators.atr(md.high, md.low, md.close, 14)
        atr_val = atr[-1]
        lookback = 20

        if direction == Direction.LONG:
            swing_low = min(md.low[-lookback:])
            sl = max(
                swing_low - 0.5 * atr_val,
                md.close[-1] - 2.0 * atr_val
            )
        else:
            swing_high = max(md.high[-lookback:])
            sl = min(
                swing_high + 0.5 * atr_val,
                md.close[-1] + 2.0 * atr_val
            )
        return round(sl, 2)

    def _compute_take_profit(self, entry: float, sl: float,
                              rr: float, direction: Direction) -> float:
        """Compute TP at specified R:R ratio."""
        sl_distance = abs(entry - sl)
        tp_distance = sl_distance * rr

        if direction == Direction.LONG:
            return round(entry + tp_distance, 2)
        else:
            return round(entry - tp_distance, 2)

    def _compute_score(self, regime: RegimeState, alignment: AlignmentState,
                       vol_state: dict) -> float:
        """Composite signal quality score (0.0 - 1.0)."""
        score = 0.0

        # Regime quality (0-0.30)
        regime_scores = {
            Regime.TRENDING_STRONG.value: 0.30,
            Regime.VOLATILE_EXPANSION.value: 0.28,
            Regime.TRENDING_WEAK.value: 0.15,
            Regime.VOLATILE_CHAOTIC.value: 0.10,
        }
        score += regime_scores.get(regime.regime, 0.0)

        # Alignment quality (0-0.35)
        alignment_scores = {"PERFECT": 0.35, "STRONG": 0.25, "WEAK": 0.05}
        score += alignment_scores.get(alignment.quality, 0.0)

        # Volatility strength (0-0.20)
        score += min(0.20, vol_state["confirmations"] * 0.05)

        # Regime confidence (0-0.15)
        score += regime.confidence * 0.15

        return min(1.0, score)


# ============================================================================
# RISK ENGINE
# ============================================================================

class RiskEngine:
    """
    Multi-layered risk management engine.
    Every signal must pass through all layers before publication.
    """

    def __init__(self, config: Config):
        self.config = config
        self.state = RiskEngineState(
            mode=OperationalMode.NORMAL,
            account_equity=0.0,
            daily_high_watermark=0.0,
            monthly_high_watermark=0.0,
            daily_drawdown_pct=0.0,
            monthly_drawdown_pct=0.0,
            rolling_30d_drawdown_pct=0.0,
            current_heat=0.0,
            heat_by_asset={a: 0.0 for a in Config.ASSETS},
            open_positions=[],
            consecutive_losses=0,
            recent_win_rate=0.50,
            historical_win_rate=0.50,
            performance_multiplier=1.0,
            btc_eth_correlation=0.75,
            gold_crypto_correlation=-0.10,
            regime_by_asset={},
            trades_today=0,
            allocation_weights=Config.BASE_ALLOCATION.copy()
        )

    def process_signal(self, signal: Signal) -> Optional[Signal]:
        """
        Process a signal through all risk layers.
        Returns modified signal with lot_size set, or None if rejected.
        """
        # Pre-check: operational mode
        if self.state.mode in (OperationalMode.HALTED, OperationalMode.EMERGENCY):
            logging.warning(f"Signal rejected: system is {self.state.mode.value}")
            return None

        if self.state.mode == OperationalMode.MAINTENANCE:
            logging.info("Signal rejected: system in MAINTENANCE mode")
            return None

        # Pre-check: max trades per day
        if self.state.trades_today >= Config.MAX_TRADES_PER_DAY:
            logging.warning(f"Signal rejected: max trades today ({self.state.trades_today})")
            return None

        # Pre-check: signal score in reduced modes
        if self.state.mode == OperationalMode.REDUCED:
            if signal.signal_score < Config.MIN_SIGNAL_SCORE_REDUCED:
                logging.info(f"Signal rejected: score {signal.signal_score} < "
                             f"reduced threshold {Config.MIN_SIGNAL_SCORE_REDUCED}")
                return None

        if self.state.mode == OperationalMode.DEFENSIVE:
            if signal.signal_score < 0.85:
                logging.info(f"Signal rejected: score {signal.signal_score} < "
                             f"defensive threshold 0.85")
                return None

        # Layer 1: Compute base position size
        base_risk_pct = Config.BASE_RISK_PCT

        # Layer 3: Drawdown factor
        dd_factor = self._drawdown_factor()

        # Layer 4: Regime factor
        regime_factor = Config.REGIME_MULTIPLIERS.get(signal.regime, 0.0)
        if regime_factor == 0.0:
            logging.info(f"Signal rejected: regime {signal.regime} has 0 multiplier")
            return None

        # Layer 5: Performance factor
        perf_factor = self._performance_factor()

        # Correlation factor (BTC/ETH)
        corr_factor = self._correlation_factor(signal.asset)

        # Asset allocation weight
        alloc_weight = self.state.allocation_weights.get(signal.asset, 0.33)

        # Compute adjusted risk
        adjusted_risk = (base_risk_pct * dd_factor * regime_factor *
                         perf_factor * corr_factor)

        # Hard caps
        adjusted_risk = max(0.5, min(adjusted_risk, Config.MAX_RISK_PCT_HARD_CAP))

        # Layer 2: Portfolio heat check
        if self.state.current_heat + adjusted_risk > Config.MAX_PORTFOLIO_HEAT:
            available = Config.MAX_PORTFOLIO_HEAT - self.state.current_heat
            if available < 0.5:
                logging.info(f"Signal rejected: insufficient heat room ({available:.2f}%)")
                return None
            adjusted_risk = available

        # Per-asset heat check
        asset_heat = self.state.heat_by_asset.get(signal.asset, 0.0)
        if asset_heat + adjusted_risk > Config.MAX_HEAT_PER_ASSET:
            available = Config.MAX_HEAT_PER_ASSET - asset_heat
            if available < 0.5:
                logging.info(f"Signal rejected: {signal.asset} heat limit reached")
                return None
            adjusted_risk = min(adjusted_risk, available)

        # Max positions check
        if len(self.state.open_positions) >= Config.MAX_POSITIONS_TOTAL:
            logging.info("Signal rejected: max positions reached")
            return None

        asset_positions = sum(1 for p in self.state.open_positions if p.asset == signal.asset)
        if asset_positions >= Config.MAX_POSITIONS_PER_ASSET:
            logging.info(f"Signal rejected: max positions for {signal.asset}")
            return None

        # Defensive mode: only 1 position total
        if self.state.mode == OperationalMode.DEFENSIVE and len(self.state.open_positions) >= 1:
            logging.info("Signal rejected: DEFENSIVE mode — max 1 position")
            return None

        # Compute lot size
        sl_distance = abs(signal.entry_price - signal.stop_loss)
        risk_dollars = self.state.account_equity * (adjusted_risk / 100)
        point_value = self._get_point_value(signal.asset)

        if sl_distance == 0 or point_value == 0:
            logging.error(f"Signal rejected: invalid SL distance or point value")
            return None

        lot_size = risk_dollars / (sl_distance * point_value)
        lot_size = self._round_lot(lot_size, signal.asset)
        lot_size = max(0.01, lot_size)  # Minimum lot

        # Update signal
        signal.lot_size = lot_size
        signal.risk_percent = round(adjusted_risk, 2)
        signal.risk_dollars = round(risk_dollars, 2)

        logging.info(f"Risk approved: {signal.signal_id} | "
                     f"Lot: {lot_size} | Risk: {adjusted_risk:.2f}% | "
                     f"Factors: DD={dd_factor:.2f} Regime={regime_factor:.2f} "
                     f"Perf={perf_factor:.2f} Corr={corr_factor:.2f}")

        return signal

    def _drawdown_factor(self) -> float:
        """Compute position size reduction based on current drawdown."""
        if self.state.mode == OperationalMode.DEFENSIVE:
            return 0.25
        elif self.state.mode == OperationalMode.REDUCED:
            return 0.50

        # Consecutive loss reduction
        cl = self.state.consecutive_losses
        if cl >= 5:
            return 0.50
        elif cl >= 3:
            return 0.75

        return 1.0

    def _performance_factor(self) -> float:
        """Adaptive sizing based on recent performance."""
        recent = self.state.recent_win_rate
        historical = self.state.historical_win_rate

        if historical == 0:
            return 1.0

        if recent > historical * 1.15:
            factor = min(1.20, 1.0 + (recent - historical))
        elif recent < historical * 0.85:
            factor = max(0.60, 1.0 - (historical - recent))
        else:
            factor = 1.0

        # Clamp
        return max(0.50, min(1.30, factor))

    def _correlation_factor(self, asset: str) -> float:
        """Reduce size when correlated assets are already exposed."""
        if asset in ("BTCUSD", "ETHUSD"):
            corr = self.state.btc_eth_correlation
            other = "ETHUSD" if asset == "BTCUSD" else "BTCUSD"
            other_heat = self.state.heat_by_asset.get(other, 0.0)

            if other_heat > 0 and corr > 0.70:
                # Already exposed to correlated asset
                if corr > 0.85:
                    return 0.50  # Heavy discount
                else:
                    return 0.70  # Moderate discount
        return 1.0

    def _get_point_value(self, asset: str) -> float:
        """Get tick value per lot from MT5."""
        # Implementation: mt5.symbol_info(asset).trade_tick_value
        # Placeholder
        return 1.0

    def _round_lot(self, lot: float, asset: str) -> float:
        """Round lot to broker's lot step."""
        # Implementation: use mt5.symbol_info(asset).volume_step
        step = 0.01
        return round(lot / step) * step

    def update_state(self, account_info, positions, trade_history):
        """
        Update risk engine state. Called every second.
        """
        self.state.account_equity = account_info.equity
        self.state.open_positions = positions

        # Update drawdowns
        if account_info.equity > self.state.daily_high_watermark:
            self.state.daily_high_watermark = account_info.equity
        self.state.daily_drawdown_pct = (
            (account_info.equity - self.state.daily_high_watermark)
            / self.state.daily_high_watermark * 100
            if self.state.daily_high_watermark > 0 else 0
        )

        if account_info.equity > self.state.monthly_high_watermark:
            self.state.monthly_high_watermark = account_info.equity
        self.state.monthly_drawdown_pct = (
            (account_info.equity - self.state.monthly_high_watermark)
            / self.state.monthly_high_watermark * 100
            if self.state.monthly_high_watermark > 0 else 0
        )

        # Update portfolio heat
        self.state.current_heat = 0
        self.state.heat_by_asset = {a: 0.0 for a in Config.ASSETS}
        for pos in positions:
            sl_dist = abs(pos.price_open - pos.sl) if pos.sl != 0 else 0
            risk = (pos.volume * sl_dist * self._get_point_value(pos.symbol)) / account_info.equity * 100
            self.state.current_heat += risk
            self.state.heat_by_asset[pos.symbol] = (
                self.state.heat_by_asset.get(pos.symbol, 0) + risk
            )


# ============================================================================
# KILL-SWITCH CONTROLLER
# ============================================================================

class KillSwitchController:
    """
    Multi-condition kill-switch. Evaluated every second.
    """

    def __init__(self, risk_engine: RiskEngine):
        self.risk_engine = risk_engine
        self.halt_reason = None

    def evaluate(self) -> OperationalMode:
        """Evaluate all kill-switch conditions and return appropriate mode."""
        state = self.risk_engine.state

        # === EMERGENCY ===
        # (Data feed, DB, equity anomaly — see kill-switch design doc)
        # These would be checked against system health monitors

        # === HALTED ===
        if state.daily_drawdown_pct < Config.DAILY_DD_HALTED:
            return self._trigger(OperationalMode.HALTED,
                                 f"Daily DD {state.daily_drawdown_pct:.2f}%")

        if state.monthly_drawdown_pct < Config.MONTHLY_DD_HALTED:
            return self._trigger(OperationalMode.HALTED,
                                 f"Monthly DD {state.monthly_drawdown_pct:.2f}%")

        if state.rolling_30d_drawdown_pct < Config.ROLLING_30D_DD_HALTED:
            return self._trigger(OperationalMode.HALTED,
                                 f"Rolling 30d DD {state.rolling_30d_drawdown_pct:.2f}%")

        if state.consecutive_losses >= Config.CONSECUTIVE_LOSS_HALTED:
            return self._trigger(OperationalMode.HALTED,
                                 f"Consecutive losses: {state.consecutive_losses}")

        if state.trades_today > Config.MAX_TRADES_PER_DAY:
            return self._trigger(OperationalMode.HALTED,
                                 f"Trade limit exceeded: {state.trades_today}")

        # === DEFENSIVE ===
        if state.daily_drawdown_pct < Config.DAILY_DD_DEFENSIVE:
            return self._trigger(OperationalMode.DEFENSIVE,
                                 f"Daily DD {state.daily_drawdown_pct:.2f}%")

        if state.consecutive_losses >= Config.CONSECUTIVE_LOSS_DEFENSIVE:
            return self._trigger(OperationalMode.DEFENSIVE,
                                 f"Consecutive losses: {state.consecutive_losses}")

        # === REDUCED ===
        if state.daily_drawdown_pct < Config.DAILY_DD_REDUCED:
            return self._trigger(OperationalMode.REDUCED,
                                 f"Daily DD {state.daily_drawdown_pct:.2f}%")

        if state.monthly_drawdown_pct < Config.MONTHLY_DD_REDUCED:
            return self._trigger(OperationalMode.REDUCED,
                                 f"Monthly DD {state.monthly_drawdown_pct:.2f}%")

        if state.consecutive_losses >= Config.CONSECUTIVE_LOSS_REDUCED:
            return self._trigger(OperationalMode.REDUCED,
                                 f"Consecutive losses: {state.consecutive_losses}")

        return OperationalMode.NORMAL

    def _trigger(self, mode: OperationalMode, reason: str) -> OperationalMode:
        if self.risk_engine.state.mode != mode:
            self.halt_reason = reason
            logging.warning(f"Kill-switch: {mode.value} — {reason}")
            # Alert operator
            # send_telegram(f"⚠️ Mode change: {mode.value}\nReason: {reason}")

            if mode in (OperationalMode.HALTED, OperationalMode.EMERGENCY):
                # Publish close-all signal
                logging.critical(f"CLOSE ALL POSITIONS — {reason}")
        return mode


# ============================================================================
# SIGNAL PUBLISHER
# ============================================================================

class SignalPublisher:
    """
    Publishes signals to the IPC channel for the MT5 EA to consume.
    Uses atomic file writes to prevent partial reads.
    """

    def __init__(self, signal_dir: str):
        self.signal_dir = signal_dir
        self.version = "1.0.0"

    def publish(self, signal: Signal):
        """Publish a signal via file-based IPC."""
        now = datetime.now(timezone.utc)

        signal_dict = {
            "signal_id": signal.signal_id,
            "signal_type": signal.signal_type,
            "timestamp_utc": now.isoformat(),
            "timestamp_unix_ms": int(now.timestamp() * 1000),
            "expiry_utc": (now + timedelta(seconds=Config.SIGNAL_EXPIRY)).isoformat(),
            "asset": signal.asset,
            "direction": signal.direction,
            "order_type": "MARKET",
            "entry_price_reference": signal.entry_price,
            "stop_loss": signal.stop_loss,
            "take_profit_1": signal.take_profit_1,
            "take_profit_2": signal.take_profit_2,
            "lot_size": signal.lot_size,
            "risk_percent": signal.risk_percent,
            "risk_dollars": signal.risk_dollars,
            "risk_reward_ratio": signal.rr_ratio,
            "partial_close_at_tp1": 0.50,
            "partial_close_at_tp2": 0.30,
            "trail_remaining": True,
            "max_slippage_points": 30,
            "magic_number": self._get_magic_number(signal.asset, signal.direction),
            "comment": f"OC_{signal.regime}_{signal.signal_score}",
            "metadata": signal.metadata,
        }

        # Compute integrity hash
        canonical = json.dumps(signal_dict, sort_keys=True, separators=(',', ':'))
        hash_val = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
        signal_dict["integrity"] = {
            "hash_algorithm": "SHA256",
            "hash": hash_val,
            "version": self.version
        }

        # Atomic write: write to .tmp then rename
        import os
        tmp_path = os.path.join(self.signal_dir, "openclaw_to_mt5.json.tmp")
        final_path = os.path.join(self.signal_dir, "openclaw_to_mt5.json")

        with open(tmp_path, 'w') as f:
            json.dump(signal_dict, f, indent=2)

        os.replace(tmp_path, final_path)  # Atomic on both NTFS and ext4

        logging.info(f"Signal published: {signal.signal_id}")

    def publish_heartbeat(self, risk_state: RiskEngineState):
        """Publish heartbeat signal."""
        now = datetime.now(timezone.utc)
        heartbeat = {
            "signal_id": f"OC-HB-{now.strftime('%Y%m%d-%H%M%S')}",
            "signal_type": "HEARTBEAT",
            "timestamp_utc": now.isoformat(),
            "timestamp_unix_ms": int(now.timestamp() * 1000),
            "system_state": {
                "operational_mode": risk_state.mode.value,
                "open_positions": len(risk_state.open_positions),
                "portfolio_heat": round(risk_state.current_heat, 2),
                "daily_drawdown_percent": round(risk_state.daily_drawdown_pct, 2),
                "monthly_drawdown_percent": round(risk_state.monthly_drawdown_pct, 2),
            }
        }

        import os
        path = os.path.join(self.signal_dir, "heartbeat_oc.json")
        with open(path, 'w') as f:
            json.dump(heartbeat, f)

    def publish_close_all(self):
        """Emergency: publish close-all signal."""
        now = datetime.now(timezone.utc)
        signal = {
            "signal_id": f"OC-EMERGENCY-{now.strftime('%Y%m%d-%H%M%S')}",
            "signal_type": "EXIT",
            "timestamp_utc": now.isoformat(),
            "timestamp_unix_ms": int(now.timestamp() * 1000),
            "close_all": True,
            "reason": "EMERGENCY_HALT"
        }

        import os
        path = os.path.join(self.signal_dir, "openclaw_to_mt5.json")
        with open(path, 'w') as f:
            json.dump(signal, f)

        # Also create emergency halt file
        flag_path = os.path.join(self.signal_dir, "emergency_halt.flag")
        with open(flag_path, 'w') as f:
            f.write(f"EMERGENCY_HALT at {now.isoformat()}")

    def _get_magic_number(self, asset: str, direction: str) -> int:
        """Generate unique magic number for position tracking."""
        asset_codes = {"BTCUSD": 100000, "ETHUSD": 200000, "XAUUSD": 300000}
        direction_codes = {"LONG": 1, "SHORT": 2}
        return asset_codes.get(asset, 0) + direction_codes.get(direction, 0)


# ============================================================================
# SELF-IMPROVEMENT MODULE
# ============================================================================

class SelfImprovementEngine:
    """
    Analyzes performance and makes bounded parameter adjustments.
    Runs daily at 00:05 UTC.
    """

    def __init__(self, config: Config, database):
        self.config = config
        self.db = database

    def run_daily(self, risk_state: RiskEngineState) -> dict:
        """Execute daily self-improvement cycle."""
        changes = []

        # 1. Asset reallocation
        new_weights = self._compute_dynamic_allocation(risk_state)
        if new_weights != risk_state.allocation_weights:
            changes.append({"type": "allocation", "old": risk_state.allocation_weights,
                            "new": new_weights})
            risk_state.allocation_weights = new_weights

        # 2. Weekly: signal threshold adjustment
        if self._is_weekly_day():
            threshold_change = self._adjust_signal_threshold(risk_state)
            if threshold_change:
                changes.append(threshold_change)

        # 3. Weekly: SL distance tuning
        if self._is_weekly_day():
            sl_change = self._adjust_sl_distance(risk_state)
            if sl_change:
                changes.append(sl_change)

        # 4. Enforce hard bounds (safety net)
        self._enforce_hard_bounds()

        # 5. Log changes
        if changes:
            self.db.log_self_improvement(changes)
            logging.info(f"Self-improvement: {len(changes)} adjustments made")

        return {"changes": changes, "timestamp": datetime.now(timezone.utc).isoformat()}

    def _compute_dynamic_allocation(self, risk_state: RiskEngineState) -> dict:
        """Compute new allocation weights based on performance."""
        raw = {}
        for asset in Config.ASSETS:
            base = Config.BASE_ALLOCATION[asset]
            perf = self._asset_performance_score(asset)
            regime = self._regime_suitability(risk_state.regime_by_asset.get(asset, "TRENDING_WEAK"))
            raw[asset] = base * perf * regime

        # Normalize
        total = sum(raw.values())
        if total == 0:
            return Config.BASE_ALLOCATION.copy()
        normalized = {k: v / total for k, v in raw.items()}

        # Apply bounds
        for asset in normalized:
            normalized[asset] = max(Config.ALLOCATION_MIN,
                                    min(Config.ALLOCATION_MAX, normalized[asset]))

        # Re-normalize after bounding
        total = sum(normalized.values())
        normalized = {k: v / total for k, v in normalized.items()}

        # Apply max daily change
        current = risk_state.allocation_weights
        for asset in normalized:
            change = normalized[asset] - current.get(asset, 0.33)
            if abs(change) > 0.10:
                change = 0.10 if change > 0 else -0.10
            normalized[asset] = current.get(asset, 0.33) + change

        # Final normalize
        total = sum(normalized.values())
        return {k: round(v / total, 4) for k, v in normalized.items()}

    def _asset_performance_score(self, asset: str) -> float:
        """Score asset based on recent 20-trade performance."""
        trades = self.db.get_recent_trades(asset, count=20)
        if len(trades) < 5:
            return 1.0

        win_rate = sum(1 for t in trades if t["pnl"] > 0) / len(trades)
        winning = [t for t in trades if t["pnl"] > 0]
        avg_rr = (sum(t["actual_rr"] for t in winning) / len(winning)) if winning else 0
        gross_profit = sum(t["pnl"] for t in trades if t["pnl"] > 0)
        gross_loss = abs(sum(t["pnl"] for t in trades if t["pnl"] < 0))
        pf = gross_profit / max(1, gross_loss)

        score = (
            (win_rate / 0.50) * 0.30 +
            (avg_rr / 2.0) * 0.30 +
            (min(pf, 3.0) / 1.5) * 0.40
        )
        return max(0.3, min(2.0, score))

    def _regime_suitability(self, regime: str) -> float:
        suitability = {
            "TRENDING_STRONG": 1.5, "VOLATILE_EXPANSION": 1.4,
            "TRENDING_WEAK": 0.8, "VOLATILE_CHAOTIC": 0.5,
            "RANGING": 0.1, "LOW_VOLATILITY": 0.2,
        }
        return suitability.get(regime, 0.5)

    def _adjust_signal_threshold(self, risk_state: RiskEngineState) -> Optional[dict]:
        """Adjust signal quality threshold based on win rate trends."""
        # Implementation: see design doc section 5.3
        pass

    def _adjust_sl_distance(self, risk_state: RiskEngineState) -> Optional[dict]:
        """Adjust ATR multiplier for SL based on stop-hit rate."""
        # Implementation: see design doc section 5.3
        pass

    def _enforce_hard_bounds(self):
        """Safety: verify no parameter exceeds allowed bounds."""
        # This is the absolute safety net
        # See design doc for complete list
        pass

    def _is_weekly_day(self) -> bool:
        return datetime.now(timezone.utc).weekday() == 0  # Monday


# ============================================================================
# MAIN ENGINE LOOP
# ============================================================================

class OpenClawEngine:
    """
    Main orchestrator. Runs the continuous trading loop.
    """

    def __init__(self):
        self.config = Config()
        self.data_manager = MarketDataManager()
        self.regime_detector = RegimeDetector(self.data_manager)
        self.alignment_engine = MTFAlignmentEngine(self.data_manager)
        self.vol_detector = VolatilityExpansionDetector(self.data_manager, self.regime_detector)
        self.signal_generator = SignalGenerator(
            self.data_manager, self.regime_detector,
            self.alignment_engine, self.vol_detector
        )
        self.risk_engine = RiskEngine(self.config)
        self.kill_switch = KillSwitchController(self.risk_engine)
        self.publisher = SignalPublisher(Config.SIGNAL_DIR)
        self.self_improvement = None  # Initialized after DB connection
        self.running = True

    def initialize(self):
        """Initialize all components."""
        logging.info("OpenClaw Engine initializing...")

        # 1. Connect to MT5
        # mt5.initialize()

        # 2. Connect to database
        # self.db = Database(...)
        # self.self_improvement = SelfImprovementEngine(self.config, self.db)

        # 3. Load historical data
        self.data_manager.initialize()

        # 4. Load saved state (allocation weights, etc.)
        # self.risk_engine.state.allocation_weights = self.db.load_allocation()

        # 5. Initial regime classification
        for asset in Config.ASSETS:
            regime = self.regime_detector.classify(asset)
            self.risk_engine.state.regime_by_asset[asset] = regime.regime

        logging.info("OpenClaw Engine initialized successfully")

    def run(self):
        """Main loop — runs continuously 24/7."""
        self.initialize()

        last_heartbeat = 0
        last_signal_eval = 0
        last_regime_update = 0
        last_daily_reset = None

        logging.info("OpenClaw Engine running...")

        while self.running:
            try:
                now = time.time()
                utc_now = datetime.now(timezone.utc)

                # === Every 1 second: Heartbeat + State Update ===
                if now - last_heartbeat >= 1:
                    self._update_state()
                    mode = self.kill_switch.evaluate()
                    self.risk_engine.state.mode = mode
                    self.publisher.publish_heartbeat(self.risk_engine.state)
                    last_heartbeat = now

                    # Emergency handling
                    if mode in (OperationalMode.HALTED, OperationalMode.EMERGENCY):
                        self.publisher.publish_close_all()

                # === Every 5 minutes: Regime Update ===
                if now - last_regime_update >= 300:
                    for asset in Config.ASSETS:
                        self._update_data(asset)
                        regime = self.regime_detector.classify(asset)
                        self.risk_engine.state.regime_by_asset[asset] = regime.regime
                    last_regime_update = now

                # === On new candle close: Signal Evaluation ===
                if now - last_signal_eval >= 60:  # Check every minute
                    if self.risk_engine.state.mode in (OperationalMode.NORMAL,
                                                       OperationalMode.REDUCED):
                        for asset in Config.ASSETS:
                            self._update_data(asset)
                            signal = self.signal_generator.evaluate(asset)
                            if signal:
                                approved = self.risk_engine.process_signal(signal)
                                if approved:
                                    self.publisher.publish(approved)
                                    # self.db.log_signal(approved)
                    last_signal_eval = now

                # === Daily reset at 00:00 UTC ===
                if utc_now.date() != last_daily_reset:
                    self._daily_reset(utc_now)
                    last_daily_reset = utc_now.date()

                # Sleep briefly to avoid busy-waiting
                time.sleep(0.1)

            except KeyboardInterrupt:
                logging.info("Shutdown requested by operator")
                self.running = False
            except Exception as e:
                logging.error(f"Main loop error: {e}", exc_info=True)
                # Don't crash — log and continue
                time.sleep(1)

        self.shutdown()

    def _update_state(self):
        """Update risk engine with latest account state."""
        # account_info = mt5.account_info()
        # positions = mt5.positions_get()
        # self.risk_engine.update_state(account_info, positions, ...)
        pass

    def _update_data(self, asset: str):
        """Update market data for all relevant timeframes."""
        for tf in [Config.STRATEGIC_TF, Config.TACTICAL_TF,
                   Config.OPERATIONAL_TF, Config.ENTRY_TF]:
            self.data_manager.update(asset, tf)

    def _daily_reset(self, utc_now: datetime):
        """Daily maintenance at 00:00 UTC."""
        logging.info("=== Daily Reset ===")

        # Reset daily watermark
        self.risk_engine.state.daily_high_watermark = self.risk_engine.state.account_equity
        self.risk_engine.state.trades_today = 0

        # Monthly reset on 1st
        if utc_now.day == 1:
            self.risk_engine.state.monthly_high_watermark = self.risk_engine.state.account_equity

        # Run self-improvement (at 00:05)
        # if self.self_improvement:
        #     self.self_improvement.run_daily(self.risk_engine.state)

        # Log daily summary
        # self.db.log_daily_summary(...)

    def shutdown(self):
        """Graceful shutdown."""
        logging.info("OpenClaw Engine shutting down...")
        # Close DB connections, save state, etc.
        # mt5.shutdown()


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=[
            logging.FileHandler("openclaw_engine.log"),
            logging.StreamHandler()
        ]
    )

    engine = OpenClawEngine()
    engine.run()
