# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Realyn is a PSP-agnostic, PMS-agnostic hotel chargeback dispute management platform. The active product is the dashboard in `packages/dashboard` — a React 19 / TypeScript / Vite frontend connected to Firebase (Firestore, Auth, Storage). The backend is in `functions/` (Firebase Cloud Functions, Node 20). Shared types and Firebase config live in `packages/shared`.

### Running the app

- **Dev server:** `npm run dev:dashboard` (from repo root) — starts Vite on `http://localhost:3001`
- **Build:** `npm run build:dashboard`
- **Type check dashboard:** `cd packages/dashboard && npx tsc --noEmit`
- **Type check functions:** `cd functions && npx tsc --noEmit`
- Standard commands are documented in the root `README.md`.

### Non-obvious caveats

- The root `postcss.config.js` and `tailwind.config.js` are legacy configs. They require `tailwindcss@3` (not v4) and `autoprefixer` as devDependencies at the root. These are not listed in the committed `package.json` so `npm install` alone won't work for builds — the update script handles this.
- The dashboard requires Firebase credentials to connect to a backend. Without a `.env` file or Firebase project, it will render the login page but authentication will fail.
- No ESLint config exists for the dashboard. The only ESLint config is in `functions/.eslintrc.js` (Firebase Cloud Functions).
- No test framework is configured. There are no automated tests to run.
- Demo login credentials are shown on the login page (e.g., `admin@realyn.com` / `masterpass`) — these work against the production/staging Firebase project.
