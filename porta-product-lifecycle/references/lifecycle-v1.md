# Porta Product Lifecycle plan v1

The planner turns a validated Product Package declaration into a deterministic,
read-only stage graph. It does not execute adapters or authorize mutation.

The ordered stages are:

1. `define` — required, definition receipt;
2. `develop-verify` — required, verification receipt;
3. `materialize` — required, Product Package receipt;
4. `deploy` — required only when `deploymentTarget` exists;
5. `distribute` — required only when `distribution` exists;
6. `operate-review-iterate` — required.

Skipped optional stages remain explicit in the plan so a consumer cannot
confuse “not requested” with “forgotten”. Deployment selects an adapter from
`placement-exposure`. Distribution selects one adapter per channel.

Canonical paths include:

| Product intent | Deployment | Distribution |
| --- | --- | --- |
| package only, no deployment target | skipped | skipped |
| local Product Release | `local-machine-loopback` or `local-machine-private` | skipped |
| private service on owned host | `remote-host-private` | skipped |
| public managed Web product | `managed-cloud-public` | `porta-web-release` when declared |
| mobile store candidate | skipped unless separately declared | `google-play` or `app-store` |

Every executing adapter must consume the same verified package digest and
return its own receipt. A deployment receipt reports runtime placement and
readback. A distribution receipt reports channel handoff and channel-specific
state. Submission, approval, rollout, and public availability remain separate.

A planner result never starts a WorkRun. Porta Web distribution may create a
WorkRun only after a current explicit publication intent and Bridge preflight.
Local Product Release registration uses a separate bounded non-publish Product
Work and cannot be represented by a project-specific deployment receipt.
