# =============================================================================
# Stage 1: Base & Dependencies
# =============================================================================
FROM node:20-alpine AS base
WORKDIR /app

# ✅ Install build essentials for native modules (like css-inline, bcrypt, prisma)
RUN apk add --no-cache libc6-compat python3 make g++ openssl wget

RUN npm install -g pnpm

# ✅ Create user in base so it's cached across all services
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 appuser

# Copy manifests first
COPY package.json pnpm-lock.yaml ./
COPY nx.json tsconfig.base.json ./

# Copy project files for dependency resolution
COPY apps/api-gateway/project.json ./apps/api-gateway/
COPY apps/auth-service/project.json ./apps/auth-service/
COPY apps/chat-service/project.json ./apps/chat-service/
COPY apps/message-service/project.json ./apps/message-service/
COPY apps/notification-service/project.json ./apps/notification-service/
COPY apps/user-service/project.json ./apps/user-service/
COPY apps/frontend/project.json ./apps/frontend/
COPY libs/kafka-events/project.json ./libs/kafka-events/

# Copy Prisma schemas for initial generation/resolution
COPY apps/auth-service/prisma/schema.prisma ./apps/auth-service/prisma/schema.prisma
COPY apps/user-service/prisma/schema.prisma ./apps/user-service/prisma/schema.prisma
COPY libs/shared-exceptions/project.json ./libs/shared-exceptions/
COPY libs/shared-logger/project.json ./libs/shared-logger/
COPY libs/shared-types/project.json ./libs/shared-types/
COPY libs/shared-utils/project.json ./libs/shared-utils/
COPY libs/shared-validation/project.json ./libs/shared-validation/

# Use cache mount for pnpm store to speed up install
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

# ✅ prisma generate
RUN if [ -f "apps/${APP_NAME}/prisma/schema.prisma" ]; then \
      AUTH_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
      USER_DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
      pnpm prisma generate --config=apps/${APP_NAME}/prisma.config.ts; \
    fi

# Use cache mount for Nx to speed up builds
RUN --mount=type=cache,id=nx,target=/app/.nx/cache \
    pnpm nx build ${APP_NAME} --configuration=production

# Collect prisma schema for runtime migrations
RUN mkdir -p /app/prisma-deploy && \
    if [ -f "apps/${APP_NAME}/prisma/schema.prisma" ]; then \
      cp -r apps/${APP_NAME}/prisma /app/prisma-deploy/prisma; \
      cp apps/${APP_NAME}/prisma.config.ts /app/prisma-deploy/prisma.config.ts 2>/dev/null || true; \
    fi

# =============================================================================
# Stage 3: Runtime
# =============================================================================
FROM node:20-alpine AS runtime

RUN apk add --no-cache libc6-compat openssl wget

WORKDIR /app

ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production

# ✅ Create user early
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 appuser

# ✅ Use COPY --chown instead of slow RUN chown -R
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/prisma-deploy /app/apps/${APP_NAME}/

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "\
  if [ -f \"/app/apps/${APP_NAME}/prisma/schema.prisma\" ]; then \
    node_modules/.bin/prisma migrate deploy --config=/app/apps/${APP_NAME}/prisma.config.ts; \
  fi && \
  node dist/apps/${APP_NAME}/src/main.js \
"]
