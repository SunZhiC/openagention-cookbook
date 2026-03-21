import { describe, it, expect } from "vitest";
import { parseDiff, apply, revert, validate } from "../patch-engine.js";

const VALID_DIFF = `--- a/src/math.ts
+++ b/src/math.ts
@@ -1,3 +1,3 @@
 export function add(a: number, b: number): number {
-  return a - b; // BUG: should be a + b
+  return a + b;
 }`;

const ORIGINAL = `export function add(a: number, b: number): number {
  return a - b; // BUG: should be a + b
}

export function multiply(a: number, b: number): number {
  return a * b;
}`;

const PATCHED = `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}`;

describe("PatchEngine", () => {
  describe("parseDiff", () => {
    it("parses a valid unified diff with file headers and hunk", () => {
      const parsed = parseDiff(VALID_DIFF);
      expect(parsed.oldFile).toBe("a/src/math.ts");
      expect(parsed.newFile).toBe("b/src/math.ts");
      expect(parsed.hunks).toHaveLength(1);
      expect(parsed.hunks[0]!.oldStart).toBe(1);
      expect(parsed.hunks[0]!.oldCount).toBe(3);
      expect(parsed.hunks[0]!.newStart).toBe(1);
      expect(parsed.hunks[0]!.newCount).toBe(3);
    });

    it("throws on empty diff string", () => {
      expect(() => parseDiff("")).toThrow("diff string is empty");
    });

    it("throws on whitespace-only diff string", () => {
      expect(() => parseDiff("   \n  ")).toThrow("diff string is empty");
    });

    it("throws on malformed diff missing hunk header", () => {
      const bad = `--- a/file.ts
+++ b/file.ts
this is not a hunk header`;
      expect(() => parseDiff(bad)).toThrow("expected hunk header");
    });

    it("throws when no hunks are found (only file headers)", () => {
      const headersOnly = `--- a/file.ts
+++ b/file.ts`;
      expect(() => parseDiff(headersOnly)).toThrow("no hunks found");
    });

    it("parses git metadata, omitted counts, blank lines between hunks, and no-newline markers", () => {
      const diff = `diff --git a/src/file.ts b/src/file.ts
index 1234567..89abcde 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -2 +2 @@
-before
+after
\\ No newline at end of file

@@ -5 +5 @@
-tail
+TAIL`;

      const parsed = parseDiff(diff);
      expect(parsed.oldFile).toBe("a/src/file.ts");
      expect(parsed.newFile).toBe("b/src/file.ts");
      expect(parsed.hunks).toHaveLength(2);
      expect(parsed.hunks[0]).toMatchObject({
        oldStart: 2,
        oldCount: 1,
        newStart: 2,
        newCount: 1,
      });
      expect(parsed.hunks[1]).toMatchObject({
        oldStart: 5,
        oldCount: 1,
        newStart: 5,
        newCount: 1,
      });
      expect(parsed.hunks[0]!.lines).toEqual(["-before", "+after", ""]);
    });
  });

  describe("apply", () => {
    it("applies a valid unified diff to original content", () => {
      const result = apply(ORIGINAL, VALID_DIFF);
      expect(result).toBe(PATCHED);
    });

    it("throws on conflicting hunks (overlapping ranges)", () => {
      // Diff that targets the same lines twice
      const conflicting = `@@ -1,2 +1,2 @@
-line1
+LINE1
 line2
@@ -1,2 +1,2 @@
-line1
+LINE1_AGAIN
 line2`;
      expect(() => apply("line1\nline2\nline3", conflicting)).toThrow(
        "conflicting hunks",
      );
    });

    it("preserves unchanged lines before and after an offset hunk", () => {
      const original = `line 1
line 2
context
old value
line 5`;
      const diff = `diff --git a/src/file.ts b/src/file.ts
index 1234567..89abcde 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -3,2 +3,2 @@
 context
-old value
+new value
\\ No newline at end of file`;

      expect(apply(original, diff)).toBe(`line 1
line 2
context
new value
line 5`);
    });
  });

  describe("revert", () => {
    it("reverts a previously applied patch to restore original content", () => {
      const result = revert(PATCHED, VALID_DIFF);
      expect(result).toBe(ORIGINAL);
    });

    it("round-trips: apply then revert yields original", () => {
      const applied = apply(ORIGINAL, VALID_DIFF);
      const reverted = revert(applied, VALID_DIFF);
      expect(reverted).toBe(ORIGINAL);
    });

    it("restores unchanged prefix lines when reverting an offset hunk", () => {
      const diff = `@@ -3,2 +3,2 @@
 context
-old value
+new value`;
      const patched = `line 1
line 2
context
new value
line 5`;

      expect(revert(patched, diff)).toBe(`line 1
line 2
context
old value
line 5`);
    });
  });

  describe("edge cases", () => {
    it("skips blank lines between file headers and first hunk header", () => {
      // Blank line after +++ before @@ — exercises the blank-line-skip in the outer hunk loop
      const diff = `--- a/file.ts
+++ b/file.ts

@@ -1,2 +1,2 @@
-old
+new`;
      const parsed = parseDiff(diff);
      expect(parsed.hunks).toHaveLength(1);
      expect(parsed.hunks[0]!.lines).toEqual(["-old", "+new"]);
    });

    it("handles hunk with only additions (no deletions or context)", () => {
      const diff = `@@ -1,0 +1,2 @@
+line1
+line2`;
      const parsed = parseDiff(diff);
      expect(parsed.hunks).toHaveLength(1);
      expect(parsed.hunks[0]!.lines).toEqual(["+line1", "+line2"]);
    });
  });

  describe("validate", () => {
    it("returns true for a valid diff", () => {
      expect(validate(VALID_DIFF)).toBe(true);
    });

    it("throws for an invalid diff", () => {
      expect(() => validate("not a valid diff")).toThrow();
    });
  });
});
