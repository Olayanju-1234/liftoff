Billing Service (Mock)

This is the fourth worker in the provisioning saga. It's a "headless" service that listens for events.

Note: This is a mock service. It simulates a 1-second API call to a billing provider like Stripe.

Purpose

Type: Headless Worker

Database: None.

Workflow

Consumes: tenant.credentials.ready

Job:

Receives the event (which includes the planId).

"Mocks" an API call to Stripe by sleeping for 1 second.

Publishes: tenant.billing.active

Failure: If the job fails, it sends the message to the dlx.provisioning exchange (Dead Letter Queue).
