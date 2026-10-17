import type { InternalTenantNotification } from '@liftoff/shared-types';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

// Plain-language step names, the same the dashboard's Simple view uses.
export const STEP_NAMES: Record<string, string> = {
  dbStatus: 'creating their database',
  dnsStatus: 'setting up their address',
  credentialsStatus: 'generating their API keys',
  billingStatus: 'starting their trial',
  notificationStatus: 'letting your team know',
};

export const stepName = (step: string) => STEP_NAMES[step] ?? step;

// Names and errors come from users and workers and go into HTML.
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const planName = (planId: string) =>
  planId.charAt(0).toUpperCase() + planId.slice(1).toLowerCase();

const shell = (
  title: string,
  body: string,
  cta: { href: string; label: string },
) =>
  `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">${title}</h1>
          ${body}
          <a href="${cta.href}" style="display: inline-block; background: linear-gradient(to right, #6366f1, #8b5cf6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            ${cta.label}
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
            You get this because you are on ${escapeHtml('Liftoff')} for your company. Turn these emails off under Settings → Notifications.
          </p>
        </div>
      `;

export function readyEmail(
  details: InternalTenantNotification,
  frontendUrl: string,
): EmailContent {
  const { tenant } = details;
  const name = escapeHtml(tenant.name);
  const url = `${frontendUrl}/customers/${tenant.id}`;
  const test = tenant.isTest ? ' (test)' : '';
  const html = shell(
    `${name} is ready${test}`,
    `
          <p><strong>${name}</strong> is set up on the ${escapeHtml(planName(tenant.planId))} plan. Their address is <code>${escapeHtml(tenant.address)}</code>.</p>
          <p>Nobody has contacted your customer: the welcome is yours to send. Your <code>tenant.active</code> webhook carries everything you need for it.</p>
        `,
    { href: url, label: 'Open in Liftoff' },
  );
  const text = [
    `${tenant.name} is ready${test}.`,
    '',
    `${tenant.name} is set up on the ${planName(tenant.planId)} plan. Their address is ${tenant.address}.`,
    '',
    'Nobody has contacted your customer: the welcome is yours to send. Your tenant.active webhook carries everything you need for it.',
    '',
    `Open in Liftoff: ${url}`,
  ].join('\n');
  return { subject: `${tenant.name} is ready${test}`, html, text };
}

export function attentionEmail(
  details: InternalTenantNotification,
  step: string,
  error: string,
  frontendUrl: string,
): EmailContent {
  const { tenant } = details;
  const name = escapeHtml(tenant.name);
  const url = `${frontendUrl}/customers/${tenant.id}`;
  const test = tenant.isTest ? ' (test)' : '';
  const html = shell(
    `${name} needs attention${test}`,
    `
          <p>Setting up <strong>${name}</strong> stopped while ${escapeHtml(stepName(step))}.</p>
          <p style="color: #6b7280; font-family: monospace; font-size: 13px;">${escapeHtml(error)}</p>
          <p>Nothing has been sent to your customer. Open the customer in Liftoff to see the details and retry the step.</p>
        `,
    { href: url, label: 'Open in Liftoff' },
  );
  const text = [
    `${tenant.name} needs attention${test}.`,
    '',
    `Setting up ${tenant.name} stopped while ${stepName(step)}: ${error}`,
    '',
    'Nothing has been sent to your customer. Open the customer in Liftoff to see the details and retry the step.',
    '',
    `Open in Liftoff: ${url}`,
  ].join('\n');
  return { subject: `${tenant.name} needs attention${test}`, html, text };
}
