# Agent Artifact Handoff v1

## Purpose and scope

Use this local-first 2.4.x Adapter when the current Agent needs to hand one
generated file to the same Porta user on the phone. Porta retains one Inbox
record, may show an immediate Terminal popup, verifies the exact bytes before
preview/save, and stores a user-requested download on the device.

This is presentation only. It does not create a WorkRun, Product Package,
deployment, Distribution, public link, cloud artifact, or cross-user message.

## Required flow

1. Establish the current request id, Provider session id, project root, and
   exact file the user asked to receive. Do not select a recent project,
   session, Host, or file by guesswork.
2. Create `<project-root>/.porta/artifacts/<request-id>/` and copy or generate
   the final regular file inside that exact directory. Never publish the source
   tree, a directory, a symlink, a credential, a raw log bundle, or a path
   outside the request directory.
3. Verify the file locally. It must be no larger than 32 MiB. Supported inline
   previews are images, UTF-8 text/Markdown/JSON, and PDF; every accepted file
   remains saveable even when inline preview is unsupported.
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
