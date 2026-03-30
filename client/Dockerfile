# client/Dockerfile
# ============================================
# LifeSync Frontend — Multi-stage Build
# Stage 1: Vite build
# Stage 2: Nginx serving
# ============================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build-time environment variables
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# --- Stage 2: Serve with Nginx ---
FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Custom Nginx config with API reverse proxy
COPY nginx.conf /etc/nginx/conf.d/lifesync.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Security headers via Nginx
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
