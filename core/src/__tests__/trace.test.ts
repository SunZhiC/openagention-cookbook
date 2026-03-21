import { describe, it, expect } from "vitest";
import { validateTraceEvent } from "../trace.js";
import type { TraceEvent, TraceSession } from "../trace.js";

describe("validateTraceEvent", () => {
  const validEvent: TraceEvent<"message"> = {
    id: "evt_0001",
    timestamp: "2026-03-15T10:00:00.000Z",
    type: "message",
    data: { role: "user", content: "Hello" },
  };

  it("accepts a valid message event", () => {
    expect(validateTraceEvent(validEvent)).toBe(true);
  });

  it("accepts a valid tool_call event", () => {
    const event: TraceEvent<"tool_call"> = {
      id: "evt_0002",
      timestamp: "2026-03-15T10:00:00.100Z",
      type: "tool_call",
      data: { toolName: "readFile", arguments: { path: "a.ts" }, callId: "call_001" },
    };
    expect(validateTraceEvent(event)).toBe(true);
  });

  it("accepts a valid tool_result event", () => {
    const event: TraceEvent<"tool_result"> = {
      id: "evt_0003",
      timestamp: "2026-03-15T10:00:00.200Z",
      type: "tool_result",
      data: { callId: "call_001", result: "file contents", isError: false },
    };
    expect(validateTraceEvent(event)).toBe(true);
  });

  it("accepts a valid state_change event", () => {
    const event: TraceEvent<"state_change"> = {
      id: "evt_0004",
      timestamp: "2026-03-15T10:00:00.300Z",
      type: "state_change",
      data: { entity: "task", entityId: "t1", from: "pending", to: "running" },
    };
    expect(validateTraceEvent(event)).toBe(true);
  });

  it("accepts a valid checkpoint event", () => {
    const event: TraceEvent<"checkpoint"> = {
      id: "evt_0005",
      timestamp: "2026-03-15T10:00:00.400Z",
      type: "checkpoint",
      data: { runId: "run_1", snapshot: "{}", resumable: true },
    };
    expect(validateTraceEvent(event)).toBe(true);
  });

  it("accepts a valid error event", () => {
    const event: TraceEvent<"error"> = {
      id: "evt_0006",
      timestamp: "2026-03-15T10:00:00.500Z",
      type: "error",
      data: { code: "TIMEOUT", message: "Timed out" },
    };
    expect(validateTraceEvent(event)).toBe(true);
  });

  it("accepts event with metadata", () => {
    expect(
      validateTraceEvent({ ...validEvent, metadata: { source: "test" } }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(() => validateTraceEvent(null)).toThrow("non-null object");
  });

  it("rejects non-object", () => {
    expect(() => validateTraceEvent("string")).toThrow("non-null object");
  });

  it("rejects missing id", () => {
    expect(() =>
      validateTraceEvent({ ...validEvent, id: "" }),
    ).toThrow("id");
  });

  it("rejects missing timestamp", () => {
    expect(() =>
      validateTraceEvent({ ...validEvent, timestamp: "" }),
    ).toThrow("timestamp");
  });

  it("rejects invalid type", () => {
    expect(() =>
      validateTraceEvent({ ...validEvent, type: "invalid" }),
    ).toThrow("type");
  });

  it("rejects null data", () => {
    expect(() =>
      validateTraceEvent({ ...validEvent, data: null }),
    ).toThrow("data");
  });

  it("rejects non-object metadata", () => {
    expect(() =>
      validateTraceEvent({ ...validEvent, metadata: "bad" }),
    ).toThrow("metadata");
  });
});

describe("TraceSession structure", () => {
  it("can be constructed with valid fields", () => {
    const session: TraceSession = {
      id: "session_1",
      chapterId: "ch01",
      events: [
        {
          id: "evt_0001",
          timestamp: "2026-03-15T10:00:00.000Z",
          type: "message",
          data: { role: "user", content: "Hello" },
        },
      ],
      startTime: "2026-03-15T10:00:00.000Z",
      endTime: "2026-03-15T10:00:01.000Z",
    };
    expect(session.events).toHaveLength(1);
    expect(session.chapterId).toBe("ch01");
  });

  it("validates all events in a session", () => {
    const session: TraceSession = {
      id: "session_2",
      chapterId: "ch02",
      events: [
        { id: "e1", timestamp: "t1", type: "message", data: { role: "user", content: "hi" } },
        { id: "e2", timestamp: "t2", type: "tool_call", data: { toolName: "read", arguments: {}, callId: "c1" } },
      ],
      startTime: "t1",
      endTime: "t2",
    };
    for (const event of session.events) {
      expect(validateTraceEvent(event)).toBe(true);
    }
  });
});
