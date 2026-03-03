#!/usr/bin/env node

/**
 * ╔════════════════════════════════════════════════════════════╗
 * ║          OpenClaw Bustabit Bot v2.0                       ║
 * ║   Self-improving AI gambling bot with risk protection     ║
 * ╚════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node src/index.js                   Run in simulation mode
 *   node src/index.js --simulate        Run simulation (explicit)
 *   node src/index.js --export-script   Export Bustabit autobet script
 *   node src/index.js --games 5000      Run N simulation games
 *   node src/index.js --balance 50000   Set starting balance
 *   node src/index.js --resume          Resume from saved state
 */

const config = require('./config');
const Logger = require('./utils/logger');
const BankrollManager = require('./utils/bankroll');
const GameHistory = require('./utils/gameHistory');
const BustabitConnector = require('./bustabitConnector');

const ConservativeStrategy = require('./strategies/conservativeStrategy');
const MartingaleStrategy = require('./strategies/martingaleStrategy');
const StatisticalStrategy = require('./strategies/statisticalStrategy');
const SniperStrategy = require('./strategies/sniperStrategy');

const PatternEngine = require('./ai/patternEngine');
const SelfLearner = require('./ai/selfLearner');
const StrategySelector = require('./ai/strategySelector');

// Parse CLI arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
};
const hasFlag = (name) => args.includes(name);

async function main() {
  const log = new Logger();

  log.banner('OpenClaw Bustabit Bot v2.0');
  log.info('Self-improving AI gambling bot');
  log.info('─'.repeat(40));

  // Handle --export-script
  if (hasFlag('--export-script')) {
    const script = BustabitConnector.generateBustabitScript(config);
    console.log(script);
    log.info('Script exported. Paste into Bustabit script editor.');
    process.exit(0);
  }

  // Override config from CLI
  if (getArg('--games')) config.simulation.games = parseInt(getArg('--games'));
  if (getArg('--balance')) config.bankroll.startingBalance = parseInt(getArg('--balance'));
  if (hasFlag('--verbose')) config.logging.verbose = true;
  if (hasFlag('--fast')) config.simulation.speed = 0;

  // Initialize components
  const bankroll = new BankrollManager(config.bankroll, log);
  const history = new GameHistory();
  const connector = new BustabitConnector(config, log);

  // Initialize strategies
  const strategies = [
    new ConservativeStrategy(config.strategies.conservative),
    new MartingaleStrategy(config.strategies.martingale),
    new StatisticalStrategy(config.strategies.statistical),
    new SniperStrategy(config.strategies.sniper),
  ];

  // Initialize AI
  const patternEngine = new PatternEngine(log);
  const selfLearner = new SelfLearner(log);
  const selector = new StrategySelector(strategies, patternEngine, selfLearner, log);

  // Resume from saved state if requested
  if (hasFlag('--resume')) {
    bankroll.loadState();
    history.load();
    selfLearner.loadState();
    log.info('Resumed from saved state');
  }

  // Connect
  await connector.connect();

  // Print config summary
  log.info(`Mode: ${connector.isSimulation() ? 'SIMULATION' : 'LIVE'}`);
  log.info(`Starting balance: ${bankroll.getBalance()} ${config.bankroll.currency}`);
  log.info(`Stop-loss: ${config.bankroll.stopLossPercent}% | Take-profit: ${config.bankroll.takeProfitPercent}%`);
  log.info(`Max bet: ${config.bankroll.maxBetPercent}% of bankroll`);
  log.info(`Strategies: ${strategies.filter(s => s.enabled).map(s => s.name).join(', ')}`);
  log.info(`AI Learning: ${config.ai.enableLearning ? 'ON' : 'OFF'}`);
  log.info('─'.repeat(40));
  log.info('Starting bot...\n');

  // Main game loop
  const totalGames = config.simulation.games;
  let gameCount = 0;
  let betsPlaced = 0;
  let gamesSkipped = 0;
  let running = true;

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.warn('Shutting down gracefully...');
    running = false;
  });

  while (running && gameCount < totalGames) {
    gameCount++;

    // Get next game
    const game = await connector.nextGame();
    if (!game) break;

    // Build context for strategy decision
    const context = {
      bankroll,
      history,
      ai: selfLearner,
      gameNumber: gameCount,
    };

    // Get bot's decision
    const decision = selector.selectAndDecide(context);

    if (decision.bet) {
      // Place the bet
      const result = await connector.placeBet(decision.amount, decision.cashoutAt);

      if (result) {
        // Record everything
        const betRecord = bankroll.recordBet(
          decision.amount, result.crash, result.won, decision.cashoutAt
        );

        // Update strategy that was used
        const usedStrategy = strategies.find(s => s.name === decision.strategy);
        if (usedStrategy) {
          usedStrategy.recordResult(result.won, result.profit);
          selector.updateWeights(decision.strategy, result.won);
        }

        // Feed AI
        if (config.ai.enableLearning) {
          selfLearner.recordDecision({
            strategy: decision.strategy,
            amount: decision.amount,
            cashoutAt: decision.cashoutAt,
            crashPoint: result.crash,
            won: result.won,
            profit: result.profit,
            skipped: false,
          });
        }

        // Log the result
        betsPlaced++;
        if (result.won) {
          if (config.logging.verbose || config.simulation.showEveryGame) {
            log.profit(
              `Game #${gameCount}: BET ${decision.amount} @ ${decision.cashoutAt}x ` +
              `| Crash: ${result.crash}x | +${result.profit} | ` +
              `[${decision.strategy}] ${decision.reason}`
            );
          }
        } else {
          if (config.logging.verbose || config.simulation.showEveryGame) {
            log.loss(
              `Game #${gameCount}: BET ${decision.amount} @ ${decision.cashoutAt}x ` +
              `| Crash: ${result.crash}x | ${result.profit} | ` +
              `[${decision.strategy}] ${decision.reason}`
            );
          }
        }
      }
    } else {
      gamesSkipped++;

      // Record as skipped for AI learning
      if (config.ai.enableLearning) {
        selfLearner.recordDecision({
          strategy: 'skip',
          amount: 0,
          cashoutAt: 0,
          crashPoint: game.crash,
          won: false,
          profit: 0,
          skipped: true,
        });
      }

      if (config.logging.verbose) {
        log.info(`Game #${gameCount}: SKIP (crash: ${game.crash}x) - ${decision.reason}`);
      }
    }

    // Record crash in history
    history.add(game.crash);

    // Periodic stats report
    if (gameCount % config.simulation.reportInterval === 0) {
      printStats(log, bankroll, strategies, selfLearner, gameCount, betsPlaced, gamesSkipped);
    }

    // Check if we should stop
    if (bankroll.isStopLossHit()) {
      log.warn('STOP LOSS TRIGGERED - Bot stopping to protect your bankroll');
      running = false;
    }
    if (bankroll.isTakeProfitHit()) {
      log.success('TAKE PROFIT REACHED - Locking in gains!');
      running = false;
    }

    // Delay for simulation readability
    if (config.simulation.speed > 0 && connector.isSimulation()) {
      await sleep(config.simulation.speed);
    }
  }

  // Final report
  log.banner('SESSION COMPLETE');
  printFinalReport(log, bankroll, strategies, selfLearner, selector, gameCount, betsPlaced, gamesSkipped);

  // Save state
  bankroll.saveState();
  history.save();
  selfLearner.saveState();
  log.info('State saved for next session (use --resume to continue)');

  log.close();
}

