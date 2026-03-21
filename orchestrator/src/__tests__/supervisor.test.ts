import { describe, it, expect } from "vitest";
import type { Message } from "@openagention/core";
import { MockProvider, ToolRegistry } from "@openagention/runtime";
import { SupervisorAgent, WorkerAgent } from "../supervisor.js";

// ── Helpers ────────────────────────────────────────────────────────

function createTools(): ToolRegistry {
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
  return tools;
}

/** Build a MockProvider that returns a plan with numbered sub-tasks, then tool_call + final for each worker. */
function createPlanProvider(subTaskCount: number): MockProvider {
  const lines = Array.from(
    { length: subTaskCount },
    (_, i) => `${i + 1}. Sub-task ${i + 1}`,
  ).join("\n");

  const responses: Message[] = [
    // Plan response
    { role: "assistant", content: `Here is the plan:\n${lines}` },
  ];

  // Each worker needs 2 responses: tool_call + final
  for (let i = 0; i < subTaskCount; i++) {
    responses.push({
      role: "assistant",
      content: `Working on sub-task ${i + 1}.`,
      tool_calls: [
        {
          id: `call_${i}`,
          type: "function",
          function: {
            name: "writeFile",
            arguments: JSON.stringify({
              path: `file_${i}.ts`,
              content: "content",
            }),
          },
        },
      ],
    });
    responses.push({
      role: "assistant",
      content: `Sub-task ${i + 1} done.`,
    });
  }

  return new MockProvider(responses);
}

/** Provider that throws on the second call (first is the plan, second is the worker). */
function _createFailingWorkerProvider(): MockProvider {
  const responses: Message[] = [
    { role: "assistant", content: "Plan:\n1. Only task" },
    // Worker response that will trigger the AgentLoop, but we'll use a provider that errors
  ];
  return new MockProvider(responses);
}

// ── Tests ──────────────────────────────────────────────────────────

describe("SupervisorAgent", () => {
  it("dispatches tasks to workers", async () => {
    const tools = createTools();
    const provider = createPlanProvider(2);
    const supervisor = new SupervisorAgent({
      provider,
      tools,
      maxWorkers: 2,
    });

    const result = await supervisor.dispatch("Build something");
    expect(result.tasks.length).toBe(2);
    expect(result.tasks[0]!.id).toBe("task_sub_001");
    expect(result.tasks[1]!.id).toBe("task_sub_002");
  });

  it("workers execute and return results (tasks reach done state)", async () => {
    const tools = createTools();
    const provider = createPlanProvider(2);
    const supervisor = new SupervisorAgent({
      provider,
      tools,
      maxWorkers: 2,
    });

    const result = await supervisor.dispatch("Build something");
    for (const task of result.tasks) {
      expect(task.state).toBe("done");
    }
  });

  it("supervisor aggregates results correctly in summary", async () => {
    const tools = createTools();
    const provider = createPlanProvider(3);
    const supervisor = new SupervisorAgent({
      provider,
      tools,
      maxWorkers: 3,
    });

    const result = await supervisor.dispatch("Build 3 things");
    expect(result.summary).toContain("3/3");
    expect(result.summary).toContain("0 failed");
  });

  it("worker failure is handled gracefully (doesn't crash supervisor)", async () => {
    const tools = createTools();
    // Provider with plan that creates 1 task, but worker provider will exhaust
    const responses: Message[] = [
      { role: "assistant", content: "Plan:\n1. Failing task" },
      // No worker responses → MockProvider will throw on worker execution
    ];
    // We need the plan response, then the worker loop will call chat and get an error
    // MockProvider throws "exhausted" when out of responses. The WorkerAgent catches this.
    const provider = new MockProvider(responses);
    const supervisor = new SupervisorAgent({
      provider,
      tools,
      maxWorkers: 1,
    });

    const result = await supervisor.dispatch("Do something that fails");
    // The task should be marked as failed, not crash the supervisor
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0]!.state).toBe("failed");
    expect(result.summary).toContain("1 failed");
  });

  it("empty goal with no numbered lines produces single task", async () => {
    const tools = createTools();
    // Return content with no numbered lines
    const responses: Message[] = [
      { role: "assistant", content: "Just do everything at once." },
      // Worker responses for the single task
      {
        role: "assistant",
        content: "Done.",
        tool_calls: [
          {
            id: "call_0",
            type: "function",
            function: {
              name: "writeFile",
              arguments: JSON.stringify({ path: "f.ts", content: "c" }),
            },
          },
        ],
      },
      { role: "assistant", content: "All done." },
    ];
    const provider = new MockProvider(responses);
    const supervisor = new SupervisorAgent({
      provider,
      tools,
      maxWorkers: 1,
    });

    const result = await supervisor.dispatch("");
    // No numbered lines → single task from full content
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0]!.state).toBe("done");
  });

  it("SupervisorResult contains trace events", async () => {
    const tools = createTools();
    const provider = createPlanProvider(1);
    const supervisor = new SupervisorAgent({
      provider,
      tools,
      maxWorkers: 1,
    });

    const result = await supervisor.dispatch("Build it");
    expect(result.traceEvents.length).toBeGreaterThan(0);
    // Should have message events from supervisor
    const messages = result.traceEvents.filter((e) => e.type === "message");
    expect(messages.length).toBeGreaterThanOrEqual(2);
    // Should have state_change events from workers
    const stateChanges = result.traceEvents.filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("WorkerAgent", () => {
  it("transitions task through pending → running → done", async () => {
    const tools = createTools();
    const responses: Message[] = [
      {
        role: "assistant",
        content: "Working.",
        tool_calls: [
          {
            id: "call_0",
            type: "function",
            function: {
              name: "writeFile",
              arguments: JSON.stringify({ path: "f.ts", content: "c" }),
            },
          },
        ],
      },
      { role: "assistant", content: "Done." },
    ];
    const provider = new MockProvider(responses);
    const worker = new WorkerAgent({ provider, tools });

    const task = {
      id: "t1",
      name: "test",
      goal: "do something",
      state: "pending" as const,
      traceEvents: [],
    };

    const result = await worker.execute(task);
    expect(task.state).toBe("done");
    expect(result.traceEvents.length).toBeGreaterThan(0);
    // Should have pending→running and running→done state changes
    const stateChanges = result.traceEvents.filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges.length).toBeGreaterThanOrEqual(2);
  });

  it("handles non-Error throw and records string message", async () => {
    const tools = createTools();
    // Provider that throws a string (not an Error instance)
    const throwProvider: import("@openagention/core").ChatProvider = {
      async chat() {
        throw "raw string error";
      },
    };
    const worker = new WorkerAgent({ provider: throwProvider, tools });

    const task = {
      id: "t3",
      name: "non-error-throw",
      goal: "this throws a string",
      state: "pending" as const,
      traceEvents: [],
    };

    const result = await worker.execute(task);
    expect(task.state).toBe("failed");

    const errorEvent = result.traceEvents.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as { message: string }).message).toBe(
      "raw string error",
    );
  });

  it("transitions task to failed on error", async () => {
    const tools = createTools();
    // Empty responses → MockProvider throws
    const provider = new MockProvider([]);
    const worker = new WorkerAgent({ provider, tools });

    const task = {
      id: "t2",
      name: "fail",
      goal: "this will fail",
      state: "pending" as const,
      traceEvents: [],
    };

    const result = await worker.execute(task);
    expect(task.state).toBe("failed");
    // Should have error trace event
    const errors = result.traceEvents.filter((e) => e.type === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
