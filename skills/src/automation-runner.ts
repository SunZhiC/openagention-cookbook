/**
 * AutomationRunner — Trigger-based automation execution.
 *
 * Registers automations that pair a trigger event with a skill.
 * When triggered, the runner spins up an AgentLoop with the
 * skill's tools and a MockProvider, executing the automation
 * in the background.
 */

import type {
  Automation,
  ChatProvider,
  Message,
  TraceEvent,
} from "@openagention/core";
import { AgentLoop, ToolRegistry } from "@openagention/runtime";
import type { SkillLoader } from "./skill-loader.js";

// ── Event ID generator ──────────────────────────────────────────────

let _nextEventId = 8000;
function eventId(): string {
  return `evt_${String(_nextEventId++).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

// ── Result types ────────────────────────────────────────────────────

/** The outcome of a completed (or failed) automation run. */
export interface AutomationResult {
  automationId: string;
  status: "completed" | "failed" | "timeout";
  traceEvents: TraceEvent[];
  output: string;
}

/** Current lifecycle status of an automation. */
export type AutomationStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "timeout";

// ── AutomationRunner ────────────────────────────────────────────────

/**
 * Manages automation definitions and executes them on demand.
 *
 * Each automation is linked to a skill via `skillId`. When triggered,
 * the runner injects the skill's tools into a fresh ToolRegistry
 * and runs an AgentLoop.
 */
export class AutomationRunner {
  private loader: SkillLoader;
  private provider: ChatProvider;
  private timeout: number;
  private automations = new Map<string, Automation>();
  private statuses = new Map<string, AutomationStatus>();

  constructor(config: {
    loader: SkillLoader;
    provider: ChatProvider;
    timeout: number;
  }) {
    this.loader = config.loader;
    this.provider = config.provider;
    this.timeout = config.timeout;
  }

  /** Register an automation definition. */
  register(automation: Automation): void {
    this.automations.set(automation.id, automation);
    this.statuses.set(automation.id, "idle");
  }

  /** Return all registered automations. */
  list(): Automation[] {
    return [...this.automations.values()];
  }

  /** Get the current status of an automation. */
  getStatus(automationId: string): AutomationStatus {
    const status = this.statuses.get(automationId);
    if (status === undefined) {
      throw new Error(
        `AutomationRunner: automation "${automationId}" not found`,
      );
    }
    return status;
  }

  /**
   * Trigger an automation by ID. Loads its skill, injects tools,
   * and runs an AgentLoop with the configured provider.
   */
  async trigger(automationId: string): Promise<AutomationResult> {
    const automation = this.automations.get(automationId);
    if (!automation) {
      throw new Error(
        `AutomationRunner: automation "${automationId}" not found`,
      );
    }

    const traceEvents: TraceEvent[] = [];

    // Transition: idle → running
    this.statuses.set(automationId, "running");
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "automation",
        entityId: automationId,
        from: "idle",
        to: "running",
      },
    });

    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "system",
        content: `Automation "${automation.name}" triggered by "${automation.trigger}".`,
      },
    });

    // Inject the skill's tools into a fresh registry
    const registry = new ToolRegistry();
    try {
      this.loader.inject(automation.skillId, registry);
    } catch (err) {
      this.statuses.set(automationId, "failed");
      const msg = err instanceof Error ? err.message : String(err);
      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "error",
        data: { code: "SKILL_LOAD_ERROR", message: msg },
      });
      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "automation",
          entityId: automationId,
          from: "running",
          to: "failed",
        },
      });
      return { automationId, status: "failed", traceEvents, output: msg };
    }

    // Run the agent loop
    const loop = new AgentLoop({
      maxTurns: 10,
      timeout: this.timeout,
      tools: registry,
      provider: this.provider,
    });

    const userMessage: Message = {
      role: "user",
      content: `Execute automation: ${automation.name}`,
    };

    try {
      const result = await loop.run([userMessage]);
      traceEvents.push(...result.traceEvents);

      // Extract final assistant output
      const finalMessages = result.messages.filter(
        (m) => m.role === "assistant" && !m.tool_calls,
      );
      const output =
        finalMessages.length > 0
          ? finalMessages[finalMessages.length - 1]!.content
          : "Automation completed.";

      // Transition: running → completed
      this.statuses.set(automationId, "completed");
      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "automation",
          entityId: automationId,
          from: "running",
          to: "completed",
        },
      });

      return { automationId, status: "completed", traceEvents, output };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("timeout") || msg.includes("Timeout");

      const finalStatus: "failed" | "timeout" = isTimeout
        ? "timeout"
        : "failed";
      this.statuses.set(automationId, finalStatus);

      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "error",
        data: {
          code: isTimeout ? "TIMEOUT" : "AUTOMATION_ERROR",
          message: msg,
        },
      });

      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "automation",
          entityId: automationId,
          from: "running",
          to: finalStatus,
        },
      });

      return { automationId, status: finalStatus, traceEvents, output: msg };
    }
  }
}
