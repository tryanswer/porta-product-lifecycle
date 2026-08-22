# Build Execution plan v1

Build Execution selects where the project-native constructor runs before a
Product Package exists. GitHub is one optional external CI Provider, not a
Porta prerequisite or a lifecycle state. The planner never checks out source,
runs a constructor, connects to a host, starts CI, uploads an artifact, creates
a WorkRun, or authorizes deployment/distribution.

## Exact request

Unknown fields fail closed. The request is `{schemaVersion:1, route}` with one
exact tagged route:

- `{kind:"local-machine"}` — run the project-native builder on the current
  user-owned machine;
- `{kind:"connected-host", targetRef}` — run it on one already-authorized
  connected host;
- `{kind:"external-ci", providerId, targetRef}` — use one user-owned CI target,
  such as GitHub Actions, GitLab CI, Gitee, Jenkins, or another Adapter;
- `{kind:"existing-package", packageRef}` — skip source construction and verify
  an already-produced Product Package;
- `{kind:"porta-managed"}` — reserved and currently returns
  `unsupported / porta-managed-build-unavailable`.

`providerId` is an extensible lower-case identifier, not a GitHub-specific
enum. `targetRef` and `packageRef` are bounded opaque references. They are not
URLs, credentials, filesystem paths, repository contents, or authorization.

## Privacy and cost ownership

Every currently ready route keeps source authority with the user and sets
`portaSourceAccess=forbidden`:

| Route | Source disclosure | Cost owner | Adapter |
| --- | --- | --- | --- |
| local machine | selected executor only | user | project-native-local |
| connected host | selected executor only | user | connected-host-project-native |
| external CI | selected executor only | user/caller | external-ci-project-native |
| existing package | not required | none | product-package-import |

The external CI Adapter must use the caller's repository, runner, billing,
credentials, and deployment identity. A reusable Porta action/workflow is
implementation code running in that user-owned executor; it does not move the
repository into Porta ownership. Pin it to an exact immutable revision and do
not inherit secrets by default.

`porta-managed` declares that Porta source access would be required, but it is
not ready. Supporting it requires a separately accepted contract for explicit
source disclosure, ephemeral tenant isolation, network and resource limits,
secret handling, deletion evidence, metering, abuse controls, and billing.

## Product Package handoff

All successful construction routes converge on Product Package v1 plus exact
package-root verification. The existing-package route begins at that handoff.
The Build Execution receipt does not replace Product Package provenance: the
package still binds the project-native builder, source revision, Skills,
artifact bytes/tree digest, and validation evidence.

Deployment and Distribution consume the same verified Product Package digest
through their own adapters and receipts. Build location never implies either.
