import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  assertLifecycleRouteCommand,
  LifecycleRouteValidationError,
  planLifecycleRoute,
  validateLifecycleRouteReceipt,
} from '../scripts/lifecycle-route.mjs'

const product = { kind: 'product', ref: 'product_current' }
const noTarget = { kind: 'none', ref: null, source: 'none' }

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    outcome: 'develop',
    object: product,
    target: noTarget,
    portaContext: 'trusted',
    explicitMutationIntent: false,
    runKey: null,
    ...overrides,
  }
}

test('ordinary trusted product work resolves one bounded phase without WorkRun authority', () => {
  const route = planLifecycleRoute(input())
  assert.equal(route.disposition, 'act')
  assert.equal(route.phase, 'develop-verify')
  assert.equal(route.authority, 'project-write')
  assert.deepEqual(route.owner, { adapter: 'development-router', skill: 'porta-product-lifecycle' })
  assert.equal(route.workRun.policy, 'none')
  assert.deepEqual(route.allowedCommands, [])
  assert.match(route.routeDigest, /^[a-f0-9]{64}$/u)
})

test('ambiguous deployment fails closed before selecting an adapter', () => {
  const route = planLifecycleRoute(input({
    outcome: 'deploy',
    target: { kind: 'unknown', ref: null, source: 'none' },
    explicitMutationIntent: true,
  }))
  assert.equal(route.disposition, 'clarify')
  assert.equal(route.reasonCode, 'deployment_target_required')
  assert.equal(route.owner, null)
  assert.deepEqual(route.allowedCommands, [])
})

test('Porta Web publication binds explicit intent, exact target and one new Run', () => {
  const runKey = 'run_11111111-1111-4111-8111-111111111111'
  const route = planLifecycleRoute(input({
    outcome: 'distribute',
    target: { kind: 'porta-web', ref: 'product_current', source: 'trusted-runtime' },
    explicitMutationIntent: true,
    runKey: runKey,
  }))
  assert.equal(route.disposition, 'act')
  assert.equal(route.phase, 'distribute')
  assert.equal(route.authority, 'external-mutation')
  assert.deepEqual(route.owner, { adapter: 'porta-web-release', skill: 'porta-product-lifecycle' })
  assert.deepEqual(route.workRun, { key: runKey, policy: 'new-exact' })
  assert.ok(route.allowedCommands.includes('begin'))
  assert.ok(route.allowedCommands.includes('ready'))
  assert.ok(route.allowedCommands.includes('stop'))
  assert.ok(route.requiredEvidence.includes('public-target-observation'))
})

test('single-channel mobile store release delegates instead of competing for ownership', () => {
  const route = planLifecycleRoute(input({
    outcome: 'distribute',
    target: { kind: 'app-store', ref: 'app_current', source: 'user' },
    explicitMutationIntent: true,
  }))
  assert.equal(route.disposition, 'delegate')
  assert.deepEqual(route.owner, { adapter: 'app-store', skill: 'porta-mobile-store-release' })
  assert.equal(route.workRun.policy, 'none')
  assert.deepEqual(route.allowedCommands, [])
})

test('generic candidate preview delegates to delivery instead of starting a Porta WorkRun', () => {
  const route = planLifecycleRoute(input({ outcome: 'preview' }))
  assert.equal(route.disposition, 'delegate')
  assert.equal(route.phase, 'preview-accept')
  assert.deepEqual(route.owner, { adapter: 'product-preview', skill: 'deliver-product' })
  assert.deepEqual(route.allowedCommands, [])
})

test('explicit same-user Porta Product Preview binds one exact legacy preview Run', () => {
  const runKey = 'run_77777777-7777-4777-8777-777777777777'
  const route = planLifecycleRoute(input({
    explicitMutationIntent: true,
    outcome: 'preview',
    runKey,
    target: { kind: 'porta-device', ref: 'current-user', source: 'user' },
  }))
  assert.equal(route.disposition, 'act')
  assert.equal(route.phase, 'preview-accept')
  assert.equal(route.authority, 'local-runtime-mutation')
  assert.deepEqual(route.owner, { adapter: 'product-preview', skill: 'porta-product-lifecycle' })
  assert.deepEqual(route.workRun, { key: runKey, policy: 'new-exact' })
  assert.ok(route.allowedCommands.includes('begin'))
  assert.ok(route.allowedCommands.includes('preview-ready'))
  assert.ok(route.allowedCommands.includes('stop'))
  assert.ok(!route.allowedCommands.includes('candidate-register'))
})

