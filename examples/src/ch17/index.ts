/**
 * Chapter 17 — Validation-Retry and Prompt Calibration
 *
 * Demonstrates a validation-retry loop with pluggable validators:
 *   - SchemaValidator checks required fields and enum values
 *   - SemanticValidator checks value constraints
 *   - First attempt fails validation (wrong types and enum)
 *   - Error feedback is injected and model retries
 *   - Second attempt passes validation
 *   - Few-shot example bank provides calibration examples
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message, TraceEvent } from "@openagention/core";
import { MockProvider } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Event ID generator ──────────────────────────────────────────────

let _nextEventId = 1700;
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

// ── Validation types ──────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
  category: "retryable" | "non_retryable";
  severity: "error" | "warning";
}

interface Validator {
  name: string;
  validate(data: unknown): ValidationError[];
}

// ── Schema Validator ──────────────────────────────────────────────

class SchemaValidator implements Validator {
  name = "schema";
  private schema: {
    required: string[];
    properties: Record<string, { type?: string; enum?: string[] }>;
  };

  constructor(schema: {
    required: string[];
    properties: Record<string, { type?: string; enum?: string[] }>;
  }) {
    this.schema = schema;
  }

  validate(data: unknown): ValidationError[] {
    const errors: ValidationError[] = [];
    const obj = data as Record<string, unknown>;

    for (const field of this.schema.required) {
      if (!(field in obj) || obj[field] === undefined) {
        errors.push({
          field,
          message: `Missing required field: ${field}`,
          category: "retryable",
          severity: "error",
        });
      }
    }

    for (const [key, prop] of Object.entries(this.schema.properties)) {
      if (!(key in obj)) continue;
      if (prop.type && typeof obj[key] !== prop.type) {
        errors.push({
          field: key,
          message: `Expected type "${prop.type}", got "${typeof obj[key]}"`,
          category: "retryable",
          severity: "error",
        });
      }
      if (prop.enum && !prop.enum.includes(obj[key] as string)) {
        errors.push({
          field: key,
          message: `Value "${obj[key]}" not in enum [${prop.enum.join(", ")}]`,
          category: "retryable",
          severity: "error",
        });
      }
    }

    return errors;
  }
}

// ── Semantic Validator ────────────────────────────────────────────

class SemanticValidator implements Validator {
  name = "semantic";
  private rules: Array<{
    field: string;
    check: (value: unknown) => string | null;
  }>;

  constructor(
    rules: Array<{ field: string; check: (value: unknown) => string | null }>,
  ) {
    this.rules = rules;
  }

  validate(data: unknown): ValidationError[] {
    const errors: ValidationError[] = [];
    const obj = data as Record<string, unknown>;

    for (const rule of this.rules) {
      if (rule.field in obj) {
        const error = rule.check(obj[rule.field]);
        if (error) {
          errors.push({
            field: rule.field,
            message: error,
            category: "retryable",
            severity: "error",
          });
        }
      }
    }

    return errors;
  }
}

// ── Few-Shot Example Bank ─────────────────────────────────────────

interface FewShotExample {
  input: string;
  output: Record<string, unknown>;
  explanation?: string;
}

class ExampleBank {
  private examples: Map<string, FewShotExample[]> = new Map();

  add(category: string, example: FewShotExample): void {
    const existing = this.examples.get(category) ?? [];
    existing.push(example);
    this.examples.set(category, existing);
  }

  get(category: string, maxExamples = 3): FewShotExample[] {
    const all = this.examples.get(category) ?? [];
    return all.slice(0, maxExamples);
  }

  formatForPrompt(category: string, maxExamples = 3): string {
    const examples = this.get(category, maxExamples);
    if (examples.length === 0) return "";

    const formatted = examples.map((ex, i) => {
      let block = `Example ${i + 1}:\n`;
      block += `Input: ${ex.input}\n`;
      block += `Output: ${JSON.stringify(ex.output, null, 2)}`;
      if (ex.explanation) {
        block += `\nWhy: ${ex.explanation}`;
      }
      return block;
    });

    return (
      "Here are examples of correct output:\n\n" + formatted.join("\n\n---\n\n")
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Chapter 17: Validation-Retry ═══\n");

  const responses = loadFixtures();
  const traceEvents: TraceEvent[] = [];

  // ── Define the schema ─────────────────────────────────────────

  const configSchema = {
    required: ["name", "replicas", "port", "environment"],
    properties: {
      name: { type: "string" },
      replicas: { type: "number" },
      port: { type: "number" },
      environment: { enum: ["staging", "production"] },
    },
  };

  // ── Set up validators ─────────────────────────────────────────

  const schemaValidator = new SchemaValidator(configSchema);
  const semanticValidator = new SemanticValidator([
    {
      field: "replicas",
      check: (value) => {
        const num = value as number;
        if (typeof num === "number" && (num < 1 || num > 10)) {
          return `Replicas must be between 1 and 10, got ${num}`;
        }
        return null;
      },
    },
    {
      field: "port",
      check: (value) => {
        const num = value as number;
        if (typeof num === "number" && (num < 1024 || num > 65535)) {
          return `Port must be between 1024 and 65535, got ${num}`;
        }
        return null;
      },
    },
  ]);

  const validators: Validator[] = [schemaValidator, semanticValidator];

  // ── Set up example bank ───────────────────────────────────────

  console.log("── Setting up few-shot example bank ──");

  const exampleBank = new ExampleBank();
  exampleBank.add("deployment_config", {
    input: "Deploy a background worker service to production",
    output: {
      name: "bg-worker",
      replicas: 2,
      port: 9090,
      environment: "production",
    },
    explanation:
      "replicas is a number (not a string), environment is exactly 'production'",
  });
  exampleBank.add("deployment_config", {
    input: "Set up a staging API with 1 replica",
    output: {
      name: "staging-api",
      replicas: 1,
      port: 3000,
      environment: "staging",
    },
    explanation:
      "replicas is 1 (a number), environment is 'staging' (not 'stg')",
  });

  const examplePrompt = exampleBank.formatForPrompt("deployment_config");
  console.log(
    `  Loaded ${exampleBank.get("deployment_config").length} examples`,
  );
  console.log(`  Example prompt length: ${examplePrompt.length} chars`);

  // ── Run validation-retry loop ─────────────────────────────────

  const maxAttempts = 3;
  let responseIdx = 0;
  let validatedData: Record<string, unknown> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n── Attempt ${attempt} of ${maxAttempts} ──`);

    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "message",
      data: {
        role: "system",
        content: `Validation attempt ${attempt}`,
      },
    });

    // Get LLM response
    const provider = new MockProvider([responses[responseIdx]!]);
    const response = await provider.chat([], []);
    responseIdx++;

    console.log(`  LLM response: ${response.content.slice(0, 70)}`);

    // Parse the JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(response.content) as Record<string, unknown>;
    } catch {
      console.log("  Parse error: invalid JSON");
      traceEvents.push({
        id: eventId(),
        timestamp: now(),
        type: "error",
        data: { code: "MALFORMED_JSON", message: "Invalid JSON response" },
      });
      continue;
    }

    // Run all validators
    const allErrors: ValidationError[] = [];
    for (const validator of validators) {
      const errors = validator.validate(parsed);
      allErrors.push(...errors);
      if (errors.length > 0) {
        console.log(
          `  Validator [${validator.name}]: ${errors.length} error(s)`,
        );
        for (const err of errors) {
          console.log(`    - ${err.field}: ${err.message}`);
        }
      } else {
        console.log(`  Validator [${validator.name}]: passed`);
      }
    }

    // Record validation trace
    const blocking = allErrors.filter((e) => e.severity === "error");

    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: blocking.length === 0 ? "message" : "error",
      data:
        blocking.length === 0
          ? {
              role: "system",
              content: `Validation passed on attempt ${attempt}`,
            }
          : {
              code: "VALIDATION_FAILED",
              message: blocking
                .map((e) => `${e.field}: ${e.message}`)
                .join("; "),
            },
    });

    if (blocking.length === 0) {
      console.log(`  Validation PASSED on attempt ${attempt}`);
      validatedData = parsed;
      break;
    }

    console.log(`  Validation FAILED: ${blocking.length} blocking error(s)`);

    // Inject error feedback for next attempt
    const errorSummary = blocking
      .map((e) => `- Field "${e.field}": ${e.message}`)
      .join("\n");
    console.log(`  Injecting error feedback for retry:\n${errorSummary}`);

    traceEvents.push({
      id: eventId(),
      timestamp: now(),
      type: "state_change",
      data: {
        entity: "validation",
        entityId: `attempt_${attempt}`,
        from: "failed",
        to: "retrying",
      },
    });
  }

  // ── Result ────────────────────────────────────────────────────

  console.log("\n── Result ──");

  if (validatedData) {
    console.log(`  Status: validated`);
    console.log(`  Config: ${JSON.stringify(validatedData)}`);
    console.log(`  Attempts: ${responseIdx}`);
  } else {
    console.log(`  Status: failed after ${maxAttempts} attempts`);
  }

  // ── Summary ───────────────────────────────────────────────────

  console.log("\n── Summary ──");
  console.log(`  Validators: ${validators.map((v) => v.name).join(", ")}`);
  console.log(
    `  Few-shot examples: ${exampleBank.get("deployment_config").length}`,
  );
  console.log(`  Total trace events: ${traceEvents.length}`);

  console.log("\n═══ Done ═══");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
