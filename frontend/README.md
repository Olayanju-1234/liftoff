# Liftoff — Frontend

React + TypeScript dashboard for the Liftoff multi-tenant provisioning platform.

## Tech Stack

- **React 18** + **TypeScript** via Vite
- **Tailwind CSS** for styling
- **React Router v6** for client-side routing
- **Framer Motion** for animations
- **Axios** for API requests
- **react-hot-toast** for notifications
- **Lucide React** for icons
- **date-fns** for date formatting

## Pages

| Route | Page | Description |
|---|---|---|
| `/login` | Login | JWT authentication |
| `/register` | Register | New account creation |
| `/` | Dashboard | Overview — tenant stats, pipeline health |
| `/tenants` | Tenant Management | List, create, view tenant onboarding status |
| `/pipeline` | Pipeline | Live view of provisioning event flow |
| `/event-logs` | Event Logs | RabbitMQ event history per tenant |
| `/failed-jobs` | Failed Jobs | Dead-letter queue with retry support |
| `/health` | Health | Service health checks across all microservices |
| `/settings` | Settings | User profile and preferences |
| `/support` | Support | Help and documentation links |

## Getting Started

### Prerequisites

- Node.js 20+
- Liftoff API Gateway running (see `/backend/api-gateway`)

### Installation

```bash
# From the repo root
npm install

# Or from this directory
cd frontend && npm install
```

### Environment Variables

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Base URL of the API Gateway | `http://localhost:4000` |

### Running

```bash
# Development server (hot reload)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

The dev server runs on [http://localhost:5173](http://localhost:5173) by default.

## Project Structure

```
src/
├── pages/           # Route-level page components
│   ├── Dashboard.tsx
│   ├── TenantManagement.tsx
│   ├── Pipeline.tsx
│   ├── EventLogs.tsx
│   ├── FailedJobs.tsx
│   ├── Health.tsx
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Settings.tsx
│   └── Support.tsx
├── components/      # Shared UI components
│   ├── Layout.tsx
│   ├── ProtectedRoute.tsx
│   ├── CreateTenantModal.tsx
│   ├── TenantDetailModal.tsx
│   ├── ConfirmDialog.tsx
│   ├── PayloadModal.tsx
│   └── Toaster.tsx
├── lib/             # API client and utilities
├── assets/          # Static assets
├── App.tsx          # Router setup
└── main.tsx         # Entry point
```

## Authentication

The app uses JWT authentication. Tokens are stored in `localStorage` and attached to every request via an Axios interceptor. Unauthenticated requests redirect to `/login`.

## Connecting to the Backend

With the full docker-compose stack running:

```bash
# From repo root
docker compose up
```

The API Gateway is available at `http://localhost:4000`. Set `VITE_API_URL=http://localhost:4000` in your `.env`.

To run only the frontend against a deployed backend, set `VITE_API_URL` to your Render API Gateway URL.
