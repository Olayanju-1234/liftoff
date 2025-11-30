# 🚀 Render Deployment Guide for LiftOff

## Overview
This guide will help you deploy your LiftOff tenant provisioning platform to Render using the `render.yaml` Blueprint.

---

## ✅ Prerequisites

1. **Render Account**: Sign up at https://render.com
2. **GitHub Repository**: Your code pushed to GitHub (✅ Already done!)
3. **CloudAMQP Account**: For RabbitMQ (free tier available)

---

## 🎯 Quick Deploy (Recommended)

### Option 1: One-Click Deploy with Blueprint

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com

2. **Create New Blueprint**
   - Click "New" → "Blueprint"
   - Connect your GitHub repository: `Olayanju-1234/liftoff`
   - Render will automatically detect `render.yaml`

3. **Review Configuration**
   - Render will show all 7 services + 2 databases
   - Review the configuration
   - Click "Apply"

4. **Wait for Deployment**
   - Render will create all services automatically
   - This takes about 10-15 minutes
   - Watch the build logs for each service

5. **Done!** 🎉
   - All services will be deployed
   - Databases will be provisioned
   - Environment variables will be set

---

## 🔧 Configuration Details

### Services Deployed

| Service | Type | Port | Auto-Deploy |
|---------|------|------|-------------|
| api-gateway | Web Service | 10000 | ✅ |
| tenant-service | Web Service | 3001 | ✅ |
| db-provisioner-service | Worker | N/A | ✅ |
| dns-provisioner-service | Worker | N/A | ✅ |
| credentials-service | Worker | N/A | ✅ |
| billing-service | Worker | N/A | ✅ |
| notification-service | Worker | N/A | ✅ |

### Databases

| Database | Type | Plan |
|----------|------|------|
| liftoff-postgres | PostgreSQL | Free |
| liftoff-redis | Redis | Free |

---

## ⚠️ Important: Update CloudAMQP URL

**Before deploying**, you need to update the RabbitMQ URL in `render.yaml`:

### Current (Example) URL:
```yaml
AMQP_URL: "amqps://vqfrwqmw:dqOpui_y6M02B-HNpDjNA1994Xl7WH9b@moose.rmq.cloudamqp.com/vqfrwqmw"
```

### Steps to Get Your Own:

1. **Sign up at CloudAMQP**
   - Go to: https://www.cloudamqp.com/
   - Create a free account

2. **Create Instance**
   - Click "Create New Instance"
   - Select "Little Lemur" (Free plan)
   - Choose a region close to your Render services
   - Click "Create instance"

3. **Get AMQP URL**
   - Click on your instance
   - Copy the "AMQP URL"
   - It looks like: `amqps://username:password@host/vhost`

4. **Update render.yaml**
   - Replace ALL occurrences of the AMQP_URL in `render.yaml`
   - There are 6 services that need this URL
   - Save and commit:
     ```bash
     git add render.yaml
     git commit -m "Update CloudAMQP URL"
     git push origin main
     ```

---

## 🔐 Security: API Key

The `render.yaml` is configured to auto-generate an API key for you:

```yaml
- key: API_KEY
  generateValue: true
```

**After deployment:**
1. Go to api-gateway service in Render
2. Click "Environment"
3. Find the generated `API_KEY`
4. Copy it for testing

**Or set your own:**
```bash
# Generate a strong key
openssl rand -base64 32

# Update in Render dashboard:
# api-gateway → Environment → API_KEY
```

---

## 📋 Deployment Steps (Detailed)

### Step 1: Prepare CloudAMQP

1. Sign up at https://www.cloudamqp.com/
2. Create free "Little Lemur" instance
3. Copy AMQP URL
4. Update `render.yaml` with your URL
5. Commit and push changes

### Step 2: Deploy to Render

1. Go to https://dashboard.render.com
2. Click "New" → "Blueprint"
3. Connect GitHub repository
4. Select `Olayanju-1234/liftoff`
5. Render detects `render.yaml`
6. Click "Apply"

### Step 3: Monitor Deployment

Watch the deployment progress:
- **Databases**: Deploy first (2-3 minutes)
- **Services**: Deploy in parallel (8-12 minutes each)
- **Migrations**: Run automatically via docker-entrypoint.sh

### Step 4: Verify Deployment

Check each service:
1. **api-gateway**: Should show "Running"
2. **tenant-service**: Should show "Running"
3. **All workers**: Should show "Running"
4. **Databases**: Should show "Available"

### Step 5: Seed Database

After tenant-service is running:

1. Go to tenant-service in Render dashboard
2. Click "Shell" tab
3. Run:
   ```bash
   cd /usr/src/app
   npm run prisma:seed --workspace=apps/tenant-service
   ```

### Step 6: Test Your API

Get your API Gateway URL from Render dashboard, then:

```bash
# Replace with your actual URL and API key
curl -X POST https://your-api-gateway.onrender.com/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "name": "Test Corporation",
    "subdomain": "testcorp",
    "planId": "plan_basic"
  }'
```