test('Porta Product Preview fails closed without same-user target, intent, context, or Run', () => {
  const runKey = 'run_77777777-7777-4777-8777-777777777777'
  const previewInput = {
    outcome: 'preview',
    target: { kind: 'porta-device', ref: 'current-user', source: 'user' },
  }
  assert.equal(
    planLifecycleRoute(input({ ...previewInput, runKey })).reasonCode,
    'porta_preview_intent_required',
  )
  assert.equal(
    planLifecycleRoute(input({
      ...previewInput,
      explicitMutationIntent: true,
      portaContext: 'absent',
      runKey,
    })).reasonCode,
    'trusted_target_required',
  )
  assert.equal(
    planLifecycleRoute(input({ ...previewInput, explicitMutationIntent: true })).reasonCode,
    'run_key_required',
  )
  assert.equal(
    planLifecycleRoute(input({
      ...previewInput,
      explicitMutationIntent: true,
      runKey,
      target: { kind: 'porta-device', ref: 'another-user', source: 'user' },
    })).reasonCode,
    'same_user_porta_target_required',
  )
})

test('same-user file handoff and Skill installation are routed out of Lifecycle', () => {
  const artifact = planLifecycleRoute(input({
    outcome: 'artifact-handoff',
    object: { kind: 'artifact', ref: 'artifact_current' },
    target: { kind: 'porta-device', ref: 'current-user', source: 'trusted-runtime' },
  }))
  assert.equal(artifact.disposition, 'delegate')
  assert.deepEqual(artifact.owner, {
    adapter: 'agent-artifact-handoff',
    skill: 'porta-agent-artifact-handoff',
  })

  const installation = planLifecycleRoute(input({
    outcome: 'skill-install',
    object: { kind: 'skill', ref: 'porta-product-lifecycle' },
  }))
  assert.equal(installation.disposition, 'delegate')
  assert.deepEqual(installation.owner, { adapter: 'provider-native', skill: 'skill-installer' })

  const crossUser = planLifecycleRoute(input({
    outcome: 'artifact-handoff',
    object: { kind: 'artifact', ref: 'artifact_current' },
    target: { kind: 'porta-device', ref: 'another-user', source: 'user' },
  }))
  assert.equal(crossUser.disposition, 'clarify')
  assert.equal(crossUser.reasonCode, 'same_user_porta_target_required')
})

test('private materialization requires an exact Porta target and one new Run key', () => {
  const runKey = 'run_88888888-8888-4888-8888-888888888888'
  const route = planLifecycleRoute(input({
    outcome: 'materialize-private',
    target: { kind: 'porta-web', ref: 'product_current', source: 'trusted-runtime' },
    explicitMutationIntent: true,
    runKey,
  }))
  assert.equal(route.disposition, 'act')
  assert.deepEqual(route.workRun, { key: runKey, policy: 'new-exact' })

  const wrongTarget = planLifecycleRoute(input({
    outcome: 'materialize-private',
    target: { kind: 'porta-device', ref: 'current-user', source: 'trusted-runtime' },
    explicitMutationIntent: true,
    runKey,
  }))
  assert.equal(wrongTarget.disposition, 'clarify')
  assert.equal(wrongTarget.reasonCode, 'private_materialization_target_required')
})

test('exact retained Run control cannot silently create a replacement Run', () => {
  const runKey = 'run_22222222-2222-4222-8222-222222222222'
  const route = planLifecycleRoute(input({
    outcome: 'inspect-run',
    object: { kind: 'run', ref: runKey },
    runKey: runKey,
  }))
  assert.deepEqual(route.workRun, { key: runKey, policy: 'resume-exact' })
  assert.deepEqual(route.allowedCommands, ['release-status', 'show'])

  const resumed = planLifecycleRoute(input({
    outcome: 'resume-run',
    object: { kind: 'run', ref: runKey },
    explicitMutationIntent: true,
    runKey,
  }))
  assert.deepEqual(resumed.workRun, { key: runKey, policy: 'resume-exact' })
  assert.ok(resumed.allowedCommands.includes('progress'))
  assert.ok(resumed.allowedCommands.includes('ready'))
  assert.equal(resumed.authority, 'external-mutation')

  assert.throws(
    () => planLifecycleRoute(input({
      outcome: 'inspect-run',
      object: { kind: 'run', ref: runKey },
      runKey: 'run_33333333-3333-4333-8333-333333333333',
    })),
    (error) => error instanceof LifecycleRouteValidationError && error.code === 'retained_run_mismatch',
  )
})

