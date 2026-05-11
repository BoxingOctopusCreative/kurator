# Kurator — convenience entrypoints (delegates to api/Makefile).

.PHONY: help api-build api-build-macos api-build-linux api-build-all api-test api-clean web-test \
	api-build-betakeygen api-betakeygen

help:
	@echo "Kurator — common targets:"
	@echo "  make api-build        — build API for current OS/arch -> api/bin/kurator-api"
	@echo "  make api-build-macos  — API for this Mac (Intel or Apple Silicon)"
	@echo "  make api-build-linux  — API for Linux amd64 + arm64 (two binaries)"
	@echo "  make api-build-all    — API darwin amd64/arm64 + linux amd64/arm64"
	@echo "  make api-test / api-clean"
	@echo "  make api-build-betakeygen — build private beta key CLI -> api/bin/kurator-betakeygen"
	@echo "  make api-betakeygen ARGS='-c api/kurator.toml' — go run betakeygen (prints key to stdout)"
	@echo "  make web-test         — Vitest in web/ (UI unit tests)"
	@echo "See api/Makefile for individual platform targets."

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

api-build-betakeygen:
	$(MAKE) -C api build-betakeygen

api-betakeygen:
	$(MAKE) -C api betakeygen

web-test:
	cd web && npm test
