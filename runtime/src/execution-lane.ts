/**
 * ExecutionLane — Run tasks in different isolation modes.
 *
 * Three modes:
 *   - local:    Runs directly in the current process context
 *   - worktree: Creates an isolated worktree, runs there, records lifecycle
 *   - cloud:    Simulates a higher-isolation lane in the same process model
 *
 * Each mode records state_change trace events for mode transitions.
 * Educational implementation — no real cloud, container, or security boundary.
 */

import type {
  Task,
  ExecutionLane,
  TraceEvent,
  Message,
} from "@openagention/core";
import type { AgentLoopResult } from "./agent-loop.js";
import { AgentLoop } from "./agent-loop.js";
import { WorktreeManager } from "./worktree-manager.js";

let _nextEventId = 5000;
function eventId(): string {
  return `evt_${String(_nextEventId++).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Result of an execution lane run, extending AgentLoopResult with lane metadata. */
export interface LaneRunResult extends AgentLoopResult {
  lane: ExecutionLane;
  laneEvents: TraceEvent[];
}

/**
 * Runs a task through one of three execution modes.
 * Each mode wraps the core AgentLoop with additional lifecycle events.
 */
export class ExecutionLaneRunner {
  private worktreeManager: WorktreeManager;

  constructor(worktreeManager?: WorktreeManager) {
    this.worktreeManager = worktreeManager ?? new WorktreeManager();
  }

  /**
   * Run a task in the specified execution lane.
   */
  async run(
    task: Task,
    mode: ExecutionLane,
    loop: AgentLoop,
  ): Promise<LaneRunResult> {
    switch (mode) {
      case "local":
        return this.runLocal(task, loop);
      case "worktree":
        return this.runWorktree(task, loop);
      case "cloud":
        return this.runCloud(task, loop);
      default:
        throw new Error(
          `ExecutionLaneRunner: unknown mode "${mode as string}"`,
        );
    }
  }

  // ── Local mode ──────────────────────────────────────────────────

  /**
   * Local mode: run directly with the agent loop.
   * Simplest mode — no isolation, direct execution.
   */
  private async runLocal(task: Task, loop: AgentLoop): Promise<LaneRunResult> {
    const laneEvents: TraceEvent[] = [];

    // Record lane start
    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "lane",
        entityId: task.id,
        from: "idle",
        to: "running:local",
      },
    });

    const userMessage: Message = { role: "user", content: task.goal };
    let result: AgentLoopResult;
    try {
      result = await loop.run([userMessage]);
    } catch (err) {
      laneEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "lane",
          entityId: task.id,
          from: "running:local",
          to: "failed",
        },
      });
      throw err;
    }

    // Record lane completion
    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "lane",
        entityId: task.id,
        from: "running:local",
        to: "done",
      },
    });

    return {
      ...result,
      lane: "local",
      laneEvents,
    };
  }

  // ── Worktree mode ───────────────────────────────────────────────

  /**
   * Worktree mode: create an isolated worktree, run there, record lifecycle.
   * In a real system the agent would operate in a separate git worktree.
   */
  private async runWorktree(
    task: Task,
    loop: AgentLoop,
  ): Promise<LaneRunResult> {
    const laneEvents: TraceEvent[] = [];
    const branch = `agent/${task.id}`;

    // Create worktree
    const wt = this.worktreeManager.create(branch, task.id);

    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "worktree",
        entityId: wt.id,
        from: "none",
        to: "active",
      },
    });

    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "lane",
        entityId: task.id,
        from: "idle",
        to: "running:worktree",
      },
    });

    // Run the agent loop
    const userMessage: Message = { role: "user", content: task.goal };
    let result: AgentLoopResult;
    try {
      result = await loop.run([userMessage]);
    } catch (err) {
      // Mark worktree as abandoned on failure
      this.worktreeManager.markAbandoned(wt.id);

      laneEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "worktree",
          entityId: wt.id,
          from: "active",
          to: "abandoned",
        },
      });

      laneEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "lane",
          entityId: task.id,
          from: "running:worktree",
          to: "failed",
        },
      });

      throw err;
    }

    // Mark worktree as merged (work complete)
    this.worktreeManager.markMerged(wt.id);

    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "worktree",
        entityId: wt.id,
        from: "active",
        to: "merged",
      },
    });

    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "lane",
        entityId: task.id,
        from: "running:worktree",
        to: "done",
      },
    });

    return {
      ...result,
      lane: "worktree",
      laneEvents,
    };
  }

  // ── Cloud mode ──────────────────────────────────────────────────

  /**
   * Cloud mode: simulates a higher-isolation lane in-process.
   * Adds synthetic provisioning / teardown delay around the same AgentLoop.
   * Educational — no actual cloud infrastructure, subprocess boundary, or security boundary.
   */
  private async runCloud(task: Task, loop: AgentLoop): Promise<LaneRunResult> {
    const laneEvents: TraceEvent[] = [];

    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "lane",
        entityId: task.id,
        from: "idle",
        to: "provisioning:cloud",
      },
    });

    // Simulate cloud provisioning delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "lane",
        entityId: task.id,
        from: "provisioning:cloud",
        to: "running:cloud",
      },
    });

    // Run the agent loop in the "cloud" context
    const userMessage: Message = { role: "user", content: task.goal };
    let result: AgentLoopResult;
    try {
      result = await loop.run([userMessage]);
    } catch (err) {
      laneEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "lane",
          entityId: task.id,
          from: "running:cloud",
          to: "failed",
        },
      });
      throw err;
    }

    // Simulate teardown
    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "lane",
        entityId: task.id,
        from: "running:cloud",
        to: "teardown:cloud",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    laneEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "lane",
        entityId: task.id,
        from: "teardown:cloud",
        to: "done",
      },
    });

    return {
      ...result,
      lane: "cloud",
      laneEvents,
    };
  }
}
