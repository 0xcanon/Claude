#!/usr/bin/env node

/**
 * OpenClaw Bustabit Bot - Backtester
 * Tests strategies against historical or simulated data.
 * Run: node src/backtest.js [--games N] [--runs N]
 */

const config = require('./config');
const Logger = require('./utils/logger');
const BankrollManager = require('./utils/bankroll');
const GameHistory = require('./utils/gameHistory');
const GameSimulator = require('./simulator');

const ConservativeStrategy = require('./strategies/conservativeStrategy');
const MartingaleStrategy = require('./strategies/martingaleStrategy');
const StatisticalStrategy = require('./strategies/statisticalStrategy');
const SniperStrategy = require('./strategies/sniperStrategy');

const PatternEngine = require('./ai/patternEngine');
const SelfLearner = require('./ai/selfLearner');
const StrategySelector = require('./ai/strategySelector');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
};

const GAMES = parseInt(getArg('--games')) || 2000;
const RUNS = parseInt(getArg('--runs')) || 5;
const BALANCE = parseInt(getArg('--balance')) || 10000;

async function backtest(runNumber) {
  const log = new Logger();
  const simulator = new GameSimulator(config.simulation.houseEdge);

  // Generate crash history
  const crashes = simulator.generateHistory(GAMES);

  // Setup bot
  const bankroll = new BankrollManager({ ...config.bankroll, startingBalance: BALANCE }, log);
  const history = new GameHistory();
  const strategies = [
    new ConservativeStrategy(config.strategies.conservative),
    new MartingaleStrategy(config.strategies.martingale),
    new StatisticalStrategy(config.strategies.statistical),
    new SniperStrategy(config.strategies.sniper),
  ];
  const patternEngine = new PatternEngine(log);
  const selfLearner = new SelfLearner(log);
  const selector = new StrategySelector(strategies, patternEngine, selfLearner, log);

  let bets = 0;
  let wins = 0;

  for (let i = 0; i < crashes.length; i++) {
    const crash = crashes[i];
    history.add(crash);

    const context = { bankroll, history, ai: selfLearner, gameNumber: i + 1 };
    const decision = selector.selectAndDecide(context);

    if (decision.bet) {
      const won = crash >= decision.cashoutAt;
      const profit = won ? Math.floor(decision.amount * (decision.cashoutAt - 1)) : -decision.amount;

      bankroll.recordBet(decision.amount, crash, won, decision.cashoutAt);

      const usedStrategy = strategies.find(s => s.name === decision.strategy);
      if (usedStrategy) {
        usedStrategy.recordResult(won, profit);
        selector.updateWeights(decision.strategy, won);
      }

      selfLearner.recordDecision({
        strategy: decision.strategy,
        amount: decision.amount,
        cashoutAt: decision.cashoutAt,
        crashPoint: crash,
        won,
        profit,
        skipped: false,
      });

      bets++;
      if (won) wins++;
    }

    if (bankroll.isStopLossHit() || bankroll.isTakeProfitHit()) break;
  }

  const stats = bankroll.getStats();
  log.close();

  return {
    run: runNumber,
    finalBalance: stats.balance,
    profit: stats.totalProfit,
    roi: bankroll.getROI().toFixed(2),
    winRate: bankroll.getWinRate().toFixed(1),
    bets,
    peakBalance: stats.peakBalance,
    maxDrawdown: bankroll.getDrawdown().toFixed(1),
    profitFactor: stats.profitFactor,
  };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          OpenClaw Bustabit Bot - Backtester             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`Running ${RUNS} backtests with ${GAMES} games each (balance: ${BALANCE} bits)\n`);

  const results = [];

  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`  Run ${i + 1}/${RUNS}...`);
    const result = await backtest(i + 1);
    results.push(result);
    console.log(` Balance: ${result.finalBalance} | Profit: ${result.profit} (${result.roi}%) | WR: ${result.winRate}%`);
  }

  // Summary
  const avgProfit = results.reduce((s, r) => s + r.profit, 0) / results.length;
  const avgROI = results.reduce((s, r) => s + parseFloat(r.roi), 0) / results.length;
  const avgWinRate = results.reduce((s, r) => s + parseFloat(r.winRate), 0) / results.length;
  const profitable = results.filter(r => r.profit > 0).length;

  console.log('\n' + '═'.repeat(60));
  console.log('BACKTEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Profitable runs: ${profitable}/${RUNS} (${((profitable / RUNS) * 100).toFixed(0)}%)`);
  console.log(`  Average profit:  ${Math.round(avgProfit)} bits`);
  console.log(`  Average ROI:     ${avgROI.toFixed(2)}%`);
  console.log(`  Average win rate: ${avgWinRate.toFixed(1)}%`);
  console.log(`  Best run:  +${Math.max(...results.map(r => r.profit))} bits`);
  console.log(`  Worst run: ${Math.min(...results.map(r => r.profit))} bits`);
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
