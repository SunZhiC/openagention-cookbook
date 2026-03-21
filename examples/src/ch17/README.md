# Chapter 17: Validation-Retry

## Goal

Demonstrate a validation-retry loop with schema and semantic validators plus a
few-shot example bank for calibration.

## Run

```bash
pnpm example:ch17
pnpm --filter @openagention/examples exec tsx src/ch17/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses and
has no live provider branch. The retry loop demonstrates validator feedback
over canned attempts; it is not a guarantee of correctness or a substitute for
source-grounded validation.

## Expected output

The first attempt fails validation, the example prints the blocking errors and
retry feedback, the second attempt passes, and the summary reports validator
names, few-shot example count, and trace-event total.

## Chapter link

[Chapter 17 — Validation-Retry](../../../docs/course)
