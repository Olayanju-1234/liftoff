#!/bin/sh
set -e

echo "Starting db-provisioner-service..."
echo "Applying Prisma schema..."
cd /usr/src/app/backend/db-provisioner-service
npx prisma db push --skip-generate
echo "Schema applied."

cd /usr/src/app
exec node backend/db-provisioner-service/dist/src/main
