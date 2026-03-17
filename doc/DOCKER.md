# Docker Quickstart

Run Paperclip in Docker without installing Node or pnpm locally.

## One-liner (build + run)

```sh
docker build -t paperclip-local . && \
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

Open: `http://localhost:3100`

Data persistence:

- Embedded PostgreSQL data
- uploaded assets
- local secrets key
- local agent workspace data

The image also includes runtime tooling commonly required by coding agents:

- Docker CLI (`docker`)
- Playwright Chromium browser + system dependencies

All persisted under your bind mount (`./data/docker-paperclip` in the example above).

## Compose Quickstart

```sh
docker compose -f docker-compose.quickstart.yml up --build
```

Defaults:

- host port: `3100`
- persistent data dir: `./data/docker-paperclip`

Optional overrides:

```sh
PAPERCLIP_PORT=3200 PAPERCLIP_DATA_DIR=./data/pc docker compose -f docker-compose.quickstart.yml up --build
```

## Integrating With Insight Ory Stack (`*.app.local`)

When Paperclip runs in Docker and needs to call Insight auth infrastructure routed by Oathkeeper
(`auth.app.local`, `insight.app.local`, `api.insight.app.local`, `app.local`), the compose files
already include `extra_hosts` mappings to `host-gateway`.

Required behavior:

- Run the Insight Ory stack on the same Docker host (for example from
  `insight-ops/needs-update/docker-compose.yml`).
- Ensure Oathkeeper/Kratos ports are exposed on host as expected by Insight compose.
- Start Paperclip compose after Insight Ory services are healthy.

Example workflow:

```sh
# terminal 1: Insight Ory stack
cd /home/squad/skelr/gec/insight/insight-ops/needs-update
docker compose up -d

# terminal 2: Paperclip
cd /home/squad/squadhq/paperclip
docker compose up --build
```

Smoke check from Paperclip container:

```sh
docker compose exec server sh -lc 'getent hosts auth.app.local && curl -I http://auth.app.local/health/ready'
```

If your Docker engine does not support `host-gateway`, replace those `extra_hosts` entries with the
actual host bridge IP.

## Docker-in-Docker Socket Access (for E2E orchestration)

If your agents need to run Docker commands from inside the Paperclip container (for example, project-level end-to-end setup), mount the host Docker socket and pass its group id:

```sh
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
docker compose up --build
```

The default `docker-compose.yml` already mounts `/var/run/docker.sock` and applies `group_add` using `DOCKER_GID`.

If you change host port or use a non-local domain, set `PAPERCLIP_PUBLIC_URL` to the external URL you will use in browser/auth flows.

## Authenticated Compose (Single Public URL)

For authenticated deployments, set one canonical public URL and let Paperclip derive auth/callback defaults:

```yaml
services:
  paperclip:
    environment:
      PAPERCLIP_DEPLOYMENT_MODE: authenticated
      PAPERCLIP_DEPLOYMENT_EXPOSURE: private
      PAPERCLIP_PUBLIC_URL: https://desk.koker.net
```

`PAPERCLIP_PUBLIC_URL` is used as the primary source for:

- auth public base URL
- Better Auth base URL defaults
- bootstrap invite URL defaults
- hostname allowlist defaults (hostname extracted from URL)

Granular overrides remain available if needed (`PAPERCLIP_AUTH_PUBLIC_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `PAPERCLIP_ALLOWED_HOSTNAMES`).

Set `PAPERCLIP_ALLOWED_HOSTNAMES` explicitly only when you need additional hostnames beyond the public URL host (for example Tailscale/LAN aliases or multiple private hostnames).

## Claude + Codex Local Adapters in Docker

The image pre-installs:

- `claude` (Anthropic Claude Code CLI)
- `codex` (OpenAI Codex CLI)

If you want local adapter runs inside the container, pass API keys when starting the container:

```sh
docker run --name paperclip \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -e OPENAI_API_KEY=... \
  -e ANTHROPIC_API_KEY=... \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-local
```

Notes:

- Without API keys, the app still runs normally.
- Adapter environment checks in Paperclip will surface missing auth/CLI prerequisites.

## Onboard Smoke Test (Ubuntu + npm only)

Use this when you want to mimic a fresh machine that only has Ubuntu + npm and verify:

- `npx paperclipai onboard --yes` completes
- the server binds to `0.0.0.0:3100` so host access works
- onboard/run banners and startup logs are visible in your terminal

Build + run:

```sh
./scripts/docker-onboard-smoke.sh
```

Open: `http://localhost:3131` (default smoke host port)

Useful overrides:

```sh
HOST_PORT=3200 PAPERCLIPAI_VERSION=latest ./scripts/docker-onboard-smoke.sh
PAPERCLIP_DEPLOYMENT_MODE=authenticated PAPERCLIP_DEPLOYMENT_EXPOSURE=private ./scripts/docker-onboard-smoke.sh
```

Notes:

- Persistent data is mounted at `./data/docker-onboard-smoke` by default.
- Container runtime user id defaults to your local `id -u` so the mounted data dir stays writable while avoiding root runtime.
- Smoke script defaults to `authenticated/private` mode so `HOST=0.0.0.0` can be exposed to the host.
- Smoke script defaults host port to `3131` to avoid conflicts with local Paperclip on `3100`.
- Smoke script also defaults `PAPERCLIP_PUBLIC_URL` to `http://localhost:<HOST_PORT>` so bootstrap invite URLs and auth callbacks use the reachable host port instead of the container's internal `3100`.
- In authenticated mode, the smoke script defaults `SMOKE_AUTO_BOOTSTRAP=true` and drives the real bootstrap path automatically: it signs up a real user, runs `paperclipai auth bootstrap-ceo` inside the container to mint a real bootstrap invite, accepts that invite over HTTP, and verifies board session access.
- Run the script in the foreground to watch the onboarding flow; stop with `Ctrl+C` after validation.
- The image definition is in `Dockerfile.onboard-smoke`.
