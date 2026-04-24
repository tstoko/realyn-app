# AI Evidence Planning System - Setup Guide

This guide explains how to set up and configure the AI Evidence Planning system for the Realyn dispute management app.

## Overview

The AI Evidence Planning system automatically generates evidence plans when disputes are created. It analyzes the dispute type, reason code, and available data to recommend:

1. **Fight or Accept** - Whether to contest the dispute
2. **Winnability Assessment** - How likely you are to win
3. **Evidence Requirements** - Specific documents and data needed

## Prerequisites

- Firebase project with Functions enabled
- OpenAI API key with access to GPT-4o
- Node.js 20 or later

## Environment Setup

### 1. Set OpenAI API Key as Firebase Secret

The OpenAI API key is stored as a Firebase Functions secret for security.

```bash
# Set the secret using Firebase CLI
firebase functions:secrets:set OPENAI_API_KEY

# When prompted, paste your OpenAI API key
```

### 2. Verify Secret is Set

```bash
firebase functions:secrets:access OPENAI_API_KEY
```

### 3. Deploy Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

## How It Works

### Automatic Evidence Planning

When a new dispute arrives via webhook (Stripe or Adyen):

1. The dispute is created/updated in Firestore
2. `triggerEvidencePlanning()` is called automatically
3. The system builds a `DisputeCase` from available data
4. OpenAI generates an `EvidencePlan`
5. The plan is saved to the dispute document
6. `lifecycleStatus` is set to `evidence_in_progress`

### Manual Evidence Planning

To manually trigger evidence planning for an existing dispute:

```bash
curl -X POST \
  "https://us-central1-YOUR-PROJECT.cloudfunctions.net/planEvidence?disputeId=DISPUTE_ID" \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "ORG_ID"}'
```

### Evidence Dashboard

Users can access the Evidence Dashboard from the dispute detail view:

- **AI Guided Mode**: Shows only relevant requirements based on the AI plan
- **Manual Mode**: Shows all evidence categories for custom upload

## Dispute Code Mapping

The system includes comprehensive mappings for:

- **Visa**: 10.x (Fraud), 11.x (Auth), 12.x (Processing), 13.x (Consumer)
- **Mastercard**: 4808, 4834, 4837, 4849, 4853, 4855, 4860, 4870, 4871
- **Amex**: A01-A08, C02-C32, F29-F31, P01-P08, R03, R13
- **Discover**: AA, AP, AW, DP, RG, RM, RN, PM, AT, DC, UA

Each code maps to:
- Required and optional evidence categories
- Default recommendation (fight/accept)
- Winnability assessment
- Hotel relevance rating

## API Endpoints

### POST /planEvidence
Generate evidence plan for a dispute.

**Query Parameters:**
- `disputeId`: The Firestore document ID

**Body:**
```json
{
  "organizationId": "org_123",
  "regenerate": false
}
```

### POST /updateEvidenceItem
Update status of an evidence item.

**Query Parameters:**
- `disputeId`: The Firestore document ID

**Body:**
```json
{
  "organizationId": "org_123",
  "requirementId": "req-1",
  "status": "uploaded",
  "fileId": "file_abc",
  "fileName": "folio.pdf"
}
```

### GET /getProgress
Get evidence completion progress.

**Query Parameters:**
- `disputeId`: The Firestore document ID

### POST /toggleAIPlan
Toggle between AI-guided and manual mode.

**Query Parameters:**
- `disputeId`: The Firestore document ID

**Body:**
```json
{
  "organizationId": "org_123",
  "useAIPlan": true
}
```

## Data Flow

```
Dispute Created (Webhook)
        ↓
Build DisputeCase
    - Dispute data
    - Booking data (from PMS)
    - Guest data (from PMS)
    - Hotel profile & policies
        ↓
Generate EvidencePlan (OpenAI)
    - Classify dispute type
    - Assess winnability
    - Generate requirements
        ↓
Save to Firestore
    - evidencePlan
    - evidenceItems (all pending)
    - lifecycleStatus = 'evidence_in_progress'
        ↓
User Uploads Evidence
    - Files stored in Firebase Storage
    - evidenceItems updated
        ↓
Check Completion
    - All required items uploaded?
    - lifecycleStatus = 'draft_ready'
```

## Firestore Schema Updates

The following fields are added to dispute documents:

```typescript
interface Dispute {
  // ... existing fields ...
  
  // AI Evidence Planning
  evidencePlan?: EvidencePlan;
  evidencePlanGeneratedAt?: Timestamp;
  evidenceItems?: EvidenceItem[];
  useAIPlan?: boolean;
}
```

## Testing

### Local Testing

Run the test script to validate the AI logic without calling OpenAI:

```bash
cd functions
npx ts-node scripts/test-ai-dispute.ts
```

### Testing with Real API

1. Set `OPENAI_API_KEY` environment variable
2. Deploy functions to Firebase
3. Create a test dispute via webhook or manually
4. Check Firestore for the generated evidence plan

## Troubleshooting

### Evidence plan not generated

1. Check Firebase Functions logs for errors
2. Verify `OPENAI_API_KEY` secret is set
3. Ensure dispute has a valid `reason` field
4. Check if `organizationId` matches

### API rate limits

The system uses `temperature: 0.2` and retries with exponential backoff. If you hit rate limits:

1. Reduce concurrent webhook processing
2. Consider upgrading OpenAI API tier
3. Add caching for similar dispute types

### Invalid evidence plan structure

The system validates plans with Zod schemas. If validation fails:

1. Check the raw response in logs
2. The fallback plan generator will be used
3. Review the dispute code mapping for the reason code

## Cost Considerations

Each evidence plan generation makes 1 API call to GPT-4o. Typical costs:

- ~1,000 input tokens (dispute case)
- ~500-1,000 output tokens (evidence plan)
- Approximate cost: $0.01-0.02 per dispute

## Future Enhancements

1. **Argument Generator**: Phase 2 will add AI-generated dispute arguments
2. **Evidence Quality Scoring**: Rate uploaded evidence relevance
3. **Win Prediction Updates**: Refine predictions as evidence is uploaded
4. **Multi-language Support**: Generate plans in multiple languages

