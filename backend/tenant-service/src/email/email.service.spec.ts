import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import { EmailService } from './email.service';

const mockResendSend = jest.fn<Promise<unknown>, [unknown]>();
const mockSendgridSend = jest.fn<Promise<unknown>, [unknown]>();
const mockSetApiKey = jest.fn<void, [string]>();

jest.mock('resend', () => ({
  Resend: jest.fn(),
}));
// The factory runs before the mock fns above exist, so it defers to them.
jest.mock('@sendgrid/mail', () => ({
  setApiKey: (key: string) => mockSetApiKey(key),
  send: (message: unknown) => mockSendgridSend(message),
}));

const FROM = 'Liftoff <noreply@liftoff.ojusentinel.com>';
const TO = 'new@example.com';
const TOKEN = 'a3f9c2e7b1d84f60b5e2c9d1a7f3e8b4';

const LOG_METHODS = [
  'log',
  'error',
  'warn',
  'debug',
  'verbose',
  'fatal',
] as const;

const configWith = (env: Record<string, string>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

// One string per logger call, arguments included.
function captureLogs(): string[] {
  const lines: string[] = [];
  for (const method of LOG_METHODS) {
    jest
      .spyOn(Logger.prototype, method)
      .mockImplementation((...args: unknown[]) => {
        lines.push(
          args
            .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
            .join(' '),
        );
      });
  }
  return lines;
}

describe('EmailService', () => {
  let logs: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(Resend)
      .mockImplementation(
        () => ({ emails: { send: mockResendSend } }) as unknown as Resend,
      );
    mockResendSend.mockResolvedValue({
      data: { id: 'email_1' },
      error: null,
      headers: null,
    });
    mockSendgridSend.mockResolvedValue([{ statusCode: 202 }, {}]);
    logs = captureLogs();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('provider selection', () => {
    it('sends through Resend when RESEND_API_KEY is set', async () => {
      const service = new EmailService(
        configWith({ RESEND_API_KEY: 're_test', EMAIL_FROM: FROM }),
      );

      await expect(
        service.sendEmail({
          to: TO,
          subject: 'Hello',
          html: '<p>Hi</p>',
          text: 'Hi',
        }),
      ).resolves.toBe(true);

      expect(Resend).toHaveBeenCalledWith('re_test');
      expect(mockResendSend).toHaveBeenCalledWith({
        from: FROM,
        to: TO,
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      });
      expect(mockSendgridSend).not.toHaveBeenCalled();
    });

    it('prefers Resend when both keys are set', async () => {
      const service = new EmailService(
        configWith({ RESEND_API_KEY: 're_test', SENDGRID_API_KEY: 'SG.test' }),
      );

      await expect(
        service.sendEmail({ to: TO, subject: 'Hello', html: '<p>Hi</p>' }),
      ).resolves.toBe(true);

      expect(mockResendSend).toHaveBeenCalledTimes(1);
      expect(mockSetApiKey).not.toHaveBeenCalled();
      expect(mockSendgridSend).not.toHaveBeenCalled();
    });

    it('falls back to SendGrid when only SENDGRID_API_KEY is set', async () => {
      const service = new EmailService(
        configWith({ SENDGRID_API_KEY: 'SG.test', EMAIL_FROM: FROM }),
      );

      await expect(
        service.sendEmail({ to: TO, subject: 'Hello', html: '<p>Hi</p>' }),
      ).resolves.toBe(true);

      expect(Resend).not.toHaveBeenCalled();
      expect(mockSetApiKey).toHaveBeenCalledWith('SG.test');
      expect(mockSendgridSend).toHaveBeenCalledWith({
        from: FROM,
        to: TO,
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: undefined,
      });
    });

    it('treats an empty RESEND_API_KEY as unset', async () => {
      const service = new EmailService(
        configWith({ RESEND_API_KEY: '', SENDGRID_API_KEY: 'SG.test' }),
      );

      await service.sendEmail({ to: TO, subject: 'Hello', html: '<p>Hi</p>' });

      expect(Resend).not.toHaveBeenCalled();
      expect(mockSendgridSend).toHaveBeenCalledTimes(1);
    });

    it('sends nothing and reports failure when neither key is set', async () => {
      const service = new EmailService(configWith({}));

      await expect(
        service.sendEmail({ to: TO, subject: 'Hello', html: '<p>Hi</p>' }),
      ).resolves.toBe(false);

      expect(Resend).not.toHaveBeenCalled();
      expect(mockSetApiKey).not.toHaveBeenCalled();
      expect(mockSendgridSend).not.toHaveBeenCalled();
    });
  });

  describe('send failure', () => {
    it('returns false when Resend rejects the email', async () => {
      mockResendSend.mockResolvedValue({
        data: null,
        error: {
          name: 'validation_error',
          message: 'The liftoff.ojusentinel.com domain is not verified.',
          statusCode: 403,
        },
        headers: null,
      });
      const service = new EmailService(
        configWith({ RESEND_API_KEY: 're_test' }),
      );

      await expect(
        service.sendEmailChangeConfirmation(TO, TOKEN),
      ).resolves.toBe(false);

      const failure = logs.find((line) => line.includes('Failed to send'));
      expect(failure).toContain(TO);
      expect(failure).toContain('validation_error');
      expect(logs.join('\n')).not.toContain(TOKEN);
    });

    it('returns false when the Resend request throws', async () => {
      mockResendSend.mockRejectedValue(new Error('socket hang up'));
      const service = new EmailService(
        configWith({ RESEND_API_KEY: 're_test' }),
      );

      await expect(
        service.sendEmailChangeConfirmation(TO, TOKEN),
      ).resolves.toBe(false);

      expect(logs.some((line) => line.includes('socket hang up'))).toBe(true);
      expect(logs.join('\n')).not.toContain(TOKEN);
    });

    it('does not retry through SendGrid when Resend fails', async () => {
      mockResendSend.mockRejectedValue(new Error('socket hang up'));
      const service = new EmailService(
        configWith({ RESEND_API_KEY: 're_test', SENDGRID_API_KEY: 'SG.test' }),
      );

      await service.sendEmail({ to: TO, subject: 'Hello', html: '<p>Hi</p>' });

      expect(mockSendgridSend).not.toHaveBeenCalled();
    });

    it('returns false when SendGrid throws', async () => {
      mockSendgridSend.mockRejectedValue(new Error('Unauthorized'));
      const service = new EmailService(
        configWith({ SENDGRID_API_KEY: 'SG.test' }),
      );

      await expect(
        service.sendEmailChangeConfirmation(TO, TOKEN),
      ).resolves.toBe(false);

      expect(logs.some((line) => line.includes('Unauthorized'))).toBe(true);
      expect(logs.join('\n')).not.toContain(TOKEN);
    });
  });

  describe('log-only mode', () => {
    it.each([
      [
        'email change confirmation',
        (s: EmailService) => s.sendEmailChangeConfirmation(TO, TOKEN),
      ],
      [
        'verification',
        (s: EmailService) => s.sendVerificationEmail(TO, TOKEN, 'Ada'),
      ],
      [
        'password reset',
        (s: EmailService) => s.sendPasswordResetEmail(TO, TOKEN),
      ],
    ])(
      'logs the %s envelope but never its token or link',
      async (_name, send) => {
        const service = new EmailService(
          configWith({ FRONTEND_URL: 'https://liftoff.ojusentinel.com' }),
        );

        await expect(send(service)).resolves.toBe(false);

        const output = logs.join('\n');
        expect(output).not.toContain(TOKEN);
        expect(output).not.toContain('token=');
        expect(output).not.toContain('https://liftoff.ojusentinel.com/');
        const skipped = logs.find((line) => line.startsWith('Skipped email'));
        expect(skipped).toContain(TO);
      },
    );

    it('escapes the name in the verification email', async () => {
      const service = new EmailService(
        configWith({ RESEND_API_KEY: 're_test', EMAIL_FROM: FROM }),
      );
      mockResendSend.mockResolvedValueOnce({ data: { id: 'x' }, error: null });

      await service.sendVerificationEmail(TO, TOKEN, '<img src=x onerror=1>');

      const [[message]] = mockResendSend.mock.calls as [[{ html: string }]];
      expect(message.html).not.toContain('<img');
      expect(message.html).toContain('&lt;img src=x onerror=1&gt;');
      expect(message.html).toContain(`/verify-email?token=${TOKEN}`);
    });

    it('names the subject and the recipient in the skip line', async () => {
      const service = new EmailService(configWith({}));

      await service.sendEmailChangeConfirmation(TO, TOKEN);

      expect(logs).toContain(
        `Skipped email "Confirm your new Liftoff email" to ${TO}: no email provider configured`,
      );
    });
  });
});
