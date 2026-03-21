# Chapter 11: Review Queue

## Goal

Demonstrate the ReviewQueue state machine with its valid and invalid transitions: enqueue (pending), approve/reject, revise with feedback, and resubmit revised items.

## Run

```bash
pnpm example:ch11
pnpm --filter @openagention/examples exec tsx src/ch11/index.ts
```

## Execution mode

**Offline-only.** This chapter exercises `ReviewQueue` entirely in-process;
there is no provider branch.

## Expected output

Three items are enqueued, one approved, one revised with feedback and
resubmitted, one rejected as terminal, and invalid transitions are
caught with error messages.

## Chapter link

[Chapter 11 — Review Queue](../../../docs/course)
