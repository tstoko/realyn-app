#!/bin/bash
# =============================================================================
# Realyn Production Secrets Setup Script
# =============================================================================
# 
# This script helps set up all required secrets for production deployment.
# Run this BEFORE deploying to production.
#
# Prerequisites:
# - Firebase CLI installed and authenticated
# - Project selected: firebase use realyn-app
#
# =============================================================================

set -e

echo "========================================"
echo "Realyn Production Secrets Setup"
echo "========================================"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Install it with: npm install -g firebase-tools"
    exit 1
fi

# Generate encryption key
echo "📦 Step 1: Encryption Key"
echo "-------------------------"
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
echo "Generated encryption key: $ENCRYPTION_KEY"
echo ""
echo "⚠️  IMPORTANT: Save this key securely! You cannot recover encrypted data without it."
echo ""

read -p "Press Enter to set this encryption key in Firebase config..."
firebase functions:config:set encryption.key="$ENCRYPTION_KEY"
echo "✅ Encryption key set"
echo ""

# OpenAI API Key
echo "📦 Step 2: OpenAI API Key"
echo "-------------------------"
echo "Enter your OpenAI API key (get one at https://platform.openai.com/api-keys):"
read -s OPENAI_KEY
echo ""

if [ -z "$OPENAI_KEY" ]; then
    echo "⚠️  Skipping OpenAI key (empty input)"
else
    firebase functions:config:set openai.api_key="$OPENAI_KEY"
    echo "✅ OpenAI API key set"
fi
echo ""

# Verify configuration
echo "📋 Step 3: Verify Configuration"
echo "--------------------------------"
echo "Current Firebase Functions config:"
firebase functions:config:get
echo ""

echo "========================================"
echo "✅ Secrets setup complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Deploy functions: cd functions && npm run build && firebase deploy --only functions"
echo "2. Verify encryption key is working in logs after first request"
echo ""
echo "⚠️  Remember to:"
echo "   - Backup the encryption key securely (offline storage recommended)"
echo "   - Never commit secrets to version control"
echo "   - Rotate keys periodically"
