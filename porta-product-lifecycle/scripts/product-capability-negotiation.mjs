import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import {
  selectValidatedProductPackagePrimaryArtifact,
  validateProductPackage,
} from './product-package.mjs'

const MAXIMUM_REQUEST_BYTES = 1024 * 1024
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/u
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u
const SUPPORTED_CAPABILITY_VERSION = '1.0.0'
const RESERVED_NOTIFICATION_ARGUMENTS = new Set(['body', 'message', 'recipient', 'text', 'title'])
const CONSENT_REASON_ORDER = [
  'no-prior-consent',
  'permission-scope-changed',
  'package-changed',
  'product-changed',
  'publisher-changed',
  'revision-changed',
  'installation-changed',
  'installation-generation-changed',
]

export class ProductCapabilityNegotiationError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = 'ProductCapabilityNegotiationError'
  }
}

export async function readAndNegotiateProductCapabilities(path) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    fail('unreadable_negotiation_request', `Cannot read Product Capability negotiation request: ${error.code ?? 'unknown'}`)
  }
  if (Buffer.byteLength(source) > MAXIMUM_REQUEST_BYTES) {
    fail('oversized_negotiation_request', 'Product Capability negotiation request exceeds 1 MiB.')
  }
  let value
  try {
    value = JSON.parse(source)
  } catch {
    fail('invalid_negotiation_request', 'Product Capability negotiation request must be valid JSON.')
  }
  return negotiateProductCapabilities(value)
}

export function negotiateProductCapabilities(value) {
  exactRecord(value, [
    'authority', 'manifest', 'operation', 'productPackage', 'schemaVersion', 'type',
  ], ['previousConsent'], 'negotiation request')
  if (value.schemaVersion !== 1 || value.type !== 'porta-product-capability-negotiation-request' ||
    !['install', 'release'].includes(value.operation)) {
    fail('invalid_negotiation_request', 'Product Capability negotiation request is invalid.')
  }
  const validatedPackage = validateProductPackage(value.productPackage)
  const authority = parseAuthority(value.authority)
  const manifest = parseManifest(value.manifest)
  if (manifest.capabilityVersion !== SUPPORTED_CAPABILITY_VERSION) {
    fail('unsupported_capability_version', `Unsupported Product Capability version: ${manifest.capabilityVersion}`)
  }
  const primaryArtifact = selectValidatedProductPackagePrimaryArtifact(validatedPackage.package)
  if (manifest.packageDigest !== validatedPackage.digest ||
    manifest.contentDigest !== primaryArtifact.sha256 ||
    manifest.productRef !== authority.productRef ||
    manifest.publisherRef !== authority.publisherRef ||
    manifest.revisionRef !== authority.revisionRef) {
    fail('sidecar_binding_mismatch', 'Product Capability Manifest does not match the exact Package, Product, Revision, or Publisher.')
  }
  const manifestDigest = sha256(canonicalJson(manifest))
  const binding = {
    capabilityVersion: manifest.capabilityVersion,
    installationGeneration: authority.installationGeneration,
    installationRef: authority.installationRef,
    manifestDigest,
    packageDigest: validatedPackage.digest,
    productRef: authority.productRef,
    publisherRef: authority.publisherRef,
    revisionRef: authority.revisionRef,
  }
  const requiresContextualConsent = manifest.capabilities.some(({ access }) => access === 'contextual-consent')
  const previousConsent = value.previousConsent === undefined
    ? undefined
    : parseConsentReceipt(value.previousConsent)
  const reasons = consentReasons(binding, previousConsent, requiresContextualConsent)
  const unavailableCapabilities = manifest.capabilities
    .filter(({ id }) => id === 'network.fetch')
    .map(({ id }) => id)
  const consentDisposition = reasons.length > 0
    ? 'required'
    : previousConsent && requiresContextualConsent ? 'reuse-candidate' : 'not-required'
  return {
    authorityVerified: false,
    consent: {
      binding,
      disposition: consentDisposition,
      reasons,
    },
    effects: {
      activatesCapabilities: false,
      createsWorkRun: false,
      messaging: 'unavailable',
      network: 'unavailable',
    },
    manifest: {
      capabilityIds: manifest.capabilities.map(({ id }) => id),
      capabilityVersion: manifest.capabilityVersion,
      digest: manifestDigest,
      packageDigest: manifest.packageDigest,
    },
    operation: value.operation,
    package: {
      digest: validatedPackage.digest,
      schemaVersion: validatedPackage.package.schemaVersion,
    },
    status: unavailableCapabilities.length > 0
      ? 'blocked'
      : consentDisposition === 'required'
        ? 'consent-required'
        : consentDisposition === 'reuse-candidate' ? 'host-verification-required' : 'ready',
    type: 'porta-product-capability-negotiation',
    unavailableCapabilities,
    version: 1,
  }
}

