# Migration from the publication-only Skill

`porta-product-lifecycle` version `1.0.0` is a new identity. The former
`porta-workflow` installation and its `2.4.x` tags are not source releases of
this Skill and must not be presented as an in-place semver update.

## Input mapping

- An explicit `$porta-workflow` invocation may be explained to the user and
  routed to `$porta-product-lifecycle` only when no old retained run is being
  controlled.
- An old Web publication request maps to lifecycle stages materialize plus
  optional Porta Web distribution. It does not implicitly authorize deployment.
- An old Product Preview request maps to the migration-only Bridge v1 path.
- Installation of the new Skill remains installation-only and starts no WorkRun.

New descriptors, client receipts, Scene claims, WorkRuns, package plans, and
output types must use only the new identity. Do not emit the old id as an alias.

## Retained runs

The new client refuses old client-state identity/version combinations. This is
intentional: changing the Skill id inside a retained WorkRun would create mixed
ownership evidence. Finish/cancel an old retained run with its exact old client
and Run key, or report that it cannot be resumed. Never create a replacement
run merely to make migration appear successful.

## Installation replacement

Install the new Skill from its independently verified repository/tag/SHA into
the new user-level destination. Observe Provider discovery in a new session.
Remove the old installation only after confirming no retained run depends on it
and only with explicit authority for that removal. The new activation helper
does not overwrite or delete the old identity.
