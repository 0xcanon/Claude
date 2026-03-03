/**
 * OpenClaw Bustabit Bot - Base Strategy
 * All strategies inherit from this base class.
 */

class BaseStrategy {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.gamesPlayed = 0;
    this.wins = 0;
    this.losses = 0;
    this.totalProfit = 0;
    this.enabled = true;
    this.score = 50; // Performance score 0-100
  }

  /**
   * Decide whether to bet and at what parameters.
   * Must return: { bet: boolean, amount: number, cashoutAt: number, reason: string }
   */
  decide(context) {
    throw new Error(`Strategy ${this.name} must implement decide()`);
  }

  recordResult(won, profit) {
    this.gamesPlayed++;
    if (won) this.wins++;
    else this.losses++;
    this.totalProfit += profit;

    // Update performance score with exponential moving average
    const result = won ? 70 : 30;
    this.score = this.score * 0.95 + result * 0.05;
  }

  getWinRate() {
    if (this.gamesPlayed === 0) return 0;
    return (this.wins / this.gamesPlayed) * 100;
  }

  getStats() {
    return {
      name: this.name,
      gamesPlayed: this.gamesPlayed,
      winRate: this.getWinRate().toFixed(1) + '%',
      totalProfit: this.totalProfit,
      score: Math.round(this.score),
      enabled: this.enabled,
    };
  }

  reset() {
    this.gamesPlayed = 0;
    this.wins = 0;
    this.losses = 0;
    this.totalProfit = 0;
    this.score = 50;
  }
}

module.exports = BaseStrategy;
