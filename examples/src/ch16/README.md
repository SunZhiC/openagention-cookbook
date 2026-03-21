# Chapter 16: Structured Output

## Goal

Demonstrate a structured-output pipeline that parses a fixture-backed JSON code
review report, validates it, and returns typed data.

## Run

```bash
pnpm example:ch16
pnpm --filter @openagention/examples exec tsx src/ch16/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses and
has no live provider branch. The runnable example validates JSON text in
process; it does not exercise a real provider-enforced `tool_choice` round
trip.

## Expected output

The example emits one `structured_output_extracted` JSON log, prints the
validated review report, and reports the total finding count.

## Chapter link

[Chapter 16 — Structured Output](../../../docs/course)
