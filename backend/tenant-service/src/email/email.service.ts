import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

export interface EmailOptions {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private readonly fromEmail: string;
    private readonly isConfigured: boolean;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
        this.fromEmail = this.configService.get<string>('EMAIL_FROM') || 'noreply@tenantops.com';

        if (apiKey) {
            sgMail.setApiKey(apiKey);
            this.isConfigured = true;
            this.logger.log('SendGrid email service configured');
        } else {
            this.isConfigured = false;
            this.logger.warn('SendGrid API key not configured - emails will be logged only');
        }
    }

    async sendEmail(options: EmailOptions): Promise<boolean> {
        if (!this.isConfigured) {
            this.logger.log(`[DEV MODE] Would send email to ${options.to}: ${options.subject}`);
            this.logger.log(`Content: ${options.text || options.html}`);
            return true;
        }

        try {
            await sgMail.send({
                to: options.to,
                from: this.fromEmail,
                subject: options.subject,
                text: options.text,
                html: options.html,
            });
            this.logger.log(`Email sent successfully to ${options.to}`);
            return true;
        } catch (error: any) {
            this.logger.error(`Failed to send email to ${options.to}:`, error.message);
            return false;
        }
    }

    async sendVerificationEmail(email: string, token: string, name?: string): Promise<boolean> {
        const verifyUrl = `${this.configService.get('FRONTEND_URL') || 'http://localhost:5173'}/verify-email?token=${token}`;

        return this.sendEmail({
            to: email,
            subject: 'Verify your TenantOps account',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Welcome to TenantOps${name ? `, ${name}` : ''}!</h1>
          <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
          <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(to right, #6366f1, #8b5cf6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Verify Email
          </a>
          <p>Or copy and paste this link:</p>
          <p style="color: #6b7280; word-break: break-all;">${verifyUrl}</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
            This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
      `,
            text: `Welcome to TenantOps! Please verify your email by visiting: ${verifyUrl}`,
        });
    }

    async sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
        const resetUrl = `${this.configService.get('FRONTEND_URL') || 'http://localhost:5173'}/reset-password?token=${token}`;

        return this.sendEmail({
            to: email,
            subject: 'Reset your TenantOps password',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">Password Reset Request</h1>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(to right, #6366f1, #8b5cf6); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Reset Password
          </a>
          <p>Or copy and paste this link:</p>
          <p style="color: #6b7280; word-break: break-all;">${resetUrl}</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
            text: `Reset your password by visiting: ${resetUrl}`,
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
