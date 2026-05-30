# =============================================================================
# Stage 1: Base & Dependencies
# =============================================================================
FROM node:20-alpine AS base
WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++ openssl wget
RUN npm install -g pnpm

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 appuser

COPY package.json pnpm-lock.yaml ./
COPY nx.json tsconfig.base.json ./

COPY apps/api-gateway/project.json ./apps/api-gateway/
COPY apps/auth-service/project.json ./apps/auth-service/
COPY apps/chat-service/project.json ./apps/chat-service/
COPY apps/notification-service/project.json ./apps/notification-service/
COPY apps/user-service/project.json ./apps/user-service/
COPY apps/frontend/project.json ./apps/frontend/
COPY libs/kafka-events/project.json ./libs/kafka-events/

COPY apps/auth-service/prisma/schema.prisma ./apps/auth-service/prisma/schema.prisma
COPY apps/user-service/prisma/schema.prisma ./apps/user-service/prisma/schema.prisma
COPY libs/shared-exceptions/project.json ./libs/shared-exceptions/
COPY libs/shared-logger/project.json ./libs/shared-logger/
COPY libs/shared-types/project.json ./libs/shared-types/
COPY libs/shared-utils/project.json ./libs/shared-utils/
COPY libs/shared-validation/project.json ./libs/shared-validation/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set node-linker hoisted && \
    pnpm install --frozen-lockfile

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM base AS builder
COPY . .

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

RUN if [ -f "apps/${APP_NAME}/prisma/schema.prisma" ]; then \
      AUTH_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
      USER_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
      pnpm prisma generate --config=apps/${APP_NAME}/prisma.config.ts; \
    fi

RUN --mount=type=cache,id=nx,target=/app/.nx/cache \
    pnpm nx build ${APP_NAME} --configuration=production

RUN mkdir -p /app/prisma-deploy && \
    if [ -f "apps/${APP_NAME}/prisma/schema.prisma" ]; then \
      cp -r apps/${APP_NAME}/prisma /app/prisma-deploy/prisma; \
      cp apps/${APP_NAME}/prisma.config.ts /app/prisma-deploy/prisma.config.ts 2>/dev/null || true; \
    fi

# =============================================================================
# Stage 3: Pruner — deploy only this service's production deps via pnpm workspaces
# =============================================================================
FROM base AS pruner

ARG APP_NAME

# Full source needed so pnpm can resolve the workspace graph
COPY . .

# pnpm v10 requires inject-workspace-packages for deploy; set it only here
# so the base stage frozen-lockfile install is unaffected
RUN echo "inject-workspace-packages=true" >> .npmrc

# Deploy only the production deps declared in apps/${APP_NAME}/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --filter=${APP_NAME} --prod /app/pruned

# If this service has a Prisma schema, generate the client and copy it into
# the pruned node_modules (generated output is not an npm package so pnpm
# deploy does not include it automatically)
RUN if [ -f "apps/${APP_NAME}/prisma/schema.prisma" ]; then \
      AUTH_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
      USER_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
      node_modules/.bin/prisma generate --config=apps/${APP_NAME}/prisma.config.ts && \
      for d in node_modules/@prisma/client-*; do \
        [ -d "$d" ] && cp -r "$d" /app/pruned/node_modules/@prisma/ || true; \
      done; \
    fi

# =============================================================================
# Stage 4: Runtime
# =============================================================================
FROM node:20-alpine AS runtime

RUN apk add --no-cache libc6-compat openssl wget

WORKDIR /app

ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 appuser

# Copy built output
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist

# Copy service-specific pruned node_modules (only production deps for this service)
COPY --from=pruner --chown=appuser:nodejs /app/pruned/node_modules ./node_modules

# Copy prisma files
COPY --from=builder --chown=appuser:nodejs /app/prisma-deploy /app/apps/${APP_NAME}/

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "\
  if [ -f \"/app/apps/${APP_NAME}/prisma/schema.prisma\" ]; then \
    node_modules/.bin/prisma migrate deploy --config=/app/apps/${APP_NAME}/prisma.config.ts; \
  fi && \
  node dist/apps/${APP_NAME}/src/main.js \
"]