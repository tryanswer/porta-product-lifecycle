# Porta Private Product v1

Use this path when the user wants a verified Static Web Product Package to
become a durable private Product and immutable Product Revision in Porta,
without deployment, Distribution, or a public URL. The descriptor must omit
`distribution`; it must also omit a local deployment target. A bounded
`remote-host` or `managed-cloud` target is accepted only with private exposure,
but this command does not execute that deployment.

## Admission

Bridge Runtime `1.16.6` or newer must advertise the additive Product
Materialization and non-publish Product Work operations. Create and retain one
Run key, settle a `materialize-private` route for that same key, then register
the exact verified package with its unchanged route receipt:

```text
node <skill-directory>/scripts/porta-product-lifecycle.mjs new-run-key
node <skill-directory>/scripts/porta-product-lifecycle.mjs private-product-register \
  --run-key <same-key> \
  --spec <product-package.json> \
  --package-root <absolute-package-root> \
  --provider <codex|claude|gemini> \
  --provider-session-id <exact-current-session-id> \
  --cwd <exact-project-root> \
  --route-receipt <private-materialization-route-receipt.json>
```

The client re-verifies actual package bytes before mutation, writes a private
recovery journal, begins a `purpose=materialization` Product Work, and registers
one create-new materialization request. The same Run key is idempotent only for
the exact Package, Project, Provider, and Provider Session. This path never
creates publication intent, a Web Release candidate, a deployment, a public
Host, or a Distribution.

## Settlement

Porta App pulls the request, verifies the current Product User, Installation,
Project Context, and package bytes, then asks Product Platform to create the
durable Product/Revision and settles the exact identity through Bridge:

```text
node <skill-directory>/scripts/porta-product-lifecycle.mjs private-product-status \
  --run-key <same-key> \
  --route-receipt <private-or-resume-route-receipt.json>
```

Only an exact Bridge `ready` receipt with Product, Revision, product version,
content digest, and Ready time proves private materialization. `pending` and
`recovery` are incomplete. Product Platform is authoritative; the App's local
projection and a Product Package file are not substitutes.

After `ready`, verify the same signed-in account can list and open the Product
in Porta Products and can create an exact Review Intervention for that Revision.
Those physical-device checks remain separate from the Bridge receipt.

## Completion report

Report separately:

- Package and primary artifact digests;
- non-publish Product Work and materialization request;
- Product, Revision, product version, and Ready receipt;
- signed-in App catalog/private viewer/Review evidence when actually tested;
- deployment and Distribution as `not-requested` unless independently run.
