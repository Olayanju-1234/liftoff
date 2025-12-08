# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy workspace package.json files
COPY packages/shared-types/package.json ./packages/shared-types/
COPY backend/api-gateway/package.json ./backend/api-gateway/
COPY backend/tenant-service/package.json ./backend/tenant-service/
COPY backend/db-provisioner-service/package.json ./backend/db-provisioner-service/
COPY backend/dns-provisioner-service/package.json ./backend/dns-provisioner-service/
COPY backend/credentials-service/package.json ./backend/credentials-service/
COPY backend/billing-service/package.json ./backend/billing-service/
COPY backend/notification-service/package.json ./backend/notification-service/

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the service
RUN npm run build --workspace=notification-service

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /usr/src/app

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY backend/notification-service/package.json ./backend/notification-service/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=notification-service --workspace=shared-types && \
    npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /usr/src/app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /usr/src/app/backend/notification-service/dist ./backend/notification-service/dist

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /usr/src/app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3006/health || exit 1

# Start the application
CMD ["node", "backend/notification-service/dist/main"]