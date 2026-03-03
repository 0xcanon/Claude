/**
 * OpenClaw Bustabit Bot - Conservative Strategy
 * Low-risk approach: small bets, low cashout targets (1.2x-1.5x).
 * High win rate, steady small gains. The bread-and-butter earner.
 */

const BaseStrategy = require('./baseStrategy');

class ConservativeStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Conservative', config);
    this.baseBet = config.baseBet || 10;
    this.targetMultiplier = config.targetMultiplier || 1.3;
    this.minTarget = 1.1;
    this.maxTarget = 1.6;
  }

  decide(context) {
    const { bankroll, history, ai } = context;
    const balance = bankroll.getBalance();

    // Base bet is small percentage of bankroll
    let betAmount = Math.max(1, Math.floor(balance * 0.003)); // 0.3% of bankroll - tight sizing
    let cashoutAt = this.targetMultiplier;

    // Adjust based on recent results
    if (bankroll.consecutiveLosses >= 2) {
      // After losses, reduce exposure and tighten cashout
      betAmount = Math.max(1, Math.floor(betAmount * 0.4));
      cashoutAt = 1.15;
    } else if (bankroll.consecutiveWins >= 3) {
      // On a streak, ride it slightly harder
      betAmount = Math.floor(betAmount * 1.2);
      cashoutAt = 1.4;
    }

    // Check history trend - be more selective
    if (history.size() >= 20) {
      const trend = history.getTrend();
      const dist = history.getDistribution(20);
      const last5 = history.getLast(5);
      const recentAvg = last5.reduce((s, v) => s + v, 0) / last5.length;

      if (trend === 'cold') {
        // Cold streak - reduce cashout target
        cashoutAt = Math.max(this.minTarget, cashoutAt - 0.1);
        betAmount = Math.max(1, Math.floor(betAmount * 0.6));
      } else if (trend === 'hot') {
        cashoutAt = Math.min(this.maxTarget, cashoutAt + 0.1);
      }

      // Skip if too many recent instant crashes
      if (dist.instant > 25) {
        return { bet: false, reason: 'Too many instant crashes recently' };
      }

      // Skip if last 3 games all crashed below our target
      const last3 = history.getLast(3);
      if (last3.every(c => c < cashoutAt)) {
        return { bet: false, reason: 'Last 3 crashes below target - waiting' };
      }

      // Reduce bet during drawdowns
      if (bankroll.getDrawdown() > 5) {
        betAmount = Math.max(1, Math.floor(betAmount * 0.5));
      }
    }

    betAmount = bankroll.calculateBetSize(betAmount, 'low');
    cashoutAt = Math.round(cashoutAt * 100) / 100;

    return {
      bet: true,
      amount: betAmount,
      cashoutAt,
      reason: `Conservative: ${cashoutAt}x target`,
    };
  }
}

module.exports = ConservativeStrategy;
