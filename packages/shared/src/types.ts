/**
 * Back-compat re-export shim. The canonical types now live in
 * `@realyn/ontology` (see ADR-0001). This file is kept so that existing
 * consumers (`import { Dispute } from '@realyn/shared'`) keep working
 * unchanged while we migrate them in subsequent PRs.
 *
 * Do NOT add new types here. Add them to `@realyn/ontology` and re-export
 * if shared / dashboard need to surface them.
 */
export * from "@realyn/ontology";
