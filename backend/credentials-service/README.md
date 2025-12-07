Credentials Service

This is the third worker in the provisioning saga. It's a "headless" service that manages its own database table for storing secrets.

Purpose

Type: Headless Worker

Database: Owns the Credential table in the PostgreSQL database.

Workflow

Consumes: tenant.dns.ready

Job:

Receives the event.

Uses Node.js crypto to generate a secure, random API key (e.g., sk*live*...).

Saves the new API key to the Credential table, linked to the tenantId.

Handles P2002 (unique) errors to be idempotent (it won't crash if it receives a duplicate event).

Publishes: tenant.credentials.ready

Failure: If the job fails, it sends the message to the dlx.provisioning exchange (Dead Letter Queue).
