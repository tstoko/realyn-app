# Test Environment Reset

## Overview
Script to completely reset the test environment by deleting all data except the admin account, then creating a clean test Stripe organization ready for webhook testing.

## What Gets Deleted

- ✅ All disputes (chargeback data)
- ✅ All guests (PMS guest data)
- ✅ All bookings (PMS booking data)
- ✅ All organizations
- ✅ All Firestore users (except admin)
- ✅ All Firebase Auth users (except admin)

## What Gets Preserved

- ✅ Admin user (`admin@realyn.com`) in both Firebase Auth and Firestore
- ✅ Firebase configuration
- ✅ Function deployments

## What Gets Created

- ✅ New test Stripe organization:
  - ID: `test_stripe_org`
  - Name: "Test Stripe Hotel"
  - Location: "San Francisco, CA"
  - Stripe integration (status: `not_connected`, empty credentials)

## Usage

### Method 1: Via HTTP Endpoint (After Deployment)

1. **Deploy the function:**
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions:resetTestEnvironmentHandler
   ```

2. **Call the endpoint:**
   ```bash
   curl -X POST https://us-central1-realyn-app.cloudfunctions.net/resetTestEnvironmentHandler
   ```

### Method 2: Run Script Locally

```bash
cd functions
npx ts-node src/scripts/resetTestEnvironment.ts
```

### Method 3: Via Firebase Console

1. Go to Firebase Console → Functions
2. Find `resetTestEnvironmentHandler`
3. Click "Test" and send POST request

## Response Format

```json
{
  "success": true,
  "message": "Test environment reset completed",
  "summary": {
    "disputesDeleted": 10,
    "guestsDeleted": 50,
    "bookingsDeleted": 30,
    "organizationsDeleted": 3,
    "firestoreUsersDeleted": 5,
    "authUsersDeleted": 5,
    "testOrgCreated": true,
    "adminPreserved": true,
    "errors": []
  },
  "organizationId": "test_stripe_org"
}
```

## Safety Features

1. **Admin Verification**: Verifies admin exists before starting
2. **Admin Preservation**: Skips admin in all deletion operations
3. **Final Verification**: Confirms admin still exists after cleanup
4. **Error Handling**: Continues on non-critical errors, logs all issues
5. **Detailed Logging**: Logs every step for audit trail

## Verification Checklist

After running reset, verify:

- [ ] Only admin user exists in Firebase Auth
- [ ] Only admin user document in Firestore `users` collection
- [ ] `disputes` collection is empty
- [ ] `guests` collection is empty
- [ ] `bookings` collection is empty
- [ ] Only one organization exists: `test_stripe_org`
- [ ] Test organization has Stripe integration structure
- [ ] Admin can still login to dashboard
- [ ] No errors in function logs

## Next Steps After Reset

1. **Add Stripe Credentials** (via UI or Firestore):
   - Go to dashboard → Settings → Integrations
   - Add Stripe secret key and webhook secret
   - Set status to `connected`

2. **Test Webhook**:
   - Use Stripe CLI to forward webhooks
   - Trigger test dispute
   - Verify dispute appears in Firestore and dashboard

3. **Verify Organization**:
   - Login as admin
   - Select "Test Stripe Hotel" organization
   - Verify Stripe integration shows as connected

## Important Warnings

⚠️ **IRREVERSIBLE**: This deletes all data except admin account
⚠️ **TEST ONLY**: Only run in test/development environment
⚠️ **BACKUP**: Consider backing up data before running
⚠️ **ADMIN REQUIRED**: Script will fail if admin user doesn't exist
⚠️ **PRODUCTION**: Never run in production environment

## Troubleshooting

### Error: "Admin user not found"
- Ensure admin user exists: `admin@realyn.com`
- Run seed users script if needed: `firebase functions:call seedUsersHandler`

### Error: "Permission denied"
- Check Firebase project permissions
- Ensure you're using correct project
- Verify Firestore rules allow admin operations

### Error: "Collection not found"
- This is normal if collection is empty
- Script will continue and log "already empty"

### Admin User Deleted
- This should never happen (script has safety checks)
- If it does, restore admin user manually:
  ```bash
  # Via seed users script
  firebase functions:call seedUsersHandler
  ```

## Files Created

- `functions/src/scripts/resetTestEnvironment.ts` - Main reset script
- `functions/src/handlers/resetTestEnvironment.ts` - HTTP handler
- `TEST_ENVIRONMENT_RESET.md` - This documentation

## Files Modified

- `functions/src/index.ts` - Added export for reset handler



