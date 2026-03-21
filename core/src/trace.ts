// ── Trace event types ──────────────────────────────────────────────

/** Discriminated union tag for every trace event kind. */
export type TraceEventType =
  | "message"
  | "tool_call"
  | "tool_result"
  | "state_change"
  | "checkpoint"
  | "error";

// ── Per-type data shapes ───────────────────────────────────────────

export interface MessageEventData {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ToolCallEventData {
  toolName: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface ToolResultEventData {
  callId: string;
  result: string;
  isError: boolean;
}

export interface StateChangeEventData {
  entity: string;
  entityId: string;
  from: string;
  to: string;
}

export interface CheckpointEventData {
  runId: string;
  snapshot: string;
  resumable: boolean;
}

export interface ErrorEventData {
  code: string;
  message: string;
  stack?: string;
}

/** Map from event type tag to its data shape. */
export interface TraceEventDataMap {
  message: MessageEventData;
  tool_call: ToolCallEventData;
  tool_result: ToolResultEventData;
  state_change: StateChangeEventData;
  checkpoint: CheckpointEventData;
  error: ErrorEventData;
}

// ── TraceEvent (generic + union) ───────────────────────────────────

export interface TraceEvent<T extends TraceEventType = TraceEventType> {
  id: string;
  timestamp: string;
  type: T;
  data: TraceEventDataMap[T];
  metadata?: Record<string, unknown>;
}

/** An ordered sequence of events forming one logical step. */
export type TraceStep = TraceEvent[];

/** A complete recorded session for a chapter. */
export interface TraceSession {
  id: string;
  chapterId: string;
  events: TraceEvent[];
  startTime: string;
  endTime: string;
}

// ── Runtime validation ─────────────────────────────────────────────

const VALID_TYPES = new Set<string>([
  "message",
  "tool_call",
  "tool_result",
  "state_change",
  "checkpoint",
  "error",
]);

/**
 * Basic runtime validation for a TraceEvent.
 * Returns `true` when the value looks structurally correct; throws otherwise.
 */
export function validateTraceEvent(
  event: unknown,
): event is TraceEvent {
  if (event === null || typeof event !== "object") {
    throw new Error("TraceEvent must be a non-null object");
  }

  const e = event as Record<string, unknown>;

  if (typeof e["id"] !== "string" || e["id"].length === 0) {
    throw new Error("TraceEvent.id must be a non-empty string");
  }

  if (typeof e["timestamp"] !== "string" || e["timestamp"].length === 0) {
    throw new Error("TraceEvent.timestamp must be a non-empty string");
  }

  if (typeof e["type"] !== "string" || !VALID_TYPES.has(e["type"])) {
    throw new Error(
      `TraceEvent.type must be one of: ${[...VALID_TYPES].join(", ")}`,
    );
  }

  if (e["data"] === null || typeof e["data"] !== "object") {
    throw new Error("TraceEvent.data must be a non-null object");
  }

  if (e["metadata"] !== undefined && (e["metadata"] === null || typeof e["metadata"] !== "object")) {
    throw new Error("TraceEvent.metadata must be an object when present");
  }

  return true;
}
