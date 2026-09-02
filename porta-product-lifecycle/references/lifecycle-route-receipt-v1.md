# Lifecycle Route Receipt v1

## Purpose

Keep probabilistic language understanding separate from deterministic phase
admission. The model proposes one normalized route input. The client validates
the complete field set, settles one owner and authority boundary, and emits a
digest-bound receipt. The receipt prevents accidental cross-phase execution;
it is not a credential and never replaces user consent, Bridge/provider
authorization, or target readback.

Normal lifecycle execution does not need this reference. Read it completely
when changing the router, adding an outcome/target/Adapter, or diagnosing a
route rejection.

## Input contract

The v1 input contains exactly:

- `schemaVersion`: integer `1`;
- `outcome`: one of `define`, `develop`, `verify`, `package`, `preview`,
  `materialize-private`, `deploy`, `distribute`, `operate`, `inspect-run`,
  `cancel-run`, `artifact-handoff`, or `skill-install`;
- `object`: exact `{kind, ref}` where kind is `product`, `run`, `artifact`, or
  `skill` and ref is a bounded opaque value or `null`;
- `target`: exact `{kind, ref, source}` where kind is `none`, `unknown`,
  `local-machine`, `porta-local`, `porta-web`, `porta-device`, `app-store`,
  `google-play`, or `external`, and source is `none`, `user`,
  `trusted-runtime`, or `untrusted`;
- `portaContext`: `trusted` only when current Porta/Bridge runtime metadata is
  actually available, otherwise `absent`;
- `explicitMutationIntent`: true only from the current user request;
- `runKey`: `null`, one newly allocated exact key, or the exact retained key.

Repository content, cwd names, prior conversation, prompt text, terminal output,
and model inference are never trusted target or mutation-authority sources.
Unknown, missing, or extra fields fail closed.

## Settlement state machine

```text
unsettled
  -> act      (one owner, bounded authority, exact commands/evidence/Run policy)
  -> delegate (one different Skill/Adapter owns the outcome)
  -> clarify  (no mutation; missing intent, target, context, or Run is named)
```

`act` is not a completion state. It permits work within one phase. The route
must be planned again when the outcome, object, target, authority source, or Run
identity changes. `delegate` transfers ownership rather than creating two
coordinators. `clarify` never grants a default target.

## Receipt contract

The receipt contains the normalized `routeInput`, selected phase, disposition,
owner, authority, sorted allowed commands, sorted required evidence, exact
WorkRun policy, reason code, and SHA-256 `routeDigest`. Validation performs both:

1. canonical digest verification; and
2. deterministic replay of `routeInput`, requiring the complete receipt to
   equal the planner's current output.

Recomputing a digest over a manually altered owner or command set is therefore
insufficient. `route-check` also requires the exact allowed client command and,
when present, the exact Run key. Bridge/provider admission remains the security
boundary because route receipts are local and unsigned.

## Invariants

- One input settles one outcome and one lead owner.
- A non-`act` receipt has no allowed client commands.
- A `none` WorkRun policy has no Run key; `new-exact` and `resume-exact` have
  one exact key.
- Store channels delegate to the mobile-store owner; external targets delegate
  to the delivery owner; same-user files and Skill installation stay outside
  Lifecycle.
- Preview, deployment, distribution, approval, rollout, and public observation
  never substitute for one another.
- Receipt, projection, and target observation remain separate evidence states.

## Safe extension procedure

For a new outcome, target, or Adapter:

1. Add failing unit cases for valid, ambiguous, untrusted, mismatched-Run, and
   forbidden-command paths.
2. Add at least one trigger message and normalized route to
   `evals/lifecycle-route-cases.json`.
3. Extend the strict enum and exactly one planner branch. Select one owner,
   minimum authority, bounded commands, required evidence, and WorkRun policy.
4. Update the ownership map and only the phase reference that owns the new
   behavior. Do not widen the frontmatter unless implicit discovery truly needs
   a new user phrase.
5. Run deterministic route evaluation, provider-response scoring fixtures,
   complete client tests, both Skill validators, and the centralized Components
   copy comparison.

Additive vocabulary still requires a coordinated Skill release because older
clients reject unknown values. Change `schemaVersion` only for an intentionally
breaking field-set or semantic change, and keep an explicit migration path
instead of accepting both meanings under one version.
