/**
 * Semantic version of the @realyn/ontology surface. Detailed bumping
 * policy lives in `docs/adr/0002-ontology-versioning.md`. Short form:
 *
 *   - MAJOR: removing or breaking-renaming a canonical type, OR
 *           strictifying an existing schema in a way that rejects
 *           historical Firestore documents
 *   - MINOR: adding a new canonical type or a new required field with a
 *           default; adding a new enum variant in a backward-compatible
 *           way; introducing a new strict schema for a not-yet-persisted
 *           shape
 *   - PATCH: doc-only updates, schema tightening that does not break
 *           existing data, or non-breaking type widening
 *
 * Currently 0.x — the surface is intentionally unstable while we land
 * the rest of the canonical types. Pre-1.0 minor bumps may include
 * additive breaking changes; the 1.0 release will be a snapshot of the
 * shapes the Action framework (W2.1) commits to long-term.
 *
 * Persisted documents stamp this value so migration tooling can find
 * data written under older surfaces.
 */
export const ONTOLOGY_VERSION = "0.2.0";

/**
 * Mixin shape for any persisted document that has been validated
 * against an ontology schema. Currently optional — W2.x makes it
 * mandatory at the persistence boundary once the Action framework
 * stamps every write.
 */
export interface OntologyVersionStamp {
  ontologyVersion?: string;
}
