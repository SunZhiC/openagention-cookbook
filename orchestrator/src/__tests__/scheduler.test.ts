import { describe, it, expect } from "vitest";
import type { Task } from "@openagention/core";
import { Scheduler } from "../scheduler.js";

// ── Helpers ────────────────────────────────────────────────────────

function makeTask(
  id: string,
  state: "pending" | "done" | "failed" | "running" = "pending",
): Task {
  return { id, name: id, goal: `Do ${id}`, state, traceEvents: [] };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Scheduler", () => {
  it("getReady returns tasks with no dependencies", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    const ready = scheduler.getReady();
    expect(ready.length).toBe(1);
    expect(ready[0]!.id).toBe("a");
  });

  it("markDone unlocks dependent tasks", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    // Initially only "a" is ready
    expect(scheduler.getReady().map((t) => t.id)).toEqual(["a"]);

    scheduler.markDone("a");

    // Now "b" should be ready
    const ready = scheduler.getReady();
    expect(ready.map((t) => t.id)).toEqual(["b"]);
  });

  it("parallel tasks returned together in getReady", () => {
    const tasks = [makeTask("root"), makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["root", []],
      ["a", ["root"]],
      ["b", ["root"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    scheduler.markDone("root");

    const ready = scheduler.getReady();
    const readyIds = ready.map((t) => t.id).sort();
    expect(readyIds).toEqual(["a", "b"]);
  });

  it("markFailed marks task as failed", () => {
    const tasks = [makeTask("a")];
    const deps = new Map<string, string[]>();
    const scheduler = new Scheduler(tasks, deps);

    scheduler.markFailed("a");
    expect(scheduler.getTask("a")!.state).toBe("failed");
  });

  it("isComplete returns true when all tasks are done or failed", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>();
    const scheduler = new Scheduler(tasks, deps);

    expect(scheduler.isComplete()).toBe(false);

    scheduler.markDone("a");
    expect(scheduler.isComplete()).toBe(false);

    scheduler.markFailed("b");
    expect(scheduler.isComplete()).toBe(true);
  });

  it("detectCycle returns a structural cycle", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    expect(scheduler.detectCycle()).toEqual(["a", "b", "a"]);
  });

  it("isStalled returns true when nothing can make progress", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    expect(scheduler.isStalled()).toBe(true);
  });

  it("isStalled returns false when tasks are progressing", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    expect(scheduler.isStalled()).toBe(false);
  });

  it("hasDeadlock remains an alias for isStalled", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    expect(scheduler.hasDeadlock()).toBe(scheduler.isStalled());
  });

  it("getExecutionOrder returns correct batches", () => {
    // DAG: setup → [db, auth] → api → tests
    const tasks = [
      makeTask("setup"),
      makeTask("db"),
      makeTask("auth"),
      makeTask("api"),
      makeTask("tests"),
    ];
    const deps = new Map<string, string[]>([
      ["setup", []],
      ["db", ["setup"]],
      ["auth", ["setup"]],
      ["api", ["db", "auth"]],
      ["tests", ["api"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    const batches = scheduler.getExecutionOrder();
    expect(batches.length).toBe(4);
    expect(batches[0]).toEqual(["setup"]);
    expect(batches[1]!.sort()).toEqual(["auth", "db"]);
    expect(batches[2]).toEqual(["api"]);
    expect(batches[3]).toEqual(["tests"]);
  });

  it("markDone records trace events", () => {
    const tasks = [makeTask("a")];
    const deps = new Map<string, string[]>();
    const scheduler = new Scheduler(tasks, deps);

    scheduler.markDone("a");

    const events = scheduler.getTraceEvents();
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe("state_change");
    const data = events[0]!.data as { entityId: string; to: string };
    expect(data.entityId).toBe("a");
    expect(data.to).toBe("done");
  });

  it("markDone throws for unknown task", () => {
    const scheduler = new Scheduler([], new Map());
    expect(() => scheduler.markDone("nonexistent")).toThrow("not found");
  });

  it("markFailed throws for unknown task", () => {
    const scheduler = new Scheduler([], new Map());
    expect(() => scheduler.markFailed("nonexistent")).toThrow("not found");
  });

  it("markRunning transitions task to running and records trace", () => {
    const tasks = [makeTask("a")];
    const deps = new Map<string, string[]>();
    const scheduler = new Scheduler(tasks, deps);

    scheduler.markRunning("a");
    expect(scheduler.getTask("a")!.state).toBe("running");

    const events = scheduler.getTraceEvents();
    const runningEvent = events.find(
      (e) =>
        e.type === "state_change" &&
        (e.data as { to: string }).to === "running",
    );
    expect(runningEvent).toBeDefined();
  });

  it("markRunning throws for unknown task", () => {
    const scheduler = new Scheduler([], new Map());
    expect(() => scheduler.markRunning("nonexistent")).toThrow("not found");
  });

  it("isStalled returns false when a task is currently running", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    scheduler.markRunning("a");
    // "a" is running, "b" is pending but blocked — not stalled because work is in progress
    expect(scheduler.isStalled()).toBe(false);
  });

  it("dependencies on non-existent tasks are skipped in cycle detection", () => {
    const tasks = [makeTask("a")];
    const deps = new Map<string, string[]>([["a", ["ghost"]]]);
    const scheduler = new Scheduler(tasks, deps);

    // Should not throw or report a cycle
    expect(scheduler.detectCycle()).toBeNull();
  });

  it("detectCycle returns null for acyclic graph", () => {
    const tasks = [makeTask("a"), makeTask("b"), makeTask("c")];
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
      ["c", ["b"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    expect(scheduler.detectCycle()).toBeNull();
  });

  it("detectCycle handles diamond DAG (shared dependency visited twice)", () => {
    // Diamond: a → [b, c] → d
    // When processing "d", "a" has already been fully visited — exercises the visited.has() check
    const tasks = [makeTask("a"), makeTask("b"), makeTask("c"), makeTask("d")];
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
      ["c", ["a"]],
      ["d", ["b", "c"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    expect(scheduler.detectCycle()).toBeNull();
  });

  it("getExecutionOrder returns empty array when all tasks are in a cycle", () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const deps = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    const scheduler = new Scheduler(tasks, deps);

    // All tasks depend on each other, none can be scheduled
    expect(scheduler.getExecutionOrder()).toEqual([]);
  });
});
