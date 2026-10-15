#!/bin/sh
set -e

# No `prisma db push`: this service owns no tables, it only creates a schema per tenant.
echo "Starting db-provisioner-service..."
cd /usr/src/app
exec node backend/db-provisioner-service/dist/src/main
