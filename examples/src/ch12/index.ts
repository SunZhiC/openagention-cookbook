/**
 * Chapter 12 — Handoff & Continuation
 *
 * Demonstrates best-effort checkpoint handoff between agents:
 *   - Agent A writes code and creates a checkpoint
 *   - Agent B restores from the checkpoint and continues
 *   - Shows lossy contextual resumption rather than full persistence
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, Thread, Run, Task } from "@openagention/core";
import { AgentLoop, MockProvider, ToolRegistry } from "@openagention/runtime";
import { HandoffManager } from "@openagention/orchestrator";

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

tools.register(
  {
    name: "readFile",
    description: "Read a file's contents.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  async (args) => {
    const files: Record<string, string> = {
      "src/user-service.ts":
        "export class UserService { async getById(id: string) { return db.users.find(id); } }",
    };
    return (
      files[args["path"] as string] ?? `Error: file not found: ${args["path"]}`
    );
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

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 12: Handoff & Continuation ═══\n");

  const allResponses = loadFixtures();
  const handoff = new HandoffManager();

  // ── Agent A: Write code ──────────────────────────────────────

  console.log("── Agent A: Writing code ──");

  const taskA: Task = {
    id: "task_write_001",
    name: "Implement user service",
    goal: "Write a user service module with CRUD operations",
    state: "running",
    traceEvents: [],
  };

  const runA: Run = {
    id: "run_agent_a",
    threadId: "thread_a",
    tasks: [taskA],
    lane: "local",
    checkpoints: [],
  };

  const threadA: Thread = {
    id: "thread_a",
    title: "Agent A — Code Writer",
    runs: [runA],
  };

  // Agent A runs with first 2 responses
  const providerA = new MockProvider(allResponses.slice(0, 2));
  const loopA = new AgentLoop({
    maxTurns: 5,
    timeout: 30_000,
    tools,
    provider: providerA,
  });

  const resultA = await loopA.run([{ role: "user", content: taskA.goal }]);

  for (const msg of resultA.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        console.log(
          `  → ${tc.function.name}(${tc.function.arguments.slice(0, 50)})`,
        );
      }
    } else if (msg.role === "assistant") {
      console.log(`  ${msg.content.slice(0, 70)}`);
    }
  }

  // Mark task as done
  taskA.state = "done";

  // Create a simplified checkpoint for best-effort restoration
  const checkpointA = handoff.createCheckpoint(runA);
  console.log(`\n  Checkpoint created (best effort): ${checkpointA.id}`);
  console.log(`  Resumable: ${checkpointA.resumable}`);

  // ── Handoff A → B ────────────────────────────────────────────

  console.log("\n── Handoff: Agent A → Agent B ──");

  const threadB: Thread = {
    id: "thread_b",
    title: "Agent B — Code Reviewer",
    runs: [],
  };

  const handoffResult = handoff.handoff(
    threadA,
    threadB,
    "Review the user service code and add input validation",
  );

  console.log(`  Checkpoint: ${handoffResult.checkpoint.id}`);
  console.log(
    `  Trace events from handoff: ${handoffResult.traceEvents.length}`,
  );
  for (const evt of handoffResult.traceEvents) {
    if (evt.type === "state_change") {
      const d = evt.data as { entityId: string; from: string; to: string };
      console.log(`    ${d.entityId}: ${d.from} → ${d.to}`);
    } else if (evt.type === "message") {
      const d = evt.data as { content: string };
      console.log(`    ${d.content.slice(0, 70)}`);
    } else if (evt.type === "checkpoint") {
      console.log(
        `    checkpoint saved (resumable: ${(evt.data as { resumable: boolean }).resumable})`,
      );
    }
  }

  // ── Agent B: Review from checkpoint ──────────────────────────

  console.log("\n── Agent B: Restoring from checkpoint ──");

  // Restore the run from the lossy checkpoint snapshot
  const restoredRun = handoff.restore(handoffResult.checkpoint);
  console.log(
    `  Restored run (best effort): ${restoredRun.id} (${restoredRun.tasks.length} tasks)`,
  );

  // Set up Agent B's thread
  threadB.runs.push(restoredRun);

  // Agent B runs with remaining responses
  const providerB = new MockProvider(allResponses.slice(2, 4));
  const loopB = new AgentLoop({
    maxTurns: 5,
    timeout: 30_000,
    tools,
    provider: providerB,
  });

  const resultB = await loopB.run([
    {
      role: "user",
      content: "Review the user service code and add input validation",
    },
  ]);

  for (const msg of resultB.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        console.log(
          `  → ${tc.function.name}(${tc.function.arguments.slice(0, 50)})`,
        );
      }
    } else if (msg.role === "tool") {
      const preview =
        msg.content.slice(0, 60) + (msg.content.length > 60 ? "..." : "");
      console.log(`  ← ${preview}`);
    } else if (msg.role === "assistant") {
      console.log(`  ${msg.content.slice(0, 70)}`);
    }
  }

  // Create a final checkpoint after continuation
  const checkpointB = handoff.createCheckpoint(restoredRun);
  console.log(`\n  Final checkpoint (best effort): ${checkpointB.id}`);

  // Summary
  console.log("\n── Summary ──");
  console.log(`  Agent A trace events: ${resultA.traceEvents.length}`);
  console.log(`  Handoff trace events: ${handoffResult.traceEvents.length}`);
  console.log(`  Agent B trace events: ${resultB.traceEvents.length}`);
  const totalCheckpoints = new Set([
    ...runA.checkpoints.map((checkpoint) => checkpoint.id),
    ...restoredRun.checkpoints.map((checkpoint) => checkpoint.id),
  ]).size;
  console.log(`  Total checkpoints across runs: ${totalCheckpoints}`);

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
