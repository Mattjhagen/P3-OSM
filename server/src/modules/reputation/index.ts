/**
 * Reputation-core module: B2B-capable scoring API.
 * Standalone; not coupled to UI.
 */

export type { ScoreInput, ScoreResult, ScoreBand, RepSnapshotRow } from './types';
export { fetchScoreInput } from './fetchScoreInput';
export type { FetchScoreInputOptions } from './fetchScoreInput';
export { computeReputationScore } from './computeScore';
export {
  getLatestSnapshot,
  isSnapshotFresh,
  writeScoreSnapshot,
  logRepEvent,
  snapshotToApiResult,
} from './persistence';
