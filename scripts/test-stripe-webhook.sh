#!/bin/bash

# Test Stripe Webhook Endpoint
# Usage: ./scripts/test-stripe-webhook.sh

set -e

WEBHOOK_URL="https://stripewebhook-cltbxmmndq-uc.a.run.app"
ORGANIZATION_ID="${1:-default_org}"

echo "Testing Stripe Webhook..."
echo "Webhook URL: $WEBHOOK_URL"
echo "Organization ID: $ORGANIZATION_ID"
echo ""

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "Stripe CLI not found. Installing..."
    echo "Please install from: https://stripe.com/docs/stripe-cli"
    exit 1
fi

echo "1. Testing webhook endpoint with Stripe CLI..."
echo "   Run this command in another terminal:"
echo "   stripe listen --forward-to $WEBHOOK_URL"
echo ""
echo "2. Then trigger a test dispute:"
echo "   stripe trigger charge.dispute.created"
echo ""
echo "3. Check function logs:"
echo "   firebase functions:log --only stripeWebhook"
echo ""
echo "4. Verify dispute in Firestore:"
echo "   Check 'disputes' collection for dispute with organizationId: $ORGANIZATION_ID"
echo ""

# Alternative: Test with curl (requires valid signature)
echo "Alternative: Test with curl (requires valid webhook secret)"
echo "Note: This requires generating a valid Stripe signature"
echo ""

echo "To verify webhook is working:"
echo "1. Check Firebase function logs for successful processing"
echo "2. Query Firestore disputes collection"
echo "3. Check dashboard for new dispute"



