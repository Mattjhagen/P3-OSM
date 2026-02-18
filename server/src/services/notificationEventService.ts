import { config } from '../config/config';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';

type TransferMethod = 'STRIPE' | 'BTC' | 'BANK';

const trim = (value: unknown) => String(value || '').trim();
const normalizeEmail = (value: unknown) => trim(value).toLowerCase();
const toUsd = (value: number) => `$${Number(value || 0).toFixed(2)}`;
const normalizeUrl = (value: string) => trim(value).replace(/\/+$/, '');

const resolveSiteUrl = () => normalizeUrl(config.frontendUrl || 'https://p3lending.space');

const buildTemplateData = (input: {
  userEmail: string;
  action: string;
  amount: string;
  referenceId: string;
  assetSymbol?: string;
  timestamp?: string;
  extras?: Record<string, unknown>;
}) => {
  const siteUrl = resolveSiteUrl();
  return {
    SiteURL: siteUrl,
    UserEmail: input.userEmail,
    Action: input.action,
    Amount: input.amount,
    AssetSymbol: input.assetSymbol || null,
    Timestamp: trim(input.timestamp) || new Date().toISOString(),
    ReferenceId: input.referenceId,
    SupportUrl: `${siteUrl}/support`,
    SecurityUrl: `${siteUrl}/security`,
    ...(input.extras || {}),
  };
};

const insertAuditEvent = async (payload: {
  userId: string;
  eventType: string;
  data: Record<string, unknown>;
}) => {
  const { error } = await supabase.from('audit_events').insert({
    user_id: payload.userId,
    event_type: payload.eventType,
    payload: payload.data,
  });

  if (error) {
    throw new Error(`Failed to insert audit event (${payload.eventType}): ${error.message}`);
  }
};

const enqueueNotification = async (payload: {
  userId: string;
  toEmail: string;
  templateKey: string;
  templateData: Record<string, unknown>;
  idempotencyKey: string;
  sendAfter?: string;
}) => {
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
      `Failed to enqueue notification (${payload.templateKey}): ${error.message}`
    );
  }
};

export const NotificationEventService = {
  async recordTradeExecuted(payload: {
    userId: string;
    email?: string;
    orderId?: string | null;
    ledgerId?: string | null;
    symbol: string;
    side: 'BUY' | 'SELL';
    amountUsd: number;
    netAmountUsd: number;
    feeUsd: number;
    fiatCurrency: string;
  }) {
    const toEmail = normalizeEmail(payload.email);
    const referenceId = trim(payload.orderId || payload.ledgerId);
    if (!toEmail || !referenceId) return;

    const eventType = 'SEC_TRADE_EXECUTED';
    const action = payload.side === 'SELL' ? 'Securities Sale' : 'Securities Purchase';
    const auditPayload = {
      orderId: payload.orderId || null,
      ledgerId: payload.ledgerId || null,
      symbol: payload.symbol,
      side: payload.side,
      amountUsd: payload.amountUsd,
      netAmountUsd: payload.netAmountUsd,
      feeUsd: payload.feeUsd,
      fiatCurrency: payload.fiatCurrency,
      occurredAt: new Date().toISOString(),
    };

    await insertAuditEvent({
      userId: payload.userId,
      eventType,
      data: auditPayload,
    });

    await enqueueNotification({
      userId: payload.userId,
      toEmail,
      templateKey: eventType,
      idempotencyKey: `${eventType}:${referenceId}`,
      templateData: buildTemplateData({
        userEmail: toEmail,
        action,
        amount: toUsd(payload.amountUsd),
        referenceId,
        assetSymbol: payload.symbol,
        extras: {
          Side: payload.side,
          FeeAmount: toUsd(payload.feeUsd),
          NetAmount: toUsd(payload.netAmountUsd),
          FiatCurrency: payload.fiatCurrency,
        },
      }),
    });
  },

  async recordTransferOut(payload: {
    userId: string;
    email?: string;
    requestId?: string | null;
    ledgerId?: string | null;
    method: TransferMethod;
    amountUsd: number;
    payoutAmountUsd: number;
    feeUsd: number;
    destinationMasked: string;
    provider: string;
    providerReference: string | null;
    estimatedBtc?: number;
  }) {
    const toEmail = normalizeEmail(payload.email);
    const referenceId = trim(payload.requestId || payload.ledgerId);
    if (!toEmail || !referenceId) return;

    const eventType = payload.method === 'BTC' ? 'CRYPTO_TRANSFER_OUT' : 'FIAT_TRANSFER_OUT';
    const action = payload.method === 'BTC' ? 'Crypto Transfer Out' : 'Fiat Transfer Out';

    const auditPayload = {
      requestId: payload.requestId || null,
      ledgerId: payload.ledgerId || null,
      method: payload.method,
      amountUsd: payload.amountUsd,
      payoutAmountUsd: payload.payoutAmountUsd,
      feeUsd: payload.feeUsd,
      destinationMasked: payload.destinationMasked,
      provider: payload.provider,
      providerReference: payload.providerReference,
      estimatedBtc: payload.estimatedBtc || null,
      occurredAt: new Date().toISOString(),
    };

    await insertAuditEvent({
      userId: payload.userId,
      eventType,
      data: auditPayload,
    });

    await enqueueNotification({
      userId: payload.userId,
      toEmail,
      templateKey: eventType,
      idempotencyKey: `${eventType}:${referenceId}`,
      templateData: buildTemplateData({
        userEmail: toEmail,
        action,
        amount: toUsd(payload.amountUsd),
        referenceId,
        extras: {
          Method: payload.method,
          PayoutAmount: toUsd(payload.payoutAmountUsd),
          FeeAmount: toUsd(payload.feeUsd),
          Destination: payload.destinationMasked,
          Provider: payload.provider,
          ProviderReference: payload.providerReference || null,
          EstimatedBtc: payload.estimatedBtc || null,
        },
      }),
    });
  },
};

export const recordTradeNotificationBestEffort = async (
  payload: Parameters<typeof NotificationEventService.recordTradeExecuted>[0]
) => {
  try {
    await NotificationEventService.recordTradeExecuted(payload);
  } catch (error: any) {
    logger.warn(
      {
        userId: payload.userId,
        orderId: payload.orderId,
        ledgerId: payload.ledgerId,
        err: error?.message || String(error),
      },
      'Trade notification enqueue failed (best effort).'
    );
  }
};

export const recordTransferNotificationBestEffort = async (
  payload: Parameters<typeof NotificationEventService.recordTransferOut>[0]
) => {
  try {
    await NotificationEventService.recordTransferOut(payload);
  } catch (error: any) {
    logger.warn(
      {
        userId: payload.userId,
        requestId: payload.requestId,
        ledgerId: payload.ledgerId,
        err: error?.message || String(error),
      },
      'Transfer notification enqueue failed (best effort).'
    );
  }
};
