# Adyen Integration Guide for Realyn

## Required Keys

1. **API Key**
2. **Webhook HMAC Key**
3. **Merchant Account Codes** (can be multiple)

## How to Get the Required Keys

### Step 1: Sign in to your Adyen portal

Go to [Adyen Customer Area](https://ca-test.adyen.com) or [Adyen Live](https://ca-live.adyen.com)

### Step 2: Sign in to your Adyen Live account

Make sure you're using your Live account for production integrations.

---

## 1st Required Key - API Key

### Step 3: Make sure you are on company level

Navigate to the company level in your Adyen account (not merchant account level).

### Step 4: Go to API credentials

In the left sidebar, navigate to **Settings** → **API credentials**

### Step 5: Click on Create new credential

Click the **"Create new credential"** button.

### Step 6: Select Web service user, add Realyn to the Description

- Select **"Web service user"** as the credential type
- In the Description field, enter: **Realyn**
- Click **"Create credential"**

### Step 7: Copy API Key

**⚠️ IMPORTANT:** Copy the API Key immediately and save it in a secure location. You will need it for the next several minutes to complete the setup.

The API Key will look like: `AQEyhmfxLYzKbhNGw0m/n3Q5qf3Vao5bG4pJVHBU6nGml3JOmvK5QByZcQoskYocsOZYgG8QwV1bDb7kfNy1WIxIIkxgBw==-2lzTWRmxRlcJzLYdVk+ytdbA9uDKtbPoywoSvukHaT8=-i1i5XYwcfC@eYn2P5.%`

### Step 8: Add Permissions

1. Click on the newly created credential
2. Under **Permissions**, select **"API dispute management"**
3. Under **Account**, select **"Company account"**
4. Click **"Save changes"**

---

## 2nd Required Key - Webhook HMAC Key

### Step 9: Go to Webhooks

In the left sidebar, navigate to **Settings** → **Webhooks**

### Step 10: Press Create New Webhook

Click the **"Create new webhook"** button.

### Step 11: Press Add on Standard Webhook

Select **"Standard webhook"** and click **"Add"**

### Step 12: Select All Merchant Accounts

In the **Merchant accounts** section, select **"All merchant accounts"** (or select specific merchant accounts if you prefer)

### Step 13: Pass the URL

Enter the Realyn webhook URL:
```
https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook
```

### Step 14: Make sure TLS 1.3 is selected

In the **Security** section, ensure **TLS 1.3** is selected.

### Step 15: Generate HMAC Key

1. Click **"Generate HMAC key"** button
2. **⚠️ IMPORTANT:** Copy the HMAC Key immediately and save it in a secure location. You will need it to complete the setup in Realyn.

The HMAC Key will look like: `5A4BA43A46C1C4B3E84EFA170543ADC37E8016A261EEEDA73A833837AB5937E3`

### Step 16: In Events Select all

In the **Events** section, select **"Select all"** to receive all event types.

### Step 17: In Additional settings check all checkboxes

Expand all sections (3D Secure, Acquirer, Bank, Card, Payment, POS, Risk) and check all checkboxes in each section.

### Step 18: Press Save Configuration

Click **"Save configuration"** to create the webhook.

---

## 3rd Required Key - Merchant Account Codes

### Step 19: Go to Merchant accounts under settings

Navigate to **Settings** → **Merchant accounts**

### Step 20: Write all of your Account codes

List all merchant account codes you want to connect to Realyn. You can have multiple merchant accounts for a single hotel.

Example:
- `BevvyclubLimitedECOM`
- `BevvyclubLimitedPOS`

---

## Final Step: Enter Credentials in Realyn

### Step 21: Go to Realyn Dashboard

1. Log in to your Realyn account
2. Navigate to **Manage Properties** (or **Hotels**)
3. Select your hotel or create a new one

### Step 22: Configure Adyen Integration

1. Go to the **Integrations** tab
2. Under **Payment Provider (PSP)**, select **"Adyen"**
3. Enter the following credentials:

   - **API Key**: Paste the API Key from Step 7
   - **Merchant Accounts**: Enter all your merchant account codes
     - Click **"Add"** to add each merchant account
     - You can add multiple accounts (e.g., `BevvyclubLimitedECOM`, `BevvyclubLimitedPOS`)
   - **Webhook HMAC Key**: Paste the HMAC Key from Step 15
   - **Webhook Username**: (Optional) If you configured basic authentication for your webhook

4. Click **"Test Connection"** to verify your credentials
5. Once the test is successful, click **"Save"**

### Step 23: Verify Integration

After saving, the integration status should show **"Connected"** (green badge).

---

## That's it! 👏

Your Adyen integration is now complete. Realyn will automatically:
- Receive dispute notifications from Adyen
- Match disputes to guest bookings
- Help you manage and respond to chargebacks

## Troubleshooting

### Connection Test Fails
- Verify the API Key is correct and has "API dispute management" permission
- Ensure you're using the Live API key (not Test)
- Check that at least one merchant account code is correct

### Webhooks Not Receiving
- Verify the webhook URL is correct: `https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook`
- Check that HMAC key matches the one in Adyen
- Ensure "Select all" events are enabled
- Check Adyen webhook logs for delivery status

### Multiple Merchant Accounts
- You can add multiple merchant accounts by clicking "Add" for each account
- All merchant accounts will be associated with the same hotel in Realyn
- Disputes from any of these merchant accounts will appear in your hotel's dashboard
- The first merchant account in the list will be used for API calls (Adyen API requires a single merchant account per call)



