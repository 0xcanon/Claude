/**
 * OpenClaw Bustabit Bot - Game Simulator
 * Simulates Bustabit crash games with realistic distribution.
 * The crash point distribution follows: P(crash > x) = (1 - houseEdge) / x for x >= 1
 */

class GameSimulator {
  constructor(houseEdge = 0.01) {
    this.houseEdge = houseEdge;
    this.gameNumber = 0;
  }

  // Generate a random crash point following Bustabit's distribution
  generateCrash() {
    this.gameNumber++;

    // Bustabit crash distribution:
    // 1% chance of instant crash (house edge)
    // For the rest: crash = (1 - houseEdge) / random
    // This gives the expected distribution where median is ~2x

    const rand = Math.random();

    // Instant crash (house edge)
    if (rand < this.houseEdge) {
      return 1.0;
    }

    // Standard crash point generation
    // P(X > x) = (1 - e) / x, so X = (1 - e) / U where U ~ Uniform(0, 1-e)
    const adjustedRand = rand;
    const crash = (1 - this.houseEdge) / adjustedRand;

    // Round to 2 decimal places, minimum 1.00
    return Math.max(1.0, Math.floor(crash * 100) / 100);
  }

  // Simulate a bet: returns { won, payout, profit }
  simulateBet(betAmount, cashoutAt) {
    const crash = this.generateCrash();
    const won = crash >= cashoutAt;
    const payout = won ? Math.floor(betAmount * cashoutAt) : 0;
    const profit = won ? Math.floor(betAmount * (cashoutAt - 1)) : -betAmount;

    return {
      gameNumber: this.gameNumber,
      crash,
      betAmount,
      cashoutAt,
      won,
      payout,
      profit,
    };
  }

  // Generate N crash points for backtesting
  generateHistory(n) {
    const crashes = [];
    for (let i = 0; i < n; i++) {
      crashes.push(this.generateCrash());
    }
    return crashes;
  }

  getGameNumber() {
    return this.gameNumber;
  }
}

module.exports = GameSimulator;
