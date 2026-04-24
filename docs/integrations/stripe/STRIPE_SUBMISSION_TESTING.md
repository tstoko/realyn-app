# Stripe Dispute Submission Testing Guide

This guide documents the complete flow for testing Stripe dispute evidence submission, from webhook receipt through final submission.

## Prerequisites

1. **Stripe Test Mode Access**
   - A Stripe account with test mode enabled
   - Test API keys (starts with `sk_test_`)
   - Webhook endpoint configured in Stripe dashboard

2. **Organization Setup in Realyn**
   - Organization with Stripe integration configured
   - Stripe credentials stored (secretKey or accessToken)
   - Webhook secret configured

3. **Firebase Functions Deployed**
   - All functions deployed and accessible
   - OPENAI_API_KEY secret configured for AI features

## Testing Flow

### Step 1: Create a Test Dispute in Stripe

**Option A: Via Stripe Dashboard (Recommended for initial testing)**
1. Go to Stripe Dashboard > Developers > Test mode
2. Navigate to Payments > Disputes
3. Create a test payment using test card `4000000000000259` (triggers dispute)
4. The dispute will appear in the Disputes section

**Option B: Via Stripe CLI**
```bash
# Create a payment intent that will be disputed
stripe payment_intents create \
  --amount=5000 \
  --currency=usd \
  --payment-method=pm_card_createDispute \
  --confirm=true

# Stripe will automatically create a dispute for this payment
```

### Step 2: Configure Webhook Endpoint

1. In Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://us-central1-realyn-app.cloudfunctions.net/stripeWebhook`
3. Select events to listen for:
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
4. Copy the webhook signing secret (starts with `whsec_`)
5. Update organization's `webhookSecret` in Firestore

### Step 3: Verify Webhook Receipt

When a dispute is created, the webhook handler will:
1. Verify the signature using the organization's webhook secret
2. Parse the dispute event
3. Create/update the dispute in Firestore
4. Trigger AI evidence planning automatically

**Expected Firestore Document** (`disputes/{disputeId}`):
```json
{
  "pspProvider": "stripe",
  "pspDisputeId": "du_xxxx",
  "pspPaymentId": "pi_xxxx",
  "amount": 5000,
  "currency": "usd",
  "reason": "fraudulent",
  "stripeStatus": "needs_response",
  "lifecycleStatus": "new",
  "automationStatus": "ai_planning",
  "evidencePlanStatus": "generating",
  "organizationId": "your_org_id"
}
```

### Step 4: AI Evidence Planning

The system automatically generates an evidence plan. Monitor progress:
- `evidencePlanStatus`: "generating" → "complete" or "error"
- `evidencePlan`: Contains AI-generated evidence requirements

**Check Cloud Functions logs** for planning output:
```bash
firebase functions:log --only planEvidence
```

### Step 5: Upload Evidence Files

Evidence can be uploaded via the UI or directly to Firestore:
- Files are stored in Firebase Storage
- Metadata stored in `disputes/{disputeId}/evidence` subcollection

**Evidence Categories:**
- `pms` - Property Management System records
- `policy` - Cancellation/refund policies
- `proofOfStay` - Check-in records, key card logs
- `comms` - Guest communications
- `incidentReports` - Incident documentation

### Step 6: Generate AI Argument

Call the `draftArgument` endpoint:
```bash
curl -X POST \
  'https://us-central1-realyn-app.cloudfunctions.net/draftArgument?disputeId=YOUR_DISPUTE_ID' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -d '{"organizationId": "YOUR_ORG_ID"}'
```

**Expected Response:**
```json
{
  "success": true,
  "argument": {
    "executiveSummary": "...",
    "timeline": [...],
    "paragraphs": [...],
    "conclusion": "...",
    "uncategorizedText": "..."
  },
  "version": 1
}
```

### Step 7: Submit Evidence to Stripe

Call the `submitStripeDisputeResponse` endpoint:
```bash
curl -X POST \
  'https://us-central1-realyn-app.cloudfunctions.net/submitStripeDisputeResponse' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -d '{
    "disputeId": "YOUR_DISPUTE_ID",
    "organizationId": "YOUR_ORG_ID"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Dispute response submitted successfully",
  "disputeStatus": "under_review",
  "evidenceFilesSubmitted": 3
}
```

### Step 8: Verify in Stripe Dashboard

1. Go to Stripe Dashboard > Disputes
2. Find the dispute and click to view details
3. Check the "Evidence" tab to verify:
   - Text evidence appears in appropriate fields
   - File URLs are accessible
   - All required fields are populated

## Stripe Evidence Field Mapping

The system maps evidence to these Stripe fields:

| Realyn Category | Stripe Field | Type |
|----------------|--------------|------|
| `comms` | `customer_communication` | File URL |
| `pms`, `proofOfStay` | `service_documentation` | File URL |
| `proofOfStay` (receipt) | `receipt` | File URL |
| `incidentReports` | `uncategorized_file` | File URL |
| AI Argument | `uncategorized_text` | Text |
| Payment IP | `customer_purchase_ip` | Text |
| AVS/CVV/3DS | `access_activity_log` | Text |
| Stay details | `product_description` | Text |
| Policy text | `cancellation_policy` | Text |
| Policy disclosure | `cancellation_policy_disclosure` | Text |
| Refund policy | `refund_policy` | Text |
| Refund denial | `refund_refusal_explanation` | Text |

## Troubleshooting

### Webhook Not Received
- Verify webhook URL is correct in Stripe dashboard
- Check webhook signing secret matches organization config
- Review Cloud Functions logs: `firebase functions:log --only stripeWebhook`

### Evidence Plan Not Generated
- Check OpenAI API key is configured: `firebase functions:secrets:access OPENAI_API_KEY`
- Review logs: `firebase functions:log --only planEvidence`
- Verify dispute document exists with correct `organizationId`

### Submission Fails
- Check Stripe API credentials are valid
- Verify dispute hasn't already been submitted (`dispute_already_submitted` error)
- Ensure evidence file URLs are publicly accessible
- Check for rate limiting (`StripeRateLimitError`)

### Evidence Not Appearing in Stripe
- File URLs must be publicly accessible
- Stripe has size limits on evidence files (check Stripe docs)
- Some evidence types only accept files OR text, not both

## Test Cards for Different Dispute Reasons

| Card Number | Dispute Reason |
|-------------|----------------|
| `4000000000000259` | Generic fraudulent |
| `4000000000001976` | Inquiry (not a chargeback) |
| `4000000000005423` | Product not received |
| `4000000000002685` | Credit not processed |

## Security Notes

- All submission endpoints now require Firebase Auth
- Auth token must be passed in `Authorization: Bearer <token>` header
- Admin-only endpoints (like `clearDisputes`) require admin role
- Test handlers (`seedTestDisputes`, `adminUpdateDispute`) are only available in non-production

## Related Documentation

- [Stripe Disputes API](https://stripe.com/docs/api/disputes)
- [Stripe Evidence Object](https://stripe.com/docs/api/disputes/evidence_object)
- [Stripe Test Cards](https://stripe.com/docs/testing#cards)
