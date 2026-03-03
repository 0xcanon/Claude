#!/usr/bin/env node

/**
 * OpenClaw Bustabit Bot - Test Suite
 * Validates all components work correctly.
 */

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

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
    passed++;
  } catch (e) {
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('\n  OpenClaw Bustabit Bot - Test Suite\n');

// Simulator tests
console.log('  Game Simulator:');
test('generates crash points >= 1.0', () => {
  const sim = new GameSimulator(0.01);
  for (let i = 0; i < 1000; i++) {
    assert(sim.generateCrash() >= 1.0, 'Crash below 1.0');
  }
});

test('crash distribution has correct median (~2x)', () => {
  const sim = new GameSimulator(0.01);
  const crashes = sim.generateHistory(10000);
  const sorted = [...crashes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert(median > 1.3 && median < 3.0, `Median ${median} outside expected range`);
});

test('~1% instant crashes', () => {
  const sim = new GameSimulator(0.01);
  const crashes = sim.generateHistory(10000);
  const instant = crashes.filter(c => c === 1.0).length / crashes.length;
  assert(instant > 0.003 && instant < 0.05, `Instant crash rate ${instant} out of range`);
});

// Bankroll tests
console.log('\n  Bankroll Manager:');
test('initializes with correct balance', () => {
  const log = new Logger();
  const bm = new BankrollManager({ startingBalance: 10000 }, log);
  assert(bm.getBalance() === 10000);
  log.close();
});

test('records wins correctly', () => {
  const log = new Logger();
  const bm = new BankrollManager({ startingBalance: 10000 }, log);
  bm.recordBet(100, 2.5, true, 2.0);
  assert(bm.getBalance() === 10100);
  assert(bm.consecutiveWins === 1);
  log.close();
});

test('records losses correctly', () => {
  const log = new Logger();
  const bm = new BankrollManager({ startingBalance: 10000 }, log);
  bm.recordBet(100, 0.5, false, 2.0);
  assert(bm.getBalance() === 9900);
  assert(bm.consecutiveLosses === 1);
  log.close();
});

test('stop loss triggers correctly', () => {
  const log = new Logger();
  const bm = new BankrollManager({ startingBalance: 10000, stopLossPercent: 10 }, log);
  bm.recordBet(1100, 0.5, false, 2.0);
  assert(bm.isStopLossHit() === true);
  log.close();
});

test('max bet respects limits', () => {
  const log = new Logger();
  const bm = new BankrollManager({ startingBalance: 10000, maxBetPercent: 2 }, log);
  assert(bm.getMaxBet() <= 200);
  log.close();
});

// History tests
console.log('\n  Game History:');
test('tracks crashes and computes stats', () => {
  const gh = new GameHistory();
  [2.5, 1.1, 3.0, 1.5, 5.0, 2.0, 1.0, 4.0, 2.2, 1.8].forEach(c => gh.add(c));
  const stats = gh.getStats();
  assert(stats.count === 10);
  assert(stats.mean > 0);
});

test('streak detection works', () => {
  const gh = new GameHistory();
  [3.0, 3.5, 2.5, 1.5, 1.2, 1.8].forEach(c => gh.add(c));
  assert(gh.getStreakBelow(2) === 3, `Expected streak below 2 to be 3, got ${gh.getStreakBelow(2)}`);
  assert(gh.getStreakAbove(2) === 0);
});

test('distribution buckets sum to ~100%', () => {
  const gh = new GameHistory();
  const sim = new GameSimulator(0.01);
  sim.generateHistory(100).forEach(c => gh.add(c));
  const dist = gh.getDistribution(100);
  const sum = dist.instant + dist.low + dist.medium + dist.high + dist.moon;
  assert(sum > 99 && sum < 101, `Distribution sum ${sum} not ~100`);
});

// Strategy tests
console.log('\n  Strategies:');
test('conservative strategy produces valid decisions', () => {
  const log = new Logger();
  const bm = new BankrollManager({ startingBalance: 10000 }, log);
  const gh = new GameHistory();
  const strategy = new ConservativeStrategy();
  const decision = strategy.decide({ bankroll: bm, history: gh, ai: null });
  assert(decision.bet === true || decision.bet === false);
  if (decision.bet) {
    assert(decision.amount > 0);
    assert(decision.cashoutAt > 1);
  }
  log.close();
});

test('martingale increases bet after loss', () => {
  const log = new Logger();
  const bm = new BankrollManager({ startingBalance: 10000 }, log);
  const gh = new GameHistory();
  const strategy = new MartingaleStrategy();

  const d1 = strategy.decide({ bankroll: bm, history: gh, ai: null });
  bm.recordBet(d1.amount, 0.5, false, 2.0);
  const d2 = strategy.decide({ bankroll: bm, history: gh, ai: null });

  if (d2.bet) {
    assert(d2.amount >= d1.amount, 'Martingale should increase bet after loss');
  }
  log.close();
});

// Pattern Engine tests
console.log('\n  Pattern Engine:');
test('analyzes patterns from crash data', () => {
  const log = new Logger();
  const pe = new PatternEngine(log);
  const sim = new GameSimulator(0.01);
  const crashes = sim.generateHistory(500);
  const count = pe.analyze(crashes);
  assert(count > 0, 'Should find patterns');
  log.close();
});

test('generates predictions', () => {
  const log = new Logger();
  const pe = new PatternEngine(log);
  const sim = new GameSimulator(0.01);
  const crashes = sim.generateHistory(500);
  pe.analyze(crashes);
  const recent = crashes.slice(-7);
  const predictions = pe.predict(recent);
  // May or may not find matching patterns - just verify no errors
  assert(Array.isArray(predictions));
  log.close();
});

// Self Learner tests
console.log('\n  Self Learner:');
test('records decisions and updates scores', () => {
  const log = new Logger();
  const sl = new SelfLearner(log);
  sl.recordDecision({
    strategy: 'TestStrat', amount: 10, cashoutAt: 2.0,
    crashPoint: 3.0, won: true, profit: 10, skipped: false,
  });
  assert(sl.strategyScores['TestStrat'].wins === 1);
  log.close();
});

// Strategy Selector tests
console.log('\n  Strategy Selector:');
test('produces a decision', () => {
  const log = new Logger();
  const bm = new BankrollManager({ startingBalance: 10000 }, log);
  const gh = new GameHistory();
  const strategies = [
    new ConservativeStrategy(),
    new MartingaleStrategy(),
  ];
  const pe = new PatternEngine(log);
  const sl = new SelfLearner(log);
  const selector = new StrategySelector(strategies, pe, sl, log);

  const decision = selector.selectAndDecide({
    bankroll: bm, history: gh, ai: sl, gameNumber: 1,
  });
  assert(decision.bet === true || decision.bet === false);
  log.close();
});

// Print results
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
