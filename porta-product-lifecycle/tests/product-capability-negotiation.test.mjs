import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ProductCapabilityNegotiationError,
  negotiateProductCapabilities,
} from '../scripts/product-capability-negotiation.mjs'
import { validateProductPackage } from '../scripts/product-package.mjs'

const artifactDigest = 'b'.repeat(64)
const clientPath = fileURLToPath(new URL('../scripts/porta-product-lifecycle.mjs', import.meta.url))

function productPackage(schemaVersion = 1) {
  const value = {
    artifacts: [{
      bytes: 1,
      id: 'artifact_primary',
      kind: 'static-directory',
      path: 'dist',
      sha256: artifactDigest,
    }],
    descriptor: { capabilities: ['web.ui'], summary: 'Capability negotiation fixture.' },
    product: { displayName: 'Fixture', id: 'product_fixture', version: '1.0.0' },
    profile: { entryPath: 'index.html', kind: 'static-web', spaFallback: true },
    provenance: {
      builder: { id: 'builder.fixture', version: '1.0.0' },
      skills: [{ id: 'porta-product-lifecycle', version: '1.0.5' }],
      sourceRevision: 'abcdef1234567890',
    },
    schemaVersion,
    validation: {
      checks: [{
        evidenceRef: 'test:capability-negotiation',
        id: 'check_tests',
        kind: 'test',
        observedAt: '2026-08-27T00:00:00.000Z',
        status: 'passed',
      }],
    },
  }
  if (schemaVersion === 2) {
    value.presentation = { logo: { artifactId: 'presentation_logo' } }
    value.artifacts.push({
      bytes: 1,
      id: 'presentation_logo',
      kind: 'presentation-file',
      mediaType: 'image/png',
      path: 'presentation/logo.png',
      sha256: 'c'.repeat(64),
    })
  }
  return value
}

function authority(overrides = {}) {
  return {
    installationGeneration: 7,
    installationRef: 'installation_fixture_12345678',
    productRef: 'product_fixture_12345678',
    publisherRef: 'publisher_fixture_12345678',
    revisionRef: 'revision_fixture_12345678',
    ...overrides,
  }
}

function manifest(product, overrides = {}) {
  const packageDigest = validateProductPackage(product).digest
  return {
    capabilities: [{
      access: 'contextual-consent',
      id: 'notification.self',
      templates: [{
        arguments: [{ name: 'count', required: true, type: 'number' }],
        key: 'fixture.updated',
      }],
    }, {
      access: 'public',
      id: 'storage.local',
      quotaBytes: 262_144,
    }],
    capabilityVersion: '1.0.0',
    contentDigest: artifactDigest,
    packageDigest,
    productRef: 'product_fixture_12345678',
    publisherRef: 'publisher_fixture_12345678',
    revisionRef: 'revision_fixture_12345678',
    schemaVersion: 1,
    type: 'porta-product-capability-manifest',
    ...overrides,
  }
}

function request(overrides = {}) {
  const packageValue = overrides.productPackage ?? productPackage()
  return {
    authority: overrides.authority ?? authority(),
    manifest: overrides.manifest ?? manifest(packageValue),
    operation: overrides.operation ?? 'install',
    productPackage: packageValue,
    schemaVersion: 1,
    type: 'porta-product-capability-negotiation-request',
    ...(overrides.previousConsent ? { previousConsent: overrides.previousConsent } : {}),
  }
}