function parseAuthority(value) {
  exactRecord(value, [
    'installationGeneration', 'installationRef', 'productRef', 'publisherRef', 'revisionRef',
  ], [], 'authority')
  if (!Number.isSafeInteger(value.installationGeneration) || value.installationGeneration < 1) {
    fail('invalid_negotiation_request', 'Product Capability Installation generation is invalid.')
  }
  for (const key of ['installationRef', 'productRef', 'publisherRef', 'revisionRef']) {
    if (!REF_PATTERN.test(value[key] ?? '')) fail('invalid_negotiation_request', `Product Capability ${key} is invalid.`)
  }
  return { ...value }
}

function parseManifest(value) {
  exactRecord(value, [
    'capabilities', 'capabilityVersion', 'contentDigest', 'packageDigest', 'productRef',
    'publisherRef', 'revisionRef', 'schemaVersion', 'type',
  ], [], 'manifest', 'invalid_manifest')
  if (value.schemaVersion !== 1 || value.type !== 'porta-product-capability-manifest' ||
    !SEMVER_PATTERN.test(value.capabilityVersion ?? '') ||
    !DIGEST_PATTERN.test(value.contentDigest ?? '') ||
    !DIGEST_PATTERN.test(value.packageDigest ?? '') ||
    !REF_PATTERN.test(value.productRef ?? '') ||
    !REF_PATTERN.test(value.publisherRef ?? '') ||
    !REF_PATTERN.test(value.revisionRef ?? '') ||
    !Array.isArray(value.capabilities) || value.capabilities.length < 1 || value.capabilities.length > 16) {
    fail('invalid_manifest', 'Product Capability Manifest v1 is invalid.')
  }
  const capabilities = value.capabilities.map(parseCapability)
  const ids = capabilities.map(({ id }) => id)
  if (new Set(ids).size !== ids.length || !utf8Ordered(ids)) {
    fail('invalid_manifest', 'Product Capability Manifest v1 is invalid.')
  }
  return {
    capabilities,
    capabilityVersion: value.capabilityVersion,
    contentDigest: value.contentDigest,
    packageDigest: value.packageDigest,
    productRef: value.productRef,
    publisherRef: value.publisherRef,
    revisionRef: value.revisionRef,
    schemaVersion: 1,
    type: 'porta-product-capability-manifest',
  }
}

function parseCapability(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string') invalidManifest()
  if (value.id === 'identity.login') {
    exactRecord(value, ['access', 'id'], [], 'identity.login', 'invalid_manifest')
    if (value.access !== 'contextual-consent') invalidManifest()
    return { access: value.access, id: value.id }
  }
  if (value.id === 'identity.status') {
    exactRecord(value, ['access', 'id'], [], 'identity.status', 'invalid_manifest')
    if (value.access !== 'public') invalidManifest()
    return { access: value.access, id: value.id }
  }
  if (value.id === 'network.fetch') {
    exactRecord(value, ['access', 'id', 'origins'], [], 'network.fetch', 'invalid_manifest')
    if (value.access !== 'restricted-domain' || !Array.isArray(value.origins) ||
      value.origins.length < 1 || value.origins.length > 16) invalidManifest()
    const origins = value.origins.map(parseOrigin)
    if (new Set(origins).size !== origins.length || !utf8Ordered(origins)) invalidManifest()
    return { access: value.access, id: value.id, origins }
  }
  if (value.id === 'notification.self') {
    exactRecord(value, ['access', 'id', 'templates'], [], 'notification.self', 'invalid_manifest')
    if (value.access !== 'contextual-consent' || !Array.isArray(value.templates) ||
      value.templates.length < 1 || value.templates.length > 32) invalidManifest()
    const templates = value.templates.map(parseTemplate)
    const keys = templates.map(({ key }) => key)
    if (new Set(keys).size !== keys.length || !utf8Ordered(keys)) invalidManifest()
    return { access: value.access, id: value.id, templates }
  }
  if (value.id === 'storage.local') {
    exactRecord(value, ['access', 'id', 'quotaBytes'], [], 'storage.local', 'invalid_manifest')
    if (value.access !== 'public' || !Number.isSafeInteger(value.quotaBytes) ||
      value.quotaBytes < 1_024 || value.quotaBytes > 4_194_304) invalidManifest()
    return { access: value.access, id: value.id, quotaBytes: value.quotaBytes }
  }
  invalidManifest()
}

