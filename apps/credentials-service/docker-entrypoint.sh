#!/bin/sh
set -e

echo "🚀 Starting credentials-service initialization..."

# Run Prisma migrations
echo "📦 Running Prisma migrations..."
cd /usr/src/app/apps/credentials-service
npx prisma migrate deploy

echo "✅ Migrations completed successfully"

# Start the application
echo "🎯 Starting application..."
cd /usr/src/app
exec node apps/credentials-service/dist/src/main
