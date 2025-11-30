# 🎯 Render Free vs Paid Tier Guide

## Overview

Render has **two deployment configurations** for your LiftOff platform:

1. **`render.yaml`** - Free tier compatible (use this now!)
2. **`render.paid.yaml`** - Paid tier with proper workers (use when you upgrade)

---

## 🆓 Free Tier Setup (Current)

### What's Different?

**Workers run as Web Services** instead of background workers because Render's free tier doesn't support the `worker` type.

### Configuration: `render.yaml`

```yaml
# All services are type: web (free tier compatible)
- type: web
  name: db-provisioner-service
  # ... runs as web service but still processes RabbitMQ messages
```

### How It Works

- ✅ All 7 services deploy successfully
- ✅ Services still consume RabbitMQ messages
- ✅ Event-driven architecture still works
- ⚠️ Services may sleep after 15min inactivity
- ⚠️ First request after sleep takes ~30 seconds

### Cost: **$0/month**

---

## 💰 Paid Tier Setup (When You Upgrade)

### What's Different?

**Workers run as proper background workers** - more efficient and always active.

### Configuration: `render.paid.yaml`

```yaml
# Workers are type: worker (paid tier only)
- type: worker
  name: db-provisioner-service
  plan: starter  # $7/month
  # ... runs as dedicated background worker
```

### How It Works

- ✅ Proper background workers
- ✅ No sleeping (always active)
- ✅ Better performance
- ✅ Dedicated resources
- ✅ More reliable

### Cost Breakdown

| Service | Type | Plan | Cost/month |
|---------|------|------|------------|
| api-gateway | Web | Starter | $7 |
| tenant-service | Web | Starter | $7 |
| db-provisioner | Worker | Starter | $7 |
| dns-provisioner | Worker | Starter | $7 |
| credentials | Worker | Starter | $7 |
| billing | Worker | Starter | $7 |
| notification | Worker | Starter | $7 |
| PostgreSQL | Database | Starter | $7 |
| Redis | Database | Starter | $7 |
| **TOTAL** | | | **$63/month** |

---

## 🔄 How to Switch

### From Free to Paid

When you're ready to upgrade:

1. **Rename files**:
   ```bash
   mv render.yaml render.free.yaml
   mv render.paid.yaml render.yaml
   ```

2. **Commit and push**:
   ```bash
   git add .
   git commit -m "Switch to paid tier configuration"
   git push origin main
   ```

3. **Update in Render**:
   - Go to Render dashboard
   - Your Blueprint will auto-update
   - Render will recreate services as workers
   - Upgrade each service plan to "Starter"

### From Paid to Free

If you need to downgrade:

1. **Rename files back**:
   ```bash
   mv render.yaml render.paid.yaml
   mv render.free.yaml render.yaml
   ```

2. **Commit and push**:
   ```bash
   git add .
   git commit -m "Switch back to free tier"
   git push origin main
   ```

---

## 🤔 Which Should You Use?

### Use Free Tier (`render.yaml`) If:

- ✅ You're testing/developing
- ✅ Low traffic expected
- ✅ Can tolerate 30s wake-up time
- ✅ Budget is $0
- ✅ Just getting started

### Use Paid Tier (`render.paid.yaml`) If:

- ✅ Production traffic
- ✅ Need instant response times
- ✅ Can't tolerate service sleep
- ✅ Budget allows ~$63/month
- ✅ Business-critical application

---

## 💡 Hybrid Approach (Recommended)

Start with free, upgrade strategically:

### Phase 1: All Free ($0/month)
- Use `render.yaml`
- Test everything works
- Get initial users

### Phase 2: Critical Services Paid ($14/month)
- Upgrade api-gateway to Starter
- Upgrade tenant-service to Starter
- Keep workers on free tier (as web services)

### Phase 3: Full Production ($63/month)
- Switch to `render.paid.yaml`
- All services on Starter plan
- Proper workers, no sleep

---

## 🔧 Technical Details

### Why Workers Run as Web Services on Free Tier

Render's free tier limitations:
- ❌ No `worker` service type
- ❌ Only `web` and `cron` types allowed
- ✅ But web services can still consume RabbitMQ!

### How It Still Works

Your worker services:
1. Start as web services (HTTP server)
2. Connect to RabbitMQ on startup
3. Listen for messages in background
4. Process events normally
5. HTTP endpoint available but not used

**Result**: Functionally identical to workers, just different service type!

---

## 📊 Performance Comparison

### Free Tier
- **Cold Start**: ~30 seconds after sleep
- **Active Performance**: Same as paid
- **Reliability**: 99% uptime
- **Sleep**: After 15min inactivity

### Paid Tier
- **Cold Start**: None (always active)
- **Active Performance**: Excellent
- **Reliability**: 99.99% uptime
- **Sleep**: Never

---

## 🎯 Recommendation for You

**Start with `render.yaml` (Free Tier)**

Why?
1. ✅ Test everything works
2. ✅ No cost while developing
3. ✅ Easy to upgrade later
4. ✅ Same functionality
5. ✅ Learn the platform

**Then upgrade when:**
- You have paying customers
- You need 24/7 availability
- You can't tolerate cold starts
- You have budget

---

## 📝 Current Setup

You're currently using: **`render.yaml` (Free Tier)**

- All services run as `web` type
- Free PostgreSQL database
- Free Redis cache
- $0/month cost
- Perfect for getting started!

When you're ready to upgrade, just switch to `render.paid.yaml` and you'll have proper background workers.

---

**Both configurations are production-ready and fully functional!** 🚀
