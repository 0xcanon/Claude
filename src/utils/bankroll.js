/**
 * OpenClaw Bustabit Bot - Bankroll Manager
 * Protects your money with strict limits and dynamic position sizing.
 */

const fs = require('fs');
const path = require('path');

class BankrollManager {
  constructor(config, logger) {
    this.log = logger;
    this.startingBalance = config.startingBalance;
    this.balance = config.startingBalance;
    this.currency = config.currency || 'bits';

    // Protection limits
    this.maxBetPercent = config.maxBetPercent || 2;       // Max % of bankroll per bet
    this.stopLossPercent = config.stopLossPercent || 25;   // Stop if lost this % of starting
    this.takeProfitPercent = config.takeProfitPercent || 50; // Take profit at this %
    this.maxConsecutiveLosses = config.maxConsecutiveLosses || 8;
    this.dailyLossLimit = config.dailyLossLimit || 15;     // % of bankroll daily loss limit

    // Tracking
    this.totalWagered = 0;
    this.totalProfit = 0;
    this.peakBalance = config.startingBalance;
    this.troughBalance = config.startingBalance;
    this.consecutiveLosses = 0;
    this.consecutiveWins = 0;
    this.sessionStart = Date.now();
    this.bets = [];
    this.dailyStartBalance = config.startingBalance;

    // State file for persistence
    this.stateFile = path.join(__dirname, '../../data/bankroll-state.json');
  }

  getBalance() {
    return this.balance;
  }

  getMaxBet() {
    // Dynamic max bet: % of current bankroll, decreases as losses mount
    const lossFactor = Math.max(0.3, 1 - (this.consecutiveLosses * 0.1));
    const baseBet = this.balance * (this.maxBetPercent / 100);
    return Math.floor(baseBet * lossFactor);
  }

  getMinBet() {
    return 1; // Minimum 1 bit
  }

  calculateBetSize(baseAmount, riskLevel = 'medium') {
    const multipliers = { low: 0.5, medium: 1, high: 1.5, aggressive: 2 };
    const mult = multipliers[riskLevel] || 1;
    let bet = Math.round(baseAmount * mult);

    // Clamp to limits
    bet = Math.max(this.getMinBet(), bet);
    bet = Math.min(this.getMaxBet(), bet);

    // Never bet more than we have
    bet = Math.min(bet, Math.floor(this.balance * 0.95));

    return Math.max(1, bet);
  }

  canBet(amount) {
    if (amount > this.balance) return { allowed: false, reason: 'Insufficient balance' };
    if (amount > this.getMaxBet()) return { allowed: false, reason: `Exceeds max bet (${this.getMaxBet()} ${this.currency})` };
    if (this.isStopLossHit()) return { allowed: false, reason: 'Stop-loss triggered' };
    if (this.isTakeProfitHit()) return { allowed: false, reason: 'Take-profit reached' };
    if (this.consecutiveLosses >= this.maxConsecutiveLosses) return { allowed: false, reason: `Max consecutive losses (${this.maxConsecutiveLosses}) reached - cooling down` };
    if (this.isDailyLossHit()) return { allowed: false, reason: 'Daily loss limit reached' };
    return { allowed: true };
  }

  recordBet(amount, multiplier, won, cashoutAt) {
    const profit = won ? Math.floor(amount * (cashoutAt - 1)) : -amount;
    this.balance += profit;
    this.totalWagered += amount;
    this.totalProfit += profit;

    if (won) {
      this.consecutiveWins++;
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
      this.consecutiveWins = 0;
    }

    if (this.balance > this.peakBalance) this.peakBalance = this.balance;
    if (this.balance < this.troughBalance) this.troughBalance = this.balance;

    const bet = {
      timestamp: Date.now(),
      amount,
      multiplier,
      cashoutAt,
      won,
      profit,
      balance: this.balance,
    };
    this.bets.push(bet);

    return bet;
  }

  isStopLossHit() {
    const lossPercent = ((this.startingBalance - this.balance) / this.startingBalance) * 100;
    return lossPercent >= this.stopLossPercent;
  }

  isTakeProfitHit() {
    const profitPercent = ((this.balance - this.startingBalance) / this.startingBalance) * 100;
    return profitPercent >= this.takeProfitPercent;
  }

  isDailyLossHit() {
    const dailyLoss = ((this.dailyStartBalance - this.balance) / this.dailyStartBalance) * 100;
    return dailyLoss >= this.dailyLossLimit;
  }

  resetConsecutiveLosses() {
    this.consecutiveLosses = 0;
  }

  getDrawdown() {
    if (this.peakBalance === 0) return 0;
    return ((this.peakBalance - this.balance) / this.peakBalance) * 100;
  }

  getROI() {
    if (this.totalWagered === 0) return 0;
    return (this.totalProfit / this.totalWagered) * 100;
  }

  getWinRate() {
    if (this.bets.length === 0) return 0;
    const wins = this.bets.filter(b => b.won).length;
    return (wins / this.bets.length) * 100;
  }

  getStats() {
    const wins = this.bets.filter(b => b.won).length;
    const losses = this.bets.length - wins;
    const avgWin = wins > 0 ? this.bets.filter(b => b.won).reduce((s, b) => s + b.profit, 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(this.bets.filter(b => !b.won).reduce((s, b) => s + b.profit, 0) / losses) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses) : Infinity;

    return {
      balance: this.balance,
      startingBalance: this.startingBalance,
      totalProfit: this.totalProfit,
      totalWagered: this.totalWagered,
      roi: this.getROI().toFixed(2) + '%',
      winRate: this.getWinRate().toFixed(1) + '%',
      totalBets: this.bets.length,
      wins,
      losses,
      avgWin: Math.round(avgWin),
      avgLoss: Math.round(avgLoss),
      profitFactor: profitFactor === Infinity ? 'INF' : profitFactor.toFixed(2),
      peakBalance: this.peakBalance,
      maxDrawdown: this.getDrawdown().toFixed(1) + '%',
      consecutiveWins: this.consecutiveWins,
      consecutiveLosses: this.consecutiveLosses,
      sessionDuration: Math.round((Date.now() - this.sessionStart) / 60000) + ' min',
    };
  }

  saveState() {
    const state = {
      balance: this.balance,
      totalWagered: this.totalWagered,
      totalProfit: this.totalProfit,
      peakBalance: this.peakBalance,
      bets: this.bets.slice(-1000), // Keep last 1000 bets
      savedAt: Date.now(),
    };
    const dir = path.dirname(this.stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  loadState() {
    if (fs.existsSync(this.stateFile)) {
      const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      this.balance = state.balance;
      this.totalWagered = state.totalWagered;
      this.totalProfit = state.totalProfit;
      this.peakBalance = state.peakBalance;
      this.bets = state.bets || [];
      this.log.info(`Restored bankroll state: ${this.balance} ${this.currency}`);
      return true;
    }
    return false;
  }
}

module.exports = BankrollManager;
