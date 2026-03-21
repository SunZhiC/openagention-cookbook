import { describe, it, expect } from "vitest";
import type { ReviewItem } from "@openagention/core";
import { ReviewQueue } from "../review-queue.js";

// ── Helpers ────────────────────────────────────────────────────────

function makePendingItem(id: string): ReviewItem {
  return {
    id,
    taskId: `task-${id}`,
    content: `Review ${id}`,
    state: "pending",
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("ReviewQueue", () => {
  it("enqueue adds item in pending state", () => {
    const queue = new ReviewQueue();
    const item = makePendingItem("r1");
    queue.enqueue(item);

    const retrieved = queue.get("r1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.state).toBe("pending");
  });

  it("approve transitions pending → approved", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));

    queue.approve("r1", "alice");

    const item = queue.get("r1")!;
    expect(item.state).toBe("approved");
    expect(item.reviewer).toBe("alice");
  });

  it("reject transitions pending → rejected", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));

    queue.reject("r1", "bob", "Needs changes");

    const item = queue.get("r1")!;
    expect(item.state).toBe("rejected");
    expect(item.reviewer).toBe("bob");
    expect(item.feedback).toBe("Needs changes");
  });

  it("revise transitions pending → revised and stores feedback", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));

    queue.revise("r1", "Needs stronger validation");

    const item = queue.get("r1")!;
    expect(item.state).toBe("revised");
    expect(item.feedback).toBe("Needs stronger validation");
  });

  it("cannot approve already approved item", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));
    queue.approve("r1", "alice");

    expect(() => queue.approve("r1", "charlie")).toThrow(
      /cannot approve.*"approved"/,
    );
  });

  it("cannot reject already rejected item", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));
    queue.reject("r1", "bob", "bad");

    expect(() => queue.reject("r1", "charlie", "still bad")).toThrow(
      /cannot reject.*"rejected"/,
    );
  });

  it("resubmit transitions revised → pending", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));
    queue.revise("r1", "Needs stronger validation");

    queue.resubmit("r1");

    const item = queue.get("r1")!;
    expect(item.state).toBe("pending");
    expect(item.feedback).toBe("Needs stronger validation");
  });

  it("cannot revise a rejected item (rejected is terminal)", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));
    queue.reject("r1", "bob", "bad");

    expect(() => queue.revise("r1", "Needs more work")).toThrow(
      /cannot revise.*"rejected"/,
    );
  });

  it("cannot resubmit a pending item", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));

    expect(() => queue.resubmit("r1")).toThrow(/cannot resubmit.*"pending"/);
  });

  it("requires non-empty feedback for revise", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));

    expect(() => queue.revise("r1", "   ")).toThrow(/without feedback/);
  });

  it("list with filter returns correct items", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));
    queue.enqueue(makePendingItem("r2"));
    queue.enqueue(makePendingItem("r3"));

    queue.approve("r1", "alice");
    queue.reject("r2", "bob", "bad");

    expect(queue.list("pending").length).toBe(1);
    expect(queue.list("approved").length).toBe(1);
    expect(queue.list("rejected").length).toBe(1);
    expect(queue.list().length).toBe(3);
  });

  it("get returns item by id", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));

    expect(queue.get("r1")).toBeDefined();
    expect(queue.get("r1")!.id).toBe("r1");
    expect(queue.get("nonexistent")).toBeUndefined();
  });

  it("enqueue rejects duplicate ids", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));

    expect(() => queue.enqueue(makePendingItem("r1"))).toThrow(
      "already exists",
    );
  });

  it("approve throws for non-existent item", () => {
    const queue = new ReviewQueue();
    expect(() => queue.approve("nonexistent", "alice")).toThrow(
      '"nonexistent" not found',
    );
  });

  it("reject throws for non-existent item", () => {
    const queue = new ReviewQueue();
    expect(() => queue.reject("nonexistent", "bob", "bad")).toThrow(
      '"nonexistent" not found',
    );
  });

  it("revise throws for non-existent item", () => {
    const queue = new ReviewQueue();
    expect(() => queue.revise("nonexistent", "feedback")).toThrow(
      '"nonexistent" not found',
    );
  });

  it("resubmit throws for non-existent item", () => {
    const queue = new ReviewQueue();
    expect(() => queue.resubmit("nonexistent")).toThrow(
      '"nonexistent" not found',
    );
  });

  it("enqueue rejects non-pending items", () => {
    const queue = new ReviewQueue();
    const item: ReviewItem = {
      id: "r1",
      taskId: "task-r1",
      content: "Review r1",
      state: "approved",
    };

    expect(() => queue.enqueue(item)).toThrow(/must be in "pending" state/);
  });

  it("records trace events for all transitions", () => {
    const queue = new ReviewQueue();
    queue.enqueue(makePendingItem("r1"));
    queue.revise("r1", "Needs changes");
    queue.resubmit("r1");

    const events = queue.getTraceEvents();
    // enqueue(pending) + revise + revision message + resubmit + resubmit message = 5 events
    expect(events.length).toBeGreaterThanOrEqual(5);
    const stateChanges = events.filter((e) => e.type === "state_change");
    expect(stateChanges.length).toBeGreaterThanOrEqual(3);
  });
});
