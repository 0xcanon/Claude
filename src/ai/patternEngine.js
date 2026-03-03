/**
 * OpenClaw Bustabit Bot - Pattern Recognition Engine
 * Analyzes game history for recurring patterns and sequences.
 * Uses n-gram analysis to find crash sequences that repeat.
 */

class PatternEngine {
  constructor(logger) {
    this.log = logger;
    this.patterns = new Map(); // pattern hash -> { count, outcomes }
    this.minOccurrences = 3;
    this.ngramSizes = [3, 5, 7]; // Look for patterns of these lengths
  }

  // Categorize a crash into a bucket for pattern matching
  _bucket(crash) {
    if (crash < 1.2) return 'X';   // Instant bust
    if (crash < 1.5) return 'L';   // Low
    if (crash < 2.0) return 'M';   // Medium-low
    if (crash < 3.0) return 'H';   // Medium-high
    if (crash < 5.0) return 'V';   // Very high
    if (crash < 10.0) return 'S';  // Super high
    return 'G';                     // God-tier / moon
  }

  // Build pattern database from history
  analyze(crashes) {
    this.patterns.clear();

    for (const nSize of this.ngramSizes) {
      for (let i = nSize; i < crashes.length; i++) {
        // Create pattern from previous n crashes
        const pattern = crashes
          .slice(i - nSize, i)
          .map(c => this._bucket(c))
          .join('');

        // What followed this pattern?
        const outcome = crashes[i];
        const outcomeBucket = this._bucket(outcome);

        if (!this.patterns.has(pattern)) {
          this.patterns.set(pattern, { count: 0, outcomes: [], outcomeBuckets: {} });
        }

        const p = this.patterns.get(pattern);
        p.count++;
        p.outcomes.push(outcome);

        if (!p.outcomeBuckets[outcomeBucket]) {
          p.outcomeBuckets[outcomeBucket] = 0;
        }
        p.outcomeBuckets[outcomeBucket]++;
      }
    }

    return this.patterns.size;
  }

  // Given recent crashes, predict what comes next
  predict(recentCrashes) {
    const predictions = [];

    for (const nSize of this.ngramSizes) {
      if (recentCrashes.length < nSize) continue;

      const pattern = recentCrashes
        .slice(-nSize)
        .map(c => this._bucket(c))
        .join('');

      const data = this.patterns.get(pattern);
      if (!data || data.count < this.minOccurrences) continue;

      // Calculate outcome probabilities
      const total = data.count;
      const bucketProbs = {};
      Object.entries(data.outcomeBuckets).forEach(([bucket, count]) => {
        bucketProbs[bucket] = count / total;
      });

      // Calculate average outcome
      const avgOutcome = data.outcomes.reduce((s, v) => s + v, 0) / data.outcomes.length;

      // Probability of crash being above various thresholds
      const above1_5 = data.outcomes.filter(o => o >= 1.5).length / total;
      const above2 = data.outcomes.filter(o => o >= 2).length / total;
      const above3 = data.outcomes.filter(o => o >= 3).length / total;
      const above5 = data.outcomes.filter(o => o >= 5).length / total;

      predictions.push({
        ngramSize: nSize,
        pattern,
        sampleSize: total,
        avgOutcome: Math.round(avgOutcome * 100) / 100,
        bucketProbs,
        above1_5: Math.round(above1_5 * 100) / 100,
        above2: Math.round(above2 * 100) / 100,
        above3: Math.round(above3 * 100) / 100,
        above5: Math.round(above5 * 100) / 100,
        confidence: Math.min(total / 20, 1), // More samples = more confidence
      });
    }

    // Sort by confidence (sample size weighted)
    predictions.sort((a, b) => b.confidence * b.sampleSize - a.confidence * a.sampleSize);

    return predictions;
  }

  // Get the best prediction with actionable advice
  getBestPrediction(recentCrashes) {
    const predictions = this.predict(recentCrashes);
    if (predictions.length === 0) return null;

    // Weighted average across all predictions
    let totalWeight = 0;
    let weightedAbove1_5 = 0;
    let weightedAbove2 = 0;
    let weightedAbove3 = 0;
    let weightedAvg = 0;

    predictions.forEach(p => {
      const weight = p.confidence * p.sampleSize;
      totalWeight += weight;
      weightedAbove1_5 += p.above1_5 * weight;
      weightedAbove2 += p.above2 * weight;
      weightedAbove3 += p.above3 * weight;
      weightedAvg += p.avgOutcome * weight;
    });

    if (totalWeight === 0) return null;

    return {
      probAbove1_5: weightedAbove1_5 / totalWeight,
      probAbove2: weightedAbove2 / totalWeight,
      probAbove3: weightedAbove3 / totalWeight,
      expectedCrash: weightedAvg / totalWeight,
      sampleSize: predictions.reduce((s, p) => s + p.sampleSize, 0),
      numPatterns: predictions.length,
      topPattern: predictions[0],
    };
  }
}

module.exports = PatternEngine;
