# Chapter 10: DAG Scheduling

## Goal

Demonstrate dependency-aware task scheduling using a directed acyclic graph (DAG), with parallel execution of independent tasks and sequential ordering of dependent ones.

## Run

```bash
pnpm example:ch10
pnpm --filter @openagention/examples exec tsx src/ch10/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses in
`src/ch10/index.ts`; there is no live provider branch.

## Expected output

A 5-task DAG executes in 4 batches. The example checks `detectCycle()`
before execution and uses `isStalled()` for runtime no-progress detection.
Tasks 2 and 3 run in parallel after task 1. All task state transitions
are traced.

## Chapter link

[Chapter 10 — DAG Scheduling](../../../docs/course)
