# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Realyn is a PSP-agnostic, PMS-agnostic hotel chargeback dispute management platform. The active product is the dashboard in `packages/dashboard` — a React 19 / TypeScript / Vite frontend connected to Firebase (Firestore, Auth, Storage). The backend is in `functions/` (Firebase Cloud Functions, Node 20). Shared types and Firebase config live in `packages/shared`.

### Running the app

- **Dev server (production backend):** `npm run dev:dashboard` (from repo root) — starts Vite on `http://localhost:3001`, connects to live Firebase
- **Dev server (local emulators):** `npm run dev:emulators` in one terminal, then `npm run dev:dashboard` in another — or use `npm run dev:dashboard:emulators` to run both together
- **Build:** `npm run build:dashboard`
- **Type check dashboard:** `cd packages/dashboard && npx tsc --noEmit`
- **Type check functions:** `cd functions && npx tsc --noEmit`
- Standard commands are documented in the root `README.md`.

### Firebase Emulators

The project has a full Firebase Emulator Suite configured for local development (Auth, Firestore, Storage, Functions, Emulator UI). Emulator connections are gated on `VITE_USE_FIREBASE_EMULATORS=true` in `packages/shared/src/services/firebase.ts`.

- **Dashboard** (`packages/dashboard/.env`) sets `VITE_USE_FIREBASE_EMULATORS=true` — hits local emulators by default in dev.
- **Website** (`packages/website/.env.development`) does NOT set this flag — always hits production Firebase, even in dev mode. **Do not add the emulator flag to the website env.**
- **Emulator UI:** `http://127.0.0.1:4000` — view/edit Auth users, Firestore data, Storage files.
- **Emulator data persistence:** Data is exported/imported from `./emulator-data/` between restarts.
- **Functions secrets:** `functions/.env` holds placeholder secrets for `defineSecret` values (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY). Replace with real test keys if needed.
- **Seed data:** Call seed functions at `http://127.0.0.1:5001/realyn-app/us-central1/seedDemoData` (or `seedUsersHandler`, `seedOrganizationsHandler`, `seedTestDisputes`) after emulators start.
- **Java requirement:** The Firestore emulator requires Java 17+. Installed via `brew install openjdk@17`; the npm scripts set `JAVA_HOME` automatically.

### Non-obvious caveats

- The root `postcss.config.js` and `tailwind.config.js` are legacy configs. They require `tailwindcss@3` (not v4) and `autoprefixer` as devDependencies at the root. These are not listed in the committed `package.json` so `npm install` alone won't work for builds — the update script handles this.
- The dashboard requires Firebase credentials to connect to a backend. Without a `.env` file or Firebase project, it will render the login page but authentication will fail. With emulators running, this is not an issue.
- No ESLint config exists for the dashboard. The only ESLint config is in `functions/.eslintrc.js` (Firebase Cloud Functions).
- No test framework is configured. There are no automated tests to run.
- Demo login credentials are shown on the login page (e.g., `admin@realyn.com` / `masterpass`) — these work against the production/staging Firebase project but NOT against a fresh emulator (you must seed users first).
