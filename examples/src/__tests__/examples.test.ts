import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesRoot = join(__dirname, "..");
const projectRoot = join(examplesRoot, "..", "..");
const tsxBin = join(projectRoot, "node_modules", ".bin", "tsx");

function runExample(file: string): Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(examplesRoot, file);
    const child = spawn(tsxBin, [scriptPath], {
      cwd: examplesRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 15_000);

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${file} timed out before exiting cleanly`));
        return;
      }
      resolve({ stdout, stderr, code, signal });
    });

    child.on("error", reject);
  });
}

const chapters = [
  { name: "ch01", file: "ch01/index.ts" },
  { name: "ch02", file: "ch02/index.ts" },
  { name: "ch03", file: "ch03/index.ts" },
  { name: "ch04", file: "ch04/index.ts" },
  { name: "ch05", file: "ch05/index.ts" },
  { name: "ch06", file: "ch06/index.ts" },
  { name: "ch07", file: "ch07/index.ts" },
  { name: "ch08", file: "ch08/index.ts" },
  { name: "ch09", file: "ch09/index.ts" },
  { name: "ch10", file: "ch10/index.ts" },
  { name: "ch11", file: "ch11/index.ts" },
  { name: "ch12", file: "ch12/index.ts" },
  { name: "ch13", file: "ch13/index.ts" },
  { name: "ch14", file: "ch14/index.ts" },
  { name: "ch15", file: "ch15/index.ts" },
  { name: "ch16", file: "ch16/index.ts" },
  { name: "ch17", file: "ch17/index.ts" },
  { name: "ch18", file: "ch18/index.ts" },
  { name: "ch19", file: "ch19/index.ts" },
  { name: "ch20", file: "ch20/index.ts" },
];

describe("CLI example integration tests", () => {
  for (const { name, file } of chapters) {
    it(`${name} example runs without error`, async () => {
      const result = await runExample(file);
      // The example should produce output containing the chapter header
      expect(result.stdout.length).toBeGreaterThan(0);
      // Should contain a completion marker indicating it ran to completion
      const hasCompletionMarker =
        (result.stdout.includes("Trace:") &&
          result.stdout.includes("events")) ||
        result.stdout.includes("All lanes complete") ||
        result.stdout.includes("═══ Done ═══");
      expect(hasCompletionMarker).toBe(true);
      expect(result.code).toBe(0);
      expect(result.signal).toBeNull();
      // stderr should not contain uncaught errors
      expect(result.stderr).not.toContain("Error:");
    }, 20_000);
  }
});
