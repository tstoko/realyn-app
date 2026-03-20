// Azure Infrastructure for Realyn App
// Deploy with: az deployment group create --resource-group realyn-prod-rg --template-file main.bicep

@description('Environment name')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'prod'

@description('Location for all resources')
param location string = resourceGroup().location

@description('Base name for resources')
param baseName string = 'realyn'

// Unique suffix for globally unique names
var uniqueSuffix = uniqueString(resourceGroup().id)
var resourcePrefix = '${baseName}-${environment}'

// ============================================================
// Cosmos DB Account
// ============================================================
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: '${resourcePrefix}-cosmos-${uniqueSuffix}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    enableFreeTier: environment == 'dev'
  }
}

// Cosmos DB Database
resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosAccount
  name: 'realyn'
  properties: {
    resource: {
      id: 'realyn'
    }
  }
}

// Cosmos DB Containers
resource disputesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'disputes'
  properties: {
    resource: {
      id: 'disputes'
      partitionKey: {
        paths: ['/organizationId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [
          { path: '/*' }
        ]
        excludedPaths: [
          { path: '/"_etag"/?' }
        ]
      }
    }
  }
}

resource organizationsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'organizations'
  properties: {
    resource: {
      id: 'organizations'
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
    }
  }
}

resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: {
        paths: ['/organizationId']
        kind: 'Hash'
      }
    }
  }
}

// ============================================================
// Storage Account (for evidence files)
// ============================================================
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: '${baseName}${environment}${uniqueSuffix}'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// Blob container for evidence files
resource evidenceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/evidence'
  properties: {
    publicAccess: 'None'
  }
}

// ============================================================
// Key Vault
// ============================================================
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${resourcePrefix}-kv-${uniqueSuffix}'
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

// ============================================================
// App Service Plan (for Azure Functions)
// ============================================================
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${resourcePrefix}-plan'
  location: location
  kind: 'functionapp'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
}

// ============================================================
// Function App
// ============================================================
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: '${resourcePrefix}-func-${uniqueSuffix}'
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      nodeVersion: '~20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: '${resourcePrefix}-func'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'COSMOS_CONNECTION'
          value: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
        }
        {
          name: 'COSMOS_DATABASE'
          value: 'realyn'
        }
        {
          name: 'KEY_VAULT_URL'
          value: keyVault.properties.vaultUri
        }
        {
          name: 'STORAGE_CONNECTION'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
      ]
    }
  }
}

// ============================================================
// Static Web App (for React frontend)
// ============================================================
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: '${resourcePrefix}-web-${uniqueSuffix}'
  location: 'westeurope' // Static Web Apps have limited region availability
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    buildProperties: {
      appLocation: '/'
      outputLocation: 'build'
      apiLocation: ''
    }
  }
}

// ============================================================
// Role Assignments
// ============================================================

// Function App can read secrets from Key Vault
resource functionAppKeyVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================
// Outputs
// ============================================================
output cosmosAccountName string = cosmosAccount.name
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output storageAccountName string = storageAccount.name
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output staticWebAppName string = staticWebApp.name
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
