/**
 * B2B Reputation Score module — input/output types.
 * Standalone interface; not coupled to UI.
 */

export interface ScoreInput {
  /** User ID (resolved from wallet if needed) */
  userId: string;
  /** On-time repayment % (0–1) */
  repaymentOnTimePct: number;
  /** Count of defaults/delinquencies */
  defaultsCount: number;
  /** Delinquency count */
  delinquenciesCount: number;
  /** Transaction count (loans + repayments) */
  transactionVolumeCount: number;
  /** Total volume USD */
  transactionVolumeUsd: number;
  /** Recency weighting (e.g. last 90d activity) 0–1 */
  recencyWeight: number;
  /** Verification steps completed count */
  verificationStepsCompleted: number;
  /** Account age in days */
  accountAgeDays: number;
  /** Active fraud/risk flags count */
  riskFlagsCount: number;
  /** Optional Gemini-enriched signal (feature-flagged) */
  geminiVerification?: Record<string, unknown>;
}

export type ScoreBand = 'A' | 'B' | 'C' | 'D' | 'low' | 'medium' | 'high';

export interface ScoreResult {
  /** Numeric score 0–100 (or 0–1000 if scaling later) */
  score: number;
  /** Band for display/decisions */
  band: ScoreBand;
  /** Human-readable reasons (e.g. "Strong repayment history") */
  reasons: string[];
  /** Internal; only for privileged/debug */
  featuresUsed?: string[];
}
