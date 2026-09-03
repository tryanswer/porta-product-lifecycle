import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'

const MAXIMUM_ROUTE_SPEC_BYTES = 64 * 1024
const MAXIMUM_ROUTE_RECEIPT_BYTES = 128 * 1024
const RUN_KEY_PATTERN = /^run_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u
const outcomes = new Set([
  'artifact-handoff',
  'cancel-run',
  'define',
  'deploy',
  'develop',
  'distribute',
  'inspect-run',
  'materialize-private',
  'operate',
  'package',
  'preview',
  'resume-run',
  'skill-install',
  'verify',
])
const objectKinds = new Set(['artifact', 'product', 'run', 'skill'])
const targetKinds = new Set([
  'app-store',
  'external',
  'google-play',
  'local-machine',
  'none',
  'porta-device',
  'porta-local',
  'porta-web',
  'unknown',
])
const targetSources = new Set(['none', 'trusted-runtime', 'untrusted', 'user'])
const portaContexts = new Set(['absent', 'trusted'])
const routeDispositions = new Set(['act', 'clarify', 'delegate'])
const routeAuthorities = new Set([
  'external-mutation',
  'local-runtime-mutation',
  'project-write',
  'read-only',
])
const workRunPolicies = new Set(['new-exact', 'none', 'resume-exact'])
const COMMAND_PATTERN = /^[a-z][a-z0-9-]{0,79}$/u
const ROUTE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/u

export class LifecycleRouteValidationError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export async function readAndPlanLifecycleRoute(path) {
  const value = await readBoundedJson(path, MAXIMUM_ROUTE_SPEC_BYTES, 'route spec')
  return planLifecycleRoute(value)
}

export async function readLifecycleRouteReceipt(path) {
  const value = await readBoundedJson(path, MAXIMUM_ROUTE_RECEIPT_BYTES, 'route receipt')
  return validateLifecycleRouteReceipt(value)
}

export async function readAndCheckLifecycleRoute(path, command, runKey = null) {
  const receipt = await readLifecycleRouteReceipt(path)
  return assertLifecycleRouteCommand(receipt, { command, runKey })
}

export function validateLifecycleRouteReceipt(value) {
  requireExactKeys(value, [
    'allowedCommands',
    'authority',
    'disposition',
    'object',
    'outcome',
    'owner',
    'phase',
    'reasonCode',
    'requiredEvidence',
    'routeDigest',
    'routeInput',
    'schemaVersion',
    'target',
    'type',
    'workRun',
  ], 'route receipt')
  if (value.schemaVersion !== 1 || value.type !== 'porta-product-lifecycle-route-receipt') {
    fail('invalid_route_receipt', 'Route receipt identity is invalid.')
  }
  if (!outcomes.has(value.outcome) || !routeDispositions.has(value.disposition)) {
    fail('invalid_route_receipt', 'Route receipt outcome or disposition is invalid.')
  }
  if (!routeAuthorities.has(value.authority)) {
    fail('invalid_route_receipt', 'Route receipt authority is invalid.')
  }
  const object = normalizeReceiptValue(() => normalizeObject(value.object), 'object')
  const target = normalizeReceiptValue(() => normalizeTarget(value.target), 'target')
  const owner = normalizeReceiptValue(() => normalizeOwner(value.owner), 'owner')
  const workRun = normalizeReceiptValue(() => normalizeWorkRun(value.workRun), 'workRun')
  const allowedCommands = normalizeStringSet(value.allowedCommands, COMMAND_PATTERN, 'allowedCommands')
  const requiredEvidence = normalizeStringSet(value.requiredEvidence, ROUTE_IDENTIFIER_PATTERN, 'requiredEvidence')
  if (typeof value.phase !== 'string' || !ROUTE_IDENTIFIER_PATTERN.test(value.phase)) {
    fail('invalid_route_receipt', 'Route receipt phase is invalid.')
  }
  if (typeof value.reasonCode !== 'string' || !ROUTE_IDENTIFIER_PATTERN.test(value.reasonCode)) {
    fail('invalid_route_receipt', 'Route receipt reasonCode is invalid.')
  }
  if (value.disposition !== 'act' && allowedCommands.length !== 0) {
    fail('invalid_route_receipt', 'A non-act route cannot allow client commands.')
  }
  const normalized = {
    allowedCommands,
    authority: value.authority,
    disposition: value.disposition,
    object,
    outcome: value.outcome,
    owner,
    phase: value.phase,
    reasonCode: value.reasonCode,
    requiredEvidence,
    routeInput: normalizeReceiptInput(value.routeInput),
    schemaVersion: 1,
    target,
    type: value.type,
    workRun,
  }
  const digest = createHash('sha256').update(canonicalJson(normalized)).digest('hex')
  if (typeof value.routeDigest !== 'string' || value.routeDigest !== digest) {
    fail('invalid_route_receipt', 'Route receipt digest does not match its contents.')
  }
  const receipt = { ...normalized, routeDigest: digest }
  let expected
  try {
    expected = planLifecycleRoute(receipt.routeInput)
  } catch {
    fail('invalid_route_receipt', 'Route receipt input cannot produce a valid route.')
  }
  if (canonicalJson(receipt) !== canonicalJson(expected)) {
    fail('invalid_route_receipt', 'Route receipt does not match deterministic route planning.')
  }
  return expected
}

