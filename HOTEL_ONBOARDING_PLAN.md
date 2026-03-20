# Hotel Onboarding Plan - Realyn Dispute Management System

## Overview

This document outlines the complete process for onboarding hotels onto the Realyn platform, which integrates with Mews (PMS) and Stripe/Adyen (PSPs) to automatically manage payment disputes.

## System Architecture

### Components

1. **Frontend Dashboard** (React + TypeScript)
   - Dispute management interface
   - Hotel/property configuration
   - Analytics and reporting

2. **Backend Services** (Firebase Cloud Functions)
   - Webhook handlers for PSP dispute events
   - Mews PMS data synchronization
   - Dispute matching and processing

3. **Database** (Firestore)
   - Organizations (hotels)
   - Disputes
   - Guests and Bookings (from PMS)
   - Users and authentication

### Data Flow

```
PSP (Stripe/Adyen) 
  → Webhook → Cloud Function 
  → Firestore (Disputes)
  → Frontend Dashboard

Mews PMS 
  → Scheduled Sync → Cloud Function 
  → Firestore (Guests/Bookings)
  → Auto-match with Disputes
```

## Pre-Onboarding Checklist

### For Realyn Team

- [ ] Firebase project configured and deployed
- [ ] Cloud Functions deployed
- [ ] Firestore security rules configured
- [ ] Firebase Authentication enabled
- [ ] Webhook endpoints tested and verified
- [ ] Mews API credentials obtained (for testing)

### For Hotel

- [ ] Mews account with API access
- [ ] PSP account (Stripe/Adyen) with webhook capability
- [ ] Admin user account ready for Realyn platform
- [ ] Hotel property information (name, location)

## Step-by-Step Onboarding Process

### Phase 1: Initial Setup (Realyn Admin)

#### 1.1 Create Hotel Organization

1. Log in to Realyn dashboard as admin
2. Navigate to "Manage Properties"
3. Click "Add New Hotel"
4. Fill in basic information:
   - Hotel Name
   - Location
   - Teams (Finance, Front Desk, etc.)
   - Documents (Cancellation Policy, Terms of Service, etc.)

#### 1.2 Configure PSP Integration

1. In hotel settings, go to "Integrations" tab
2. Select Payment Provider (PSP):
   - **Stripe**: 
     - Create a **Restricted API Key** in Stripe Dashboard with `disputes:read` and `payment_intents:read` permissions
     - Enter the Restricted API Key (starts with `rk_`)
     - Configure webhook manually (see below)
     - Enter the Webhook Signing Secret (starts with `whsec_`)
   - **Adyen**: Enter API Key, Merchant Accounts (can add multiple), Webhook HMAC Key, Webhook Username (optional)
3. Click "Test Connection" to verify credentials
4. Once connected, status will show "Connected"

