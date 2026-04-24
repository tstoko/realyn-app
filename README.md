# Realyn

PSP-agnostic, industry-agnostic chargeback dispute management platform — built first for **hospitality** and **ticketing**, with vertical-specific evidence rules and PMS / ops-system adapters (Opera, ticketing stacks, and similar).

## Structure

- `packages/dashboard` — React 19 / TypeScript / Vite dashboard (Firebase-connected)
- `packages/shared` — Shared types, Firebase config, hooks
- `packages/ai-core` — Portable AI pipeline (types, specialists, dispute/KB mapping); **source of truth** for LLM-facing logic. Published to `dist/` on build; consumed by `functions` and `packages/core`.
- `packages/core` — Shared business logic and PSP/PMS adapters, Jest tests; uses `@realyn/ai-core` for AI. Not imported by the dashboard or Cloud Functions at runtime today (keeps Functions deploy lean; optional future consolidation).
- `packages/website` — Marketing website
- `functions/` — Firebase Cloud Functions backend (Node 20, TypeScript); depends on `@realyn/ai-core` via `file:../packages/ai-core` plus Firestore/HTTP adapters

## Development

```bash
# Install dependencies
npm install

# Run dashboard dev server (port 3001)
# Connects to emulators or production depending on VITE_USE_FIREBASE_EMULATORS
# in packages/dashboard/.env (see .env.example for available options)
npm run dev:dashboard

# Run with local Firebase emulators (recommended for development)
npm run dev:emulators          # Start emulators only (in one terminal)
npm run dev:dashboard           # Start dashboard (in another terminal)
# Or run both together:
npm run dev:dashboard:emulators

# First-time localhost + emulators (dashboard + demo org in emulator Firestore/Auth):
#   npm run setup:dashboard:emulator   # creates packages/dashboard/.env.local — add Firebase web app keys if empty
#   npm run dev:emulators              # wait until emulators are ready
#   npm run seed:dice:emulator         # or seed:nimax:emulator / seed:zipworld:emulator / seed:skiddle:emulator
#   npm run dev:dashboard              # http://localhost:3001 — see constants in functions/src/lib/*DemoConstants.ts

# Build dashboard
npm run build:dashboard

# Type-check Cloud Functions (build packages/ai-core first so dist/ exists)
cd functions && npx tsc --noEmit

# Type-check dashboard
cd packages/dashboard && npx tsc --noEmit

# Build ai-core (emits dist/ — required before type-checking functions or core against @realyn/ai-core)
cd packages/ai-core && npm run build

# Type-check core (shared business logic; run ai-core build above first)
cd packages/core && npx tsc --noEmit

# Other available scripts
npm run dev:website              # Marketing website dev server
npm run build:website            # Build marketing website
npm run build                    # Build all packages (turbo)
npm run deploy:functions         # Deploy Cloud Functions
npm run seed:dice                # Seed DICE demo into cloud Firestore/Auth (ADC / service account for active Firebase project)
npm run seed:dice:emulator       # Seed DICE demo into local emulator (emulators must be running)
npm run seed:nimax               # Seed Nimax Theatres demo (cloud)
npm run seed:nimax:emulator      # Seed Nimax demo (emulator)
npm run seed:zipworld            # Seed Zip World demo (cloud)
npm run seed:zipworld:emulator   # Seed Zip World demo (emulator)
npm run seed:skiddle             # Seed Skiddle demo (cloud)
npm run seed:skiddle:emulator    # Seed Skiddle demo (emulator)
npm run setup:dashboard:emulator  # Create .env.local from .env.emulator for emulator-based dashboard dev
```

### Firebase Emulators

Local emulators for Auth, Firestore, Storage, and Functions are configured. The dashboard connects to emulators when `VITE_USE_FIREBASE_EMULATORS=true` is set in `packages/dashboard/.env` (see `.env.example`). The connection check lives in `packages/shared/src/services/firebase.ts`. The marketing website always hits production Firebase regardless of this flag.

