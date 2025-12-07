Tenant Service

This is the "brain" or "source of truth" for the entire platform. It manages the core Tenant table, which tracks the provisioning status of each customer.

Purpose

Type: Web Server (Internal)

Listens On: http://localhost:3001 (Only on 127.0.0.1 for security)

Database: Owns the Tenant, User, and Plan tables in the PostgreSQL database.

Workflow

This service acts as both a publisher and a consumer.

As a Publisher:

Receives a synchronous POST /tenants call from the api-gateway.

Creates a new Tenant in the database with a status of PROVISIONING.

Catches P2002 (unique) errors and returns a 409 Conflict.

On success, publishes the first event in the saga: tenant.requested.

As a Consumer:

Subscribes to the final event: tenant.provisioning.complete.

When it receives this event, it updates the tenant's status in the database from PROVISIONING to ACTIVE.
