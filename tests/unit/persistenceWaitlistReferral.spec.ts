const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: rpcMock,
    from: vi.fn(),
    auth: {
      getSession: vi.fn(),
    },
  },
}));

import { PersistenceService } from '../../services/persistence';

describe('PersistenceService waitlist referrals', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('creates signup through RPC and maps referral metadata + rank', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          signup_id: '9d6f2279-f706-43ae-9efd-00be954a219e',
          name: 'Alice',
          email: 'alice@example.com',
          referral_code: 'ABCD23EFGH',
          referred_by: '3c99e43f-abfe-4958-bf96-f0aeac19de0a',
          referral_count: 2,
          waitlist_score: 2,
          queue_position: 3,
          is_existing: false,
        },
      ],
      error: null,
    });

    const result = await PersistenceService.addToWaitlist(
      ' Alice ',
      'Alice@Example.com ',
      ' abcd23efgh '
    );

    expect(rpcMock).toHaveBeenCalledWith('create_waitlist_signup', {
      name_input: 'Alice',
      email_input: 'alice@example.com',
      ref_code_input: 'ABCD23EFGH',
    });

    expect(result).toMatchObject({
      id: '9d6f2279-f706-43ae-9efd-00be954a219e',
      name: 'Alice',
      email: 'alice@example.com',
      referralCode: 'ABCD23EFGH',
      referredBy: '3c99e43f-abfe-4958-bf96-f0aeac19de0a',
      referralCount: 2,
      waitlistScore: 2,
      isExisting: false,
      position: 3,
    });
  });

  it('returns existing signup without creating a duplicate credit path', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          signup_id: '4a9daff8-a436-4603-8032-be662f4ea6d5',
          name: 'Existing User',
          email: 'existing@example.com',
          referral_code: 'EXIST12345',
          referred_by: null,
          referral_count: 4,
          waitlist_score: 4,
          queue_position: 1,
          is_existing: true,
        },
      ],
      error: null,
    });

    const result = await PersistenceService.addToWaitlist(
      'Existing User',
      'existing@example.com',
      'SHOULDNOTAPPLY'
    );

    expect(result?.isExisting).toBe(true);
    expect(result?.referralCount).toBe(4);
    expect(result?.waitlistScore).toBe(4);
    expect(result?.position).toBe(1);
  });

  it('gets waitlist position from RPC ranking output', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          queue_position: 7,
          name: 'Ranked User',
          referral_code: 'RANKED7777',
          referral_count: 3,
          waitlist_score: 3,
        },
      ],
      error: null,
    });

    const result = await PersistenceService.getWaitlistPosition('  Ranked@Example.com ');

    expect(rpcMock).toHaveBeenCalledWith('waitlist_position', {
      email_input: 'ranked@example.com',
    });

    expect(result).toMatchObject({
      position: 7,
      name: 'Ranked User',
      referralCode: 'RANKED7777',
      referralCount: 3,
      waitlistScore: 3,
    });
  });

  it('recovers referral token via signup RPC when waitlist_position omits referral_code', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [
          {
            queue_position: 8,
            name: 'Legacy User',
            referral_code: null,
            referral_count: 0,
            waitlist_score: 0,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            signup_id: '11f3a77e-9d12-4cbf-b5f8-8f0acb8f2bd4',
            queue_position: 8,
            name: 'Legacy User',
            referral_code: null,
            referral_count: 0,
            waitlist_score: 0,
          },
        ],
        error: null,
      });

    const result = await PersistenceService.getWaitlistPosition('legacy@example.com');

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'waitlist_position', {
      email_input: 'legacy@example.com',
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'create_waitlist_signup', {
      name_input: 'Legacy User',
      email_input: 'legacy@example.com',
      ref_code_input: null,
    });

    expect(result).toMatchObject({
      position: 8,
      name: 'Legacy User',
      referralCode: '11f3a77e-9d12-4cbf-b5f8-8f0acb8f2bd4',
    });
  });

  it('reads total from waitlist_count breakdown response', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ total: 8, pending: 7, invited: 0, onboarded: 1 }],
      error: null,
    });

    const count = await PersistenceService.getWaitlistCount();

    expect(rpcMock).toHaveBeenCalledWith('waitlist_count');
    expect(count).toBe(8);
  });

  it('supports legacy scalar waitlist_count response during rollout', async () => {
    rpcMock.mockResolvedValueOnce({
      data: 8,
      error: null,
    });

    const count = await PersistenceService.getWaitlistCount();

    expect(rpcMock).toHaveBeenCalledWith('waitlist_count');
    expect(count).toBe(8);
  });
});
