# OpenClaw Bustabit Bot v2.0

Self-improving AI-powered Bustabit gambling bot with adaptive strategies, pattern recognition, and bankroll protection.

## Features

- **4 Built-in Strategies** that compete and the AI selects the best one in real-time
  - **Conservative** - Low-risk steady earner (1.2x-1.5x cashouts, high win rate)
  - **Martingale** - Modified loss-recovery with safety caps (prevents ruin)
  - **Statistical** - Uses crash distribution analysis and mean reversion signals
  - **Sniper** - Waits for high-confidence opportunities, strikes with larger bets

- **Self-Learning AI** that improves over time
  - Pattern recognition engine (n-gram analysis of crash sequences)
  - Exponential moving average scoring of strategy performance
  - Dynamic parameter evolution every 50 bets
  - Learns optimal cashout points from historical outcomes
  - Auto-adjusts bet sizing based on win/loss patterns

- **Bankroll Protection**
  - Stop-loss (default: 25% of starting balance)
  - Take-profit target (default: 50% gain)
  - Max bet cap (default: 2% of bankroll per bet)
  - Daily loss limit (default: 15%)
  - Max consecutive loss cooldown
  - Dynamic position sizing that shrinks during drawdowns

- **Simulation & Backtesting**
  - Full simulation mode with realistic crash distribution
  - Multi-run backtester with statistical summary
  - State persistence - save/resume across sessions

## Quick Start

```bash
# Run simulation (default: 1000 games, 10000 bits starting balance)
node src/index.js

# Run more games
node src/index.js --games 5000

# Set custom starting balance
node src/index.js --balance 50000

# Fast mode (no delay between games)
node src/index.js --fast

# Verbose output (see every bet)
node src/index.js --verbose

# Resume from previous session
node src/index.js --resume

# Run backtests
node src/backtest.js --games 2000 --runs 10

# View saved stats
node src/stats.js

# Run tests
npm test

# Export Bustabit autobet script for live play
node src/index.js --export-script > bustabit-script.js
```

## How the AI Works

### Strategy Selection
The bot runs all 4 strategies simultaneously each game. Each strategy decides whether to bet and at what parameters. The **Strategy Selector** picks the best decision based on:
1. AI performance scoring (exponential moving average)
2. Pattern engine predictions
3. Strategy weight adjustments from win/loss history

### Self-Learning Loop
Every 50 bets, the AI "evolves" its parameters:
- Analyzes which cashout values actually won
- Nudges optimal cashout targets toward winning values
- Adjusts global bet scaling (bets more when profitable, less when losing)
- Evaluates skip decisions (were we right to sit out?)

### Pattern Recognition
The engine uses n-gram analysis (3, 5, 7-length sequences) on bucketed crash data:
- `X` = Instant bust (<1.2x)
- `L` = Low (1.2x-1.5x)
- `M` = Medium (1.5x-2x)
- `H` = High (2x-3x)
- `V` = Very High (3x-5x)
- `S` = Super (5x-10x)
- `G` = Moon (10x+)

When the current sequence matches a historical pattern with enough occurrences, it predicts the likely next crash range.

## Configuration

Edit `src/config.js` to customize:

| Setting | Default | Description |
|---------|---------|-------------|
| `bankroll.startingBalance` | 10000 | Starting bits |
| `bankroll.maxBetPercent` | 2 | Max % of bankroll per bet |
| `bankroll.stopLossPercent` | 25 | Stop if lost this % |
| `bankroll.takeProfitPercent` | 50 | Stop if gained this % |
| `bankroll.maxConsecutiveLosses` | 8 | Cooldown after N losses |
| `simulation.games` | 1000 | Games to simulate |
| `simulation.houseEdge` | 0.01 | 1% house edge |
| `ai.enableLearning` | true | Enable AI self-learning |

## Live Play (Bustabit Script)

To use on real Bustabit:

```bash
node src/index.js --export-script
```

This generates a standalone autobet script. Paste it into Bustabit's Script Editor and run.

## Architecture

```
src/
├── index.js                 # Main bot runner
├── config.js                # Configuration
├── simulator.js             # Crash point generator
├── bustabitConnector.js     # Bustabit interface + live script export
├── backtest.js              # Multi-run backtester
├── stats.js                 # View saved statistics
├── test.js                  # Test suite
├── strategies/
│   ├── baseStrategy.js      # Strategy base class
│   ├── conservativeStrategy.js
│   ├── martingaleStrategy.js
│   ├── statisticalStrategy.js
│   └── sniperStrategy.js
├── ai/
│   ├── patternEngine.js     # N-gram pattern recognition
│   ├── selfLearner.js       # Self-improving parameter optimizer
│   └── strategySelector.js  # Multi-strategy arbitration
└── utils/
    ├── logger.js            # Colored console + file logging
    ├── bankroll.js          # Bankroll management + protection
    └── gameHistory.js       # Crash history tracking + analysis
```

## Disclaimer

This bot is for educational and entertainment purposes. Gambling involves risk and the house always has an edge. No bot can guarantee profits. Only gamble what you can afford to lose.
