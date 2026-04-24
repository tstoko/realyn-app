# One-shot prompt: new company demo (DICE / Nimax / Zip World pattern)

Copy everything in the fenced block below into a new agent chat. Replace the bracketed placeholders for the company you want.

````markdown
Create a complete Realyn demo for [COMPANY NAME] ([COMPANY WEBSITE URL]).

[COMPANY NAME] is a [BRIEF DESCRIPTION OF WHAT THEY DO, e.g. "outdoor adventure park in Wales and England offering zip lines, underground tours, and family experiences"]. Their industry vertical is "[INDUSTRY, e.g. Adventure & Experiences]". They are based in [LOCATION]. They use [PSP: stripe or adyen] for payments. Currency is [CURRENCY CODE, e.g. gbp].

Follow the exact pattern used by the existing DICE and Nimax demos. Here is every file to create and every file to modify:

## 1. CREATE: functions/src/lib/[company]DemoConstants.ts

- Export ORG_ID (e.g. `companyname_vertical`), DEMO_EMAIL, DEMO_PASSWORD
- Comment: keep in sync with dashboard `demoOrganizations.ts`

## 2. CREATE: functions/src/lib/[company]DemoDisputePayload.ts

- Export `DemoDispute` interface, `DEMO_DISPUTES` array (7 disputes), status helper functions, `buildXxxDisputeFirestoreData()`
- 7 disputes covering all lifecycle states: `new`, `ai_plan_generated`, `evidence_uploaded`, `argument_ready`, `submitted`, `won`, `lost`
- 7 dispute reasons: `product_not_received`, `credit_not_processed`, `general`, `duplicate`, `product_unacceptable`, `product_not_received` (won), `fraudulent` (lost)
- Each dispute description must be specific to the company's actual products/services/venues from their website
- `planPartsForDispute()` must return industry-specific evidence requirements (e.g. for adventure parks: weather logs, risk acknowledgement forms, QR scan data; for theatres: venue scan logs, seat maps, box office records)
- `buildArgumentDraftForDispute()` for states: duplicate, product_unacceptable, won + product_not_received, lost + fraudulent
- `buildXxxDisputeFirestoreData()` sets `pspProvider` to the company's PSP, currency, `merchantVertical`, and wires up evidence plans/items/arguments based on state
- Use [`functions/src/lib/nimaxDemoDisputePayload.ts`](../functions/src/lib/nimaxDemoDisputePayload.ts) as the structural template — same functions, same shape, different content

## 3. CREATE: functions/src/handlers/seed[Company]DemoHandler.ts

- HTTP handler: `onRequest` with `cors: true`
- Guards: `shouldEnableTestHandlers()`, POST only, `verifyAdmin()`
- Creates organization doc (with `isDemo: true`, industry-appropriate teams, documents, `pspIntegrations` for their PSP)
- Creates/updates Auth user + Firestore `users` doc
- Optionally deletes existing disputes (`replaceDisputes`, default true) using `deleteDisputesForOrganization` from `diceDemoFirestoreUtils`
- Seeds all 7 disputes
- Returns JSON with success, credentials, dispute IDs
- Follow [`functions/src/handlers/seedNimaxDemoHandler.ts`](../functions/src/handlers/seedNimaxDemoHandler.ts) as the exact template

## 4. CREATE: functions/src/scripts/seed[Company]Demo.ts

- CLI script using Admin SDK directly (no HTTP, no auth check)
- Reads `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` from env (via [`functions/.env.emulator.seed`](../functions/.env.emulator.seed))
- Same org/user/dispute creation logic as the handler
- Exports main function for programmatic use
- Follow [`functions/src/scripts/seedNimaxDemo.ts`](../functions/src/scripts/seedNimaxDemo.ts) as the exact template

## 5. MODIFY: functions/src/index.ts

- Add: `export { seed[Company]DemoData } from "./handlers/seed[Company]DemoHandler";`
- Place it next to the existing `seedNimaxDemoData` / `seedZipworldDemoData` exports

## 6. MODIFY: functions/package.json scripts

- Add: `"seed:[company]": "npm run build && node lib/scripts/seed[Company]Demo.js"`
- Add: `"seed:[company]:emulator": "npm run build && node --env-file=.env.emulator.seed lib/scripts/seed[Company]Demo.js"`

## 7. MODIFY: root package.json scripts

- Add: `"seed:[company]": "cd functions && npm run seed:[company]"`
- Add: `"seed:[company]:emulator": "cd functions && npm run seed:[company]:emulator"`

## 8. MODIFY: packages/dashboard/src/config/demoOrganizations.ts

- Add: `export const [COMPANY]_ORG_ID = "[org_id_from_constants]";`

## 9. MODIFY: packages/dashboard/src/services/demoResetService.ts

- Import the new `ORG_ID`
- Add an `else if (organizationId === [COMPANY]_ORG_ID)` branch that routes to `seed[Company]DemoData` with `{ replaceDisputes: true }`

## 10. MODIFY: README.md

- Add `seed:[company]` and `seed:[company]:emulator` to the npm scripts list
- Add the company to the "Seed data" paragraph listing HTTP endpoints

## 11. MODIFY: AGENTS.md

- Add the company to the seed data bullet (both emulator and cloud CLI commands)
- Add the company's constants file to the demo credentials list

## 12. DEPLOY AND SEED

After all files are created/modified:

1. Type-check: `cd functions && npx tsc --noEmit`
2. Deploy the Cloud Function: `npx firebase deploy --only functions:seed[Company]DemoData`
3. **Cloud:** `npm run seed:[company]` from repo root (ADC must target the same Firebase project as `VITE_FIREBASE_PROJECT_ID`)
4. **Emulators:** Start emulators (`npm run dev:emulators`), then `npm run seed:[company]:emulator` from repo root
5. Print the login credentials from `*DemoConstants.ts`

## 13. WRITE OUT INTEGRATION INFO

After deploying, write out:

- What PSP they use (or would likely use) and why
- What booking/ticketing/PMS system they use (or common alternatives in their vertical)
- Key documents needed for chargeback defence in their industry
- Their chargeback profile: common dispute reasons, industry-specific evidence advantages, currency, average transaction values, seasonality

---

**Environment reminders (do not skip):**

- Demo HTTP seeds return **403** in production Cloud Functions (`shouldEnableTestHandlers()`). Dashboard "Reset demo" works when test handlers are enabled (emulators / non-prod). For **production** Auth + Firestore data, always use **CLI** `npm run seed:[company]`.
- With `VITE_USE_FIREBASE_EMULATORS=true`, the dashboard must use the **local** Functions URL; see [`packages/dashboard/.env.example`](../packages/dashboard/.env.example) and [AGENTS.md](../AGENTS.md).
- Emulator seed creates users only in the **Auth emulator**; they do not exist in production until you run the cloud seed.
````

## Reference: existing demos

| Company   | Org ID               | Constants file                     |
| --------- | -------------------- | ---------------------------------- |
| DICE      | `dice_ticketing`     | `functions/src/lib/diceDemoConstants.ts` |
| Nimax     | `nimax_ticketing`    | `functions/src/lib/nimaxDemoConstants.ts` |
| Zip World | `zipworld_adventures`| `functions/src/lib/zipworldDemoConstants.ts` |
| Skiddle   | `skiddle_ticketing`   | `functions/src/lib/skiddleDemoConstants.ts` |
| Attraction World Group | `attractionworld_experiences` | `functions/src/lib/attractionworldDemoConstants.ts` |

Shared utilities: `functions/src/lib/diceDemoFirestoreUtils.ts` (`deleteDisputesForOrganization`).
