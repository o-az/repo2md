#!/usr/bin/env bash
# 
set -euo pipefail

BASE_URL="${1:-http://localhost:6969}"
FAILED=0

# Wait for server to be responsive before the next heavy request
wait_ready() {
  for i in {1..10}; do
    if curl -gs --max-time 2 "$BASE_URL/ping" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
}

check() {
  local name="$1"
  local path="$2"
  local expect_redirect="${3:-}"

  printf "%-60s " "$name"
  
  if [[ -n "$expect_redirect" ]]; then
    location=$(curl -gs --max-time 10 -o /dev/null -w '%{redirect_url}' -H 'User-Agent: Mozilla/5.0' "$BASE_URL/$path")
    if [[ "$location" == *"$expect_redirect"* ]]; then
      echo "✓ -> $expect_redirect"
    else
      echo "✗ expected '$expect_redirect', got: $location"
      FAILED=1
    fi
  else
    status=$(curl -gs --max-time 10 -o /dev/null -w '%{http_code}' "$BASE_URL/$path")
    if [[ "$status" == "200" ]]; then
      echo "✓ (200)"
    else
      echo "✗ (status: $status)"
      FAILED=1
    fi
  fi
}

check_content() {
  local name="$1"
  local path="$2"
  local expect_contains="$3"
  local timeout="${4:-60}"
  local tmpfile="$(mktemp)"

  printf "%-60s " "$name"
  
  curl -gsL --max-time "$timeout" "$BASE_URL/$path" > "$tmpfile" 2>/dev/null || true
  if grep -qF "$expect_contains" "$tmpfile"; then
    echo "✓ (contains '$expect_contains')"
  else
    local bytes
    bytes=$(wc -c < "$tmpfile")
    local first_line
    first_line=$(head -1 "$tmpfile")
    echo "✗ expected to contain '$expect_contains' (got ${bytes} bytes, first line: '${first_line}')"
    FAILED=1
  fi
  rm -f "$tmpfile"
}

check_submodule() {
  local name="$1"
  local path="$2"
  local expect_contains="$3"
  local tmpfile="$(mktemp)"

  printf "%-60s " "$name"
  
  curl -gsL --max-time 120 "$BASE_URL/$path" > "$tmpfile" 2>/dev/null
  if grep -qF "$expect_contains" "$tmpfile"; then
    echo "✓ (contains '$expect_contains')"
  else
    echo "✗ expected to contain '$expect_contains'"
    FAILED=1
  fi
  rm -f "$tmpfile"
}

echo "=== Utility endpoints ==="
check "Ping" "ping"
check "Root page" ""

echo ""
echo "=== Basic redirects ==="
check "Whole repo (no https)" \
  "github.com/o-az/2md" \
  "gh_o-az_2md@main.md"

check "Whole repo (with https)" \
  "https://github.com/o-az/2md" \
  "gh_o-az_2md@main.md"

check "Directory (tree/main)" \
  "github.com/o-az/2md/tree/main/src" \
  "gh_o-az_2md@main_src.md"

check "Directory shorthand (no tree)" \
  "github.com/o-az/2md/src" \
  "gh_o-az_2md@main_src.md"

check "Repo with hyphen in owner/name" \
  "github.com/o-az/2md" \
  "gh_o-az_2md@main.md"

echo ""
echo "=== Clean path format ==="
check "Clean path (repo)" \
  "gh_o-az_2md@main.md"

check "Clean path (directory)" \
  "gh_o-az_2md@main_src.md"

check "Clean path (file)" \
  "ghf_o-az_2md@main_justfile.md"

check "Clean path with tag" \
  "gh_honojs_hono@v4.0.0_src.md"

echo ""
echo "=== File handling ==="
check "Single file (blob)" \
  "github.com/o-az/2md/blob/main/justfile" \
  "ghf_o-az_2md@main_justfile.md"

check_content "File shorthand (justfile)" \
  "github.com/o-az/2md/justfile" \
  "just --list"

check_content "File shorthand (with extension)" \
  "github.com/o-az/2md/biome.json" \
  "biomejs"

check_content "File in subdirectory" \
  "github.com/o-az/2md/src/index.ts" \
  "Hono"

echo ""
echo "=== Edge cases ==="
check_content "Directory with dot in name" \
  "github.com/o-az/2md/tree/main/.github" \
  ".github"

check_content "File with multiple dots" \
  "github.com/o-az/2md/.env.example" \
  "NODE_ENV"

echo ""
echo "=== Include/Exclude filters ==="
check_content "Exclude single pattern" \
  "github.com/o-az/2md?exclude=.ts" \
  "justfile"

check_content "Exclude brace syntax" \
  "github.com/o-az/2md?exclude={.ts,.tsx}" \
  "biome.json"

check_content "Include single pattern" \
  "github.com/o-az/2md?include=.json" \
  "package.json"

check_content "Include brace syntax" \
  "github.com/o-az/2md?include={.json,.toml}" \
  "biome.json"

check_content "Include directory" \
  "github.com/o-az/2md?include=src/" \
  "src/index.ts"

check_content "Include then exclude" \
  "github.com/o-az/2md?include=src/&exclude=landing" \
  "src/index.ts"

check_content "Multiple exclude params" \
  "github.com/o-az/2md?exclude=.ts&exclude=.json" \
  "justfile"

check_content "Glob pattern exclude" \
  "github.com/o-az/2md/src?exclude=*.test.*" \
  "index.ts"

check_content "Clean path with exclude" \
  "gh_o-az_2md@main.md?exclude=.ts" \
  "justfile"

check_content "Clean path with include" \
  "gh_o-az_2md@main_src.md?include=.tsx" \
  "landing.tsx"

echo ""
echo "=== External repos (heavy) ==="
# These fetch large repos from GitHub — run sequentially with
# pauses between each to avoid saturating the dev server.

check "Branch redirect (honojs)" \
  "github.com/honojs/hono/tree/main/src" \
  "gh_honojs_hono@main_src.md"

check "Tag redirect (honojs)" \
  "github.com/honojs/hono/tree/v4.0.0/src" \
  "gh_honojs_hono@v4.0.0_src.md"

sleep 2 && wait_ready
check_content "Tag returns different content than main" \
  "github.com/honojs/hono/tree/v4.0.0/src" \
  "honojs/hono@v4.0.0" 120

echo ""
echo "=== Submodules support (heavy) ==="

sleep 2 && wait_ready
check_content "No submodules param = no submodule content" \
  "github.com/transmissions11/solmate" \
  "solmate" 120

sleep 2 && wait_ready
check_content "Submodules param on repo with submodules" \
  "github.com/foundry-rs/forge-std?submodules=true" \
  "forge-std" 120

sleep 2 && wait_ready
check_submodule "Submodules param returns submodule content" \
  "github.com/transmissions11/solmate?submodules=true" \
  "# Submodule: lib/ds-test"

sleep 2 && wait_ready
check_submodule "Clean path with submodules" \
  "gh_transmissions11_solmate@main.md?submodules=true" \
  "# Submodule: lib/ds-test"

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "✓ All checks passed!"
else
  echo "✗ Some checks failed"
  exit 1
fi
