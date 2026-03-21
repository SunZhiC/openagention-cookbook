/**
 * PatchEngine — Parse and apply unified diffs.
 *
 * Educational implementation that handles the core unified-diff format:
 *   - Hunk headers: @@ -startOld,countOld +startNew,countNew @@
 *   - Context lines (leading space), additions (+), deletions (-)
 *
 * Designed for teaching, not production use.
 */

// ── Types ─────────────────────────────────────────────────────────

/** A single hunk parsed from a unified diff. */
export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

/** A fully parsed unified diff. */
export interface ParsedDiff {
  oldFile: string;
  newFile: string;
  hunks: DiffHunk[];
}

// ── Parsing ───────────────────────────────────────────────────────

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a unified diff string into structured data.
 * Throws on malformed input with clear error messages.
 */
export function parseDiff(diff: string): ParsedDiff {
  if (!diff || diff.trim().length === 0) {
    throw new Error("PatchEngine: diff string is empty");
  }

  const lines = diff.split("\n");
  let cursor = 0;

  // Parse optional file headers (--- / +++)
  let oldFile = "a/file";
  let newFile = "b/file";

  while (cursor < lines.length) {
    const line = lines[cursor]!;
    if (line.startsWith("--- ")) {
      oldFile = line.slice(4).trim();
      cursor++;
    } else if (line.startsWith("+++ ")) {
      newFile = line.slice(4).trim();
      cursor++;
    } else if (line.startsWith("diff ") || line.startsWith("index ")) {
      // Skip git diff metadata lines
      cursor++;
    } else {
      break;
    }
  }

  // Parse hunks
  const hunks: DiffHunk[] = [];

  while (cursor < lines.length) {
    const line = lines[cursor]!;

    // Skip blank lines between hunks
    if (line.trim() === "") {
      cursor++;
      continue;
    }

    const headerMatch = HUNK_HEADER.exec(line);
    if (!headerMatch) {
      throw new Error(
        `PatchEngine: expected hunk header at line ${cursor + 1}, got: "${line}"`,
      );
    }

    const hunk: DiffHunk = {
      oldStart: parseInt(headerMatch[1]!, 10),
      oldCount: headerMatch[2] !== undefined ? parseInt(headerMatch[2], 10) : 1,
      newStart: parseInt(headerMatch[3]!, 10),
      newCount: headerMatch[4] !== undefined ? parseInt(headerMatch[4], 10) : 1,
    } as DiffHunk;

    cursor++;
    const hunkLines: string[] = [];

    while (cursor < lines.length) {
      const hLine = lines[cursor]!;
      if (hLine.startsWith("@@") || hLine.startsWith("diff ")) break;
      // Accept context ( ), additions (+), deletions (-), or empty lines within hunk
      if (
        hLine.startsWith(" ") ||
        hLine.startsWith("+") ||
        hLine.startsWith("-") ||
        hLine === ""
      ) {
        hunkLines.push(hLine);
        cursor++;
      } else {
        // Could be trailing "\ No newline at end of file" — skip
        if (hLine.startsWith("\\")) {
          cursor++;
          continue;
        }
        break;
      }
    }

    hunk.lines = hunkLines;
    hunks.push(hunk);
  }

  if (hunks.length === 0) {
    throw new Error("PatchEngine: no hunks found in diff");
  }

  return { oldFile, newFile, hunks };
}

// ── Apply ─────────────────────────────────────────────────────────

/**
 * Apply a unified diff to the original file content.
 * Returns the patched content.
 */
export function apply(original: string, diff: string): string {
  const parsed = parseDiff(diff);
  const oldLines = original.split("\n");
  const result: string[] = [];

  // Track our position in the original file (0-indexed)
  let oldCursor = 0;

  for (const hunk of parsed.hunks) {
    // Hunk line numbers are 1-indexed; copy everything before this hunk
    const hunkStart = hunk.oldStart - 1;

    if (hunkStart < oldCursor) {
      throw new Error(
        `PatchEngine: conflicting hunks — hunk starts at line ${hunk.oldStart} ` +
          `but we already consumed up to line ${oldCursor + 1}`,
      );
    }

    // Copy unchanged lines before the hunk
    while (oldCursor < hunkStart) {
      result.push(oldLines[oldCursor]!);
      oldCursor++;
    }

    // Process hunk lines
    for (const line of hunk.lines) {
      if (line.startsWith("-")) {
        // Deletion: skip this line in original
        oldCursor++;
      } else if (line.startsWith("+")) {
        // Addition: add the new line
        result.push(line.slice(1));
      } else {
        // Context line (leading space or empty): copy from original and advance
        result.push(oldLines[oldCursor]!);
        oldCursor++;
      }
    }
  }

  // Copy remaining lines after the last hunk
  while (oldCursor < oldLines.length) {
    result.push(oldLines[oldCursor]!);
    oldCursor++;
  }

  return result.join("\n");
}

// ── Revert ────────────────────────────────────────────────────────

/**
 * Revert a previously applied patch.
 * Swaps the role of + and - lines, then applies in reverse.
 */
export function revert(patched: string, diff: string): string {
  const parsed = parseDiff(diff);
  const patchedLines = patched.split("\n");
  const result: string[] = [];

  let cursor = 0;

  for (const hunk of parsed.hunks) {
    // For revert, we use newStart (the patched file's line numbers)
    const hunkStart = hunk.newStart - 1;

    // Copy unchanged lines before the hunk
    while (cursor < hunkStart) {
      result.push(patchedLines[cursor]!);
      cursor++;
    }

    // Process hunk lines in reverse sense
    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        // Was an addition → skip in revert (remove it)
        cursor++;
      } else if (line.startsWith("-")) {
        // Was a deletion → restore it
        result.push(line.slice(1));
      } else {
        // Context line: keep it
        result.push(patchedLines[cursor]!);
        cursor++;
      }
    }
  }

  // Copy remaining lines
  while (cursor < patchedLines.length) {
    result.push(patchedLines[cursor]!);
    cursor++;
  }

  return result.join("\n");
}

/**
 * Validate a diff string without applying it.
 * Returns true if valid, throws with a descriptive error otherwise.
 */
export function validate(diff: string): boolean {
  parseDiff(diff); // throws on invalid input
  return true;
}
