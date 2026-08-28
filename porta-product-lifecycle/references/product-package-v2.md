# Product Package v2 presentation contract

Product Package v2 is the backward-compatible opt-in contract for delivering
verified card-ready product identity into Porta Products. It does not change
deployment, distribution, approval, or availability semantics.

## When to use v2

Use v2 when an end-user-visible product has a verified project-owned Logo and
optionally a representative cover that should appear in Porta. Continue to
accept v1 packages, but report that Porta will use deterministic identity
fallback because v1 cannot carry presentation assets.

## Descriptor

Set `schemaVersion` to `2`. Add a required `presentation.logo` reference and an
optional `presentation.cover` reference:

```json
{
  "schemaVersion": 2,
  "presentation": {
    "logo": { "artifactId": "presentation_logo" },
    "cover": { "artifactId": "presentation_cover" }
  }
}
```

Each referenced artifact must be a distinct `presentation-file` declaration
with an exact relative path, byte count, SHA-256 digest, and one of these media
types: `image/png`, `image/jpeg`, or `image/webp`. SVG is intentionally excluded
from the card transport because active content and external references must not
cross this boundary.

The Logo is a compact identity mark, not a screenshot. The cover is a clean
representative product state, preferably an exact-candidate screenshot. Never
use a generated image as proof of an exact product UI.

## Bounds

- Logo: at most 128 KiB.
- Cover: at most 384 KiB.
- Combined card-ready assets: at most 512 KiB before Base64 encoding.

These are card delivery variants, not the product's only or original assets.
Keep high-resolution originals in the product-owned asset pipeline and derive
bounded variants without changing aspect ratio.

## Verification and transport

`package-verify` re-reads every presentation file as a singly linked regular
file, verifies its declared bytes, SHA-256, and PNG/JPEG/WebP byte signature,
and emits candidate version 2.
The candidate carries only the bounded verified card variants, their media
types, roles, paths, byte counts, and digests. Bridge and App must verify the
same package and asset identities before retaining or rendering them.

Unknown fields, undeclared files, overlapping artifact paths, unsupported media
types, duplicate roles, digest drift, oversized variants, and a missing v2 Logo
fail closed. Product Package v1 stays valid and continues to render the stable
monogram fallback.
