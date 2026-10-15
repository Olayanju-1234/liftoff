# Dead letters: inspect and replay

When a provisioning worker can't finish its step, it returns `new Nack(false)`.
RabbitMQ then republishes the message, unchanged, to the `dlx.provisioning`
exchange with the worker's dead-letter routing key. It also adds an `x-death`
header that names the rejecting queue, the reason and the original routing key.

| Dead-letter key | Worker queue | Original routing key | Tenant step |
|---|---|---|---|
| `db-provisioner.failed` | `db-provisioner-queue` | `tenant.requested` | `dbStatus` |
| `dns-provisioner.failed` | `dns-provisioner-queue` | `tenant.db.ready` | `dnsStatus` |
| `credentials.failed` | `credentials-queue` | `tenant.dns.ready` | `credentialsStatus` |
| `billing.failed` | `billing-queue` | `tenant.credentials.ready` | `billingStatus` |
| `notification.failed` | `notification-queue` | `tenant.billing.active` | `notificationStatus` |

tenant-service binds two durable queues to all five keys, so each dead letter
lands in both:

- **`provisioning.dead-letters`** is the parking lot. Nothing consumes it, so
  messages wait there for inspection and replay. It holds up to 10,000 messages,
  and RabbitMQ drops the oldest once it is full.
- **`tenant-service-dead-letter-queue`** is consumed by tenant-service. Each
  message marks its step and the tenant `FAILED` and logs a
  `tenant.provisioning.failed` event with status `Error`. Tenants that are
  already `ACTIVE`, `CANCELLED` or deleted are left as they are.

tenant-service declares both queues when it connects. A message dead-lettered
before tenant-service has connected to the broker at least once is dropped,
because no queue is bound yet.

## Inspect

From the API: `GET /tenants` shows the tenant as `FAILED` with the failed step.
`GET /tenants/:id/events` has the `tenant.provisioning.failed` event, which
names the step and the rejecting queue. The worker's own error message isn't in
the message, so read the worker's logs for the cause.

From RabbitMQ, count what's parked:

```bash
rabbitmqctl list_queues -p <vhost> name messages | grep dead-letter
```

To read messages without removing them, use the management UI at
`http://localhost:15672` locally (Queues → `provisioning.dead-letters` → Get
messages, with "Nack message requeue true"). You can also use `rabbitmqadmin`,
which needs the `rabbitmq_management` plugin:

```bash
rabbitmqadmin -V <vhost> -f raw_json get queue=provisioning.dead-letters count=10 ackmode=ack_requeue_true
```

Each message's `properties.headers["x-death"][0]["routing-keys"][0]` is the
routing key to replay it with.

## Replay

Fix the cause first, for example a missing Stripe price or a bad plan ID. Then
take the message off the parking lot and publish its payload back to
`provisioning.direct` with the original routing key:

```bash
# Removes the oldest parked message and prints it
rabbitmqadmin -V <vhost> -f raw_json get queue=provisioning.dead-letters count=1 ackmode=ack_requeue_false

rabbitmqadmin -V <vhost> publish exchange=provisioning.direct routing_key=tenant.credentials.ready \
  payload='{"tenantId":"<id>","subdomain":"acme","planId":"pro"}'
```

The worker processes it again. If it succeeds, the saga continues from that
step, and tenant-service marks the tenant `ACTIVE` when
`tenant.provisioning.complete` arrives. Until then the tenant and the failed
step still read `FAILED`. If the step fails again, the message dead-letters
again and the tenant gets a new `tenant.provisioning.failed` event.

If every parked message has the same key, the management UI's "Move messages"
(shovel plugin) can move them straight into that worker's queue instead.

### Tenants that never started

If tenant-service can't publish `tenant.requested` within 5 seconds (the broker
is down, for example), it marks the tenant `FAILED` at `dbStatus` with the error
`Could not publish tenant.requested: …`. Nothing reached the broker, so nothing
is parked. `POST /auth/register` still returns tokens in this case, and
`POST /tenants` returns an error. To start the saga again, publish
`tenant.requested` yourself with the tenant's `id`, `subdomain` and `planId`
from `GET /tenants/:id`:

```bash
rabbitmqadmin -V <vhost> publish exchange=provisioning.direct routing_key=tenant.requested \
  payload='{"tenantId":"<id>","subdomain":"<subdomain>","planId":"starter"}'
```
