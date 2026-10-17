import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { Resend } from 'resend';
import { errorMessage } from '../common/error-message';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

type EmailProvider = 'resend' | 'sendgrid' | 'log';

// Names come from signup forms and go into HTML.
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly provider: EmailProvider;
  private readonly resend: Resend | null = null;

  constructor(private configService: ConfigService) {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    const sendgridKey = this.configService.get<string>('SENDGRID_API_KEY');
    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM') || 'noreply@tenantops.com';

    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.provider = 'resend';
    } else if (sendgridKey) {
      sgMail.setApiKey(sendgridKey);
      this.provider = 'sendgrid';
    } else {
      this.provider = 'log';
      this.logger.warn(
        'Neither RESEND_API_KEY nor SENDGRID_API_KEY is set - emails will not be sent',
      );
      return;
    }
    this.logger.log(
      `Sending email through ${this.provider} as ${this.fromEmail}`,
    );
  }

  // Resolves false whenever the email didn't reach a provider, log-only mode included.
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (this.provider === 'log') {
      // Bodies carry sign-in links, so only the envelope goes to the log.
      this.logger.warn(
        `Skipped email "${options.subject}" to ${options.to}: no email provider configured`,
      );
      return false;
    }

    const message = {
      from: this.fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };
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
        `Email "${options.subject}" sent to ${options.to} via ${this.provider}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email "${options.subject}" to ${options.to} via ${this.provider}: ${errorMessage(error)}`,
      );
      return false;
    }
  }

  async sendVerificationEmail(
    email: string,
    token: string,
    name?: string,
  ): Promise<boolean> {
    const verifyUrl = `${this.configService.get('FRONTEND_URL') || 'http://localhost:5173'}/verify-email?token=${token}`;
    const greeting = name ? `, ${escapeHtml(name)}` : '';

    return this.sendEmail({
      to: email,
      subject: 'Verify your Liftoff email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Welcome to Liftoff${greeting}</h1>
          <p>Confirm this is your address so your company can create API keys and connect its signup flow:</p>
          <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(to right, #6366f1, #8b5cf6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Verify email
          </a>
          <p>Or copy and paste this link:</p>
          <p style="color: #6b7280; word-break: break-all;">${verifyUrl}</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
            This link expires in 24 hours. If you didn't create a Liftoff account, ignore this email.
          </p>
        </div>
      `,
      text: `Welcome to Liftoff. Verify your email by visiting: ${verifyUrl}\n\nThis link expires in 24 hours. If you didn't create a Liftoff account, ignore this email.`,
    });
  }

  async sendEmailChangeConfirmation(
    email: string,
    token: string,
  ): Promise<boolean> {
    const confirmUrl = `${this.configService.get('FRONTEND_URL') || 'http://localhost:5173'}/confirm-email?token=${token}`;

    return this.sendEmail({
      to: email,
      subject: 'Confirm your new Liftoff email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Confirm your new email</h1>
          <p>Someone asked to make this address the sign-in email for a Liftoff account. Nothing changes until you confirm:</p>
          <a href="${confirmUrl}" style="display: inline-block; background: linear-gradient(to right, #6366f1, #8b5cf6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Confirm email
          </a>
          <p>Or copy and paste this link:</p>
          <p style="color: #6b7280; word-break: break-all;">${confirmUrl}</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
            This link expires in 24 hours. If you didn't ask for this, ignore this email and the account keeps its current address.
          </p>
        </div>
      `,
      text: `Confirm your new Liftoff sign-in email by visiting: ${confirmUrl}\n\nThis link expires in 24 hours. If you didn't ask for this, ignore this email.`,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const resetUrl = `${this.configService.get('FRONTEND_URL') || 'http://localhost:5173'}/reset-password?token=${token}`;

    return this.sendEmail({
      to: email,
      subject: 'Reset your Liftoff password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Reset your password</h1>
          <p>Someone asked to reset the password for the Liftoff account at this address. Set a new one here:</p>
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(to right, #6366f1, #8b5cf6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Choose a new password
          </a>
          <p>Or copy and paste this link:</p>
          <p style="color: #6b7280; word-break: break-all;">${resetUrl}</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
            This link expires in 1 hour and works once. If you didn't ask for this, ignore this email; your password stays as it is.
          </p>
        </div>
      `,
      text: `Reset your Liftoff password by visiting: ${resetUrl}\n\nThis link expires in 1 hour and works once. If you didn't ask for this, ignore this email.`,
    });
  }

  async sendWelcomeEmail(email: string, name?: string): Promise<boolean> {
    return this.sendEmail({
      to: email,
      subject: 'Welcome to TenantOps!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Welcome aboard${name ? `, ${name}` : ''}! 🎉</h1>
          <p>Your TenantOps account is now active. Here's what you can do:</p>
          <ul style="color: #374151;">
            <li>Create and manage tenants</li>
            <li>Monitor provisioning pipelines</li>
            <li>View event logs and health status</li>
            <li>Configure settings and notifications</li>
          </ul>
          <a href="${this.configService.get('FRONTEND_URL') || 'http://localhost:5173'}" style="display: inline-block; background: linear-gradient(to right, #6366f1, #8b5cf6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Go to Dashboard
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
            Questions? Reply to this email or visit our support page.
          </p>
        </div>
      `,
    });
  }
}
