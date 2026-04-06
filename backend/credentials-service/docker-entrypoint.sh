#!/bin/sh
set -e

echo "Starting credentials-service..."
echo "Applying Prisma schema..."
cd /usr/src/app/backend/credentials-service
npx prisma db push --skip-generate
echo "Schema applied."

cd /usr/src/app
exec node backend/credentials-service/dist/src/main
