/**
 * Structural Timestamp type compatible with both `firebase/firestore`
 * (client SDK) and `firebase-admin/firestore` (admin SDK) Timestamp
 * classes. The ontology package deliberately does NOT depend on either
 * firebase package — types live here so any consumer (dashboard, ai-core,
 * functions) can use the same shape without pulling in the wrong SDK at
 * compile time.
 *
 * Both firebase Timestamp classes structurally satisfy this interface:
 * each has `seconds: number`, `nanoseconds: number`, `toDate(): Date`,
 * and `toMillis(): number`. Assignments INTO an ontology Timestamp field
 * from either SDK's Timestamp instance work without changes.
 *
 * The reverse direction — assigning an ontology Timestamp into a variable
 * typed as the firebase class — does NOT work because the firebase
 * classes have SDK-specific methods (`isEqual`, `valueOf`). Code that
 * needs the full firebase class should import it from `firebase/firestore`
 * or `firebase-admin/firestore` directly and use a type guard.
 *
 * Future work (W1.1, see ADR-0001): consider replacing this with a
 * branded ISO-8601 string at the ontology boundary so persisted data is
 * SDK-independent.
 */
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

/**
 * Union covering the shapes we observe on Date-like fields across
 * Firestore SDK Timestamp instances, native JS Dates, and serialized
 * forms encountered when crossing HTTP / REST boundaries. Existing types
 * in `@realyn/shared` used `Timestamp | Date`; the ontology widens this
 * to include string for HTTP / JSON serialization paths.
 */
export type FirestoreDate = Timestamp | Date | string;
