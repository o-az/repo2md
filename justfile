set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

dev port="6969":
    bun run dev --port {{ port }}

build:
    bun run build

check:
    bun check && bun check:types
    just --fmt --unstable
    shfmt --write --apply-ignore **/*.sh

deploy:
    bun run deploy

# Run e2e checks against a running server
test-e2e base_url="http://localhost:6969":
    ./scripts/checks.sh {{ base_url }}

# Start dev server, run checks, then stop
dev-test port="6969":
    #!/usr/bin/env bash
    set -euo pipefail
    BASE_URL="http://localhost:{{ port }}"
    cleanup() {
      if [[ -n "${DEV_PID:-}" ]]; then
        kill "$DEV_PID" 2>/dev/null || true
      fi
    }
    trap cleanup EXIT
    echo "Starting dev server on port {{ port }}..."
    bun run dev --port {{ port }} &
    DEV_PID=$!
    echo "Waiting for server to be ready..."
    for i in {1..30}; do
      if curl -s "$BASE_URL/ping" >/dev/null 2>&1; then
        echo "Server ready!"
        break
      fi
      if [[ $i -eq 30 ]]; then
        echo "Server failed to start"
        exit 1
      fi
      sleep 1
    done
    echo ""
    ./scripts/checks.sh "$BASE_URL"
