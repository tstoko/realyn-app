#!/bin/bash

# End-to-End Test Script
# Tests complete flow: Webhook → Firestore → Dashboard

set -e

echo "=========================================="
echo "End-to-End Integration Test"
echo "=========================================="
echo ""

# Configuration
ORGANIZATION_ID="${1:-default_org}"
MERCHANT_ACCOUNT="${2:-TestMerchant}"

echo "Configuration:"
echo "  Organization ID: $ORGANIZATION_ID"
echo "  Adyen Merchant Account: $MERCHANT_ACCOUNT"
echo ""

# Step 1: Test Stripe Webhook
echo "Step 1: Testing Stripe Webhook..."
echo "  Run: ./scripts/test-stripe-webhook.sh $ORGANIZATION_ID"
echo "  Or use Stripe CLI: stripe trigger charge.dispute.created"
echo ""

# Step 2: Test Adyen Webhook
echo "Step 2: Testing Adyen Webhook..."
echo "  Run: ./scripts/test-adyen-webhook.sh $MERCHANT_ACCOUNT"
echo ""

# Step 3: Verify in Firestore
echo "Step 3: Verifying disputes in Firestore..."
echo "  Check 'disputes' collection:"
echo "  - Filter by organizationId: $ORGANIZATION_ID"
echo "  - Verify pspProvider is 'stripe' or 'adyen'"
echo "  - Verify dispute data is correct"
echo ""

# Step 4: Verify Dashboard
echo "Step 4: Verifying Dashboard..."
echo "  1. Log in to https://realyn-app.web.app"
echo "  2. Select organization: $ORGANIZATION_ID"
echo "  3. Navigate to Disputes dashboard"
echo "  4. Verify disputes appear"
echo "  5. Click dispute to verify detail modal"
echo ""

echo "=========================================="
echo "Test Checklist:"
echo "=========================================="
echo "[ ] Stripe webhook receives event"
echo "[ ] Stripe dispute stored in Firestore"
echo "[ ] Adyen webhook receives notification"
echo "[ ] Adyen dispute stored in Firestore"
echo "[ ] Disputes appear on dashboard"
echo "[ ] Dispute detail modal shows correct data"
echo "[ ] Organization filtering works"
echo "[ ] Data normalization is correct"
echo ""

echo "To run automated tests:"
echo "  cd functions && npm test"



