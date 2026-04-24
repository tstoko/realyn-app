# End-to-End Testing Guide

## Overview
This guide provides step-by-step procedures to test Stripe and Adyen webhook integrations end-to-end, from webhook receipt to dashboard display.

## Prerequisites

1. **Firebase Project Setup**
   - Firebase project configured
   - Functions deployed
   - Firestore rules configured
   - Secrets configured (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)

2. **Test Accounts**
   - Stripe test account with API keys
   - Adyen test account with API keys
   - Organization created in Firestore with PSP credentials

3. **Tools**
   - Stripe CLI (for Stripe webhook testing)
   - curl (for Adyen webhook testing)
   - Firebase CLI (for checking logs)
   - Access to Firestore console

## Testing Stripe Webhook

### Method 1: Using Stripe CLI (Recommended)

1. **Install Stripe CLI**
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Or download from https://stripe.com/docs/stripe-cli
   ```

2. **Login to Stripe**
   ```bash
   stripe login
   ```

3. **Forward Webhooks**
   ```bash
   stripe listen --forward-to https://stripewebhook-cltbxmmndq-uc.a.run.app
   ```
   This will output a webhook signing secret. Copy it.

4. **Trigger Test Dispute**
   In another terminal:
   ```bash
   stripe trigger charge.dispute.created
   ```

5. **Verify Processing**
   - Check Stripe CLI output for webhook delivery
   - Check Firebase logs: `firebase functions:log --only stripeWebhook`
   - Verify dispute in Firestore

### Method 2: Manual Test with Stripe Dashboard

1. **Create Test Dispute**
   - Go to Stripe Dashboard → Disputes
   - Create a test dispute (if in test mode)

2. **Configure Webhook**
   - Go to Stripe Dashboard → Webhooks
   - Add endpoint: `https://stripewebhook-cltbxmmndq-uc.a.run.app`
   - Select events: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
   - Copy webhook signing secret

3. **Verify Webhook Delivery**
   - Check webhook logs in Stripe Dashboard
   - Check Firebase function logs
   - Verify dispute in Firestore

## Testing Adyen Webhook

### Prerequisites

1. **Organization Setup**
   - Organization must exist in Firestore
   - Adyen integration configured with:
     - `merchantAccount` matching test merchant
     - `webhookPassword` set

2. **Generate Test Notification**

   Use the test script:
   ```bash
   chmod +x scripts/test-adyen-webhook.sh
   ./scripts/test-adyen-webhook.sh TestMerchant test_password
   ```

   Or manually:

   ```bash
   # Generate notification payload
   NOTIFICATION='{
     "notificationItems": [{
       "NotificationRequestItem": {
         "pspReference": "PSP_TEST_123",
         "originalReference": "ORIG_TEST_123",
         "merchantAccountCode": "TestMerchant",
         "amount": { "value": 10000, "currency": "USD" },
         "eventCode": "CHARGEBACK",
         "eventDate": "2025-01-15T10:00:00Z",
         "success": true
       }
     }]
   }'
   
   # Generate HMAC (requires Node.js)
   HMAC=$(node -e "
     const crypto = require('crypto');
     const item = $NOTIFICATION.notificationItems[0].NotificationRequestItem;
     const data = [
       item.pspReference,
       item.originalReference || '',
       item.merchantAccountCode,
       item.merchantReference || '',
       item.amount.value.toString(),
       item.amount.currency,
       item.eventCode,
       'true'
     ].join(':');
     console.log(crypto.createHmac('sha256', 'webhook_password').update(data).digest('base64'));
   ")
   
   # Send request
   curl -X POST https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook \
     -H "Content-Type: application/json" \
     -H "x-adyen-signature: $HMAC" \
     -d "$NOTIFICATION"
   ```

3. **Verify Response**
   - Should return `200 OK` with body `[accepted]`
   - Check Firebase logs: `firebase functions:log --only adyenWebhook`
   - Verify dispute in Firestore

## Verifying Firestore Data

### Check Dispute Collection

1. **Open Firestore Console**
   - Go to Firebase Console → Firestore Database

2. **Query Disputes**
   - Collection: `disputes`
   - Filter by `organizationId` = your test organization ID
   - Filter by `pspProvider` = `"stripe"` or `"adyen"`

3. **Verify Fields**
   - `pspProvider`: Should be "stripe" or "adyen"
   - `pspDisputeId`: Should match dispute ID from PSP
   - `organizationId`: Should match your test organization
   - `amount`: Should be in cents/minor units
   - `currency`: Should be lowercase (e.g., "usd")
   - `stripeStatus`: Should be normalized status
   - `createdAt`, `updatedAt`: Should be timestamps

### Example Firestore Query

```javascript
// In Firestore console or using Admin SDK
db.collection('disputes')
  .where('organizationId', '==', 'test_org_123')
  .where('pspProvider', '==', 'stripe')
  .get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      console.log(doc.id, doc.data());
    });
  });
```

## Verifying Dashboard Display

### Steps

1. **Login to Dashboard**
   - Go to https://realyn-app.web.app
   - Login with test user credentials

2. **Select Organization**
   - Choose the test organization from properties list

3. **Navigate to Disputes**
   - Click on "Disputes" tab
   - Should see disputes list

4. **Verify Display**
   - [ ] Disputes from both Stripe and Adyen appear
   - [ ] Dispute IDs are correct
   - [ ] Amounts display correctly
   - [ ] Statuses are correct
   - [ ] Dates are formatted correctly

5. **Test Filtering**
   - Filter by status
   - Filter by date range
   - Verify organization filtering (should only see disputes for selected org)

