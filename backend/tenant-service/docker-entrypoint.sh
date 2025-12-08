#!/bin/sh
set -e

echo "🚀 Starting tenant-service initialization..."

# Run Prisma migrations
echo "📦 Running Prisma migrations..."
cd /usr/src/app/backend/tenant-service
npx prisma migrate deploy

echo "✅ Migrations completed successfully"

# Start the application
echo "🎯 Starting application..."
cd /usr/src/app
exec node backend/tenant-service/dist/main
