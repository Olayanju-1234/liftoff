# TenantOps - B2B Tenant Provisioning Platform

A production-ready multi-tenant provisioning platform built with a microservices architecture. This system automates the onboarding of new B2B customers by orchestrating database creation, DNS configuration, credential generation, billing setup, and notifications.

![Architecture](https://img.shields.io/badge/Architecture-Microservices-blue)
![Backend](https://img.shields.io/badge/Backend-NestJS-red)
![Frontend](https://img.shields.io/badge/Frontend-React-61DAFB)
![Database](https://img.shields.io/badge/Database-PostgreSQL-336791)
![Message Queue](https://img.shields.io/badge/Queue-RabbitMQ-FF6600)

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│                    Dashboard • Tenant Management                 │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (NestJS)                        │
│           REST API • Rate Limiting • Request Routing             │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
┌─────────────────┐                              ┌─────────────────┐
│  Tenant Service │                              │    RabbitMQ     │
│  (PostgreSQL)   │                              │  Message Queue  │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         └────────────────────────┬───────────────────────┘
                                  │
    ┌──────────────┬──────────────┼──────────────┬──────────────┐
    ▼              ▼              ▼              ▼              ▼
┌────────┐  ┌────────────┐  ┌──────────┐  ┌─────────┐  ┌────────────┐
│   DB   │  │ Credentials│  │   DNS    │  │ Billing │  │Notification│
│Provis. │  │  Service   │  │ Provis.  │  │ Service │  │  Service   │
└────────┘  └────────────┘  └──────────┘  └─────────┘  └────────────┘
```

## ✨ Features

### Backend
- **Multi-tenant Architecture** - Isolated tenant data with dedicated schemas
- **Event-Driven Provisioning** - Async pipeline via RabbitMQ
- **Health Monitoring** - Built-in health check endpoints
- **Settings Persistence** - User preferences stored in database
- **RESTful API** - Full CRUD operations for tenants

### Frontend
- **Modern Dashboard** - Real-time stats and system health
- **Tenant Management** - Search, filter, create, and delete tenants
- **Event Logs** - Filter by tenant/type with live tail polling
- **Pipeline Visualization** - Track provisioning progress
- **Service Health** - Monitor all microservices
- **Failed Jobs** - View errors and retry failed operations
- **Settings** - Profile, notifications, and security preferences
- **Toast Notifications** - User feedback for all actions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### 1. Clone and Install
```bash
git clone https://github.com/Olayanju-1234/liftoff.git
cd liftoff
npm install
```

### 2. Start Infrastructure
```bash
docker-compose up -d
```
This starts PostgreSQL, RabbitMQ, and Redis.

### 3. Setup Database
```bash
cd backend/tenant-service
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

### 4. Start Services
```bash
# Terminal 1 - Tenant Service
cd backend/tenant-service && npm run start:dev

# Terminal 2 - API Gateway
cd backend/api-gateway && npm run start:dev

# Terminal 3 - Frontend
cd frontend && npm run dev
```

### 5. Access the App
- **Frontend:** http://localhost:5173
- **API Gateway:** http://localhost:4000
- **RabbitMQ UI:** http://localhost:15672 (devuser/devpassword)

## 📁 Project Structure

```
├── backend/                    # Backend microservices
│   ├── api-gateway/           # REST API gateway (port 4000)
│   ├── tenant-service/        # Core tenant management (port 3001)
│   ├── credentials-service/   # API key generation
│   ├── db-provisioner-service/# Database provisioning
│   ├── dns-provisioner-service/# DNS configuration
│   ├── billing-service/       # Billing setup
│   └── notification-service/  # Email notifications
├── frontend/                  # React application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page components
│   │   └── lib/              # API layer & types
└── packages/                  # Shared code
    └── shared-types/         # TypeScript interfaces
```

## 🔧 Environment Variables

### Backend Services
```env
DATABASE_URL="postgresql://devuser:devpassword@localhost:5432/tenant_db"
RABBITMQ_URL="amqp://devuser:devpassword@localhost:5672"
```

### Frontend
```env
VITE_API_URL="http://localhost:4000"
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/tenants` | List all tenants |
| POST | `/tenants` | Create tenant |
| GET | `/tenants/:id` | Get tenant by ID |
| DELETE | `/tenants/:id` | Delete tenant |
| GET | `/tenants/:id/events` | Get tenant events |
| GET | `/events` | List all events |
| GET | `/settings` | Get user settings |
| PUT | `/settings` | Update settings |

## 🧪 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | NestJS, TypeScript, Prisma |
| Database | PostgreSQL |
| Message Queue | RabbitMQ |
| Cache | Redis |

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