6. **Test Dispute Detail Modal**
   - Click on a dispute
   - Verify all fields display correctly
   - Verify PSP provider is shown (if badge implemented)
   - Verify linked guest/booking (if matched)

## Automated Testing

### Run Unit Tests

```bash
cd functions
npm test
```

This runs:
- Adyen client tests
- Adyen dispute sync tests
- Webhook integration tests (when implemented)

### Run Integration Tests

```bash
cd functions
npm test -- --testPathPattern=integration
```

## Troubleshooting

### Stripe Webhook Issues

**Problem: Webhook not received**
- Check webhook endpoint URL is correct
- Verify webhook is configured in Stripe Dashboard
- Check Firebase function logs for errors
- Verify secrets are set in Firebase Secret Manager

**Problem: Invalid signature**
- Verify webhook secret matches in Stripe Dashboard and Firebase secrets
- Check that raw body is being used for signature verification
- Note: Firebase Functions v2 may have limitations with raw body

**Problem: Organization not found**
- Verify organization exists in Firestore
- Check that payment intent metadata includes `organizationId`
- Verify default organization fallback logic

### Adyen Webhook Issues

**Problem: Organization not found**
- Verify organization exists in Firestore
- Check that `merchantAccount` in notification matches organization's Adyen merchant account
- Verify Adyen integration is marked as "connected"

**Problem: Invalid signature**
- Verify webhook password matches
- Check HMAC calculation is correct
- Verify signature header is present

**Problem: Dispute not stored**
- Check Firebase function logs for errors
- Verify `upsertUnifiedDispute` is being called
- Check Firestore rules allow writes
- Verify organization ID is correct

### Dashboard Issues

**Problem: Disputes not appearing**
- Verify disputes exist in Firestore
- Check `organizationId` matches selected organization
- Verify `useDisputes` hook is filtering correctly
- Check browser console for errors

**Problem: Incorrect data displayed**
- Verify data normalization is working
- Check Firestore data structure
- Verify mapping functions in `useDisputes` hook

## Full Pipeline Checklist

Use this checklist to test the entire dispute flow end-to-end in one pass. Complete each section in order; a failure in an earlier section blocks later ones.

### A. Prerequisites

- [ ] Firebase project configured and functions deployed
- [ ] Test organization exists in Firestore with PSP credentials
- [ ] Stripe CLI installed and logged in (`stripe login`)
- [ ] `scripts/test-adyen-webhook.sh` is executable (`chmod +x scripts/test-adyen-webhook.sh`)
- [ ] Firebase CLI available (`firebase --version`)

### B. Stripe webhook → Firestore

1. Start Stripe listener:
   ```bash
   stripe listen --forward-to https://stripewebhook-cltbxmmndq-uc.a.run.app
   ```
2. In a second terminal, trigger a test dispute:
   ```bash
   stripe trigger charge.dispute.created
   ```
3. Verify:
   - [ ] Stripe CLI shows `200 OK` response
   - [ ] `firebase functions:log --only stripeWebhook` shows successful processing
   - [ ] Firestore `disputes` collection contains a new document with `pspProvider: "stripe"`
   - [ ] `amount`, `currency`, `status`, `reason`, `organizationId` are correct

### C. Adyen webhook → Firestore

1. Send test notification:
   ```bash
   ./scripts/test-adyen-webhook.sh TestMerchant test_password
   ```
2. Verify:
   - [ ] Response is `200 OK` with body `[accepted]`
   - [ ] `firebase functions:log --only adyenWebhook` shows successful processing
   - [ ] Firestore `disputes` collection contains a new document with `pspProvider: "adyen"`
   - [ ] `amount`, `currency`, `status`, `merchantAccountCode`, `organizationId` are correct

### D. Dashboard verification

1. Open https://realyn-app.web.app and log in with a test user
2. Select the test organization from the property list
3. Navigate to the Disputes tab
4. Verify:
   - [ ] Both the Stripe and Adyen disputes from steps B & C appear
   - [ ] Dispute IDs match Firestore documents
   - [ ] Amounts display correctly (converted from minor units)
   - [ ] Statuses render with correct badges
   - [ ] Dates are formatted correctly
5. Click a dispute to open the detail view:
   - [ ] All fields render (PSP provider, reason, amount, respond-by date)
   - [ ] No console errors in the browser

### E. Error handling (negative tests)

- [ ] Sending a Stripe webhook with an invalid signature returns `400`
- [ ] Sending an Adyen notification with a wrong merchant account returns an appropriate error
- [ ] Sending a malformed JSON body returns `400`

### F. Smoke check: functions unit tests

```bash
cd functions && ENCRYPTION_KEY=test-encryption-key-32chars!! npm test
```
- [ ] All tests pass

---

## Success Criteria

All of the following should pass:

- [ ] Stripe webhook receives events successfully
- [ ] Stripe disputes are stored in Firestore with correct data
- [ ] Adyen webhook receives notifications successfully
- [ ] Adyen disputes are stored in Firestore with correct data
- [ ] Disputes appear on dashboard for correct organization
- [ ] Dispute detail modal shows all correct information
- [ ] Data normalization works correctly (statuses, amounts, dates)
- [ ] Organization filtering works
- [ ] Error handling works (invalid signatures, missing orgs, etc.)

## Next Steps

After verifying webhooks work:

1. Test dispute matching to PMS guests/bookings
2. Test dispute response submission
3. Test evidence upload
4. Test AI argument generation (if implemented)
5. Test bulk operations
6. Test edge cases (large amounts, special characters, etc.)



