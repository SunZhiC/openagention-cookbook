/**
 * Chapter 10 — DAG Scheduling
 *
 * Demonstrates dependency-aware scheduling of 5 tasks in a DAG:
 *   task-1 (setup) → task-2 (database) + task-3 (auth) → task-4 (api) → task-5 (tests)
 *
 * Tasks 2 and 3 run in parallel since they only depend on task-1.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, Task } from "@openagention/core";
import { AgentLoop, MockProvider, ToolRegistry } from "@openagention/runtime";
import { Scheduler } from "@openagention/orchestrator";

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

// ── Tasks ─────────────────────────────────────────────────────────

function createTasks(): Task[] {
  return [
    {
      id: "task-1",
      name: "setup",
      goal: "Set up project structure and config",
      state: "pending",
      traceEvents: [],
    },
    {
      id: "task-2",
      name: "database",
      goal: "Set up database schema and connection",
      state: "pending",
      traceEvents: [],
    },
    {
      id: "task-3",
      name: "auth",
      goal: "Implement authentication middleware",
      state: "pending",
      traceEvents: [],
    },
    {
      id: "task-4",
      name: "api",
      goal: "Build API routes with auth and database",
      state: "pending",
      traceEvents: [],
    },
    {
      id: "task-5",
      name: "tests",
      goal: "Write integration tests for all endpoints",
      state: "pending",
      traceEvents: [],
    },
  ];
}

function createDependencies(): Map<string, string[]> {
  return new Map([
    ["task-1", []],
    ["task-2", ["task-1"]],
    ["task-3", ["task-1"]],
    ["task-4", ["task-2", "task-3"]],
    ["task-5", ["task-4"]],
  ]);
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 10: DAG Scheduling ═══\n");

  const tasks = createTasks();
  const deps = createDependencies();
  const scheduler = new Scheduler(tasks, deps);

  const cycle = scheduler.detectCycle();
  if (cycle) {
    console.log(`Dependency cycle detected: ${cycle.join(" → ")}`);
    process.exit(1);
  }

  console.log("Dependency cycle check: none");

  // Show execution plan
  const batches = scheduler.getExecutionOrder();
  console.log("Execution plan (parallel batches):");
  for (let i = 0; i < batches.length; i++) {
    const names = batches[i]!.map((id) => scheduler.getTask(id)?.name ?? id);
    console.log(`  Batch ${i + 1}: [${names.join(", ")}]`);
  }
  console.log();

  // Load fixtures — each task gets 2 responses (tool_call + final)
  const allResponses = loadFixtures();
  let responseIdx = 0;

  // Execute batches
  let batchNum = 0;
  while (!scheduler.isComplete()) {
    if (scheduler.isStalled()) {
      console.log("STALL detected! Aborting.");
      break;
    }

    const ready = scheduler.getReady();
    if (ready.length === 0) break;

    batchNum++;
    const names = ready.map((t) => t.name);
    console.log(`── Batch ${batchNum}: [${names.join(", ")}] ──`);

    // Run all ready tasks in parallel
    const _batchResults = await Promise.all(
      ready.map(async (task) => {
        scheduler.markRunning(task.id);

        // Each task consumes 2 responses from fixtures
        const taskResponses = allResponses.slice(responseIdx, responseIdx + 2);
        responseIdx += 2;

        const provider = new MockProvider(taskResponses);
        const loop = new AgentLoop({
          maxTurns: 5,
          timeout: 30_000,
          tools,
          provider,
        });

        const userMessage: Message = { role: "user", content: task.goal };
        const result = await loop.run([userMessage]);

        scheduler.markDone(task.id);

        // Print task result
        const lastAssistant = result.messages
          .filter((m) => m.role === "assistant" && !m.tool_calls)
          .pop();
        console.log(
          `  [done] ${task.name}: ${lastAssistant?.content?.slice(0, 60) ?? "complete"}`,
        );

        return result;
      }),
    );
  }

  // Print trace summary
  const traceEvents = scheduler.getTraceEvents();
  console.log(`\nScheduler trace events: ${traceEvents.length}`);
  for (const evt of traceEvents) {
    if (evt.type === "state_change") {
      const d = evt.data as { entityId: string; from: string; to: string };
      console.log(`  ${d.entityId}: ${d.from} → ${d.to}`);
    }
  }

  console.log(`\nAll tasks complete: ${scheduler.isComplete()}`);
  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