export function assertLifecycleRouteCommand(receipt, { command, runKey = null }) {
  const normalized = validateLifecycleRouteReceipt(receipt)
  if (normalized.disposition !== 'act') {
    fail('route_not_actionable', 'Route disposition does not authorize phase commands.')
  }
  if (typeof command !== 'string' || !COMMAND_PATTERN.test(command)) {
    fail('invalid_route_check', 'Route command is invalid.')
  }
  if (!normalized.allowedCommands.includes(command)) {
    fail('route_command_not_allowed', 'Command is not allowed by this route receipt.')
  }
  if (normalized.workRun.key !== null) {
    if (runKey !== normalized.workRun.key) {
      fail('route_run_mismatch', 'Command Run key does not match the route receipt.')
    }
  } else if (runKey !== null) {
    fail('route_run_mismatch', 'This route receipt does not authorize a Run key.')
  }
  return {
    authority: normalized.authority,
    command,
    ok: true,
    owner: normalized.owner,
    routeDigest: normalized.routeDigest,
    type: 'porta-product-lifecycle-route-check',
    workRun: normalized.workRun,
  }
}

export function planLifecycleRoute(value) {
  const input = normalizeInput(value)

  if (input.outcome === 'skill-install') {
    requireObjectKind(input, 'skill')
    requireNoRunKey(input)
    requireNoTarget(input)
    return settle(input, {
      disposition: 'delegate',
      phase: 'outside-lifecycle',
      authority: 'read-only',
      owner: { adapter: 'provider-native', skill: 'skill-installer' },
      reasonCode: 'owned_by_skill_installer',
    })
  }

  if (input.outcome === 'artifact-handoff') {
    requireObjectKind(input, 'artifact')
    requireNoRunKey(input)
    if (input.target.kind !== 'porta-device' || input.target.ref !== 'current-user') {
      return clarify(input, 'same_user_porta_target_required')
    }
    if (!hasTrustedTarget(input)) return clarify(input, 'trusted_target_required')
    return settle(input, {
      disposition: 'delegate',
      phase: 'outside-lifecycle',
      authority: 'read-only',
      owner: { adapter: 'agent-artifact-handoff', skill: 'porta-agent-artifact-handoff' },
      reasonCode: 'owned_by_artifact_handoff',
    })
  }

  if (['inspect-run', 'cancel-run', 'resume-run'].includes(input.outcome)) {
    return planRetainedRun(input)
  }

  requireObjectKind(input, 'product')

  if (['define', 'develop', 'verify', 'package', 'preview'].includes(input.outcome)) {
    return planProductWork(input)
  }
  if (input.outcome === 'materialize-private') return planPrivateMaterialization(input)
  if (input.outcome === 'deploy') return planDeployment(input)
  if (input.outcome === 'distribute') return planDistribution(input)
  if (input.outcome === 'operate') return planOperation(input)
  fail('unsupported_route', 'The requested lifecycle outcome is not supported.')
}

