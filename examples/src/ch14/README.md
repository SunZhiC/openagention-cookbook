# Chapter 14: Automations

## Goal

Demonstrate a trigger-based automation run that loads the testing skill and
executes its tools through `AutomationRunner`.

## Run

```bash
pnpm example:ch14
pnpm --filter @openagention/examples exec tsx src/ch14/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses and
has no live provider branch. The runner here is an in-process trigger demo,
not a durable queue, background daemon, or security boundary.

## Expected output

The example registers one automation, shows its status moving from `idle` to
`completed`, prints `runTests`, `generateTestCase`, and `checkCoverage` tool
calls, and reports the final result with trace-event count.

## Chapter link

[Chapter 14 — Automations](../../../docs/course)
