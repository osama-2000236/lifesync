// server/services/notificationService.js
// ============================================
// In-app (+ optional email) notifications (UC-14).
// Never announces a report that was not persisted.
// ============================================

const UserNotification = require('../models/UserNotification');
const User = require('../models/User');
const nodemailer = require('nodemailer');

const APP_URL = () => (process.env.APP_URL || process.env.CORS_ORIGIN || 'https://lifesync.1202883.workers.dev')
  .split(',')[0]
  .trim()
  .replace(/\/$/, '');

const toPublic = (row) => {
  const p = row?.get ? row.get({ plain: true }) : row;
  if (!p) return null;
  return {
    id: p.id,
    user_id: p.user_id,
    type: p.type,
    title: p.title,
    body: p.body,
    link: p.link,
    meta: p.meta,
    read_at: p.read_at,
    email_sent_at: p.email_sent_at,
    created_at: p.created_at || p.createdAt,
  };
};

const listNotifications = async (userId, { limit = 30, unreadOnly = false } = {}) => {
  const where = { user_id: userId };
  if (unreadOnly) where.read_at = null;
  const rows = await UserNotification.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: Math.min(100, Math.max(1, limit)),
  });
  return rows.map(toPublic);
};

const unreadCount = async (userId) => UserNotification.count({
  where: { user_id: userId, read_at: null },
});

const markRead = async (notificationId, userId) => {
  const row = await UserNotification.findOne({
    where: { id: notificationId, user_id: userId },
  });
  if (!row) return null;
  if (!row.read_at) await row.update({ read_at: new Date() });
  return toPublic(row);
};

const markAllRead = async (userId) => {
  const [count] = await UserNotification.update(
    { read_at: new Date() },
    { where: { user_id: userId, read_at: null } },
  );
  return count;
};

/**
 * Send HTML email using the same provider priority as OTP
 * (Brevo → SendGrid → Resend → SMTP). Returns { success, code? }.
 */
const sendNotificationEmail = async (email, subject, html) => {
  const fromName = process.env.SMTP_FROM_NAME || 'LifeSync';
  try {
    if (process.env.BREVO_API_KEY) {
      const sender = process.env.BREVO_FROM || process.env.SMTP_FROM_EMAIL;
      if (!sender) throw new Error('BREVO_FROM missing');
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: sender, name: fromName },
          to: [{ email }],
          subject,
          htmlContent: html,
        }),
      });
      if (!resp.ok) throw new Error(`Brevo ${resp.status}`);
      return { success: true };
    }
    if (process.env.SENDGRID_API_KEY) {
      const sender = process.env.SENDGRID_FROM || process.env.SMTP_FROM_EMAIL;
      if (!sender) throw new Error('SENDGRID_FROM missing');
      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: sender, name: fromName },
          subject,
          content: [{ type: 'text/html', value: html }],
        }),
      });
      if (!resp.ok) throw new Error(`SendGrid ${resp.status}`);
      return { success: true };
    }
    if (process.env.RESEND_API_KEY) {
      const from = process.env.RESEND_FROM
        || process.env.SMTP_FROM_EMAIL
        || 'LifeSync <onboarding@resend.dev>';
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [email], subject, html }),
      });
      if (!resp.ok) throw new Error(`Resend ${resp.status}`);
      return { success: true };
    }
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `"${fromName}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject,
        html,
      });
      return { success: true };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[notify] email skipped (no provider): to=${email} subject=${subject}`);
      return { success: true, demo: true };
    }
    return { success: false, code: 'EMAIL_NOT_CONFIGURED' };
  } catch (err) {
    console.error('[notify] email failed:', err.message);
    return { success: false, code: 'EMAIL_SEND_FAILED', message: err.message };
  }
};

/**
 * Create in-app notification for a persisted weekly report and optionally email.
 * Caller MUST only invoke after the report row exists.
 */
const notifyWeeklyReportReady = async (userId, report) => {
  if (!report?.id) {
    throw new Error('notifyWeeklyReportReady requires a persisted report with id');
  }
  const user = await User.findByPk(userId);
  if (!user || !user.is_active) return { skipped: true, reason: 'user_inactive' };
  if (user.report_notify_enabled === false) {
    return { skipped: true, reason: 'opted_out' };
  }

  // Portable dedupe without dialect-specific JSON operators.
  const recent = await UserNotification.findAll({
    where: { user_id: userId, type: 'weekly_report' },
    order: [['created_at', 'DESC']],
    limit: 30,
  });
  const already = recent.find((n) => n.meta?.report_id === report.id);
  if (already) {
    return { notification: toPublic(already), created: false };
  }

  const link = `${APP_URL()}/dashboard?report=${report.id}`;
  const title = 'Your weekly LifeSync report is ready';
  const body = `Week ${report.week_key}: health score ${report.metrics_snapshot?.health_score ?? '—'}, `
    + `finance score ${report.metrics_snapshot?.financial_health_score ?? '—'}. `
    + 'Open the dashboard to download the PDF.';

  const row = await UserNotification.create({
    user_id: userId,
    type: 'weekly_report',
    title,
    body,
    link,
    meta: { report_id: report.id, week_key: report.week_key },
  });

  let emailResult = { success: false, skipped: true };
  if (user.email) {
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#0f172a;margin:0 0 12px">LifeSync weekly report</h2>
        <p style="color:#475569">${body}</p>
        <p><a href="${link}" style="color:#059669">Open dashboard &amp; download PDF</a></p>
        <p style="color:#94a3b8;font-size:12px">You can turn off report emails in Profile settings.</p>
      </div>`;
    emailResult = await sendNotificationEmail(user.email, title, html);
    if (emailResult.success) {
      await row.update({ email_sent_at: new Date() });
    }
  }

  return {
    notification: toPublic(row),
    created: true,
    email: emailResult,
  };
};

module.exports = {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  notifyWeeklyReportReady,
  sendNotificationEmail,
  toPublic,
  APP_URL,
};
