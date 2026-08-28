# Product Asset Readiness v1

Use this pass before Product Package settlement to make product identity
deliberate without confusing presentation quality with package validity. Logo
and cover work remains product construction; it does not authorize deployment,
distribution, publication, or a new Product Package schema.

## Applicability

Classify each role before creating files:

| Role | Usually applicable | Honest `not-applicable` examples |
| --- | --- | --- |
| Logo | Any end-user-visible product | Internal executable with no product surface |
| Cover | Visual app, site, document, or catalog entry | Headless API, CLI, worker, or device service with no representative screen |
| Screenshot | Product with a renderable user journey | Non-visual runtime or an unbuilt/failed candidate |

Do not generate decorative art merely to turn `not-applicable` into complete.
Asset completeness means every applicable role has a verified result or an
explicit fallback, not that every product has every role.
For an end-user-visible product, the logo role must not be marked
`not-applicable`; absence requires construction/generation or evidenced
fallback. A renderable visual product likewise cannot mark its representative
cover and screenshot `not-applicable` merely to avoid asset work.

## Readiness pass

1. Establish identity. Confirm the display name, user job, product category,
   desired tone, design-system evidence, and any project-owned brand
   constraints. Derive a bounded asset brief from this verified product context;
   do not invent a brand direction from the repository name alone. Do not ask
   the user merely because an asset is missing when the repository already
   provides enough product context to make a safe, reversible construction.
2. Inventory before generating. Search project-owned source, public assets,
   native constructors, metadata, and built output. For Web products prefer an
   explicit project-owned logo, then a local Web App Manifest icon,
   `apple-touch-icon`, and finally a decodable favicon. Inspect references, not
   filenames alone.
3. Reject accidental identity. A starter-template favicon, framework logo,
   dependency mark, sample screenshot, remote hotlink, or unrelated company
   asset is not a product asset unless the project explicitly owns and intends
   it. Do not silently rebrand the product with template residue.
4. Prefer real covers. For a visual product, capture a clean screenshot from
   the exact candidate at a representative state and target viewport. Remove
   secrets, personal data, debug chrome, transient errors, and misleading demo
   content. Record the candidate/revision and capture evidence.
5. Construct every applicable missing asset. After inventory, the model must
   attempt construction or generation rather than immediately selecting a
   fallback. Route a missing logo through an available specialized logo Skill
   and an available image generation capability using the derived brief. For a
   visual cover or screenshot, build or launch the exact candidate and capture
   its representative state first. Generate cover artwork only when an actual
   product screenshot is not the correct representation. Never present
   generated artwork as an exact screenshot. Do not silently install, connect,
   purchase, or grant authority to a generation tool.
6. Inspect generated output. Reject illegible card-size marks, clipped or
   distorted artwork, accidental text, trademark imitation, fake UI, weak
   contrast, unusable transparency, and assets that conflict with the product.
   Preserve aspect ratio. Use the product constructor's native icon and social
   image pipeline instead of hand-copying one raster into every platform slot.
7. Integrate, rebuild, and verify. Put accepted assets through the product
   constructor's native asset pipeline. Confirm that the selected assets are
   referenced by the built product, load locally without a network dependency,
   render at their intended small and large sizes, and belong to the exact
   candidate being materialized.

Fallback is allowed only after the relevant construction or generation
capability is unavailable, an attempted generation fails, or the result is
rejected by inspection. Do not treat ambiguity alone as permission to skip the
attempt when verified product context supports a bounded brief. Stop after a
bounded attempt, retain the verified build, and select the consumer fallback
below; never report a fake success.

## Asset Readiness Receipt

Record a bounded local construction receipt; do not embed it in Bridge events.
For each role record:

- role: `logo`, `cover`, or `screenshot`;
- status: `provided`, `generated`, `fallback`, or `not-applicable`;
- source class: project-owned, exact-candidate capture, generated, or consumer
  fallback;
- generation capability, attempt count, outcome, and bounded failure evidence
  whenever construction/generation was required;
- format, pixel dimensions when raster, and content digest when a file exists;
- candidate/revision evidence for a screenshot;
- validation performed and unresolved limitation.

Do not report presentation readiness as complete while an applicable asset is
still accidental, unverified, remote-only, broken, or falsely represented.
Missing generated artwork does not invalidate an otherwise valid Product
Package v1; report the fallback honestly.

## Product Package boundary

Product Package v1 has no logo, cover, screenshot, presentation manifest, or
asset-role field. A selected Web asset may already be ordinary content inside
the declared `static-directory`; mobile and local-runtime assets remain owned
by their native constructors. The Asset Readiness Receipt is construction
evidence only. It must not add a Product Package field, invent a supplemental
artifact kind, or make a mutable source path part of App identity.

When verified card-ready assets should appear in Porta Products, use
[Product Package v2](product-package-v2.md). V2 binds a compact Logo and optional
cover to declared `presentation-file` artifacts and carries their verified bytes
through the exact candidate. Do not claim v1 will display project-owned imagery.

## Consumer fallback

When no verified presentation asset is available, the consuming App must show
deterministic identity artwork derived from the normalized product display name
and stable product id. Use a readable monogram, semantic theme surface, and the
real product name. Never show a broken image, unrelated template artwork,
random color that changes between sessions, fabricated screenshot, or empty
card hole. A failed image load must converge to the same fallback as a missing
image; it must not change release, installation, access, or package state.
