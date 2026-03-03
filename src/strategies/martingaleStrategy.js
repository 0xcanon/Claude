/**
 * OpenClaw Bustabit Bot - Modified Martingale Strategy
 * Increases bet after losses to recover, but with safety caps.
 * Uses a modified approach that limits max doubling to prevent ruin.
 */

const BaseStrategy = require('./baseStrategy');

class MartingaleStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Martingale', config);
    this.baseBet = config.baseBet || 5;
    this.maxDoublings = config.maxDoublings || 5; // Max times to double (caps at 32x base)
    this.targetMultiplier = config.targetMultiplier || 2.0;
    this.currentBet = this.baseBet;
    this.doublingCount = 0;
  }

  decide(context) {
    const { bankroll, history } = context;
    const balance = bankroll.getBalance();

    // Dynamic base bet: 0.3% of bankroll
    this.baseBet = Math.max(1, Math.floor(balance * 0.003));

    let betAmount;
    let cashoutAt = this.targetMultiplier;

    if (bankroll.consecutiveLosses === 0) {
      // Reset to base after a win
      betAmount = this.baseBet;
      this.doublingCount = 0;
    } else if (this.doublingCount < this.maxDoublings) {
      // Double the bet (modified - multiply by 1.8 instead of 2 for safety)
      betAmount = Math.floor(this.baseBet * Math.pow(1.8, bankroll.consecutiveLosses));
      this.doublingCount++;
    } else {
      // Hit max doublings - reset and wait
      betAmount = this.baseBet;
      this.doublingCount = 0;

      // Skip a round to break the pattern
      if (bankroll.consecutiveLosses >= this.maxDoublings) {
        return {
          bet: false,
          reason: 'Martingale reset - max doublings reached, cooling down',
        };
      }
    }

    // Safety: never risk more than 5% of bankroll on martingale
    const maxAllowed = Math.floor(balance * 0.05);
    if (betAmount > maxAllowed) {
      betAmount = this.baseBet; // Reset if too high
      this.doublingCount = 0;
    }

    // If we're down significantly, lower the target for faster recovery
    if (bankroll.consecutiveLosses >= 3) {
      cashoutAt = 1.5;
    }

    betAmount = bankroll.calculateBetSize(betAmount, 'medium');

    return {
      bet: true,
      amount: betAmount,
      cashoutAt,
      reason: `Martingale: step ${this.doublingCount}/${this.maxDoublings}`,
    };
  }
}

module.exports = MartingaleStrategy;
