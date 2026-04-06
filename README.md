# TenantOps — Multi-Tenant SaaS Provisioning Platform

A production-grade microservices platform that automates the full lifecycle of tenant provisioning through an event-driven pipeline. Built to demonstrate distributed systems design, Stripe billing integration, and choreography-based saga patterns.

## Table of Contents

- [System Architecture](#system-architecture)
- [Services](#services)
- [Event-Driven Pipeline](#event-driven-pipeline)
- [Data Model](#data-model)
- [Auth and Security](#auth-and-security)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Engineering Decisions](#engineering-decisions)

---

## System Architecture

```mermaid
graph LR
    subgraph Frontend
        UI[React Dashboard]
    end

    subgraph Gateway
        GW[API Gateway :4000]
    end

    subgraph Pipeline Services
        DB[DB Provisioner]
        DNS[DNS Provisioner]
        CRED[Credentials Service]
        BILL[Billing Service]
        NOTIF[Notification Service]
    end

    subgraph Infrastructure
        PG[(PostgreSQL)]
        MQ[RabbitMQ\ndirect exchange]
        DLX[Dead Letter Exchange]
    end

    UI -->|REST| GW
    GW -->|tenant.requested| MQ
    MQ --> DB
    DB -->|tenant.db.ready| MQ
    MQ --> DNS
    DNS -->|tenant.dns.ready| MQ
    MQ --> CRED
    CRED -->|tenant.credentials.ready| MQ
    MQ --> BILL
    BILL -->|Stripe Customer + Subscription| BILL
    BILL -->|tenant.billing.active| MQ
    MQ --> NOTIF
    NOTIF -->|tenant.provisioning.complete| GW
    DB --> PG
    CRED --> PG
    MQ --> DLX
```

---

## Services

| Service | Port | Description |
|---------|------|-------------|
| api-gateway | 4000 | Single entry point — rate limiting, routing, auth forwarding |
| tenant-service | 3001 | Core orchestration — tenant CRUD, pipeline state tracking |
| db-provisioner-service | 3002 | Creates isolated PostgreSQL schema per tenant |
| credentials-service | 3003 | Generates and stores API keys per tenant |
| dns-provisioner-service | 3004 | Registers subdomain DNS records |
| billing-service | 3005 | Creates Stripe customer and subscription with 14-day trial |
| notification-service | 3006 | Sends welcome email and publishes provisioning.complete |

### API Gateway

Single entry point for all client requests. Applies rate limiting (100 req/min per IP, stricter on auth routes), logs all traffic via Pino, and proxies to downstream services.

### Tenant Service

Core orchestration service. Manages the provisioning state machine and subscribes to all pipeline events to keep per-step status accurate. Runs a scheduled job every 5 minutes to auto-cancel pipelines stuck for more than 30 minutes.

Provisioning states: `PROVISIONING → ACTIVE | FAILED | CANCELLED`

Step statuses: `PENDING → IN_PROGRESS → SUCCESS | FAILED | CANCELLED`

### Billing Service

Subscribes to `tenant.credentials.ready`. Validates Stripe Price IDs at startup (fails fast if any env var is missing). Creates a Stripe Customer and Subscription with a 14-day trial, then publishes `tenant.billing.active` with the real Stripe IDs.

---

## Event-Driven Pipeline

```mermaid
sequenceDiagram
    participant Admin
    participant Gateway
    participant RabbitMQ
    participant DB as DB Provisioner
    participant DNS as DNS Provisioner
    participant Creds as Credentials
    participant Billing as Billing (Stripe)
    participant Notify as Notification

    Admin->>Gateway: POST /tenants {name, subdomain, planId}
    Gateway->>RabbitMQ: publish tenant.requested

    RabbitMQ->>DB: consume tenant.requested
    DB->>DB: Create isolated DB schema
    DB->>RabbitMQ: publish tenant.db.ready

    RabbitMQ->>DNS: consume tenant.db.ready
    DNS->>DNS: Register subdomain
    DNS->>RabbitMQ: publish tenant.dns.ready

    RabbitMQ->>Creds: consume tenant.dns.ready
    Creds->>Creds: Generate API keys
    Creds->>RabbitMQ: publish tenant.credentials.ready

    RabbitMQ->>Billing: consume tenant.credentials.ready
    Billing->>Billing: stripe.customers.create()
    Billing->>Billing: stripe.subscriptions.create() + 14-day trial
    Billing->>RabbitMQ: publish tenant.billing.active

    RabbitMQ->>Notify: consume tenant.billing.active
    Notify->>Admin: Send welcome email
    Notify->>RabbitMQ: publish tenant.provisioning.complete
```

### Message Broker Configuration

- Exchange: `provisioning.direct` (direct, durable)
- Dead letter exchange: `dlx.provisioning` (durable)
- Each queue has a dead letter routing key for failed message inspection
- `prefetchCount: 10` on all consumers

### Shared Event Types

Defined in `packages/shared-types` and consumed by all services:

```typescript
interface TenantRequestedPayload   { tenantId; subdomain; planId }
interface TenantDbReadyPayload     { tenantId; subdomain; planId }
interface TenantDnsReadyPayload    { tenantId; subdomain; planId }
interface TenantCredentialsReadyPayload { tenantId; subdomain; planId }
interface TenantBillingActivePayload {
  tenantId; subdomain; planId;
  stripeCustomerId; stripeSubscriptionId;
  subscriptionStatus; trialEnd: string | null;
}
interface ProvisioningCompletePayload { tenantId; subdomain }
```

---

## Data Model

```mermaid
erDiagram
    Plan {
        uuid id
        string name
        int maxUsers
        int maxApiKeys
    }

    Tenant {
        uuid id
        string name
        string subdomain
        string planId
        string stripeCustomerId
        string stripeSubscriptionId
        enum status
        enum dbStatus
        enum dnsStatus
        enum credentialsStatus
        enum billingStatus
        enum notificationStatus
        timestamp cancelledAt
        string cancelReason
    }

    User {
        uuid id
        uuid tenantId
        string email
        string role
    }

    ApiCredential {
        uuid id
        uuid tenantId
        string keyHash
        bool isActive
        timestamp expiresAt
    }

    EventLog {
        uuid id
        uuid tenantId
        string eventType
        string status
        json payload
        timestamp timestamp
    }

    Plan ||--o{ Tenant : "subscribed to"
    Tenant ||--o{ User : "has"
    Tenant ||--o{ ApiCredential : "has"
    Tenant ||--o{ EventLog : "tracks"
```

---

## Auth and Security

- JWT with `sub`, `email`, `role`, `tenantId` claims
- bcrypt password hashing
- Single-use refresh token rotation
- Rate limiting per IP at gateway level
- CORS with configurable origin whitelist
- Helmet security headers
- `class-validator` decorators on all DTOs

```typescript
// JWT payload shape
{
  sub: string;       // user ID
  email: string;
  role: 'ADMIN' | 'USER';
  tenantId: string;
}
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login and receive tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Invalidate refresh token |
| GET | `/auth/me` | Get current user |

### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants` | List all tenants |
| POST | `/tenants` | Create tenant and start provisioning |
| GET | `/tenants/:id` | Get tenant with step statuses |
| DELETE | `/tenants/:id` | Delete tenant and clean up resources |
| POST | `/tenants/:id/cancel` | Cancel in-progress provisioning |
| GET | `/tenants/:id/events` | Get event log for tenant |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose

### Quick Start

```bash
git clone https://github.com/Olayanju-1234/liftoff.git
cd liftoff
npm install

# Start PostgreSQL and RabbitMQ
docker-compose up -d postgres_db rabbitmq

# Copy and fill env files for each service
cp backend/tenant-service/.env.example backend/tenant-service/.env
# ... repeat for other services

# Run migrations
cd backend/tenant-service && npx prisma migrate dev && cd ../..
cd backend/db-provisioner-service && npx prisma migrate dev && cd ../..
cd backend/credentials-service && npx prisma migrate dev && cd ../..

# Start all services
npm run dev
```

### Running a Single Service

```bash
cd backend/billing-service && npm run start:dev
```

---

## Deployment

Deployed on Render using Docker. Each service has its own web service instance built from the monorepo root context.

A `render.yaml` at the repo root defines all service configurations with `dockerContext: .` to ensure the Dockerfiles can resolve workspace dependencies correctly.

### Environment Variables per Service

**All services:**
- `NODE_ENV`, `PORT`, `RABBITMQ_URL`

**Tenant Service, DB Provisioner, Credentials Service:**
- `DATABASE_URL` (PostgreSQL connection string)

**Billing Service:**
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`

**Notification Service:**
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`

---

## Engineering Decisions

### Choreography-based saga (not orchestration)

Each service reacts to events independently rather than a central orchestrator directing the flow. This means:
- No single point of failure in the pipeline
- Services can be deployed and scaled independently
- Adding a new pipeline step only requires publishing a new event type

### RabbitMQ over Kafka

Direct exchange routing is sufficient at this scale. RabbitMQ's at-least-once delivery with acknowledgments, dead letter queues, and simpler operational profile made it the right choice for a task-queue workload.

### Billing service fails fast on startup

`buildPlanPriceMap()` validates all Stripe Price ID environment variables at module load time. If any are missing, the service refuses to start. This prevents the scenario where a subscription is attempted with an empty price ID, which would throw a Stripe API error at the worst possible moment (mid-provisioning, after the customer was already created).

### Database-per-tenant via schema isolation

Each tenant gets an isolated PostgreSQL schema rather than shared tables. This prevents data leakage between tenants, simplifies backup/restore per tenant, and allows per-tenant migrations without affecting others.
