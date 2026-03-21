# Chapter 12: Handoff & Continuation

## Goal

Demonstrate best-effort checkpoint handoff between two agents. Agent A writes code and creates a checkpoint. Agent B restores from the checkpoint and continues.

## Run

```bash
pnpm example:ch12
pnpm --filter @openagention/examples exec tsx src/ch12/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses in
`src/ch12/index.ts`; there is no live provider branch.

## Expected output

Agent A writes code and checkpoints. The handoff restores a lossy
snapshot for Agent B, who continues the task. Three checkpoints and
handoff trace events are recorded.

## Chapter link

[Chapter 12 — Handoff & Continuation](../../../docs/course)
