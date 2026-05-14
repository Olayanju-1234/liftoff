# ADR 0001 — Adopt the Transactional Outbox for Saga Event Publication

- **Status:** Proposed
- **Date:** 2026-05-14
- **Deciders:** Backend
- **Supersedes:** —

## Context

The provisioning saga is choreographed: each service performs its work, mutates
its own database, and then publishes a domain event to RabbitMQ. The next
service in the pipeline reacts to that event.

Today, that publish-after-write pattern looks like this in `tenants.service`:

```ts
const tenant = await prisma.tenant.create({ ... });   // (1) DB commit
await amqpConnection.publish('provisioning.direct',  // (2) broker publish
  'tenant.requested', payload);
```

These two steps are **not atomic**. Between (1) and (2) the process can crash,
the broker can be unreachable, or the network can stall past timeout. Two
failure modes follow:

| Failure window | Visible state |
| --- | --- |
| Crash between (1) and (2) | DB has the tenant in `dbStatus = IN_PROGRESS`, but no event ever fires. The pipeline hangs forever (until `ProvisioningTimeoutService` cancels it 30 minutes later). |
| Publish succeeds but the ack times out, so we retry | The downstream queue receives the event twice — consumers must be idempotent. |

The 30-minute timeout sweep is a real safety net but it is the wrong tool for
this job: it converts a transient-infra problem into a customer-visible
"provisioning cancelled" outcome, and it does nothing for events lost mid-saga
(e.g., between `tenant-service` updating state and re-publishing).

## Decision

Adopt the **transactional outbox** pattern in every service that both writes to
its own database and publishes a downstream event.

1. Add an `OutboxEvent` table per service:

   ```prisma
   model OutboxEvent {
     id          String   @id @default(uuid())
     exchange    String
     routingKey  String
     payload     Json
     createdAt   DateTime @default(now())
     publishedAt DateTime?
     attempts    Int      @default(0)
     lastError   String?

     @@index([publishedAt, createdAt])
   }
   ```

2. The state-changing operation writes both the domain row **and** the
   outbox row in the same Prisma `$transaction`. They commit or roll back
   together — atomic by construction.

3. A small `OutboxRelay` worker (one cron tick per second) reads
   `publishedAt IS NULL` rows in `createdAt` order, publishes them to
   RabbitMQ with publisher confirms enabled, and marks them published on
   success. On broker failure it bumps `attempts`/`lastError` and tries
   again next tick.

4. Consumers continue to be idempotent (deduplicate on `tenantId` + event
   type, which they already need to be — RabbitMQ guarantees at-least-once,
   not exactly-once).

## Consequences

**Positive**

- DB and event publication become consistent under any crash window.
- The 30-minute saga timeout returns to being a true backstop — it should
  fire on bugs and dead third parties only, not on RabbitMQ blips.
- Audit trail: the outbox table is itself a chronological log of every
  intent-to-publish.

**Negative / costs**

- One extra table and one extra worker per service that emits events.
- Latency floor: published events lag by up to one relay tick (<1s).
  Acceptable for a tenant-provisioning saga that runs on minute scales.
- Schema migration coordinated across `tenant-service`, `db-provisioner`,
  `credentials-service`, and `billing-service`.

**Alternatives considered**

- **RabbitMQ publisher confirms only.** Closes the lost-publish window for
  transient broker errors but does nothing for mid-process crashes between
  the DB commit and the publish call.
- **Two-phase commit between Postgres and RabbitMQ.** Operationally heavy,
  and RabbitMQ's XA support is not the right tool for a workload this size.
- **Change Data Capture (Debezium → Kafka).** Strictly more powerful, but
  infrastructure-expensive. Worth revisiting if the platform adopts Kafka
  for analytics later.

## Rollout

1. Land the schema and `OutboxRelay` in `tenant-service` first (highest-fanout
   producer). Keep the existing direct publish call as a fallback for one
   release; record both paths in logs and reconcile.
2. Once the relay is stable, remove the direct publish call.
3. Repeat per service.
