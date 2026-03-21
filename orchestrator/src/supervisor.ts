/**
 * Supervisor-Worker — Multi-agent task delegation.
 *
 * The SupervisorAgent breaks a high-level goal into sub-tasks,
 * then dispatches each to a WorkerAgent for execution.
 * Educational/simulated — uses MockProvider for planning.
 */

import type {
  ChatProvider,
  Task,
  Message,
  TraceEvent,
  TaskState,
} from "@openagention/core";
import type { ToolRegistry } from "@openagention/runtime";
import { AgentLoop } from "@openagention/runtime";

// ── Event ID generator ──────────────────────────────────────────────

let _nextEventId = 9000;
function eventId(): string {
  return `evt_${String(_nextEventId++).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

// ── Result types ────────────────────────────────────────────────────

/** Result of a single worker executing one task. */
export interface WorkerResult {
  task: Task;
  messages: Message[];
  traceEvents: TraceEvent[];
}

/** Aggregated result from the supervisor dispatching all workers. */
export interface SupervisorResult {
  tasks: Task[];
  traceEvents: TraceEvent[];
  summary: string;
}

// ── WorkerAgent ─────────────────────────────────────────────────────

/**
 * Executes a single task using an AgentLoop.
 * Each worker is independent and operates on its own task.
 */
export class WorkerAgent {
  private provider: ChatProvider;
  private tools: ToolRegistry;

  constructor(config: { provider: ChatProvider; tools: ToolRegistry }) {
    this.provider = config.provider;
    this.tools = config.tools;
  }

  /**
   * Run the agent loop for a single task.
   * Transitions the task through pending → running → done/failed.
   */
  async execute(task: Task): Promise<WorkerResult> {
    const traceEvents: TraceEvent[] = [];

    // Transition: pending → running
    const prevState = task.state;
    task.state = "running";
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "task",
        entityId: task.id,
        from: prevState,
        to: "running",
      },
    });

    const loop = new AgentLoop({
      maxTurns: 5,
      timeout: 30_000,
      tools: this.tools,
      provider: this.provider,
    });

    const userMessage: Message = { role: "user", content: task.goal };

    try {
      const result = await loop.run([userMessage]);

      // Transition: running → done
      task.state = "done";
      traceEvents.push(...result.traceEvents);
      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "task",
          entityId: task.id,
          from: "running",
          to: "done",
        },
      });

      return { task, messages: result.messages, traceEvents };
    } catch (err) {
      // Transition: running → failed
      task.state = "failed";
      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "task",
          entityId: task.id,
          from: "running",
          to: "failed",
        },
      });

      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "error",
        data: {
          code: "WORKER_ERROR",
          message: err instanceof Error ? err.message : String(err),
        },
      });

      return { task, messages: [], traceEvents };
    }
  }
}

// ── SupervisorAgent ─────────────────────────────────────────────────

/**
 * Breaks a high-level goal into sub-tasks, dispatches workers,
 * and collects their results into a summary.
 *
 * The planning step uses the ChatProvider (typically a MockProvider)
 * to simulate the supervisor "deciding" how to decompose work.
 */
export class SupervisorAgent {
  private provider: ChatProvider;
  private tools: ToolRegistry;
  private maxWorkers: number;

  constructor(config: {
    provider: ChatProvider;
    tools: ToolRegistry;
    maxWorkers: number;
  }) {
    this.provider = config.provider;
    this.tools = config.tools;
    this.maxWorkers = config.maxWorkers;
  }

  /**
   * Dispatch a goal to be broken into sub-tasks and executed by workers.
   *
   * 1. Asks the provider to plan the task breakdown
   * 2. Parses sub-tasks from the plan
   * 3. Dispatches WorkerAgents (up to maxWorkers concurrently)
   * 4. Aggregates results and produces a summary
   */
  async dispatch(goal: string): Promise<SupervisorResult> {
    const traceEvents: TraceEvent[] = [];

    // Record the supervisor receiving the goal
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "user",
        content: `Supervisor received goal: ${goal}`,
      },
    });

    // Ask the provider to plan the breakdown
    const planMessage: Message = {
      role: "user",
      content: `Break down this goal into sub-tasks: ${goal}`,
    };

    const planResponse = await this.provider.chat(
      [planMessage],
      this.tools.list(),
    );

    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "assistant",
        content: planResponse.content,
      },
    });

    // Parse sub-tasks from the plan response.
    // The MockProvider returns a structured plan; we extract task lines.
    const tasks = this.parseSubTasks(planResponse.content, goal);

    // Record each sub-task creation
    for (const task of tasks) {
      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "task",
          entityId: task.id,
          from: "none",
          to: "pending",
        },
      });
    }

    // Supervisor decision: dispatch workers
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "assistant",
        content: `Supervisor dispatching ${tasks.length} workers (max concurrent: ${this.maxWorkers})`,
      },
    });

    // Execute tasks — respecting maxWorkers concurrency
    const allWorkerResults: WorkerResult[] = [];
    for (let i = 0; i < tasks.length; i += this.maxWorkers) {
      const batch = tasks.slice(i, i + this.maxWorkers);
      const batchResults = await Promise.all(
        batch.map((task) => {
          const worker = new WorkerAgent({
            provider: this.provider,
            tools: this.tools,
          });
          return worker.execute(task);
        }),
      );
      allWorkerResults.push(...batchResults);
    }

    // Collect trace events from all workers
    for (const wr of allWorkerResults) {
      traceEvents.push(...wr.traceEvents);
    }

    // Build summary
    const doneCount = tasks.filter((t) => t.state === "done").length;
    const failedCount = tasks.filter((t) => t.state === "failed").length;
    const summary = `Completed ${doneCount}/${tasks.length} sub-tasks (${failedCount} failed).`;

    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "assistant",
        content: `Supervisor summary: ${summary}`,
      },
    });

    return { tasks, traceEvents, summary };
  }

  /**
   * Parse sub-tasks from the plan response content.
   * Splits numbered lines into individual Task objects.
   */
  private parseSubTasks(planContent: string, parentGoal: string): Task[] {
    const lines = planContent
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+[\.\)]/.test(l));

    // If no numbered lines found, create a single task from the whole content
    if (lines.length === 0) {
      return [
        {
          id: "task_sub_001",
          name: parentGoal,
          goal: planContent,
          state: "pending" as TaskState,
          traceEvents: [],
        },
      ];
    }

    return lines.map((line, idx) => {
      const name = line.replace(/^\d+[\.\)]\s*/, "");
      return {
        id: `task_sub_${String(idx + 1).padStart(3, "0")}`,
        name,
        goal: name,
        state: "pending" as TaskState,
        traceEvents: [],
      };
    });
  }
}
