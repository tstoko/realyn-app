# Adyen Integration - Simple Step-by-Step Guide

## Quick Start (5 Minutes)

Follow these exact steps to integrate Adyen with Realyn:

### Step 1: Get Your TEST API Key (2 minutes)

1. **Open**: https://ca-test.adyen.com
2. **Click**: Developers → API credentials
3. **Click**: "Create new credential" (or select existing)
4. **Select**: "Web service user"
5. **Enable Permission**: ✅ **"API dispute management"** (this is the ONLY one you need!)
6. **Select Account**: "Company account"
7. **Click**: "Save changes"
8. **Click**: "Show API key"
9. **Copy**: The entire API key (it starts with `test_` and is long - make sure you get it all!)

### Step 2: Get Your Merchant Accounts (30 seconds)

1. **Click**: Account → Merchant accounts
2. **Copy**: Each merchant account code exactly as shown
   - Example: `BevvyclubLimitedECOM`
   - Example: `BevvyclubLimitedPOS`
3. **Note**: These are case-sensitive!

### Step 3: Set Up Webhook (2 minutes)

1. **Click**: Developers → Webhooks
2. **Click**: "Create new webhook"
3. **Select**: "Standard webhook" → "Add"
4. **Merchant accounts**: Select "All merchant accounts" (or specific ones)
5. **Webhook URL**: Paste exactly: `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook`
6. **Events**: Select these 5 events:
   - ✅ CHARGEBACK
   - ✅ SECOND_CHARGEBACK
   - ✅ CHARGEBACK_REVERSED
   - ✅ DEFENSE_DEBIT
   - ✅ NOTIFICATION_OF_CHARGEBACK
7. **Username**: Enter `Realyn` (or any username you prefer)
8. **Password**: Generate a secure password (or use existing)
9. **Click**: "Save"
10. **Copy**: Username and password

### Step 4: Enter in Realyn (1 minute)

1. **Open**: Your hotel in Realyn
2. **Click**: "Integrations" tab
3. **Select**: Payment Provider (PSP) = **"Adyen"**

#### Enter Credentials:

- **API Key**: Paste your TEST API key (should show green "TEST Environment" badge)
- **Merchant Accounts**: 
  - Type first account → Press Enter or click "Add"
  - Type second account → Press Enter or click "Add"
- **Webhook Username**: Paste the username from Step 3
- **Webhook Password**: Paste the password from Step 3
- **Live Endpoint Prefix**: Leave empty (field should be hidden for TEST)

### Step 5: Test & Save (30 seconds)

1. **Click**: "Test Connection" button
2. **Expected**: "Adyen connection successful (TEST environment)" ✅
3. **If Error**: See troubleshooting below
4. **Click**: "Save Changes" at bottom

## ✅ Success Checklist

- [ ] API key starts with `test_`
- [ ] UI shows green "TEST Environment" badge
- [ ] "API dispute management" permission enabled in Adyen
- [ ] Merchant accounts added (both if you have multiple)
- [ ] Webhook created with correct URL
- [ ] Webhook username and password entered
- [ ] "Test Connection" shows success
- [ ] Hotel saved successfully

## ❌ Common Errors & Fixes

### "Invalid API key or merchant account"

**Most Common Causes:**
1. **API key incomplete** - Keys are long, make sure you copied it all!
2. **Missing permission** - Must have "API dispute management" enabled
3. **Wrong merchant account** - Check spelling and case (case-sensitive!)

**Fix:**
- Go back to Adyen → API credentials
- Click "Show API key" again
- Copy the ENTIRE key (scroll to see it all)
- Paste into a text editor first to verify length
- Then copy from editor into Realyn

### "401 Unauthorized"

**Cause**: API key doesn't have the right permission or is wrong

**Fix:**
- Verify "API dispute management" is checked ✅
- Make sure you're using TEST API key (starts with `test_`)
- Try creating a new API credential

### UI Shows "LIVE Environment" but I'm in TEST

**Cause**: You're using a LIVE-formatted API key

**Fix:**
- Get a TEST API key from https://ca-test.adyen.com
- TEST keys start with `test_`
- LIVE keys are long (100+ chars) with `==` and `-`

## 📞 Still Having Issues?

1. **Double-check** all credentials in Adyen TEST Customer Area
2. **Verify** API key is complete (not truncated)
3. **Confirm** "API dispute management" permission is enabled
4. **Check** merchant account codes match exactly (case-sensitive)
5. **Try** creating a fresh API credential

## 🎯 What You Need (Summary)

| Item | Where to Find | Example |
|------|--------------|---------|
| **API Key** | Developers → API credentials | `test_7CUIYT2CUNHYTANGGTSASTSSG42QV4H7` |
| **Merchant Accounts** | Account → Merchant accounts | `BevvyclubLimitedECOM` |
| **Webhook URL** | Use this exact URL | `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook` |
| **Webhook Username** | You create this | `Realyn` |
| **Webhook Password** | You create this | `eb)Ff*5H%(w,8-LqcS5n&DCD$` |

## 🔒 Security Note

- API keys and passwords are encrypted in Realyn
- Never share your API keys
- Use TEST keys for testing, LIVE keys for production
- Rotate credentials regularly

---

**That's it!** Once you see "Adyen connection successful", your integration is complete and ready to receive dispute notifications from Adyen.



