/**
 * OpenClaw Bustabit Bot - Sniper Strategy
 * Waits for high-confidence opportunities and strikes with precision.
 * Bets rarely but with higher conviction and potential payout.
 */

const BaseStrategy = require('./baseStrategy');

class SniperStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('Sniper', config);
    this.gamesWaited = 0;
    this.minWait = config.minWait || 5;        // Minimum games between bets
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
  }

  decide(context) {
    const { bankroll, history } = context;
    const balance = bankroll.getBalance();
    this.gamesWaited++;

    // Always wait minimum games between bets
    if (this.gamesWaited < this.minWait) {
      return { bet: false, reason: `Sniper: waiting (${this.gamesWaited}/${this.minWait})` };
    }

    if (history.size() < 50) {
      return { bet: false, reason: 'Sniper: gathering data' };
    }

    let confidence = 0;
    let cashoutAt = 2.0;
    let reason = '';

    const last5 = history.getLast(5);
    const last20 = history.getLast(20);
    const streak = history.getStreakBelow(2);
    const trend = history.getTrend();
    const dist = history.getDistribution(50);

    // Signal 1: Long low-crash streak (strong mean reversion signal)
    if (streak >= 5) {
      confidence += 0.3;
      cashoutAt = 3.0;
      reason += 'long-low-streak ';
    } else if (streak >= 3) {
      confidence += 0.15;
    }

    // Signal 2: Multiple instant crashes in a row
    const instantStreak = last5.filter(c => c < 1.3).length;
    if (instantStreak >= 3) {
      confidence += 0.25;
      cashoutAt = 2.5;
      reason += 'instant-cluster ';
    }

    // Signal 3: High distribution of medium+ crashes recently
    if (dist.medium + dist.high + dist.moon > 60) {
      confidence += 0.2;
      cashoutAt = Math.min(cashoutAt + 0.5, 5);
      reason += 'high-dist ';
    }

    // Signal 4: Average of last 20 significantly below expected
    const avg20 = last20.reduce((s, v) => s + v, 0) / last20.length;
    if (avg20 < 1.8) {
      confidence += 0.2;
      reason += 'low-avg ';
    }

    // Negative signal: we just had a big crash (10x+)
    if (last5.some(c => c > 10)) {
      confidence -= 0.3;
      reason += 'recent-moon(-) ';
    }

    // Negative signal: trend is cold
    if (trend === 'cold') {
      confidence -= 0.15;
      reason += 'cold-trend(-) ';
    }

    if (confidence < this.confidenceThreshold) {
      return {
        bet: false,
        reason: `Sniper: confidence ${(confidence * 100).toFixed(0)}% < ${(this.confidenceThreshold * 100).toFixed(0)}% threshold [${reason}]`,
      };
    }

    // High confidence bet - larger position
    this.gamesWaited = 0;
    let betAmount = Math.max(1, Math.floor(balance * 0.008)); // 0.8% for sniper shots

    // Scale bet with confidence
    betAmount = Math.floor(betAmount * (confidence / this.confidenceThreshold));
    betAmount = bankroll.calculateBetSize(betAmount, 'high');
    cashoutAt = Math.round(cashoutAt * 100) / 100;

    return {
      bet: true,
      amount: betAmount,
      cashoutAt,
      reason: `Sniper: confidence ${(confidence * 100).toFixed(0)}% [${reason.trim()}]`,
    };
  }
}

module.exports = SniperStrategy;
