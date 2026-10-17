import type { InternalTenantNotification } from '@liftoff/shared-types';
import { attentionEmail, readyEmail, stepName } from './templates';

const details: InternalTenantNotification = {
  tenant: {
    id: 't1',
    name: '<script>alert(1)</script> & Co',
    subdomain: 'evil',
    address: 'evil.liftoff.ojusentinel.com',
    planId: 'PRO',
    status: 'ACTIVE',
    isTest: false,
  },
  organisation: { id: 'o', name: 'Acme' },
  recipients: { ready: [], attention: [] },
};

describe('email templates', () => {
  it('escapes the tenant name and error in HTML, not in the text part', () => {
    const ready = readyEmail(details, 'https://app');
    expect(ready.html).not.toContain('<script>');
    expect(ready.html).toContain('&lt;script&gt;');
    expect(ready.text).toContain('<script>alert(1)</script> & Co');
    expect(ready.html).toContain('Pro plan');

    const attention = attentionEmail(
      details,
      'dbStatus',
      '<b>schema</b> exists',
      'https://app',
    );
    expect(attention.html).toContain('&lt;b&gt;schema&lt;/b&gt; exists');
    expect(attention.text).toContain(
      'creating their database: <b>schema</b> exists',
    );
    expect(attention.subject).toBe(
      '<script>alert(1)</script> & Co needs attention',
    );
  });

  it('links to the Simple customer page', () => {
    expect(readyEmail(details, 'https://app').html).toContain(
      'https://app/customers/t1',
    );
  });

  it('names every provisioning step in plain language and passes unknown steps through', () => {
    expect(stepName('billingStatus')).toBe('starting their trial');
    expect(stepName('notificationStatus')).toBe('letting your team know');
    expect(stepName('somethingElse')).toBe('somethingElse');
  });
});
