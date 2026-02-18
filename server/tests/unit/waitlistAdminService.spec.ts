const { fromMock, resolveAuthUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  resolveAuthUserMock: vi.fn(),
}));

vi.mock('../../src/config/config', () => ({
  config: {
    admin: {
      internalBearer: '',
    },
  },
}));

vi.mock('../../src/config/supabase', () => ({
  supabase: {
    from: fromMock,
  },
  resolveAuthUser: resolveAuthUserMock,
}));

import { WaitlistAdminService } from '../../src/services/waitlistAdminService';

describe('WaitlistAdminService.inviteNextWaitlist', () => {
  afterEach(() => {
    fromMock.mockReset();
    resolveAuthUserMock.mockReset();
  });

  it('invites the next oldest PENDING rows using status column', async () => {
    const employeesMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'emp_1',
        email: 'admin@p3lending.space',
        role: 'ADMIN',
        is_active: true,
      },
      error: null,
    });
    const employeesLimitMock = vi.fn(() => ({ maybeSingle: employeesMaybeSingleMock }));
    const employeesEqRoleMock = vi.fn(() => ({ limit: employeesLimitMock }));
    const employeesEqEmailMock = vi.fn(() => ({ eq: employeesEqRoleMock }));
    const employeesSelectMock = vi.fn(() => ({ eq: employeesEqEmailMock }));
    const employeesBuilder = { select: employeesSelectMock };

    const pendingLimitMock = vi.fn().mockResolvedValue({
      data: [{ id: 'wait_1' }, { id: 'wait_2' }],
      error: null,
    });
    const pendingOrderMock = vi.fn(() => ({ limit: pendingLimitMock }));
    const pendingEqMock = vi.fn(() => ({ order: pendingOrderMock }));
    const pendingSelectMock = vi.fn(() => ({ eq: pendingEqMock }));
    const pendingBuilder = { select: pendingSelectMock };

    const updateInMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ in: updateInMock }));
    const updateBuilder = { update: updateMock };

    const rowsOrderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'wait_1',
          name: 'Alice',
          email: 'alice@example.com',
          status: 'INVITED',
          created_at: '2026-02-18T00:00:00.000Z',
          referral_code: null,
          referred_by: null,
          referral_count: 0,
          waitlist_score: 0,
        },
        {
          id: 'wait_2',
          name: 'Bob',
          email: 'bob@example.com',
          status: 'INVITED',
          created_at: '2026-02-18T00:00:01.000Z',
          referral_code: null,
          referred_by: null,
          referral_count: 0,
          waitlist_score: 0,
        },
      ],
      error: null,
    });
    const rowsInMock = vi.fn(() => ({ order: rowsOrderMock }));
    const rowsSelectMock = vi.fn(() => ({ in: rowsInMock }));
    const rowsBuilder = { select: rowsSelectMock };

    const waitlistBuilders = [pendingBuilder, updateBuilder, rowsBuilder];
    fromMock.mockImplementation((table: string) => {
      if (table === 'employees') return employeesBuilder;
      if (table === 'waitlist') {
        const next = waitlistBuilders.shift();
        if (!next) {
          throw new Error('Unexpected waitlist query');
        }
        return next;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await WaitlistAdminService.inviteNextWaitlist({
      adminEmail: 'admin@p3lending.space',
      authorizationHeader: '',
      batchSize: 2,
    });

    expect(result.requested).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(pendingEqMock).toHaveBeenCalledWith('status', 'PENDING');
    expect(pendingOrderMock).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(updateMock).toHaveBeenCalledWith({ status: 'INVITED' });
    expect(updateInMock).toHaveBeenCalledWith('id', ['wait_1', 'wait_2']);
    expect(resolveAuthUserMock).not.toHaveBeenCalled();
  });
});
