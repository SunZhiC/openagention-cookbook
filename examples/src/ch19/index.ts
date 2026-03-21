/**
 * Chapter 19 — Assembling the OpenAgention System
 *
 * Full system assembly demonstrating the complete orchestration pipeline:
 *   - SupervisorAgent decomposes a goal into sub-tasks
 *   - Scheduler manages DAG-based execution ordering
 *   - WorkerAgents execute tasks using injected skill tools
 *   - Output goes through ReviewQueue for approval
 *   - HandoffManager creates checkpoints for resumability
 *   - Shows the entire pipeline from goal to completion
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, Task, TaskState } from "@openagention/core";
import {
  AgentLoop as _AgentLoop,
  MockProvider,
  ToolRegistry,
} from "@openagention/runtime";
import {
  Scheduler,
  ReviewQueue,
  WorkerAgent,
  HandoffManager,
} from "@openagention/orchestrator";
import {
  SkillLoader,
  codeReviewSkill,
  testingSkill,
} from "@openagention/skills";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  console.log("═══ Chapter 19: System Assembly ═══\n");

  const goal = "Build and test a user authentication module";
  console.log(`── Goal: ${goal} ──\n`);

  const allResponses = loadFixtures();

  // ── Step 1: Skills setup ──────────────────────────────────────

  console.log("── Step 1: Skills ──");

  const loader = new SkillLoader();
  loader.register(codeReviewSkill);
  loader.register(testingSkill);

  const tools = new ToolRegistry();
  loader.inject(codeReviewSkill.id, tools);
  loader.inject(testingSkill.id, tools);

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

  console.log(`  Skills loaded: ${loader.list().length}`);
  console.log(`  Tools available: ${tools.list().length}`);

  // ── Step 2: Supervisor planning ───────────────────────────────

  console.log("\n── Step 2: Supervisor Planning ──");

  const planProvider = new MockProvider([allResponses[0]!]);
  const planResponse = await planProvider.chat(
    [{ role: "user", content: `Break down this goal: ${goal}` }],
    tools.list(),
  );

  const lines = planResponse.content
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => /^\d+[\.\)]/.test(l));

  const tasks: Task[] = lines.map((line: string, idx: number) => {
    const name = line.replace(/^\d+[\.\)]\s*/, "");
    return {
      id: `task_${String(idx + 1).padStart(3, "0")}`,
      name,
      goal: name,
      state: "pending" as TaskState,
      traceEvents: [],
    };
  });

  console.log(`  Sub-tasks: ${tasks.length}`);
  for (let i = 0; i < tasks.length; i++) {
    console.log(`  ${i + 1}. ${tasks[i]!.name}`);
  }

  // ── Step 3: Scheduler — DAG execution ─────────────────────────

  console.log("\n── Step 3: DAG Scheduling ──");

  const deps = new Map<string, string[]>();
  deps.set("task_001", []);
  deps.set("task_002", ["task_001"]);
  deps.set("task_003", ["task_002"]);
  deps.set("task_004", ["task_003"]);

  const scheduler = new Scheduler(tasks, deps);
  const batches = scheduler.getExecutionOrder();

  for (let i = 0; i < batches.length; i++) {
    console.log(`  Batch ${i + 1}: ${batches[i]!.join(", ")}`);
  }

  // ── Step 4: Execute via Workers ───────────────────────────────

  console.log("\n── Step 4: Worker Execution ──");

  let responseIdx = 1;
  let batchNum = 0;

  while (!scheduler.isComplete()) {
    if (scheduler.hasDeadlock()) {
      console.log("  DEADLOCK detected!");
      break;
    }

    const ready = scheduler.getReady();
    if (ready.length === 0) break;

    batchNum++;
    console.log(
      `  [Batch ${batchNum}] Running: ${ready.map((t) => t.id).join(", ")}`,
    );

    for (const task of ready) {
      scheduler.markRunning(task.id);

      const workerResponses = allResponses.slice(responseIdx, responseIdx + 2);
      responseIdx += 2;

      const workerProvider = new MockProvider(workerResponses);
      const worker = new WorkerAgent({ provider: workerProvider, tools });
      await worker.execute(task);

      if (task.state === "done") {
        scheduler.markDone(task.id);
        console.log(`    [done] ${task.name}`);
      } else {
        scheduler.markFailed(task.id);
        console.log(`    [fail] ${task.name}`);
      }
    }
  }

  // ── Step 5: Review Queue ──────────────────────────────────────

  console.log("\n── Step 5: Review Queue ──");

  const reviewQueue = new ReviewQueue();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    reviewQueue.enqueue({
      id: `review_${String(i + 1).padStart(3, "0")}`,
      taskId: task.id,
      content: `Output of: ${task.name}`,
      state: "pending",
    });
  }
  console.log(`  Enqueued ${tasks.length} review items`);

  const approvedIds: string[] = [];
  for (const item of reviewQueue.list("pending")) {
    reviewQueue.approve(item.id, "supervisor");
    approvedIds.push(item.id);
  }
  console.log(`  Approved: ${approvedIds.join(", ")}`);

  // ── Step 6: Handoff checkpoint ────────────────────────────────

  console.log("\n── Step 6: Handoff Checkpoint ──");

  const handoff = new HandoffManager();
  const run = {
    id: "run_assembly",
    threadId: "thread_main",
    tasks,
    lane: "local" as const,
    checkpoints: [],
  };
  const checkpoint = handoff.createCheckpoint(run);
  console.log(`  Checkpoint: ${checkpoint.id}`);
  console.log(`  Resumable: ${checkpoint.resumable}`);

  // ── Summary ───────────────────────────────────────────────────

  console.log("\n── Summary ──");
  const doneCount = tasks.filter((t) => t.state === "done").length;
  const failedCount = tasks.filter((t) => t.state === "failed").length;
  const approvedCount = reviewQueue.list("approved").length;
  const schedulerEvents = scheduler.getTraceEvents();
  const reviewEvents = reviewQueue.getTraceEvents();
  const totalEvents = schedulerEvents.length + reviewEvents.length;

  console.log(`  Skills: ${loader.list().length}`);
  console.log(`  Tasks: ${doneCount} done, ${failedCount} failed`);
  console.log(`  Review items: ${approvedCount} approved`);
  console.log(`  Checkpoint: ${checkpoint.id}`);
  console.log(`  Total trace events: ${totalEvents}`);

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
