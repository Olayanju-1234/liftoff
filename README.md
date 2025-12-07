LiftOff 🚀

An automated, event-driven provisioning platform for B2B SaaS companies. LiftOff provides a single API endpoint to asynchronously provision an entire new customer environment, including databases, credentials, and billing, using a resilient microservice saga.

The Problem

When a new B2B customer (an "Organization" or "Tenant") signs up for a SaaS product, the technical onboarding is often a slow, manual, or brittle process. This can involve:

Manually creating a new database or schema.

Running scripts to provision DNS records.

Generating and securely sharing API keys.

Activating a subscription in a billing system.

This process is a scalability bottleneck. It's error-prone, wastes developer time, and leads to a slow "Time-to-Value" for new customers.

The Solution

LiftOff solves this by providing a robust, event-driven engine that automates this entire workflow.

A B2B company simply makes a single, secure API call to LiftOff to request a new tenant. LiftOff immediately responds with a "Provisioning" status and then handles the entire multi-step process in the background using a Saga Pattern over a message queue.

Key Features

Asynchronous Workflow: A new tenant request returns in <100ms, while the full provisioning saga runs in the background.

Resilient & Decoupled: Each step is a separate microservice. If the dns-provisioner fails, it doesn't crash the credentials-service.

Event-Driven: Services communicate using RabbitMQ, publishing and subscribing to events.

Idempotent Workers: Services are designed to handle duplicate messages without error (e.g., credentials-service won't create duplicate keys).

Failure Handling: Implements a Dead Letter Queue (DLQ) pattern to catch and isolate "toxic" messages for manual review.

Secure: The api-gateway is protected by a Bearer Token API key.

System Architecture

The project uses an event-driven microservice architecture. All services are independent NestJS applications managed in an npm workspaces monorepo.

The Workflow Saga

A user sends a POST /tenants request with an API key to the api-gateway.

The api-gateway authenticates the request and synchronously calls the tenant-service.

The tenant-service creates a Tenant record with a PROVISIONING status and publishes a tenant.requested event to RabbitMQ.

The db-provisioner-service consumes this event, creates a new schema in the database, and publishes tenant.db.ready.

The dns-provisioner-service consumes this, (mock) creates a DNS record, and publishes tenant.dns.ready.

The credentials-service consumes this, generates API keys, saves them to its own table, and publishes tenant.credentials.ready.

The billing-service consumes this, (mock) creates a Stripe subscription, and publishes tenant.billing.active.

The notification-service consumes this, (mock) sends a welcome email, and publishes the final event: tenant.provisioning.complete.

The tenant-service (which is also a consumer) hears this final event and updates the tenant's status from PROVISIONING to ACTIVE.

Tech Stack

Monorepo: npm Workspaces

Services: NestJS (with Fastify adapter)

Language: TypeScript

Message Queue: RabbitMQ (via @golevelup/nestjs-rabbitmq)

Database: PostgreSQL

ORM: Prisma

Authentication: NestJS Guards (API Key)

Logging: nestjs-pino

Shared Code: @liftoff/shared-types local package

Infrastructure: Docker Compose

Getting Started

Prerequisites

Node.js (v18+)

npm (comes with Node.js)

Docker Desktop

1. Initial Setup

# Clone the repository

git clone [https://github.com/YOUR_USERNAME/lift-off.git](https://github.com/YOUR_USERNAME/lift-off.git)
cd lift-off

# Install all dependencies for all services

npm install

# Start the infrastructure (PostgreSQL, RabbitMQ)

docker-compose up -d

2. Run Migrations & Generate Clients

The services with databases (tenant-service, credentials-service) need to have their Prisma clients built.

# (Run from root)

cd apps/tenant-service && npx prisma migrate dev && cd ../..
cd apps/credentials-service && npx prisma migrate dev && cd ../..

# This ensures all Prisma clients are generated

npm run build --workspace=apps/tenant-service
npm run build --workspace=apps/credentials-service

3. Run the Services

You must run all 7 services in their own separate terminals.

# Terminal 1: API Gateway (Dev Mode)

npm run start:dev --workspace=apps/api-gateway

# Terminal 2: Tenant Service (Dev Mode)
# Note: If you need to regenerate Prisma clients, stop this service first to avoid file locks on Windows

npm run start:dev --workspace=apps/tenant-service

# Terminal 3: DB Provisioner (Dev Mode)

npm run start:dev --workspace=apps/db-provisioner-service

# Terminal 4: DNS Provisioner (Dev Mode)

npm run start:dev --workspace=apps/dns-provisioner-service

# Terminal 5: Credentials Service (Dev Mode)
# Note: If you need to regenerate Prisma clients, stop this service first to avoid file locks on Windows

npm run start:dev --workspace=apps/credentials-service

# Terminal 6: Billing Service (Dev Mode)

npm run start:dev --workspace=apps/billing-service

# Terminal 7: Notification Service (Dev Mode)

npm run start:dev --workspace=apps/notification-service

Testing the Full Flow

Use curl to send a request to the api-gateway. You must provide your secret API key (defined in apps/api-gateway/.env) as a Bearer Token.

Make sure to use a unique name and subdomain for each test.

Test 1: Successful Request

This will trigger the entire 7-service saga.

curl -X POST http://localhost:3000/tenants \
-H "Content-Type: application/json" \
-H "Authorization: Bearer sk_live_123456789_this_is_a_secret_key" \
-d '{"name": "New Test Corp", "subdomain": "newcorp", "planId": "plan_enterprise"}'

Expected Response: A 201 Created status with the new tenant object.

Watch your 7 service terminals to see the event logs ripple through the entire system, ending with the tenant-service logging:
SUCCESS: Tenant ... is now ACTIVE.

Test 2: Duplicate Request (Error Handling)

If you run the exact same command a second time, the tenant-service will catch the unique constraint error and return a clean 409 Conflict.

Expected Response:

{
"message": "A tenant with this name already exists.",
"error": "Conflict",
"statusCode": 409
}

Test 3: Unauthorized Request

If you forget the API key or use a bad one:

curl -X POST http://localhost:3000/tenants \
-H "Content-Type: application/json" \
-d '{"name": "Bad Key", "subdomain": "badkey", "planId": "plan_basic"}'

Expected Response:

{
"message": "Authorization header is missing",
"error": "Unauthorized",
"statusCode": 401
}
