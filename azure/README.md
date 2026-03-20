# Azure Migration Guide

This directory contains all files needed to migrate Realyn from Firebase to Azure.

## Overview

The migration involves:
1. **Azure Infrastructure**: Cosmos DB, Key Vault, Functions, Static Web Apps, Blob Storage
2. **Backend Services**: Azure Functions replacing Firebase Cloud Functions
3. **Frontend Updates**: MSAL for auth, Azure API client, Blob Storage for files
4. **Data Migration**: Script to export from Firestore and import to Cosmos DB

## Directory Structure

```
azure/
├── infrastructure/
│   └── main.bicep          # Azure Resource Manager template
├── functions/
│   ├── src/
│   │   ├── functions/      # HTTP trigger handlers
│   │   │   ├── stripeWebhook.ts
│   │   │   ├── adyenWebhook.ts
│   │   │   └── aiDisputeHandlers.ts
│   │   ├── services/       # Business logic
│   │   │   ├── cosmosClient.ts
│   │   │   ├── keyVaultClient.ts
│   │   │   ├── storageClient.ts
│   │   │   ├── organizationService.ts
│   │   │   ├── disputeService.ts
│   │   │   └── aiService.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   ├── setup-azure.sh      # Infrastructure deployment script
│   └── migrate-data.ts     # Data migration script
└── README.md
```

## Prerequisites

1. **Azure CLI** installed and logged in
2. **Node.js 20+** installed
3. **Firebase Admin SDK** service account key (for migration)
4. **Stripe/Adyen** credentials for testing webhooks

## Step 1: Deploy Azure Infrastructure

```bash
# Navigate to scripts directory
cd azure/scripts

# Make script executable
chmod +x setup-azure.sh

# Run the setup script
./setup-azure.sh
```

This creates:
- Resource Group: `realyn-prod-rg`
- Cosmos DB: Serverless account with `disputes`, `organizations`, `users` containers
- Key Vault: For secrets (OpenAI key, encryption key)
- Function App: Node.js 20 runtime
- Static Web App: For React frontend
- Storage Account: For evidence files

## Step 2: Deploy Azure Functions

```bash
# Navigate to functions directory
cd azure/functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy to Azure (requires Azure CLI)
npm run deploy
```

## Step 3: Migrate Data

```bash
# Set environment variables
export FIREBASE_SERVICE_ACCOUNT=./path/to/firebase-service-account.json
export COSMOS_CONNECTION="your-cosmos-connection-string"
export COSMOS_DATABASE="realyn"

# Run migration
cd azure/scripts
npx ts-node migrate-data.ts
```

The script will:
1. Export all documents from Firestore
2. Remove PMS-related fields (pmsProvider, pmsGuestId, etc.)
3. Convert Timestamps to ISO strings
4. Save backups to `azure/backups/`
5. Import to Cosmos DB

## Step 4: Update Webhook URLs

Update your PSP dashboards with the new webhook endpoints:

### Stripe
1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Edit your webhook endpoint
3. Change URL to: `https://<your-function-app>.azurewebsites.net/api/stripeWebhook`

### Adyen
1. Go to Adyen Customer Area > Webhooks
2. Edit your webhook configuration
3. Change URL to: `https://<your-function-app>.azurewebsites.net/api/adyenWebhook`

## Step 5: Update Frontend

Add environment variables to your `.env` file:

```env
# Azure Configuration
VITE_AZURE_FUNCTION_URL=https://<your-function-app>.azurewebsites.net
VITE_AZURE_STORAGE_URL=https://<your-storage-account>.blob.core.windows.net
VITE_AZURE_AD_B2C_CLIENT_ID=<your-client-id>
VITE_AZURE_AD_B2C_AUTHORITY=https://<your-tenant>.b2clogin.com/<your-tenant>.onmicrosoft.com/<policy-name>
```

Then import and use the Azure services:

```typescript
import { azureApi, isAzureConfigured } from './services/azure';

// Check if Azure is configured
if (isAzureConfigured()) {
  // Use Azure API
  const { disputes } = await azureApi.getDisputes(organizationId);
}
```

## Step 6: Deploy Static Web App

1. Connect your GitHub repository to Azure Static Web Apps
2. Configure the build:
   - App location: `/`
   - Output location: `build`
   - API location: (leave empty - we use separate Function App)
3. Push to trigger deployment

## Environment Variables (Azure Functions)

These are automatically configured by the Bicep template:
- `COSMOS_CONNECTION` - Cosmos DB connection string
- `COSMOS_DATABASE` - Database name ("realyn")
- `KEY_VAULT_URL` - Key Vault URL for secrets
- `STORAGE_CONNECTION` - Storage account connection string

## Key Vault Secrets

The setup script creates these secrets:
- `OPENAI-API-KEY` - Your OpenAI API key
- `ENCRYPTION-KEY` - Generated encryption key for credentials

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stripeWebhook` | POST | Stripe dispute webhooks |
| `/api/adyenWebhook` | POST | Adyen dispute webhooks |
| `/api/getDisputes` | GET | Get disputes by organization |
| `/api/planEvidence` | POST | Generate AI evidence plan |
| `/api/draftArgument` | POST | Generate AI argument |
| `/api/updateEvidenceItem` | POST | Update evidence status |

## Rollback Plan

If issues occur:

1. **Keep Firebase running** for 30 days during parallel operation
2. **Webhook failover**: Configure both Firebase and Azure URLs in PSP dashboard
3. **Data backup**: All exported data is saved in `azure/backups/`

## Troubleshooting

### Cosmos DB Connection Issues
```bash
# Test connection
az cosmosdb show --name <account-name> --resource-group realyn-prod-rg
```

### Key Vault Access Issues
```bash
# Check function app identity
az webapp identity show --name <function-app-name> --resource-group realyn-prod-rg

# Check Key Vault access policies
az keyvault show --name <vault-name>
```

### Function Deployment Issues
```bash
# Check deployment logs
az functionapp deployment list-publishing-profiles --name <function-app> --resource-group realyn-prod-rg

# Stream logs
func azure functionapp logstream <function-app-name>
```

## Cost Estimation

| Resource | Tier | Estimated Monthly Cost |
|----------|------|------------------------|
| Cosmos DB | Serverless | ~$25-50 (usage-based) |
| Functions | Consumption | ~$0-20 (usage-based) |
| Key Vault | Standard | ~$3 |
| Storage | Standard LRS | ~$5-20 |
| Static Web App | Standard | $9 |
| **Total** | | **~$42-102/month** |

## Security Checklist

- [ ] Key Vault RBAC enabled
- [ ] Function App managed identity configured
- [ ] Storage account public access disabled
- [ ] CORS configured for Static Web App domain only
- [ ] Webhook signatures verified
- [ ] Encryption key stored in Key Vault (not environment variables)

## Next Steps After Migration

1. Monitor Azure Functions logs for errors
2. Verify webhook delivery in Stripe/Adyen dashboards
3. Test dispute creation and evidence planning
4. Disable Firebase billing after 30-day parallel operation
