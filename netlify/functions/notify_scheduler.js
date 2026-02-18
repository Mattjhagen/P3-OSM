import {
  createServiceSupabaseClient,
  isAuthorizedInternalRequest,
  toJsonResponse,
} from './_shared/notification-core.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

const formatUtcDate = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const resolveUserEmailMap = async (supabase, userIds) => {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  const uniqueIds = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase.from('users').select('id,email').in('id', uniqueIds);
  if (error) {
    throw new Error(`Failed to load borrower emails for scheduler: ${error.message}`);
  }

  const emailMap = new Map();
  for (const row of data || []) {
    const email = String(row?.email || '').trim().toLowerCase();
    if (!email) continue;
    emailMap.set(String(row.id), email);
  }
  return emailMap;
};

const enqueueNotification = async (supabase, payload) => {
  const { error } = await supabase.rpc('enqueue_notification', {
    p_user_id: payload.userId,
    p_to_email: payload.toEmail,
    p_template_key: payload.templateKey,
    p_template_data: payload.templateData,
    p_idempotency_key: payload.idempotencyKey,
    p_send_after: payload.sendAfter || null,
  });

  if (error) {
    throw new Error(
      `Failed to enqueue '${payload.templateKey}' notification (${payload.idempotencyKey}): ${error.message}`
    );
  }
};

const baseTemplateData = ({ email, action, amount, referenceId }) => ({
  SiteURL: 'https://p3lending.space',
  UserEmail: email,
  Action: action,
  Amount: amount,
  AssetSymbol: null,
  Timestamp: new Date().toISOString(),
  ReferenceId: referenceId,
  SupportUrl: 'https://p3lending.space/support',
  SecurityUrl: 'https://p3lending.space/security',
});

const toUsd = (value) => `$${Number(value || 0).toFixed(2)}`;

export const config = {
  // 15:00 UTC ~= 9:00 AM America/Chicago during standard time.
  schedule: '0 15 * * *',
};