function printStats(log, bankroll, strategies, learner, games, bets, skipped) {
  const stats = bankroll.getStats();
  const profitColor = stats.totalProfit >= 0 ? '\x1b[32m' : '\x1b[31m';

  console.log('');
  log.info(`════ Progress Report (Game ${games}) ════`);

  log.table(
    ['Metric', 'Value'],
    [
      ['Balance', `${stats.balance} (${stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit})`],
      ['Win Rate', stats.winRate],
      ['ROI', stats.roi],
      ['Bets / Skipped', `${bets} / ${skipped}`],
      ['Profit Factor', stats.profitFactor],
      ['Max Drawdown', stats.maxDrawdown],
      ['Consec W/L', `${stats.consecutiveWins}W / ${stats.consecutiveLosses}L`],
    ]
  );

  // AI learning status
  const rankings = learner.getStrategyRankings();
  if (rankings.length > 0) {
    log.ai(`Strategy rankings (Gen ${learner.generation}):`);
    rankings.forEach((r, i) => {
      const prefix = i === 0 ? '>>>' : '   ';
      log.info(`  ${prefix} ${r.name}: EMA=${r.ema} WR=${r.winRate}% Profit=${r.totalProfit}`);
    });
  }

  console.log('');
}

function printFinalReport(log, bankroll, strategies, learner, selector, games, bets, skipped) {
  const stats = bankroll.getStats();

  log.table(
    ['FINAL RESULTS', 'Value'],
    [
      ['Total Games', games],
      ['Bets Placed', bets],
      ['Games Skipped', skipped],
      ['Bet Rate', `${((bets / games) * 100).toFixed(1)}%`],
      ['─', '─'],
      ['Starting Balance', `${stats.startingBalance} bits`],
      ['Final Balance', `${stats.balance} bits`],
      ['Total Profit', `${stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit} bits`],
      ['ROI', stats.roi],
      ['─', '─'],
      ['Win Rate', stats.winRate],
      ['Wins / Losses', `${stats.wins} / ${stats.losses}`],
      ['Avg Win', `+${stats.avgWin} bits`],
      ['Avg Loss', `-${stats.avgLoss} bits`],
      ['Profit Factor', stats.profitFactor],
      ['─', '─'],
      ['Peak Balance', `${stats.peakBalance} bits`],
      ['Max Drawdown', stats.maxDrawdown],
      ['Total Wagered', `${stats.totalWagered} bits`],
    ]
  );

  // Strategy breakdown
  console.log('');
  log.info('Strategy Performance:');
  log.table(
    ['Strategy', 'Games', 'Win Rate', 'Profit', 'Score'],
    strategies.map(s => {
      const st = s.getStats();
      return [st.name, st.gamesPlayed, st.winRate, st.totalProfit, st.score];
    })
  );

  // AI insights
  const params = learner.getParams();
  console.log('');
  log.ai('Learned Parameters:');
  log.info(`  Optimal cashouts: Low=${params.optimalCashoutLow.toFixed(2)}x Mid=${params.optimalCashoutMid.toFixed(2)}x High=${params.optimalCashoutHigh.toFixed(2)}x`);
  log.info(`  Bet scale: ${params.betScaleFactor.toFixed(2)}x | Skip threshold: ${params.skipThreshold.toFixed(2)}`);
  log.info(`  AI Generations: ${learner.generation}`);

  // Strategy weights
  const weights = selector.getWeights();
  log.info(`  Strategy weights: ${Object.entries(weights).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' | ')}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
