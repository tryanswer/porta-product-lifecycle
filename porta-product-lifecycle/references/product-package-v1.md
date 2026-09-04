# Product Package v1

Product Package is the immutable handoff contract between a project-native
constructor and Porta lifecycle adapters. It describes what was built, how its
actual bytes are identified, what validation was observed, and which optional
deployment/distribution decisions the user declared. It is not a build system,
runtime attestation, deployment receipt, or distribution receipt.

The Package schema version is independent from its transport snapshot. Current
`package-verify` output emits Materialization Candidate v3 for either Package
schema v1 or v2. Candidate v3 repeats the verified receipt for every declared
artifact in canonical declaration order and retains `primaryArtifact` as an
exact value projection of one receipt; JSON object-key order is not identity.
Consumers must use the complete
closure when materializing a runtime; the primary artifact alone does not prove
that supplemental runtime inputs were delivered. The serialized candidate is
limited to 1 MiB, including receipt manifests and any bounded presentation
variants; verification fails before registration when that aggregate is too
large.

## Exact descriptor

Unknown fields fail closed. The top-level JSON object contains:

| Field | Required | Contract |
| --- | --- | --- |
| `schemaVersion` | yes | exact integer `1` |
| `product` | yes | `{id, displayName, version}` |
| `descriptor` | yes | bounded `summary` and unique `capabilities[]` |
| `profile` | yes | one profile below |
| `artifacts` | yes | 1–32 immutable artifact declarations |
| `validation` | yes | 1–64 passed evidence declarations |
| `provenance` | yes | builder, Skills, and source revision |
| `deploymentTarget` | no | placement and exposure decision |
| `distribution` | no | 1–16 channel destinations when present |

Profiles are exact tagged objects:

- `static-web`: `{kind, entryPath, spaFallback}`;
- `local-runtime`: `{kind, command, healthPath?}`;
- `mobile/android`: `{kind:"mobile", platform:"android", applicationId}`;
- `mobile/ios`: `{kind:"mobile", platform:"ios", bundleId}`.

`local-runtime.command` is untrusted entrypoint metadata. The Product Package
validator, verifier, Skill installer, and lifecycle planner never execute it.
Only an explicitly selected runtime adapter may execute it under that adapter’s
own authorization and isolation contract.

Each artifact is `{id, kind, path, bytes, sha256, mediaType?}`. Paths are
normalized relative POSIX paths and may not overlap. Kinds are
`static-directory`, `executable-file`, and `mobile-package`.
Each profile declares exactly one matching primary artifact: Static Web uses
one `static-directory`, local runtime uses one `executable-file`, and mobile
uses one `mobile-package`. Other non-overlapping artifacts may remain as
supplemental delivery inputs, but they cannot create an ambiguous primary
materialization target.

For a file artifact, `bytes` and `sha256` identify the exact regular-file bytes.
For a directory artifact, `bytes` is the sum of regular-file bytes. Its tree
digest is SHA-256 of these UTF-8 records ordered by relative POSIX path:

```text
relative/path\0byte-count\0file-sha256\n
```

The relative paths are ordered by their raw UTF-8 bytes, not the host locale or
filesystem collation. Directory paths themselves, timestamps, ownership, and modes do not enter the
artifact digest. Empty directories are rejected rather than silently excluded.
Symlinks, hard-linked files, and special files are forbidden.

Validation checks are exact
`{id, kind, status:"passed", evidenceRef, observedAt}` declarations. Kinds are
`build`, `test`, `security`, `device`, or `runtime`. These fields preserve
bounded provenance; they do not make a self-authored claim an external
attestation. Consumers must read the referenced authoritative evidence when the
stage requires it.

Provenance is
`{builder:{id,version}, skills:[{id,version}], sourceRevision}`. It records the
declared constructor and Skill chain without embedding source, logs, secrets,
or environment values.

## Product identity and presentation assets

