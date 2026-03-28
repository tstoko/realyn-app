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

# Run dashboard dev server (port 3001) — connects to live Firebase
npm run dev:dashboard

# Run with local Firebase emulators (recommended for development)
npm run dev:emulators          # Start emulators only (in one terminal)
npm run dev:dashboard           # Start dashboard (in another terminal)
# Or run both together:
npm run dev:dashboard:emulators

# Build dashboard
npm run build:dashboard

# Type-check Cloud Functions
cd functions && npx tsc --noEmit

# Type-check dashboard
cd packages/dashboard && npx tsc --noEmit
```

### Firebase Emulators

Local emulators for Auth, Firestore, Storage, and Functions are configured. The dashboard connects to emulators by default (`VITE_USE_FIREBASE_EMULATORS=true` in `packages/dashboard/.env`). The marketing website is **not** affected — it always hits production Firebase.

| Service        | Port  | Emulator UI                        |
|----------------|-------|------------------------------------|
| Auth           | 9099  | http://127.0.0.1:4000/auth        |
| Firestore      | 8080  | http://127.0.0.1:4000/firestore   |
| Storage        | 9199  | http://127.0.0.1:4000/storage     |
| Functions      | 5001  | http://127.0.0.1:4000/functions   |
| Emulator UI    | 4000  | http://127.0.0.1:4000             |

**Prerequisites:** Java 17+ (`brew install openjdk@17`).

**Seed data:** After emulators start, call `http://127.0.0.1:5001/realyn-app/us-central1/seedDemoData` to populate test data. Emulator data persists in `./emulator-data/` between restarts.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Firebase Cloud Functions, Firestore, Firebase Auth, Firebase Storage
- **AI:** Anthropic Claude (evidence planning, argument generation)
- **PSP Integrations:** Stripe, Adyen (adapter pattern — extensible)
- **PMS Integrations:** Opera Cloud OHIP, Opera CSV/XML/delimited imports (adapter pattern — extensible)