export const handler = async (event) => {
  if (!isAuthorizedInternalRequest(event)) {
    return toJsonResponse(401, {
      success: false,
      error: 'Unauthorized. notify_scheduler is for internal/scheduled use only.',
    });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return toJsonResponse(500, {
      success: false,
      error:
        'Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = addDays(todayStart, 1);
  const dueSoonStart = addDays(todayStart, 3);
  const dueSoonEnd = addDays(dueSoonStart, 1);

  try {
    const [dueSoonResult, dueTodayResult, overdueResult] = await Promise.all([
      supabase
        .from('loan_activity')
        .select('id,borrower_id,amount_usd,due_date,status')
        .not('due_date', 'is', null)
        .gte('due_date', dueSoonStart.toISOString())
        .lt('due_date', dueSoonEnd.toISOString())
        .neq('status', 'repaid')
        .neq('status', 'defaulted')
        .limit(500),
      supabase
        .from('loan_activity')
        .select('id,borrower_id,amount_usd,due_date,status')
        .not('due_date', 'is', null)
        .gte('due_date', todayStart.toISOString())
        .lt('due_date', todayEnd.toISOString())
        .neq('status', 'repaid')
        .neq('status', 'defaulted')
        .limit(500),
      supabase
        .from('loan_activity')
        .select('id,borrower_id,amount_usd,due_date,status')
        .not('due_date', 'is', null)
        .lt('due_date', todayStart.toISOString())
        .neq('status', 'repaid')
        .neq('status', 'defaulted')
        .limit(1000),
    ]);

    if (dueSoonResult.error) {
      throw new Error(`Failed to query due-soon loans: ${dueSoonResult.error.message}`);
    }
    if (dueTodayResult.error) {
      throw new Error(`Failed to query due-today loans: ${dueTodayResult.error.message}`);
    }
    if (overdueResult.error) {
      throw new Error(`Failed to query overdue loans: ${overdueResult.error.message}`);
    }

    const dueSoonRows = dueSoonResult.data || [];
    const dueTodayRows = dueTodayResult.data || [];
    const overdueRows = overdueResult.data || [];
    const borrowerIds = [...dueSoonRows, ...dueTodayRows, ...overdueRows].map(
      (row) => row.borrower_id
    );
    const emailMap = await resolveUserEmailMap(supabase, borrowerIds);

    let dueSoonEnqueued = 0;
    let dueTodayEnqueued = 0;
    let lateEnqueued = 0;
    let skippedNoEmail = 0;

    for (const row of dueSoonRows) {
      const borrowerId = String(row.borrower_id || '').trim();
      const toEmail = emailMap.get(borrowerId);
      if (!borrowerId || !toEmail) {
        skippedNoEmail += 1;
        continue;
      }

      const dueDateKey = formatUtcDate(row.due_date);
      await enqueueNotification(supabase, {
        userId: borrowerId,
        toEmail,
        templateKey: 'LOAN_DUE_SOON',
        idempotencyKey: `LOAN_DUE_SOON:${row.id}:${dueDateKey}`,
        templateData: {
          ...baseTemplateData({
            email: toEmail,
            action: 'Loan Payment Due Soon',
            amount: toUsd(row.amount_usd),
            referenceId: String(row.id),
          }),
          DueDate: dueDateKey,
          DaysUntilDue: 3,
          LoanStatus: row.status,
        },
      });
      dueSoonEnqueued += 1;
    }

    for (const row of dueTodayRows) {
      const borrowerId = String(row.borrower_id || '').trim();
      const toEmail = emailMap.get(borrowerId);
      if (!borrowerId || !toEmail) {
        skippedNoEmail += 1;
        continue;
      }

      const dueDateKey = formatUtcDate(row.due_date);
      await enqueueNotification(supabase, {
        userId: borrowerId,
        toEmail,
        templateKey: 'LOAN_DUE_SOON',
        idempotencyKey: `LOAN_DUE_TODAY:${row.id}:${dueDateKey}`,
        templateData: {
          ...baseTemplateData({
            email: toEmail,
            action: 'Loan Payment Due Today',
            amount: toUsd(row.amount_usd),
            referenceId: String(row.id),
          }),
          DueDate: dueDateKey,
          DaysUntilDue: 0,
          LoanStatus: row.status,
        },
      });
      dueTodayEnqueued += 1;
    }

    for (const row of overdueRows) {
      const borrowerId = String(row.borrower_id || '').trim();
      const toEmail = emailMap.get(borrowerId);
      if (!borrowerId || !toEmail) {
        skippedNoEmail += 1;
        continue;
      }

      const dueDate = startOfUtcDay(new Date(row.due_date));
      const daysOverdue = Math.floor((todayStart.getTime() - dueDate.getTime()) / DAY_MS);
      if (![1, 3, 7].includes(daysOverdue)) {
        continue;
      }

      const stage = `day${daysOverdue}`;
      await enqueueNotification(supabase, {
        userId: borrowerId,
        toEmail,
        templateKey: 'LOAN_PAYMENT_LATE',
        idempotencyKey: `LOAN_LATE:${row.id}:${formatUtcDate(todayStart)}:${stage}`,
        templateData: {
          ...baseTemplateData({
            email: toEmail,
            action: 'Loan Payment Overdue',
            amount: toUsd(row.amount_usd),
            referenceId: String(row.id),
          }),
          DueDate: formatUtcDate(row.due_date),
          LateStage: stage,
          DaysOverdue: daysOverdue,
          LoanStatus: row.status,
        },
      });
      lateEnqueued += 1;
    }

    return toJsonResponse(200, {
      success: true,
      data: {
        scannedDueSoon: dueSoonRows.length,
        scannedDueToday: dueTodayRows.length,
        scannedOverdue: overdueRows.length,
        dueSoonEnqueued,
        dueTodayEnqueued,
        lateEnqueued,
        skippedNoEmail,
        runAt: now.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scheduler error';
    return toJsonResponse(500, {
      success: false,
      error: message,
    });
  }
};
