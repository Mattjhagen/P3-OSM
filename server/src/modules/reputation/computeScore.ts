/**
 * Deterministic Phase 1 reputation scoring.
 * Output scale is 0-1000 with explainability and caps.
 */

import type { ScoreInput, ScoreResult, ScoreBand } from './types';

const MAX = 1000;

function clamp(value: number, min = 0, max = MAX): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function ratioToPoints(value: number): number {
  return clamp(value * MAX);
}

function toBand(score: number): ScoreBand {
  if (score >= 850) return 'A';
  if (score >= 700) return 'B';
  if (score >= 550) return 'C';
  if (score >= 400) return 'D';
  return 'E';
}

export function computeReputationScore(input: ScoreInput): ScoreResult {
  const topPos: string[] = [];
  const topNeg: string[] = [];
  const missingData: string[] = [];
  const capsApplied: string[] = [];

  const trust = clamp(
    ratioToPoints(input.onTimeRate180d) * 0.6 +
      clamp((input.repaymentCountTotal / 20) * MAX) * 0.2 +
      clamp((input.kycLevel / 2) * MAX) * 0.2
  );

  const risk = clamp(
    (input.defaultInLast90d ? 700 : input.defaultEver ? 500 : 150) +
      Math.min(250, input.lateCount30d * 90) +
      (input.utilizationRatio != null ? clamp(input.utilizationRatio * 180) : 80)
  );

  const capacityProxy = clamp(
    ratioToPoints(input.onTimeRate180d) * 0.5 +
      clamp((input.accountAgeDays / 365) * MAX) * 0.35 +
      (input.utilizationRatio != null ? clamp((1 - input.utilizationRatio) * MAX) * 0.15 : 80)
  );

  const capacity = capacityProxy;
  const rawScore = clamp(0.4 * trust + 0.35 * capacity + 0.25 * (MAX - risk));

  // Guardrails (collect all caps, apply most restrictive)
  const capValues: number[] = [];
  if (input.defaultInLast90d) {
    capValues.push(450);
    capsApplied.push('RECENT_DEFAULT_CAP_450');
  }
  if (input.kycLevel === 0) {
    capValues.push(700);
    capsApplied.push('NO_KYC_CAP_700');
  }
  if (input.repaymentCountTotal < 3) {
    capValues.push(650);
    capsApplied.push('NO_HISTORY_CAP_650');
  }
  if (input.accountAgeDays < 7) {
    capValues.push(600);
    capsApplied.push('NEW_ACCOUNT_CAP_600');
  }
  const cap = capValues.length ? Math.min(...capValues) : null;
  const finalScore = cap != null ? Math.min(rawScore, cap) : rawScore;

  // Explainability rules (phase 1)
  if (input.onTimeRate180d >= 0.95 && input.repaymentCountTotal >= 5) {
    topPos.push('Strong on-time repayment history');
  }
  if (input.accountAgeDays >= 180) {
    topPos.push('Established account history');
  }
  if (input.kycLevel >= 1) {
    topPos.push('Identity verified');
  }

  if (input.lateCount30d >= 1) {
    topNeg.push('Recent late payments');
  }
  if (input.defaultEver) {
    topNeg.push('Default history');
  }
  if (input.utilizationRatio != null && input.utilizationRatio >= 0.8) {
    topNeg.push('High utilization');
  }

  if (input.kycLevel === 0) {
    missingData.push('Complete identity verification to raise your cap');
  }
  if (input.repaymentCountTotal < 3) {
    missingData.push('Build repayment history (3+ repayments)');
  }
  if (input.capacitySignalsMissing) {
    missingData.push('Connect cashflow data (coming soon)');
  }
  if (topPos.length === 0 && topNeg.length === 0 && missingData.length === 0) {
    missingData.push('Insufficient history');
  }

  return {
    trust_score: trust,
    risk_score: risk,
    capacity_score: capacity,
    reputation_score: finalScore,
    score: finalScore,
    band: toBand(finalScore),
    top_reasons_positive: topPos,
    top_reasons_negative: topNeg,
    missing_data: missingData,
    caps_applied: capsApplied,
    reasons: [...topPos, ...topNeg, ...missingData, ...capsApplied],
    featuresUsed: [
      'onTimeRate180d',
      'repaymentCountTotal',
      'kycLevel',
      'lateCount30d',
      'defaultEver',
      'defaultInLast90d',
      'utilizationRatio',
      'accountAgeDays',
      'capacityProxy',
    ],
  };
}
