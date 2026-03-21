import { afterEach, describe, it, expect, vi } from "vitest";
import type { Task, Message } from "@openagention/core";
import { ExecutionLaneRunner } from "../execution-lane.js";
import { AgentLoop } from "../agent-loop.js";
import { MockProvider } from "../mock-provider.js";
import { ToolRegistry } from "../tool-registry.js";
import { WorktreeManager } from "../worktree-manager.js";

function makeLoop(responses: Message[]): AgentLoop {
  const tools = new ToolRegistry();
  tools.register(
    { name: "readFile", description: "Read a file", parameters: {} },
    async () => "file contents",
  );
  const provider = new MockProvider(responses);
  return new AgentLoop({
    maxTurns: 5,
    timeout: 10_000,
    tools,
    provider,
  });
}

function makeTask(id: string): Task {
  return {
    id,
    name: `Test task ${id}`,
    goal: "Do something",
    state: "pending",
    traceEvents: [],
  };
}

describe("ExecutionLaneRunner", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("local mode runs AgentLoop and returns result with lane metadata", async () => {
    const loop = makeLoop([{ role: "assistant", content: "Done locally" }]);
    const runner = new ExecutionLaneRunner();
    const task = makeTask("task_local");

    const result = await runner.run(task, "local", loop);
    expect(result.lane).toBe("local");
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.laneEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("local mode records state_change events (idle -> running:local -> done)", async () => {
    const loop = makeLoop([{ role: "assistant", content: "Done" }]);
    const runner = new ExecutionLaneRunner();
    const result = await runner.run(makeTask("task_l"), "local", loop);

    const stateChanges = result.laneEvents.filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges).toHaveLength(2);

    const data0 = stateChanges[0]!.data as { from: string; to: string };
    expect(data0.from).toBe("idle");
    expect(data0.to).toBe("running:local");

    const data1 = stateChanges[1]!.data as { from: string; to: string };
    expect(data1.from).toBe("running:local");
    expect(data1.to).toBe("done");
  });

  it("worktree mode creates worktree and records worktree + lane state_change events", async () => {
    const loop = makeLoop([{ role: "assistant", content: "Done in worktree" }]);
    const wtManager = new WorktreeManager("/tmp/test-lanes");
    const runner = new ExecutionLaneRunner(wtManager);
    const task = makeTask("task_wt");

    const result = await runner.run(task, "worktree", loop);
    expect(result.lane).toBe("worktree");
    // Should have 4 state_change events: worktree active, lane running, worktree merged, lane done
    const stateChanges = result.laneEvents.filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges).toHaveLength(4);

    const entities = stateChanges.map(
      (e) => (e.data as { entity: string }).entity,
    );
    expect(entities).toContain("worktree");
    expect(entities).toContain("lane");
  });

  it("cloud mode records provisioning, running, teardown, and done transitions", async () => {
    const loop = makeLoop([{ role: "assistant", content: "Done in cloud" }]);
    const runner = new ExecutionLaneRunner();
    const task = makeTask("task_cloud");

    const result = await runner.run(task, "cloud", loop);
    expect(result.lane).toBe("cloud");

    const stateChanges = result.laneEvents.filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges).toHaveLength(4);

    const transitions = stateChanges.map((e) => (e.data as { to: string }).to);
    expect(transitions).toContain("provisioning:cloud");
    expect(transitions).toContain("running:cloud");
    expect(transitions).toContain("teardown:cloud");
    expect(transitions).toContain("done");
  });

  it("propagates errors from the agent loop", async () => {
    const badProvider: import("@openagention/core").ChatProvider = {
      async chat() {
        throw new Error("Provider failure");
      },
    };
    const tools = new ToolRegistry();
    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools,
      provider: badProvider,
    });
    const runner = new ExecutionLaneRunner();

    await expect(
      runner.run(makeTask("task_err"), "local", loop),
    ).rejects.toThrow("Provider failure");
  });

  it("worktree mode abandons the worktree when the agent loop fails", async () => {
    const badProvider: import("@openagention/core").ChatProvider = {
      async chat() {
        throw new Error("Provider failure");
      },
    };
    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: new ToolRegistry(),
      provider: badProvider,
    });
    const task = makeTask("task_wt_err");
    const wtManager = new WorktreeManager("/tmp/test-lanes");
    const runner = new ExecutionLaneRunner(wtManager);

    await expect(runner.run(task, "worktree", loop)).rejects.toThrow(
      "Provider failure",
    );

    const worktree = wtManager.findByTask(task.id);
    expect(worktree?.status).toBe("abandoned");
  });

  it("cloud mode records a failed transition when the agent loop throws", async () => {
    vi.useFakeTimers();

    const badProvider: import("@openagention/core").ChatProvider = {
      async chat() {
        throw new Error("Cloud provider failure");
      },
    };
    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 5000,
      tools: new ToolRegistry(),
      provider: badProvider,
    });
    const runner = new ExecutionLaneRunner();

    const runPromise = runner.run(makeTask("task_cloud_err"), "cloud", loop);
    const rejection = expect(runPromise).rejects.toThrow(
      "Cloud provider failure",
    );
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
  });

  it("throws for an unknown execution mode at runtime", async () => {
    const loop = makeLoop([{ role: "assistant", content: "Done locally" }]);
    const runner = new ExecutionLaneRunner();

    await expect(
      runner.run(makeTask("task_unknown"), "remote" as never, loop),
    ).rejects.toThrow('ExecutionLaneRunner: unknown mode "remote"');
  });
});
