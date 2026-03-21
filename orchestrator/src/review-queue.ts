/**
 * ReviewQueue — State machine for code review items.
 *
 * Manages review items through a lifecycle:
 *   pending → approved
 *   pending → rejected
 *   pending → revised → pending
 *
 * Invalid transitions throw errors. All transitions are recorded
 * as trace events.
 */

import type { ReviewItem, TraceEvent } from "@openagention/core";

// ── Event ID generator ──────────────────────────────────────────────

let _nextEventId = 9400;
function eventId(): string {
  return `evt_${String(_nextEventId++).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * A queue of review items with state-machine transitions.
 * Each state change is recorded as a trace event.
 */
export class ReviewQueue {
  private items = new Map<string, ReviewItem>();
  private traceEvents: TraceEvent[] = [];

  /**
   * Add a new review item to the queue.
   * The item must be in "pending" state.
   */
  enqueue(item: ReviewItem): void {
    if (this.items.has(item.id)) {
      throw new Error(`ReviewQueue: item "${item.id}" already exists`);
    }

    if (item.state !== "pending") {
      throw new Error(
        `ReviewQueue: enqueued items must be in "pending" state, got "${item.state}"`,
      );
    }

    this.items.set(item.id, { ...item });

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "review",
        entityId: item.id,
        from: "none",
        to: "pending",
      },
    });
  }

  /**
   * Approve a pending review item.
   * Transition: pending → approved
   */
  approve(itemId: string, reviewer: string): void {
    const item = this.getOrThrow(itemId);

    if (item.state !== "pending") {
      throw new Error(
        `ReviewQueue: cannot approve item "${itemId}" in state "${item.state}" (must be "pending")`,
      );
    }

    const from = item.state;
    item.state = "approved";
    item.reviewer = reviewer;

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "review",
        entityId: itemId,
        from,
        to: "approved",
      },
    });
  }

  /**
   * Reject a pending review item.
   * Transition: pending → rejected
   */
  reject(itemId: string, reviewer: string, reason: string): void {
    const item = this.getOrThrow(itemId);

    if (item.state !== "pending") {
      throw new Error(
        `ReviewQueue: cannot reject item "${itemId}" in state "${item.state}" (must be "pending")`,
      );
    }

    const from = item.state;
    item.state = "rejected";
    item.reviewer = reviewer;
    item.feedback = reason;

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "review",
        entityId: itemId,
        from,
        to: "rejected",
      },
    });

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "assistant",
        content: `Review item "${itemId}" rejected by ${reviewer}: ${reason}`,
      },
    });
  }

  /**
   * Request revision for a pending review item.
   * Transition: pending → revised
   */
  revise(itemId: string, feedback: string): void {
    const item = this.getOrThrow(itemId);
    const normalizedFeedback = feedback.trim();

    if (item.state !== "pending") {
      throw new Error(
        `ReviewQueue: cannot revise item "${itemId}" in state "${item.state}" (must be "pending")`,
      );
    }
    if (normalizedFeedback.length === 0) {
      throw new Error(
        `ReviewQueue: cannot revise item "${itemId}" without feedback`,
      );
    }

    const from = item.state;
    item.state = "revised";
    item.feedback = normalizedFeedback;

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "review",
        entityId: itemId,
        from,
        to: "revised",
      },
    });

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "assistant",
        content: `Review item "${itemId}" revised with feedback: ${normalizedFeedback}`,
      },
    });
  }

  /**
   * Resubmit a revised review item.
   * Transition: revised → pending
   */
  resubmit(itemId: string): void {
    const item = this.getOrThrow(itemId);

    if (item.state !== "revised") {
      throw new Error(
        `ReviewQueue: cannot resubmit item "${itemId}" in state "${item.state}" (must be "revised")`,
      );
    }

    const from = item.state;
    item.state = "pending";

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "review",
        entityId: itemId,
        from,
        to: "pending",
      },
    });

    this.traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "assistant",
        content: `Review item "${itemId}" resubmitted for review`,
      },
    });
  }

  /**
   * List review items, optionally filtered by state.
   */
  list(filter?: ReviewItem["state"]): ReviewItem[] {
    const all = [...this.items.values()];
    if (filter === undefined) return all;
    return all.filter((item) => item.state === filter);
  }

  /**
   * Get a single review item by ID, or undefined if not found.
   */
  get(itemId: string): ReviewItem | undefined {
    const item = this.items.get(itemId);
    return item ? { ...item } : undefined;
  }

  /** Retrieve all trace events recorded by this queue. */
  getTraceEvents(): TraceEvent[] {
    return [...this.traceEvents];
  }

  // ── Internal ────────────────────────────────────────────────────

  private getOrThrow(itemId: string): ReviewItem {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`ReviewQueue: item "${itemId}" not found`);
    }
    return item;
  }
}
