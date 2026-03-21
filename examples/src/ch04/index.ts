/**
 * Chapter 4 — Memory
 *
 * Demonstrates how an agent manages its context window:
 * summarization when context gets long, and Checkpoint creation
 * for resumability.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, Checkpoint } from "@openagention/core";
import { AgentLoop, MockProvider, ToolRegistry } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useLiveApi = process.env["LIVE_API"] === "true";

if (useLiveApi && !process.env["OPENAI_API_KEY"]) {
  console.error("LIVE_API=true but OPENAI_API_KEY is not set.");
  process.exit(1);
}

// ── Simulated state ────────────────────────────────────────────────

const fs: Record<string, string> = {
  "src/index.ts":
    'import { Config } from "./types.js";\n\nexport function main(config: Config) {\n  console.log("Starting with", config);\n}',
  "src/types.ts":
    "export interface Config { port: number; host: string; }\nexport interface Options { verbose: boolean; }\nexport interface Result { ok: boolean; data: unknown; }",
};

let contextSummary = "";
const checkpoints: Checkpoint[] = [];
let contextTokenEstimate = 0;

// ── Tool registry ──────────────────────────────────────────────────

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
    contextTokenEstimate += Math.ceil(content.length / 4);
    console.log(`  [memory] context ≈ ${contextTokenEstimate} tokens`);
    return content;
  },
);

tools.register(
  {
    name: "summarizeContext",
    description: "Summarize the accumulated context to free up token space.",
    parameters: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
  },
  async (args) => {
    contextSummary = args["summary"] as string;
    const saved = contextTokenEstimate;
    contextTokenEstimate = Math.ceil(contextSummary.length / 4);
    console.log(
      `  [memory] summarized: ${saved} → ${contextTokenEstimate} tokens`,
    );
    return `Context summarized. Previous ≈${saved} tokens, now ≈${contextTokenEstimate} tokens.`;
  },
);

tools.register(
  {
    name: "createCheckpoint",
    description: "Save a resumable checkpoint of the current state.",
    parameters: {
      type: "object",
      properties: { label: { type: "string" } },
      required: ["label"],
    },
  },
  async (args) => {
    const cp: Checkpoint = {
      id: `cp_${String(checkpoints.length + 1).padStart(3, "0")}`,
      runId: "run_001",
      timestamp: new Date().toISOString(),
      snapshot: JSON.stringify({ contextSummary, contextTokenEstimate }),
      resumable: true,
    };
    checkpoints.push(cp);
    return `Checkpoint ${cp.id} created (label: ${args["label"]})`;
  },
);

// ── Provider ───────────────────────────────────────────────────────

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

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 4: Memory ═══\n");

  const provider = await getProvider();
  const loop = new AgentLoop({
    maxTurns: 15,
    timeout: 60_000,
    tools,
    provider,
  });

  const result = await loop.run([
    {
      role: "user",
      content:
        "Analyze this project's source code. Summarize when context grows large, and checkpoint your progress.",
    },
  ]);

  for (const msg of result.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      console.log(`\n[assistant] ${msg.content}`);
      for (const tc of msg.tool_calls) {
        console.log(
          `  → ${tc.function.name}(${tc.function.arguments.slice(0, 60)})`,
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

  console.log("\n── Checkpoints ──");
  for (const cp of checkpoints) {
    console.log(`  ${cp.id} | ${cp.timestamp} | resumable=${cp.resumable}`);
  }

  if (contextSummary) {
    console.log(`\n── Context summary ──\n  ${contextSummary}`);
  }

  console.log(`\n── Trace: ${result.traceEvents.length} events ──`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