**Stripe Setup Steps:**
1. Go to [Stripe Dashboard → API Keys](https://dashboard.stripe.com/apikeys)
2. Click "Create restricted key"
3. Set permissions: `disputes:read`, `payment_intents:read`
4. Copy the Restricted key (starts with `rk_`)
5. Configure webhook (see section 1.4 below)
6. Enter both credentials in Realyn and save

#### 1.3 Configure Mews PMS Integration

1. In "Integrations" tab, select "Mews" as PMS
2. Enter Mews credentials:
   - API Key
   - Access Token
   - Property ID
3. Click "Test Connection" to verify
4. Once connected, status will show "Connected"

#### 1.4 Configure Webhooks in PSP Dashboard

**For Stripe:**
1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Set URL: `https://stripewebhook-cltbxmmndq-uc.a.run.app`
4. Select events:
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
5. Copy the "Signing secret" (starts with `whsec_`)
6. Paste it in the hotel settings and save

**For Adyen:**
1. Go to Adyen Customer Area → Webhooks
2. Add endpoint: `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook`
3. Select "All merchant accounts" or specific accounts
4. Generate and configure HMAC key
5. Add webhook HMAC key and optional username to hotel settings
6. You can add multiple merchant accounts for a single hotel - all will be associated with the same organization

### Phase 2: Data Synchronization

#### 2.1 Initial Mews Sync

1. After Mews connection is established, click "Sync Now" in hotel card
2. System will:
   - Fetch all guests from Mews
   - Fetch all bookings from Mews
   - Store in Firestore
   - Link bookings to guests

#### 2.2 Verify Data

1. Check hotel card shows sync status:
   - Last Sync Time
   - Guests Synced count
   - Bookings Synced count
2. Verify data appears correct

#### 2.3 Schedule Automatic Syncs

- Automatic sync runs daily at 2 AM UTC
- Manual sync can be triggered anytime from hotel card

### Phase 3: User Management

#### 3.1 Create Hotel Users

1. In hotel settings, go to "Users" tab
2. Add users:
   - Name
   - Email
   - Role (Manager or Staff)
3. Users will receive email to set up their account

#### 3.2 User Authentication Setup

1. Users receive email invitation
2. Click link to set password
3. Log in to Realyn dashboard
4. Users see only their hotel's disputes

### Phase 4: Testing and Verification

#### 4.1 Test Dispute Flow

1. Create a test dispute in PSP (Stripe test mode, etc.)
2. Verify webhook is received
3. Check dispute appears in dashboard
4. Verify dispute is auto-matched to Mews guest/booking (if data exists)

#### 4.2 Test Matching Logic

The system automatically matches disputes to PMS data using:
- Transaction amount (exact match)
- Transaction date (within 1 day tolerance)
- Last 4 digits of card (if available)

Match confidence levels:
- **High**: Amount + Date + Last4 match
- **Medium**: Amount + Date match
- **Low**: Only one criterion matches

#### 4.3 Verify Automation Settings

1. Go to "Automation" tab in hotel settings
2. Configure:
   - Auto-submission enabled/disabled
   - Minimum amount for auto-submission
   - Auto-mark as "not contested" for small amounts

## Post-Onboarding

### Daily Operations

1. **Monitor Disputes**
   - Dashboard shows all disputes in real-time
   - Filter by status, date, reason
   - Sort by any column

2. **Review Auto-Matches**
   - Check disputes with "high" or "medium" confidence matches
   - Verify guest/booking information is correct
   - Manually link if auto-match failed

3. **Process Disputes**
   - Review AI-generated draft responses
   - Approve or edit responses
   - Submit evidence to PSP
   - Track dispute status

4. **Mews Sync**
   - Automatic daily sync at 2 AM UTC
   - Manual sync available anytime
   - Check sync status in hotel card

### Weekly Tasks

1. Review dispute analytics
2. Check for unmatched disputes
3. Verify Mews sync is working correctly
4. Review automation settings

### Monthly Tasks

1. Review portfolio analytics (for admins)
2. Audit dispute resolution rates
3. Review and update hotel documents
4. Check user access and permissions

## Troubleshooting

### Common Issues

**Issue: Disputes not appearing**
- Check webhook is configured correctly in PSP dashboard
- Verify webhook endpoint is accessible
- Check Cloud Functions logs

**Issue: Mews sync failing**
- Verify Mews credentials are correct
- Check Mews API access permissions
- Review Cloud Functions logs for errors

**Issue: Disputes not matching to guests**
- Verify Mews sync completed successfully
- Check transaction amounts/dates match
- Verify last 4 digits are available

**Issue: Users can't log in**
- Verify user account exists in Firebase Auth
- Check user has correct organizationId
- Verify Firestore security rules allow access

## Support and Resources

### Documentation
- API Documentation: [Link to API docs]
- User Guide: [Link to user guide]
- Troubleshooting Guide: [Link to troubleshooting]

### Support Channels
- Email: support@realyn.com
- Phone: [Support phone number]
- Dashboard: Help section in app

### Training
- Onboarding video: [Link]
- Live training sessions: [Schedule]
- FAQ: [Link to FAQ]

## Security Considerations

### Credential Management
- PSP credentials stored encrypted in Firestore
- Mews credentials stored encrypted in Firestore
- Webhook secrets stored in Firebase Secret Manager (for Stripe global config)

### Access Control
- Role-based access (Admin vs User)
- Users can only see their hotel's data
- Admins can see all hotels

### Data Privacy
- Guest data synced from Mews is stored securely
- Dispute data is encrypted in transit and at rest
- Compliance with PCI DSS requirements

## Next Steps After Onboarding

1. **Week 1**: Monitor all disputes, verify matching accuracy
2. **Week 2**: Review and optimize automation settings
3. **Week 3**: Train hotel staff on dispute management workflow
4. **Month 1**: Review analytics and adjust processes

## Appendix: Technical Details

### Webhook Endpoints

- Stripe: `https://stripewebhook-cltbxmmndq-uc.a.run.app`
- Adyen: `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook`

### Mews Sync Endpoints

- Manual Sync: `https://us-central1-realyn-app.cloudfunctions.net/mewsManualSync`
- Connection Test: `https://us-central1-realyn-app.cloudfunctions.net/mewsConnectionTest`
- Scheduled Sync: Runs automatically daily at 2 AM UTC

### Firestore Collections

- `organizations` - Hotel/property data
- `disputes` - Payment disputes
- `guests` - Guest data from Mews
- `bookings` - Booking data from Mews
- `users` - User accounts and authentication

### Required Firestore Indexes

Indexes are configured in `firestore.indexes.json`:
- Disputes: `organizationId + createdAt`
- Disputes: `pspProvider + pspDisputeId`
- Bookings: `organizationId + pmsProvider + totalAmount + currency + paymentDate`
- Guests: `organizationId + pmsProvider + email`

