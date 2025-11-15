# --- Stage 1: Builder ---
# This stage builds the application
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# This is a variable that Render will pass in (e.g., "api-gateway")
ARG APP_NAME

# Copy all package.json and lock files first to leverage caching
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY apps/tenant-service/package.json ./apps/tenant-service/
COPY apps/db-provisioner-service/package.json ./apps/db-provisioner-service/
COPY apps/dns-provisioner-service/package.json ./apps/dns-provisioner-service/
COPY apps/credentials-service/package.json ./apps/credentials-service/
COPY apps/billing-service/package.json ./apps/billing-service/
COPY apps/notification-service/package.json ./apps/notification-service/

# Install all monorepo dependencies (including dev)
RUN npm install

# Copy the full source code
COPY . .

# Build the specific app (using the correct workspace name)
RUN npm run build --workspace=${APP_NAME}

# --- Stage 2: Production ---
# This stage creates the final, lightweight image
FROM node:18-alpine

WORKDIR /usr/src/app

ARG APP_NAME

# Copy production package.json files
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/${APP_NAME}/package.json ./apps/${APP_NAME}/

# Install *only* production dependencies for the target app and its shared deps
RUN npm install --omit=dev --workspaces --filter=${APP_NAME}...

# Copy the built 'dist' folders from the 'builder' stage
COPY --from=builder /usr/src/app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /usr/src/app/apps/${APP_NAME}/dist ./apps/${APP_NAME}/dist

# Set the command to run the application
CMD node apps/${APP_NAME}/dist/main