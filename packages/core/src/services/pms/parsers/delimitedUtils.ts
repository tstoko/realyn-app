/**
 * Delimiter Auto-Detection and Delimited File Parsing
 *
 * Handles non-CSV delimited files (pipe, tab, semicolon) by detecting the
 * delimiter from the first few lines, then parsing into the same
 * { headers, rows } shape that csvUtils produces.
 */

import type {ParsedCSV} from "./csvUtils";
import {normalizeHeader} from "./csvUtils";

const CANDIDATE_DELIMITERS = [",", "|", "\t", ";"];

/**
 * Detect the most likely field delimiter by sampling the first 5 non-empty
 * lines. For each candidate, count occurrences per line, then pick the
 * candidate with the highest consistent (non-zero) count across lines.
 *
 * "Consistent" = lowest coefficient of variation (stddev / mean) among
 * candidates that appear on every sampled line.
 */
export function detectDelimiter(text: string): string {
  const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 5);

  if (lines.length === 0) return ",";

  let bestDelimiter = ",";
  let bestScore = -1;

  for (const delim of CANDIDATE_DELIMITERS) {
    const counts = lines.map(
        (line) => line.split(delim).length - 1,
    );

    const minCount = Math.min(...counts);
    if (minCount === 0) continue;

    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance =
      counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : Infinity;

    // Score: prefer high mean count with low variation
    const score = mean / (1 + cv);
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Parse a raw delimited Buffer into normalised headers and row arrays.
 * Auto-detects the delimiter, then splits each line accordingly.
 */
export function parseDelimitedBuffer(buffer: Buffer): ParsedCSV {
  let text = buffer.toString("utf-8");

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const delimiter = detectDelimiter(text);

  const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {headers: [], rows: []};
  }

  const headers = lines[0].split(delimiter).map((h) => normalizeHeader(h));
  const rows = lines.slice(1).map((line) =>
    line.split(delimiter).map((cell) => cell.trim()),
  );

  return {headers, rows};
}
