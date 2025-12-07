API Gateway Service

This is the only public-facing service for the LiftOff platform. It acts as the "front door," handling authentication, rate limiting, and request validation.

Purpose

Type: Web Server

Listens On: http://localhost:3000

Primary Job: To authenticate incoming requests and proxy them to the correct internal service.

Authentication

This service is protected by an AuthGuard.

It expects a Bearer token in the Authorization header.

The valid token is stored in this service's .env file (API_KEY).

Workflow

Receives POST /tenants from the end-user.

Authenticates the request.

Makes a synchronous POST request to the tenant-service (on port 3001).

Returns the response from the tenant-service (a 201 Created) to the end-user.
