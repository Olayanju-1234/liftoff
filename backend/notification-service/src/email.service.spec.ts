import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

// Hoisted mocks: jest.mock factories run before the imports above, so the mock objects
// must be resolved lazily from the factories themselves.
jest.mock('resend', () => {
  const send = jest.fn();
  return { Resend: jest.fn(() => ({ emails: { send } })), __send: send };
});
jest.mock('@sendgrid/mail', () => ({ setApiKey: jest.fn(), send: jest.fn() }));
const mockResendSend = jest.requireMock<{ __send: jest.Mock }>('resend').__send;
const mockSendgrid = jest.requireMock<{
  setApiKey: jest.Mock;
  send: jest.Mock;
}>('@sendgrid/mail');

const serviceWith = (env: Record<string, string | undefined>) =>
  new EmailService({
    get: (key: string) => env[key],
  } as unknown as ConfigService);

const mail = {
  to: ['ops@acme.com'],
  subject: 'Globex is ready',
  html: '<p>hi</p>',
  text: 'hi',
};

describe('EmailService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockResendSend.mockReset().mockResolvedValue({ data: { id: 'e' } });
    mockSendgrid.send.mockReset().mockResolvedValue([{}]);
  });
  afterEach(() => jest.restoreAllMocks());

  it('prefers Resend and sends from EMAIL_FROM', async () => {
    const service = serviceWith({
      RESEND_API_KEY: 're_x',
      SENDGRID_API_KEY: 'SG.x',
      EMAIL_FROM: 'Liftoff <noreply@liftoff.test>',
    });

    expect(service.provider).toBe('resend');
    expect(service.enabled).toBe(true);
    await service.send(mail);
    expect(mockResendSend).toHaveBeenCalledWith({
      ...mail,
      from: 'Liftoff <noreply@liftoff.test>',
    });
    expect(mockSendgrid.send).not.toHaveBeenCalled();
  });

  it('throws when Resend reports an error in the result', async () => {
    mockResendSend.mockResolvedValueOnce({
      error: { name: 'validation_error', message: 'domain not verified' },
    });
    const service = serviceWith({ RESEND_API_KEY: 're_x' });

    await expect(service.send(mail)).rejects.toThrow(
      'validation_error: domain not verified',
    );
  });

  it('falls back to SendGrid', async () => {
    const service = serviceWith({ SENDGRID_API_KEY: 'SG.x' });

    expect(service.provider).toBe('sendgrid');
    await service.send(mail);
    expect(mockSendgrid.setApiKey).toHaveBeenCalledWith('SG.x');
    expect(mockSendgrid.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['ops@acme.com'] }),
    );
  });

  it('is disabled with no provider and refuses to send', async () => {
    const service = serviceWith({});

    expect(service.provider).toBe('log');
    expect(service.enabled).toBe(false);
    await expect(service.send(mail)).rejects.toThrow('No email provider');
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