Product identity is part of construction quality, but Product Package v1 has no
dedicated logo or cover field. Follow
[Product Asset Readiness v1](product-assets-v1.md) before package settlement,
then inspect project-owned assets in this order: an explicit project logo; a
local Web App Manifest icon; an `apple-touch-icon`; then a local favicon that
the target can decode. Preserve the chosen asset's aspect ratio and
transparency, never fetch a remote image as an implicit build dependency, and
never infer branding from an unrelated dependency or template.

When no suitable logo exists, presentation consumers use a deterministic monogram
derived from the normalized product display name, with a stable semantic surface
derived from the product identity. This is an honest fallback, not a generated
brand claim. A cover may use a verified product screenshot tied to the exact
candidate, or an explicit project-owned cover. Do not fabricate a screenshot,
UI state, endorsement, or public availability merely to fill a card.

For the v1 fallback, normalize the display name with Unicode NFKC and trim it.
Split on whitespace, `.`, `_`, and `-`; for two or more non-empty segments use
the first Unicode code point of the first two segments, otherwise use the first
two code points of the normalized name. Apply locale-independent Unicode
uppercase and fall back to `P` only for an empty result. For the visual tone,
start at zero and, for each Unicode code point in the NFKC product id, compute
`hash = (hash * 31 + codePoint) mod 3`; use tone `hash + 1`. Never derive it
from time, randomness, current status, or host. Consumers map the three tones
through their own semantic theme tokens.

A verified screenshot must name the exact candidate/revision and retain its
capture or acceptance evidence reference. Verification of package bytes alone
does not prove screenshot provenance.

The selected Web logo or cover may already live inside the declared
`static-directory` artifact as ordinary application content. Product Package v1
does not create a separate presentation artifact kind. An Agent must not invent a Product Package field or undeclared artifact
for identity artwork. For mobile and local-runtime profiles, keep platform-native identity assets under their
authoritative constructor and let presentation consumers use the fallback until
a later version defines a verified cross-profile asset contract.

The absence of a logo or cover does not invalidate Product Package v1. Report
which source or fallback was selected in bounded construction evidence, not as
a secret-bearing event and not as an end-user error.

## Root verification

Run `package-verify` with the JSON descriptor stored outside the package root.
The verifier:

1. validates the exact descriptor;
2. rejects a symlinked/non-directory/broad filesystem root;
3. walks without following links and rejects special files;
4. rejects undeclared files and overlapping artifact ownership;
5. reads every file with no-follow semantics and checks stable file identity;
6. compares actual bytes and file/tree digests;
7. rescans and compares the exact entry set plus directory/file identity and
   timestamps so additions or replacements during verification fail closed;
8. returns separate descriptor digest and artifact verification receipts.

Each artifact verification receipt includes the exact ordered regular-file
manifest `{path,bytes,sha256}[]` observed under that artifact. This manifest is
safe metadata for the next materialization Adapter; it contains no source file
contents, credentials, commands, or filesystem-absolute paths.

The verification receipt also includes exactly one
`porta-product-materialization-candidate` derived in the same verifier call.
It contains the complete normalized Product Package, its package digest, and
the matching primary artifact receipt. Consumers recompute the canonical
package digest and match the primary declaration to the receipt before any
mutation. They must use this candidate instead of reconstructing a second
Product Package interpretation.

Limits are 256 KiB descriptor, 4,096 files, and 512 MiB package bytes. A
successful receipt proves only the local tree observed during that bounded
read. Deployment/distribution adapters must freeze or re-read the same digest
at their own handoff boundary.

## Deployment and distribution

`deploymentTarget` is `{placement, exposure}`. Placements are `local-machine`,
`remote-host`, and `managed-cloud`. Exposures are `loopback`, `private`, and
`public`; only `local-machine` supports loopback.

`distribution` is optional. Channels are `porta-web-release`, `download`,
`enterprise`, `google-play`, and `app-store`, with optional bounded `track` and
`audience`. Store and Porta Web channels must match the package profile.

Omission is intentional: no deployment target means do not deploy; no
distribution means do not distribute.
