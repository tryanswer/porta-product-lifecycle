import assert from 'node:assert/strict'
import test from 'node:test'

import { planProductLifecycle } from '../scripts/lifecycle-plan.mjs'

const sha256 = 'b'.repeat(64)

function spec(profile, extras = {}) {
  return {
    schemaVersion: 1,
    product: { id: 'product_example', displayName: 'Example', version: '1.0.0' },
    descriptor: { summary: 'Example lifecycle product.', capabilities: ['example.core'] },
    profile,
    artifacts: [{
      id: 'artifact_primary',
      kind: profile.kind === 'static-web'
        ? 'static-directory'
        : profile.kind === 'mobile' ? 'mobile-package' : 'executable-file',
      path: profile.kind === 'static-web' ? 'dist' : 'build/product',
      bytes: 1,
      sha256,
    }],
    validation: {
      checks: [{ id: 'check_tests', kind: 'test', status: 'passed', evidenceRef: 'test:fixture', observedAt: '2026-08-22T00:00:00.000Z' }],
    },
    provenance: {
      builder: { id: 'builder.fixture', version: '1.0.0' },
      skills: [{ id: 'porta-product-lifecycle', version: '1.0.0' }],
      sourceRevision: 'abcdef1234567890',
    },
    ...extras,
  }
}

test('plans a local-only product without inventing deployment or distribution', () => {
  const result = planProductLifecycle(spec({ kind: 'local-runtime', command: ['product'] }))
  assert.deepEqual(result.stages.map(({ id, disposition }) => [id, disposition]), [
    ['define', 'required'],
    ['develop-verify', 'required'],
    ['materialize', 'required'],
    ['deploy', 'skipped'],
    ['distribute', 'skipped'],
    ['operate-review-iterate', 'required'],
  ])
})

test('plans remote-private deployment independently from distribution', () => {
  const result = planProductLifecycle(spec(
    { kind: 'local-runtime', command: ['product'], healthPath: '/health' },
    { deploymentTarget: { placement: 'remote-host', exposure: 'private' } },
  ))
  assert.equal(result.stages.find(({ id }) => id === 'deploy').adapter, 'remote-host-private')
  assert.equal(result.stages.find(({ id }) => id === 'distribute').disposition, 'skipped')
})

test('plans a managed-public Web release with separate deployment and distribution receipts', () => {
  const result = planProductLifecycle(spec(
    { kind: 'static-web', entryPath: 'index.html', spaFallback: true },
    {
      deploymentTarget: { placement: 'managed-cloud', exposure: 'public' },
      distribution: [{ channel: 'porta-web-release' }],
    },
  ))
  assert.equal(result.stages.find(({ id }) => id === 'deploy').adapter, 'managed-cloud-public')
  assert.deepEqual(result.stages.find(({ id }) => id === 'distribute').adapters, ['porta-web-release'])
  assert.notEqual(
    result.stages.find(({ id }) => id === 'deploy').receiptKind,
    result.stages.find(({ id }) => id === 'distribute').receiptKind,
  )
})

test('plans store distribution without requiring application deployment', () => {
  const result = planProductLifecycle(spec(
    { kind: 'mobile', platform: 'ios', bundleId: 'com.example.product' },
    { distribution: [{ channel: 'app-store', track: 'testflight' }] },
  ))
  assert.equal(result.stages.find(({ id }) => id === 'deploy').disposition, 'skipped')
  assert.deepEqual(result.stages.find(({ id }) => id === 'distribute').adapters, ['app-store'])
})
