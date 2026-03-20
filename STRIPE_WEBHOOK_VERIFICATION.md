# Stripe Webhook Function Verification Guide

This document provides a comprehensive guide to verify that the Stripe webhook function (`stripeWebhook`) is working correctly.

## Quick Start

Since you have Stripe test credentials ready, follow these steps:

### 1. Create/Verify Test Organization

```bash
cd functions
npx ts-node src/scripts/createTestStripeOrganization.ts \
  --id test_stripe_org \
  --name "Test Stripe Hotel" \
  --secretKey "YOUR_STRIPE_SECRET_KEY" \
  --webhookSecret "YOUR_WEBHOOK_SECRET" \
  --status connected
```

Or use the reset environment handler to create a clean test environment:

```bash
curl -X POST https://us-central1-realyn-app.cloudfunctions.net/resetTestEnvironmentHandler
```

Then configure credentials via the UI or script.

### 2. Test Connection

```bash
curl -X POST https://us-central1-realyn-app.cloudfunctions.net/testStripeConnection \
  -H "Content-Type: application/json" \
  -d '{"secretKey": "YOUR_STRIPE_SECRET_KEY"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Stripe connection successful. Account accessible."
}
```

### 3. Test Webhook with Stripe CLI

**Terminal 1 - Forward webhooks:**
```bash
stripe listen --forward-to https://stripewebhook-cltbxmmndq-uc.a.run.app
```

Copy the webhook signing secret (starts with `whsec_`) from the output.

**Terminal 2 - Trigger test events:**
```bash
# Test dispute.created
stripe trigger charge.dispute.created

# Test dispute.updated  
stripe trigger charge.dispute.updated

# Test dispute.closed
stripe trigger charge.dispute.closed
```

### 4. Verify Processing

**Check function logs:**
```bash
firebase functions:log --only stripeWebhook
```

**Verify disputes in Firestore:**
```bash
cd functions
npx ts-node scripts/verify-stripe-disputes.ts test_stripe_org
```

**Check dashboard:**
- Login to https://realyn-app.web.app
- Select "Test Stripe Hotel" organization
- Navigate to Disputes tab
- Verify disputes appear with correct data

## Test Scripts

### Automated Test Runner
```bash
./scripts/run-stripe-tests.sh
```

### Interactive Manual Testing
```bash
./scripts/test-stripe-webhook-manual.sh test_stripe_org
```

### End-to-End Test
```bash
./scripts/test-stripe-e2e.sh test_stripe_org YOUR_SECRET_KEY YOUR_WEBHOOK_SECRET
```

### Verify Disputes
```bash
cd functions
npx ts-node scripts/verify-stripe-disputes.ts test_stripe_org
```

## Verification Checklist

### Core Functionality
- [ ] Test organization exists (`test_stripe_org`)
- [ ] Stripe credentials configured (secret key + webhook secret)
- [ ] Connection test passes
- [ ] Webhook configured in Stripe Dashboard (if using Dashboard method)
- [ ] All three event types tested (created, updated, closed)
- [ ] Webhook delivery successful (200 response)
- [ ] No errors in Firebase function logs

### Data Verification
- [ ] Disputes stored in Firestore with correct `organizationId`
- [ ] All required fields present:
  - `pspProvider` = "stripe"
  - `pspDisputeId` matches Stripe dispute ID
  - `amount` in cents
  - `currency` lowercase (e.g., "usd")
  - `stripeStatus` normalized correctly
  - `createdAt` and `updatedAt` timestamps
  - `pspLast4Digits` (if available)
  - `pspTransactionDate` correct
- [ ] Payment metadata extracted correctly
- [ ] Data normalized to unified format
- [ ] Disputes appear in dashboard
- [ ] Dashboard displays all fields correctly

### Error Handling
- [ ] Missing signature returns 400
- [ ] Invalid signature returns 400
- [ ] No matching org returns 400
- [ ] Processing errors return 500
- [ ] Errors logged correctly

### Multi-Organization
- [ ] Multiple orgs can coexist
- [ ] Webhooks route to correct organization
- [ ] No data cross-contamination

## Troubleshooting

### Webhook Not Received
- Verify webhook URL in Stripe Dashboard matches: `https://stripewebhook-cltbxmmndq-uc.a.run.app`
- Check webhook secret matches between Stripe and organization
- Verify organization has `status: "connected"`
- Check Firebase function logs for errors

### Invalid Signature
- Ensure webhook secret matches the one from Stripe Dashboard/CLI
- Verify organization has both `secretKey` and `webhookSecret` set
- Check that credentials are encrypted correctly

### Dispute Not Appearing
- Check Firestore `disputes` collection
- Verify `organizationId` matches `test_stripe_org`
- Check function logs for processing errors
- Verify dispute normalization worked correctly

### Connection Test Fails
- Verify secret key format (starts with `sk_` or `rk_`)
- Ensure key has required permissions (`disputes:read`, `payment_intents:read`)
- Check key is valid and not expired

## Test Results

Document your test results here:

### Date: ___________

**Test Organization:** test_stripe_org

**Stripe Secret Key:** sk_test_... (last 4: ____)

**Webhook Secret:** whsec_... (last 4: ____)

**Connection Test:** [ ] Pass [ ] Fail

**Webhook Events Tested:**
- [ ] charge.dispute.created
- [ ] charge.dispute.updated
- [ ] charge.dispute.closed

**Disputes Created:** ____

**Firestore Verification:** [ ] Pass [ ] Fail

**Dashboard Verification:** [ ] Pass [ ] Fail

**Issues Found:**
- 

**Notes:**
- 

## Next Steps

After verifying the webhook function works:

1. Test dispute response submission
2. Test evidence upload
3. Test AI argument generation (if implemented)
4. Test bulk operations
5. Test edge cases (large amounts, special characters, etc.)
6. Test with production-like data volumes



