# Dead letters: inspect and replay

tenant-service sends each builtin step its input itself, through the default
exchange straight to the worker's queue; no worker queue is bound to
`provisioning.direct`. When a worker can't finish its step, it returns
`new Nack(false)`. RabbitMQ then republishes the message, unchanged, to the
`dlx.provisioning` exchange with the worker's dead-letter routing key. It also
adds an `x-death` header that names the rejecting queue, the reason and the
routing key it was sent with (the queue name).

A step set to **custom** never reaches a worker, so it never dead-letters: it
fails when the company's system calls `/fail`, rejects the request, or misses
its deadline, and Retry asks the company's system again.

| Dead-letter key | Worker queue | Input (event type) | Tenant step |
|---|---|---|---|
| `db-provisioner.failed` | `db-provisioner-queue` | `tenant.requested` | `dbStatus` |
| `dns-provisioner.failed` | `dns-provisioner-queue` | `tenant.db.ready` | `dnsStatus` |
| `credentials.failed` | `credentials-queue` | `tenant.dns.ready` | `credentialsStatus` |
| `billing.failed` | `billing-queue` | `tenant.credentials.ready` | `billingStatus` |
| `notification.failed` | `notification-queue` | `tenant.billing.active` | `notificationStatus` |
| `db-provisioner.deprovision.failed` | `db-provisioner-deprovision-queue` | `tenant.deprovision` | `teardownDbStatus` |
| `credentials.deprovision.failed` | `credentials-deprovision-queue` | `tenant.deprovision` | `teardownCredentialsStatus` |
| `billing.deprovision.failed` | `billing-deprovision-queue` | `tenant.deprovision` | `teardownBillingStatus` |

The last three come from removal (`DELETE /tenants/:id`). A teardown dead letter
marks only that teardown `FAILED`; the tenant stays `DEPROVISIONING`, and calling
`DELETE /tenants/:id` again (or **Retry removal** in the dashboard) republishes
`tenant.deprovision`. Every teardown is idempotent, so there is nothing to replay by
hand. A step that ran custom is torn down by the company's system instead
(`step.teardown`); a worker's result for that part is ignored, and removing the
customer again re-sends a teardown that failed.

tenant-service binds two durable queues to all eight keys, so each dead letter
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

### Dead letters from the live demo

The public live demo (`POST /demo/tenants` with a `failStep`) makes one step
fail on purpose. tenant-service publishes that step's input straight to
`dlx.provisioning` with the worker's key instead of to the worker, so it lands
in both queues like any dead letter. It has no `x-death` header; it carries
`x-liftoff-reason: "Demo: <worker> was told to fail, …"` instead, and that
reason is the error on the tenant. These belong to test tenants in the
`liftoff-demo` organisation: they need no action, the visitor retries from the
live view, and the tenant is removed after 15 minutes. They are safe to purge
from the parking lot. Only a test tenant in that organisation with a
`DemoTenant` row can be failed this way.

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

Each message's `properties.headers["x-death"][0]["queue"]` is the worker queue
to replay it to.

## Replay

Fix the cause first, for example a missing Stripe price (Settings → Billing) or
a bad plan ID. Then press **Retry** on the tenant (both dashboard views, and the
Failed list under the hood), or call the API:

```bash
curl -s -X POST https://api.liftoff.ojusentinel.com/tenants/<id>/retry \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

tenant-service finds the first `FAILED` step, takes the message that step
consumed (the payload it logged when the previous step finished, or, for the
first step, `tenant.requested` rebuilt from the tenant row) and publishes it
through the default exchange straight to that worker's queue, so only the
failed worker sees it again. The tenant reads `PROVISIONING` with the step
`IN_PROGRESS`, a `tenant.retry` event names the step, queue and payload source,
and the 2-minute step timeout applies again. Only a `FAILED` tenant can be
retried (400 otherwise); a second click while the first is in flight gets 409.
The parked copy stays in `provisioning.dead-letters`: RabbitMQ can't take one
message out of the middle of a queue, and the cap ages it out.

### By hand

When the API is not an option, take the message off the parking lot and
publish its payload through the default exchange to the worker queue it was
rejected from:

```bash
# Removes the oldest parked message and prints it
rabbitmqadmin -V <vhost> -f raw_json get queue=provisioning.dead-letters count=1 ackmode=ack_requeue_false

rabbitmqadmin -V <vhost> publish exchange=amq.default routing_key=billing-queue \
  payload='{"tenantId":"<id>","subdomain":"acme","planId":"pro"}'
```

Publishing to `provisioning.direct` with the event's routing key no longer
reaches the worker: only tenant-service listens there, for results. The worker
processes it again. If it succeeds, tenant-service records the result and sends
the next step on its way, and marks the tenant `ACTIVE` when the last one is
done. Until then the tenant and the failed
step still read `FAILED`. If the step fails again, the message dead-letters
again and the tenant gets a new `tenant.provisioning.failed` event.

If every parked message has the same key, the management UI's "Move messages"
(shovel plugin) can move them straight into that worker's queue instead.

### Tenants that never started

If tenant-service can't publish a step's input within 5 seconds (the broker is
down, for example), it marks the tenant `FAILED` at that step with the error
`Could not publish tenant.requested: …` (or the step's own input). Nothing
reached the broker, so nothing is parked. `POST /tenants` answers 503 when this
happens to the first step. `POST /tenants/:id/retry` starts the step again once
the broker is back. By hand, send `tenant.requested` to db-provisioner yourself
with the tenant's `id`, `subdomain` and `planId` from `GET /tenants/:id`:

```bash
rabbitmqadmin -V <vhost> publish exchange=amq.default routing_key=db-provisioner-queue \
  payload='{"tenantId":"<id>","subdomain":"<subdomain>","planId":"starter"}'
```
