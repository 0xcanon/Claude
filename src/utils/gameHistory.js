/**
 * OpenClaw Bustabit Bot - Game History Tracker
 * Records and analyzes crash point history for pattern detection.
 */

const fs = require('fs');
const path = require('path');

class GameHistory {
  constructor(maxSize = 10000) {
    this.games = [];
    this.maxSize = maxSize;
    this.historyFile = path.join(__dirname, '../../data/game-history.json');
  }

  add(crashPoint) {
    this.games.push({
      crash: crashPoint,
      timestamp: Date.now(),
    });
    if (this.games.length > this.maxSize) {
      this.games = this.games.slice(-this.maxSize);
    }
  }

  getLast(n) {
    return this.games.slice(-n).map(g => g.crash);
  }

  getAll() {
    return this.games.map(g => g.crash);
  }

  size() {
    return this.games.length;
  }

  // Statistical analysis
  getStats(windowSize) {
    const crashes = windowSize ? this.getLast(windowSize) : this.getAll();
    if (crashes.length === 0) return null;

    const sorted = [...crashes].sort((a, b) => a - b);
    const mean = crashes.reduce((s, v) => s + v, 0) / crashes.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const variance = crashes.reduce((s, v) => s + (v - mean) ** 2, 0) / crashes.length;
    const stddev = Math.sqrt(variance);

    // Percentile distribution
    const below1_5 = crashes.filter(c => c < 1.5).length / crashes.length;
    const below2 = crashes.filter(c => c < 2).length / crashes.length;
    const below3 = crashes.filter(c => c < 3).length / crashes.length;
    const above5 = crashes.filter(c => c >= 5).length / crashes.length;
    const above10 = crashes.filter(c => c >= 10).length / crashes.length;

    return {
      count: crashes.length,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      below1_5: Math.round(below1_5 * 1000) / 10,
      below2: Math.round(below2 * 1000) / 10,
      below3: Math.round(below3 * 1000) / 10,
      above5: Math.round(above5 * 1000) / 10,
      above10: Math.round(above10 * 1000) / 10,
    };
  }

  // Streak analysis - how many games since last crash below a threshold
  getStreakAbove(threshold) {
    const crashes = this.getAll();
    let streak = 0;
    for (let i = crashes.length - 1; i >= 0; i--) {
      if (crashes[i] >= threshold) streak++;
      else break;
    }
    return streak;
  }

  getStreakBelow(threshold) {
    const crashes = this.getAll();
    let streak = 0;
    for (let i = crashes.length - 1; i >= 0; i--) {
      if (crashes[i] < threshold) streak++;
      else break;
    }
    return streak;
  }

  // Moving average of crash points
  getMovingAverage(window = 20) {
    const crashes = this.getAll();
    if (crashes.length < window) return null;
    const recent = crashes.slice(-window);
    return recent.reduce((s, v) => s + v, 0) / window;
  }

  // Volatility (standard deviation of recent crashes)
  getVolatility(window = 30) {
    const crashes = this.getLast(window);
    if (crashes.length < 5) return null;
    const mean = crashes.reduce((s, v) => s + v, 0) / crashes.length;
    const variance = crashes.reduce((s, v) => s + (v - mean) ** 2, 0) / crashes.length;
    return Math.sqrt(variance);
  }

  // Detect if we're in a "hot" or "cold" streak
  getTrend(shortWindow = 10, longWindow = 50) {
    const shortMA = this.getMovingAverage(shortWindow);
    const longMA = this.getMovingAverage(longWindow);
    if (!shortMA || !longMA) return 'unknown';

    const ratio = shortMA / longMA;
    if (ratio > 1.15) return 'hot';      // Recent games crashing higher than average
    if (ratio < 0.85) return 'cold';     // Recent games crashing lower than average
    return 'neutral';
  }

  // Distribution buckets for pattern analysis
  getDistribution(window = 100) {
    const crashes = this.getLast(window);
    const buckets = {
      instant: 0,    // < 1.2x
      low: 0,        // 1.2x - 2x
      medium: 0,     // 2x - 5x
      high: 0,       // 5x - 10x
      moon: 0,       // 10x+
    };

    crashes.forEach(c => {
      if (c < 1.2) buckets.instant++;
      else if (c < 2) buckets.low++;
      else if (c < 5) buckets.medium++;
      else if (c < 10) buckets.high++;
      else buckets.moon++;
    });

    // Convert to percentages
    const total = crashes.length || 1;
    Object.keys(buckets).forEach(k => {
      buckets[k] = Math.round((buckets[k] / total) * 1000) / 10;
    });

    return buckets;
  }

  save() {
    const dir = path.dirname(this.historyFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.historyFile, JSON.stringify(this.games.slice(-5000), null, 2));
  }

  load() {
    if (fs.existsSync(this.historyFile)) {
      this.games = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
      return this.games.length;
    }
    return 0;
  }
}

module.exports = GameHistory;
