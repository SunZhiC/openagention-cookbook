/**
 * Handoff & Continuation Protocol — Context transfer between agents.
 *
 * Manages checkpoints (serialized snapshots of agent state) and
 * handoffs (transferring context from one thread/agent to another).
 * Enables multi-agent workflows where Agent A produces work and
 * Agent B picks up from a checkpoint to continue.
 */

import type { Run, Thread, Checkpoint, TraceEvent } from "@openagention/core";

// ── Event ID generator ──────────────────────────────────────────────

let _nextEventId = 9600;
function eventId(): string {
  return `evt_${String(_nextEventId++).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

// ── Checkpoint ID generator ─────────────────────────────────────────

let _nextCheckpointId = 1;
function checkpointId(): string {
  return `ckpt_${String(_nextCheckpointId++).padStart(3, "0")}`;
}

// ── Result type ─────────────────────────────────────────────────────

/** Result of a handoff between two threads. */
export interface HandoffResult {
  checkpoint: Checkpoint;
  traceEvents: TraceEvent[];
}

/**
 * Manages checkpoints and handoffs for multi-agent continuation.
 *
 * Checkpoints serialize a Run's state so it can be transferred
 * to another agent/thread. Handoffs transfer context and create
 * a trail of trace events documenting the transfer.
 */
export class HandoffManager {
  private checkpoints = new Map<string, Checkpoint>();

  /**
   * Create a checkpoint that captures the current state of a Run.
   * The snapshot serializes tasks, lane, and checkpoint history.
   */
  createCheckpoint(run: Run): Checkpoint {
    const snapshot = JSON.stringify({
      runId: run.id,
      threadId: run.threadId,
      lane: run.lane,
      tasks: run.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        state: t.state,
      })),
      checkpointCount: run.checkpoints.length,
    });

    const cp: Checkpoint = {
      id: checkpointId(),
      runId: run.id,
      timestamp: now(),
      snapshot,
      resumable: true,
    };

    // Store the checkpoint
    this.checkpoints.set(cp.id, cp);

    // Also add to the run's checkpoint list
    run.checkpoints.push(cp);

    return cp;
  }

  /**
   * Restore a Run from a checkpoint.
   * Deserializes the snapshot and reconstructs a resumable Run.
   */
  restore(checkpoint: Checkpoint): Run {
    if (!checkpoint.resumable) {
      throw new Error(
        `HandoffManager: checkpoint "${checkpoint.id}" is not resumable`,
      );
    }

    const data = JSON.parse(checkpoint.snapshot) as {
      runId: string;
      threadId: string;
      lane: string;
      tasks: Array<{ id: string; name: string; state: string }>;
      checkpointCount: number;
    };

    const run: Run = {
      id: data.runId,
      threadId: data.threadId,
      lane: data.lane as Run["lane"],
      tasks: data.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        goal: t.name,
        state: t.state as Run["tasks"][number]["state"],
        traceEvents: [],
      })),
      checkpoints: [checkpoint],
    };

    return run;
  }

  /**
   * Transfer context from one thread/agent to another.
   *
   * Creates a checkpoint of the source thread's latest run,
   * then sets up the target thread with the context string
   * describing what the new agent should do.
   *
   * Returns the checkpoint and trace events documenting the handoff.
   */
  handoff(
    fromThread: Thread,
    toThread: Thread,
    context: string,
  ): HandoffResult {
    const traceEvents: TraceEvent[] = [];

    // Get the latest run from the source thread
    const sourceRun = fromThread.runs[fromThread.runs.length - 1];
    if (!sourceRun) {
      throw new Error(
        `HandoffManager: source thread "${fromThread.id}" has no runs`,
      );
    }

    // Create a checkpoint from the source run
    const cp = this.createCheckpoint(sourceRun);

    // Record checkpoint creation
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "checkpoint",
      data: {
        runId: sourceRun.id,
        snapshot: cp.snapshot,
        resumable: true,
      },
    });

    // Record the handoff state change on the source
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "thread",
        entityId: fromThread.id,
        from: "active",
        to: "handed-off",
      },
    });

    // Record context transfer message
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "system",
        content: `Handoff from thread "${fromThread.id}" to "${toThread.id}": ${context}`,
      },
    });

    // Record the target thread picking up
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "thread",
        entityId: toThread.id,
        from: "idle",
        to: "active",
      },
    });

    return { checkpoint: cp, traceEvents };
  }

  /**
   * Get a stored checkpoint by ID.
   */
  getCheckpoint(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }
}
