# Adyen TEST Environment Setup Guide for Realyn

## ⚠️ IMPORTANT: You MUST Use TEST API Keys

If you're testing, you **MUST** use a TEST API key that starts with `test_`. Do NOT use LIVE API keys in TEST mode.

## Step-by-Step Setup

### 1. Get Your TEST API Key

1. Go to **Adyen TEST Customer Area**: https://ca-test.adyen.com
2. Navigate to **Developers → API credentials**
3. Click **"Create new credential"** or select an existing one
4. Select **"Web service user"** as credential type
5. Under **Permissions**, enable **"API dispute management"** ✅
   - ⚠️ **This is the ONLY permission you need** - do NOT enable "Checkout API" or other permissions
   - The connection test uses Disputes API, which only requires "API dispute management"
6. Under **Account**, select **"Company account"**
7. Click **"Save changes"**
8. **Copy the API Key** - it should start with `test_`
   - Example: `test_7CUIYT2CUNHYTANGGTSASTSSG42QV4H7`
   - ⚠️ **IMPORTANT**: Copy the entire key including all characters
   - The key will be long - make sure you get it all!

### 2. Get Your Merchant Accounts

1. In Adyen TEST Customer Area, go to **Account → Merchant accounts**
2. You'll see your merchant account codes (e.g., `BevvyclubLimitedECOM`, `BevvyclubLimitedPOS`)
3. Copy each merchant account code exactly as shown (case-sensitive)

### 3. Set Up Webhook

1. In Adyen TEST Customer Area, go to **Developers → Webhooks**
2. Click **"Create new webhook"**
3. Select **"Standard webhook"** and click **"Add"**
4. In **Merchant accounts**, select **"All merchant accounts"** or specific ones
5. Set **Webhook URL**: `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook`
6. Under **Events**, select:
   - `CHARGEBACK`
   - `SECOND_CHARGEBACK`
   - `CHARGEBACK_REVERSED`
   - `DEFENSE_DEBIT`
   - `NOTIFICATION_OF_CHARGEBACK`
7. Set a **Username** (e.g., `Realyn`)
8. Set a **Password** (generate a secure password)
9. Click **"Save"**
10. **Copy the Username and Password** - you'll need these

### 4. Enter Credentials in Realyn

1. Open your hotel in Realyn
2. Go to **Integrations** tab
3. Set **Payment Provider (PSP)** to **"Adyen"**

#### API Key Field:
- Enter your **TEST API key** (must start with `test_`)
- The UI will show "TEST Environment" badge when detected
- ⚠️ If you see "LIVE Environment" badge, you're using the wrong key!

#### Merchant Accounts Field:
- Click in the "Add Merchant Account" field
- Type your first merchant account (e.g., `BevvyclubLimitedECOM`)
- Press Enter or click "Add"
- Repeat for additional merchant accounts (e.g., `BevvyclubLimitedPOS`)

#### Webhook Username Field:
- Enter the username you set in Adyen webhook settings

#### Webhook Password Field:
- Enter the password you set in Adyen webhook settings

#### Live Endpoint Prefix Field:
- **Leave this EMPTY** for TEST environment
- This field should be hidden when TEST key is detected

### 5. Test Connection

1. Click **"Test Connection"** button
2. You should see: **"Adyen connection successful (TEST environment)"**
3. If you see an error:
   - Check that your API key starts with `test_`
   - Verify merchant account codes match exactly (case-sensitive)
   - Ensure API key has "API dispute management" permission
   - Check that webhook username/password are correct

### 6. Save

1. Click **"Save"** to save your hotel configuration
2. The integration status should show as **"connected"**

## Troubleshooting

### Error: "Invalid API key or merchant account"

**Possible causes:**
- Using LIVE API key instead of TEST key
- API key copied incorrectly (missing characters at the end - this is common!)
- API key doesn't have "API dispute management" permission enabled
- Merchant account code doesn't match exactly (check case sensitivity)
- API key was revoked or expired

**Solution:**
1. Go to Adyen TEST Customer Area → Developers → API credentials
2. Click on your API credential
3. Verify "API dispute management" permission is checked ✅
4. Click "Show API key" to reveal the full key
5. Copy the ENTIRE key (it's long - scroll to see it all)
6. Paste it into a text editor first to verify you got it all
7. Then copy from the text editor into Realyn
8. Verify merchant account codes match exactly (case-sensitive)

### Error: "401 Unauthorized"

**Possible causes:**
- Wrong environment (LIVE key in TEST mode or vice versa)
- Invalid API key
- Missing permissions

**Solution:**
- Use a TEST API key (starts with `test_`) for TEST environment
- Verify API key is complete and correct
- Check API key permissions in Adyen

### UI Shows "LIVE Environment" but I'm in TEST

**Problem:** You're using a LIVE-formatted API key in TEST mode.

**Solution:** 
- Get a TEST API key from Adyen TEST Customer Area
- TEST keys start with `test_`
- LIVE keys are long (100+ chars) with `==` and `-` separators

## Quick Checklist

- [ ] Using Adyen TEST Customer Area (https://ca-test.adyen.com)
- [ ] API key starts with `test_`
- [ ] API key has "API dispute management" permission
- [ ] Merchant account codes copied exactly (case-sensitive)
- [ ] Webhook created with correct URL
- [ ] Webhook username and password set
- [ ] All credentials entered in Realyn UI
- [ ] "Test Connection" shows success
- [ ] Hotel saved successfully

## Need Help?

If you're still having issues:
1. Check the error message in the UI
2. Verify all credentials in Adyen TEST Customer Area
3. Make sure you're using TEST environment (not LIVE)
4. Contact support with the specific error message

