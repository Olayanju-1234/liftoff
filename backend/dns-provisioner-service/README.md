DNS Provisioner Service (Mock)

This is the second worker in the provisioning saga. It's a "headless" service that listens for events.

Note: This is a mock service. It simulates a 2-second API call instead of integrating with a real DNS provider.

Purpose

Type: Headless Worker

Database: None.

Workflow

Consumes: tenant.db.ready

Job:

Receives the event.

"Mocks" an API call by sleeping for 2 seconds.

Publishes: tenant.dns.ready

Failure: If the job fails, it sends the message to the dlx.provisioning exchange (Dead Letter Queue).
