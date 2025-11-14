FROM node:18-alpine AS builder

WORKDIR /usr/src/app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

ARG APP_NAME

RUN pnpm --filter ${APP_NAME} run build

FROM node:18-alpine

WORKDIR /usr/src/app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml ./

ARG APP_NAME
COPY apps/${APP_NAME}/package.json ./apps/${APP_NAME}/

COPY packages/shared-types/package.json ./packages/shared-types/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /usr/src/app/apps/${APP_NAME}/dist ./apps/${APP_NAME}/dist

COPY --from=builder /usr/src/app/packages/shared-types/dist ./packages/shared-types/dist

CMD node apps/${APP_NAME}/dist/main
