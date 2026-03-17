FROM node:lts-trixie-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/
COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/copilot-local/package.json packages/adapters/copilot-local/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/gemini-local/package.json packages/adapters/gemini-local/
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/

RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @paperclipai/ui build
RUN pnpm --filter @paperclipai/server build
RUN test -f server/dist/index.js || (echo "ERROR: server build output missing" && exit 1)

FROM base AS production
WORKDIR /app
COPY --chown=node:node --from=build /app /app
RUN npm install --global --omit=dev @anthropic-ai/claude-code@latest @openai/codex@latest opencode-ai @github/copilot \
  && npx -y playwright@1.58.2 install --with-deps chromium \
  && apt-get update \
  && apt-get install -y --no-install-recommends tar \
  && arch="$(dpkg --print-architecture)" \
  && case "$arch" in \
    amd64) compose_arch="x86_64"; docker_arch="x86_64" ;; \
    arm64) compose_arch="aarch64"; docker_arch="aarch64" ;; \
    *) echo "Unsupported architecture for Docker Compose: $arch" && exit 1 ;; \
  esac \
  && docker_tgz="$(curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/" | grep -o 'docker-[0-9][^" ]*\.tgz' | sort -Vu | tail -n1)" \
  && [ -n "$docker_tgz" ] \
  && curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/${docker_tgz}" -o /tmp/docker.tgz \
  && tar -xzf /tmp/docker.tgz -C /tmp \
  && install -m 0755 /tmp/docker/docker /usr/local/bin/docker \
  && rm -rf /tmp/docker /tmp/docker.tgz \
  && mkdir -p /usr/local/lib/docker/cli-plugins \
  && curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-${compose_arch}" -o /usr/local/lib/docker/cli-plugins/docker-compose \
  && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose \
  && ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose \
  && docker --version \
  && /usr/local/lib/docker/cli-plugins/docker-compose version \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /ms-playwright \
  && cp -R /root/.cache/ms-playwright/. /ms-playwright/ \
  && chown -R node:node /ms-playwright \
  && mkdir -p /paperclip \
  && chown node:node /paperclip

ENV NODE_ENV=production \
  HOME=/paperclip \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=private

VOLUME ["/paperclip"]
EXPOSE 3100

USER node
CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
