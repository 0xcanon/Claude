"""
OpenClaw Decision Engine — Pseudocode Implementation
=====================================================

This is the central brain of the autonomous trading system.
It runs as a persistent Python process on the VPS, connecting
to MetaTrader 5 via the mt5 Python package for data, and
communicating trade signals to the EA via JSON files.

NOT production code — this is structural pseudocode showing
exact logic flow, data structures, and decision paths.
"""

import json
import hashlib
import time
import os
import logging
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional
from pathlib import Path
from decimal import Decimal

import MetaTrader5 as mt5
import numpy as np
import pandas as pd
import redis
import psycopg2

# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

ASSETS = ["BTCUSD", "ETHUSD", "XAUUSD"]
TIMEFRAMES = {
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
}

BASE_RISK_PCT = 0.02           # 2% per trade
MAX_RISK_PCT = 0.025           # 2.5% absolute ceiling (elevated state)
MAX_PORTFOLIO_RISK = 0.06      # 6% total open risk
MAX_CONCURRENT_PER_ASSET = 2
MAX_CONCURRENT_TOTAL = 4
MIN_RR_RATIO = 2.0
SIGNAL_EXPIRY_SECONDS = 300    # 5 minutes

DAILY_DD_WARNING = 0.03
DAILY_DD_SOFT_HALT = 0.04
DAILY_DD_HARD_HALT = 0.05
MONTHLY_DD_WARNING = 0.06
MONTHLY_DD_SOFT_HALT = 0.08
MONTHLY_DD_HARD_HALT = 0.10

SL_MULTIPLIER = {"BTCUSD": 1.5, "ETHUSD": 1.5, "XAUUSD": 1.2}
SL_MIN = {"BTCUSD": 150, "ETHUSD": 10, "XAUUSD": 3.0}
SL_MAX = {"BTCUSD": 1200, "ETHUSD": 80, "XAUUSD": 25.0}

SHARED_DIR = Path("/shared")
SIGNAL_DIR = SHARED_DIR / "signals" / "pending"
HEARTBEAT_FILE = SHARED_DIR / "heartbeat" / "brain.json"
KILL_SWITCH_FILE = SHARED_DIR / "control" / "kill_switch.json"

ALLOCATION_REBALANCE_HOURS = 4
HEARTBEAT_INTERVAL_SEC = 10
MAIN_LOOP_INTERVAL_SEC = 5

logger = logging.getLogger("openclaw_brain")


# ═══════════════════════════════════════════════════════════════════
# ENUMS AND DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════

class Regime(Enum):
    TRENDING_UP = "TRENDING_UP"
    TRENDING_DOWN = "TRENDING_DOWN"
    VOLATILE_EXPANSION = "VOLATILE_EXPANSION"
    VOLATILE_CONTRACTION = "VOLATILE_CONTRACTION"
    RANGING = "RANGING"
    UNKNOWN = "UNKNOWN"


class RiskState(Enum):
    NORMAL = "NORMAL"
    CAUTION = "CAUTION"         # 75% risk (consecutive losses)
    REDUCED = "REDUCED"         # 50% risk (drawdown/vol)
    ELEVATED = "ELEVATED"       # 125% risk (hot streak)
    CRITICAL = "CRITICAL"       # 25% risk (near cap)
    HALTED = "HALTED"           # 0% risk (kill switch)


@dataclass
class MarketState:
    asset: str
    regime: dict               # Per-timeframe regime classification
    bias: dict                 # Per-timeframe directional bias
    mtf_alignment: dict        # Multi-timeframe alignment result
    volatility: dict           # Volatility scores
    trend_strength: dict       # ADX-based trend strength
    structure: dict            # Price structure (HH/HL/LL/LH)
    atr: dict                  # ATR values per timeframe
    current_price: float
    spread: float
    timestamp: datetime


@dataclass
class Signal:
    signal_id: str
    asset: str
    action: str
    entry_price_reference: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: float
    take_profit_3: Optional[float]
    position_size_lots: float
    risk_percent: float
    risk_usd: float
    sl_distance_usd: float
    rr_ratio: float
    trailing_stop: dict
    partial_close: dict
    context: dict
    timestamp_utc: str
    expires_utc: str


@dataclass
class SystemState:
    risk_state: RiskState = RiskState.NORMAL
    consecutive_losses: int = 0
    consecutive_wins: int = 0
    daily_start_equity: float = 0.0
    monthly_start_equity: float = 0.0
    current_equity: float = 0.0
    daily_drawdown_pct: float = 0.0
    monthly_drawdown_pct: float = 0.0
    allocation_weights: dict = field(default_factory=lambda: {
        "BTCUSD": 0.334, "ETHUSD": 0.333, "XAUUSD": 0.333
    })
    last_allocation_rebalance: datetime = None
    open_positions: list = field(default_factory=list)
    signals_today: int = 0
    fills_today: int = 0
    halted: bool = False
    halt_reason: str = ""
    halt_until: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════════
# INITIALIZATION
# ═══════════════════════════════════════════════════════════════════

