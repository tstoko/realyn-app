#!/usr/bin/env bash
# ============================================================
# test-pipeline.sh
# Runs the full CI pipeline locally (build + test, no deploy).
#
# This mirrors what .github/workflows/firebase-hosting-merge.yml
# does before the deploy steps:
#   1. Install & build frontend
#   2. Install & build functions
#   3. Run functions tests
#
# Usage:
#   ./scripts/test-pipeline.sh            # full pipeline
#   ./scripts/test-pipeline.sh --skip-fe  # skip frontend build
#
# Environment variables (optional):
#   ENCRYPTION_KEY       – passed to functions tests (required by
#                          encryption.test.ts). Falls back to a
#                          default test key if not set.
#   CI                   – set to "true" to use npm ci instead of
#                          npm install (the default in this script).
# ============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKIP_FRONTEND=false

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --skip-fe|--skip-frontend) SKIP_FRONTEND=true ;;
    -h|--help)
      echo "Usage: $0 [--skip-fe]"
      echo ""
      echo "Runs the full CI pipeline locally (build + test, no deploy)."
      echo ""
      echo "Options:"
      echo "  --skip-fe   Skip the frontend install & build step"
      echo "  -h, --help  Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# Provide a safe default encryption key for tests so developers
# don't have to look it up every time.
if [ -z "${ENCRYPTION_KEY:-}" ]; then
  export ENCRYPTION_KEY="test-encryption-key-32chars!!"
  echo "ℹ  ENCRYPTION_KEY not set – using default test key"
fi

PASS=0
FAIL=0

step() {
  echo ""
  echo "=========================================="
  echo "  $1"
  echo "=========================================="
}

# ----------------------------------------------------------
# 1. Frontend
# ----------------------------------------------------------
if [ "$SKIP_FRONTEND" = false ]; then
  step "1/3  Installing frontend dependencies"
  cd "$ROOT_DIR"
  npm ci

  step "2/3  Building frontend"
  npm run build
else
  step "1/3  Skipping frontend (--skip-fe)"
  step "2/3  Skipping frontend build"
fi

# ----------------------------------------------------------
# 2. Functions – build
# ----------------------------------------------------------
step "3a/3  Installing functions dependencies"
cd "$ROOT_DIR/functions"
npm ci

echo ""
echo "--- Building functions ---"
npm run build

# ----------------------------------------------------------
# 3. Functions – test
# ----------------------------------------------------------
step "3b/3  Running functions tests"
cd "$ROOT_DIR/functions"
if npm test; then
  PASS=1
else
  FAIL=1
fi

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
echo ""
echo "=========================================="
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅  Pipeline passed"
else
  echo "  ❌  Pipeline failed"
fi
echo "=========================================="

exit "$FAIL"