Expected response:
```json
{
  "id": "...",
  "name": "Test Corporation",
  "subdomain": "testcorp",
  "status": "PROVISIONING",
  "planId": "plan_basic",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## 🔍 Monitoring & Logs

### View Logs

1. Go to Render dashboard
2. Click on any service
3. Click "Logs" tab
4. Watch real-time logs

### Check Service Health

Each service shows:
- ✅ **Running**: Service is healthy
- 🔄 **Building**: Service is deploying
- ❌ **Failed**: Check logs for errors

---

## 🐛 Troubleshooting

### Build Failures

**Symptom**: Service fails to build

**Solutions**:
1. Check build logs for specific error
2. Verify Dockerfile path in `render.yaml`
3. Ensure all dependencies in `package.json`
4. Check Docker context is set to `.`

### Database Connection Issues

**Symptom**: Service can't connect to database

**Solutions**:
1. Verify `DATABASE_URL` is set correctly
2. Check database is "Available"
3. Ensure migrations ran (check logs)
4. Restart the service

### RabbitMQ Connection Failed

**Symptom**: Workers can't connect to RabbitMQ

**Solutions**:
1. Verify `AMQP_URL` is correct
2. Test connection from CloudAMQP dashboard
3. Check CloudAMQP instance is running
4. Ensure URL includes protocol (`amqps://`)

### Service Won't Start

**Symptom**: Service stuck in "Building" or crashes

**Solutions**:
1. Check logs for error messages
2. Verify environment variables are set
3. Ensure Prisma client generated (for DB services)
4. Check docker-entrypoint.sh is executable

### Migrations Not Running

**Symptom**: Database schema not updated

**Solutions**:
1. Check service logs for migration output
2. Verify docker-entrypoint.sh is being executed
3. Manually run migrations via Shell:
   ```bash
   cd /usr/src/app/apps/tenant-service
   npx prisma migrate deploy
   ```

---

## 🎯 Render-Specific Features

### Auto-Deploy

All services are configured with `autoDeploy: true`:
- Automatic deployment on git push
- No manual intervention needed
- Continuous deployment enabled

### Internal Networking

Services communicate via internal URLs:
- Format: `http://service-name:port`
- Example: `http://tenant-service:3001`
- No public internet traffic
- Faster and more secure

### Environment Variables

Render automatically provides:
- `DATABASE_URL` from PostgreSQL
- `REDIS_URL` from Redis
- Service-to-service URLs
- Auto-generated secrets

### Free Tier Limits

Render free tier includes:
- 750 hours/month per service
- 100GB bandwidth/month
- 256MB RAM per service
- Sleeps after 15 min inactivity

**Note**: With 7 services, you'll use ~5,250 hours/month, which exceeds free tier. Consider:
- Upgrading critical services (api-gateway, tenant-service)
- Keeping workers on free tier
- Using paid tier for production

---

## 💰 Cost Optimization

### Recommended Setup

**Free Tier** (Development):
- All services on free tier
- Services sleep when inactive
- Good for testing

**Production** (Recommended):
| Service | Plan | Cost/month |
|---------|------|------------|
| api-gateway | Starter | $7 |
| tenant-service | Starter | $7 |
| Workers (5) | Free | $0 |
| PostgreSQL | Free | $0 |
| Redis | Free | $0 |
| **Total** | | **$14/month** |

---

## 🔄 Updates & Redeployment

### Automatic Updates

With `autoDeploy: true`, updates are automatic:

1. Make code changes
2. Commit and push to GitHub
3. Render automatically rebuilds and deploys
4. Zero-downtime deployment

### Manual Redeploy

If needed:
1. Go to service in Render dashboard
2. Click "Manual Deploy"
3. Select "Deploy latest commit"

---

## 📊 Performance Tips

### Database Optimization

1. **Connection Pooling**: Already configured in Prisma
2. **Indexes**: Add indexes for common queries
3. **Query Optimization**: Use Prisma's query optimization

### Service Optimization

1. **Keep Services Warm**: Upgrade to paid tier to prevent sleep
2. **Use Redis**: Cache frequently accessed data
3. **Optimize Docker**: Images are already optimized with multi-stage builds

---

## 🎉 Success Criteria

Your deployment is successful when:

1. ✅ All 7 services show "Running"
2. ✅ Both databases show "Available"
3. ✅ API Gateway is publicly accessible
4. ✅ Test tenant creation works
5. ✅ Tenant status changes to "ACTIVE"
6. ✅ No errors in logs
7. ✅ All workers processing events

---

## 📞 Support

### Render Support
- Docs: https://render.com/docs
- Community: https://community.render.com
- Status: https://status.render.com

### CloudAMQP Support
- Docs: https://www.cloudamqp.com/docs/
- Support: support@cloudamqp.com

### Application Issues
- Check logs in Render dashboard
- Review `PRODUCTION_CHECKLIST.md`
- See `QUICK_REFERENCE.md`

---

## 🚀 Next Steps

After successful deployment:

1. **Set up custom domain** (optional)
2. **Configure SSL** (automatic with Render)
3. **Set up monitoring** (Render provides basic metrics)
4. **Implement CI/CD** (already enabled with autoDeploy)
5. **Scale as needed** (upgrade plans when ready)

---

## ✨ Summary

**Your deployment is ready!** 🎉

1. Update CloudAMQP URL in `render.yaml`
2. Push changes to GitHub
3. Deploy via Render Blueprint
4. Wait 10-15 minutes
5. Test your API
6. You're live!

**Render is perfect for your use case because:**
- ✅ Blueprint deployment (one-click)
- ✅ Automatic migrations
- ✅ Free tier available
- ✅ Auto-deploy on push
- ✅ Built-in databases
- ✅ Easy to scale

---

**Good luck with your Render deployment!** 🚀
