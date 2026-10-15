API Gateway Service

This is the only public-facing service for the LiftOff platform. It acts as the "front door," handling authentication, rate limiting, and request validation.

Purpose

Type: Web Server

Listens On: http://localhost:3000

Primary Job: To authenticate incoming requests and proxy them to the correct internal service.

Authentication

Protected routes expect a JWT access token as a Bearer token in the Authorization header.

The gateway forwards that header to the tenant-service, which verifies the token (signed with JWT_SECRET). The gateway itself holds no auth secrets.

Workflow

Receives POST /tenants from the end-user.

Forwards the Authorization header for the tenant-service to verify.

Makes a synchronous POST request to the tenant-service (on port 3001).

Returns the response from the tenant-service (a 201 Created) to the end-user.