function normalizeInput(value) {
  requireExactKeys(value, [
    'explicitMutationIntent',
    'object',
    'outcome',
    'portaContext',
    'runKey',
    'schemaVersion',
    'target',
  ], 'route input')
  if (value.schemaVersion !== 1) fail('invalid_route_input', 'Route schemaVersion must be 1.')
  if (!outcomes.has(value.outcome)) fail('invalid_route_input', 'Route outcome is invalid.')
  if (!portaContexts.has(value.portaContext)) fail('invalid_route_input', 'Porta context is invalid.')
  if (typeof value.explicitMutationIntent !== 'boolean') {
    fail('invalid_route_input', 'explicitMutationIntent must be boolean.')
  }
  const object = normalizeObject(value.object)
  const target = normalizeTarget(value.target)
  const runKey = value.runKey === null
    ? null
    : requireRunKey(value.runKey, 'runKey')
  return {
    explicitMutationIntent: value.explicitMutationIntent,
    object,
    outcome: value.outcome,
    portaContext: value.portaContext,
    runKey,
    schemaVersion: 1,
    target,
  }
}

function normalizeObject(value) {
  requireExactKeys(value, ['kind', 'ref'], 'route object')
  if (!objectKinds.has(value.kind)) fail('invalid_route_input', 'Route object kind is invalid.')
  return { kind: value.kind, ref: normalizeRef(value.ref, 'Route object ref') }
}

function normalizeTarget(value) {
  requireExactKeys(value, ['kind', 'ref', 'source'], 'route target')
  if (!targetKinds.has(value.kind)) fail('invalid_route_input', 'Route target kind is invalid.')
  if (!targetSources.has(value.source)) fail('invalid_route_input', 'Route target source is invalid.')
  const ref = value.kind === 'porta-local'
    ? normalizePortaHostRef(value.ref)
    : normalizeRef(value.ref, 'Route target ref')
  if (value.kind === 'none' && (ref !== null || value.source !== 'none')) {
    fail('invalid_route_input', 'A none target cannot carry a ref or authority source.')
  }
  if (value.kind === 'unknown' && (ref !== null || value.source !== 'none')) {
    fail('invalid_route_input', 'An unknown target cannot carry a ref or authority source.')
  }
  if (
    value.kind !== 'none' && value.kind !== 'unknown' &&
    (ref === null || value.source === 'none')
  ) {
    fail('invalid_route_input', 'A concrete target requires an exact ref and authority source.')
  }
  return { kind: value.kind, ref, source: value.source }
}

function normalizeOwner(value) {
  if (value === null) return null
  requireExactKeys(value, ['adapter', 'skill'], 'route owner')
  const adapter = normalizeRef(value.adapter, 'Route owner adapter')
  const skill = normalizeRef(value.skill, 'Route owner skill')
  if (adapter === null || skill === null) fail('invalid_route_receipt', 'Route owner is invalid.')
  return { adapter, skill }
}

function normalizeWorkRun(value) {
  requireExactKeys(value, ['key', 'policy'], 'route workRun')
  if (!workRunPolicies.has(value.policy)) fail('invalid_route_receipt', 'Route WorkRun policy is invalid.')
  const key = value.key === null ? null : requireRunKey(value.key, 'Route WorkRun key')
  if ((value.policy === 'none') !== (key === null)) {
    fail('invalid_route_receipt', 'Route WorkRun key and policy are inconsistent.')
  }
  return { key, policy: value.policy }
}

function normalizeReceiptInput(value) {
  try {
    return normalizeInput(value)
  } catch {
    fail('invalid_route_receipt', 'Route receipt input is invalid.')
  }
}

function normalizeReceiptValue(callback, label) {
  try {
    return callback()
  } catch {
    fail('invalid_route_receipt', `Route receipt ${label} is invalid.`)
  }
}

function normalizeStringSet(value, pattern, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !pattern.test(entry))) {
    fail('invalid_route_receipt', `Route receipt ${label} is invalid.`)
  }
  const normalized = [...new Set(value)].sort()
  if (normalized.length !== value.length || normalized.some((entry, index) => entry !== value[index])) {
    fail('invalid_route_receipt', `Route receipt ${label} must be unique and sorted.`)
  }
  return normalized
}

