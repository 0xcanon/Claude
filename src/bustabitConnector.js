/**
 * OpenClaw Bustabit Bot - Bustabit Connector
 * Interface for connecting to real Bustabit game.
 *
 * This module provides the bridge between the bot and Bustabit's script engine.
 * For live play, paste the generated script into Bustabit's auto-bet script editor.
 *
 * MODES:
 * 1. Simulation: Uses GameSimulator (default, no real money)
 * 2. Script Export: Generates a Bustabit-compatible autobet script
 */

const GameSimulator = require('./simulator');

class BustabitConnector {
  constructor(config, logger) {
    this.config = config;
    this.log = logger;
    this.mode = config.bustabit.url ? 'live' : 'simulation';
    this.simulator = new GameSimulator(config.simulation.houseEdge);
    this.currentGame = null;
    this.connected = false;
  }

  async connect() {
    if (this.mode === 'simulation') {
      this.log.info('Running in SIMULATION mode (no real money)');
      this.connected = true;
      return true;
    }

    this.log.info('Live mode: Use the exported script in Bustabit\'s script editor');
    this.connected = true;
    return true;
  }

  // Get the next game result
  async nextGame() {
    if (this.mode === 'simulation') {
      const crash = this.simulator.generateCrash();
      this.currentGame = {
        id: this.simulator.getGameNumber(),
        crash,
      };
      return this.currentGame;
    }

    // In live mode, this would be called by Bustabit's engine
    return null;
  }

  // Place a bet (simulation mode)
  async placeBet(amount, cashoutAt) {
    if (this.mode === 'simulation') {
      if (!this.currentGame) {
        throw new Error('No active game');
      }

      const won = this.currentGame.crash >= cashoutAt;
      const profit = won ? Math.floor(amount * (cashoutAt - 1)) : -amount;

      return {
        gameId: this.currentGame.id,
        crash: this.currentGame.crash,
        amount,
        cashoutAt,
        won,
        profit,
      };
    }

    return null;
  }

  isSimulation() {
    return this.mode === 'simulation';
  }

  // Generate a standalone Bustabit autobet script for live play
  static generateBustabitScript(config) {
    return `
// ═══════════════════════════════════════════════════════════
// OpenClaw Bustabit Bot v2.0 - Live Autobet Script
// Paste this into Bustabit's Script Editor
// ═══════════════════════════════════════════════════════════

var CONFIG = {
  baseBet: ${config.strategies.conservative.baseBet},
  maxBetPercent: ${config.bankroll.maxBetPercent},
  stopLossPercent: ${config.bankroll.stopLossPercent},
  takeProfitPercent: ${config.bankroll.takeProfitPercent},
  maxConsecutiveLosses: ${config.bankroll.maxConsecutiveLosses},
  targetMultiplier: ${config.strategies.conservative.targetMultiplier},
};

var state = {
  startBalance: userInfo.balance,
  consecutiveLosses: 0,
  consecutiveWins: 0,
  totalBets: 0,
  totalProfit: 0,
  history: [],
};

function getBaseBet() {
  var balance = userInfo.balance;
  return Math.max(1, Math.floor(balance * 0.005));
}

function getBetAmount() {
  var base = getBaseBet();

  // Modified martingale on losses (cap at 5 doublings)
  if (state.consecutiveLosses > 0 && state.consecutiveLosses <= 5) {
    base = Math.floor(base * Math.pow(1.8, state.consecutiveLosses));
  } else if (state.consecutiveLosses > 5) {
    base = getBaseBet(); // Reset after 5 losses
  }

  // On win streaks, slightly increase
  if (state.consecutiveWins >= 3) {
    base = Math.floor(base * 1.2);
  }

  // Never exceed max bet percent
  var maxBet = Math.floor(userInfo.balance * (CONFIG.maxBetPercent / 100));
  return Math.max(1, Math.min(base, maxBet));
}

function getCashout() {
  var target = CONFIG.targetMultiplier;

  // After losses, lower target for faster recovery
  if (state.consecutiveLosses >= 3) {
    target = 1.2;
  }

  // Analyze recent crashes
  if (state.history.length >= 10) {
    var recent = state.history.slice(-10);
    var avg = recent.reduce(function(s, v) { return s + v; }, 0) / recent.length;
    var lowCount = recent.filter(function(c) { return c < 1.5; }).length;

    // Many low crashes recently - play it safe
    if (lowCount >= 5) {
      target = Math.min(target, 1.2);
    }

    // High average - can be slightly more aggressive
    if (avg > 3) {
      target = Math.min(target + 0.2, 2.0);
    }
  }

  return Math.round(target * 100) / 100;
}

function shouldStop() {
  var balance = userInfo.balance;
  var lossPercent = ((state.startBalance - balance) / state.startBalance) * 100;
  var profitPercent = ((balance - state.startBalance) / state.startBalance) * 100;

  if (lossPercent >= CONFIG.stopLossPercent) {
    log('STOP LOSS triggered at ' + lossPercent.toFixed(1) + '% loss');
    return true;
  }
  if (profitPercent >= CONFIG.takeProfitPercent) {
    log('TAKE PROFIT triggered at ' + profitPercent.toFixed(1) + '% profit');
    return true;
  }
  if (state.consecutiveLosses >= CONFIG.maxConsecutiveLosses) {
    log('MAX CONSECUTIVE LOSSES reached: ' + state.consecutiveLosses);
    return true;
  }
  return false;
}

// Main game loop
while (!shouldStop()) {
  var betAmount = getBetAmount();
  var cashout = getCashout();

  log('[Game #' + (state.totalBets + 1) + '] Betting ' + betAmount + ' bits @ ' + cashout + 'x');

  var result = await this.bet(betAmount * 100, cashout);

  state.totalBets++;
  state.history.push(result.multiplier);
  if (state.history.length > 200) state.history = state.history.slice(-200);

  if (result.cashedAt) {
    var profit = Math.floor(betAmount * (result.cashedAt - 1));
    state.totalProfit += profit;
    state.consecutiveWins++;
    state.consecutiveLosses = 0;
    log('WIN +' + profit + ' bits (crashed at ' + result.multiplier + 'x)');
  } else {
    state.totalProfit -= betAmount;
    state.consecutiveLosses++;
    state.consecutiveWins = 0;
    log('LOSS -' + betAmount + ' bits (crashed at ' + result.multiplier + 'x)');
  }

  if (state.totalBets % 25 === 0) {
    var balance = userInfo.balance;
    var profitPct = ((balance - state.startBalance) / state.startBalance * 100).toFixed(1);
    log('--- Stats: ' + state.totalBets + ' bets | Balance: ' + balance +
        ' | Profit: ' + state.totalProfit + ' (' + profitPct + '%) ---');
  }
}

log('Bot stopped. Final profit: ' + state.totalProfit + ' bits over ' + state.totalBets + ' games');
`;
  }
}

module.exports = BustabitConnector;
