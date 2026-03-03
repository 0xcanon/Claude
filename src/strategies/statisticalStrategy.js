/**
 * OpenClaw Bustabit Bot - Statistical Strategy
 * Uses game history statistics to find optimal entry points.
 * Looks for patterns in crash distributions and streaks.
 */

const BaseStrategy = require('./baseStrategy');

class StatisticalStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Statistical', config);
    this.minHistory = config.minHistory || 30;
    this.baseBet = config.baseBet || 8;
  }

  decide(context) {
    const { bankroll, history } = context;
    const balance = bankroll.getBalance();

    // Need sufficient history to make statistical decisions
    if (history.size() < this.minHistory) {
      return { bet: false, reason: `Need ${this.minHistory} games of history (have ${history.size()})` };
    }

    const stats = history.getStats(100);
    const recentStats = history.getStats(20);
    const dist = history.getDistribution(50);
    const volatility = history.getVolatility(30);
    const trend = history.getTrend();

    let betAmount = Math.max(1, Math.floor(balance * 0.004)); // 0.4% base
    let cashoutAt = 2.0;
    let shouldBet = false;
    let reason = '';

    // Strategy 1: Mean reversion after low-crash streaks
    const streakBelow2 = history.getStreakBelow(2);
    if (streakBelow2 >= 4) {
      // After many low crashes, probability of a higher crash increases
      shouldBet = true;
      cashoutAt = 2.5;
      betAmount = Math.floor(betAmount * 1.5);
      reason = `Mean reversion: ${streakBelow2} games below 2x`;
    }

    // Strategy 2: Ride the hot streak
    const streakAbove2 = history.getStreakAbove(2);
    if (streakAbove2 >= 3 && trend === 'hot') {
      shouldBet = true;
      cashoutAt = 3.0;
      betAmount = Math.floor(betAmount * 1.2);
      reason = `Hot streak: ${streakAbove2} games above 2x, trend=${trend}`;
    }

    // Strategy 3: Low volatility = safe cashout
    if (volatility !== null && volatility < 2 && !shouldBet) {
      shouldBet = true;
      cashoutAt = 1.5;
      reason = `Low volatility (${volatility.toFixed(2)}): safe cashout`;
    }

    // Strategy 4: Distribution anomaly - too many instants means correction coming
    if (dist.instant > 25 && dist.moon < 5 && !shouldBet) {
      // Distribution is skewed low - wait for correction
      shouldBet = false;
      reason = 'Distribution skewed low, waiting for correction';
    }

    // Strategy 5: If recent mean is significantly higher than long-term
    if (recentStats && stats && !shouldBet) {
      if (recentStats.mean > stats.mean * 1.3) {
        shouldBet = true;
        cashoutAt = Math.min(recentStats.mean * 0.6, 5);
        reason = `Recent mean (${recentStats.mean}) above long-term (${stats.mean})`;
      }
    }

    if (!shouldBet) {
      return { bet: false, reason: reason || 'No statistical edge detected' };
    }

    // Reduce bet during high drawdown
    if (bankroll.getDrawdown() > 10) {
      betAmount = Math.floor(betAmount * 0.6);
    }

    betAmount = bankroll.calculateBetSize(betAmount, 'medium');
    cashoutAt = Math.round(cashoutAt * 100) / 100;

    return {
      bet: true,
      amount: betAmount,
      cashoutAt,
      reason: `Statistical: ${reason}`,
    };
  }
}

module.exports = StatisticalStrategy;
