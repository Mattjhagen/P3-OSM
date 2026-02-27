/**
 * B2B Reputation Score module — input/output types.
 * Standalone interface; not coupled to UI.
 */

export interface ScoreInput {
  userId: string;
  kycLevel: number;
  accountAgeDays: number;
  onTimeRate180d: number;
  lateCount30d: number;
  repaymentCountTotal: number;
  defaultEver: boolean;
  defaultInLast90d: boolean;
  activeLoanCount: number;
  utilizationRatio: number | null;
  capacitySignalsMissing: boolean;
}

export type ScoreBand = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ScoreResult {
  trust_score: number;
  risk_score: number;
  capacity_score: number;
  reputation_score: number;
  /** Backward-compatible alias of reputation_score. */
  score: number;
  band: ScoreBand;
  top_reasons_positive: string[];
  top_reasons_negative: string[];
  missing_data: string[];
  caps_applied: string[];
  /** Backward-compatible reasons list */
  reasons: string[];
  featuresUsed: string[];
}

export interface RepSnapshotRow {
  id?: string;
  user_id: string;
  org_id?: string | null;
  trust_score: number;
  risk_score: number;
  capacity_score: number;
  reputation_score: number;
  band: ScoreBand;
  reasons: {
    top_reasons_positive: string[];
    top_reasons_negative: string[];
    missing_data: string[];
    caps_applied: string[];
  };
  features: Record<string, unknown>;
  computed_at: string;
}
