#!/usr/bin/env node

/**
 * OpenClaw Bustabit Bot - Stats Viewer
 * View saved session statistics and AI learning progress.
 * Run: node src/stats.js
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');

function loadJSON(filename) {
  const filepath = path.join(dataDir, filename);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  }
  return null;
}

function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          OpenClaw Bustabit Bot - Saved Stats            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Bankroll state
  const bankroll = loadJSON('bankroll-state.json');
  if (bankroll) {
    console.log('  BANKROLL STATE:');
    console.log(`    Balance:       ${bankroll.balance} bits`);
    console.log(`    Total Wagered: ${bankroll.totalWagered} bits`);
    console.log(`    Total Profit:  ${bankroll.totalProfit >= 0 ? '+' : ''}${bankroll.totalProfit} bits`);
    console.log(`    Peak Balance:  ${bankroll.peakBalance} bits`);
    console.log(`    Bets Recorded: ${bankroll.bets ? bankroll.bets.length : 0}`);
    console.log(`    Last Saved:    ${new Date(bankroll.savedAt).toLocaleString()}`);
    console.log('');
  } else {
    console.log('  No bankroll state found. Run the bot first.\n');
  }

  // AI state
  const ai = loadJSON('ai-state.json');
  if (ai) {
    console.log('  AI LEARNING STATE:');
    console.log(`    Generation:    ${ai.generation}`);
    console.log(`    Decisions:     ${ai.recentDecisions ? ai.recentDecisions.length : 0}`);
    console.log('');
    console.log('  Learned Parameters:');
    if (ai.learnedParams) {
      const p = ai.learnedParams;
      console.log(`    Optimal Cashout (Low):  ${p.optimalCashoutLow?.toFixed(2) || 'N/A'}x`);
      console.log(`    Optimal Cashout (Mid):  ${p.optimalCashoutMid?.toFixed(2) || 'N/A'}x`);
      console.log(`    Optimal Cashout (High): ${p.optimalCashoutHigh?.toFixed(2) || 'N/A'}x`);
      console.log(`    Bet Scale Factor:       ${p.betScaleFactor?.toFixed(2) || 'N/A'}x`);
      console.log(`    Skip Threshold:         ${p.skipThreshold?.toFixed(2) || 'N/A'}`);
    }
    console.log('');
    console.log('  Strategy Rankings:');
    if (ai.strategyScores) {
      const sorted = Object.entries(ai.strategyScores)
        .filter(([_, d]) => d.totalBets > 0)
        .sort((a, b) => b[1].ema - a[1].ema);

      sorted.forEach(([name, data], i) => {
        const wr = data.totalBets > 0 ? ((data.wins / data.totalBets) * 100).toFixed(1) : '0.0';
        console.log(`    ${i + 1}. ${name.padEnd(15)} EMA: ${Math.round(data.ema)} | WR: ${wr}% | Profit: ${data.totalProfit} | Bets: ${data.totalBets}`);
      });
    }
    console.log(`    Last Saved: ${new Date(ai.savedAt).toLocaleString()}`);
    console.log('');
  } else {
    console.log('  No AI state found. Run the bot first.\n');
  }

  // Game history
  const history = loadJSON('game-history.json');
  if (history && history.length > 0) {
    console.log('  GAME HISTORY:');
    console.log(`    Recorded Games: ${history.length}`);
    const crashes = history.map(g => g.crash);
    const avg = crashes.reduce((s, v) => s + v, 0) / crashes.length;
    const below2 = crashes.filter(c => c < 2).length;
    const above10 = crashes.filter(c => c >= 10).length;
    console.log(`    Average Crash:  ${avg.toFixed(2)}x`);
    console.log(`    Below 2x:       ${((below2 / crashes.length) * 100).toFixed(1)}%`);
    console.log(`    Above 10x:      ${((above10 / crashes.length) * 100).toFixed(1)}%`);
    console.log('');
  }

  console.log('═'.repeat(60) + '\n');
}

main();
