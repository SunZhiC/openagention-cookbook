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
  {
    name: "ch09",
    file: "ch09/index.ts",
    expected: "Summary:",
  },
  {
    name: "ch10",
    file: "ch10/index.ts",
    expected: "Dependency cycle check: none",
  },
  {
    name: "ch11",
    file: "ch11/index.ts",
    expected: "── Resubmit review-002 ──",
  },
  {
    name: "ch12",
    file: "ch12/index.ts",
    expected: "best effort",
  },
] as const;

describe("ch09-ch12 smoke", () => {
  for (const chapter of chapters) {
    it(`${chapter.name} exits cleanly`, async () => {
      const result = await runExample(chapter.file);

      expect(result.code).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.stderr).not.toContain("Error:");
      expect(result.stdout).toContain("═══ Done ═══");
      expect(result.stdout).toContain(chapter.expected);
    }, 20_000);
  }
});
