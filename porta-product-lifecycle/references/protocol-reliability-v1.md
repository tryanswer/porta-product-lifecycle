# Protocol Reliability v1

## Purpose

Every lifecycle Adapter follows one explicit evidence chain:

`intent -> admission -> request identity -> mutation -> receipt -> projection -> target observation`

Never collapse adjacent states. The model owns intent classification and local
preparation; the protocol owner admits and mutates; the App/provider owns its
projection; the exact target supplies terminal observation.

## Required invariants

Before mutation:

1. Resolve the concrete object, target, account/user boundary, project/Host,
   Provider session, requested outcome, and current authority.
2. Perform the Adapter's capability and minimum-version handshake. Missing,
   unknown, stale, or incompatible capabilities fail closed; do not imitate an
   unavailable command or silently select a legacy path.
3. Allocate one bounded request identity for one logical mutation. Preserve it
   across transport retries. Never reuse it for changed input.
4. Validate paths, digests, sizes, schemas, privacy boundaries, expiry, and
   target binding before sending mutable work.

During and after mutation:

1. Idempotency is semantic: the exact retry returns the same durable object or
   receipt and produces no duplicate downstream event. Different input under
   the same identity is a conflict.
2. Parse an exact bounded receipt. Unknown fields, wrong identity, wrong
   version, malformed state, or contradictory status fail closed.
3. Treat the receipt as proof only of the mutation boundary it names. Require
   independent readback for Bridge/App projection, provider state, deployment
   health, channel rollout, public availability, device preview, or device save.
4. Preserve the last verified state on timeout, restart, delayed sync, partial
   failure, or stale observation. Resume from durable identity and receipts;
   never rebuild, republish, or create a replacement WorkRun merely because a
   response was lost.
5. For multi-object work, retain per-item identity and results. Partial failure
   must remain visible and retryable without duplicating successful siblings.

## Stability and reporting

- Define terminal success, safe retry, terminal failure, timeout, expiry,
  cancellation, and recovery for every entered Adapter.
- Keep one authoritative owner for each fact. UI code must not reconstruct
  Bridge/provider identity or infer acceptance from strings and local files.
- Log only bounded identifiers, states, reason codes, timings, and digests.
  Never log credentials, absolute private paths, source bytes, or Provider
  transcripts in cross-boundary events.
- Verify the unhappy path proportionate to risk: lost response, duplicate
  retry, conflicting retry, delayed projection, stale target, partial batch,
  restart recovery, and exact-target readback.
- Report verified facts, unresolved states, and next safe action separately.
  “Accepted”, “queued”, “visible in Inbox”, “popup shown”, “previewed”,
  “saved”, “deployed”, and “publicly available” are not synonyms.
