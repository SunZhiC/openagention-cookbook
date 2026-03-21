/**
 * Chapter 3 — Planner
 *
 * Demonstrates an agent that generates a plan (list of steps),
 * then executes each step sequentially, showing Task creation
 * and state transitions.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, Task, TaskState } from "@openagention/core";
import { AgentLoop, MockProvider, ToolRegistry } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useLiveApi = process.env["LIVE_API"] === "true";

if (useLiveApi && !process.env["OPENAI_API_KEY"]) {
  console.error("LIVE_API=true but OPENAI_API_KEY is not set.");
  process.exit(1);
}

// ── Task tracker ───────────────────────────────────────────────────

const tasks: Task[] = [];

function createTask(name: string, goal: string): Task {
  const task: Task = {
    id: `task_${String(tasks.length + 1).padStart(3, "0")}`,
    name,
    goal,
    state: "pending",
    traceEvents: [],
  };
  tasks.push(task);
  return task;
}

function transitionTask(task: Task, to: TaskState): void {
  console.log(`  [state] ${task.name}: ${task.state} → ${to}`);
  task.state = to;
}

// ── Tool registry ──────────────────────────────────────────────────

const tools = new ToolRegistry();

tools.register(
  {
    name: "createPlan",
    description: "Create a multi-step plan. Each step becomes a Task.",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              goal: { type: "string" },
            },
          },
        },
      },
      required: ["steps"],
    },
  },
  async (args) => {
    const steps = args["steps"] as Array<{ name: string; goal: string }>;
    for (const step of steps) {
      createTask(step.name, step.goal);
    }
    return `Plan created with ${steps.length} tasks: ${tasks.map((t) => t.name).join(", ")}`;
  },
);

tools.register(
  {
    name: "executeStep",
    description: "Execute a step from the plan by index.",
    parameters: {
      type: "object",
      properties: {
        stepIndex: { type: "number" },
        action: { type: "string" },
      },
      required: ["stepIndex", "action"],
    },
  },
  async (args) => {
    const idx = args["stepIndex"] as number;
    const action = args["action"] as string;
    const task = tasks[idx];
    if (!task) return `Error: no task at index ${idx}`;

    transitionTask(task, "running");
    // Simulate work
    transitionTask(task, "done");
    return `Step ${idx} (${task.name}) completed: ${action}`;
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
  console.log("═══ Chapter 3: Planner ═══\n");

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
        "Build a logger module for this TypeScript project. Plan the steps first, then execute each one.",
    },
  ]);

  // Print conversation highlights
  for (const msg of result.messages.slice(1)) {
    if (msg.role === "assistant" && msg.tool_calls) {
      console.log(`\n[assistant] ${msg.content}`);
      for (const tc of msg.tool_calls) {
        console.log(
          `  → ${tc.function.name}(${tc.function.arguments.slice(0, 80)}...)`,
        );
      }
    } else if (msg.role === "tool") {
      console.log(`  ← ${msg.content}`);
    } else if (msg.role === "assistant") {
      console.log(`\n[assistant] ${msg.content}`);
    }
  }

  console.log("\n── Task summary ──");
  for (const task of tasks) {
    console.log(`  ${task.id} | ${task.name.padEnd(20)} | ${task.state}`);
  }
  console.log(`\n── Trace: ${result.traceEvents.length} events ──`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
