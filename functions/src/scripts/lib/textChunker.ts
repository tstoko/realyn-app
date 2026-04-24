/**
 * Text chunker for RAG ingestion.
 *
 * Produces overlapping, heading-aware chunks from plain text. Designed for
 * scheme rulebook PDFs (Visa Core Rules, Mastercard Chargeback Guide) where
 * preserving section numbers like `§11.3.2` in the chunk text matters — the
 * LLM needs them to produce verbatim citations at argument-generation time.
 *
 * Strategy:
 *   1. Normalise whitespace and de-hyphenate line-wrapped words.
 *   2. Detect heading lines (e.g. "11.3.2 Compelling Evidence") and carry
 *      the nearest heading path as a prefix on each chunk.
 *   3. Split on paragraph boundaries; greedily pack paragraphs into chunks
 *      up to the configured token budget with a small overlap.
 *
 * This is intentionally simple — good enough to ship Phase 1 and easy to
 * swap out for a layout-aware parser (e.g. Docling) later without changing
 * the upsert pipeline.
 */

import {
  CHUNK_TARGET_TOKENS,
  CHUNK_OVERLAP_TOKENS,
  CHUNK_MAX_TOKENS,
} from "@realyn/ai-core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Chunk {
  /** Chunk text, including the heading path prefix when available. */
  text: string;
  /** Heading path at the start of this chunk, e.g. "Chapter 11 > §11.3.2". */
  headingPath: string | null;
  /** 0-based index of the chunk within the source document. */
  index: number;
  /** Approximate token count (chars/4). */
  tokenCount: number;
}

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function chunkText(raw: string, options: ChunkOptions = {}): Chunk[] {
  const targetTokens = options.targetTokens ?? CHUNK_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? CHUNK_OVERLAP_TOKENS;
  const maxTokens = options.maxTokens ?? CHUNK_MAX_TOKENS;

  const text = normalise(raw);
  if (!text) return [];

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;
  let currentHeadingPath: string | null = null;
  const headingStack: string[] = [];
  let chunkIndex = 0;

  const flush = (prefix?: string | null) => {
    if (buffer.length === 0) return;
    const body = buffer.join("\n\n").trim();
    if (!body) {
      buffer = [];
      bufferTokens = 0;
      return;
    }
    const headingPath = prefix ?? currentHeadingPath;
    const text = headingPath ? `[${headingPath}]\n${body}` : body;
    chunks.push({
      text,
      headingPath,
      index: chunkIndex++,
      tokenCount: approxTokens(text),
    });
    buffer = [];
    bufferTokens = 0;
  };

  for (const para of paragraphs) {
    const heading = detectHeading(para);
    if (heading) {
      // Flush what we have under the old heading, then update the stack.
      flush(currentHeadingPath);
      updateHeadingStack(headingStack, heading);
      currentHeadingPath = headingStack.join(" > ");
      // Keep the heading line itself in the next chunk for context.
      buffer.push(para);
      bufferTokens += approxTokens(para);
      continue;
    }

    const paraTokens = approxTokens(para);

    if (bufferTokens + paraTokens > maxTokens) {
      // Single paragraph larger than max — break it by sentence.
      flush();
      for (const sentence of splitSentences(para)) {
        const sTokens = approxTokens(sentence);
        if (bufferTokens + sTokens > targetTokens && buffer.length > 0) {
          flush();
          // Carry overlap from tail of previous chunk for continuity.
          carryOverlap(chunks, overlapTokens, buffer, bufferTokens);
          bufferTokens = approxTokens(buffer.join("\n\n"));
        }
        buffer.push(sentence);
        bufferTokens += sTokens;
      }
      continue;
    }

    if (bufferTokens + paraTokens > targetTokens && buffer.length > 0) {
      flush();
      carryOverlap(chunks, overlapTokens, buffer, bufferTokens);
      bufferTokens = approxTokens(buffer.join("\n\n"));
    }
    buffer.push(para);
    bufferTokens += paraTokens;
  }

  flush();
  return chunks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collapse runs of whitespace, join words broken across lines with `-\n`,
 * and strip null bytes / form-feeds common in PDF text extraction.
 */
export function normalise(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/\0/g, "")
    .replace(/(\w)-\n(\w)/g, "$1$2") // de-hyphenate line-break words
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitSentences(para: string): string[] {
  // Naive but adequate: split on ". " / "? " / "! " retaining punctuation.
  const parts = para.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  return parts ? parts.map((p) => p.trim()).filter(Boolean) : [para];
}

/**
 * Detect heading-like lines. Recognises patterns common in scheme rulebooks:
 *   "11.3.2 Compelling Evidence"
 *   "Chapter 11 — Dispute Resolution"
 *   "SECTION 4.1: REFUND RIGHTS"
 */
function detectHeading(para: string): string | null {
  if (para.length > 200) return null;
  const line = para.split("\n")[0].trim();

  // §-prefixed
  const section = line.match(/^(?:§|Section\s+)?(\d+(?:\.\d+){0,3})[\s:—\-–]+(.{3,150})$/i);
  if (section) return `§${section[1]} ${section[2].trim()}`;

  // Chapter/Appendix
  const chapter = line.match(/^((?:Chapter|Appendix|Part)\s+[A-Z0-9]+)[\s:—\-–]+(.{3,150})$/i);
  if (chapter) return `${chapter[1]} ${chapter[2].trim()}`;

  // All-caps heading (short)
  if (/^[A-Z0-9 ,\-–]{6,80}$/.test(line) && !line.includes(".")) {
    return line;
  }

  return null;
}

/**
 * Maintain a running heading path. Section-numbered headings replace the
 * stack level corresponding to their depth; chapter/all-caps headings reset
 * the stack.
 */
function updateHeadingStack(stack: string[], heading: string): void {
  const section = heading.match(/^§(\d+(?:\.\d+)*)/);
  if (!section) {
    stack.length = 0;
    stack.push(heading);
    return;
  }
  const depth = section[1].split(".").length;
  stack.length = Math.max(0, depth - 1);
  stack.push(heading);
}

function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/**
 * Carry the tail ~`overlapTokens` of the previous chunk into the current
 * buffer to preserve context across chunk boundaries.
 */
function carryOverlap(
  chunks: Chunk[],
  overlapTokens: number,
  buffer: string[],
  _currentTokens: number,
): void {
  if (chunks.length === 0 || overlapTokens <= 0) return;
  const prev = chunks[chunks.length - 1];
  const charsToCarry = overlapTokens * 4;
  if (prev.text.length <= charsToCarry) {
    buffer.push(prev.text);
    return;
  }
  buffer.push(prev.text.slice(-charsToCarry));
}
