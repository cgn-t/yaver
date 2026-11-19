# =====================================================================
# Yaver — tek imaj, tek konteyner: React arayüz + Node API + gömülü veritabanı (PGlite)
# Ayrı veritabanı sunucusu yok; veriler /data klasöründe dosya olarak durur (k8s'te PVC). Bkz. deploy/k8s/yaver.yaml
# =====================================================================

# ---- 1) Arayüz derleme ----
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2) Sunucu bağımlılıkları ----
FROM node:22-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- 3) Çalışma imajı ----
FROM node:22-alpine
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="Yaver" org.opencontainers.image.version="${APP_VERSION}"
ENV NODE_ENV=production PORT=8080 APP_VERSION=${APP_VERSION} \
    STATIC_DIR=/app/frontend/dist SQL_DIR=/app/db/postgres DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/server/node_modules server/node_modules
COPY server/package.json server/
COPY server/src server/src
COPY db/postgres db/postgres
COPY --from=web /src/frontend/dist frontend/dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/src/index.js"]
