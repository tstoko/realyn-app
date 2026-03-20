#!/bin/bash

# Run Stripe-related tests
# Usage: ./scripts/run-stripe-tests.sh

set -e

echo "Running Stripe integration tests..."
echo ""

cd "$(dirname "$0")/../functions" || exit 1

echo "Running Stripe webhook integration tests..."
npm test -- stripeWebhook.integration.test.ts

echo ""
echo "Running Stripe integration tests..."
npm test -- stripeIntegration.test.ts

echo ""
echo "All Stripe tests completed!"



