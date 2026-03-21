/**
 * Chapter 7 — Worktree Isolation
 *
 * Demonstrates a simulated WorktreeManager lifecycle in memory.
 * The agent creates a worktree record, tracks simulated task progress,
 * and marks it as merged to show the basic lifecycle.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import {
  AgentLoop,
  MockProvider,
  ToolRegistry,
  WorktreeManager,
} from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useLiveApi = process.env["LIVE_API"] === "true";

if (useLiveApi && !process.env["OPENAI_API_KEY"]) {
  console.error("LIVE_API=true but OPENAI_API_KEY is not set.");
  process.exit(1);
}

// ── Worktree manager ──────────────────────────────────────────────

const wtManager = new WorktreeManager("/tmp/openagention-worktrees");

// ── Tool registry ─────────────────────────────────────────────────

const tools = new ToolRegistry();

tools.register(
  {
    name: "createWorktree",
    description: "Create a simulated git worktree record for a task.",
    parameters: {
      type: "object",
      properties: {
        branch: { type: "string" },
        taskId: { type: "string" },
      },
      required: ["branch", "taskId"],
    },
  },
  async (args) => {
    const wt = wtManager.create(
      args["branch"] as string,
      args["taskId"] as string,
    );
    return `Simulated worktree recorded: ${wt.id} at ${wt.path} (branch: ${wt.branch})`;
  },
);

tools.register(
  {
    name: "listWorktrees",
    description: "List all active worktrees.",
    parameters: { type: "object", properties: {} },
  },
  async () => {
    const wts = wtManager.list();
    if (wts.length === 0) return "No active worktrees.";
    return wts
      .map((wt) => `${wt.id}: ${wt.branch} (${wt.status}) → task ${wt.taskId}`)
      .join("\n");
  },
);

tools.register(
  {
    name: "completeWorktree",
    description: "Mark a simulated worktree as merged.",
    parameters: {
      type: "object",
      properties: { worktreeId: { type: "string" } },
      required: ["worktreeId"],
    },
  },
  async (args) => {
    const id = args["worktreeId"] as string;
    const wt = wtManager.markMerged(id);
    return `Simulated worktree ${wt.id} marked as merged in memory (branch: ${wt.branch})`;
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
  console.log("═══ Chapter 7: Worktree Isolation ═══\n");

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
        "Create an isolated worktree to work on the login feature, do the work, then complete it.",
    },
  ]);

  for (const msg of result.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      console.log(`\n[assistant] ${msg.content}`);
      for (const tc of msg.tool_calls) {
        console.log(
          `  → ${tc.function.name}(${tc.function.arguments.slice(0, 70)})`,
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

  console.log("\n── Worktree state ──");
  for (const wt of wtManager.list()) {
    console.log(`  ${wt.id}: ${wt.branch} [${wt.status}]`);
  }

  console.log(`\n── Trace: ${result.traceEvents.length} events ──`);
  for (const evt of result.traceEvents) {
    console.log(`  ${evt.type.padEnd(14)} ${evt.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
