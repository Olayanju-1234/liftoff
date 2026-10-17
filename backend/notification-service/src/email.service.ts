import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { Resend } from 'resend';

export interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export type EmailProvider = 'resend' | 'sendgrid' | 'log';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// The same provider chain as tenant-service's EmailService: Resend, else SendGrid, else
// nothing is sent. Configure RESEND_API_KEY / EMAIL_FROM here too.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  readonly provider: EmailProvider;
  private readonly fromEmail: string;
  private readonly resend: Resend | null = null;

  constructor(config: ConfigService) {
    const resendKey = config.get<string>('RESEND_API_KEY');
    const sendgridKey = config.get<string>('SENDGRID_API_KEY');
    this.fromEmail =
      config.get<string>('EMAIL_FROM') || 'noreply@liftoff.ojusentinel.com';

    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.provider = 'resend';
    } else if (sendgridKey) {
      sgMail.setApiKey(sendgridKey);
      this.provider = 'sendgrid';
    } else {
      this.provider = 'log';
      this.logger.warn(
        'Neither RESEND_API_KEY nor SENDGRID_API_KEY is set: the company is not emailed and the notification step is SKIPPED',
      );
      return;
    }
    this.logger.log(
      `Sending email through ${this.provider} as ${this.fromEmail}`,
    );
  }

  get enabled(): boolean {
    return this.provider !== 'log';
  }

  // Throws when the provider refuses, so the caller can fail the step and retry later.
  async send(options: EmailOptions): Promise<void> {
    if (this.provider === 'log') {
      throw new Error('No email provider configured');
    }
    const message = { ...options, from: this.fromEmail };
    try {
      if (this.resend) {
        // The Resend SDK reports API errors in the result instead of throwing.
        const { error } = await this.resend.emails.send(message);
        if (error) {
          throw new Error(`${error.name}: ${error.message}`);
        }
      } else {
        await sgMail.send(message);
      }
      this.logger.log(
        `Email "${options.subject}" sent to ${options.to.length} recipient(s) via ${this.provider}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send "${options.subject}" via ${this.provider}: ${errorMessage(error)}`,
      );
      throw error;
    }
  }
}
