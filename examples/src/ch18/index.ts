/**
 * Chapter 18 — Information Provenance and Batch Processing
 *
 * Demonstrates provenance tracking and batch processing:
 *   - ProvenanceTracker records sources and maps claims to them
 *   - Claims are classified as supported, inferred, or unsupported
 *   - Conflict detection between claims from different sources
 *   - BatchProcessor runs analysis across multiple items
 *   - Per-item error isolation keeps healthy items safe
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, TraceEvent } from "@openagention/core";
import { MockProvider } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Event ID generator ──────────────────────────────────────────────

let _nextEventId = 1800;
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

// ── Provenance types ──────────────────────────────────────────────

interface Source {
  id: string;
  type: "file_read" | "tool_result" | "user_input";
  content: string;
  metadata: {
    filePath?: string;
    timestamp: number;
  };
}

interface Claim {
  id: string;
  text: string;
  sourceIds: string[];
  confidence: "supported" | "inferred" | "unsupported";
}

// ── ProvenanceTracker ─────────────────────────────────────────────

class ProvenanceTracker {
  private sources: Map<string, Source> = new Map();
  private claims: Map<string, Claim> = new Map();
  private sourceIdCounter = 0;
  private claimIdCounter = 0;

  recordSource(
    type: Source["type"],
    content: string,
    metadata: Omit<Source["metadata"], "timestamp">,
  ): string {
    const id = `src-${++this.sourceIdCounter}`;
    const source: Source = {
      id,
      type,
      content,
      metadata: { ...metadata, timestamp: Date.now() },
    };
    this.sources.set(id, source);
    return id;
  }

  recordClaim(text: string, sourceIds: string[]): Claim {
    const id = `claim-${++this.claimIdCounter}`;
    const validSources = sourceIds.filter((sid) => this.sources.has(sid));

    let confidence: Claim["confidence"];
    if (validSources.length === 0) {
      confidence = "unsupported";
    } else if (validSources.length < sourceIds.length) {
      confidence = "inferred";
    } else {
      confidence = "supported";
    }

    const claim: Claim = { id, text, sourceIds: validSources, confidence };
    this.claims.set(id, claim);
    return claim;
  }

  getUnsupported(): Claim[] {
    return [...this.claims.values()].filter(
      (c) => c.confidence === "unsupported",
    );
  }

  getSummary(): {
    sources: number;
    claims: number;
    supported: number;
    inferred: number;
    unsupported: number;
  } {
    const claims = [...this.claims.values()];
    return {
      sources: this.sources.size,
      claims: claims.length,
      supported: claims.filter((c) => c.confidence === "supported").length,
      inferred: claims.filter((c) => c.confidence === "inferred").length,
      unsupported: claims.filter((c) => c.confidence === "unsupported").length,
    };
  }
}

// ── Batch types ───────────────────────────────────────────────────

interface BatchItem<T> {
  id: string;
  data: T;
}

interface BatchItemResult<R> {
  itemId: string;
  status: "success" | "failure";
  result?: R;
  error?: string;
  durationMs: number;
}

interface BatchResult<R> {
  totalItems: number;
  succeeded: number;
  failed: number;
  items: BatchItemResult<R>[];
  durationMs: number;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 18: Provenance & Batch Processing ═══\n");

  const responses = loadFixtures();
  const traceEvents: TraceEvent[] = [];

  // ── Part 1: Provenance Tracking ─────────────────────────────────

  console.log("── Part 1: Provenance Tracking ──\n");

  const tracker = new ProvenanceTracker();

  // Record file sources
  const files: Record<string, string> = {
    "src/auth.ts":
      "export function login(user: User, password: string) {\n  if (user.hash == hashPassword(password)) { return true; }\n}",
    "src/utils.ts":
      "export function sanitizeInput(input: string) {\n  return input.replace(/<[^>]*>/g, '');\n}",
  };

  console.log("Recording sources:");
  const sourceIds: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(files)) {
    const id = tracker.recordSource("file_read", content, { filePath });
    sourceIds[filePath] = id;
    console.log(`  ${id}: ${filePath} (${content.length} chars)`);
  }

  // Record claims — some supported, some not
  console.log("\nRecording claims:");

  const claim1 = tracker.recordClaim(
    "Missing null check on user parameter in login()",
    [sourceIds["src/auth.ts"]!],
  );
  console.log(
    `  ${claim1.id}: ${claim1.confidence} — ${claim1.text.slice(0, 60)}`,
  );

  const claim2 = tracker.recordClaim(
    "Password comparison uses == instead of timing-safe comparison",
    [sourceIds["src/auth.ts"]!],
  );
  console.log(
    `  ${claim2.id}: ${claim2.confidence} — ${claim2.text.slice(0, 60)}`,
  );

  const claim3 = tracker.recordClaim(
    "SQL injection vulnerability in database.ts on line 42",
    [], // No source — this is unsupported (hallucination)
  );
  console.log(
    `  ${claim3.id}: ${claim3.confidence} — ${claim3.text.slice(0, 60)}`,
  );

  const claim4 = tracker.recordClaim(
    "sanitizeInput does not handle unicode escape sequences",
    [sourceIds["src/utils.ts"]!],
  );
  console.log(
    `  ${claim4.id}: ${claim4.confidence} — ${claim4.text.slice(0, 60)}`,
  );

  // Check unsupported claims
  const unsupported = tracker.getUnsupported();
  console.log(
    `\nUnsupported claims (potential hallucinations): ${unsupported.length}`,
  );
  for (const claim of unsupported) {
    console.log(`  WARNING: ${claim.id} — ${claim.text}`);
  }

  // Record provenance trace events
  const summary = tracker.getSummary();
  traceEvents.push({
    id: eventId(),
    timestamp: now(),
    type: "message",
    data: {
      role: "system",
      content: `Provenance: ${summary.supported} supported, ${summary.inferred} inferred, ${summary.unsupported} unsupported`,
    },
  });

  // ── Part 2: Batch Processing ────────────────────────────────────

  console.log("\n── Part 2: Batch Processing ──\n");

  const batchItems: BatchItem<string>[] = [
    { id: "file-001", data: "src/auth.ts" },
    { id: "file-002", data: "src/utils.ts" },
    { id: "file-003", data: "src/config.ts" },
  ];

  console.log(`Processing ${batchItems.length} items in batch...`);

  const startTime = Date.now();
  const results: BatchItemResult<string>[] = [];
  let responseIdx = 0;

  for (const item of batchItems) {
    const itemStart = Date.now();

    try {
      // Simulate per-item analysis via MockProvider
      const provider = new MockProvider([responses[responseIdx]!]);
      responseIdx++;
      const response = await provider.chat([], []);

      results.push({
        itemId: item.id,
        status: "success",
        result: response.content,
        durationMs: Date.now() - itemStart,
      });
      console.log(`  [done] ${item.id} (${item.data}): success`);

      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "state_change",
        data: {
          entity: "batch_item",
          entityId: item.id,
          from: "processing",
          to: "success",
        },
      });
    } catch (err) {
      results.push({
        itemId: item.id,
        status: "failure",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - itemStart,
      });
      console.log(
        `  [fail] ${item.id} (${item.data}): ${(err as Error).message}`,
      );

      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "error",
        data: {
          code: "BATCH_ITEM_FAILURE",
          message: `Item ${item.id} failed: ${(err as Error).message}`,
        },
      });
    }
  }

  const batchResult: BatchResult<string> = {
    totalItems: batchItems.length,
    succeeded: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failure").length,
    items: results,
    durationMs: Date.now() - startTime,
  };

  console.log(
    `\nBatch complete: ${batchResult.succeeded}/${batchResult.totalItems} succeeded, ${batchResult.failed} failed`,
  );

  // ── Summary ───────────────────────────────────────────────────

  console.log("\n── Summary ──");
  console.log(`  Sources recorded: ${summary.sources}`);
  console.log(`  Claims recorded: ${summary.claims}`);
  console.log(
    `  Confidence: ${summary.supported} supported, ${summary.inferred} inferred, ${summary.unsupported} unsupported`,
  );
  console.log(
    `  Batch: ${batchResult.succeeded} succeeded, ${batchResult.failed} failed (${batchResult.durationMs}ms)`,
  );
  console.log(`  Total trace events: ${traceEvents.length}`);

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