function planProductWork(input) {
  if (input.outcome === 'preview') {
    if (input.target.kind === 'porta-device') {
      if (input.target.ref !== 'current-user') return clarify(input, 'same_user_porta_target_required')
      if (!input.explicitMutationIntent) return clarify(input, 'porta_preview_intent_required')
      if (!hasTrustedTarget(input)) return clarify(input, 'trusted_target_required')
      if (!input.runKey) return clarify(input, 'run_key_required')
      return settle(input, {
        disposition: 'act',
        phase: 'preview-accept',
        authority: 'local-runtime-mutation',
        owner: { adapter: 'product-preview', skill: 'porta-product-lifecycle' },
        allowedCommands: [
          'attention', 'begin', 'fail', 'manifest', 'preview-ready', 'preview-start',
          'progress', 'ready', 'show', 'stop',
        ],
        requiredEvidence: ['exact-preview-candidate', 'target-preview-observation'],
        reasonCode: 'route_ready',
        workRun: { key: input.runKey, policy: 'new-exact' },
      })
    }
    requireNoRunKey(input)
    return settle(input, {
      disposition: 'delegate',
      phase: 'preview-accept',
      authority: 'local-runtime-mutation',
      owner: { adapter: 'product-preview', skill: 'deliver-product' },
      requiredEvidence: ['exact-preview-candidate', 'target-preview-observation'],
      reasonCode: 'owned_by_delivery_adapter',
    })
  }
  requireNoRunKey(input)
  requireNoTarget(input)
  const definitions = {
    define: {
      authority: 'read-only',
      commands: [],
      evidence: ['accepted-product-scope'],
      owner: { adapter: 'definition-router', skill: 'porta-product-lifecycle' },
      phase: 'define',
    },
    develop: {
      authority: 'project-write',
      commands: [],
      evidence: ['verified-source-change', 'requested-journey-evidence'],
      owner: { adapter: 'development-router', skill: 'porta-product-lifecycle' },
      phase: 'develop-verify',
    },
    verify: {
      authority: 'read-only',
      commands: [],
      evidence: ['requested-journey-evidence'],
      owner: { adapter: 'verification-router', skill: 'porta-product-lifecycle' },
      phase: 'develop-verify',
    },
    package: {
      authority: 'project-write',
      commands: [
        'build-execution-plan',
        'capability-negotiate',
        'lifecycle-plan',
        'package-validate',
        'package-verify',
      ],
      evidence: ['product-package-receipt'],
      owner: { adapter: 'product-package', skill: 'porta-product-lifecycle' },
      phase: 'materialize',
    },
  }
  const definition = definitions[input.outcome]
  return settle(input, {
    disposition: 'act',
    phase: definition.phase,
    authority: definition.authority,
    owner: definition.owner,
    allowedCommands: definition.commands,
    requiredEvidence: definition.evidence,
    reasonCode: 'route_ready',
  })
}

function planPrivateMaterialization(input) {
  if (!input.explicitMutationIntent) {
    return clarify(input, 'private_materialization_intent_required')
  }
  if (input.target.kind !== 'porta-web') return clarify(input, 'private_materialization_target_required')
  if (!hasTrustedTarget(input)) return clarify(input, 'trusted_target_required')
  if (!input.runKey) return clarify(input, 'run_key_required')
  return settle(input, {
    disposition: 'act',
    phase: 'materialize',
    authority: 'external-mutation',
    owner: { adapter: 'private-product', skill: 'porta-product-lifecycle' },
    allowedCommands: ['private-product-register', 'private-product-status'],
    requiredEvidence: ['product-platform-product', 'product-platform-revision'],
    reasonCode: 'route_ready',
    workRun: { key: input.runKey, policy: 'new-exact' },
  })
}

function planDeployment(input) {
  if (input.target.kind === 'none' || input.target.kind === 'unknown') {
    return clarify(input, 'deployment_target_required')
  }
  if (!input.explicitMutationIntent) return clarify(input, 'deployment_intent_required')
  if (input.target.source === 'untrusted') return clarify(input, 'trusted_target_required')
  if (input.target.kind === 'porta-local' || input.target.kind === 'local-machine') {
    if (!hasTrustedTarget(input)) return clarify(input, 'trusted_target_required')
    if (!input.runKey) return clarify(input, 'run_key_required')
    return settle(input, {
      disposition: 'act',
      phase: 'deploy',
      authority: 'external-mutation',
      owner: { adapter: 'local-product-release', skill: 'porta-product-lifecycle' },
      allowedCommands: ['local-release-register', 'local-release-status'],
      requiredEvidence: ['bridge-local-ready', 'target-runtime-health', 'porta-access-readback'],
      reasonCode: 'route_ready',
      workRun: { key: input.runKey, policy: 'new-exact' },
    })
  }
  if (input.target.kind === 'external') {
    requireNoRunKey(input)
    return settle(input, {
      disposition: 'delegate',
      phase: 'deploy',
      authority: 'external-mutation',
      owner: { adapter: 'target-specific', skill: 'deliver-product' },
      requiredEvidence: ['target-runtime-health', 'independent-deployment-readback'],
      reasonCode: 'owned_by_delivery_adapter',
    })
  }
  return clarify(input, 'deployment_target_incompatible')
}

