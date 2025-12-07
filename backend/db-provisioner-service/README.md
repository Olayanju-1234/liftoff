DB Provisioner Service

This is the first worker in the provisioning saga. It's a "headless" service that only listens for events.

Purpose

Type: Headless Worker

Database: Connects to the main PostgreSQL database to run CREATE SCHEMA commands.

Workflow

Consumes: tenant.requested

Job:

Receives the event.

Generates a unique schema name (e.g., tenant_newcorp).

Executes a raw SQL CREATE SCHEMA command.

Publishes: tenant.db.ready

Failure: If the job fails, it sends the message to the dlx.provisioning exchange (Dead Letter Queue).
