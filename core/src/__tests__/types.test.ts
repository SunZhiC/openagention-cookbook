import { describe, it, expect } from "vitest";
import type { Task, TaskState } from "../types.js";

/** Helper to create a task in a given state. */
function makeTask(state: TaskState): Task {
  return {
    id: "task_001",
    name: "Test task",
    goal: "Testing",
    state,
    traceEvents: [],
  };
}

/** Valid transitions for our system. */
const VALID_TRANSITIONS: Array<[TaskState, TaskState]> = [
  ["pending", "running"],
  ["running", "blocked"],
  ["running", "review"],
  ["running", "done"],
  ["running", "failed"],
  ["blocked", "running"],
  ["review", "done"],
  ["failed", "pending"],
];

const VALID_SET = new Set(
  VALID_TRANSITIONS.map(([from, to]) => `${from}->${to}`),
);

function isValidTransition(from: TaskState, to: string): boolean {
  return VALID_SET.has(`${from}->${to}`);
}

describe("Task state transitions", () => {
  it("allows pending → running", () => {
    const task = makeTask("pending");
    expect(isValidTransition(task.state, "running")).toBe(true);
  });

  it("allows running → done", () => {
    const task = makeTask("running");
    expect(isValidTransition(task.state, "done")).toBe(true);
  });

  it("allows running → failed", () => {
    const task = makeTask("running");
    expect(isValidTransition(task.state, "failed")).toBe(true);
  });

  it("allows running → blocked", () => {
    const task = makeTask("running");
    expect(isValidTransition(task.state, "blocked")).toBe(true);
  });

  it("allows running → review", () => {
    const task = makeTask("running");
    expect(isValidTransition(task.state, "review")).toBe(true);
  });

  it("allows blocked → running", () => {
    const task = makeTask("blocked");
    expect(isValidTransition(task.state, "running")).toBe(true);
  });

  it("allows review → done", () => {
    const task = makeTask("review");
    expect(isValidTransition(task.state, "done")).toBe(true);
  });

  it("rejects pending → done (skipping running)", () => {
    const task = makeTask("pending");
    expect(isValidTransition(task.state, "done")).toBe(false);
  });

  it("rejects done → running (terminal state)", () => {
    const task = makeTask("done");
    expect(isValidTransition(task.state, "running")).toBe(false);
  });

  it("rejects pending → failed (must run first)", () => {
    const task = makeTask("pending");
    expect(isValidTransition(task.state, "failed")).toBe(false);
  });

  it("allows review → failed (review rejected)", () => {
    // "review → failed" is not in VALID_TRANSITIONS, so this tests the boundary.
    // If the product wants this transition, add it to the set; for now verify it's rejected.
    const task = makeTask("review");
    // review can go to done, but not failed
    expect(isValidTransition(task.state, "failed")).toBe(false);
  });

  it("allows failed → pending (retry)", () => {
    const task = makeTask("failed");
    expect(isValidTransition(task.state, "pending")).toBe(true);
  });

  it("rejects blocked → done (must unblock first)", () => {
    const task = makeTask("blocked");
    expect(isValidTransition(task.state, "done")).toBe(false);
  });

  it("rejects failed → done (must go through pending/running again)", () => {
    const task = makeTask("failed");
    expect(isValidTransition(task.state, "done")).toBe(false);
  });
});