function planDistribution(input) {
  if (input.target.kind === 'none' || input.target.kind === 'unknown') {
    return clarify(input, 'distribution_target_required')
  }
  if (!input.explicitMutationIntent) return clarify(input, 'distribution_intent_required')
  if (input.target.source === 'untrusted') return clarify(input, 'trusted_target_required')
  if (input.target.kind === 'app-store' || input.target.kind === 'google-play') {
    requireNoRunKey(input)
    return settle(input, {
      disposition: 'delegate',
      phase: 'distribute',
      authority: 'external-mutation',
      owner: { adapter: input.target.kind, skill: 'porta-mobile-store-release' },
      requiredEvidence: ['provider-object', 'provider-readback', 'channel-availability-observation'],
      reasonCode: 'owned_by_mobile_store_release',
    })
  }
  if (input.target.kind === 'porta-web') {
    if (!hasTrustedTarget(input)) return clarify(input, 'trusted_target_required')
    if (!input.runKey) return clarify(input, 'run_key_required')
    return settle(input, {
      disposition: 'act',
      phase: 'distribute',
      authority: 'external-mutation',
      owner: { adapter: 'porta-web-release', skill: 'porta-product-lifecycle' },
      allowedCommands: [
        'attention', 'begin', 'cancel', 'candidate-register', 'fail', 'manifest',
        'preview-ready', 'preview-start', 'progress', 'ready', 'release-status', 'show', 'stop',
      ],
      requiredEvidence: [
        'bridge-publication-receipt', 'provider-release-readback', 'public-target-observation',
      ],
      reasonCode: 'route_ready',
      workRun: { key: input.runKey, policy: 'new-exact' },
    })
  }
  if (input.target.kind === 'external') {
    requireNoRunKey(input)
    return settle(input, {
      disposition: 'delegate',
      phase: 'distribute',
      authority: 'external-mutation',
      owner: { adapter: 'target-specific', skill: 'deliver-product' },
      requiredEvidence: ['provider-object', 'provider-readback', 'channel-availability-observation'],
      reasonCode: 'owned_by_distribution_adapter',
    })
  }
  return clarify(input, 'distribution_target_incompatible')
}

function planOperation(input) {
  requireNoRunKey(input)
  if (input.target.kind === 'none' || input.target.kind === 'unknown') {
    return clarify(input, 'operation_target_required')
  }
  if (input.target.source === 'untrusted') return clarify(input, 'trusted_target_required')
  return settle(input, {
    disposition: 'delegate',
    phase: 'operate-iterate',
    authority: 'read-only',
    owner: { adapter: 'product-operations', skill: 'operations-analytics' },
    requiredEvidence: ['current-health', 'current-cost', 'current-adoption'],
    reasonCode: 'owned_by_product_operations',
  })
}

function planRetainedRun(input) {
  requireObjectKind(input, 'run')
  requireNoTarget(input)
  const objectRunKey = requireRunKey(input.object.ref, 'Run object ref')
  if (!input.runKey) fail('retained_run_required', 'Exact retained Run key is required.')
  if (objectRunKey !== input.runKey) {
    fail('retained_run_mismatch', 'Run object and retained Run key must match exactly.')
  }
  if (input.outcome === 'cancel-run' && !input.explicitMutationIntent) {
    return clarify(input, 'run_cancellation_intent_required')
  }
  if (input.outcome === 'resume-run' && !input.explicitMutationIntent) {
    return clarify(input, 'run_resume_intent_required')
  }
  const resumeCommands = [
    'attention', 'cancel', 'candidate-register', 'fail', 'manifest', 'preview-ready',
    'preview-start', 'progress', 'ready', 'release-status', 'show', 'stop',
  ]
  return settle(input, {
    disposition: 'act',
    phase: 'retained-run-control',
    authority: input.outcome === 'inspect-run' ? 'read-only' : 'external-mutation',
    owner: { adapter: 'exact-retained-run', skill: 'porta-product-lifecycle' },
    allowedCommands: input.outcome === 'cancel-run'
      ? ['cancel', 'stop']
      : input.outcome === 'resume-run'
        ? resumeCommands
        : ['release-status', 'show'],
    requiredEvidence: ['exact-run-receipt'],
    reasonCode: 'route_ready',
    workRun: { key: objectRunKey, policy: 'resume-exact' },
  })
}

