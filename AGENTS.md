# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Realyn is a PSP-agnostic, **industry-agnostic** chargeback dispute management platform, with first-class support for **hospitality** and **ticketing** (vertical-specific evidence requirements, KB, and prompts live in `packages/ai-core` verticals). The active product is the dashboard in `packages/dashboard` — a React 19 / TypeScript / Vite frontend connected to Firebase (Firestore, Auth, Storage). The backend is in `functions/` (Firebase Cloud Functions, Node 20). Shared types and Firebase config live in `packages/shared`. The codebase still uses some “hotel” naming in types and UI for historical reasons; treat that as “merchant property / venue” unless the context is explicitly hospitality-only.

**AI and shared logic:** Portable AI (LLM pipeline, dispute/KB types, specialists, static dispute-code mapping) lives in **`packages/ai-core`** (`@realyn/ai-core`) — that package is the **single source of truth** for those concerns. **`functions/`** depends on it via `file:../packages/ai-core` in `functions/package.json` and adds Firestore/HTTP-specific adapters (evidence loaders, triggers, handlers). **`packages/core`** (`@realyn/core`) mirrors the same ai-core + adapter pattern for **unit/integration tests** (Jest) and optional future reuse; nothing in the dashboard or website imports `@realyn/core` today, and Cloud Functions do **not** import `@realyn/core` (only `@realyn/ai-core`).

### Running the app

- **Dev server:** `npm run dev:dashboard` (from repo root) — starts Vite on `http://localhost:3001`. Connects to emulators or production Firebase depending on `VITE_USE_FIREBASE_EMULATORS` in `packages/dashboard/.env` (see `.env.example` for options).
- **Dev server (local emulators):** `npm run dev:emulators` in one terminal, then `npm run dev:dashboard` in another — or use `npm run dev:dashboard:emulators` to run both together
- **Build:** `npm run build:dashboard`
- **Type check dashboard:** `cd packages/dashboard && npx tsc --noEmit`
- **Build / type check ai-core:** `cd packages/ai-core && npm run build` (or `npm run typecheck`) — must produce `packages/ai-core/dist/` before `functions` typecheck/build, because Functions resolves `@realyn/ai-core` subpath exports from `dist/`.
- **Type check functions:** `cd packages/ai-core && npm run build && cd ../../functions && npx tsc --noEmit` (from repo root: build ai-core first).
- **Type check core:** `cd packages/ai-core && npm run build && cd ../core && npx tsc --noEmit`
- **Build core:** `cd packages/core && npm run build` — outputs to `packages/core/dist/`
- Standard commands are documented in the root `README.md`.

### Firebase Emulators

The project has a full Firebase Emulator Suite configured for local development (Auth, Firestore, Storage, Functions, Emulator UI). Emulator connections are gated in `packages/shared/src/services/firebase.ts` by `import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"`. The flag value is set in the consuming app's `.env` (e.g. `packages/dashboard/.env`).

