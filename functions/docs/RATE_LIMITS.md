# HTTP rate limits (Cloud Functions)

Implementation: [`src/utils/rateLimiter.ts`](../src/utils/rateLimiter.ts) (`RateLimiter`, `applyRateLimit`, `RATE_LIMIT_CONFIGS`).

Firestore collection: `_rateLimits` (deny all client access in `firestore.rules`).

## Fail-open vs fail-closed

| `failMode` | On Firestore transaction error | Use for |
|------------|----------------------------------|---------|
| `open`     | Allow the request              | Webhooks that must not drop provider events |
| `closed`   | Deny the request (429)         | Expensive or abuse-sensitive routes (default when omitted) |

## Presets (current defaults)

| Key | max / window | Key type | failMode | Used by (representative) |
|-----|--------------|----------|----------|---------------------------|
| `webhook` | 1000 / 60s | IP | open | Stripe dispute webhook, Adyen webhook, billing webhook |
| `ai` | 30 / 60s | user | closed | AI dispute handlers |
| `csvImport` | 25 / hour | custom (`org:{id}`) | closed | `processCSVImport` |
| `dataExport` | 5 / hour | user | closed | GDPR export |
| `dataDeletion` | 3 / 24h | user | closed | GDPR deletion |
| `general` | 100 / 60s | IP | open | Dispute write, organization write |
| `signup` | 15 / hour | IP | closed | `signup` |
| `invite` | 40 / hour | user | closed | `createInvite`, `listInvites`, `revokeInvite`, team member HTTP handlers |
| `inviteAccept` | 40 / hour | IP | closed | `acceptInvite` |

## Operational notes

- Tuning should follow real traffic: raise webhook limits if providers burst; tighten `signup` if you see scripted signups.
- `csvImport` is keyed per organization so one noisy tenant does not block others.
