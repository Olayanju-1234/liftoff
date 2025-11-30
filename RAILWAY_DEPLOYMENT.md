# Railway Deployment Guide for LiftOff

This guide will help you deploy the LiftOff tenant provisioning platform to Railway.

## Prerequisites

1. A Railway account (sign up at https://railway.app)
2. Railway CLI installed (optional, but recommended)
3. Git repository pushed to GitHub/GitLab

## Architecture Overview

The platform consists of 7 microservices:
- **api-gateway** (Web Service) - Public-facing API
- **tenant-service** (Web Service) - Tenant management
- **db-provisioner-service** (Worker) - Database provisioning
- **dns-provisioner-service** (Worker) - DNS provisioning
- **credentials-service** (Worker) - API key generation
- **billing-service** (Worker) - Billing integration
- **notification-service** (Worker) - Notifications

## Step-by-Step Deployment

### 1. Create a New Railway Project

1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo"
3. Select your repository
4. Railway will create a new project

### 2. Add PostgreSQL Database

1. In your Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway will provision a PostgreSQL instance
4. Note: The `DATABASE_URL` will be automatically available to your services

### 3. Add Redis (Optional - for caching)

1. Click "+ New"
2. Select "Database" → "Redis"
3. Railway will provision a Redis instance

### 4. Set Up RabbitMQ

Railway doesn't provide managed RabbitMQ, so you have two options:

**Option A: Use CloudAMQP (Recommended)**
1. Sign up at https://www.cloudamqp.com/
2. Create a free instance
3. Copy the AMQP URL
4. Add it as an environment variable to all services

**Option B: Self-host RabbitMQ**
1. Deploy RabbitMQ as a separate service on Railway
2. Use the internal URL for communication

### 5. Deploy Each Service

For each service, you'll need to create a separate Railway service:

#### A. API Gateway

1. Click "+ New" → "Empty Service"
2. Name it "api-gateway"
3. Go to Settings → Source
4. Connect to your GitHub repository
5. Set Root Directory: `/`
6. Set Dockerfile Path: `apps/api-gateway/Dockerfile`
7. Add environment variables:
   ```
   PORT=3000
   API_KEY=your-strong-production-api-key-here
   TENANT_SERVICE_URL=http://tenant-service.railway.internal:3001
   ```
8. Deploy

#### B. Tenant Service

1. Click "+ New" → "Empty Service"
2. Name it "tenant-service"
3. Connect to repository
4. Set Dockerfile Path: `apps/tenant-service/Dockerfile`
5. Add environment variables:
   ```
   PORT=3001
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   AMQP_URL=your-cloudamqp-url
   ```
6. Deploy

#### C. DB Provisioner Service

1. Click "+ New" → "Empty Service"
2. Name it "db-provisioner-service"
3. Set Dockerfile Path: `apps/db-provisioner-service/Dockerfile`
4. Add environment variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   AMQP_URL=your-cloudamqp-url
   ```
5. Deploy

#### D. DNS Provisioner Service

1. Click "+ New" → "Empty Service"
2. Name it "dns-provisioner-service"
3. Set Dockerfile Path: `apps/dns-provisioner-service/Dockerfile`
4. Add environment variables:
   ```
   AMQP_URL=your-cloudamqp-url
   ```
5. Deploy

#### E. Credentials Service

1. Click "+ New" → "Empty Service"
2. Name it "credentials-service"
3. Set Dockerfile Path: `apps/credentials-service/Dockerfile`
4. Add environment variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   AMQP_URL=your-cloudamqp-url
   ```
5. Deploy

#### F. Billing Service

1. Click "+ New" → "Empty Service"
2. Name it "billing-service"
3. Set Dockerfile Path: `apps/billing-service/Dockerfile`
4. Add environment variables:
   ```
   AMQP_URL=your-cloudamqp-url
   ```
5. Deploy

#### G. Notification Service

1. Click "+ New" → "Empty Service"
2. Name it "notification-service"
3. Set Dockerfile Path: `apps/notification-service/Dockerfile`
4. Add environment variables:
   ```
   AMQP_URL=your-cloudamqp-url
   ```
5. Deploy

### 6. Run Database Migrations

After deploying tenant-service, credentials-service, and db-provisioner-service:

1. Go to each service's settings
2. Click on "Variables" tab
3. Ensure DATABASE_URL is set correctly
4. Open the service's shell (click on service → "Shell" tab)
5. Run migrations:
   ```bash
   cd apps/tenant-service && npx prisma migrate deploy
   cd apps/credentials-service && npx prisma migrate deploy
   cd apps/db-provisioner-service && npx prisma migrate deploy
   ```

Alternatively, you can add a migration step to your Dockerfile or use Railway's deployment hooks.

### 7. Seed Initial Data (Optional)

If you need to seed initial plans or data:

1. Open tenant-service shell
2. Run your seed script or manually insert data

### 8. Configure Networking

Railway provides internal networking between services:
- Services can communicate using `service-name.railway.internal`
- Only api-gateway needs to be publicly accessible
- Update TENANT_SERVICE_URL in api-gateway to use internal URL

### 9. Test Your Deployment

1. Get the public URL of your api-gateway from Railway
2. Test the endpoint:
   ```bash
   curl -X POST https://your-api-gateway.railway.app/tenants \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer your-api-key" \
     -d '{
       "name": "Test Corp",
       "subdomain": "testcorp",
       "planId": "plan_basic"
     }'
   ```

## Environment Variables Reference

### Common Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-provided by Railway)
- `AMQP_URL` - RabbitMQ connection string (from CloudAMQP)

### API Gateway Specific
- `PORT` - Port to listen on (default: 3000)
- `API_KEY` - Secret API key for authentication
- `TENANT_SERVICE_URL` - Internal URL to tenant service

### Service-Specific
- `REDIS_URL` - Redis connection string (if using Redis)

## Monitoring and Logs

1. Each service has its own logs in Railway
2. Click on a service to view real-time logs
3. Use Railway's metrics to monitor resource usage

## Scaling

Railway allows you to scale services:
1. Go to service settings
2. Adjust replicas (note: workers should typically have 1 replica)
3. Adjust resources if needed

## Troubleshooting

### Service Won't Start
- Check logs for errors
- Verify all environment variables are set
- Ensure Prisma client is generated (should happen in Dockerfile)

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check if migrations have been run
- Ensure PostgreSQL service is running

### Message Queue Issues
- Verify AMQP_URL is correct
- Check CloudAMQP dashboard for connection status
- Ensure all services have the same AMQP_URL

### Build Failures
- Check Dockerfile syntax
- Verify all dependencies are in package.json
- Check Railway build logs for specific errors

## Cost Optimization

1. Use Railway's free tier for development
2. For production, consider:
   - Using shared databases for non-critical services
   - Implementing proper caching with Redis
   - Monitoring resource usage and adjusting accordingly

## Security Best Practices

1. **Never commit secrets** - Use Railway's environment variables
2. **Rotate API keys** regularly
3. **Use strong passwords** for databases
4. **Enable SSL/TLS** for all connections
5. **Implement rate limiting** in api-gateway
6. **Monitor logs** for suspicious activity

## Next Steps

1. Set up custom domain for api-gateway
2. Configure SSL certificates
3. Set up monitoring and alerting
4. Implement backup strategy for databases
5. Set up CI/CD pipeline for automated deployments

## Support

For Railway-specific issues:
- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app

For application issues:
- Check service logs
- Review README.md for application architecture
- Check GitHub issues
