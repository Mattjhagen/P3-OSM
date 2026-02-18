const {
  fromMock,
  sendMailMock,
  createTransportMock,
  loggerWarnMock,
  loggerInfoMock,
  waitlistState,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  sendMailMock: vi.fn(),
  createTransportMock: vi.fn(() => ({
    sendMail: (...args: any[]) => sendMailMock(...args),
  })),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  waitlistState: {
    rows: [] as any[],
    statusUpdateCalls: 0,
    nameUpdateCalls: 0,
    insertCalls: 0,
  },
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

vi.mock('../../src/config/config', () => ({
  config: {
    frontendUrl: 'https://p3lending.space',
    smtp: {
      host: 'smtp.example.com',
      port: 587,
      user: 'smtp-user',
      pass: 'smtp-pass',
      from: 'admin@p3lending.space',
      fromName: 'P3 Lending Team',
      secure: false,
    },
    netlify: {
      apiToken: '',
      siteId: '',
      waitlistFormId: '',
      waitlistFormName: 'waitlist',
    },
  },
}));

vi.mock('../../src/config/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock('../../src/utils/logger', () => ({
  default: {
    warn: loggerWarnMock,
    info: loggerInfoMock,
  },
}));

import { WaitlistInviteService } from '../../src/services/waitlistInviteService';

const cloneRow = (row: any) => ({ ...row });

const sortByCreatedAtAsc = (rows: any[]) =>
  rows
    .map(cloneRow)
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));

