/**
 * OpenClaw Bustabit Bot - Self-Learning Module
 * Tracks strategy performance and dynamically adjusts parameters.
 * This is the "genius brain" that gets smarter over time.
 */

const fs = require('fs');
const path = require('path');

class SelfLearner {
  constructor(logger) {
    this.log = logger;

    // Strategy performance tracking
    this.strategyScores = {};
    this.recentDecisions = []; // Last N decisions with outcomes
    this.maxDecisions = 500;

    // Learned parameters
    this.learnedParams = {
      optimalCashoutLow: 1.3,     // Best cashout for conservative play
      optimalCashoutMid: 2.0,     // Best cashout for medium risk
      optimalCashoutHigh: 3.5,    // Best cashout for aggressive play
      betScaleFactor: 1.0,        // Global bet size multiplier
      skipThreshold: 0.3,         // Probability threshold to skip a game
      streakWeight: 0.5,          // How much to weight streak data
      trendWeight: 0.5,           // How much to weight trend data
    };

    // Evolution tracking
    this.generation = 0;
    this.learningRate = 0.05;
    this.stateFile = path.join(__dirname, '../../data/ai-state.json');
  }

  // Record a betting decision and its outcome
  recordDecision(decision) {
    this.recentDecisions.push({
      ...decision,
      timestamp: Date.now(),
    });

    if (this.recentDecisions.length > this.maxDecisions) {
      this.recentDecisions = this.recentDecisions.slice(-this.maxDecisions);
    }

    // Update strategy score
    const { strategy, won, profit, cashoutAt, crashPoint } = decision;
    if (!this.strategyScores[strategy]) {
      this.strategyScores[strategy] = {
        totalBets: 0, wins: 0, losses: 0, totalProfit: 0,
        recentProfit: 0, recentBets: 0, ema: 50,
      };
    }

    const s = this.strategyScores[strategy];
    s.totalBets++;
    s.totalProfit += profit;
    s.recentBets++;
    s.recentProfit += profit;
    if (won) s.wins++;
    else s.losses++;

    // Exponential moving average of performance
    s.ema = s.ema * 0.92 + (won ? 65 : 35) * 0.08;

    // Every 50 bets, evolve parameters
    const totalBets = this.recentDecisions.length;
    if (totalBets > 0 && totalBets % 50 === 0) {
      this._evolve();
    }
  }

  // The core learning loop - adjusts parameters based on outcomes
  _evolve() {
    this.generation++;
    this.log.ai(`Evolution #${this.generation} - analyzing ${this.recentDecisions.length} decisions`);

    const recent = this.recentDecisions.slice(-100);
    if (recent.length < 20) return;

    // Analyze what cashout values actually worked
    const wonBets = recent.filter(d => d.won);
    const lostBets = recent.filter(d => !d.won);

    // Find the cashout sweet spots
    if (wonBets.length > 5) {
      const avgWinningCashout = wonBets.reduce((s, d) => s + d.cashoutAt, 0) / wonBets.length;

      // Nudge optimal cashouts toward what's been working
      const lr = this.learningRate;

      // Low cashout optimization
      const lowWins = wonBets.filter(d => d.cashoutAt < 1.8);
      if (lowWins.length > 3) {
        const avgLow = lowWins.reduce((s, d) => s + d.cashoutAt, 0) / lowWins.length;
        this.learnedParams.optimalCashoutLow += (avgLow - this.learnedParams.optimalCashoutLow) * lr;
        this.learnedParams.optimalCashoutLow = Math.max(1.1, Math.min(1.8, this.learnedParams.optimalCashoutLow));
      }

      // Mid cashout optimization
      const midWins = wonBets.filter(d => d.cashoutAt >= 1.8 && d.cashoutAt < 4);
      if (midWins.length > 3) {
        const avgMid = midWins.reduce((s, d) => s + d.cashoutAt, 0) / midWins.length;
        this.learnedParams.optimalCashoutMid += (avgMid - this.learnedParams.optimalCashoutMid) * lr;
        this.learnedParams.optimalCashoutMid = Math.max(1.5, Math.min(4, this.learnedParams.optimalCashoutMid));
      }

      // High cashout optimization
      const highWins = wonBets.filter(d => d.cashoutAt >= 4);
      if (highWins.length > 2) {
        const avgHigh = highWins.reduce((s, d) => s + d.cashoutAt, 0) / highWins.length;
        this.learnedParams.optimalCashoutHigh += (avgHigh - this.learnedParams.optimalCashoutHigh) * lr;
        this.learnedParams.optimalCashoutHigh = Math.max(2.5, Math.min(10, this.learnedParams.optimalCashoutHigh));
      }
    }

    // Analyze if we should bet more or less aggressively
    const totalProfit = recent.reduce((s, d) => s + d.profit, 0);
    const avgBet = recent.reduce((s, d) => s + d.amount, 0) / recent.length;

    if (totalProfit > 0) {
      // Profitable - slightly increase bet scale
      this.learnedParams.betScaleFactor = Math.min(2.0,
        this.learnedParams.betScaleFactor + 0.02);
    } else {
      // Losing - decrease bet scale
      this.learnedParams.betScaleFactor = Math.max(0.3,
        this.learnedParams.betScaleFactor - 0.05);
    }

    // Analyze skipped games - were they right to skip?
    const skippedCrashes = recent.filter(d => d.skipped).map(d => d.crashPoint);
    if (skippedCrashes.length > 5) {
      const wouldHaveLost = skippedCrashes.filter(c => c < 1.5).length;
      const skipAccuracy = wouldHaveLost / skippedCrashes.length;
      // If most skipped games would have been losses, increase skip threshold
      if (skipAccuracy > 0.6) {
        this.learnedParams.skipThreshold = Math.min(0.5,
          this.learnedParams.skipThreshold + 0.02);
      } else {
        this.learnedParams.skipThreshold = Math.max(0.1,
          this.learnedParams.skipThreshold - 0.02);
      }
    }

    // Reset recent counters for strategy scores
    Object.values(this.strategyScores).forEach(s => {
      s.recentBets = 0;
      s.recentProfit = 0;
    });

    this.log.ai(`Evolved params: cashouts=[${this.learnedParams.optimalCashoutLow.toFixed(2)}, ${this.learnedParams.optimalCashoutMid.toFixed(2)}, ${this.learnedParams.optimalCashoutHigh.toFixed(2)}] scale=${this.learnedParams.betScaleFactor.toFixed(2)} skip=${this.learnedParams.skipThreshold.toFixed(2)}`);
  }

