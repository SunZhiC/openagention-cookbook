/**
 * Chapter 16 — Structured Output
 *
 * Demonstrates a structured output pipeline that extracts a code review
 * report as JSON, validates it, and returns a typed result.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Message } from "@openagention/core";
import { MockProvider } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ReviewFinding {
  severity: "critical" | "high" | "medium" | "low";
  filePath: string;
  lineNumber: number | null;
  description: string;
  suggestedFix: string | null;
}

interface ReviewReport {
  findings: ReviewFinding[];
  recommendation: "approve" | "request_changes" | "needs_discussion";
}

export class SchemaValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Schema validation failed: ${errors.join("; ")}`);
  }
}

function loadFixtures(): Message[] {
  const raw = readFileSync(
    join(__dirname, "__fixtures__", "responses.json"),
    "utf-8",
  );
  return JSON.parse(raw) as Message[];
}

export function validateReport(data: unknown): ReviewReport {
  if (!data || typeof data !== "object") {
    throw new SchemaValidationError(["Report must be a JSON object"]);
  }

  const obj = data as Record<string, unknown>;
  const errors: string[] = [];

  if (!Array.isArray(obj.findings)) {
    errors.push("Missing required field: findings");
  }
  if (
    obj.recommendation !== "approve" &&
    obj.recommendation !== "request_changes" &&
    obj.recommendation !== "needs_discussion"
  ) {
    errors.push("Invalid recommendation value");
  }

  const findings = Array.isArray(obj.findings) ? obj.findings : [];
  for (const [index, finding] of findings.entries()) {
    if (!finding || typeof finding !== "object") {
      errors.push(`Finding ${index} must be an object`);
      continue;
    }

    const item = finding as Record<string, unknown>;
    if (
      item.severity !== "critical" &&
      item.severity !== "high" &&
      item.severity !== "medium" &&
      item.severity !== "low"
    ) {
      errors.push(`Finding ${index}: invalid severity`);
    }
    if (typeof item.filePath !== "string") {
      errors.push(`Finding ${index}: missing filePath`);
    }
    if (item.lineNumber !== null && typeof item.lineNumber !== "number") {
      errors.push(`Finding ${index}: lineNumber must be a number or null`);
    }
    if (typeof item.description !== "string") {
      errors.push(`Finding ${index}: missing description`);
    }
    if (item.suggestedFix !== null && typeof item.suggestedFix !== "string") {
      errors.push(`Finding ${index}: suggestedFix must be a string or null`);
    }
  }

  if (errors.length > 0) {
    throw new SchemaValidationError(errors);
  }

  return obj as unknown as ReviewReport;
}

export class StructuredOutputPipeline {
  constructor(private readonly provider: MockProvider) {}

  async run(userPrompt: string): Promise<ReviewReport> {
    const response = await this.provider.chat(
      [{ role: "user", content: userPrompt }],
      [],
    );

    const content = response.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("Structured output response was empty");
    }

    const data = JSON.parse(content) as unknown;
    const report = validateReport(data);

    console.log(
      JSON.stringify({
        event: "structured_output_extracted",
        findingCount: report.findings.length,
        recommendation: report.recommendation,
      }),
    );

    return report;
  }
}

export async function main() {
  console.log("═══ Chapter 16: Structured Output ═══\n");

  const provider = new MockProvider(loadFixtures());
  const pipeline = new StructuredOutputPipeline(provider);

  const report = await pipeline.run(
    "Review this diff and extract structured findings.",
  );

  console.log(
    JSON.stringify(
      {
        recommendation: report.recommendation,
        findings: report.findings,
      },
      null,
      2,
    ),
  );

  console.log(`\n── Findings: ${report.findings.length} ──`);
  console.log("\n═══ Done ═══");
}

if (process.env["OPENAGENTION_SKIP_EXAMPLE_MAIN"] !== "true") {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
