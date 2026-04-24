# Deployment Summary - Realyn App

## Deployment Status: ✅ COMPLETE

All components have been successfully deployed to Firebase.

## Deployed Components

### Cloud Functions

All functions deployed to `us-central1` region:

1. **stripeWebhook** (v2)
   - URL: `https://stripewebhook-cltbxmmndq-uc.a.run.app`
   - Purpose: Receives Stripe dispute webhooks
   - Events: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
   - Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

2. **adyenWebhook** (v2)
   - URL: `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook`
   - Purpose: Receives Adyen dispute notifications
   - Events: `CHARGEBACK`, `SECOND_CHARGEBACK`, `CHARGEBACK_REVERSED`, etc.

3. **mewsConnectionTest** (v2)
   - URL: `https://us-central1-realyn-app.cloudfunctions.net/mewsConnectionTest`
   - Purpose: Tests Mews API connection with provided credentials
   - Method: POST
   - Body: `{ apiKey, accessToken, propertyId }`

5. **mewsManualSync** (v2)
   - URL: `https://us-central1-realyn-app.cloudfunctions.net/mewsManualSync`
   - Purpose: Manually triggers Mews data sync for an organization
   - Method: POST
   - Body: `{ organizationId }`

6. **mewsSyncScheduler** (v2)
   - Schedule: Daily at 2:00 AM UTC
   - Purpose: Automatically syncs Mews data for all connected organizations

7. **seedOrganizationsHandler** (v2)
   - URL: `https://seedorganizationshandler-cltbxmmndq-uc.a.run.app`
   - Purpose: One-time seeding of initial organizations
   - ⚠️ Should be restricted in production

8. **seedUsersHandler** (v2)
   - URL: `https://seedusershandler-cltbxmmndq-uc.a.run.app`
   - Purpose: One-time seeding of initial users
   - ⚠️ Should be restricted in production

### Firestore

- **Rules**: Deployed and active
- **Indexes**: Deployed and active
  - Disputes: `organizationId + createdAt`, `pspProvider + pspDisputeId`
  - Bookings: `organizationId + pmsProvider + totalAmount + currency + paymentDate`
  - Guests: `organizationId + pmsProvider + email`

### Frontend (Hosting)

- **Status**: ✅ Deployed
- **Build**: Production build completed successfully
- **Live URL**: https://realyn-app.web.app
- **Console**: https://console.firebase.google.com/project/realyn-app/hosting

## Configuration Required

### Firebase Secrets

The following secrets are configured in Firebase Secret Manager:
- ✅ `STRIPE_SECRET_KEY` - Set
- ✅ `STRIPE_WEBHOOK_SECRET` - Set

### Webhook Configuration Needed

**Stripe:**
1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Add endpoint: `https://stripewebhook-cltbxmmndq-uc.a.run.app`
3. Select events:
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
4. Copy webhook signing secret and verify it matches `STRIPE_WEBHOOK_SECRET`

**Adyen:**
1. Go to Adyen Customer Area → Webhooks
2. Add endpoint: `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook`
3. Configure HMAC key
4. Add webhook username/password to hotel settings when onboarding

## Next Steps

### 1. Test the Deployment

```bash
# Test Mews connection
curl -X POST https://us-central1-realyn-app.cloudfunctions.net/mewsConnectionTest \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"test","accessToken":"test","propertyId":"test"}'

# Test manual sync (replace ORGANIZATION_ID)
curl -X POST https://us-central1-realyn-app.cloudfunctions.net/mewsManualSync \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"ORGANIZATION_ID"}'
```

### 2. Seed Initial Data (One-time)

```bash
# Seed organizations
curl https://seedorganizationshandler-cltbxmmndq-uc.a.run.app

# Seed users
curl https://seedusershandler-cltbxmmndq-uc.a.run.app
```

### 3. Configure Webhooks

Follow the webhook configuration steps above for each PSP you plan to use.

### 4. Onboard First Hotel

Follow the `HOTEL_ONBOARDING_PLAN.md` guide to onboard your first hotel.

## Security Notes

⚠️ **Important Security Actions Required:**

1. **Restrict Seed Functions**: 
   - Update `seedOrganizationsHandler` and `seedUsersHandler` to require authentication
   - Change `invoker: "public"` to `invoker: "private"` or add authentication checks

2. **Encrypt Credentials**:
   - PSP and Mews credentials stored in Firestore should be encrypted
   - Consider using Firebase Secret Manager for sensitive credentials

3. **Review Firestore Rules**:
   - Ensure rules properly restrict access based on user roles
   - Test rules with different user scenarios

## Monitoring

### View Function Logs

```bash
# View all function logs
firebase functions:log

# View specific function logs
firebase functions:log --only stripeWebhook
```

### Firebase Console

- Functions: https://console.firebase.google.com/project/realyn-app/functions
- Firestore: https://console.firebase.google.com/project/realyn-app/firestore
- Hosting: https://console.firebase.google.com/project/realyn-app/hosting

## Troubleshooting

### Functions Not Working

1. Check function logs: `firebase functions:log`
2. Verify secrets are set: `firebase functions:secrets:access SECRET_NAME`
3. Check function URLs are accessible

### Webhooks Not Receiving Events

1. Verify webhook URL is correct in PSP dashboard
2. Check function logs for incoming requests
3. Verify webhook secret matches
4. Test webhook endpoint manually

### Mews Sync Failing

1. Verify Mews credentials are correct
2. Check Mews API access permissions
3. Review function logs for API errors
4. Test connection using `mewsConnectionTest` function

## Support

For issues or questions:
- Check function logs in Firebase Console
- Review `HOTEL_ONBOARDING_PLAN.md` for onboarding guidance
- Check Firestore rules and indexes are deployed correctly