  // Get the best strategy to use right now
  getBestStrategy(strategies) {
    if (Object.keys(this.strategyScores).length === 0) {
      return null; // No data yet, let strategy selector decide
    }

    let best = null;
    let bestScore = -Infinity;

    strategies.forEach(strategy => {
      const score = this.strategyScores[strategy.name];
      if (score && score.totalBets >= 10) {
        // Weighted score: EMA performance + profit factor
        const profitPerBet = score.totalProfit / score.totalBets;
        const composite = score.ema * 0.6 + (profitPerBet > 0 ? 70 : 30) * 0.4;

        if (composite > bestScore) {
          bestScore = composite;
          best = strategy.name;
        }
      }
    });

    return best;
  }

  // Get modifier suggestions for a bet
  modifyBet(decision) {
    const modified = { ...decision };

    // Apply learned bet scale
    modified.amount = Math.max(1, Math.round(decision.amount * this.learnedParams.betScaleFactor));

    // Nudge cashout toward learned optimal values
    if (decision.cashoutAt < 1.8) {
      const blend = 0.7; // 70% original, 30% learned
      modified.cashoutAt = decision.cashoutAt * blend + this.learnedParams.optimalCashoutLow * (1 - blend);
    } else if (decision.cashoutAt < 4) {
      const blend = 0.75;
      modified.cashoutAt = decision.cashoutAt * blend + this.learnedParams.optimalCashoutMid * (1 - blend);
    }

    modified.cashoutAt = Math.round(modified.cashoutAt * 100) / 100;
    return modified;
  }

  getParams() {
    return { ...this.learnedParams };
  }

  getStrategyRankings() {
    return Object.entries(this.strategyScores)
      .map(([name, data]) => ({
        name,
        ema: Math.round(data.ema),
        winRate: data.totalBets > 0 ? Math.round((data.wins / data.totalBets) * 100) : 0,
        totalProfit: data.totalProfit,
        totalBets: data.totalBets,
      }))
      .sort((a, b) => b.ema - a.ema);
  }

  saveState() {
    const state = {
      generation: this.generation,
      learnedParams: this.learnedParams,
      strategyScores: this.strategyScores,
      recentDecisions: this.recentDecisions.slice(-200),
      savedAt: Date.now(),
    };
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  loadState() {
    if (fs.existsSync(this.stateFile)) {
      const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      this.generation = state.generation || 0;
      this.learnedParams = { ...this.learnedParams, ...state.learnedParams };
      this.strategyScores = state.strategyScores || {};
      this.recentDecisions = state.recentDecisions || [];
      this.log.ai(`Restored AI state: generation ${this.generation}, ${this.recentDecisions.length} decisions loaded`);
      return true;
    }
    return false;
  }
}

module.exports = SelfLearner;
