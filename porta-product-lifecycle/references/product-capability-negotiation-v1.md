# Product Capability Negotiation v1

This contract plans install/release handling for an optional Product Capability
Manifest. The Manifest is a separate strict sidecar. Product Package v1 and v2
remain unchanged; `descriptor.capabilities` remains descriptive metadata and
must not be reinterpreted as a permission request. Never embed the sidecar in a
Product Package.

Negotiation is read-only. It validates and compares declarations but never
installs or activates a capability, grants consent, contacts a Host or Broker,
or creates a WorkRun. A result is not installation, authorization, deployment,
distribution, or release evidence.

## Request and binding

Run `capability-negotiate --spec <json-file>` with a strict request:

```json
{
  "type": "porta-product-capability-negotiation-request",
  "schemaVersion": 1,
  "operation": "install",
  "authority": {
    "installationGeneration": 1,
    "installationRef": "installation_example_12345678",
    "productRef": "product_example_12345678",
    "publisherRef": "publisher_example_12345678",
    "revisionRef": "revision_example_12345678"
  },
  "productPackage": {},
  "manifest": {}
}
```

`operation` is `install` or `release`. `productPackage` is an unchanged strict
Product Package v1 or v2. The Manifest must use the exact Porta Capability
Manifest v1 vocabulary and `capabilityVersion` `1.0.0`. Its Product, Revision,
Publisher, and package digest must match the request. Its `contentDigest` is the
SHA-256 already declared for the canonical primary artifact selected by the
existing Product Package verifier; negotiation does not invent another content
digest algorithm and does not replace package-root byte verification.

Unknown fields, unknown capability versions, duplicate or non-UTF-8-sorted
capabilities, templates, origins, or arguments fail closed. Network and
Messaging are unavailable in this slice. `network.fetch` returns `blocked`;
undeclared vocabulary such as `messaging.send` is invalid. Host APIs, UI
activation, cloud policy, and runtime brokering are outside this contract.

## Consent comparison, not consent authority

When contextual consent applies, the optional `previousConsent` is a strict
candidate receipt with these exact fields:

```text
type, schemaVersion, version, consentRef, consentedAt, hostPolicyRef,
consentDigest, capabilityVersion, manifestDigest, packageDigest,
productRef, publisherRef, revisionRef, installationRef,
installationGeneration
```

The candidate uses type `porta-product-capability-consent-receipt`,
`schemaVersion: 1`, and `version: 1`. `consentDigest` is the SHA-256 of canonical
JSON for the exact receipt fields excluding `consentDigest`. This catches
non-canonical or corrupted candidate data; it is not a signature, attestation,
or proof that a Host granted consent. `hostPolicyRef` remains opaque.

An exact candidate produces `reuse-candidate` and
`host-verification-required`, never `ready` or trusted consent. The result
always says `authorityVerified: false`. The final Host/Broker must authenticate
and revalidate the candidate against its own policy before any activation.
Missing consent, permission expansion or reduction, package drift, Product,
Publisher, Revision, Installation, or install-generation drift requires new
consent. An exact manifest digest is required even when the new scope appears
narrower; a prior receipt is never generalized.

Every result declares `activatesCapabilities: false` and
`createsWorkRun: false`. Installation and release may carry the declaration
forward for a future trusted Host decision, but they never activate it here.

## Reuse decision

This slice reuses the existing Product Package validator, canonical package
digest, and primary-artifact selector, plus Porta's strict Capability Manifest
v1 vocabulary. A narrow pure negotiation module is sufficient for deterministic
binding and comparison. It intentionally does not copy Porta's runtime Broker,
invent a second package schema, or add a dependency: authorization, capability
execution, Network, Messaging, Host UI, and cloud policy remain owned by their
future trusted runtime adapters.
