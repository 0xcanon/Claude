/**
 * OpenClaw Bustabit Bot - Strategy Selector
 * The master controller that picks the best strategy for each game.
 * Uses AI signals, pattern analysis, and strategy performance to decide.
 */

class StrategySelector {
  constructor(strategies, patternEngine, selfLearner, logger) {
    this.strategies = strategies;
    this.patterns = patternEngine;
    this.learner = selfLearner;
    this.log = logger;

    // Weighted rotation - higher weight = more likely to be selected
    this.weights = {};
    strategies.forEach(s => {
      this.weights[s.name] = 1.0;
    });

    this.lastStrategy = null;
    this.gamesWithoutBet = 0;
    this.maxGamesWithoutBet = 20; // Force a bet after this many skips
  }

  // Select the best strategy and generate a bet decision
  selectAndDecide(context) {
    const { bankroll, history } = context;

    // Check bankroll protection first
    const canBetCheck = bankroll.canBet(1);
    if (!canBetCheck.allowed) {
      return { bet: false, reason: `Bankroll: ${canBetCheck.reason}`, strategy: 'none' };
    }

    // Get pattern prediction if enough history
    let prediction = null;
    if (history.size() >= 50) {
      const crashes = history.getAll();
      this.patterns.analyze(crashes);
      prediction = this.patterns.getBestPrediction(history.getLast(10));
    }

    // Ask AI which strategy it recommends
    const aiRecommendation = this.learner.getBestStrategy(this.strategies);

    // Collect decisions from all strategies
    const decisions = [];
    for (const strategy of this.strategies) {
      if (!strategy.enabled) continue;

      const decision = strategy.decide(context);
      decisions.push({
        strategy: strategy.name,
        ...decision,
        weight: this.weights[strategy.name] || 1,
        aiScore: this.learner.strategyScores[strategy.name]?.ema || 50,
      });
    }

    // Filter to strategies that want to bet
    const wantToBet = decisions.filter(d => d.bet);
    const dontBet = decisions.filter(d => !d.bet);

    // If no strategy wants to bet
    if (wantToBet.length === 0) {
      this.gamesWithoutBet++;

      // After too many skips, force a conservative bet
      if (this.gamesWithoutBet >= this.maxGamesWithoutBet) {
        this.gamesWithoutBet = 0;
        const forcedBet = Math.max(1, Math.floor(bankroll.getBalance() * 0.002));
        return {
          bet: true,
          amount: forcedBet,
          cashoutAt: 1.3,
          strategy: 'Forced-Conservative',
          reason: 'Forced bet after extended inactivity',
        };
      }

      return {
        bet: false,
        strategy: 'none',
        reason: dontBet.map(d => d.reason).join('; '),
      };
    }

    this.gamesWithoutBet = 0;

    // Select the best decision
    let selected;

    if (aiRecommendation) {
      // AI has a preference - give it priority
      selected = wantToBet.find(d => d.strategy === aiRecommendation);
      if (!selected) {
        // AI's pick didn't want to bet, fall back to scoring
        selected = this._scoredSelect(wantToBet, prediction);
      }
    } else {
      selected = this._scoredSelect(wantToBet, prediction);
    }

    // Apply AI modifications to the bet
    const modified = this.learner.modifyBet(selected);

    // Final bankroll check
    const finalCheck = bankroll.canBet(modified.amount);
    if (!finalCheck.allowed) {
      modified.amount = bankroll.getMinBet();
      if (!bankroll.canBet(modified.amount).allowed) {
        return { bet: false, reason: finalCheck.reason, strategy: selected.strategy };
      }
    }

    // Apply pattern prediction adjustments
    if (prediction && prediction.sampleSize >= 10) {
      // If patterns suggest low crash, lower cashout or skip
      if (prediction.probAbove1_5 < 0.4) {
        modified.cashoutAt = Math.min(modified.cashoutAt, 1.3);
      }
      // If patterns suggest high crash, can be more aggressive
      if (prediction.probAbove3 > 0.5 && prediction.sampleSize >= 20) {
        modified.cashoutAt = Math.min(modified.cashoutAt * 1.1, 5);
      }
    }

    modified.cashoutAt = Math.round(modified.cashoutAt * 100) / 100;
    this.lastStrategy = selected.strategy;

    return {
      bet: true,
      amount: modified.amount,
      cashoutAt: modified.cashoutAt,
      strategy: selected.strategy,
      reason: modified.reason || selected.reason,
      prediction: prediction ? {
        expectedCrash: prediction.expectedCrash,
        probAbove2: prediction.probAbove2,
        patterns: prediction.numPatterns,
      } : null,
    };
  }

  // Score-based selection from multiple candidate decisions
  _scoredSelect(candidates, prediction) {
    let bestScore = -Infinity;
    let best = candidates[0];

    for (const d of candidates) {
      let score = 0;

      // Weight from historical performance
      score += (d.aiScore / 100) * 40;

      // Weight from strategy weight
      score += (d.weight || 1) * 20;

      // Prefer strategies with reasonable cashout targets
      if (d.cashoutAt >= 1.2 && d.cashoutAt <= 3) score += 15;

      // Bonus for strategies that align with pattern prediction
      if (prediction) {
        if (d.cashoutAt <= prediction.expectedCrash * 0.8) score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }

    return best;
  }

  // Update weights based on outcomes
  updateWeights(strategyName, won) {
    if (!this.weights[strategyName]) return;

    if (won) {
      this.weights[strategyName] = Math.min(3.0, this.weights[strategyName] + 0.1);
    } else {
      this.weights[strategyName] = Math.max(0.2, this.weights[strategyName] - 0.05);
    }
  }

  getWeights() {
    return { ...this.weights };
  }
}

module.exports = StrategySelector;
