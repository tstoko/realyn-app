/**
 * Version-bump assertions. These tests fail when ONTOLOGY_VERSION
 * shifts unexpectedly — surfacing the change in CI so reviewers
 * remember to update consumers / docs.
 *
 * Drop the literal here whenever you intentionally bump
 * ONTOLOGY_VERSION. See `docs/adr/0002-ontology-versioning.md` for the
 * bumping policy.
 */
import { ONTOLOGY_VERSION } from "../version";

const EXPECTED_VERSION = "0.2.0";

describe("ONTOLOGY_VERSION", () => {
  test("matches the documented current version", () => {
    expect(ONTOLOGY_VERSION).toBe(EXPECTED_VERSION);
  });

  test("is a valid semver string", () => {
    expect(ONTOLOGY_VERSION).toMatch(/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/);
  });

  test("is currently in the 0.x range (pre-1.0 unstable surface)", () => {
    const [major] = ONTOLOGY_VERSION.split(".");
    expect(Number(major)).toBe(0);
  });
});
