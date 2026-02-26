/**
 * Computes reputation score from ScoreInput.
 * Pure function; no DB or Gemini here (Gemini enrichment is in fetchScoreInput / optional pipeline).
 */

import type { ScoreInput, ScoreResult, ScoreBand } from './types';

const BAND_THRESHOLDS = [80, 60, 40]; // A >= 80, B >= 60, C >= 40, D < 40

function toBand(score: number): ScoreBand {
  if (score >= BAND_THRESHOLDS[0]) return 'A';
  if (score >= BAND_THRESHOLDS[1]) return 'B';
  if (score >= BAND_THRESHOLDS[2]) return 'C';
  return 'D';
}

export function computeReputationScore(input: ScoreInput): ScoreResult {
  const reasons: string[] = [];
  let score = 50; // baseline

  // Repayment (up to +25)
  if (input.repaymentOnTimePct >= 0.95) {
    score += 25;
    reasons.push('Strong on-time repayment history');
  } else if (input.repaymentOnTimePct >= 0.8) {
    score += 15;
    reasons.push('Good repayment history');
  } else if (input.repaymentOnTimePct >= 0.5) {
    score += 5;
    reasons.push('Moderate repayment history');
  }
  if (input.defaultsCount > 0 || input.delinquenciesCount > 2) {
    score -= 20;
    reasons.push('Defaults or delinquencies on file');
  }

  // Volume & recency (up to +15)
  if (input.transactionVolumeCount >= 5 && input.recencyWeight > 0.3) {
    score += 15;
    reasons.push('Active transaction history');
  } else if (input.transactionVolumeCount >= 1) {
    score += 5;
    reasons.push('Some transaction history');
  }

  // Engagement (up to +10)
  if (input.verificationStepsCompleted >= 2) {
    score += 10;
    reasons.push('Verification steps completed');
  }
  if (input.accountAgeDays >= 180) {
    score += 5;
    reasons.push('Established account');
  }

  // Risk flags (penalty)
  if (input.riskFlagsCount > 0) {
    score -= Math.min(30, input.riskFlagsCount * 15);
    reasons.push('Risk flags present');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = toBand(score);
  if (reasons.length === 0) reasons.push('Insufficient history');

  return {
    score,
    band,
    reasons,
    featuresUsed: [
      'repaymentOnTimePct',
      'defaultsCount',
      'delinquenciesCount',
      'transactionVolumeCount',
      'recencyWeight',
      'verificationStepsCompleted',
      'accountAgeDays',
      'riskFlagsCount',
    ],
  };
}
