/**
 * Chapter 9 — Supervisor-Worker Pattern
 *
 * Demonstrates a SupervisorAgent that decomposes a high-level goal
 * into sub-tasks, dispatches WorkerAgents for each, and collects
 * the aggregated results.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import { MockProvider, ToolRegistry } from "@openagention/runtime";
import { SupervisorAgent } from "@openagention/orchestrator";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Tool registry ─────────────────────────────────────────────────

const tools = new ToolRegistry();

tools.register(
  {
    name: "writeFile",
    description: "Write content to a file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  async (args) => `File written: ${args["path"]}`,
);

// ── Provider ──────────────────────────────────────────────────────

function loadFixtures(): Message[] {
  const raw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  return JSON.parse(raw) as Message[];
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 9: Supervisor-Worker Pattern ═══\n");

  const provider = new MockProvider(loadFixtures());

  const supervisor = new SupervisorAgent({
    provider,
    tools,
    maxWorkers: 3,
  });

  const result = await supervisor.dispatch("Build a REST API endpoint");

  // Print sub-tasks and their states
  console.log("Sub-tasks:");
  for (const task of result.tasks) {
    console.log(`  [${task.state}] ${task.id}: ${task.name}`);
  }

  // Print trace event summary
  const stateChanges = result.traceEvents.filter(
    (e) => e.type === "state_change",
  );
  const messages = result.traceEvents.filter((e) => e.type === "message");

  console.log(`\nTrace events: ${result.traceEvents.length} total`);
  console.log(`  State changes: ${stateChanges.length}`);
  console.log(`  Messages: ${messages.length}`);

  // Print supervisor decisions
  console.log("\nSupervisor decisions:");
  for (const evt of messages) {
    const data = evt.data as { role: string; content: string };
    if (data.role === "assistant") {
      console.log(`  → ${data.content.slice(0, 80)}`);
    }
  }

  console.log(`\nSummary: ${result.summary}`);
  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
