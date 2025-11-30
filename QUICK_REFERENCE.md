# 🚀 Railway Deployment Quick Reference

## Essential Environment Variables

### API Gateway
```bash
PORT=3000
API_KEY=<generate-strong-key>
TENANT_SERVICE_URL=http://tenant-service.railway.internal:3001
NODE_ENV=production
```

### Tenant Service
```bash
PORT=3001
DATABASE_URL=${{Postgres.DATABASE_URL}}
AMQP_URL=<cloudamqp-url>
NODE_ENV=production
```

### Worker Services (db-provisioner, credentials, dns-provisioner, billing, notification)
```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}  # Only for db-provisioner and credentials
AMQP_URL=<cloudamqp-url>
NODE_ENV=production
```

---

## Deployment Order

1. ✅ PostgreSQL (Railway Database)
2. ✅ RabbitMQ (CloudAMQP)
3. ✅ tenant-service
4. ✅ credentials-service
5. ✅ db-provisioner-service
6. ✅ dns-provisioner-service
7. ✅ billing-service
8. ✅ notification-service
9. ✅ api-gateway

---

## Dockerfile Paths

| Service | Dockerfile Path |
|---------|----------------|
| api-gateway | `apps/api-gateway/Dockerfile` |
| tenant-service | `apps/tenant-service/Dockerfile` |
| credentials-service | `apps/credentials-service/Dockerfile` |
| db-provisioner-service | `apps/db-provisioner-service/Dockerfile` |
| dns-provisioner-service | `apps/dns-provisioner-service/Dockerfile` |
| billing-service | `apps/billing-service/Dockerfile` |
| notification-service | `apps/notification-service/Dockerfile` |

---

## Post-Deployment Commands

### Seed Database
```bash
# Run after tenant-service is deployed
npm run prisma:seed --workspace=apps/tenant-service
```

### Test API
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

---

## Critical Security Steps

1. **Generate Strong API Key**
   ```bash
   openssl rand -base64 32
   ```

2. **Get CloudAMQP URL**
   - Sign up: https://www.cloudamqp.com/
   - Create free instance
   - Copy AMQP URL

3. **Never Commit Secrets**
   - Use Railway environment variables
   - Don't commit `.env` files

---

## Troubleshooting Quick Fixes

| Issue | Solution |
|-------|----------|
| Build fails | Check Dockerfile syntax, verify dependencies |
| Database connection error | Verify `DATABASE_URL` is set |
| Service won't start | Check environment variables |
| RabbitMQ connection failed | Verify `AMQP_URL` from CloudAMQP |
| Migrations not running | Check docker-entrypoint.sh is executable |

---

## Useful Links

- 📖 Full Guide: `RAILWAY_DEPLOYMENT.md`
- ✅ Checklist: `PRODUCTION_CHECKLIST.md`
- 📋 Summary: `PRODUCTION_READY_SUMMARY.md`
- 🔧 Env Template: `.env.production.template`

---

## Railway Dashboard URLs

- Project: https://railway.app/dashboard
- CloudAMQP: https://www.cloudamqp.com/
- Railway Docs: https://docs.railway.app

---

**Ready to deploy? Start with `RAILWAY_DEPLOYMENT.md`** 🚀
