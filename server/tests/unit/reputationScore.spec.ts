import { describe, it, expect } from 'vitest';
import { computeReputationScore } from '../../src/modules/reputation/computeScore';
import type { ScoreInput } from '../../src/modules/reputation/types';

function baseInput(): ScoreInput {
  return {
    userId: '00000000-0000-0000-0000-000000000000',
    kycLevel: 2,
    accountAgeDays: 365,
    onTimeRate180d: 0.99,
    lateCount30d: 0,
    repaymentCountTotal: 20,
    defaultEver: false,
    defaultInLast90d: false,
    activeLoanCount: 1,
    utilizationRatio: 0.3,
    capacitySignalsMissing: false,
  };
}

describe('computeReputationScore', () => {
  it('applies no-history cap at 650', () => {
    const input = { ...baseInput(), repaymentCountTotal: 1 };
    const score = computeReputationScore(input);
    expect(score.caps_applied).toContain('NO_HISTORY_CAP_650');
    expect(score.reputation_score).toBeLessThanOrEqual(650);
  });

  it('applies recent-default cap at 450', () => {
    const input = { ...baseInput(), defaultEver: true, defaultInLast90d: true };
    const score = computeReputationScore(input);
    expect(score.caps_applied).toContain('RECENT_DEFAULT_CAP_450');
    expect(score.reputation_score).toBeLessThanOrEqual(450);
    expect(score.band).toMatch(/[CDE]/);
  });

  it('applies no-kyc cap at 700', () => {
    const input = { ...baseInput(), kycLevel: 0 };
    const score = computeReputationScore(input);
    expect(score.caps_applied).toContain('NO_KYC_CAP_700');
    expect(score.reputation_score).toBeLessThanOrEqual(700);
    expect(score.missing_data).toContain('Complete identity verification to raise your cap');
  });
});

