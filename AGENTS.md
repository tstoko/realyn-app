# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Realyn is a PSP-agnostic, PMS-agnostic hotel chargeback dispute management platform. The active product is the dashboard in `packages/dashboard` — a React 19 / TypeScript / Vite frontend connected to Firebase (Firestore, Auth, Storage). The backend is in `functions/` (Firebase Cloud Functions, Node 20). Shared types and Firebase config live in `packages/shared`. Shared core business logic (services, types, config, AI pipeline, PSP/PMS adapters) lives in `packages/core`. The MCP (Model Context Protocol) server for AI agent access is in `packages/mcp-server`.

### Running the app

- **Dev server:** `npm run dev:dashboard` (from repo root) — starts Vite on `http://localhost:3001`. Connects to emulators or production Firebase depending on `VITE_USE_FIREBASE_EMULATORS` in `packages/dashboard/.env` (see `.env.example` for options).
- **Dev server (local emulators):** `npm run dev:emulators` in one terminal, then `npm run dev:dashboard` in another — or use `npm run dev:dashboard:emulators` to run both together
- **Build:** `npm run build:dashboard`
- **Type check dashboard:** `cd packages/dashboard && npx tsc --noEmit`
- **Type check functions:** `cd functions && npx tsc --noEmit`
- **Type check core:** `cd packages/core && npx tsc --noEmit`
- **Type check MCP server:** `cd packages/mcp-server && npx tsc --noEmit` (requires `packages/core` to be built first: `cd packages/core && npx tsc`)
- **Build core:** `cd packages/core && npm run build` — outputs to `packages/core/dist/`
- **MCP server dev:** `cd packages/mcp-server && npm run dev` — uses `tsx watch` for hot reload
- **MCP server Docker:** `docker build -f packages/mcp-server/Dockerfile .` — builds the Cloud Run image
- Standard commands are documented in the root `README.md`.

### MCP Server

The MCP server (`packages/mcp-server`) exposes Realyn's dispute operations via the Model Context Protocol for AI agent access. It runs as a standalone Express server deployed to Cloud Run.

- **Transport:** Streamable HTTP on `/mcp` (POST to initialize/interact, GET for SSE, DELETE to close)
- **Health check:** `GET /health`
- **Auth:** Firebase ID token (`Authorization: Bearer <token>`) or API key (`X-Api-Key: <key>`)
- **API keys:** Generated via the `mcpApiKeyGenerate` Cloud Function (admin only). Managed in the dashboard under Integrations.
- **Module system:** `packages/core` is CommonJS (`"module": "commonjs"`), `packages/mcp-server` is ESM (`"type": "module"`). The MCP server imports from `@realyn/core` which must be built before the MCP server can type-check.
- **Deployment:** Pushes to `main` affecting `packages/core/**` or `packages/mcp-server/**` trigger `.github/workflows/deploy-mcp-server.yml` which builds the Docker image and deploys to Cloud Run.
- **Code duplication:** `packages/core` was created by copying code from `functions/src/`. The two trees are independent — changes in one do not propagate to the other. New shared logic should go in `packages/core`.

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
- Jest is configured in `functions/` (`npm test` from `functions/`, config in `functions/jest.config.js`, test files as `*.test.ts` under `functions/src`). The dashboard, website, and shared packages have no test runner configured.
- Demo login credentials are shown on the login page (e.g., `admin@realyn.com` / `masterpass`) — these work against the production/staging Firebase project but NOT against a fresh emulator (you must seed users first).
- `packages/core` and `packages/mcp-server` are workspace packages (`packages/*` glob). `functions/` is NOT a workspace package — it has its own `node_modules` and does not import from `@realyn/core`.
- The MCP server requires `packages/core` to be built (`npx tsc` in `packages/core`) before it can type-check or build, because the MCP server's `Node16` module resolution needs the `.d.ts` files in `packages/core/dist/`.