function parseTemplate(value) {
  exactRecord(value, ['arguments', 'key'], [], 'notification template', 'invalid_manifest')
  if (!IDENTIFIER_PATTERN.test(value.key ?? '') || value.key.length > 96 ||
    !Array.isArray(value.arguments) || value.arguments.length > 16) invalidManifest()
  const args = value.arguments.map(parseArgument)
  const names = args.map(({ name }) => name)
  if (new Set(names).size !== names.length || !utf8Ordered(names)) invalidManifest()
  return { arguments: args, key: value.key }
}

function parseArgument(value) {
  exactRecord(value, ['name', 'required', 'type'], [], 'notification argument', 'invalid_manifest')
  const name = value.name
  const normalized = typeof name === 'string' ? name.replaceAll(/[._-]/gu, '') : ''
  if (!IDENTIFIER_PATTERN.test(name ?? '') || name.length > 64 || RESERVED_NOTIFICATION_ARGUMENTS.has(name) ||
    normalized.includes('recipient') || normalized.endsWith('userid') || normalized.endsWith('accountid') ||
    normalized.endsWith('installationid') || typeof value.required !== 'boolean' ||
    !['boolean', 'number', 'string'].includes(value.type)) invalidManifest()
  return { name, required: value.required, type: value.type }
}

function parseOrigin(value) {
  if (typeof value !== 'string' || value.length > 256 || value.includes('*')) invalidManifest()
  let url
  try {
    url = new URL(value)
  } catch {
    invalidManifest()
  }
  if (!['https:', 'wss:'].includes(url.protocol) || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash || value !== url.origin) invalidManifest()
  return value
}

function parseConsentReceipt(value) {
  exactRecord(value, [
    'capabilityVersion', 'consentDigest', 'consentedAt', 'consentRef', 'hostPolicyRef',
    'installationGeneration', 'installationRef', 'manifestDigest', 'packageDigest',
    'productRef', 'publisherRef', 'revisionRef', 'schemaVersion', 'type', 'version',
  ], [], 'consent receipt', 'invalid_consent_receipt')
  const { consentDigest, ...unsigned } = value
  if (value.schemaVersion !== 1 || value.type !== 'porta-product-capability-consent-receipt' || value.version !== 1 ||
    !REF_PATTERN.test(value.consentRef ?? '') || !REF_PATTERN.test(value.hostPolicyRef ?? '') ||
    !timestamp(value.consentedAt) || !SEMVER_PATTERN.test(value.capabilityVersion ?? '') ||
    !Number.isSafeInteger(value.installationGeneration) || value.installationGeneration < 1 ||
    !DIGEST_PATTERN.test(value.consentDigest ?? '') || value.consentDigest !== sha256(canonicalJson(unsigned)) ||
    !DIGEST_PATTERN.test(value.manifestDigest ?? '') || !DIGEST_PATTERN.test(value.packageDigest ?? '') ||
    ['installationRef', 'productRef', 'publisherRef', 'revisionRef'].some((key) => !REF_PATTERN.test(value[key] ?? ''))) {
    fail('invalid_consent_receipt', 'Product Capability consent receipt is invalid.')
  }
  return { ...value }
}

function consentReasons(binding, previous, required) {
  if (!required) return []
  if (!previous) return ['no-prior-consent']
  const reasons = new Set()
  if (previous.manifestDigest !== binding.manifestDigest ||
    previous.capabilityVersion !== binding.capabilityVersion) reasons.add('permission-scope-changed')
  if (previous.packageDigest !== binding.packageDigest) reasons.add('package-changed')
  if (previous.productRef !== binding.productRef) reasons.add('product-changed')
  if (previous.publisherRef !== binding.publisherRef) reasons.add('publisher-changed')
  if (previous.revisionRef !== binding.revisionRef) reasons.add('revision-changed')
  if (previous.installationRef !== binding.installationRef) reasons.add('installation-changed')
  if (previous.installationGeneration !== binding.installationGeneration) reasons.add('installation-generation-changed')
  return CONSENT_REASON_ORDER.filter((reason) => reasons.has(reason))
}

function exactRecord(value, required, optional, label, code = 'invalid_negotiation_request') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `Product Capability ${label} must be an object.`)
  }
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(value)
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    fail(code, `Product Capability ${label} fields are invalid.`)
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => utf8Compare(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function utf8Ordered(values) {
  return values.every((value, index) => index === 0 || utf8Compare(values[index - 1], value) < 0)
}

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function invalidManifest() {
  fail('invalid_manifest', 'Product Capability Manifest v1 is invalid.')
}

function fail(code, message) {
  throw new ProductCapabilityNegotiationError(code, message)
}
