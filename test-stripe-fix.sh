#!/bin/bash

# Test script to verify Stripe OAuth integration fix
# This tests both OAuth (accessToken) and manual (secretKey) setups

set -e

WEBHOOK_URL="https://stripewebhook-cltbxmmndq-uc.a.run.app"

echo "=========================================="
echo "Testing Stripe Integration Fix"
echo "=========================================="
echo ""
echo "This script will help you test:"
echo "1. OAuth-connected hotels (accessToken)"
echo "2. Manual setup hotels (secretKey) - backward compatibility"
echo ""

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI not found. Please install it first."
    echo "   macOS: brew install stripe/stripe-cli/stripe"
    exit 1
fi

echo "✅ Stripe CLI found"
echo ""

# Check if logged in
if ! stripe config --list &> /dev/null; then
    echo "⚠️  Not logged in to Stripe CLI. Run: stripe login"
    exit 1
fi

echo "✅ Stripe CLI is logged in"
echo ""

echo "=========================================="
echo "Step 1: Start Webhook Forwarding"
echo "=========================================="
echo ""
echo "In a NEW terminal window, run:"
echo "  stripe listen --forward-to $WEBHOOK_URL"
echo ""
echo "This will output a webhook signing secret (starts with whsec_)"
echo "Copy that secret - you'll need it for testing!"
echo ""
read -p "Press Enter after starting 'stripe listen' in another terminal..."

echo ""
echo "=========================================="
echo "Step 2: Test Webhook Handler"
echo "=========================================="
echo ""
echo "In the terminal where 'stripe listen' is running, trigger a test event:"
echo "  stripe trigger charge.dispute.created"
echo ""
echo "This will send a test webhook to your function."
echo ""
read -p "Press Enter after triggering the test event..."

echo ""
echo "=========================================="
echo "Step 3: Check Function Logs"
echo "=========================================="
echo ""
echo "Checking recent function logs..."
echo ""
firebase functions:log --only stripeWebhook 2>/dev/null | tail -5 || echo "No recent logs found"

echo ""
echo "=========================================="
echo "What to Look For"
echo "=========================================="
echo ""
echo "✅ SUCCESS indicators:"
echo "   - No 'Could not verify webhook signature' errors"
echo "   - Webhook returns 200 OK"
echo "   - Dispute appears in Firestore"
echo ""
echo "❌ FAILURE indicators:"
echo "   - 'Could not verify webhook signature with any organization'"
echo "   - 'Invalid webhook signature' errors"
echo "   - 400/500 error responses"
echo ""
echo "If you see errors, check:"
echo "1. Organization has webhookSecret configured"
echo "2. Organization has either secretKey OR accessToken"
echo "3. Webhook secret matches the one from 'stripe listen'"
echo "4. Organization status is 'connected'"
echo ""



