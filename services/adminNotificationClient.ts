import { frontendEnv } from './env';
import { RuntimeConfigService } from './runtimeConfigService';
import { supabase } from '../supabaseClient';

type NotificationCategory = 'chat_request' | 'manual_review' | 'ticket' | 'risk_alert';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getBackendBaseUrl = () =>
  trimTrailingSlash(
    RuntimeConfigService.getEffectiveValue('BACKEND_URL', frontendEnv.VITE_BACKEND_URL)
  );

const normalizeFetchError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return 'Unable to notify admin because the backend is currently unavailable.';
  }
  return message || 'Unable to notify admin.';
};

export const AdminNotificationClient = {
  async notify(payload: {
    category: NotificationCategory;
    subject: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ ticketId?: string }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('No authenticated session available for admin notification.');
    }

    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/notifications/admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || !body?.success) {
      throw new Error(body?.error || 'Failed to send admin notification.');
    }

    return {
      ticketId: body?.data?.ticketId,
    };
  },
};