- **Dashboard** (`packages/dashboard/.env`) sets `VITE_USE_FIREBASE_EMULATORS=true` — hits local emulators by default in dev.
- **Website** (`packages/website/.env.development`) does NOT set this flag — always hits production Firebase, even in dev mode. **Do not add the emulator flag to the website env.**
- **Emulator UI:** `http://127.0.0.1:4000` — view/edit Auth users, Firestore data, Storage files.
- **Emulator data persistence:** Data is exported/imported from `./emulator-data/` between restarts.
- **Functions secrets:** `functions/.env` holds placeholder secrets for `defineSecret` values (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY). Replace with real test keys if needed.
- **Seed data:** Call seed functions at `http://127.0.0.1:5001/realyn-app/us-central1/seedDemoData` after emulators start, or run `npm run seed:dice:emulator`, `seed:nimax:emulator`, `seed:zipworld:emulator`, `seed:skiddle:emulator`, `seed:sadlerswells:emulator`, or `seed:attractionworld:emulator` (repo root) to seed a demo into **emulator** Firestore/Auth. For **cloud**, use `npm run seed:dice`, `seed:nimax`, `seed:zipworld`, `seed:skiddle`, `seed:sadlerswells`, or `seed:attractionworld` with ADC targeting the same project as `VITE_FIREBASE_PROJECT_ID`. Demo credentials live in `functions/src/lib/diceDemoConstants.ts`, `nimaxDemoConstants.ts`, `zipworldDemoConstants.ts`, `skiddleDemoConstants.ts`, `sadlerswellsDemoConstants.ts`, and `attractionworldDemoConstants.ts`. Other HTTP seed endpoints are exported from `functions/src/index.ts`: `seedUsersHandler`, `seedOrganizationsHandler`, `seedTestDisputes`, `seedCustomDispute`, `seedDiceDemoData`, `seedNimaxDemoData`, `seedZipworldDemoData`, `seedSkiddleDemoData`, `seedSadlersWellsDemoData`, `seedAttractionworldDemoData`, `seedPitchDemo`. For dashboard env against emulators: `npm run setup:dashboard:emulator` (copies `packages/dashboard/.env.emulator` → `.env.local`).
- **Demo login (`auth/user-not-found`):** The dashboard must use the **same** Firebase project (and emulator vs cloud) where you ran the seed. Emulators: seed with `*:emulator` scripts only. Cloud: use CLI seeds; **deploying the UI does not create Auth users.** On deployed Gen2 functions, `shouldEnableTestHandlers()` is false in production (`functions/src/config/environment.ts`), so demo **HTTP** seeds return **403** — the dashboard “Reset demo” action does not re-seed **production**; use CLI seeds for prod/staging data.
- **Copy production data:** To mirror real Firestore data into the emulator, run `cd functions && npm run copy-firestore-to-emulator` while emulators are running. Requires `gcloud auth application-default login` for production read access. This copies all collections and subcollections but does NOT copy Auth users or Storage files — run `seedUsersHandler` after to create login-able emulator users.
- **Java requirement:** The Firestore emulator requires Java 17+. Installed via `brew install openjdk@17`; the npm scripts set `JAVA_HOME` automatically.
- **Troubleshooting 401 errors:** When `VITE_USE_FIREBASE_EMULATORS=true`, `VITE_FIREBASE_FUNCTIONS_URL` **must** point at the local Functions emulator (`http://127.0.0.1:5001/realyn-app/us-central1`). If it points at production, the production Admin SDK will reject emulator-issued ID tokens and all authenticated requests (consent, user management, etc.) will fail with 401. Always start the full emulator suite (Auth + Functions + Firestore together) so the Functions process inherits the Auth emulator settings.

### Non-obvious caveats

- Tailwind CSS and PostCSS are configured per package (`.cjs` config files under `packages/dashboard` and `packages/website`). The root `package.json` lists `tailwindcss@3` and `autoprefixer` as devDependencies.
- The dashboard requires Firebase credentials to connect to a backend. Without a `.env` file or Firebase project, it will render the login page but authentication will fail. With emulators running, this is not an issue.
- No ESLint config exists for the dashboard. The only ESLint config is in `functions/.eslintrc.js` (Firebase Cloud Functions).
- Jest is configured in `functions/` (`npm test` from `functions/`, config in `functions/jest.config.js`, test files as `*.test.ts` under `functions/src`) and in `packages/core`. The dashboard uses Vitest (`npm test` from `packages/dashboard`); the website and `packages/shared` have no test runner configured.
- Demo login credentials are shown on the login page (e.g., `admin@realyn.com` / `masterpass`) — these work against the production/staging Firebase project but NOT against a fresh emulator (you must seed users first).
- `packages/ai-core` and `packages/core` are workspace packages (`packages/*` glob). `functions/` is NOT a workspace package — it has its own `node_modules` and links `@realyn/ai-core` via `file:../packages/ai-core`. It does not depend on `@realyn/core`. `functions/tsconfig.json` maps `@realyn/ai-core` and `@realyn/ai-core/*` to `node_modules/@realyn/ai-core/dist` so TypeScript resolves package `exports` without moving the whole Functions project to `Node16` resolution (which would require `.js` extensions on relative imports). `packages/core` uses `module` / `moduleResolution` `Node16` instead.
