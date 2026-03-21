# Chapter 20: Observability

## Goal

Demonstrate observability and recovery by simulating seven failure modes,
recording recovery actions, and summarizing metrics and alerts.

## Run

```bash
pnpm example:ch20
pnpm --filter @openagention/examples exec tsx src/ch20/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses and
has no live provider branch. The failures and recoveries are simulated
in-process; they are not live provider outages, a real alerting backend, or a
security boundary.

## Expected output

The example triggers seven failures and seven recoveries, prints the circuit
breaker state, a metrics snapshot, alert-check results, and the total
trace-event count.

## Chapter link

[Chapter 20 — Observability](../../../docs/course)
