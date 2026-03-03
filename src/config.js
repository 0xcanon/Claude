/**
 * OpenClaw Bustabit Bot - Configuration
 * Edit these values to customize the bot behavior.
 */

module.exports = {
  // === CONNECTION ===
  bustabit: {
    // Bustabit script engine URL (used when running as a userscript)
    // Set to null for simulation mode
    url: process.env.BUSTABIT_URL || null,
    username: process.env.BUSTABIT_USER || '',
    password: process.env.BUSTABIT_PASS || '',
  },

  // === BANKROLL ===
  bankroll: {
    startingBalance: parseInt(process.env.STARTING_BALANCE) || 10000, // bits
    currency: 'bits',
    maxBetPercent: 2,          // Max % of bankroll per single bet
    stopLossPercent: 25,       // Stop bot if lost this % of starting balance
    takeProfitPercent: 50,     // Stop bot if gained this % profit
    maxConsecutiveLosses: 8,   // Pause after N consecutive losses
    dailyLossLimit: 15,        // Max % loss per day
  },

  // === STRATEGY ===
  strategies: {
    conservative: {
      enabled: true,
      baseBet: 10,
      targetMultiplier: 1.3,
    },
    martingale: {
      enabled: true,
      baseBet: 5,
      maxDoublings: 5,
      targetMultiplier: 2.0,
    },
    statistical: {
      enabled: true,
      baseBet: 8,
      minHistory: 30,
    },
    sniper: {
      enabled: true,
      minWait: 5,
      confidenceThreshold: 0.7,
    },
  },

  // === AI / LEARNING ===
  ai: {
    enableLearning: true,
    enablePatterns: true,
    learningRate: 0.05,
    minHistoryForPatterns: 50,
    evolutionInterval: 50,     // Evolve parameters every N bets
  },

  // === SIMULATION ===
  simulation: {
    enabled: true,             // Run in simulation mode (no real money)
    games: 1000,               // Number of games to simulate
    speed: 50,                 // ms between games (0 for instant)
    houseEdge: 0.01,           // 1% house edge (Bustabit standard)
    showEveryGame: false,      // Log every single game
    reportInterval: 100,       // Show stats every N games
  },

  // === LOGGING ===
  logging: {
    verbose: false,
    logToFile: true,
    statsInterval: 50,         // Print stats every N bets
  },
};
