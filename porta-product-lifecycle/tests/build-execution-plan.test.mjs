import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  BuildExecutionValidationError,
  planBuildExecution,
} from '../scripts/build-execution-plan.mjs'
import { writePackageRouteReceipt } from './helpers/lifecycle-route-fixture.mjs'

const clientPath = fileURLToPath(new URL('../scripts/porta-product-lifecycle.mjs', import.meta.url))

function request(route) {
  return { route, schemaVersion: 1 }
}

test('plans local construction without granting Porta source access', () => {
  const plan = planBuildExecution(request({ kind: 'local-machine' }))
  assert.equal(plan.disposition, 'ready')
  assert.equal(plan.adapter, 'project-native-local')
  assert.equal(plan.billingOwner, 'user')
  assert.equal(plan.portaSourceAccess, 'forbidden')
  assert.deepEqual(plan.handoff.requiredEvidence, [
    'builder-readiness',
    'source-revision',
    'product-package-v1',
    'package-root-verification',
  ])
})

test('binds a connected build to one opaque host target', () => {
  const plan = planBuildExecution(request({ kind: 'connected-host', targetRef: 'host_12345678' }))
  assert.equal(plan.route.targetRef, 'host_12345678')
  assert.equal(plan.adapter, 'connected-host-project-native')
  assert.ok(plan.handoff.requiredEvidence.includes('exact-connected-host-readiness'))
})

test('keeps external CI provider-neutral and caller-billed', () => {
  for (const providerId of ['github-actions', 'gitlab-ci', 'gitee', 'jenkins']) {
    const plan = planBuildExecution(request({
      kind: 'external-ci',
      providerId,
      targetRef: `ci_${providerId.replace('-', '_')}_12345678`,
    }))
    assert.equal(plan.route.providerId, providerId)
    assert.equal(plan.adapter, 'external-ci-project-native')
    assert.equal(plan.billingOwner, 'user')
    assert.equal(plan.portaSourceAccess, 'forbidden')
  }
})

test('imports an existing package without requesting source access or a builder', () => {
  const plan = planBuildExecution(request({ kind: 'existing-package', packageRef: 'package_12345678' }))
  assert.equal(plan.adapter, 'product-package-import')
  assert.equal(plan.billingOwner, 'none')
  assert.equal(plan.sourceDisclosure, 'not-required')
  assert.deepEqual(plan.handoff.requiredEvidence, ['product-package-v1', 'package-root-verification'])
})

test('fails closed for unimplemented Porta managed source construction', () => {
  const plan = planBuildExecution(request({ kind: 'porta-managed' }))
  assert.equal(plan.disposition, 'unsupported')
  assert.equal(plan.reasonCode, 'porta-managed-build-unavailable')
  assert.equal(plan.portaSourceAccess, 'required')
})

test('rejects unknown fields and unbound provider targets', () => {
  for (const value of [
    { ...request({ kind: 'local-machine' }), github: true },
    request({ kind: 'connected-host', targetRef: 'short' }),
    request({ kind: 'external-ci', providerId: 'GitHub', targetRef: 'ci_12345678' }),
    request({ kind: 'external-ci', providerId: 'github-actions' }),
  ]) {
    assert.throws(
      () => planBuildExecution(value),
      (error) => error instanceof BuildExecutionValidationError,
    )
  }
})

test('normalization produces one deterministic request digest', () => {
  const left = planBuildExecution({ route: { targetRef: 'host_12345678', kind: 'connected-host' }, schemaVersion: 1 })
  const right = planBuildExecution({ schemaVersion: 1, route: { kind: 'connected-host', targetRef: 'host_12345678' } })
  assert.equal(left.requestDigest, right.requestDigest)
})

test('client command returns a read-only plan without requiring Bridge', async () => {
  const root = await mkdtemp(join(tmpdir(), 'porta-build-execution-plan-'))
  try {
    const specPath = join(root, 'request.json')
    await writeFile(specPath, JSON.stringify(request({ kind: 'local-machine' })))
    const routeReceipt = writePackageRouteReceipt(root)
    const result = spawnSync(process.execPath, [
      clientPath, 'build-execution-plan', '--spec', specPath, '--route-receipt', routeReceipt,
    ], {
      encoding: 'utf8',
      env: { PATH: '' },
    })
    assert.equal(result.status, 0, result.stderr)
    const receipt = JSON.parse(result.stdout)
    assert.equal(receipt.ok, true)
    assert.equal(receipt.type, 'porta-product-lifecycle-build-execution-plan')
    assert.equal(receipt.portaSourceAccess, 'forbidden')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('client preserves bounded validation errors instead of returning an internal failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'porta-build-execution-error-'))
  try {
    const specPath = join(root, 'request.json')
    await writeFile(specPath, JSON.stringify(request({ kind: 'connected-host', targetRef: 'short' })))
    const routeReceipt = writePackageRouteReceipt(root)
    const result = spawnSync(process.execPath, [
      clientPath, 'build-execution-plan', '--spec', specPath, '--route-receipt', routeReceipt,
    ], {
      encoding: 'utf8',
      env: { PATH: '' },
    })
    assert.equal(result.status, 1)
    const receipt = JSON.parse(result.stderr)
    assert.equal(receipt.code, 'invalid_build_execution_request')
    assert.equal(receipt.type, 'porta-product-lifecycle-client-error')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
