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
3. Verify the file locally and classify it before publishing:
   - Up to 16 MiB, supported images, UTF-8 text/Markdown/JSON, and PDF may use
     the bounded inline preview path.
   - Images larger than 16 MiB and no larger than 256 MiB remain eligible for
     Artifact Handoff. Porta must generate a bounded, native downsampled popup
     preview while the Save action preserves and verifies the exact original
     file. The preview derivative must never replace the saved original.
     The App requests at most a 2048-pixel, 4-MiB JPEG derivative after the
     receipt still identifies the original as `previewKind=image`. PNG and JPEG
     are the portable baseline; other raster formats preview only when the
     current native decoder supports them. If native decoding fails, report the
     preview failure but keep the verified original Save action available.
   - Non-image files larger than 16 MiB and no larger than 256 MiB remain
     saveable but must not be loaded into the App WebView for inline preview.
   - A file larger than 256 MiB is outside Artifact Handoff v1. Route it through
     ordinary SFTP instead; do not publish it, embed it in chat, or manufacture
     a public URL. Ordinary SFTP does not imply an Artifact Handoff popup or
     Inbox record; describe the exact SFTP destination/action separately.
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
- Treat the 16 MiB inline limit, 256 MiB original limit, and native preview
  derivative as separate contracts. Raising a metadata limit never authorizes
  loading the original large file into JavaScript or a WebView.
- Never publish secrets, authentication exports, private keys, environment
  files, Provider transcripts, or an unreviewed diagnostic archive.
- Do not claim phone receipt, preview, or save from the publish receipt. Those
  are separate App/device observations.
- `.porta/` remains runtime state and must not be committed unless the project
  explicitly owns it.
