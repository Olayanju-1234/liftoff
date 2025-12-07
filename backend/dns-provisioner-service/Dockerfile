FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY apps/tenant-service/package.json ./apps/tenant-service/
COPY apps/db-provisioner-service/package.json ./apps/db-provisioner-service/
COPY apps/dns-provisioner-service/package.json ./apps/dns-provisioner-service/
COPY apps/credentials-service/package.json ./apps/credentials-service/
COPY apps/billing-service/package.json ./apps/billing-service/
COPY apps/notification-service/package.json ./apps/notification-service/
RUN npm install
COPY . .
RUN npm run build --workspace=dns-provisioner-service
FROM node:18-alpine
WORKDIR /usr/src/app
ARG APP_NAME="dns-provisioner-service"
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/${APP_NAME}/package.json ./apps/${APP_NAME}/
RUN npm install --omit=dev --workspaces --filter=${APP_NAME}...
COPY --from=builder /usr/src/app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /usr/src/app/apps/${APP_NAME}/dist ./apps/${APP_NAME}/dist
CMD node apps/dns-provisioner-service/dist/main