#!/bin/bash

# Interactive script for manual Stripe webhook testing
# Usage: ./scripts/test-stripe-webhook-manual.sh

set -e

WEBHOOK_URL="https://stripewebhook-cltbxmmndq-uc.a.run.app"
ORGANIZATION_ID="${1:-test_stripe_org}"

echo "=========================================="
echo "Stripe Webhook Manual Testing Guide"
echo "=========================================="
echo ""
echo "Webhook URL: $WEBHOOK_URL"
echo "Test Organization ID: $ORGANIZATION_ID"
echo ""

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "⚠️  Stripe CLI not found."
    echo ""
    echo "Please install Stripe CLI:"
    echo "  macOS: brew install stripe/stripe-cli/stripe"
    echo "  Or visit: https://stripe.com/docs/stripe-cli"
    echo ""
    exit 1
fi

echo "✅ Stripe CLI found"
echo ""

# Step 1: Login check
echo "Step 1: Verify Stripe CLI login"
echo "--------------------------------"
if ! stripe config --list &> /dev/null; then
    echo "⚠️  Not logged in to Stripe CLI"
    echo "Run: stripe login"
    echo ""
    read -p "Press Enter after logging in..."
else
    echo "✅ Stripe CLI is logged in"
fi
echo ""

# Step 2: Forward webhooks
echo "Step 2: Forward webhooks to endpoint"
echo "-------------------------------------"
echo "In a NEW terminal, run:"
echo "  stripe listen --forward-to $WEBHOOK_URL"
echo ""
echo "This will output a webhook signing secret (starts with whsec_)"
echo "Copy that secret - you'll need it!"
echo ""
read -p "Press Enter after starting 'stripe listen' in another terminal..."

# Step 3: Get webhook secret
echo ""
echo "Step 3: Configure webhook secret"
echo "--------------------------------"
echo "Enter the webhook signing secret from 'stripe listen' output:"
read -p "Webhook Secret (whsec_...): " WEBHOOK_SECRET

if [[ ! $WEBHOOK_SECRET =~ ^whsec_ ]]; then
    echo "⚠️  Warning: Webhook secret should start with 'whsec_'"
    read -p "Continue anyway? (y/n): " CONTINUE
    if [[ $CONTINUE != "y" ]]; then
        exit 1
    fi
fi

echo ""
echo "Step 4: Update test organization"
echo "--------------------------------"
echo "You need to update the test organization with:"
echo "  - Stripe Secret Key (sk_test_... or rk_test_...)"
echo "  - Webhook Secret: $WEBHOOK_SECRET"
echo ""
echo "Options:"
echo "  1. Update via UI (dashboard)"
echo "  2. Update via script (requires credentials)"
echo ""
read -p "Choose option (1 or 2): " UPDATE_OPTION

if [[ $UPDATE_OPTION == "2" ]]; then
    echo ""
    read -p "Enter Stripe Secret Key: " STRIPE_SECRET_KEY
    echo ""
    echo "Updating organization via script..."
    cd "$(dirname "$0")/../functions" || exit 1
    npx ts-node src/scripts/createTestStripeOrganization.ts \
      --id "$ORGANIZATION_ID" \
      --name "Test Stripe Hotel" \
      --secretKey "$STRIPE_SECRET_KEY" \
      --webhookSecret "$WEBHOOK_SECRET" \
      --status connected
    echo "✅ Organization updated"
else
    echo ""
    echo "Please update the organization manually:"
    echo "  1. Go to dashboard"
    echo "  2. Select 'Test Stripe Hotel'"
    echo "  3. Go to Settings → Integrations"
    echo "  4. Enter Stripe Secret Key and Webhook Secret"
    echo "  5. Click 'Test Connection' and save"
    echo ""
    read -p "Press Enter after updating the organization..."
fi

# Step 5: Test connection
echo ""
echo "Step 5: Test Stripe connection"
echo "------------------------------"
read -p "Enter Stripe Secret Key for connection test: " TEST_SECRET_KEY
echo ""
echo "Testing connection..."
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

# Step 6: Trigger test events
echo ""
echo "Step 6: Trigger test webhook events"
echo "-----------------------------------"
echo "In the terminal where 'stripe listen' is running, trigger test events:"
echo ""
echo "  # Test dispute.created"
echo "  stripe trigger charge.dispute.created"
echo ""
echo "  # Test dispute.updated"
echo "  stripe trigger charge.dispute.updated"
echo ""
echo "  # Test dispute.closed"
echo "  stripe trigger charge.dispute.closed"
echo ""
read -p "Press Enter after triggering at least one test event..."

# Step 7: Verify processing
echo ""
echo "Step 7: Verify webhook processing"
echo "---------------------------------"
echo "Checking Firebase function logs..."
echo ""
echo "Run this command to see logs:"
echo "  firebase functions:log --only stripeWebhook"
echo ""
read -p "Press Enter to continue..."

echo ""
echo "Step 8: Verify dispute in Firestore"
echo "------------------------------------"
echo "Check Firestore console or run verification script:"
echo "  cd functions && npx ts-node scripts/verify-stripe-disputes.ts $ORGANIZATION_ID"
echo ""
read -p "Press Enter to continue..."

echo ""
echo "=========================================="
echo "Manual Testing Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Check Firebase function logs for any errors"
echo "  2. Verify disputes appear in Firestore"
echo "  3. Verify disputes appear in dashboard"
echo "  4. Test error cases (invalid signature, etc.)"
echo ""



