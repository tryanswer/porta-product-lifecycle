# Agent Artifact Handoff v1

## Purpose and scope

Use this local-first Adapter when the current Agent needs to hand one
generated file to the same Porta user on the phone. Porta retains one Inbox
record, may show an immediate Terminal popup, verifies the exact bytes before
preview/save, and stores a user-requested download on the device.

This is presentation only. It does not create a WorkRun, Product Package,
deployment, Distribution, public link, cloud artifact, or cross-user message.

## Required flow

1. Establish the current request id, Provider session id, project root, and
   exact file the user asked to receive. Do not select a recent project,
   session, Host, or file by guesswork.
   **One file uses one unique request id.** The request id is a one-shot
   idempotency identity, not a folder or batch name. Never reuse a request id
   for a different file, bytes, Provider/session, title, intent, or turn.
2. Create `<project-root>/.porta/artifacts/<request-id>/` and copy or generate
   the final regular file inside that exact directory. Never publish the source
   tree, a directory, a symlink, a credential, a raw log bundle, or a path
   outside the request directory.
3. Verify the file locally. The original must be no larger than 256 MiB.
   Supported previews are images, UTF-8 text/Markdown/JSON, and PDF. Inline
   reads remain bounded to 16 MiB; large images use Porta's bounded native
   derivative path. Every accepted original remains saveable even when inline
   preview is unsupported.
4. Use the bundled client `artifact-publish` command with the exact cwd, file,
   request, Provider and Provider session. Choose `preview-now` when the user
   asked to see it now; choose `inbox` for durable Inbox delivery without a
   Terminal popup.
5. Accept success only from an exact `artifact-publish` receipt containing an
   opaque artifact reference, byte count, SHA-256, expiry, media type, preview
   kind and revision. The receipt and Inbox event must not contain an absolute
   remote path or file bytes.
6. Tell the user that Porta will preview/save only while the same SSH Host and
   Bridge can resolve the unexpired unchanged revision. Inbox durability does
   not make the file cloud-hosted.

## Multiple files, retry, and evidence

- For N files, create N independent requests and N request-owned directories.
  Publish and report each item independently in the user's requested order. Do
  not invent a batch wire field and do not use one request directory as a
  multi-file container.
- Retry only the exact same request input. A stable retry must return the same
  artifact reference and event id without another Inbox event. A reused request
  id with different input is `artifact_request_conflict`; create a new request
  id only when the user still wants the distinct file delivered.
- A partial failure does not erase successful siblings and does not authorize a
  blanket success claim. Report the per-file publish receipt or exact failure,
  then retry only failed items with their original exact inputs when safe.
- Publish receipt, Inbox projection, immediate or deferred popup, byte-verified
  preview, and device save are five separate evidence states. Claim only those
  observed. `preview-now` is durable presentation intent: if the event arrives
  while another screen is active, Porta may show it later when the exact Host's
  Terminal becomes active. `inbox` never requests that popup.

## Failure and privacy rules

- A missing/incompatible Bridge, escaped path, changed bytes, expired record,
  full retention capacity, malformed receipt, or unsupported Provider fails
  closed. Do not fall back to embedding binary data in chat or publishing a
  public URL.
- Never publish secrets, authentication exports, private keys, environment
  files, Provider transcripts, or an unreviewed diagnostic archive.
- Do not claim phone receipt, preview, or save from the publish receipt. Those
  are separate App/device observations.
- `.porta/` remains runtime state and must not be committed unless the project
  explicitly owns it.