describe('WaitlistInviteService.manualInvite', () => {
  const resetState = () => {
    waitlistState.rows = [];
    waitlistState.statusUpdateCalls = 0;
    waitlistState.nameUpdateCalls = 0;
    waitlistState.insertCalls = 0;
    fromMock.mockReset();
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();
  };

  const installSupabaseMock = () => {
    const employeesLimitMock = vi.fn().mockResolvedValue({
      data: [{ id: 'emp_1', email: 'admin@p3lending.space', is_active: true }],
      error: null,
    });
    const employeesEqActiveMock = vi.fn(() => ({ limit: employeesLimitMock }));
    const employeesEqEmailMock = vi.fn(() => ({ eq: employeesEqActiveMock }));
    const employeesSelectMock = vi.fn(() => ({ eq: employeesEqEmailMock }));
    const employeesBuilder = { select: employeesSelectMock };

    const waitlistBuilder = {
      select: vi.fn(() => ({
        ilike: vi.fn((column: string, normalizedEmail: string) => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: sortByCreatedAtAsc(
                waitlistState.rows.filter(
                  (row) => String(row?.[column] || '').toLowerCase() === normalizedEmail.toLowerCase()
                )
              ),
              error: null,
            })
          ),
        })),
        eq: vi.fn((column: string, value: unknown) => ({
          single: vi.fn(() => {
            const row = waitlistState.rows.find(
              (entry) => String(entry?.[column] || '') === String(value || '')
            );
            if (!row) {
              return Promise.resolve({ data: null, error: { message: 'not found' } });
            }
            return Promise.resolve({ data: cloneRow(row), error: null });
          }),
          order: vi.fn(() => ({
            limit: vi.fn((count: number) =>
              Promise.resolve({
                data: sortByCreatedAtAsc(
                  waitlistState.rows.filter(
                    (entry) =>
                      String(entry?.[column] || '').toUpperCase() === String(value || '').toUpperCase()
                  )
                ).slice(0, count),
                error: null,
              })
            ),
          })),
        })),
      })),
      insert: vi.fn((payload: any) => ({
        select: vi.fn(() => ({
          single: vi.fn(() => {
            waitlistState.insertCalls += 1;
            const row = {
              id: `wait_${waitlistState.rows.length + 1}`,
              name: payload.name,
              email: payload.email,
              status: payload.status || 'PENDING',
              created_at: payload.created_at || '2026-02-18T00:00:00.000Z',
              referral_code: payload.referral_code || null,
            };
            waitlistState.rows.push(row);
            return Promise.resolve({ data: cloneRow(row), error: null });
          }),
        })),
      })),
      update: vi.fn((payload: any) => ({
        eq: vi.fn((column: string, value: unknown) => {
          const row = waitlistState.rows.find(
            (entry) => String(entry?.[column] || '') === String(value || '')
          );
          if (!row) {
            return Promise.resolve({ error: { message: 'not found' } });
          }

          if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
            waitlistState.statusUpdateCalls += 1;
            row.status = payload.status;
            return Promise.resolve({ error: null });
          }

          if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
            waitlistState.nameUpdateCalls += 1;
            row.name = payload.name;
            return {
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: cloneRow(row), error: null })),
              })),
            };
          }

          return Promise.resolve({ error: null });
        }),
      })),
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'employees') return employeesBuilder;
      if (table === 'waitlist') return waitlistBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });
  };

  beforeEach(() => {
    resetState();
    installSupabaseMock();
    sendMailMock.mockResolvedValue({ accepted: ['ok'] });
  });

  it('re-sends invite for already INVITED users without mutating status', async () => {
    waitlistState.rows = [
      {
        id: 'wait_1',
        name: 'Alice',
        email: 'alice@example.com',
        status: 'INVITED',
        created_at: '2026-02-18T00:00:00.000Z',
        referral_code: 'ALICE12345',
      },
    ];

    const result = await WaitlistInviteService.sendManualInvite({
      adminEmail: 'admin@p3lending.space',
      adminName: 'Admin',
      email: 'Alice@Example.com',
    });

    expect(result).toMatchObject({
      id: 'wait_1',
      email: 'alice@example.com',
      status: 'INVITED',
      created: false,
    });
    expect(waitlistState.statusUpdateCalls).toBe(0);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sentPayload = sendMailMock.mock.calls[0]?.[0];
    expect(String(sentPayload?.text || '')).toContain('waitlist_invite=wait_1');
    expect(String(sentPayload?.text || '')).toContain('email=alice%40example.com');
    expect(String(sentPayload?.text || '')).toContain('ref=ALICE12345');
  });

  it('returns 503 on SMTP failure and does not update status', async () => {
    waitlistState.rows = [
      {
        id: 'wait_2',
        name: 'Bob',
        email: 'bob@example.com',
        status: 'PENDING',
        created_at: '2026-02-18T00:00:01.000Z',
        referral_code: null,
      },
    ];
    sendMailMock.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await expect(
      WaitlistInviteService.sendManualInvite({
        adminEmail: 'admin@p3lending.space',
        adminName: 'Admin',
        email: 'bob@example.com',
      })
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('Invite email delivery failed'),
    });

    expect(waitlistState.statusUpdateCalls).toBe(0);
    expect(waitlistState.rows[0].status).toBe('PENDING');
  });

  it('uses the oldest row when duplicate emails exist', async () => {
    waitlistState.rows = [
      {
        id: 'wait_new',
        name: 'Duplicate New',
        email: 'duplicate@example.com',
        status: 'PENDING',
        created_at: '2026-02-18T00:00:02.000Z',
        referral_code: null,
      },
      {
        id: 'wait_old',
        name: 'Duplicate Old',
        email: 'duplicate@example.com',
        status: 'PENDING',
        created_at: '2026-02-18T00:00:01.000Z',
        referral_code: null,
      },
    ];

    const result = await WaitlistInviteService.sendManualInvite({
      adminEmail: 'admin@p3lending.space',
      adminName: 'Admin',
      email: 'duplicate@example.com',
    });

    expect(result.id).toBe('wait_old');
    expect(waitlistState.statusUpdateCalls).toBe(1);
    expect(waitlistState.rows.find((row) => row.id === 'wait_old')?.status).toBe('INVITED');
    expect(waitlistState.rows.find((row) => row.id === 'wait_new')?.status).toBe('PENDING');
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});
