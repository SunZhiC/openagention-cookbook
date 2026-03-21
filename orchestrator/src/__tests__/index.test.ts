import { describe, it, expect } from "vitest";

import {
  HandoffManager,
  ReviewQueue,
  Scheduler,
  SupervisorAgent,
  WorkerAgent,
} from "../index.js";
import * as handoffModule from "../handoff.js";
import * as reviewQueueModule from "../review-queue.js";
import * as schedulerModule from "../scheduler.js";
import * as supervisorModule from "../supervisor.js";

describe("@openagention/orchestrator exports", () => {
  it("re-exports the public orchestrator API", () => {
    expect(SupervisorAgent).toBe(supervisorModule.SupervisorAgent);
    expect(WorkerAgent).toBe(supervisorModule.WorkerAgent);
    expect(Scheduler).toBe(schedulerModule.Scheduler);
    expect(ReviewQueue).toBe(reviewQueueModule.ReviewQueue);
    expect(HandoffManager).toBe(handoffModule.HandoffManager);
  });
});
