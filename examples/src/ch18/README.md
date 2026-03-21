# Chapter 18: Provenance & Batch Processing

## Goal

Demonstrate an in-memory `ProvenanceTracker` plus batch processing with
per-item isolation across a small set of files.

## Run

```bash
pnpm example:ch18
pnpm --filter @openagention/examples exec tsx src/ch18/index.ts
```

## Execution mode

**Mock-only.** This chapter uses fixture-backed `MockProvider` responses and
has no live provider branch. Provenance and batch state stay in memory; this
is not durable storage, full provenance persistence, or distributed batching.

## Expected output

The example records two file sources and four claims, flags one unsupported
claim, processes three batch items successfully, and prints summary counts for
confidence levels, batch results, and trace events.

## Chapter link

[Chapter 18 — Provenance & Batch Processing](../../../docs/course)
