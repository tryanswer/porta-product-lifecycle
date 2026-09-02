---
name: porta-agent-artifact-handoff
description: Use when the user asks an Agent to send, present, preview, or save generated images, PDFs, text, reports, or other files on the same user's connected Porta phone or Inbox.
---

# Porta Agent Artifact Handoff

## Scope

Own only the same-user presentation handoff of request-selected files. Product
lifecycle changes remain with `$porta-product-lifecycle`; do not broaden a file
request into product work, public sharing, or cross-user messaging.

Read
[references/agent-artifact-handoff-v1.md](references/agent-artifact-handoff-v1.md)
completely before publishing the first file.

## Required flow

1. Resolve the current Provider session, trusted project root, presentation
   intent (`preview-now` or `inbox`), and exact file requested by the user. Do
   not guess from recent projects, sessions, Hosts, or files.
2. Give every file a unique request id and a separate
   `<project-root>/.porta/artifacts/<request-id>/` directory. Copy or generate
   only the final regular file there. Multiple files are independent requests,
   not an invented batch protocol.
3. Verify the bounded file and privacy policy locally. Never hand off a
   symlink, directory, credential, environment file, private key, transcript,
   or unreviewed diagnostic archive.
4. Publish through the compatibility client:

   ```text
   node <skill-directory>/scripts/porta-agent-artifact-handoff.mjs publish --cwd <project-root> --path <request-owned-file> --request <unique-id> --provider <provider> --provider-session-id <session-id> --intent <preview-now|inbox> [--turn-id <id>] [--title <text>]
   ```

   The wrapper delegates the wire protocol to the sibling installed
   `porta-product-lifecycle` client so there is one receipt validator and one
   Bridge contract. If that dependency is missing or incompatible, fail closed
   and report the exact setup problem.
5. Accept only the structured publish receipt. Report publish acceptance,
   Inbox projection, popup presentation, byte-verified preview, and device save
   as separate states. Never claim a later state without its own observation.

## Retry and completion

- Retry only an unchanged request with the same id and exact inputs. Changed
  bytes or metadata require a new request id.
- Preserve successful siblings when one of several files fails; retry only the
  failed requests.
- Inbox durability does not make the bytes cloud-hosted. The same SSH Host and
  compatible Bridge must still resolve the unexpired unchanged revision.
- `.porta/` is runtime state and must not be committed unless the project
  explicitly owns it.
