/**
 * Chapter 20 — Failures, Retries, Recovery, and Observability
 *
 * Demonstrates production-grade observability with:
 *   - All 7 failure modes triggered and recovered
 *   - MetricsCollector tracking counters, gauges, and histograms
 *   - CircuitBreaker pattern for failure isolation
 *   - Structured error classification and handling
 *   - Alert threshold checking
 *   - Full trace event recording for each failure and recovery
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, TraceEvent } from "@openagention/core";
import { MockProvider } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Event ID generator ──────────────────────────────────────────────

let _nextEventId = 2000;
function eventId(): string {
  return `evt_${String(_nextEventId++).padStart(4, "0")}`;
}

function now(): string {
  return new Date().toISOString();
}

// ── Provider ──────────────────────────────────────────────────────

function loadFixtures(): Message[] {
  const raw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  return JSON.parse(raw) as Message[];
}

// ── Metrics Collector ─────────────────────────────────────────────

class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  increment(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  observe(name: string, value: number): void {
    const existing = this.histograms.get(name) ?? [];
    existing.push(value);
    this.histograms.set(name, existing);
  }

  checkAlerts(thresholds: Map<string, { max: number }>): string[] {
    const alerts: string[] = [];

    for (const [metric, threshold] of thresholds) {
      const counter = this.counters.get(metric);
      if (counter !== undefined && counter > threshold.max) {
        alerts.push(
          `${metric} = ${counter} exceeds threshold ${threshold.max}`,
        );
      }
      const gauge = this.gauges.get(metric);
      if (gauge !== undefined && gauge > threshold.max) {
        alerts.push(`${metric} = ${gauge} exceeds threshold ${threshold.max}`);
      }
    }

    return alerts;
  }

  snapshot(): Record<string, unknown> {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        [...this.histograms].map(([k, v]) => {
          const sorted = [...v].sort((a, b) => a - b);
          const p50Idx = Math.max(0, Math.ceil(sorted.length * 0.5) - 1);
          const p95Idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
          return [
            k,
            {
              count: v.length,
              p50: sorted[p50Idx] ?? 0,
              p95: sorted[p95Idx] ?? 0,
            },
          ];
        }),
      ),
    };
  }
}

// ── Circuit Breaker ───────────────────────────────────────────────

type CircuitState = "closed" | "open" | "half-open";

class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 5, cooldownMs = 30_000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = "open";
    }
  }

  recordSuccess(): void {
    if (this.state === "half-open") {
      this.state = "closed";
    }
    this.failureCount = 0;
  }

  canProceed(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.cooldownMs) {
        this.state = "half-open";
        return true;
      }
      return false;
    }
    // half-open: allow one test call
    return true;
  }

  getState(): CircuitState {
    return this.state;
  }
}

// ── Failure scenarios ─────────────────────────────────────────────

interface FailureScenario {
  code: string;
  label: string;
  simulate: () => void;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 20: Observability — Failures & Recovery ═══\n");

  const recoveryResponses = loadFixtures();
  const traceEvents: TraceEvent[] = [];
  const metrics = new MetricsCollector();
  const breaker = new CircuitBreaker(5, 1000);

  // ── Failure scenarios ─────────────────────────────────────────

  const scenarios: FailureScenario[] = [
    {
      code: "TIMEOUT",
      label: "Timeout",
      simulate() {
        throw new Error("Agent loop timeout after 100ms");
      },
    },
    {
      code: "RATE_LIMIT",
      label: "Rate Limit",
      simulate() {
        throw new Error("Rate limit exceeded — retry after 30s");
      },
    },
    {
      code: "MALFORMED_JSON",
      label: "Malformed JSON",
      simulate() {
        JSON.parse("{invalid json}");
      },
    },
    {
      code: "EMPTY_RESPONSE",
      label: "Empty Response",
      simulate() {
        throw new Error("Provider returned empty response content");
      },
    },
    {
      code: "PROMPT_INJECTION",
      label: "Prompt Injection",
      simulate() {
        throw new Error("Prompt injection detected in user input");
      },
    },
    {
      code: "MODEL_REFUSAL",
      label: "Model Refusal",
      simulate() {
        throw new Error("Model refused to complete the request");
      },
    },
    {
      code: "CHECKPOINT_CORRUPTION",
      label: "Checkpoint Corruption",
      simulate() {
        throw new Error("Checkpoint data failed integrity check");
      },
    },
  ];

  // ── Run failure scenarios with metrics & circuit breaker ──────

  console.log("── Failure Scenarios ──\n");

  let recoveryIdx = 0;
  let failureCount = 0;
  let recoveryCount = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!;
    console.log(`${i + 1}. ${scenario.label}`);

    // Track latency
    const start = Date.now();

    // Trigger the failure
    let errorMsg: string;
    try {
      scenario.simulate();
      errorMsg = "unexpected: no error thrown";
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    console.log(`   Error: ${errorMsg}`);
    failureCount++;

    // Update metrics
    metrics.increment("errors.total");
    metrics.increment(`errors.${scenario.code.toLowerCase()}`);

    // Record circuit breaker state
    breaker.recordFailure();

    // Record error trace event
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "error",
      data: {
        code: scenario.code,
        message: errorMsg,
      },
    });

    // Recover using mock response
    const recoveryProvider = new MockProvider([
      recoveryResponses[recoveryIdx]!,
    ]);
    const recoveryResponse = await recoveryProvider.chat([], []);
    recoveryIdx++;

    console.log(`   Recovery: ${recoveryResponse.content}`);
    recoveryCount++;

    // Update metrics for recovery
    metrics.increment("recoveries.total");
    const latency = Date.now() - start;
    metrics.observe("recovery.latency_ms", latency);

    // Record recovery trace events
    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "agent",
        entityId: `failure_${scenario.code.toLowerCase()}`,
        from: "failed",
        to: "recovered",
      },
    });

    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "assistant",
        content: recoveryResponse.content,
      },
    });

    // After recovery, record success on breaker
    breaker.recordSuccess();

    console.log("");
  }

  // ── Circuit Breaker state ─────────────────────────────────────

  console.log("── Circuit Breaker ──");
  console.log(`  State: ${breaker.getState()}`);
  console.log(`  Can proceed: ${breaker.canProceed()}`);

  // ── Metrics snapshot ──────────────────────────────────────────

  console.log("\n── Metrics Snapshot ──");

  metrics.gauge(
    "circuit_breaker.state",
    breaker.getState() === "closed" ? 0 : 1,
  );
  metrics.gauge("active_workers", 0);

  const snapshot = metrics.snapshot();
  const counters = snapshot.counters as Record<string, number>;
  const histograms = snapshot.histograms as Record<
    string,
    { count: number; p50: number; p95: number }
  >;

  console.log(`  errors.total: ${counters["errors.total"] ?? 0}`);
  console.log(`  recoveries.total: ${counters["recoveries.total"] ?? 0}`);

  if (histograms["recovery.latency_ms"]) {
    const lat = histograms["recovery.latency_ms"];
    console.log(
      `  recovery.latency: p50=${lat.p50}ms, p95=${lat.p95}ms (${lat.count} samples)`,
    );
  }

  // ── Alert checking ────────────────────────────────────────────

  console.log("\n── Alert Check ──");

  const thresholds = new Map<string, { max: number }>();
  thresholds.set("errors.total", { max: 10 });
  thresholds.set("active_workers", { max: 5 });

  const alerts = metrics.checkAlerts(thresholds);
  if (alerts.length === 0) {
    console.log("  No alerts triggered (all within thresholds)");
  } else {
    for (const alert of alerts) {
      console.log(`  ALERT: ${alert}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────

  console.log("\n── Summary ──");
  console.log(`  Failures triggered: ${failureCount}`);
  console.log(`  Recoveries: ${recoveryCount}`);
  console.log(`  Circuit breaker: ${breaker.getState()}`);
  console.log(`  Total trace events: ${traceEvents.length}`);

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
