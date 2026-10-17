# Billing Service

Fourth worker in the provisioning saga. Headless: it only listens for events.

## What it does

Consumes `tenant.credentials.ready`. For a test tenant it publishes
`tenant.billing.active` with `skipped: true, skipReason: "test"` and never
touches Stripe. Otherwise it asks tenant-service for the company's Stripe
configuration over the internal API (`GET /internal/tenants/:id/billing`,
authenticated with `INTERNAL_API_TOKEN`):

- Not connected → `tenant.billing.active` with `skipped: true,
  skipReason: "not-connected"`. tenant-service records the step as `SKIPPED`
  and the dashboard says "Billing: not connected". Nothing is simulated.
- Connected → creates a Stripe Customer and a Subscription with a 14-day
  trial on the Price ID the company mapped to the tenant's plan, then
  publishes `tenant.billing.active` with the real ids.

A missing price for the plan, a Stripe error or an unreachable tenant-service
rejects the message without requeue, so it dead-letters as `billing.failed`
and the tenant is marked `FAILED` at billing.

## Environment

- `RABBITMQ_URL`
- `TENANT_SERVICE_URL`, `INTERNAL_API_TOKEN` (the same token tenant-service has)

Stripe keys live per organisation, encrypted in tenant-service's database.
There is no `STRIPE_SECRET_KEY` here.
