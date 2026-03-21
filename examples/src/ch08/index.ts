/**
 * Chapter 8 — Execution Lanes
 *
 * Demonstrates running the same task in all three execution modes:
 * local, worktree, and cloud. The cloud lane here is only a
 * higher-isolation simulation in the same process model.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, Task, ExecutionLane } from "@openagention/core";
import {
  AgentLoop,
  MockProvider,
  ToolRegistry,
  ExecutionLaneRunner,
} from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useLiveApi = process.env["LIVE_API"] === "true";

if (useLiveApi && !process.env["OPENAI_API_KEY"]) {
  console.error("LIVE_API=true but OPENAI_API_KEY is not set.");
  process.exit(1);
}

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
    const files: Record<string, string> = {
      "src/config.ts":
        "export const PORT = 3000;\nexport const HOST = 'localhost';",
    };
    const content = files[args["path"] as string];
    return content ?? `Error: file not found: ${args["path"]}`;
  },
);

// ── Provider ──────────────────────────────────────────────────────

function loadFixtures(): Message[] {
  const raw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  return JSON.parse(raw) as Message[];
}

async function getProvider() {
  if (useLiveApi) {
    const { OpenAIProvider } = await import("@openagention/runtime");
    return new OpenAIProvider();
  }
  return new MockProvider(loadFixtures());
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 8: Execution Lanes ═══\n");

  const laneRunner = new ExecutionLaneRunner();
  const modes: ExecutionLane[] = ["local", "worktree", "cloud"];

  for (const mode of modes) {
    console.log(`\n── Lane: ${mode} ──────────────────────────`);

    const provider = await getProvider();
    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 30_000,
      tools,
      provider,
    });

    const task: Task = {
      id: `task_${mode}_001`,
      name: `Config analysis (${mode})`,
      goal: "Read the config file and summarize the server settings.",
      state: "pending",
      traceEvents: [],
    };

    const result = await laneRunner.run(task, mode, loop);

    // Print conversation
    for (const msg of result.messages.slice(1)) {
      if (msg.role === "assistant" && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          console.log(
            `  [${mode}] → ${tc.function.name}(${tc.function.arguments.slice(0, 50)})`,
          );
        }
      } else if (msg.role === "tool") {
        const preview =
          msg.content.slice(0, 60) + (msg.content.length > 60 ? "..." : "");
        console.log(`  [${mode}] ← ${preview}`);
      } else if (msg.role === "assistant") {
        console.log(`  [${mode}] ${msg.content.slice(0, 80)}...`);
      }
    }

    // Print lane-specific events
    console.log(`  Lane events: ${result.laneEvents.length}`);
    for (const evt of result.laneEvents) {
      if (evt.type === "state_change") {
        const d = evt.data as { from: string; to: string };
        console.log(`    ${d.from} → ${d.to}`);
      }
    }

    console.log(`  Trace events: ${result.traceEvents.length}`);
  }

  console.log("\n═══ All lanes complete ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
