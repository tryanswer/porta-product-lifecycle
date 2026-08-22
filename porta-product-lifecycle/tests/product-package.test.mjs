import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ProductPackageValidationError,
  validateProductPackage,
} from '../scripts/product-package.mjs'

const sha256 = 'a'.repeat(64)

function basePackage(profile, overrides = {}) {
  return {
    schemaVersion: 1,
    product: {
      id: 'product_example',
      displayName: 'Example',
      version: '1.2.3',
    },
    descriptor: {
      summary: 'A bounded example product.',
      capabilities: ['example.core'],
    },
    profile,
    artifacts: [{
      id: 'artifact_primary',
      kind: profile.kind === 'static-web'
        ? 'static-directory'
        : profile.kind === 'mobile' ? 'mobile-package' : 'executable-file',
      path: profile.kind === 'static-web' ? 'dist' : 'bin/example',
      bytes: 1,
      sha256,
    }],
    validation: {
      checks: [{
        id: 'check_tests',
        kind: 'test',
        status: 'passed',
        evidenceRef: 'ci:test:123',
        observedAt: '2026-08-22T00:00:00.000Z',
      }],
    },
    provenance: {
      builder: { id: 'builder.native', version: '1.0.0' },
      skills: [{ id: 'porta-product-lifecycle', version: '1.0.0' }],
      sourceRevision: 'abcdef1234567890',
    },
    ...overrides,
  }
}

test('validates static Web, local runtime, Android, and iOS package profiles', () => {
  const cases = [
    basePackage({ kind: 'static-web', entryPath: 'index.html', spaFallback: true }),
    basePackage({ kind: 'local-runtime', command: ['node', 'server.mjs'], healthPath: '/health' }),
    basePackage({ kind: 'mobile', platform: 'android', applicationId: 'com.example.app' }),
    basePackage({ kind: 'mobile', platform: 'ios', bundleId: 'com.example.app' }),
  ]

  for (const value of cases) {
    const result = validateProductPackage(value)
    assert.equal(result.package.schemaVersion, 1)
    assert.match(result.digest, /^[a-f0-9]{64}$/)
  }
})

test('validates the supported placement and exposure deployment-target matrix', () => {
  const accepted = [
    ['local-machine', 'loopback'],
    ['local-machine', 'private'],
    ['local-machine', 'public'],
    ['remote-host', 'private'],
    ['remote-host', 'public'],
    ['managed-cloud', 'private'],
    ['managed-cloud', 'public'],
  ]

  for (const [placement, exposure] of accepted) {
    const value = basePackage(
      { kind: 'static-web', entryPath: 'index.html', spaFallback: false },
      { deploymentTarget: { placement, exposure } },
    )
    assert.deepEqual(validateProductPackage(value).package.deploymentTarget, { placement, exposure })
  }

  for (const placement of ['remote-host', 'managed-cloud']) {
    assert.throws(
      () => validateProductPackage(basePackage(
        { kind: 'static-web', entryPath: 'index.html', spaFallback: false },
        { deploymentTarget: { placement, exposure: 'loopback' } },
      )),
      (error) => error instanceof ProductPackageValidationError && error.code === 'invalid_deployment_target',
    )
  }
})

test('distribution is optional and validates channel-specific destinations when present', () => {
  const withoutDistribution = validateProductPackage(
    basePackage({ kind: 'local-runtime', command: ['example'] }),
  )
  assert.equal(Object.hasOwn(withoutDistribution.package, 'distribution'), false)

  const withDistribution = validateProductPackage(basePackage(
    { kind: 'mobile', platform: 'android', applicationId: 'com.example.app' },
    {
      distribution: [
        { channel: 'google-play', track: 'internal' },
        { channel: 'enterprise', audience: 'qa-team' },
      ],
    },
  ))
  assert.equal(withDistribution.package.distribution.length, 2)

  assert.throws(
    () => validateProductPackage(basePackage(
      { kind: 'mobile', platform: 'ios', bundleId: 'com.example.app' },
      { distribution: [{ channel: 'google-play', track: 'internal' }] },
    )),
    (error) => error instanceof ProductPackageValidationError && error.code === 'incompatible_distribution',
  )
})

test('rejects absolute and traversing artifact paths, unknown fields, and mutable artifact digests', () => {
  for (const path of ['/tmp/output', '../secret', 'dist/../../secret']) {
    const value = basePackage({ kind: 'static-web', entryPath: 'index.html', spaFallback: true })
    value.artifacts[0].path = path
    assert.throws(() => validateProductPackage(value), ProductPackageValidationError)
  }

  const unknown = basePackage({ kind: 'local-runtime', command: ['example'] })
  unknown.undeclared = true
  assert.throws(() => validateProductPackage(unknown), ProductPackageValidationError)

  const badDigest = basePackage({ kind: 'local-runtime', command: ['example'] })
  badDigest.artifacts[0].sha256 = 'latest'
  assert.throws(() => validateProductPackage(badDigest), ProductPackageValidationError)
})

test('requires one unambiguous primary artifact for every profile', () => {
  const value = basePackage({ kind: 'static-web', entryPath: 'index.html', spaFallback: true })
  value.artifacts.push({
    ...value.artifacts[0],
    id: 'artifact_secondary',
    path: 'secondary',
  })
  assert.throws(
    () => validateProductPackage(value),
    (error) => error instanceof ProductPackageValidationError && error.code === 'incompatible_artifact',
  )
})
