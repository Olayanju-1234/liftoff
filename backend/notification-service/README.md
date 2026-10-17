# Notification Service

Fifth and last worker in the provisioning saga. Headless: it only listens for
events and sends email.

## What it does

**`tenant.billing.active` → "<Customer> is ready".** Asks tenant-service
(`GET /internal/tenants/:id/notification`, with `INTERNAL_API_TOKEN`) for the
tenant's name, address and plan and for the company users to email: verified
addresses with *Email notifications* on in Settings. Sends one email to them
through Resend (else SendGrid), then publishes `tenant.provisioning.complete`
with `notification: { sent, recipients, skipReason? }`. tenant-service records
the step as `SUCCESS` when a mail went out and `SKIPPED` otherwise
(`no-provider`, `no-recipient`, `not-configured`); the tenant goes `ACTIVE`
either way. A provider error rejects the message, so it dead-letters as
`notification.failed` and the step reads `FAILED` until retried.

**`tenant.failed` → "<Customer> needs attention".** tenant-service publishes
this whenever a step is marked `FAILED` (dead letter or timeout). The email
names the step in plain language and carries the error. Recipients are the
verified users with *Failed provisioning alerts* on. This queue has no
dead-letter exchange: a mail problem here never changes the tenant.

The customer-facing welcome is the company's job, from the `tenant.active`
webhook. Nothing here emails the customer.

## Environment

- `RABBITMQ_URL`
- `RESEND_API_KEY` (preferred) or `SENDGRID_API_KEY`, and `EMAIL_FROM` — the
  same values tenant-service uses
- `FRONTEND_URL` — for the "Open in Liftoff" links
- `TENANT_SERVICE_URL`, `INTERNAL_API_TOKEN` — the same token tenant-service has
