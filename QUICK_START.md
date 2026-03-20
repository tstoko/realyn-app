# Quick Start Guide - Realyn App

## 🚀 System is Live!

Your Realyn dispute management platform is fully deployed and ready to use.

## Access the Application

**Live URL**: https://realyn-app.web.app

## First-Time Setup

### 1. Seed Initial Data (One-time)

Run these commands to create initial organizations and users:

```bash
# Seed organizations
curl https://seedorganizationshandler-cltbxmmndq-uc.a.run.app

# Seed users  
curl https://seedusershandler-cltbxmmndq-uc.a.run.app
```

Or visit the URLs in your browser:
- Organizations: https://seedorganizationshandler-cltbxmmndq-uc.a.run.app
- Users: https://seedusershandler-cltbxmmndq-uc.a.run.app

### 2. Log In

1. Go to https://realyn-app.web.app
2. Use one of the seeded user accounts:
   - **Admin**: Check seeded users for admin credentials
   - **Hotel User**: Use hotel-specific user credentials

### 3. Configure Your First Hotel

1. Log in as admin
2. Click "Add New Hotel" in the Properties page
3. Fill in hotel details:
   - Name and location
   - Teams (Finance, Front Desk, etc.)
   - Documents (Cancellation Policy, etc.)

4. **Configure PSP Integration** (Stripe/Adyen):
   - Go to "Integrations" tab
   - Select your payment provider
   - Enter credentials:
     - **Stripe**: Restricted API Key (rk_...), Webhook Secret (whsec_...)
     - **Adyen**: API Key, Merchant Account, Webhook Username/Password
   - Click "Test Connection"
   - Save

5. **Configure Mews PMS**:
   - Select "Mews" as PMS
   - Enter: API Key, Access Token, Property ID
   - Click "Test Connection"
   - Save

6. **Set Up Webhooks**:
   - **Stripe**: Add webhook endpoint `https://stripewebhook-cltbxmmndq-uc.a.run.app` in Stripe Dashboard
   - **Adyen**: Add webhook endpoint `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook` in Adyen Customer Area

7. **Sync Mews Data**:
   - After Mews is connected, click "Sync Now" on the hotel card
   - Wait for sync to complete
   - Verify guests and bookings are synced

## Testing the System

### Test Mews Connection

```bash
curl -X POST https://us-central1-realyn-app.cloudfunctions.net/mewsConnectionTest \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "YOUR_MEWS_API_KEY",
    "accessToken": "YOUR_MEWS_ACCESS_TOKEN",
    "propertyId": "YOUR_MEWS_PROPERTY_ID"
  }'
```

### Test Manual Mews Sync

```bash
curl -X POST https://us-central1-realyn-app.cloudfunctions.net/mewsManualSync \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "YOUR_ORGANIZATION_ID"}'
```

### Test Stripe Webhook (using Stripe CLI)

```bash
# Install Stripe CLI if not already installed
# Then forward webhooks locally:
stripe listen --forward-to https://stripewebhook-cltbxmmndq-uc.a.run.app

# In another terminal, trigger a test dispute:
stripe trigger charge.dispute.created
```

## Daily Operations

### Monitor Disputes

1. Log in to https://realyn-app.web.app
2. Select your hotel from the Properties page
3. View disputes in the dashboard
4. Filter and sort as needed

### Process Disputes

1. Click on a dispute to view details
2. Review auto-matched guest/booking information
3. Review AI-generated draft response
4. Approve or edit the response
5. Submit evidence to PSP

### Sync Mews Data

- **Automatic**: Runs daily at 2 AM UTC
- **Manual**: Click "Sync Now" on hotel card anytime

## Troubleshooting

### Can't Log In

- Verify user was seeded: Check `seedUsersHandler` was called
- Check Firebase Authentication is enabled
- Verify user email/password are correct

### Disputes Not Appearing

- Check webhook is configured in PSP dashboard
- Verify webhook URL is correct
- Check function logs: `firebase functions:log --only stripeWebhook`

### Mews Sync Failing

- Verify Mews credentials are correct
- Test connection using the "Test Connection" button
- Check function logs for errors

### Functions Not Working

```bash
# View all function logs
firebase functions:log

# View specific function
firebase functions:log --only mewsManualSync
```

## Next Steps

1. ✅ System is deployed and live
2. ✅ Seed initial data (organizations and users)
3. ⏭️ Configure webhooks in PSP dashboards
4. ⏭️ Onboard your first hotel
5. ⏭️ Test end-to-end dispute flow

## Support Resources

- **Onboarding Guide**: See `HOTEL_ONBOARDING_PLAN.md`
- **Deployment Details**: See `DEPLOYMENT_SUMMARY.md`
- **Firebase Console**: https://console.firebase.google.com/project/realyn-app/overview

## Important URLs

- **App**: https://realyn-app.web.app
- **Stripe Webhook**: https://stripewebhook-cltbxmmndq-uc.a.run.app
- **Adyen Webhook**: https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook
- **Mews Connection Test**: https://us-central1-realyn-app.cloudfunctions.net/mewsConnectionTest
- **Mews Manual Sync**: https://us-central1-realyn-app.cloudfunctions.net/mewsManualSync


