import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockProvider } from "@openagention/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCh16Module() {
  vi.stubEnv("OPENAGENTION_SKIP_EXAMPLE_MAIN", "true");
  vi.resetModules();
  return import("../ch16/index.js");
}

describe("Chapter 16 structured output helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates a well-formed review report", async () => {
    const { validateReport } = await loadCh16Module();

    const report = validateReport({
      recommendation: "request_changes",
      findings: [
        {
          severity: "high",
          filePath: "src/app.ts",
          lineNumber: 12,
          description: "Input is not sanitized.",
          suggestedFix: "Validate the request body before use.",
        },
      ],
    });

    expect(report.recommendation).toBe("request_changes");
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.filePath).toBe("src/app.ts");
  });

  it("rejects non-object payloads with SchemaValidationError", async () => {
    const { SchemaValidationError, validateReport } = await loadCh16Module();

    expect(() => validateReport(null)).toThrow(SchemaValidationError);
    expect(() => validateReport(null)).toThrow("Report must be a JSON object");
  });

  it("aggregates detailed validation errors for malformed findings", async () => {
    const { SchemaValidationError, validateReport } = await loadCh16Module();

    expect(() =>
      validateReport({
        recommendation: "ship_it",
        findings: [
          "not-an-object",
          {
            severity: "urgent",
            filePath: 42,
            lineNumber: "10",
            description: false,
            suggestedFix: 123,
          },
        ],
      }),
    ).toThrow(SchemaValidationError);

    try {
      validateReport({
        recommendation: "ship_it",
        findings: [
          "not-an-object",
          {
            severity: "urgent",
            filePath: 42,
            lineNumber: "10",
            description: false,
            suggestedFix: 123,
          },
        ],
      });
    } catch (error) {
      const schemaError = error as InstanceType<typeof SchemaValidationError>;
      expect(schemaError.errors).toEqual(
        expect.arrayContaining([
          "Invalid recommendation value",
          "Finding 0 must be an object",
          "Finding 1: invalid severity",
          "Finding 1: missing filePath",
          "Finding 1: lineNumber must be a number or null",
          "Finding 1: missing description",
          "Finding 1: suggestedFix must be a string or null",
        ]),
      );
    }
  });

  it("StructuredOutputPipeline rejects empty provider responses", async () => {
    const { StructuredOutputPipeline } = await loadCh16Module();
    const pipeline = new StructuredOutputPipeline(
      new MockProvider([{ role: "assistant", content: "   " }]),
    );

    await expect(pipeline.run("review this diff")).rejects.toThrow(
      "Structured output response was empty",
    );
  });

  it("StructuredOutputPipeline logs extraction metadata for valid JSON", async () => {
    const { StructuredOutputPipeline } = await loadCh16Module();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const pipeline = new StructuredOutputPipeline(
      new MockProvider([
        {
          role: "assistant",
          content: JSON.stringify({
            recommendation: "approve",
            findings: [
              {
                severity: "low",
                filePath: "src/main.ts",
                lineNumber: null,
                description: "Consider simplifying this branch.",
                suggestedFix: null,
              },
            ],
          }),
        },
      ]),
    );

    const report = await pipeline.run("extract structured findings");

    expect(report.recommendation).toBe("approve");
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        event: "structured_output_extracted",
        findingCount: 1,
        recommendation: "approve",
      }),
    );
  });
});
