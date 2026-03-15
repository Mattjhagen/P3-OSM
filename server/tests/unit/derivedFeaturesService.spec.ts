import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aggregateIntoRecommendationFeatures } from '../../src/services/derivedFeaturesService';
import { supabase } from '../../src/config/supabase';

const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockMaybeSingle = vi.fn().mockResolvedValue({
  data: { event_count: 0, scoring_inputs: {} },
});

const chain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: mockMaybeSingle,
  upsert: mockUpsert,
};
vi.mock('../../src/config/supabase', () => ({
  supabase: {
    from: vi.fn(() => chain),
  },
}));

describe('derivedFeaturesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    mockMaybeSingle.mockResolvedValue({ data: { event_count: 0, scoring_inputs: {} } });
    mockUpsert.mockResolvedValue({ data: null, error: null });
  });

  it('aggregateIntoRecommendationFeatures produces scoring_inputs with event_name_counts and last_event_name', async () => {
    await aggregateIntoRecommendationFeatures('anon_1', 'sess_1', 'page_view', { page: '/landing' });

    expect(supabase.from).toHaveBeenCalledWith('recommendation_features');
    expect(mockUpsert).toHaveBeenCalled();
    const upsertPayload = mockUpsert.mock.calls[0][0];
    expect(upsertPayload.anonymous_id).toBe('anon_1');
    expect(upsertPayload.session_id).toBe('sess_1');
    expect(upsertPayload.event_count).toBe(1);
    expect(upsertPayload.scoring_inputs.last_event_name).toBe('page_view');
    expect(upsertPayload.scoring_inputs.event_name_counts).toEqual({ page_view: 1 });
    expect(upsertPayload.scoring_inputs.page_counts).toEqual({ '/landing': 1 });
  });
});
