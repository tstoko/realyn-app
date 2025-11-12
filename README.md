# Realyn App - Stripe Disputes Dashboard

A full-stack React application for managing and monitoring Stripe payment disputes, built with Firebase and TypeScript.

## Features

- **Real-time Dispute Monitoring**: Automatically syncs disputes from Stripe via webhooks
- **Advanced Filtering**: Filter disputes by status, date range, and more
- **Sortable Table**: Sort by any column (created date, amount, status, etc.)
- **Responsive Design**: Modern UI built with Tailwind CSS
- **Firebase Integration**: Secure backend with Firestore and Cloud Functions

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Firebase Functions (v2), Firestore
- **Payment Processing**: Stripe API
- **Deployment**: Firebase Hosting

## Project Structure

```
├── src/
│   ├── components/          # React components
│   │   ├── DisputesDashboard.tsx
│   │   ├── DisputeTable.tsx
│   │   ├── FilterControls.tsx
│   │   ├── Header.tsx
│   │   ├── Spinner.tsx
│   │   └── StatusBadge.tsx
│   ├── firebase.js          # Firebase configuration
│   └── types.ts             # TypeScript type definitions
├── functions/
│   └── src/
│       └── index.ts         # Stripe webhook handler
└── firestore.rules          # Firestore security rules
```

## Setup

### Prerequisites

- Node.js 20+
- Firebase CLI
- Stripe account

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

2. **Configure Firebase**:
   ```bash
   firebase login
   firebase use your-project-id
   ```

3. **Set Stripe secrets**:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

4. **Configure Stripe webhook**:
   - Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/test/webhooks)
   - Add endpoint: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/stripeWebhook`
   - Select events: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
   - Copy the webhook signing secret

5. **Deploy**:
   ```bash
   firebase deploy
   ```

## Development

### Run locally

```bash
# Start React app
npm start

# Deploy functions (for webhook testing, use Stripe CLI)
firebase deploy --only functions
```

### Test webhooks locally

```bash
# Install Stripe CLI
stripe listen --forward-to https://YOUR_FUNCTION_URL

# Trigger test event
stripe trigger charge.dispute.created
```

## Configuration

### Environment Variables

Secrets are managed via Firebase Secret Manager:
- `STRIPE_SECRET_KEY`: Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret from Stripe

### Firestore Rules

The `disputes` collection allows public read access. Cloud Functions have admin access for writes.

## Deployment

```bash
# Deploy everything
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

## Notes

- **Signature Verification**: Due to Firebase Functions v2 limitations, signature verification may be skipped when raw body is unavailable. For production, consider using v1 functions or Cloud Run.
- **Database Location**: Firestore is configured for `eur3` region. Update `firebase.json` if needed.

## License

Private - All rights reserved
