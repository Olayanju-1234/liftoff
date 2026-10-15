#!/bin/sh
set -e

echo "Starting tenant-service..."
cd /usr/src/app/backend/tenant-service
echo "Moving any legacy public.Credential table to the credentials schema..."
npx prisma db execute --file prisma/handoff-credential-table.sql --schema prisma/schema.prisma
echo "Applying Prisma schema..."
npx prisma db push --skip-generate
echo "Schema applied."

cd /usr/src/app
exec node backend/tenant-service/dist/src/main
