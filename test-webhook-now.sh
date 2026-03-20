#!/bin/bash

# Test Stripe webhook integration now
set -e

WEBHOOK_URL="https://stripewebhook-cltbxmmndq-uc.a.run.app"

echo "=========================================="
echo "Testing Stripe Webhook Integration"
echo "=========================================="
echo ""

# Check Stripe CLI
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI not found"
    exit 1
fi

if ! stripe config --list &> /dev/null; then
    echo "❌ Not logged in to Stripe CLI. Run: stripe login"
    exit 1
fi

echo "✅ Stripe CLI ready"
echo ""

echo "Step 1: Starting webhook forwarding..."
echo "--------------------------------------"
echo "Starting 'stripe listen' in background..."
echo ""

# Start stripe listen in background and capture the webhook secret
stripe listen --forward-to "$WEBHOOK_URL" > /tmp/stripe_listen.log 2>&1 &
STRIPE_PID=$!

# Wait a bit for it to start
sleep 3

# Extract webhook secret from output
WEBHOOK_SECRET=$(grep -m 1 "whsec_" /tmp/stripe_listen.log 2>/dev/null | grep -o "whsec_[^ ]*" | head -1 || echo "")

if [ -z "$WEBHOOK_SECRET" ]; then
    echo "⚠️  Could not extract webhook secret automatically"
    echo "Please check /tmp/stripe_listen.log for the webhook secret"
    echo "It should look like: whsec_..."
    echo ""
    read -p "Enter the webhook secret from 'stripe listen' output: " WEBHOOK_SECRET
fi

echo "Webhook Secret: ${WEBHOOK_SECRET:0:20}..."
echo ""

echo "Step 2: Triggering test event..."
echo "--------------------------------"
echo "Triggering charge.dispute.created event..."
stripe trigger charge.dispute.created

echo ""
echo "Step 3: Waiting for webhook to process..."
sleep 2

echo ""
echo "Step 4: Checking function logs..."
echo "----------------------------------"
echo "Recent webhook logs:"
firebase functions:log --only stripeWebhook 2>/dev/null | tail -20 || echo "No logs found"

echo ""
echo "Step 5: Cleanup..."
kill $STRIPE_PID 2>/dev/null || true

echo ""
echo "=========================================="
echo "Test Complete!"
echo "=========================================="
echo ""
echo "Check the logs above for:"
echo "  ✅ 'Signature verified! Organization: ...' - SUCCESS"
echo "  ❌ 'Could not verify webhook signature' - FAILURE"
echo ""
echo "If you see failures, check:"
echo "  1. Organization has status: 'connected'"
echo "  2. Organization has webhookSecret configured"
echo "  3. Organization has either secretKey OR accessToken"
echo "  4. Webhook secret matches the one from 'stripe listen'"
echo ""



