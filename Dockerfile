# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS workspace

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Copy manifests first so dependency installation can be cached across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY artifacts/msc-schedules/package.json ./artifacts/msc-schedules/package.json
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY lib/api-spec/package.json ./lib/api-spec/package.json
COPY lib/api-zod/package.json ./lib/api-zod/package.json
COPY lib/db/package.json ./lib/db/package.json
COPY scripts/package.json ./scripts/package.json
COPY tsconfig.base.json tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY . .

FROM workspace AS api-build
RUN pnpm --filter @workspace/api-server run build \
  && pnpm --filter @workspace/api-server deploy --legacy --prod /out/api-server

FROM mcr.microsoft.com/playwright:v1.63.0-noble AS api

ENV NODE_ENV=production \
    PORT=8080 \
    LOG_LEVEL=info \
    SCHEDULE_CACHE_PATH=/app/data/msc-schedules.json
WORKDIR /app

COPY --chown=pwuser:pwuser --from=api-build /out/api-server/ ./

USER pwuser
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

FROM workspace AS web-build
ENV NODE_ENV=production \
    PORT=8080 \
    BASE_PATH=/
RUN pnpm --filter @workspace/msc-schedules run build

FROM nginx:stable-alpine AS web

ENV PORT=8080 \
    API_HOST=api \
    API_PORT=8080 \
    NGINX_ENVSUBST_FILTER="^(PORT|API_HOST|API_PORT)$"
COPY --from=web-build /workspace/artifacts/msc-schedules/dist/public/ /usr/share/nginx/html/
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080