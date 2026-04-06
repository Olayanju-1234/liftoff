#!/bin/sh
set -e

echo "Starting tenant-service..."
echo "Applying Prisma schema..."
cd /usr/src/app/backend/tenant-service
npx prisma db push --skip-generate
echo "Schema applied."

cd /usr/src/app
exec node backend/tenant-service/dist/main
