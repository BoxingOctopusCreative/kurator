# Kurator — convenience entrypoints (delegates to api/Makefile).

COMPOSE_FILE := infra/docker-compose.yml
# Prefer Podman (workspace default); override: COMPOSE='docker compose' make infra-up
COMPOSE ?= podman compose

.PHONY: help infra-up infra-down infra-ps infra-logs \
	api-dev api-build api-build-macos api-build-linux api-build-all api-test api-clean web-test

help:
	@echo "Kurator — common targets:"
	@echo "  make infra-up         — start local deps (Postgres, Meili, Valkey, Swagger UI)"
	@echo "  make infra-down       — stop local deps"
	@echo "  make infra-ps         — show compose service status"
	@echo "  make infra-logs       — follow compose logs (optional: SVC=postgres)"
	@echo "  make api-dev          — live-reload API (Air) from api/"
	@echo "  make api-build        — build API for current OS/arch -> api/bin/kurator-api"
	@echo "  make api-build-macos  — API for this Mac (Intel or Apple Silicon)"
	@echo "  make api-build-linux  — API for Linux amd64 + arm64 (two binaries)"
	@echo "  make api-build-all    — API darwin amd64/arm64 + linux amd64/arm64"
	@echo "  make api-test / api-clean"
	@echo "  make web-test         — Vitest in web/ (UI unit tests)"
	@echo "See api/Makefile for individual platform targets."

infra-up:
	$(COMPOSE) -f $(COMPOSE_FILE) up -d

infra-down:
	$(COMPOSE) -f $(COMPOSE_FILE) down

infra-ps:
	$(COMPOSE) -f $(COMPOSE_FILE) ps

infra-logs:
	$(COMPOSE) -f $(COMPOSE_FILE) logs -f $(SVC)

api-dev:
	$(MAKE) -C api dev

api-build:
	$(MAKE) -C api build

api-build-macos:
	$(MAKE) -C api build-macos-native

api-build-linux:
	$(MAKE) -C api build-linux-amd64 build-linux-arm64

api-build-all:
	$(MAKE) -C api build-all

api-test:
	$(MAKE) -C api test

api-clean:
	$(MAKE) -C api clean

web-test:
	cd web && npm test
