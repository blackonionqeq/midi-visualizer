#!/usr/bin/env bash
# Deploy the built static site to the web server.
# Usage: ./scripts/deploy.sh
# Override target: DEPLOY_DIR=/path/to/webroot ./scripts/deploy.sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

# Configurable deploy target — override with DEPLOY_DIR=... if needed
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/midi-visualizer}"

echo "=== [1/3] Build production bundle ==="
pnpm build

echo "=== [2/3] Sync to ${DEPLOY_DIR} ==="
mkdir -p "$DEPLOY_DIR"
rsync -a --delete dist/ "$DEPLOY_DIR/"

echo "=== [3/3] Verify ==="
echo "Deployed files:"
ls -la "$DEPLOY_DIR/"
echo ""
echo "=== Deploy complete ==="
