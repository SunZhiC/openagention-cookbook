import { describe, it, expect, vi, afterEach } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesRoot = join(__dirname, "..");

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

function hasCompletionMarker(output: string): boolean {
  return (
    (output.includes("Trace:") && output.includes("events")) ||
    output.includes("All lanes complete") ||
    output.includes("═══ Done ═══")
  );
}

async function waitForExampleCompletion(
  file: string,
  logs: string[],
  errors: string[],
): Promise<string> {
  const timeoutAt = Date.now() + 15_000;

  while (Date.now() < timeoutAt) {
    if (errors.length > 0) {
      throw new Error(`${file} wrote to stderr:\n${errors.join("\n")}`);
    }

    const output = logs.join("\n");
    if (hasCompletionMarker(output)) {
      return output;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`${file} did not reach a completion marker in time`);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("CLI example in-process coverage", () => {
  for (const { name, file } of chapters) {
    it(`${name} runs to completion in-process`, async () => {
      const logs: string[] = [];
      const errors: string[] = [];

      vi.stubEnv("LIVE_API", "false");
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
        code?: number,
      ) => {
        throw new Error(`process.exit:${code ?? 0}`);
      }) as never);
      vi.spyOn(console, "log").mockImplementation((...args) => {
        logs.push(args.map(String).join(" "));
      });
      vi.spyOn(console, "error").mockImplementation((...args) => {
        errors.push(args.map(String).join(" "));
      });

      const moduleUrl =
        pathToFileURL(join(examplesRoot, file)).href +
        `?in-process=${Date.now()}`;

      await import(moduleUrl);
      const output = await waitForExampleCompletion(file, logs, errors);

      expect(output.length).toBeGreaterThan(0);
      expect(hasCompletionMarker(output)).toBe(true);
      expect(errors).toEqual([]);
      expect(exitSpy).not.toHaveBeenCalled();
    }, 20_000);
  }
});
