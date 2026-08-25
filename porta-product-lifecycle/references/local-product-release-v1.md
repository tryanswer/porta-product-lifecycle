# Porta Local Product Release v1

Use this path when a verified Product Package declares `deploymentTarget` with
`placement: "local-machine"` and `exposure: "loopback"` or `"private"`.
Project-native launchd, systemd, browser, simulator, or device evidence may be
useful deployment input, but it is not Porta Local Product Release truth.

## Admission

Bridge Runtime `1.16.5` or newer must advertise
`porta.workflow.product-materialization.v1` and the exact non-publish Product
Work, registration, and status operations. The client discovers the managed
`~/.porta/bin/porta-bridge` launcher before PATH.

Create and retain one Run key, then register the exact verified package:

```text
node <skill-directory>/scripts/porta-product-lifecycle.mjs new-run-key
node <skill-directory>/scripts/porta-product-lifecycle.mjs local-release-register \
  --run-key <same-key> \
  --spec <product-package.json> \
  --package-root <absolute-package-root> \
  --provider <codex|claude|gemini> \
  --provider-session-id <exact-current-session-id> \
  --cwd <exact-project-root>
```

The client re-verifies actual package bytes before mutation, writes one private
recovery journal, begins a `purpose=materialization` Product Work, and obtains a
`product-materialization-registration-receipt`. It reuses exact idempotency
identities after response loss. Reusing the Run key with different Package,
Project, Provider, or Session identity fails closed.

This is not the publication `begin` command. It creates no publish intent, Web
Release candidate, public URL, or Distribution.

## Settlement

Porta App pulls the registered request, verifies current Product Installation
and Project Context, deploys the immutable local target, independently reads it
back, and settles it through Bridge. Check the same operation:

```text
node <skill-directory>/scripts/porta-product-lifecycle.mjs local-release-status \
  --run-key <same-key>
```

Only an exact `local-ready` response whose Package and primary artifact digests
match the retained operation is Local Product Release completion. `pending` and
`recovery` mean the App still has work to reconcile. A project-specific JSON
receipt, HTTP 200, process PID, installed package, or copied Product Package is
not a substitute for the Bridge receipt.

For Static Web, the settled endpoint remains on the Host loopback interface.
The phone must use Porta's read-only presentation flow: Bridge returns the exact
endpoint, Porta creates an SSH local-forward, probes the forwarded URL, and
opens ProductPreviewBrowserView. The Mac's `127.0.0.1` is never a phone URL and
never a shareable Distribution link.

`local-ready` proves Porta can reconcile and present the exact release; it does
not prove that the user opened it on a particular phone. Physical-device
acceptance remains a separate evidence layer.

## Completion report

Report separately:

- Product Package digest and primary artifact digest;
- non-publish Product Work and registration request identity;
- Bridge `local-ready` operation, target and receipt identity;
- deployment placement/exposure and runtime readback;
- App presentation/device acceptance when actually tested;
- Distribution as `not-requested` unless separately authorized.

Never report `portaWorkRunCreated: false` when this admission path created the
bounded non-publish Product Work. State explicitly that no publication WorkRun
or Web Release was created.
