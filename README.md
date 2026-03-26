# Realyn

PSP-agnostic, PMS-agnostic hotel chargeback dispute management platform.

## Structure

- `packages/dashboard` — React 19 / TypeScript / Vite dashboard (Firebase-connected)
- `packages/shared` — Shared types, Firebase config, hooks
- `packages/website` — Marketing website
- `functions/` — Firebase Cloud Functions backend (Node 20, TypeScript)

## Development

```bash
# Install dependencies
npm install

# Run dashboard dev server (port 3001)
npm run dev:dashboard

# Build dashboard
npm run build:dashboard

# Type-check Cloud Functions
cd functions && npx tsc --noEmit

# Type-check dashboard
cd packages/dashboard && npx tsc --noEmit
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Firebase Cloud Functions, Firestore, Firebase Auth, Firebase Storage
- **AI:** Anthropic Claude (evidence planning, argument generation)
- **PSP Integrations:** Stripe, Adyen (adapter pattern — extensible)
- **PMS Integrations:** Opera Cloud OHIP, Opera CSV/XML/delimited imports (adapter pattern — extensible)
