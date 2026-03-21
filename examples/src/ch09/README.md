# Chapter 9: Supervisor-Worker Pattern

## Goal

Demonstrate the supervisor-worker multi-agent pattern where a supervisor decomposes a goal into sub-tasks and dispatches independent workers to execute each one.

## Run

```bash
pnpm example:ch9
pnpm --filter @openagention/examples exec tsx src/ch09/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses in
`src/ch09/index.ts`; there is no live provider branch.

## Expected output

The supervisor creates 3 sub-tasks, dispatches workers concurrently, and produces a summary. Trace captures state changes and messages.

## Chapter link

[Chapter 9 — Supervisor-Worker Pattern](../../../docs/course)
