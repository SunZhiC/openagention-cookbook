/**
 * DAG Scheduler — Dependency-aware task scheduling.
 *
 * Manages a directed acyclic graph (DAG) of tasks where each task
 * may depend on the completion of others. Determines which tasks
 * can run in parallel, detects structural cycles, and spots runtime
 * stalls where no progress is possible.
 */

import type { Task, TraceEvent, TaskState } from "@openagention/core";

// ── Event ID generator ──────────────────────────────────────────────

let _nextEventId = 9200;
function eventId(): string {
  return `evt_${String(_nextEventId++).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Schedules tasks respecting dependency ordering.
 *
 * Tasks are dispatched when all their dependencies have reached "done".
 * Records trace events for every state transition.
 */
export class Scheduler {
  private tasks: Map<string, Task>;
  private dependencies: Map<string, string[]>;
  private traceEvents: TraceEvent[] = [];

  /**
   * @param tasks - Array of tasks to schedule
   * @param dependencies - Map of taskId → array of taskIds it depends on
   */
  constructor(tasks: Task[], dependencies: Map<string, string[]>) {
    this.tasks = new Map(tasks.map((t) => [t.id, t]));
    this.dependencies = new Map(dependencies);

    // Ensure every task has a dependency entry (even if empty)
    for (const task of tasks) {
      if (!this.dependencies.has(task.id)) {
        this.dependencies.set(task.id, []);
      }
    }
  }

  /**
   * Returns tasks whose dependencies are all "done" and that are
   * still in "pending" state (ready to be dispatched).
   */
  getReady(): Task[] {
    const ready: Task[] = [];

    for (const [taskId, task] of this.tasks) {
      if (task.state !== "pending") continue;

      const deps = this.dependencies.get(taskId) ?? [];
      const allDone = deps.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep?.state === "done";
      });

      if (allDone) {
        ready.push(task);
      }
    }

    return ready;
  }

  /**
   * Mark a task as done. This may unlock dependent tasks.
   */
  markDone(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Scheduler: task "${taskId}" not found`);
    }

    const from = task.state;
    task.state = "done";

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "task",
        entityId: taskId,
        from,
        to: "done",
      },
    });
  }

  /**
   * Mark a task as failed.
   */
  markFailed(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Scheduler: task "${taskId}" not found`);
    }

    const from = task.state;
    task.state = "failed";

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "task",
        entityId: taskId,
        from,
        to: "failed",
      },
    });
  }

  /**
   * Mark a task as running.
   */
  markRunning(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Scheduler: task "${taskId}" not found`);
    }

    const from = task.state;
    task.state = "running";

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "task",
        entityId: taskId,
        from,
        to: "running",
      },
    });
  }

  /**
   * Returns true when all tasks are in a terminal state (done or failed).
   */
  isComplete(): boolean {
    for (const task of this.tasks.values()) {
      if (task.state !== "done" && task.state !== "failed") {
        return false;
      }
    }
    return true;
  }

  /**
   * Detects a structural cycle in the dependency graph.
   *
   * Returns the cycle path when found, otherwise null.
   */
  detectCycle(): string[] | null {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];
    const indexById = new Map<string, number>();

    const visit = (taskId: string): string[] | null => {
      if (visited.has(taskId)) {
        return null;
      }

      const stackIndex = indexById.get(taskId);
      if (stackIndex !== undefined) {
        return [...stack.slice(stackIndex), taskId];
      }

      visiting.add(taskId);
      indexById.set(taskId, stack.length);
      stack.push(taskId);

      const deps = this.dependencies.get(taskId) ?? [];
      for (const depId of deps) {
        if (!this.tasks.has(depId)) {
          continue;
        }

        if (visiting.has(depId)) {
          const depIndex = indexById.get(depId);
          if (depIndex !== undefined) {
            return [...stack.slice(depIndex), depId];
          }
        }

        const cycle = visit(depId);
        if (cycle) {
          return cycle;
        }
      }

      visiting.delete(taskId);
      visited.add(taskId);
      indexById.delete(taskId);
      stack.pop();
      return null;
    };

    for (const taskId of this.tasks.keys()) {
      const cycle = visit(taskId);
      if (cycle) {
        return cycle;
      }
    }

    return null;
  }

  /**
   * Detects runtime stall: tasks remain that are not done/failed,
   * but none can run because there is no ready work and no running work.
   */
  isStalled(): boolean {
    if (this.isComplete()) return false;

    const ready = this.getReady();
    const running = [...this.tasks.values()].filter(
      (t) => t.state === "running",
    );

    return ready.length === 0 && running.length === 0;
  }

  /**
   * @deprecated Use isStalled() to detect runtime no-progress conditions.
   */
  hasDeadlock(): boolean {
    return this.isStalled();
  }

  /**
   * Compute the full execution order as batches.
   * Each batch contains tasks that can run in parallel.
   * Returns an array of arrays of task IDs.
   *
   * Uses a simulation: walks through the DAG marking tasks done
   * in topological order without mutating real state.
   */
  getExecutionOrder(): string[][] {
    // Work on a copy of task states
    const states = new Map<string, TaskState>();
    for (const [id, task] of this.tasks) {
      states.set(id, task.state);
    }

    // Reset all to pending for simulation
    for (const id of states.keys()) {
      states.set(id, "pending");
    }

    const batches: string[][] = [];

    while (true) {
      // Find tasks whose deps are all "done" in simulation
      const batch: string[] = [];
      for (const [taskId] of this.tasks) {
        if (states.get(taskId) !== "pending") continue;

        const deps = this.dependencies.get(taskId) ?? [];
        const allDone = deps.every((depId) => states.get(depId) === "done");
        if (allDone) {
          batch.push(taskId);
        }
      }

      if (batch.length === 0) break;

      batches.push(batch);
      for (const id of batch) {
        states.set(id, "done");
      }
    }

    return batches;
  }

  /** Retrieve all trace events recorded by this scheduler. */
  getTraceEvents(): TraceEvent[] {
    return [...this.traceEvents];
  }

  /** Get a task by ID. */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }
}
