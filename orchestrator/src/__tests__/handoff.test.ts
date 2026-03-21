import { describe, it, expect } from "vitest";
import type { Run, Thread, Checkpoint } from "@openagention/core";
import { HandoffManager } from "../handoff.js";

// ── Helpers ────────────────────────────────────────────────────────

function makeRun(): Run {
  return {
    id: "run_1",
    threadId: "thread_a",
    lane: "local",
    tasks: [
      {
        id: "t1",
        name: "Write code",
        goal: "Write code",
        state: "done",
        traceEvents: [],
      },
    ],
    checkpoints: [],
  };
}

function makeThread(id: string, runs: Run[]): Thread {
  return { id, title: `Thread ${id}`, runs };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("HandoffManager", () => {
  it("createCheckpoint produces valid Checkpoint", () => {
    const manager = new HandoffManager();
    const run = makeRun();
    const cp = manager.createCheckpoint(run);

    expect(cp.id).toMatch(/^ckpt_/);
    expect(cp.runId).toBe("run_1");
    expect(cp.resumable).toBe(true);
    expect(typeof cp.timestamp).toBe("string");
    expect(typeof cp.snapshot).toBe("string");

    // Snapshot should be valid JSON
    const data = JSON.parse(cp.snapshot);
    expect(data.runId).toBe("run_1");
    expect(data.threadId).toBe("thread_a");
    expect(data.lane).toBe("local");
    expect(data.tasks.length).toBe(1);
  });

  it("createCheckpoint adds checkpoint to the run", () => {
    const manager = new HandoffManager();
    const run = makeRun();
    expect(run.checkpoints.length).toBe(0);

    manager.createCheckpoint(run);
    expect(run.checkpoints.length).toBe(1);
  });

  it("restore returns Run from checkpoint", () => {
    const manager = new HandoffManager();
    const run = makeRun();
    const cp = manager.createCheckpoint(run);

    const restored = manager.restore(cp);
    expect(restored.id).toBe("run_1");
    expect(restored.threadId).toBe("thread_a");
    expect(restored.lane).toBe("local");
    expect(restored.tasks.length).toBe(1);
    expect(restored.tasks[0]!.state).toBe("done");
    expect(restored.checkpoints.length).toBe(1);
  });

  it("restore throws for non-resumable checkpoint", () => {
    const manager = new HandoffManager();
    const cp: Checkpoint = {
      id: "ckpt_999",
      runId: "run_1",
      timestamp: new Date().toISOString(),
      snapshot: "{}",
      resumable: false,
    };

    expect(() => manager.restore(cp)).toThrow("not resumable");
  });

  it("handoff transfers context between threads", () => {
    const manager = new HandoffManager();
    const run = makeRun();
    const fromThread = makeThread("thread_a", [run]);
    const toThread = makeThread("thread_b", []);

    const result = manager.handoff(fromThread, toThread, "Continue the work");

    expect(result.checkpoint).toBeDefined();
    expect(result.checkpoint.runId).toBe("run_1");
    expect(result.checkpoint.resumable).toBe(true);
  });

  it("handoff throws if source thread has no runs", () => {
    const manager = new HandoffManager();
    const fromThread = makeThread("thread_a", []);
    const toThread = makeThread("thread_b", []);

    expect(() => manager.handoff(fromThread, toThread, "Continue")).toThrow(
      "has no runs",
    );
  });

  it("HandoffResult contains trace events", () => {
    const manager = new HandoffManager();
    const run = makeRun();
    const fromThread = makeThread("thread_a", [run]);
    const toThread = makeThread("thread_b", []);

    const result = manager.handoff(fromThread, toThread, "Continue the work");

    expect(result.traceEvents.length).toBeGreaterThanOrEqual(4);

    // Should have checkpoint event
    const checkpointEvents = result.traceEvents.filter(
      (e) => e.type === "checkpoint",
    );
    expect(checkpointEvents.length).toBe(1);

    // Should have state_change events for both threads
    const stateChanges = result.traceEvents.filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges.length).toBeGreaterThanOrEqual(2);

    // Should have a message event for context transfer
    const messages = result.traceEvents.filter((e) => e.type === "message");
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it("getCheckpoint retrieves stored checkpoint", () => {
    const manager = new HandoffManager();
    const run = makeRun();
    const cp = manager.createCheckpoint(run);

    const retrieved = manager.getCheckpoint(cp.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(cp.id);

    expect(manager.getCheckpoint("nonexistent")).toBeUndefined();
  });
});
