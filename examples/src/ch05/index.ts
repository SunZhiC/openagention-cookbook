/**
 * Chapter 5 — Safe File Editing
 *
 * Demonstrates patch-based file editing: the agent reads a file,
 * generates a unified diff to fix a bug, applies the patch,
 * then verifies the result.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import {
  AgentLoop,
  MockProvider,
  ToolRegistry,
  apply,
  validate,
} from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useLiveApi = process.env["LIVE_API"] === "true";

if (useLiveApi && !process.env["OPENAI_API_KEY"]) {
  console.error("LIVE_API=true but OPENAI_API_KEY is not set.");
  process.exit(1);
}

// ── Simulated file system ─────────────────────────────────────────

const fs: Record<string, string> = {
  "src/math.ts":
    "export function add(a: number, b: number): number {\n  return a - b; // BUG: should be a + b\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}",
};

// ── Tool registry ─────────────────────────────────────────────────

const tools = new ToolRegistry();

tools.register(
  {
    name: "readFile",
    description: "Read the contents of a file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  async (args) => {
    const p = args["path"] as string;
    const content = fs[p];
    if (!content) return `Error: file not found: ${p}`;
    return content;
  },
);

tools.register(
  {
    name: "applyPatch",
    description: "Apply a unified diff patch to a file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        diff: { type: "string", description: "Unified diff format" },
      },
      required: ["path", "diff"],
    },
  },
  async (args) => {
    const p = args["path"] as string;
    const diff = args["diff"] as string;
    const original = fs[p];
    if (!original) return `Error: file not found: ${p}`;

    try {
      validate(diff);
      const patched = apply(original, diff);
      fs[p] = patched;
      return `Patch applied successfully to ${p}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Patch failed: ${msg}`;
    }
  },
);

tools.register(
  {
    name: "verifyPatch",
    description: "Read the file after patching to verify the fix.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  async (args) => {
    const p = args["path"] as string;
    const content = fs[p];
    if (!content) return `Error: file not found: ${p}`;
    return `Current content of ${p}:\n${content}`;
  },
);

// ── Provider ──────────────────────────────────────────────────────

async function getProvider() {
  if (useLiveApi) {
    const { OpenAIProvider } = await import("@openagention/runtime");
    return new OpenAIProvider();
  }
  const raw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  return new MockProvider(JSON.parse(raw) as Message[]);
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 5: Safe File Editing ═══\n");

  const provider = await getProvider();
  const loop = new AgentLoop({
    maxTurns: 10,
    timeout: 30_000,
    tools,
    provider,
  });

  const result = await loop.run([
    {
      role: "user",
      content:
        "There's a bug in src/math.ts — the add function subtracts instead of adding. Please fix it using a patch.",
    },
  ]);

  for (const msg of result.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      console.log(`\n[assistant] ${msg.content}`);
      for (const tc of msg.tool_calls) {
        console.log(
          `  → ${tc.function.name}(${tc.function.arguments.slice(0, 60)}...)`,
        );
      }
    } else if (msg.role === "tool") {
      const preview =
        msg.content.slice(0, 80) + (msg.content.length > 80 ? "..." : "");
      console.log(`  ← ${preview}`);
    } else if (msg.role === "assistant") {
      console.log(`\n[assistant] ${msg.content}`);
    }
  }

  console.log(`\n── Final file content ──`);
  console.log(fs["src/math.ts"]);

  console.log(`\n── Trace: ${result.traceEvents.length} events ──`);
  for (const evt of result.traceEvents) {
    console.log(`  ${evt.type.padEnd(14)} ${evt.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
