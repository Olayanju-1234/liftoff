Notification Service (Mock)

This is the final worker in the provisioning saga. It's a "headless" service that listens for events.

Note: This is a mock service. It simulates a 500ms API call to an email provider like SendGrid or Mailgun.

Purpose

Type: Headless Worker

Database: None.

Workflow

Consumes: tenant.billing.active

Job:

Receives the event.

"Mocks" sending a "Welcome!" email by sleeping for 500ms.

Publishes: tenant.provisioning.complete (This is the final event that the tenant-service listens for).

Failure: If the job fails, it sends the message to the dlx.provisioning exchange (Dead Letter Queue).
