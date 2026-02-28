# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Realyn is a Stripe dispute management dashboard for hotels. The active product is in `apps/web` — a React 19 / TypeScript / Vite frontend. All data is served from hardcoded mock data (no backend, database, or API keys required). The `apps/api` directory is an empty placeholder.

### Running the app

- **Dev server:** `npm run dev:web` (from repo root) — starts Vite on `http://localhost:3000`
- **Build:** `npm run build:web`
- **Type check:** `cd apps/web && npx tsc --noEmit`
- Standard commands are documented in the root `README.md`.

### Non-obvious caveats

- The root `postcss.config.js` and `tailwind.config.js` are legacy configs. They require `tailwindcss@3` (not v4) and `autoprefixer` as devDependencies at the root. These are not listed in the committed `package.json` so `npm install` alone won't work for builds — the update script handles this.
- The `tailwind.config.js` `content` glob points at `./src/**/*` (legacy path), so Tailwind CSS via PostCSS generates no utility classes. The web app loads Tailwind via CDN in `apps/web/index.html`, which is the actual source of styles. The PostCSS warning about empty content is harmless.
- No ESLint config exists for `apps/web`. The only ESLint config is in `functions/.eslintrc.js` (Firebase Cloud Functions, disconnected from the web app).
- No test framework is configured. There are no automated tests to run.
- Demo login credentials are shown on the login page (e.g., `admin@realyn.com` / `masterpass`).
