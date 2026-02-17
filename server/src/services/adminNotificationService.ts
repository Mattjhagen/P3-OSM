import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';
import { config } from '../config/config';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';

const ADMIN_EMAIL = 'admin@p3lending.space';

let cachedTransporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      requireTLS: !config.smtp.secure,
    });
  }

  return cachedTransporter;
};

const truncate = (value: string, max = 4000) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value;

export interface AdminNotificationPayload {
  category: 'chat_request' | 'manual_review' | 'ticket' | 'risk_alert';
  subject: string;
  message: string;
  userId?: string;
  userEmail?: string;
  metadata?: Record<string, unknown>;
}

export const AdminNotificationService = {
  isConfigured: () => Boolean(getTransporter()),

  async createInternalTicket(payload: AdminNotificationPayload) {
    const ticketData = {
      id: randomUUID(),
      authorId: payload.userId || 'system',
      authorName: payload.userEmail || 'System Automation',
      subject: truncate(payload.subject, 220),
      description: truncate(payload.message, 8000),
      priority: payload.category === 'risk_alert' ? 'HIGH' : 'MEDIUM',
      status: 'OPEN',
      createdAt: Date.now(),
      metadata: payload.metadata || {},
      category: payload.category,
    };

    const { error } = await supabase.from('internal_tickets').insert({
      id: ticketData.id,
      status: ticketData.status,
      data: ticketData,
    });

    if (error) {
      logger.error({ error: error.message }, 'Failed to create internal ticket from admin notification');
      throw new Error(`Failed to create internal ticket: ${error.message}`);
    }

    return ticketData.id;
  },

  async sendEmail(payload: AdminNotificationPayload) {
    const transporter = getTransporter();
    if (!transporter) {
      logger.warn({ category: payload.category }, 'SMTP not configured, skipping admin email');
      return false;
    }

    const subject = `[P3 ${payload.category.toUpperCase()}] ${payload.subject}`;
    const body = [
      payload.message,
      '',
      `Category: ${payload.category}`,
      `User ID: ${payload.userId || 'n/a'}`,
      `User Email: ${payload.userEmail || 'n/a'}`,
      '',
      `Metadata: ${JSON.stringify(payload.metadata || {}, null, 2)}`,
    ].join('\n');

    await transporter.sendMail({
      from: config.smtp.from || ADMIN_EMAIL,
      to: ADMIN_EMAIL,
      subject: truncate(subject, 220),
      text: truncate(body, 12000),
    });

    return true;
  },

  async notify(payload: AdminNotificationPayload) {
    const ticketId = await this.createInternalTicket(payload);

    await supabase.from('audit_log').insert({
      actor_id: payload.userId || null,
      action: 'admin_notification_created',
      resource_type: 'internal_tickets',
      resource_id: ticketId,
      metadata: {
        category: payload.category,
        user_email: payload.userEmail || null,
        ...payload.metadata,
      },
    });

    try {
      await this.sendEmail(payload);
    } catch (error: any) {
      logger.error({ error: error.message, category: payload.category }, 'Failed to send admin notification email');
    }

    return { ticketId };
  },
};
