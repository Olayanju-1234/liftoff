# ADR 0002 — Deploy Target: Render Today, AWS Tomorrow

- **Status:** Accepted (current); AWS migration tracked in roadmap
- **Date:** 2026-05-14
- **Deciders:** Backend

## Context

The platform runs seven independently-deployable services. We needed a deploy
target that:

1. Builds a Docker image per service from a monorepo (each service's
   `Dockerfile` references `packages/shared-types` from the workspace root).
2. Provides managed PostgreSQL.
3. Lets us run a managed RabbitMQ (or accept a CloudAMQP add-on URL).
4. Costs effectively nothing while the project is a portfolio piece.

## Decision

**Use Render** for the initial deployment (`render.yaml` checked in,
Docker-driven). Choose the AWS path if/when the platform serves real traffic.

### Why not AWS for the portfolio cut

| Concern | AWS minimum | Render minimum |
| --- | --- | --- |
| Container runtime | ECS on Fargate or EKS — both require a VPC, subnets, NAT, ALB, target groups, security groups, task definitions per service | A `render.yaml` block per service. |
| Managed RabbitMQ | Amazon MQ for RabbitMQ (~$30/mo entry single-instance) | CloudAMQP free tier via add-on URL. |
| Managed Postgres | RDS db.t4g.micro + storage + backups (~$15/mo) | Render Postgres free tier. |
| Secrets | Secrets Manager + IAM policy per task | Render env var with `sync: false`. |
| Time to first deploy | A day-plus of Terraform/CDK to do it cleanly | One git push. |

For a 3-day take-home polish window before an interview, AWS isn't a
*technical* choice — it's a *budget* choice. The platform's interesting
design is in the choreography saga, the schema-per-tenant isolation, and the
event contracts in `packages/shared-types`. None of that changes on AWS.

## What the AWS deployment would look like

If this graduated to a paid product, the target architecture is:

```
┌──────────────┐
│ CloudFront   │  ← static frontend (Vite build → S3)
└──────┬───────┘
       │
┌──────▼───────┐                   ┌─────────────────────┐
│ ALB (HTTPS)  │ ──→ Route 53 ←──  │  Cert Manager       │
└──────┬───────┘                   └─────────────────────┘
       │
┌──────▼─────────────────────────────────────────────────┐
│  ECS Fargate cluster (1 service per Nest app)          │
│   ├─ api-gateway     (public; behind ALB)              │
│   ├─ tenant-service  (private subnet; gateway only)    │
│   ├─ db-provisioner  (private; RabbitMQ-driven)        │
│   ├─ dns-provisioner (private)                         │
│   ├─ credentials     (private)                         │
│   ├─ billing         (private; egress to Stripe)       │
│   └─ notification    (private; egress to SES/SendGrid) │
└──────┬─────────────────────────┬───────────────────────┘
       │                         │
┌──────▼──────┐          ┌───────▼────────┐
│ RDS Postgres│          │ Amazon MQ      │
│ (Multi-AZ)  │          │ for RabbitMQ   │
└─────────────┘          └────────────────┘

Secrets Manager (rotates JWT_SECRET / DB creds on schedule)
CloudWatch Logs + X-Ray (replaces the Pino-only setup today)
ECR (replaces Render's Docker registry)
```

### Concrete migration steps

1. **Containers stay identical.** The existing `Dockerfile` per service is
   already multi-stage and non-root. Push to ECR instead of Render's
   registry; nothing about the application code changes.
2. **`render.yaml` → AWS CDK.** Translate each `web` block to an ECS Service
   + Task Definition. The `envVars` map directly to Secrets Manager ARNs.
   `healthCheckPath: /health` becomes the ALB target-group health check
   (gateway) or ECS container health check (workers).
3. **Postgres**: pg_dump from Render → restore to RDS. The schema-per-tenant
   model is portable; no application change.
4. **RabbitMQ**: switch `RABBITMQ_URL` to the Amazon MQ broker URL. No code
   change — `@golevelup/nestjs-rabbitmq` doesn't care about the broker
   provider.
5. **Secrets**: replace plain env vars with `secrets:` references in the
   ECS task definition that point at Secrets Manager ARNs. JWT secrets get
   rotation policies attached. The Joi env schema continues to work
   unchanged because Secrets Manager injects values as env vars at task
   start.
6. **Observability**: add an ADOT (AWS Distro for OpenTelemetry) sidecar
   per task; Pino logs already carry `tenantId` so correlation falls out
   naturally. Replace the Sentry integration with X-Ray for distributed
   tracing across the saga.

## Consequences

**Positive of staying on Render today**

- Free tier covers the portfolio use case; no spend.
- One file (`render.yaml`) is the entire infra spec — easy to read in a
  code review.

**Negative of staying on Render today**

- Free tier instances cold-start on idle. Mitigated with an external
  keep-alive ping; there is a recent commit explicitly documenting this.
- No private networking — every service is reachable on a public URL.
  The platform compensates with JWT auth on the gateway and rate
  limiting, but in AWS those services would live in a private subnet and
  this whole risk class disappears.

**Positive of AWS migration**

- Private networking via VPC; only the ALB is public.
- Secrets Manager + IAM-scoped per-service access.
- Multi-AZ RDS, point-in-time-restore.
- Auto-scaling per service (current bottleneck is the slowest worker;
  AWS would let `db-provisioner` scale separately from `notification`).
- X-Ray traces stitched across the saga in one console view.

**Negative of AWS migration**

- ~$50–80/mo minimum for the seven-service footprint (ALB + Fargate +
  RDS + Amazon MQ + NAT + CloudWatch).
- Infrastructure code (CDK or Terraform) becomes a maintained artifact.

## Decision rule

Move when there's a real customer or a real SLA. Until then, Render is the
honest answer.
