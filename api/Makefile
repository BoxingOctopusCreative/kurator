# Kurator API — local Go builds (native + cross-compile for macOS / Linux).
# Run from this directory, or: make -C api <target>

BINARY_NAME     := kurator-api
CMD_PATH        := ./cmd/api
BETAKEYGEN_NAME := kurator-betakeygen
BETAKEYGEN_PATH := ./cmd/betakeygen
BIN_DIR         := bin

LDFLAGS := -s -w
GOFLAGS := -trimpath

.PHONY: help build clean test vet swagger betakeygen build-betakeygen \
	build-darwin-amd64 build-darwin-arm64 \
	build-linux-amd64 build-linux-arm64 \
	build-macos-native build-all

help:
	@echo "Kurator API — targets:"
	@echo "  Migrations: the API applies bundled SQL migrations on boot; use ./cmd/migrate for DATABASE_URL-only runs"
	@echo "  Config: env vars > CLI flags (-config, -database-url, …) > kurator.toml (see kurator.example.toml)"
	@echo "  build              — current OS/arch -> $(BIN_DIR)/$(BINARY_NAME)"
	@echo "  build-macos-native — macOS: auto amd64 (Intel) or arm64 (Apple Silicon)"
	@echo "  build-darwin-amd64 — macOS Intel"
	@echo "  build-darwin-arm64 — macOS Apple Silicon"
	@echo "  build-linux-amd64  — Linux x86_64"
	@echo "  build-linux-arm64  — Linux arm64 (e.g. AWS Graviton, Raspberry Pi 64-bit)"
	@echo "  build-all          — all four cross-compiled binaries under $(BIN_DIR)/"
	@echo "  test / vet / clean"
	@echo "  build-betakeygen — $(BIN_DIR)/$(BETAKEYGEN_NAME) (private beta key CLI)"
	@echo "  betakeygen       — go run betakeygen; pass flags: make betakeygen ARGS='-database-url \"...\"'"
	@echo "  swagger          — print OpenAPI doc location (Swagger UI runs via infra compose, not the API binary)"

swagger:
	@echo "OpenAPI 2.0 spec: docs/swagger.json"
	@echo "Swagger UI:       docker compose -f ../infra/docker-compose.yml up -d swagger-ui"
	@echo "                  then http://localhost:$${SWAGGER_UI_PORT:-8081} (mounts this swagger.json)"
	@echo "To regenerate from code annotations, install github.com/swaggo/swag and run:"
	@echo "  go run github.com/swaggo/swag/cmd/swag@latest init -g cmd/api/main.go -o docs --parseInternal --parseDependency"
	@echo "then merge generated paths into docs/swagger.json."

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

# Native binary for whatever machine runs `make` (dev iteration).
build: $(BIN_DIR)
	CGO_ENABLED=0 go build $(GOFLAGS) -ldflags="$(LDFLAGS)" -o $(BIN_DIR)/$(BINARY_NAME) $(CMD_PATH)

build-betakeygen: $(BIN_DIR)
	CGO_ENABLED=0 go build $(GOFLAGS) -ldflags="$(LDFLAGS)" -o $(BIN_DIR)/$(BETAKEYGEN_NAME) $(BETAKEYGEN_PATH)

# Example: make betakeygen ARGS='-config kurator.toml'
# Example: make betakeygen ARGS='-database-url postgres://kurator:kurator@localhost:5432/kurator?sslmode=disable'
betakeygen:
	go run $(BETAKEYGEN_PATH) $(ARGS)

# macOS: pick amd64 vs arm64 from uname (only meaningful when host is Darwin).
build-macos-native: $(BIN_DIR)
	@arch=$$(uname -m); \
	case "$$arch" in \
	  x86_64)  $(MAKE) build-darwin-amd64 ;; \
	  arm64)   $(MAKE) build-darwin-arm64 ;; \
	  *)       echo "Unsupported uname -m: $$arch"; exit 1 ;; \
	esac

build-darwin-amd64: $(BIN_DIR)
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build $(GOFLAGS) -ldflags="$(LDFLAGS)" \
	  -o $(BIN_DIR)/$(BINARY_NAME)-darwin-amd64 $(CMD_PATH)

build-darwin-arm64: $(BIN_DIR)
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build $(GOFLAGS) -ldflags="$(LDFLAGS)" \
	  -o $(BIN_DIR)/$(BINARY_NAME)-darwin-arm64 $(CMD_PATH)

build-linux-amd64: $(BIN_DIR)
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build $(GOFLAGS) -ldflags="$(LDFLAGS)" \
	  -o $(BIN_DIR)/$(BINARY_NAME)-linux-amd64 $(CMD_PATH)

build-linux-arm64: $(BIN_DIR)
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build $(GOFLAGS) -ldflags="$(LDFLAGS)" \
	  -o $(BIN_DIR)/$(BINARY_NAME)-linux-arm64 $(CMD_PATH)

build-all: build-darwin-amd64 build-darwin-arm64 build-linux-amd64 build-linux-arm64

test:
	go test ./...

vet:
	go vet ./...

clean:
	rm -rf $(BIN_DIR)