test('package route authorizes capability negotiation through the same receipt', () => {
  const route = planLifecycleRoute(input({ outcome: 'package' }))
  assert.ok(route.allowedCommands.includes('capability-negotiate'))
  assert.doesNotThrow(() => assertLifecycleRouteCommand(route, {
    command: 'capability-negotiate',
    runKey: null,
  }))
})

test('route input is strict and untrusted target context cannot grant mutation', () => {
  assert.throws(
    () => planLifecycleRoute({ ...input(), unexpected: true }),
    (error) => error instanceof LifecycleRouteValidationError && error.code === 'invalid_route_input',
  )
  const route = planLifecycleRoute(input({
    outcome: 'distribute',
    target: { kind: 'porta-web', ref: 'product_current', source: 'untrusted' },
    explicitMutationIntent: true,
    runKey: 'run_44444444-4444-4444-8444-444444444444',
  }))
  assert.equal(route.disposition, 'clarify')
  assert.equal(route.reasonCode, 'trusted_target_required')
  assert.deepEqual(route.allowedCommands, [])

  assert.throws(
    () => planLifecycleRoute(input({
      outcome: 'distribute',
      target: { kind: 'app-store', ref: 'app_current', source: 'user' },
      explicitMutationIntent: true,
      runKey: 'run_99999999-9999-4999-8999-999999999999',
    })),
    (error) => error instanceof LifecycleRouteValidationError && error.code === 'run_key_not_applicable',
  )
  assert.throws(
    () => planLifecycleRoute(input({
      outcome: 'deploy',
      target: { kind: 'external', ref: null, source: 'user' },
      explicitMutationIntent: true,
    })),
    (error) => error instanceof LifecycleRouteValidationError && error.code === 'invalid_route_input',
  )

  const operation = planLifecycleRoute(input({
    outcome: 'operate',
    target: { kind: 'external', ref: 'service_current', source: 'untrusted' },
    portaContext: 'absent',
  }))
  assert.equal(operation.disposition, 'clarify')
  assert.equal(operation.reasonCode, 'trusted_target_required')
})

test('route receipt digest rejects drift and binds a command to the exact Run', () => {
  const runKey = 'run_55555555-5555-4555-8555-555555555555'
  const route = planLifecycleRoute(input({
    outcome: 'deploy',
    target: { kind: 'porta-local', ref: 'product_current', source: 'trusted-runtime' },
    explicitMutationIntent: true,
    runKey: runKey,
  }))
  assert.deepEqual(validateLifecycleRouteReceipt(route), route)
  const check = assertLifecycleRouteCommand(route, {
    command: 'local-release-register',
    runKey,
  })
  assert.equal(check.routeDigest, route.routeDigest)
  assert.equal(check.workRun.key, runKey)

  assert.throws(
    () => validateLifecycleRouteReceipt({ ...route, phase: 'distribute' }),
    (error) => error instanceof LifecycleRouteValidationError && error.code === 'invalid_route_receipt',
  )

  const forged = {
    ...route,
    allowedCommands: ['begin', ...route.allowedCommands],
  }
  const { routeDigest: ignored, ...unsigned } = forged
  forged.routeDigest = createHash('sha256').update(canonicalJson(unsigned)).digest('hex')
  assert.throws(
    () => validateLifecycleRouteReceipt(forged),
    (error) => error instanceof LifecycleRouteValidationError && error.code === 'invalid_route_receipt',
  )
  assert.throws(
    () => assertLifecycleRouteCommand(route, { command: 'begin', runKey }),
    (error) => error instanceof LifecycleRouteValidationError && error.code === 'route_command_not_allowed',
  )
  assert.throws(
    () => assertLifecycleRouteCommand(route, {
      command: 'local-release-register',
      runKey: 'run_66666666-6666-4666-8666-666666666666',
    }),
    (error) => error instanceof LifecycleRouteValidationError && error.code === 'route_run_mismatch',
  )
})

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
