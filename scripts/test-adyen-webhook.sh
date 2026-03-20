#!/bin/bash

# Test Adyen Webhook Endpoint
# Usage: ./scripts/test-adyen-webhook.sh [MERCHANT_ACCOUNT] [WEBHOOK_PASSWORD]

set -e

WEBHOOK_URL="https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook"
MERCHANT_ACCOUNT="${1:-TestMerchant}"
WEBHOOK_PASSWORD="${2:-test_password}"

echo "Testing Adyen Webhook..."
echo "Webhook URL: $WEBHOOK_URL"
echo "Merchant Account: $MERCHANT_ACCOUNT"
echo ""

# Generate test notification
PSP_REF="PSP_TEST_$(date +%s)"
ORIG_REF="ORIG_TEST_$(date +%s)"
AMOUNT=10000
CURRENCY="USD"
EVENT_CODE="CHARGEBACK"

# Create notification payload
NOTIFICATION=$(cat <<EOF
{
  "notificationItems": [{
    "NotificationRequestItem": {
      "pspReference": "$PSP_REF",
      "originalReference": "$ORIG_REF",
      "merchantAccountCode": "$MERCHANT_ACCOUNT",
      "merchantReference": "MERCH_TEST_$(date +%s)",
      "amount": {
        "value": $AMOUNT,
        "currency": "$CURRENCY"
      },
      "eventCode": "$EVENT_CODE",
      "eventDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "reason": "10.1",
      "success": true,
      "additionalData": {
        "cardSummary": "1234",
        "chargebackReason": "Fraudulent transaction"
      }
    }
  }]
}
EOF
)

# Generate HMAC signature (requires Node.js)
echo "Generating HMAC signature..."
HMAC_SIGNATURE=$(node -e "
const crypto = require('crypto');
const notification = $NOTIFICATION;
const item = notification.notificationItems[0].NotificationRequestItem;
const dataToSign = [
  item.pspReference,
  item.originalReference || '',
  item.merchantAccountCode,
  item.merchantReference || '',
  item.amount.value.toString(),
  item.amount.currency,
  item.eventCode,
  item.success === true ? 'true' : 'false'
].join(':');
const hmac = crypto.createHmac('sha256', '$WEBHOOK_PASSWORD').update(dataToSign).digest('base64');
console.log(hmac);
")

echo "Sending test notification..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-adyen-signature: $HMAC_SIGNATURE" \
  -d "$NOTIFICATION")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "Response Status: $HTTP_CODE"
echo "Response Body: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ] && [ "$BODY" = "[accepted]" ]; then
    echo "✓ Webhook test successful!"
    echo ""
    echo "Next steps:"
    echo "1. Check function logs: firebase functions:log --only adyenWebhook"
    echo "2. Verify dispute in Firestore with pspDisputeId: $PSP_REF"
    echo "3. Check dashboard for new dispute"
else
    echo "✗ Webhook test failed"
    echo "Check the response above for error details"
    exit 1
fi



