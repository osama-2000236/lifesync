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

# Health check — node:alpine has no wget/curl by default; use Node itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "server/app.js"]