function clarify(input, reasonCode) {
  return settle(input, {
    disposition: 'clarify',
    phase: 'unresolved',
    authority: 'read-only',
    owner: null,
    reasonCode,
  })
}

function settle(input, value) {
  const receipt = {
    allowedCommands: [...(value.allowedCommands ?? [])].sort(),
    authority: value.authority,
    disposition: value.disposition,
    object: input.object,
    outcome: input.outcome,
    owner: value.owner,
    phase: value.phase,
    reasonCode: value.reasonCode,
    requiredEvidence: [...(value.requiredEvidence ?? [])].sort(),
    routeInput: input,
    schemaVersion: 1,
    target: input.target,
    type: 'porta-product-lifecycle-route-receipt',
    workRun: value.workRun ?? { key: null, policy: 'none' },
  }
  return { ...receipt, routeDigest: createHash('sha256').update(canonicalJson(receipt)).digest('hex') }
}

function hasTrustedTarget(input) {
  return input.portaContext === 'trusted' && input.target.ref !== null &&
    ['trusted-runtime', 'user'].includes(input.target.source)
}

function requireObjectKind(input, kind) {
  if (input.object.kind !== kind || input.object.ref === null) {
    fail('invalid_route_input', `${input.outcome} requires a ${kind} object.`)
  }
}

function requireNoRunKey(input) {
  if (input.runKey !== null) {
    fail('run_key_not_applicable', 'This route outcome does not accept a Porta WorkRun key.')
  }
}

function requireNoTarget(input) {
  if (input.target.kind !== 'none') {
    fail('target_not_applicable', 'This route outcome does not accept a lifecycle target.')
  }
}

function normalizeRef(value, label) {
  if (value === null) return null
  if (typeof value !== 'string' || !REF_PATTERN.test(value)) {
    fail('invalid_route_input', `${label} is invalid.`)
  }
  return value
}

function normalizePortaHostRef(value) {
  if (value === null) return null
  if (!isPortaHostId(value)) fail('invalid_route_input', 'Route target Host ref is invalid.')
  return value
}

export function isPortaHostId(value) {
  return typeof value === 'string' &&
    value.length >= 1 && value.length <= 256 &&
    value === value.trim().normalize('NFC') &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 31 || codePoint === 127
    })
}

function requireRunKey(value, label) {
  if (typeof value !== 'string' || !RUN_KEY_PATTERN.test(value)) {
    fail('invalid_route_input', `${label} is invalid.`)
  }
  return value
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    fail('invalid_route_spec', `${label} is required.`)
  }
  return value
}

async function readBoundedJson(path, maximumBytes, label) {
  const absolute = resolve(requireText(path, `${label} path`))
  const descriptor = await open(
    absolute,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  ).catch(() => null)
  if (!descriptor) {
    fail(`invalid_${label.replaceAll(' ', '_')}`, `${capitalize(label)} must be one bounded regular file.`)
  }
  try {
    const info = await descriptor.stat().catch(() => null)
    if (!info?.isFile() || info.size > maximumBytes) {
      fail(`invalid_${label.replaceAll(' ', '_')}`, `${capitalize(label)} must be one bounded regular file.`)
    }
    const source = await descriptor.readFile('utf8').catch(() => null)
    if (source === null) {
      fail(`invalid_${label.replaceAll(' ', '_')}`, `${capitalize(label)} must be readable.`)
    }
    try {
      return JSON.parse(source)
    } catch {
      fail(`invalid_${label.replaceAll(' ', '_')}`, `${capitalize(label)} must contain one valid JSON object.`)
    }
  } finally {
    await descriptor.close().catch(() => undefined)
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function requireExactKeys(value, keys, label) {
  if (!isRecord(value)) fail('invalid_route_input', `${label} must be an object.`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('invalid_route_input', `${label} has an invalid field set.`)
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function fail(code, message) {
  throw new LifecycleRouteValidationError(code, message)
}
