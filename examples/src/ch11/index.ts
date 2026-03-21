/**
 * Chapter 11 — Review Queue
 *
 * Demonstrates the ReviewQueue state machine:
 *   - Enqueue 3 review items
 *   - Approve item 1
 *   - Revise item 2 with feedback, then resubmit it
 *   - Reject item 3 as a terminal decision
 *   - Show all state transitions
 */
import type { ReviewItem } from "@openagention/core";
import { ReviewQueue } from "@openagention/orchestrator";

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 11: Review Queue ═══\n");

  const queue = new ReviewQueue();

  // Create 3 review items
  const items: ReviewItem[] = [
    {
      id: "review-001",
      taskId: "task-1",
      content: "Add user authentication middleware",
      state: "pending",
    },
    {
      id: "review-002",
      taskId: "task-2",
      content: "Database schema migration script",
      state: "pending",
    },
    {
      id: "review-003",
      taskId: "task-3",
      content: "API rate limiting implementation",
      state: "pending",
    },
  ];

  // Enqueue all items
  console.log("── Enqueue ──");
  for (const item of items) {
    queue.enqueue(item);
    console.log(`  Enqueued: ${item.id} — ${item.content}`);
  }

  // Show current state
  console.log(`\nPending items: ${queue.list("pending").length}`);

  // Approve item 1
  console.log("\n── Approve review-001 ──");
  queue.approve("review-001", "alice");
  const approved = queue.get("review-001")!;
  console.log(
    `  ${approved.id}: ${approved.state} (reviewer: ${approved.reviewer})`,
  );

  // Request revision for item 2
  console.log("\n── Revise review-002 ──");
  queue.revise("review-002", "Add foreign key constraints and an email index");
  const revised = queue.get("review-002")!;
  console.log(
    `  ${revised.id}: ${revised.state} (feedback: ${revised.feedback})`,
  );

  // Resubmit item 2 after revision
  console.log("\n── Resubmit review-002 ──");
  queue.resubmit("review-002");
  const resubmitted = queue.get("review-002")!;
  console.log(`  ${resubmitted.id}: ${resubmitted.state}`);

  // Reject item 3 as a terminal decision
  console.log("\n── Reject review-003 ──");
  queue.reject(
    "review-003",
    "bob",
    "Billing-impact changes need manual approval",
  );
  const rejected = queue.get("review-003")!;
  console.log(
    `  ${rejected.id}: ${rejected.state} (reviewer: ${rejected.reviewer})`,
  );

  // Demonstrate that rejected is terminal
  console.log("\n── Invalid transition (resubmit rejected review-003) ──");
  try {
    queue.resubmit("review-003");
  } catch (err) {
    console.log(`  Error: ${(err as Error).message}`);
  }

  // Demonstrate invalid transition
  console.log("\n── Invalid transition (approve already-approved) ──");
  try {
    queue.approve("review-001", "charlie");
  } catch (err) {
    console.log(`  Error: ${(err as Error).message}`);
  }

  // Final state summary
  console.log("\n── Final state ──");
  for (const item of queue.list()) {
    console.log(
      `  ${item.id}: ${item.state}${item.feedback ? ` [feedback: ${item.feedback}]` : ""}${item.reviewer ? ` (${item.reviewer})` : ""}`,
    );
  }

  // Trace events
  const traceEvents = queue.getTraceEvents();
  console.log(`\nTrace events: ${traceEvents.length}`);
  for (const evt of traceEvents) {
    if (evt.type === "state_change") {
      const d = evt.data as { entityId: string; from: string; to: string };
      console.log(`  ${d.entityId}: ${d.from} → ${d.to}`);
    } else if (evt.type === "message") {
      const d = evt.data as { content: string };
      console.log(`  msg: ${d.content.slice(0, 70)}`);
    }
  }

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
