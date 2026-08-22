import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const MAX_SPEC_BYTES = 32 * 1024
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9._-]{2,63}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u

export class BuildExecutionValidationError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = 'BuildExecutionValidationError'
  }
}

export async function readAndPlanBuildExecution(path) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    fail('unreadable_build_execution_request', `Cannot read Build Execution request: ${error.code ?? 'unknown'}`)
  }
  if (Buffer.byteLength(source) > MAX_SPEC_BYTES) {
    fail('oversized_build_execution_request', 'Build Execution request exceeds 32 KiB.')
  }
  let value
  try {
    value = JSON.parse(source)
  } catch {
    fail('invalid_build_execution_json', 'Build Execution request must be valid JSON.')
  }
  return planBuildExecution(value)
}

export function planBuildExecution(value) {
  exactRecord(value, ['route', 'schemaVersion'], 'Build Execution request')
  if (value.schemaVersion !== 1) {
    fail('unsupported_build_execution_schema', 'Build Execution schemaVersion must be 1.')
  }
  const route = validateRoute(value.route)
  const normalized = { route, schemaVersion: 1 }
  return {
    ...planRoute(route),
    requestDigest: createHash('sha256').update(canonicalJson(normalized)).digest('hex'),
    route,
    type: 'porta-product-lifecycle-build-execution-plan',
    version: 1,
  }
}

function planRoute(route) {
  const common = {
    handoff: {
      kind: 'product-package-v1',
      requiredEvidence: ['product-package-v1', 'package-root-verification'],
    },
    sourceAuthority: 'user',
  }
  if (route.kind === 'local-machine') {
    return readyPlan(common, 'project-native-local', ['builder-readiness', 'source-revision'], 'user')
  }
  if (route.kind === 'connected-host') {
    return readyPlan(common, 'connected-host-project-native', [
      'exact-connected-host-readiness',
      'builder-readiness',
      'source-revision',
    ], 'user')
  }
  if (route.kind === 'external-ci') {
    return readyPlan(common, 'external-ci-project-native', [
      'exact-ci-target-readiness',
      'builder-readiness',
      'source-revision',
    ], 'user')
  }
  if (route.kind === 'existing-package') {
    return {
      ...common,
      adapter: 'product-package-import',
      billingOwner: 'none',
      disposition: 'ready',
      sourceDisclosure: 'not-required',
      portaSourceAccess: 'forbidden',
    }
  }
  return {
    ...common,
    adapter: 'porta-managed-build',
    billingOwner: 'porta',
    disposition: 'unsupported',
    reasonCode: 'porta-managed-build-unavailable',
    sourceDisclosure: 'porta-required',
    portaSourceAccess: 'required',
  }
}

function readyPlan(common, adapter, additionalEvidence, billingOwner) {
  return {
    ...common,
    adapter,
    billingOwner,
    disposition: 'ready',
    handoff: {
      ...common.handoff,
      requiredEvidence: [...additionalEvidence, ...common.handoff.requiredEvidence],
    },
    sourceDisclosure: 'selected-executor-only',
    portaSourceAccess: 'forbidden',
  }
}

function validateRoute(value) {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    fail('invalid_build_execution_route', 'Build Execution route must declare a supported kind.')
  }
  if (value.kind === 'local-machine' || value.kind === 'porta-managed') {
    exactRecord(value, ['kind'], `${value.kind} route`)
    return { kind: value.kind }
  }
  if (value.kind === 'connected-host') {
    exactRecord(value, ['kind', 'targetRef'], 'connected-host route')
    return { kind: value.kind, targetRef: opaqueRef(value.targetRef, 'route.targetRef') }
  }
  if (value.kind === 'external-ci') {
    exactRecord(value, ['kind', 'providerId', 'targetRef'], 'external-ci route')
    return {
      kind: value.kind,
      providerId: patternText(value.providerId, PROVIDER_ID_PATTERN, 'route.providerId'),
      targetRef: opaqueRef(value.targetRef, 'route.targetRef'),
    }
  }
  if (value.kind === 'existing-package') {
    exactRecord(value, ['kind', 'packageRef'], 'existing-package route')
    return { kind: value.kind, packageRef: opaqueRef(value.packageRef, 'route.packageRef') }
  }
  fail('invalid_build_execution_route', `Unsupported Build Execution route: ${value.kind}`)
}

function exactRecord(value, required, label) {
  if (!isRecord(value)) fail('invalid_build_execution_request', `${label} must be an object.`)
  const actual = Object.keys(value).sort()
  const expected = [...required].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('invalid_build_execution_request', `${label} fields are invalid.`)
  }
}

function opaqueRef(value, label) {
  return patternText(value, OPAQUE_REF_PATTERN, label)
}

function patternText(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail('invalid_build_execution_request', `${label} is invalid.`)
  }
  return value
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code, message) {
  throw new BuildExecutionValidationError(code, message)
}