class OpenClawBrain:

    def __init__(self):
        # Connect to MT5
        if not mt5.initialize():
            raise RuntimeError(f"MT5 init failed: {mt5.last_error()}")
        logger.info("MT5 initialized")

        # Connect to Redis
        self.redis = redis.Redis(host="localhost", port=6379, db=0)

        # Connect to PostgreSQL
        self.db = psycopg2.connect(
            host="localhost", dbname="trading", user="trader", password="***"
        )

        # Initialize state
        self.state = SystemState()
        self._load_persisted_state()
        self._initialize_equity_snapshots()

        # Ensure directories exist
        for d in [SIGNAL_DIR, SHARED_DIR / "heartbeat",
                  SHARED_DIR / "control", SHARED_DIR / "signals" / "filled",
                  SHARED_DIR / "signals" / "rejected",
                  SHARED_DIR / "signals" / "processed"]:
            d.mkdir(parents=True, exist_ok=True)

        logger.info("OpenClaw Brain initialized")

    def _load_persisted_state(self):
        """Load state from database (survives restarts)."""
        # Check for active halt
        if KILL_SWITCH_FILE.exists():
            ks = json.loads(KILL_SWITCH_FILE.read_text())
            if ks.get("activated"):
                resume_after = datetime.fromisoformat(ks.get("resume_after_utc", ""))
                if datetime.now(timezone.utc) < resume_after:
                    self.state.halted = True
                    self.state.halt_reason = ks["reason"]
                    self.state.halt_until = resume_after
                    self.state.risk_state = RiskState.HALTED
                    logger.warning(f"Resuming in halt state: {ks['reason']}")

        # Load allocation weights from last snapshot
        cursor = self.db.cursor()
        cursor.execute("""
            SELECT weights FROM allocation_history
            ORDER BY timestamp_utc DESC LIMIT 1
        """)
        row = cursor.fetchone()
        if row:
            self.state.allocation_weights = json.loads(row[0])

        # Load consecutive loss count
        cursor.execute("""
            SELECT COUNT(*) FROM (
                SELECT pnl_net FROM trade_journal
                ORDER BY exit_time_utc DESC
            ) sub WHERE pnl_net < 0
            -- This needs proper sequential logic; simplified here
        """)

    def _initialize_equity_snapshots(self):
        """Set daily and monthly equity baselines."""
        info = mt5.account_info()
        self.state.current_equity = info.equity

        # Check if daily snapshot exists for today
        today = datetime.now(timezone.utc).date()
        cursor = self.db.cursor()
        cursor.execute("""
            SELECT equity FROM daily_equity_snapshot
            WHERE date = %s
        """, (today,))
        row = cursor.fetchone()

        if row:
            self.state.daily_start_equity = row[0]
        else:
            self.state.daily_start_equity = info.equity
            cursor.execute("""
                INSERT INTO daily_equity_snapshot (date, equity)
                VALUES (%s, %s)
            """, (today, info.equity))
            self.db.commit()

        # Monthly baseline
        first_of_month = today.replace(day=1)
        cursor.execute("""
            SELECT equity FROM monthly_equity_snapshot
            WHERE month_start = %s
        """, (first_of_month,))
        row = cursor.fetchone()

        if row:
            self.state.monthly_start_equity = row[0]
        else:
            self.state.monthly_start_equity = info.equity
            cursor.execute("""
                INSERT INTO monthly_equity_snapshot (month_start, equity)
                VALUES (%s, %s)
            """, (first_of_month, info.equity))
            self.db.commit()


    # ═══════════════════════════════════════════════════════════════
    # MAIN LOOP
    # ═══════════════════════════════════════════════════════════════

    def run(self):
        """
        Main loop. Runs continuously on VPS.
        """
        logger.info("Starting main loop")
        last_heartbeat = 0
        last_allocation_check = 0
        last_equity_snapshot = 0

        while True:
            try:
                now = time.time()

                # ── Heartbeat ──
                if now - last_heartbeat >= HEARTBEAT_INTERVAL_SEC:
                    self._send_heartbeat()
                    self._check_ea_heartbeat()
                    last_heartbeat = now

                # ── Check halt state ──
                if self.state.halted:
                    if self.state.halt_until and \
                       datetime.now(timezone.utc) >= self.state.halt_until:
                        self._exit_halt()
                    else:
                        time.sleep(MAIN_LOOP_INTERVAL_SEC)
                        continue

                # ── Update equity and drawdown ──
                self._update_equity()
                self._check_drawdown_guards()

                if self.state.risk_state == RiskState.HALTED:
                    time.sleep(MAIN_LOOP_INTERVAL_SEC)
                    continue

                # ── Process fill confirmations ──
                self._process_confirmations()

                # ── Allocation rebalance ──
                if now - last_allocation_check >= ALLOCATION_REBALANCE_HOURS * 3600:
                    self._rebalance_allocations()
                    last_allocation_check = now

                # ── Equity snapshot ──
                if now - last_equity_snapshot >= 300:  # Every 5 minutes
                    self._record_equity_snapshot()
                    last_equity_snapshot = now

                # ── Core: Analyze markets and generate signals ──
                for asset in ASSETS:
                    self._evaluate_asset(asset)

                # ── Manage open positions (trailing stops, partials) ──
                self._manage_positions()

                time.sleep(MAIN_LOOP_INTERVAL_SEC)

            except KeyboardInterrupt:
                logger.info("Shutdown requested")
                break
            except Exception as e:
                logger.exception(f"Main loop error: {e}")
                self._send_alert(f"Brain error: {e}")
                time.sleep(30)  # Back off on error


    # ═══════════════════════════════════════════════════════════════
    # MARKET ANALYSIS
    # ═══════════════════════════════════════════════════════════════

    def _evaluate_asset(self, asset: str):
        """
        Full evaluation pipeline for a single asset.
        This is where intelligence lives.
        """
        # Step 1: Build market state
        market = self._build_market_state(asset)

        # Step 2: Check regime — is this asset tradeable right now?
        h1_regime = market.regime["H1"]
        h4_regime = market.regime["H4"]

        tradeable_regimes = {
            Regime.VOLATILE_EXPANSION,
            Regime.TRENDING_UP,
            Regime.TRENDING_DOWN
        }

        if h1_regime not in tradeable_regimes:
            logger.debug(f"{asset} H1 regime {h1_regime.value} — skipping")
            return

        if h4_regime == Regime.RANGING:
            logger.debug(f"{asset} H4 RANGING — skipping")
            return

        # Step 3: Check volatility — is expansion happening?
        vol_score = market.volatility["H1"]
        if not vol_score["tradeable"]:
            logger.debug(f"{asset} volatility score {vol_score['score']} — below threshold")
            return

        # Step 4: Check multi-timeframe alignment
        mtf = market.mtf_alignment
        if abs(mtf["total_bias"]) < 0.30:
            logger.debug(f"{asset} MTF bias {mtf['total_bias']:.2f} — too weak")
            return

        # Step 5: Check veto conditions
        vetos = self._check_vetos(asset, mtf)
        if vetos:
            logger.debug(f"{asset} vetoed: {vetos}")
            return

        # Step 6: Check trend strength
        trend = market.trend_strength["H1"]
        if not trend["tradeable"]:
            logger.debug(f"{asset} ADX {trend['adx']:.1f} — trend not strong enough")
            return

        # Step 7: Check price structure
        structure = market.structure["H1"]
        direction = mtf["direction"]
        if direction == "LONG" and structure["structure"] != "BULLISH":
            logger.debug(f"{asset} structure {structure['structure']} — not bullish for long")
            return
        if direction == "SHORT" and structure["structure"] != "BEARISH":
            logger.debug(f"{asset} structure {structure['structure']} — not bearish for short")
            return

        # Step 8: Check for entry trigger on M15
        triggers = self._detect_entry_triggers(asset, direction)
        if not triggers:
            logger.debug(f"{asset} no M15 entry trigger — waiting")
            return

        best_trigger = max(triggers, key=lambda t: t["confidence"])

        # Step 9: Compute stop-loss and take-profits
        entry_price = market.current_price
        atr_h1 = market.atr["H1"]
        sl_dist = atr_h1 * SL_MULTIPLIER[asset]

        # Enforce SL bounds
        if sl_dist < SL_MIN[asset]:
            sl_dist = SL_MIN[asset]
        if sl_dist > SL_MAX[asset]:
            logger.info(f"{asset} SL distance {sl_dist:.2f} exceeds max — skipping")
            return

        if direction == "LONG":
            stop_loss = entry_price - sl_dist
            tp1 = entry_price + sl_dist * 2.0
            tp2 = entry_price + sl_dist * 3.0
            tp3 = entry_price + sl_dist * 5.0
        else:
            stop_loss = entry_price + sl_dist
            tp1 = entry_price - sl_dist * 2.0
            tp2 = entry_price - sl_dist * 3.0
            tp3 = entry_price - sl_dist * 5.0

        rr_ratio = 2.0  # TP1 is always 1:2

        # Step 10: Risk engine — position sizing
        risk_pct = self._compute_adjusted_risk(asset, market)
        if risk_pct <= 0:
            logger.info(f"{asset} adjusted risk is zero — no trade")
            return

        position_size = self._compute_position_size(
            asset, risk_pct, sl_dist, entry_price
        )
        if position_size <= 0:
            logger.info(f"{asset} position size zero after all adjustments")
            return

        risk_usd = self.state.current_equity * risk_pct

        # Step 11: Pre-trade risk checklist
        if not self._pre_trade_risk_check(asset, risk_pct, risk_usd, stop_loss, rr_ratio):
            return

        # Step 12: Generate and dispatch signal
        signal = self._build_signal(
            asset=asset,
            action=f"OPEN_{direction}",
            entry_price=entry_price,
            stop_loss=stop_loss,
            tp1=tp1, tp2=tp2, tp3=tp3,
            lots=position_size,
            risk_pct=risk_pct,
            risk_usd=risk_usd,
            sl_dist=sl_dist,
            rr_ratio=rr_ratio,
            trigger=best_trigger,
            market=market
        )

        self._dispatch_signal(signal)
        logger.info(
            f"SIGNAL: {signal.signal_id} | {asset} {direction} | "
            f"Entry~{entry_price:.2f} SL={stop_loss:.2f} TP1={tp1:.2f} | "
            f"Lots={position_size:.4f} Risk={risk_pct:.2%}"
        )

    def _build_market_state(self, asset: str) -> MarketState:
        """Compute all indicators and classify market state."""
        regimes = {}
        biases = {}
        atr_values = {}

        for tf_name, tf_const in TIMEFRAMES.items():
            bars = mt5.copy_rates_from_pos(asset, tf_const, 0, 200)
            df = pd.DataFrame(bars)
            df['time'] = pd.to_datetime(df['time'], unit='s')

            # Compute indicators
            atr_val = self._compute_atr(df, period=14)
            atr_values[tf_name] = atr_val

            if tf_name in ["H1", "H4", "D1"]:
                regimes[tf_name] = self._classify_regime(df, atr_val)
                biases[tf_name] = self._compute_bias(df)

        # M15 bias for alignment
        m15_bars = mt5.copy_rates_from_pos(asset, TIMEFRAMES["M15"], 0, 200)
        m15_df = pd.DataFrame(m15_bars)
        biases["M15"] = self._compute_bias(m15_df)

        # Multi-timeframe alignment
        mtf = self._compute_mtf_alignment(biases, regimes)

        # Volatility score (H1)
        h1_bars = mt5.copy_rates_from_pos(asset, TIMEFRAMES["H1"], 0, 200)
        h1_df = pd.DataFrame(h1_bars)
        vol_score_h1 = self._compute_volatility_score(h1_df, atr_values["H1"])

        # Trend strength
        trend_h1 = self._assess_trend_strength(h1_df)

        # Price structure
        struct_h1 = self._analyze_structure(h1_df, atr_values["H1"])

        # Current price and spread
        tick = mt5.symbol_info_tick(asset)
        current_price = tick.bid
        spread = tick.ask - tick.bid

        return MarketState(
            asset=asset,
            regime=regimes,
            bias=biases,
            mtf_alignment=mtf,
            volatility={"H1": vol_score_h1},
            trend_strength={"H1": trend_h1},
            structure={"H1": struct_h1},
            atr=atr_values,
            current_price=current_price,
            spread=spread,
            timestamp=datetime.now(timezone.utc)
        )

    def _classify_regime(self, df: pd.DataFrame, atr: float) -> Regime:
        """See 03-VOLATILITY-TREND-MODEL.md Section 1.2"""
        adx = self._compute_adx(df, period=14)
        bb_width = self._compute_bb_width(df, period=20, std=2.0)
        bb_percentile = self._percentile_rank(bb_width, df, lookback=100)
        ema20 = df['close'].ewm(span=20).mean().iloc[-1]
        ema50 = df['close'].ewm(span=50).mean().iloc[-1]
        price = df['close'].iloc[-1]
        atr_sma = df['close'].rolling(20).apply(
            lambda x: self._compute_atr(df.iloc[-20:], 14)
        ).iloc[-1] if len(df) >= 20 else atr
        vol_ratio = atr / max(atr_sma, 0.0001)

        slope = np.polyfit(range(20), df['close'].iloc[-20:].values, 1)[0]
        slope_norm = slope / max(atr, 0.0001)

        hh_hl = self._check_hh_hl(df)
        ll_lh = self._check_ll_lh(df)

        if adx < 20 and bb_percentile < 30:
            return Regime.RANGING

        if adx < 20 and bb_percentile < 15:
            return Regime.VOLATILE_CONTRACTION

        if vol_ratio > 1.3 and bb_percentile > 60:
            return Regime.VOLATILE_EXPANSION

        if adx > 25:
            if ema20 > ema50 and price > ema20 and hh_hl:
                return Regime.TRENDING_UP
            elif ema20 < ema50 and price < ema20 and ll_lh:
                return Regime.TRENDING_DOWN

        return Regime.UNKNOWN

    def _compute_bias(self, df: pd.DataFrame) -> float:
        """See 03-VOLATILITY-TREND-MODEL.md Section 2.2. Returns -1.0 to +1.0"""
        ema9 = df['close'].ewm(span=9).mean().iloc[-1]
        ema21 = df['close'].ewm(span=21).mean().iloc[-1]
        ema50 = df['close'].ewm(span=50).mean().iloc[-1]
        price = df['close'].iloc[-1]
        rsi = self._compute_rsi(df, period=14)
        macd_hist = self._compute_macd_histogram(df)

        score = 0.0

        # EMA stack
        if ema9 > ema21 > ema50:
            score += 0.4
        elif ema9 < ema21 < ema50:
            score -= 0.4
        elif ema9 > ema21:
            score += 0.15
        elif ema9 < ema21:
            score -= 0.15

        # Price vs EMAs
        if price > ema9 > ema50:
            score += 0.25
        elif price < ema9 < ema50:
            score -= 0.25
        elif price > ema21:
            score += 0.1
        elif price < ema21:
            score -= 0.1

        # RSI
        if rsi > 60:
            score += 0.15 * min((rsi - 50) / 30, 1.0)
        elif rsi < 40:
            score -= 0.15 * min((50 - rsi) / 30, 1.0)

        # MACD
        if macd_hist > 0:
            score += 0.2
        elif macd_hist < 0:
            score -= 0.2

        return max(-1.0, min(1.0, score))

    def _compute_mtf_alignment(self, biases: dict, regimes: dict) -> dict:
        """See 03-VOLATILITY-TREND-MODEL.md Section 2.1"""
        weights = {"D1": 0.10, "H4": 0.25, "H1": 0.35, "M15": 0.30}
        total_bias = 0.0
        details = {}

        for tf, weight in weights.items():
            bias = biases.get(tf, 0.0)
            total_bias += bias * weight
            details[tf] = {
                "bias": bias,
                "regime": regimes.get(tf, Regime.UNKNOWN).value if tf in regimes else "N/A",
                "weighted_bias": bias * weight
            }

        bias_values = [biases.get(tf, 0.0) for tf in weights]
        all_positive = all(b > 0 for b in bias_values)
        all_negative = all(b < 0 for b in bias_values)
        alignment = "STRONG" if (all_positive or all_negative) else "MIXED"

        return {
            "total_bias": total_bias,
            "alignment_quality": alignment,
            "direction": "LONG" if total_bias > 0 else "SHORT",
            "details": details
        }


    # ═══════════════════════════════════════════════════════════════
    # RISK ENGINE
    # ═══════════════════════════════════════════════════════════════

    def _compute_adjusted_risk(self, asset: str, market: MarketState) -> float:
        """
        Compute risk percentage after all adjustments.
        See 01-RISK-ENGINE.md.
        """
        base = BASE_RISK_PCT

        # 1. Volatility scaling
        atr_h1 = market.atr["H1"]
        atr_sma = self._get_atr_sma(asset, "H1", 20)
        vol_ratio = atr_h1 / max(atr_sma, 0.0001)

        if vol_ratio > 2.0:
            vol_mult = 0.50
        elif vol_ratio > 1.5:
            vol_mult = 0.75
        elif vol_ratio > 1.0:
            vol_mult = 1.00
        elif vol_ratio > 0.6:
            vol_mult = 0.75
        else:
            return 0.0  # Ultra-low vol — no trading

        # 2. Risk state multiplier
        state_mult = {
            RiskState.NORMAL: 1.00,
            RiskState.CAUTION: 0.75,
            RiskState.REDUCED: 0.50,
            RiskState.ELEVATED: 1.25,
            RiskState.CRITICAL: 0.25,
            RiskState.HALTED: 0.00,
        }[self.state.risk_state]

        # 3. Allocation weight scaling
        alloc_weight = self.state.allocation_weights.get(asset, 0.333)
        alloc_mult = alloc_weight / 0.333

        # 4. Consecutive loss adjustment
        if self.state.consecutive_losses >= 7:
            return 0.0
        elif self.state.consecutive_losses >= 5:
            loss_mult = 0.50
        elif self.state.consecutive_losses >= 3:
            loss_mult = 0.75
        else:
            loss_mult = 1.00

        # Combine
        adjusted = base * vol_mult * state_mult * alloc_mult * loss_mult

        # Hard cap
        adjusted = min(adjusted, MAX_RISK_PCT)

        return adjusted

    def _compute_position_size(self, asset: str, risk_pct: float,
                                sl_distance: float, entry_price: float) -> float:
        """
        Compute lot size.
        See 01-RISK-ENGINE.md Section 1.1.
        """
        equity = self.state.current_equity
        risk_usd = equity * risk_pct

        # Point value per lot (asset-dependent)
        symbol_info = mt5.symbol_info(asset)
        if not symbol_info:
            return 0.0

        point_value = symbol_info.trade_tick_value
        tick_size = symbol_info.trade_tick_size
        sl_ticks = sl_distance / tick_size

        lots = risk_usd / (sl_ticks * point_value)

        # Enforce broker constraints
        lots = max(lots, symbol_info.volume_min)
        lots = min(lots, symbol_info.volume_max)

        # Round to lot step
        lot_step = symbol_info.volume_step
        lots = round(lots / lot_step) * lot_step

        # Asset-specific caps
        max_lots = {"BTCUSD": 5.0, "ETHUSD": 50.0, "XAUUSD": 10.0}
        lots = min(lots, max_lots.get(asset, 1.0))

        return lots

    def _pre_trade_risk_check(self, asset: str, risk_pct: float,
                               risk_usd: float, stop_loss: float,
                               rr_ratio: float) -> bool:
        """
        Full pre-trade risk checklist.
        See 01-RISK-ENGINE.md Section 5.
        """
        checks = []

        # SL defined
        checks.append(("SL_DEFINED", stop_loss is not None and stop_loss > 0))

        # Risk within bounds
        checks.append(("RISK_WITHIN_BOUNDS", risk_pct <= MAX_RISK_PCT))

        # Portfolio risk
        current_risk = self._compute_total_portfolio_risk()
        checks.append(("PORTFOLIO_RISK", current_risk + risk_pct <= MAX_PORTFOLIO_RISK))

        # Drawdown guards
        checks.append(("DAILY_DD", self.state.daily_drawdown_pct < DAILY_DD_SOFT_HALT))
        checks.append(("MONTHLY_DD", self.state.monthly_drawdown_pct < MONTHLY_DD_SOFT_HALT))

        # Consecutive losses
        checks.append(("CONSEC_LOSSES", self.state.consecutive_losses < 7))

        # Position limits
        asset_positions = sum(
            1 for p in self.state.open_positions if p.get("asset") == asset
        )
        checks.append(("ASSET_POS_LIMIT", asset_positions < MAX_CONCURRENT_PER_ASSET))
        checks.append(("TOTAL_POS_LIMIT",
                       len(self.state.open_positions) < MAX_CONCURRENT_TOTAL))

        # R:R ratio
        checks.append(("MIN_RR", rr_ratio >= MIN_RR_RATIO))

        # Spread check
        tick = mt5.symbol_info_tick(asset)
        spread = tick.ask - tick.bid
        typical_spread = self._get_typical_spread(asset)
        checks.append(("SPREAD_OK", spread <= typical_spread * 2))

        # EA heartbeat
        ea_alive = self._is_ea_alive()
        checks.append(("EA_HEARTBEAT", ea_alive))

        # Kill switch clear
        checks.append(("NO_KILL_SWITCH", not self.state.halted))

        # Evaluate
        failed = [name for name, passed in checks if not passed]
        if failed:
            logger.warning(f"Pre-trade check failed for {asset}: {failed}")
            self._log_signal_rejection(asset, failed)
            return False

        return True


    # ═══════════════════════════════════════════════════════════════
    # DRAWDOWN MANAGEMENT
    # ═══════════════════════════════════════════════════════════════

    def _update_equity(self):
        """Update equity and drawdown calculations."""
        info = mt5.account_info()
        self.state.current_equity = info.equity

        # Daily drawdown
        if self.state.daily_start_equity > 0:
            self.state.daily_drawdown_pct = max(0, (
                self.state.daily_start_equity - info.equity
            ) / self.state.daily_start_equity)

        # Monthly drawdown
        if self.state.monthly_start_equity > 0:
            self.state.monthly_drawdown_pct = max(0, (
                self.state.monthly_start_equity - info.equity
            ) / self.state.monthly_start_equity)

    def _check_drawdown_guards(self):
        """Enforce drawdown protection. See 01-RISK-ENGINE.md Section 2."""
        dd = self.state.daily_drawdown_pct
        mdd = self.state.monthly_drawdown_pct

        # Daily guards
        if dd >= DAILY_DD_HARD_HALT:
            self._activate_kill_switch(
                f"Daily drawdown {dd:.1%} exceeded hard halt {DAILY_DD_HARD_HALT:.1%}",
                halt_hours=24
            )
            return
        elif dd >= DAILY_DD_SOFT_HALT:
            if self.state.risk_state != RiskState.HALTED:
                self.state.risk_state = RiskState.HALTED
                logger.warning(f"SOFT HALT: Daily DD {dd:.1%}")
                self._send_alert(f"Daily DD soft halt: {dd:.1%}")
        elif dd >= DAILY_DD_WARNING:
            if self.state.risk_state == RiskState.NORMAL:
                self.state.risk_state = RiskState.REDUCED
                logger.warning(f"Daily DD warning: {dd:.1%}")
                self._send_alert(f"Daily DD warning: {dd:.1%}")

        # Monthly guards
        if mdd >= MONTHLY_DD_HARD_HALT:
            self._activate_kill_switch(
                f"Monthly drawdown {mdd:.1%} exceeded hard halt",
                halt_hours=None  # Manual restart required
            )
            return
        elif mdd >= MONTHLY_DD_SOFT_HALT:
            if self.state.risk_state not in (RiskState.HALTED,):
                self.state.risk_state = RiskState.HALTED
                logger.warning(f"Monthly SOFT HALT: {mdd:.1%}")
                self._send_alert(f"Monthly DD soft halt: {mdd:.1%}")
        elif mdd >= MONTHLY_DD_WARNING:
            if self.state.risk_state in (RiskState.NORMAL, RiskState.ELEVATED):
                self.state.risk_state = RiskState.REDUCED
                logger.warning(f"Monthly DD warning: {mdd:.1%}")


    # ═══════════════════════════════════════════════════════════════
    # SIGNAL DISPATCH
    # ═══════════════════════════════════════════════════════════════

    def _build_signal(self, asset, action, entry_price, stop_loss,
                      tp1, tp2, tp3, lots, risk_pct, risk_usd,
                      sl_dist, rr_ratio, trigger, market) -> Signal:
        """Construct a Signal object with full context."""
        now = datetime.now(timezone.utc)
        direction_code = "L" if "LONG" in action else "S"
        rand_hex = os.urandom(2).hex()
        signal_id = f"SIG-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}-{asset}-{direction_code}-{rand_hex}"

        return Signal(
            signal_id=signal_id,
            asset=asset,
            action=action,
            entry_price_reference=entry_price,
            stop_loss=stop_loss,
            take_profit_1=tp1,
            take_profit_2=tp2,
            take_profit_3=tp3,
            position_size_lots=lots,
            risk_percent=risk_pct,
            risk_usd=risk_usd,
            sl_distance_usd=sl_dist,
            rr_ratio=rr_ratio,
            trailing_stop={
                "enabled": True,
                "activation_rr": 1.0,
                "trail_distance_atr_mult": 1.0
            },
            partial_close={
                "enabled": True,
                "tp1_close_percent": 50,
                "tp2_close_percent": 30,
                "tp3_close_percent": 20
            },
            context={
                "regime": market.regime.get("H1", Regime.UNKNOWN).value,
                "d1_bias": "BULLISH" if market.bias.get("D1", 0) > 0.15 else
                           "BEARISH" if market.bias.get("D1", 0) < -0.15 else "NEUTRAL",
                "h4_bias": "BULLISH" if market.bias.get("H4", 0) > 0.15 else
                           "BEARISH" if market.bias.get("H4", 0) < -0.15 else "NEUTRAL",
                "h1_trend": market.trend_strength["H1"]["di_bias"],
                "m15_trigger": trigger["type"],
                "atr_h1": market.atr.get("H1", 0),
                "adx_h1": market.trend_strength["H1"]["adx"],
                "vol_ratio": market.volatility["H1"]["atr"]["vol_ratio"],
                "bb_width_percentile": market.volatility["H1"]["squeeze"]["current_percentile"],
                "spread_at_signal": market.spread,
                "consecutive_losses": self.state.consecutive_losses,
                "daily_drawdown_pct": self.state.daily_drawdown_pct,
                "monthly_drawdown_pct": self.state.monthly_drawdown_pct,
                "risk_state": self.state.risk_state.value,
                "allocation_weight": self.state.allocation_weights.get(asset, 0.333),
            },
            timestamp_utc=now.isoformat(),
            expires_utc=(now + timedelta(seconds=SIGNAL_EXPIRY_SECONDS)).isoformat()
        )

    def _dispatch_signal(self, signal: Signal):
        """Write signal to file system and Redis."""
        payload = {
            "signal_id": signal.signal_id,
            "version": "1.0",
            "timestamp_utc": signal.timestamp_utc,
            "expires_utc": signal.expires_utc,
            "action": signal.action,
            "asset": signal.asset,
            "entry_type": "MARKET",
            "entry_price_reference": signal.entry_price_reference,
            "stop_loss": signal.stop_loss,
            "take_profit_1": signal.take_profit_1,
            "take_profit_2": signal.take_profit_2,
            "take_profit_3": signal.take_profit_3,
            "position_size_lots": signal.position_size_lots,
            "risk_percent": signal.risk_percent,
            "risk_usd": signal.risk_usd,
            "sl_distance_usd": signal.sl_distance_usd,
            "rr_ratio": signal.rr_ratio,
            "trailing_stop": signal.trailing_stop,
            "partial_close": signal.partial_close,
            "context": signal.context,
        }

        # Compute checksum
        payload_json = json.dumps(payload, sort_keys=True)
        checksum = "sha256:" + hashlib.sha256(payload_json.encode()).hexdigest()
        payload["checksum"] = checksum

        # Atomic write to file
        filename = f"{signal.signal_id}.json"
        tmp_path = SIGNAL_DIR / f"{filename}.tmp"
        final_path = SIGNAL_DIR / filename

        with open(tmp_path, 'w') as f:
            json.dump(payload, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        tmp_path.rename(final_path)

        # Publish to Redis
        self.redis.publish("signals:new", payload_json)

        # Log to database
        self._log_signal_to_db(signal)

        self.state.signals_today += 1


    # ═══════════════════════════════════════════════════════════════
    # POSITION MANAGEMENT
    # ═══════════════════════════════════════════════════════════════

    def _manage_positions(self):
        """
        Check open positions for trailing stop activation,
        partial close execution, and time-based management.
        """
        positions = mt5.positions_get()
        if not positions:
            return

        for pos in positions:
            if pos.symbol not in ASSETS:
                continue

            atr_h1 = self._get_current_atr(pos.symbol, "H1")
            entry = pos.price_open
            sl = pos.sl
            current = pos.price_current
            sl_dist = abs(entry - sl)

            if sl_dist == 0:
                continue

            # Trailing stop logic
            if pos.type == mt5.ORDER_TYPE_BUY:  # Long
                current_rr = (current - entry) / sl_dist
                if current_rr >= 1.0:
                    trail_sl = current - atr_h1 * 1.0
                    if trail_sl > sl:
                        self._dispatch_modify_sl(pos.ticket, pos.symbol, trail_sl)
            else:  # Short
                current_rr = (entry - current) / sl_dist
                if current_rr >= 1.0:
                    trail_sl = current + atr_h1 * 1.0
                    if trail_sl < sl:
                        self._dispatch_modify_sl(pos.ticket, pos.symbol, trail_sl)


    # ═══════════════════════════════════════════════════════════════
    # ADAPTIVE ALLOCATION
    # ═══════════════════════════════════════════════════════════════

    def _rebalance_allocations(self):
        """
        Rebalance allocation weights across assets.
        See 04-ADAPTIVE-ALLOCATION.md.
        """
        raw_scores = {}
        for asset in ASSETS:
            perf = self._compute_asset_performance(asset, lookback_days=30)
            regime_fav = self._compute_regime_favorability(asset)

            composite = perf["score"] * 0.60 + regime_fav * 0.40

            # Confidence dampening
            if perf["confidence"] == "LOW":
                composite = 50 + (composite - 50) * 0.3
            elif perf["confidence"] == "MEDIUM":
                composite = 50 + (composite - 50) * 0.7

            raw_scores[asset] = composite

        # Normalize
        total = sum(raw_scores.values())
        if total == 0:
            return

        weights = {a: s / total for a, s in raw_scores.items()}

        # Floor/ceiling
        for a in ASSETS:
            weights[a] = max(0.10, min(0.60, weights[a]))

        # Re-normalize
        total = sum(weights.values())
        weights = {a: w / total for a, w in weights.items()}

        # Smooth with previous
        prev = self.state.allocation_weights
        for a in ASSETS:
            weights[a] = weights[a] * 0.80 + prev.get(a, 0.333) * 0.20

        total = sum(weights.values())
        weights = {a: w / total for a, w in weights.items()}

        # Apply correlation adjustment
        weights = self._apply_correlation_adjustment(weights)

        # Log
        logger.info(f"Allocation rebalance: {weights}")
        self._log_allocation_change(prev, weights, raw_scores)

        self.state.allocation_weights = weights
        self.state.last_allocation_rebalance = datetime.now(timezone.utc)


    # ═══════════════════════════════════════════════════════════════
    # KILL SWITCH
    # ═══════════════════════════════════════════════════════════════

    def _activate_kill_switch(self, reason: str, halt_hours: int = None):
        """Activate kill switch. See 05-KILL-SWITCH.md."""
        now = datetime.now(timezone.utc)
        resume_after = now + timedelta(hours=halt_hours) if halt_hours else None

        self.state.halted = True
        self.state.halt_reason = reason
        self.state.halt_until = resume_after
        self.state.risk_state = RiskState.HALTED

        # Write kill switch file
        ks_data = {
            "activated": True,
            "timestamp_utc": now.isoformat(),
            "reason": reason,
            "severity": "CRITICAL",
            "action": "CLOSE_ALL",
            "halt_type": f"HALT_{halt_hours}H" if halt_hours else "HALT_MANUAL",
            "resume_after_utc": resume_after.isoformat() if resume_after else None,
            "equity_at_trigger": self.state.current_equity,
            "daily_start_equity": self.state.daily_start_equity,
            "drawdown_pct": self.state.daily_drawdown_pct,
        }

        tmp = KILL_SWITCH_FILE.with_suffix('.tmp')
        with open(tmp, 'w') as f:
            json.dump(ks_data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        tmp.rename(KILL_SWITCH_FILE)

        # Send close-all signals
        for asset in ASSETS:
            self._dispatch_close_all(asset, reason)

        # Alert
        self._send_alert(f"KILL SWITCH: {reason}")
        logger.critical(f"KILL SWITCH ACTIVATED: {reason}")

        # Log to database
        self._log_kill_switch(ks_data)


    # ═══════════════════════════════════════════════════════════════
    # HEARTBEAT
    # ═══════════════════════════════════════════════════════════════

    def _send_heartbeat(self):
        """Write brain heartbeat file."""
        hb = {
            "type": "HEARTBEAT",
            "source": "BRAIN",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "state": "HALTED" if self.state.halted else "ACTIVE",
            "risk_state": self.state.risk_state.value,
            "daily_drawdown_pct": round(self.state.daily_drawdown_pct, 4),
            "monthly_drawdown_pct": round(self.state.monthly_drawdown_pct, 4),
            "signals_generated_today": self.state.signals_today,
            "signals_filled_today": self.state.fills_today,
        }

        tmp = HEARTBEAT_FILE.with_suffix('.tmp')
        with open(tmp, 'w') as f:
            json.dump(hb, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        tmp.rename(HEARTBEAT_FILE)

    def _check_ea_heartbeat(self):
        """Check if EA is alive."""
        ea_hb_file = SHARED_DIR / "heartbeat" / "ea.json"
        if not ea_hb_file.exists():
            logger.warning("EA heartbeat file not found")
            return

        hb = json.loads(ea_hb_file.read_text())
        ts = datetime.fromisoformat(hb["timestamp_utc"])
        age = (datetime.now(timezone.utc) - ts).total_seconds()

        if age > 120:
            logger.critical(f"EA heartbeat lost for {age:.0f}s")
            self.state.risk_state = RiskState.HALTED
            self._send_alert(f"EA heartbeat lost: {age:.0f}s")
        elif age > 60:
            logger.warning(f"EA heartbeat stale: {age:.0f}s")
            self.state.risk_state = RiskState.CRITICAL


    # ═══════════════════════════════════════════════════════════════
    # HELPER STUBS (implement with actual indicator libraries)
    # ═══════════════════════════════════════════════════════════════

    def _compute_atr(self, df, period):
        """ATR calculation."""
        high = df['high']
        low = df['low']
        close = df['close']
        tr = pd.concat([
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs()
        ], axis=1).max(axis=1)
        return tr.rolling(period).mean().iloc[-1]

    def _compute_adx(self, df, period):
        """ADX calculation — use ta-lib or manual implementation."""
        # Stub — replace with actual ADX computation
        pass

    def _compute_rsi(self, df, period):
        """RSI calculation."""
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0).rolling(period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
        rs = gain / loss.replace(0, 0.0001)
        return (100 - 100 / (1 + rs)).iloc[-1]

    def _compute_macd_histogram(self, df):
        """MACD histogram."""
        ema12 = df['close'].ewm(span=12).mean()
        ema26 = df['close'].ewm(span=26).mean()
        macd = ema12 - ema26
        signal = macd.ewm(span=9).mean()
        return (macd - signal).iloc[-1]

    def _compute_bb_width(self, df, period, std):
        """Bollinger Band Width."""
        sma = df['close'].rolling(period).mean()
        rolling_std = df['close'].rolling(period).std()
        upper = sma + std * rolling_std
        lower = sma - std * rolling_std
        return ((upper - lower) / sma).iloc[-1]

    def _percentile_rank(self, value, df, lookback):
        """Percentile rank of current value within lookback window."""
        # Stub
        pass

    def _check_hh_hl(self, df):
        """Check for higher highs and higher lows."""
        # Stub — implement with swing detection
        pass

    def _check_ll_lh(self, df):
        """Check for lower lows and lower highs."""
        pass

    def _detect_entry_triggers(self, asset, direction):
        """See 03-VOLATILITY-TREND-MODEL.md Section 5.2"""
        # Stub — implement with key level detection
        pass

    def _get_atr_sma(self, asset, tf, period):
        """Get SMA of ATR values."""
        pass

    def _get_current_atr(self, asset, tf):
        """Get current ATR value."""
        bars = mt5.copy_rates_from_pos(asset, TIMEFRAMES[tf], 0, 20)
        df = pd.DataFrame(bars)
        return self._compute_atr(df, 14)

    def _get_typical_spread(self, asset):
        """Get historical typical spread for asset."""
        # Query from database or use hardcoded defaults
        defaults = {"BTCUSD": 30, "ETHUSD": 3, "XAUUSD": 0.30}
        return defaults.get(asset, 1.0)

    def _compute_total_portfolio_risk(self):
        """Sum of risk percentages of all open positions."""
        return sum(p.get("risk_pct", 0) for p in self.state.open_positions)

    def _is_ea_alive(self):
        """Check EA heartbeat recency."""
        ea_hb = SHARED_DIR / "heartbeat" / "ea.json"
        if not ea_hb.exists():
            return False
        hb = json.loads(ea_hb.read_text())
        age = (datetime.now(timezone.utc) -
               datetime.fromisoformat(hb["timestamp_utc"])).total_seconds()
        return age < 30

    def _compute_asset_performance(self, asset, lookback_days):
        """See 04-ADAPTIVE-ALLOCATION.md Section 3."""
        # Database query for closed trades
        pass

    def _compute_regime_favorability(self, asset):
        """See 04-ADAPTIVE-ALLOCATION.md Section 3.2"""
        pass

    def _apply_correlation_adjustment(self, weights):
        """See 04-ADAPTIVE-ALLOCATION.md Section 5."""
        pass

    def _compute_volatility_score(self, df, atr):
        """See 03-VOLATILITY-TREND-MODEL.md Section 3.3"""
        pass

    def _assess_trend_strength(self, df):
        """See 03-VOLATILITY-TREND-MODEL.md Section 4.2"""
        pass

    def _analyze_structure(self, df, atr):
        """See 03-VOLATILITY-TREND-MODEL.md Section 4.1"""
        pass

    def _check_vetos(self, asset, mtf):
        """See 03-VOLATILITY-TREND-MODEL.md Section 2.3"""
        pass

    # ── Logging stubs ──
    def _log_signal_to_db(self, signal): pass
    def _log_signal_rejection(self, asset, reasons): pass
    def _log_allocation_change(self, old, new, scores): pass
    def _log_kill_switch(self, data): pass
    def _process_confirmations(self): pass
    def _dispatch_modify_sl(self, ticket, asset, new_sl): pass
    def _dispatch_close_all(self, asset, reason): pass
    def _record_equity_snapshot(self): pass
    def _exit_halt(self): pass
    def _send_alert(self, message): pass
    def _send_heartbeat(self): pass


# ═══════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler("/shared/logs/brain/brain.log"),
            logging.StreamHandler()
        ]
    )

    brain = OpenClawBrain()
    brain.run()
