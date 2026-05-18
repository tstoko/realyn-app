/**
 * Semantic version of the @realyn/ontology surface. Bumping policy
 * (see ADR-0001):
 *
 *   - MAJOR: removing or breaking-renaming a canonical type
 *   - MINOR: adding a new canonical type or a new required field with a
 *           default
 *   - PATCH: doc-only updates, schema tightening that does not break
 *           existing data, or non-breaking type widening
 *
 * Currently 0.x — the surface is intentionally unstable while we land the
 * rest of the canonical types in W1.1. Persisted documents stamp this
 * value so migration tooling can find data written under older surfaces.
 */
export const ONTOLOGY_VERSION = "0.1.0";

/**
 * Mixin shape for any persisted document that has been validated against
 * an ontology schema. Currently optional — W1.1 makes it mandatory at the
 * persistence boundary.
 */
export interface OntologyVersionStamp {
  ontologyVersion?: string;
}
