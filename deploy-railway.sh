#!/bin/bash

# Railway Deployment Script for LiftOff
# This script helps automate the deployment of all services to Railway

set -e

echo "🚀 LiftOff - Railway Deployment Script"
echo "========================================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed."
    echo "📦 Install it with: npm i -g @railway/cli"
    echo "🔗 Or visit: https://docs.railway.app/develop/cli"
    exit 1
fi

echo "✅ Railway CLI found"
echo ""

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please login to Railway first:"
    railway login
fi

echo "✅ Logged in to Railway"
echo ""

# Function to deploy a service
deploy_service() {
    local service_name=$1
    local dockerfile_path=$2
    
    echo "📦 Deploying $service_name..."
    echo "   Dockerfile: $dockerfile_path"
    
    # You would typically use Railway CLI commands here
    # This is a template - adjust based on your Railway setup
    
    echo "   ⚠️  Manual step required:"
    echo "   1. Create a new service in Railway dashboard named: $service_name"
    echo "   2. Set Dockerfile path to: $dockerfile_path"
    echo "   3. Configure environment variables"
    echo ""
}

echo "📋 Deployment Order:"
echo "==================="
echo ""
echo "1️⃣  Database Services (via Railway Dashboard)"
echo "   - PostgreSQL"
echo "   - Redis (optional)"
echo ""
echo "2️⃣  Message Queue"
echo "   - RabbitMQ (CloudAMQP recommended)"
echo ""
echo "3️⃣  Application Services"
echo ""

# List all services to deploy
deploy_service "tenant-service" "apps/tenant-service/Dockerfile"
deploy_service "credentials-service" "apps/credentials-service/Dockerfile"
deploy_service "db-provisioner-service" "apps/db-provisioner-service/Dockerfile"
deploy_service "dns-provisioner-service" "apps/dns-provisioner-service/Dockerfile"
deploy_service "billing-service" "apps/billing-service/Dockerfile"
deploy_service "notification-service" "apps/notification-service/Dockerfile"
deploy_service "api-gateway" "apps/api-gateway/Dockerfile"

echo "✅ Deployment plan generated!"
echo ""
echo "📚 Next Steps:"
echo "=============="
echo "1. Follow the Railway Deployment Guide: RAILWAY_DEPLOYMENT.md"
echo "2. Configure environment variables for each service"
echo "3. Deploy services in the order listed above"
echo "4. Run database migrations (automatic via docker-entrypoint.sh)"
echo "5. Seed initial data: npm run prisma:seed --workspace=apps/tenant-service"
echo "6. Test your deployment"
echo ""
echo "🔗 Useful Links:"
echo "   - Railway Dashboard: https://railway.app/dashboard"
echo "   - CloudAMQP: https://www.cloudamqp.com/"
echo "   - Documentation: ./RAILWAY_DEPLOYMENT.md"
echo ""
echo "🎉 Good luck with your deployment!"
