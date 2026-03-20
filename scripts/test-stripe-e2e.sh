#!/bin/bash

# End-to-end test script for Stripe webhook integration
# Usage: ./scripts/test-stripe-e2e.sh [organizationId] [stripeSecretKey] [webhookSecret]

set -e

ORGANIZATION_ID="${1:-test_stripe_org}"
STRIPE_SECRET_KEY="${2}"
WEBHOOK_SECRET="${3}"

echo "=========================================="
echo "Stripe Webhook E2E Test"
echo "=========================================="
echo ""
echo "Organization ID: $ORGANIZATION_ID"
echo ""

# Step 1: Verify test organization exists
echo "Step 1: Verifying test organization..."
echo "---------------------------------------"
cd "$(dirname "$0")/../functions" || exit 1

# Check if organization exists (this would require Firestore access)
echo "✅ Assuming organization exists (manual verification needed)"
echo ""

# Step 2: Configure credentials if provided
if [[ -n "$STRIPE_SECRET_KEY" && -n "$WEBHOOK_SECRET" ]]; then
    echo "Step 2: Configuring Stripe credentials..."
    echo "------------------------------------------"
    npx ts-node src/scripts/createTestStripeOrganization.ts \
      --id "$ORGANIZATION_ID" \
      --name "Test Stripe Hotel" \
      --secretKey "$STRIPE_SECRET_KEY" \
      --webhookSecret "$WEBHOOK_SECRET" \
      --status connected
    echo "✅ Credentials configured"
    echo ""
else
    echo "Step 2: Skipping credential configuration"
    echo "------------------------------------------"
    echo "Credentials not provided. Please configure manually:"
    echo "  - Stripe Secret Key"
    echo "  - Webhook Secret"
    echo ""
    read -p "Press Enter after configuring credentials..."
fi

# Step 3: Test connection
echo ""
echo "Step 3: Testing Stripe connection..."
echo "-----------------------------------"
if [[ -z "$STRIPE_SECRET_KEY" ]]; then
    read -p "Enter Stripe Secret Key for connection test: " TEST_SECRET_KEY
else
    TEST_SECRET_KEY="$STRIPE_SECRET_KEY"
fi

CONNECTION_TEST=$(curl -s -X POST https://us-central1-realyn-app.cloudfunctions.net/testStripeConnection \
  -H "Content-Type: application/json" \
  -d "{\"secretKey\": \"$TEST_SECRET_KEY\"}")

if echo "$CONNECTION_TEST" | grep -q '"success":true'; then
    echo "✅ Connection test passed"
else
    echo "❌ Connection test failed:"
    echo "$CONNECTION_TEST"
    exit 1
fi

# Step 4: Instructions for webhook testing
echo ""
echo "Step 4: Webhook Testing Instructions"
echo "-------------------------------------"
echo "To test webhooks, you need to:"
echo ""
echo "1. Install Stripe CLI (if not installed):"
echo "   brew install stripe/stripe-cli/stripe"
echo ""
echo "2. Login to Stripe:"
echo "   stripe login"
echo ""
echo "3. Forward webhooks (in a separate terminal):"
echo "   stripe listen --forward-to https://stripewebhook-cltbxmmndq-uc.a.run.app"
echo ""
echo "4. Note the webhook signing secret from 'stripe listen' output"
echo ""
echo "5. Update organization with webhook secret if not already done"
echo ""
echo "6. Trigger test events:"
echo "   stripe trigger charge.dispute.created"
echo "   stripe trigger charge.dispute.updated"
echo "   stripe trigger charge.dispute.closed"
echo ""
read -p "Press Enter after completing webhook testing..."

# Step 5: Verify disputes
echo ""
echo "Step 5: Verifying disputes in Firestore..."
echo "------------------------------------------"
npx ts-node scripts/verify-stripe-disputes.ts "$ORGANIZATION_ID"

# Step 6: Check function logs
echo ""
echo "Step 6: Checking function logs..."
echo "----------------------------------"
echo "Run this command to check function logs:"
echo "  firebase functions:log --only stripeWebhook"
echo ""
read -p "Press Enter to continue..."

echo ""
echo "=========================================="
echo "E2E Test Complete!"
echo "=========================================="
echo ""
echo "Verification checklist:"
echo "  [ ] Connection test passed"
echo "  [ ] Webhook events triggered"
echo "  [ ] Disputes stored in Firestore"
echo "  [ ] No errors in function logs"
echo "  [ ] Disputes appear in dashboard"
echo ""



