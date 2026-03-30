# server/Dockerfile
# ============================================
# LifeSync Backend — Node.js Production Image
# Multi-stage: install deps → run
# ============================================

FROM node:20-alpine AS base
WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy server source
COPY server/ ./server/
COPY .env.example ./.env.example

# Create non-root user
RUN addgroup -g 1001 -S lifesync && \
    adduser -S lifesync -u 1001 -G lifesync && \
    chown -R lifesync:lifesync /app

USER lifesync

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "server/app.js"]
