#!/bin/bash

# Run Stripe CLI webhook test
# This script will:
# 1. Start webhook forwarding and capture the webhook secret
# 2. Configure test organization (requires your Stripe secret key)
# 3. Trigger test events
# 4. Verify results

set -e

WEBHOOK_URL="https://stripewebhook-cltbxmmndq-uc.a.run.app"
ORG_ID="test_stripe_org"

echo "=========================================="
echo "Stripe CLI Webhook Test"
echo "=========================================="
echo ""
echo "Webhook URL: $WEBHOOK_URL"
echo "Organization ID: $ORG_ID"
echo ""

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI not found. Please install it first."
    exit 1
fi

# Check if logged in
if ! stripe config --list &> /dev/null; then
    echo "❌ Not logged in to Stripe CLI. Run: stripe login"
    exit 1
fi

echo "✅ Stripe CLI is ready"
echo ""

# Get Stripe secret key
echo "Step 1: Enter your Stripe test secret key"
echo "------------------------------------------"
read -p "Stripe Secret Key (sk_test_... or rk_test_...): " STRIPE_SECRET_KEY

if [[ ! $STRIPE_SECRET_KEY =~ ^(sk_test_|rk_test_) ]]; then
    echo "⚠️  Warning: Secret key should start with sk_test_ or rk_test_"
    read -p "Continue anyway? (y/n): " CONTINUE
    if [[ $CONTINUE != "y" ]]; then
        exit 1
    fi
fi

# Test connection first
echo ""
echo "Step 2: Testing Stripe connection..."
echo "------------------------------------"
CONNECTION_TEST=$(curl -s -X POST https://us-central1-realyn-app.cloudfunctions.net/testStripeConnection \
  -H "Content-Type: application/json" \
  -d "{\"secretKey\": \"$STRIPE_SECRET_KEY\"}")

if echo "$CONNECTION_TEST" | grep -q '"success":true'; then
    echo "✅ Connection test passed"
else
    echo "❌ Connection test failed:"
    echo "$CONNECTION_TEST"
    exit 1
fi

# Start webhook forwarding and capture secret
echo ""
echo "Step 3: Starting webhook forwarding..."
echo "-------------------------------------"
echo "Starting 'stripe listen' in background..."
echo "This will forward webhooks to: $WEBHOOK_URL"
echo ""

# Create a temporary file to capture the webhook secret
SECRET_FILE=$(mktemp)
LOG_FILE=$(mktemp)

# Start stripe listen in background and capture output
stripe listen --forward-to "$WEBHOOK_URL" > "$LOG_FILE" 2>&1 &
STRIPE_PID=$!

echo "Stripe listen started (PID: $STRIPE_PID)"
echo "Waiting for webhook secret..."

# Wait for webhook secret (it appears in the output)
sleep 3

# Extract webhook secret from the log
WEBHOOK_SECRET=$(grep -oP 'whsec_[a-zA-Z0-9]+' "$LOG_FILE" | head -1 || echo "")

if [[ -z "$WEBHOOK_SECRET" ]]; then
    echo "⚠️  Could not automatically extract webhook secret from output"
    echo "Please check the stripe listen output and enter it manually:"
    read -p "Webhook Secret (whsec_...): " WEBHOOK_SECRET
else
    echo "✅ Webhook secret captured: ${WEBHOOK_SECRET:0:20}..."
fi

# Configure test organization
echo ""
echo "Step 4: Configuring test organization..."
echo "----------------------------------------"
cd "$(dirname "$0")/../functions" || exit 1

npx ts-node src/scripts/createTestStripeOrganization.ts \
  --id "$ORG_ID" \
  --name "Test Stripe Hotel" \
  --secretKey "$STRIPE_SECRET_KEY" \
  --webhookSecret "$WEBHOOK_SECRET" \
  --status connected

echo "✅ Organization configured"
echo ""

# Trigger test events
echo "Step 5: Triggering test webhook events..."
echo "----------------------------------------"
echo "Triggering charge.dispute.created..."
stripe trigger charge.dispute.created

sleep 2

echo ""
echo "Triggering charge.dispute.updated..."
stripe trigger charge.dispute.updated

sleep 2

echo ""
echo "Triggering charge.dispute.closed..."
stripe trigger charge.dispute.closed

echo ""
echo "✅ All test events triggered"
echo ""

# Wait a moment for processing
echo "Waiting for webhook processing..."
sleep 5

# Verify disputes
echo ""
echo "Step 6: Verifying disputes in Firestore..."
echo "------------------------------------------"
npx ts-node scripts/verify-stripe-disputes.ts "$ORG_ID"

# Cleanup
echo ""
echo "Cleaning up..."
kill $STRIPE_PID 2>/dev/null || true
rm -f "$SECRET_FILE" "$LOG_FILE"

echo ""
echo "=========================================="
echo "Test Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Check Firebase function logs: firebase functions:log --only stripeWebhook"
echo "  2. Verify disputes in dashboard"
echo "  3. Check for any errors in the logs above"
echo ""



