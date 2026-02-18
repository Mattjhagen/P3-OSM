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

describe('WaitlistAdminService', () => {
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

  it('falls back to base waitlist columns when referral columns are missing', async () => {
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

    const fullRangeMock = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "column waitlist.referral_code does not exist",
      },
      count: null,
    });
    const fullOrderMock = vi.fn(() => ({ range: fullRangeMock }));
    const fullSelectMock = vi.fn(() => ({ order: fullOrderMock }));
    const fullWaitlistBuilder = { select: fullSelectMock };

    const fallbackRangeMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'wait_1',
          name: 'Alice',
          email: 'alice@example.com',
          status: 'PENDING',
          created_at: '2026-02-18T00:00:00.000Z',
        },
      ],
      error: null,
      count: 1,
    });
    const fallbackOrderMock = vi.fn(() => ({ range: fallbackRangeMock }));
    const fallbackSelectMock = vi.fn(() => ({ order: fallbackOrderMock }));
    const fallbackWaitlistBuilder = { select: fallbackSelectMock };

    const waitlistBuilders = [fullWaitlistBuilder, fallbackWaitlistBuilder];
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

    const result = await WaitlistAdminService.getWaitlistQueue({
      adminEmail: 'admin@p3lending.space',
      authorizationHeader: '',
      page: 1,
      pageSize: 100,
    });

    expect(fullSelectMock).toHaveBeenCalledWith(
      'id,name,email,status,created_at,referral_code,referred_by,referral_count,waitlist_score',
      { count: 'exact' }
    );
    expect(fallbackSelectMock).toHaveBeenCalledWith('id,name,email,status,created_at', {
      count: 'exact',
    });
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].email).toBe('alice@example.com');
    expect(result.rows[0].referral_code).toBeNull();
  });
});