function consentReceipt(binding) {
  const unsigned = {
    ...binding,
    consentRef: 'consent_fixture_12345678',
    consentedAt: '2026-08-27T00:01:00.000Z',
    hostPolicyRef: 'host_policy_fixture_12345678',
    schemaVersion: 1,
    type: 'porta-product-capability-consent-receipt',
    version: 1,
  }
  return {
    ...unsigned,
    consentDigest: createHash('sha256').update(canonicalJson(unsigned)).digest('hex'),
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

test('negotiates a strict package-bound sidecar without reinterpreting Product Package v1 or v2', () => {
  for (const schemaVersion of [1, 2]) {
    const product = productPackage(schemaVersion)
    const result = negotiateProductCapabilities(request({ productPackage: product }))
    assert.equal(result.package.schemaVersion, schemaVersion)
    assert.equal(result.package.digest, validateProductPackage(product).digest)
    assert.equal(result.manifest.packageDigest, result.package.digest)
    assert.equal(result.consent.disposition, 'required')
  }

  const embedded = { ...productPackage(), capabilityManifest: manifest(productPackage()) }
  assert.throws(() => validateProductPackage(embedded), /unknown|exact|Product Package/u)
})

test('fails closed on unknown capabilityVersion and package/content/authority drift', () => {
  const base = request()
  for (const changed of [
    request({ manifest: { ...base.manifest, capabilityVersion: '2.0.0' } }),
    request({ manifest: { ...base.manifest, packageDigest: 'd'.repeat(64) } }),
    request({ manifest: { ...base.manifest, contentDigest: 'd'.repeat(64) } }),
    request({ authority: authority({ productRef: 'product_other_12345678' }) }),
  ]) {
    assert.throws(
      () => negotiateProductCapabilities(changed),
      (error) => error instanceof ProductCapabilityNegotiationError,
    )
  }
})

test('fails closed on non-canonical or ambiguous strict sidecars', () => {
  const base = request()
  const cases = [
    { ...base.manifest, extra: true },
    { ...base.manifest, capabilities: [base.manifest.capabilities[0], base.manifest.capabilities[0]] },
    { ...base.manifest, capabilities: [...base.manifest.capabilities].reverse() },
    {
      ...base.manifest,
      capabilities: [{
        access: 'contextual-consent',
        id: 'notification.self',
        templates: [{
          arguments: [
            { name: 'count', required: true, type: 'number' },
            { name: 'count', required: false, type: 'number' },
          ],
          key: 'fixture.updated',
        }],
      }],
    },
    {
      ...base.manifest,
      capabilities: [{
        access: 'contextual-consent',
        id: 'notification.self',
        templates: [
          base.manifest.capabilities[0].templates[0],
          base.manifest.capabilities[0].templates[0],
        ],
      }],
    },
  ]
  for (const candidate of cases) {
    assert.throws(
      () => negotiateProductCapabilities(request({ manifest: candidate })),
      (error) => error instanceof ProductCapabilityNegotiationError && error.code === 'invalid_manifest',
    )
  }
})

test('requires re-consent after permission, Revision, or Installation generation drift', () => {
  const initial = negotiateProductCapabilities(request())
  const previousConsent = consentReceipt(initial.consent.binding)
  const exact = negotiateProductCapabilities(request({ previousConsent }))
  assert.equal(exact.status, 'host-verification-required')
  assert.equal(exact.consent.disposition, 'reuse-candidate')
  assert.equal(exact.authorityVerified, false)

  const expandedManifest = structuredClone(request().manifest)
  expandedManifest.capabilities.unshift({ access: 'contextual-consent', id: 'identity.login' })
  const expanded = negotiateProductCapabilities(request({
    manifest: expandedManifest,
    previousConsent,
  }))
  assert.equal(expanded.status, 'consent-required')
  assert.ok(expanded.consent.reasons.includes('permission-scope-changed'))

  const shrunkManifest = structuredClone(request().manifest)
  shrunkManifest.capabilities.pop()
  const shrunk = negotiateProductCapabilities(request({
    manifest: shrunkManifest,
    previousConsent,
  }))
  assert.ok(shrunk.consent.reasons.includes('permission-scope-changed'))

  const changedRevisionAuthority = authority({ revisionRef: 'revision_next_12345678' })
  const changedRevision = negotiateProductCapabilities(request({
    authority: changedRevisionAuthority,
    manifest: { ...request().manifest, revisionRef: changedRevisionAuthority.revisionRef },
    previousConsent,
  }))
  assert.ok(changedRevision.consent.reasons.includes('revision-changed'))

  const changedGeneration = negotiateProductCapabilities(request({
    authority: authority({ installationGeneration: 8 }),
    previousConsent,
  }))
  assert.ok(changedGeneration.consent.reasons.includes('installation-generation-changed'))
})

test('accepts only a strict host consent receipt with an exact canonical digest', () => {
  const initial = negotiateProductCapabilities(request())
  const exact = consentReceipt(initial.consent.binding)
  const planned = negotiateProductCapabilities(request({ previousConsent: exact }))
  assert.equal(planned.status, 'host-verification-required')
  assert.equal(planned.consent.disposition, 'reuse-candidate')
  assert.equal(planned.authorityVerified, false)

  for (const changed of [
    { ...exact, extra: true },
    { ...exact, schemaVersion: 2 },
    { ...exact, version: 2 },
    { ...exact, type: 'other-consent' },
    { ...exact, hostPolicyRef: 'host_policy_other_12345678' },
    { ...exact, consentedAt: 'not-a-timestamp' },
    { ...exact, consentDigest: 'd'.repeat(64) },
  ]) {
    assert.throws(
      () => negotiateProductCapabilities(request({ previousConsent: changed })),
      (error) => error instanceof ProductCapabilityNegotiationError && error.code === 'invalid_consent_receipt',
    )
  }
})

test('keeps Network and Messaging unavailable and never activates capabilities or a WorkRun', () => {
  const networkManifest = structuredClone(request().manifest)
  networkManifest.capabilities.unshift({
    access: 'restricted-domain',
    id: 'network.fetch',
    origins: ['https://api.example.test'],
  })
  const network = negotiateProductCapabilities(request({ manifest: networkManifest }))
  assert.equal(network.status, 'blocked')
  assert.deepEqual(network.unavailableCapabilities, ['network.fetch'])

  const messagingManifest = structuredClone(request().manifest)
  messagingManifest.capabilities.unshift({ access: 'public', id: 'messaging.send' })
  assert.throws(
    () => negotiateProductCapabilities(request({ manifest: messagingManifest })),
    (error) => error instanceof ProductCapabilityNegotiationError && error.code === 'invalid_manifest',
  )

  for (const operation of ['install', 'release']) {
    const result = negotiateProductCapabilities(request({ operation }))
    assert.deepEqual(result.effects, {
      activatesCapabilities: false,
      createsWorkRun: false,
      messaging: 'unavailable',
      network: 'unavailable',
    })
  }
})

test('exposes negotiation as a read-only client command', () => {
  const root = mkdtempSync(join(tmpdir(), 'porta-capability-negotiation-'))
  try {
    const spec = join(root, 'request.json')
    writeFileSync(spec, JSON.stringify(request()))
    const run = spawnSync(process.execPath, [clientPath, 'capability-negotiate', '--spec', spec], {
      encoding: 'utf8',
    })
    assert.equal(run.status, 0, run.stderr)
    const result = JSON.parse(run.stdout)
    assert.equal(result.type, 'porta-product-capability-negotiation')
    assert.equal(result.ok, true)
    assert.equal(result.effects.activatesCapabilities, false)
    assert.equal(result.effects.createsWorkRun, false)
    assert.equal(result.authorityVerified, false)

    const unsupported = request()
    unsupported.manifest.capabilityVersion = '2.0.0'
    writeFileSync(spec, JSON.stringify(unsupported))
    const rejected = spawnSync(process.execPath, [clientPath, 'capability-negotiate', '--spec', spec], {
      encoding: 'utf8',
    })
    assert.equal(rejected.status, 1)
    assert.equal(JSON.parse(rejected.stderr).code, 'unsupported_capability_version')
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