| Service        | Port  | Emulator UI                        |
|----------------|-------|------------------------------------|
| Auth           | 9099  | http://127.0.0.1:4000/auth        |
| Firestore      | 8080  | http://127.0.0.1:4000/firestore   |
| Storage        | 9199  | http://127.0.0.1:4000/storage     |
| Functions      | 5001  | http://127.0.0.1:4000/functions   |
| Emulator UI    | 4000  | http://127.0.0.1:4000             |

**Prerequisites:** Java 17+ (`brew install openjdk@17`).

### Demo login: confirm your environment

Firebase shows **“No account found”** (`auth/user-not-found`) when the email does not exist in **Auth for the same project** your dashboard uses. Before seeding or signing in:

1. Open `packages/dashboard/.env` or `.env.local` and note **`VITE_FIREBASE_PROJECT_ID`** and whether **`VITE_USE_FIREBASE_EMULATORS`** is `true`.
2. **Emulators on:** Auth is the local emulator — run `npm run seed:*:emulator` (from repo root) while emulators are running. Cloud-seeded users do not exist in the emulator.
3. **Emulators off:** Auth is that GCP/Firebase project — run `npm run seed:dice`, `seed:nimax`, `seed:zipworld`, `seed:skiddle`, `seed:sadlerswells`, or `seed:attractionworld` with Application Default Credentials for that project (`gcloud auth application-default login` or CI service account). Credentials for project A will not create users in project B.
4. With emulators, **`VITE_FIREBASE_FUNCTIONS_URL`** must be the Functions emulator URL (see `.env.example`); otherwise you get 401s after login.

**HTTP seed vs CLI:** Deployed Cloud Functions treat the app as **production** when `K_SERVICE` is set (`functions/src/config/environment.ts`). Demo HTTP seeds (`seedDiceDemoData`, `seedNimaxDemoData`, `seedZipworldDemoData`, `seedSkiddleDemoData`, `seedSadlersWellsDemoData`, `seedAttractionworldDemoData`, `seedPitchDemo`, etc.) return **403** in that environment. The dashboard “Reset demo” button calls those endpoints — it works against **local emulators** or non-production setups where test handlers are enabled, but **not** for production hosting. To put demo users and disputes in **production** Firebase, use the **CLI** seeds above (Admin SDK), not the HTTP endpoints.

**Seed data:** After emulators start, call `http://127.0.0.1:5001/realyn-app/us-central1/seedDemoData` to populate test data, or run `npm run seed:dice:emulator` / `seed:nimax:emulator` / `seed:zipworld:emulator` / `seed:skiddle:emulator` / `seed:sadlerswells:emulator` / `seed:attractionworld:emulator` to load a demo into emulator Firestore/Auth. Demo emails/passwords are defined in `functions/src/lib/diceDemoConstants.ts`, `nimaxDemoConstants.ts`, `zipworldDemoConstants.ts`, `skiddleDemoConstants.ts`, `sadlerswellsDemoConstants.ts`, and `attractionworldDemoConstants.ts`. Additional HTTP seed endpoints are exported from `functions/src/index.ts` (`seedUsersHandler`, `seedOrganizationsHandler`, `seedTestDisputes`, `seedCustomDispute`, `seedDiceDemoData`, `seedNimaxDemoData`, `seedZipworldDemoData`, `seedSkiddleDemoData`, `seedSadlersWellsDemoData`, `seedAttractionworldDemoData`, `seedPitchDemo`). Emulator data persists in `./emulator-data/` between restarts.

**Copy production data:** To mirror real Firestore data into the emulator (all collections and subcollections):

```bash
gcloud auth application-default login   # one-time — grants production read access
npm run dev:emulators                    # start emulators in another terminal
cd functions && npm run copy-firestore-to-emulator
```

This does NOT copy Auth users or Storage files. Run `seedUsersHandler` against the emulator after copying to create login-able accounts.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Firebase Cloud Functions, Firestore, Firebase Auth, Firebase Storage
- **AI:** Anthropic Claude (evidence planning, argument generation)
- **PSP Integrations:** Stripe, Adyen (adapter pattern — extensible)
- **Verticals & ops data:** Hospitality and ticketing (and extensible to other industries); **PMS / venue integrations:** Opera Cloud OHIP, Opera CSV/XML/delimited imports, and related adapters
