/**
 * Shared CSV utilities
 *
 * BOM stripping, encoding handling, header normalisation, and generic
 * CSV-to-rows parsing via the csv-parse/sync package.
 */

import {parse as csvParse} from "csv-parse/sync";

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

/**
 * Parse a raw CSV Buffer into normalised headers and row arrays.
 * Handles BOM, quoted fields, newlines inside quotes, etc.
 */
export function parseCSVBuffer(buffer: Buffer): ParsedCSV {
  const text = stripBOM(buffer.toString("utf-8"));

  const records: string[][] = csvParse(text, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    return {headers: [], rows: []};
  }

  const headers = records[0].map(normalizeHeader);
  const rows = records.slice(1);

  return {headers, rows};
}

/**
 * Strip UTF-8 BOM if present.
 */
function stripBOM(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Normalise a header: uppercase, trimmed, whitespace collapsed to underscore,
 * BOM removed.
 */
export function normalizeHeader(header: string): string {
  return header
      .replace(/^\uFEFF/, "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
}

/**
 * Build a column-name → row-index map for a given set of headers.
 */
export function buildColumnMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) {
    map.set(headers[i], i);
  }
  return map;
}

/**
 * Safely get a cell value by column name. Returns undefined if the column
 * does not exist or the cell is empty.
 */
export function getCell(
    row: string[],
    colMap: Map<string, number>,
    columnName: string,
): string | undefined {
  const idx = colMap.get(columnName);
  if (idx === undefined || idx >= row.length) return undefined;
  const val = row[idx].trim();
  return val === "" ? undefined : val;
}
