#!/bin/bash
# Azure Infrastructure Setup Script for Realyn App
# This script creates all required Azure resources for the Realyn migration

set -e

# Configuration
RESOURCE_GROUP="realyn-prod-rg"
LOCATION="westeurope"
ENVIRONMENT="prod"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Realyn Azure Infrastructure Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed.${NC}"
    echo "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in to Azure
echo -e "${YELLOW}Checking Azure login status...${NC}"
if ! az account show &> /dev/null; then
    echo -e "${YELLOW}Not logged in. Running 'az login'...${NC}"
    az login
fi

# Show current subscription
SUBSCRIPTION=$(az account show --query name -o tsv)
echo -e "${GREEN}Using subscription: ${SUBSCRIPTION}${NC}"
echo ""

# Confirm before proceeding
read -p "Do you want to create resources in subscription '${SUBSCRIPTION}'? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Step 1: Create Resource Group
echo ""
echo -e "${YELLOW}Step 1: Creating resource group '${RESOURCE_GROUP}'...${NC}"
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION \
    --output table

# Step 2: Deploy Bicep template
echo ""
echo -e "${YELLOW}Step 2: Deploying infrastructure (this may take 5-10 minutes)...${NC}"
DEPLOYMENT_OUTPUT=$(az deployment group create \
    --resource-group $RESOURCE_GROUP \
    --template-file ../infrastructure/main.bicep \
    --parameters environment=$ENVIRONMENT \
    --query properties.outputs \
    --output json)

# Extract outputs
COSMOS_ACCOUNT=$(echo $DEPLOYMENT_OUTPUT | jq -r '.cosmosAccountName.value')
COSMOS_ENDPOINT=$(echo $DEPLOYMENT_OUTPUT | jq -r '.cosmosEndpoint.value')
STORAGE_ACCOUNT=$(echo $DEPLOYMENT_OUTPUT | jq -r '.storageAccountName.value')
KEY_VAULT_NAME=$(echo $DEPLOYMENT_OUTPUT | jq -r '.keyVaultName.value')
KEY_VAULT_URI=$(echo $DEPLOYMENT_OUTPUT | jq -r '.keyVaultUri.value')
FUNCTION_APP_NAME=$(echo $DEPLOYMENT_OUTPUT | jq -r '.functionAppName.value')
FUNCTION_APP_URL=$(echo $DEPLOYMENT_OUTPUT | jq -r '.functionAppUrl.value')
STATIC_WEB_APP_NAME=$(echo $DEPLOYMENT_OUTPUT | jq -r '.staticWebAppName.value')
STATIC_WEB_APP_URL=$(echo $DEPLOYMENT_OUTPUT | jq -r '.staticWebAppUrl.value')

# Step 3: Add secrets to Key Vault
echo ""
echo -e "${YELLOW}Step 3: Setting up Key Vault secrets...${NC}"
echo -e "${YELLOW}You will be prompted to enter sensitive values.${NC}"
echo ""

read -sp "Enter OPENAI_API_KEY: " OPENAI_API_KEY
echo ""
az keyvault secret set \
    --vault-name $KEY_VAULT_NAME \
    --name "OPENAI-API-KEY" \
    --value "$OPENAI_API_KEY" \
    --output none
echo -e "${GREEN}✓ OPENAI_API_KEY stored${NC}"

# Generate a secure encryption key
ENCRYPTION_KEY=$(openssl rand -base64 32)
az keyvault secret set \
    --vault-name $KEY_VAULT_NAME \
    --name "ENCRYPTION-KEY" \
    --value "$ENCRYPTION_KEY" \
    --output none
echo -e "${GREEN}✓ ENCRYPTION_KEY generated and stored${NC}"

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Resources created:"
echo -e "  ${YELLOW}Resource Group:${NC}    $RESOURCE_GROUP"
echo -e "  ${YELLOW}Cosmos DB:${NC}         $COSMOS_ACCOUNT"
echo -e "  ${YELLOW}Storage Account:${NC}   $STORAGE_ACCOUNT"
echo -e "  ${YELLOW}Key Vault:${NC}         $KEY_VAULT_NAME"
echo -e "  ${YELLOW}Function App:${NC}      $FUNCTION_APP_NAME"
echo -e "  ${YELLOW}Static Web App:${NC}    $STATIC_WEB_APP_NAME"
echo ""
echo -e "URLs:"
echo -e "  ${YELLOW}Function App:${NC}      $FUNCTION_APP_URL"
echo -e "  ${YELLOW}Static Web App:${NC}    $STATIC_WEB_APP_URL"
echo -e "  ${YELLOW}Key Vault:${NC}         $KEY_VAULT_URI"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Deploy Azure Functions: cd azure/functions && npm run deploy"
echo "2. Deploy Static Web App: Follow GitHub Actions setup instructions"
echo "3. Update webhook URLs in Stripe/Adyen dashboards to: ${FUNCTION_APP_URL}/api/stripeWebhook"
echo ""

# Save configuration to file
CONFIG_FILE="../.azure-config"
cat > $CONFIG_FILE << EOF
# Azure Configuration (auto-generated)
RESOURCE_GROUP=$RESOURCE_GROUP
COSMOS_ACCOUNT=$COSMOS_ACCOUNT
COSMOS_ENDPOINT=$COSMOS_ENDPOINT
STORAGE_ACCOUNT=$STORAGE_ACCOUNT
KEY_VAULT_NAME=$KEY_VAULT_NAME
KEY_VAULT_URI=$KEY_VAULT_URI
FUNCTION_APP_NAME=$FUNCTION_APP_NAME
FUNCTION_APP_URL=$FUNCTION_APP_URL
STATIC_WEB_APP_NAME=$STATIC_WEB_APP_NAME
STATIC_WEB_APP_URL=$STATIC_WEB_APP_URL
EOF

echo -e "${GREEN}Configuration saved to ${CONFIG_FILE}${NC}"
