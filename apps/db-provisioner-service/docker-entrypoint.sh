#!/bin/sh
set -e

echo "🚀 Starting db-provisioner-service initialization..."

# Run Prisma migrations
echo "📦 Running Prisma migrations..."
cd /usr/src/app/apps/db-provisioner-service
npx prisma migrate deploy

echo "✅ Migrations completed successfully"

# Start the application
echo "🎯 Starting application..."
cd /usr/src/app
exec node apps/db-provisioner-service/dist/main
