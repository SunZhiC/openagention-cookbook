# Chapter 19: System Assembly

## Goal

Demonstrate an in-process capstone run that wires together skills, planning,
scheduling, workers, review, and checkpoint creation.

## Run

```bash
pnpm example:ch19
pnpm --filter @openagention/examples exec tsx src/ch19/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses and
has no live provider branch. The assembly demo composes teaching components
in-process; it is not full persistence, real isolation, or a production
deployment.

## Expected output

The example prints a four-step plan, scheduler batches, worker completion
logs, review approvals, a checkpoint ID, and the combined scheduler/review
trace-event count.

## Chapter link

[Chapter 19 — System Assembly](../../../docs/course)
