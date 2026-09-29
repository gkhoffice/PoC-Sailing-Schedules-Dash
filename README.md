# MSC Sailing Schedules

This repository contains the React/Vite schedule-search web app and its Node.js
API. Docker Compose runs both services without Replit. The web container serves
the frontend and proxies `/api` requests to the API container.

The application does not require a database or uploaded-file storage. The
schedule cache is a JSON file and is persisted in the `schedule-data` Docker
volume. On first startup, Docker initializes that volume from the bundled
schedule cache.

## Requirements

- Docker Engine
- Docker Compose v2 (`docker compose`)

## Configure environment variables

Create a local `.env` file from the example:

```sh
cp .env.example .env
```

Available settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_PORT` | `8080` | Host and container port for the web app |
| `API_PORT` | `8080` | API port on the private Compose network |
| `API_HOST` | `api` | API service hostname used by the web proxy |
| `LOG_LEVEL` | `info` | API log verbosity |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | empty | Optional Chromium binary override; empty uses the bundled Playwright browser |

No application secrets are required for the current features. Keep any local
`.env` file private and do not commit it.

## Build the Docker images

From the repository root:

```sh
docker compose build
```

The multi-stage Dockerfile builds the frontend assets and API, then uses an
Nginx image for the web runtime and the matching Playwright image for API-driven
carrier refreshes.

## Start the application

```sh
docker compose up -d
```

Open `http://localhost:8080` (or the port configured in `WEB_PORT`). On a Linux
VPS, allow that TCP port through the host firewall. The API is private to the
Compose network and is reached through the web app's `/api` proxy.

Check service status and health:

```sh
docker compose ps
```

## View logs

Follow logs from both services:

```sh
docker compose logs -f --tail=100
```

To follow only one service, use `docker compose logs -f web` or
`docker compose logs -f api`.

## Stop the application

```sh
docker compose down
```

This stops and removes the containers and network but keeps the schedule cache
volume. To also delete the persisted cache, run `docker compose down -v`.

## Update and rebuild

After updating the source code:

```sh
docker compose up -d --build
```

This rebuilds the images and replaces the running containers. The schedule
cache volume remains in place across rebuilds. To rebuild without starting:

```sh
docker compose build
```