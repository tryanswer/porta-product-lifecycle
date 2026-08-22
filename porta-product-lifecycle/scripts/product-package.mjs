import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { lstat, open, readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, posix, resolve, sep } from 'node:path'

const MAX_SPEC_BYTES = 256 * 1024
const MAX_PACKAGE_FILES = 4096
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024
const ID_PATTERN = /^[a-z][a-z0-9._-]{2,127}$/
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const DEPLOYMENT_MATRIX = new Map([
  ['local-machine', new Set(['loopback', 'private', 'public'])],
  ['remote-host', new Set(['private', 'public'])],
  ['managed-cloud', new Set(['private', 'public'])],
])
const DISTRIBUTION_CHANNELS = new Set([
  'app-store',
  'download',
  'enterprise',
  'google-play',
  'porta-web-release',
])

export class ProductPackageValidationError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = 'ProductPackageValidationError'
  }
}

export async function readProductPackage(path) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    throw new ProductPackageValidationError('unreadable_product_package', `Cannot read Product Package: ${error.code ?? 'unknown'}`)
  }
  if (Buffer.byteLength(source) > MAX_SPEC_BYTES) {
    throw new ProductPackageValidationError('oversized_product_package', 'Product Package exceeds 256 KiB.')
  }
  let value
  try {
    value = JSON.parse(source)
  } catch {
    throw new ProductPackageValidationError('invalid_product_package_json', 'Product Package must be valid JSON.')
  }
  return validateProductPackage(value)
}

export function validateProductPackage(value) {
  exactRecord(value, [
    'artifacts',
    'descriptor',
    'product',
    'profile',
    'provenance',
    'schemaVersion',
    'validation',
  ], ['deploymentTarget', 'distribution'], 'Product Package')
  if (value.schemaVersion !== 1) fail('unsupported_schema_version', 'Product Package schemaVersion must be 1.')

  const product = validateProduct(value.product)
  const descriptor = validateDescriptor(value.descriptor)
  const profile = validateProfile(value.profile)
  const artifacts = validateArtifacts(value.artifacts, profile)
  const provenance = validateProvenance(value.provenance)
  const validation = validateValidation(value.validation)
  const deploymentTarget = value.deploymentTarget === undefined
    ? undefined
    : validateDeploymentTarget(value.deploymentTarget)
  const distribution = value.distribution === undefined
    ? undefined
    : validateDistribution(value.distribution, profile)

  const normalized = {
    artifacts,
    descriptor,
    ...(deploymentTarget ? { deploymentTarget } : {}),
    ...(distribution ? { distribution } : {}),
    product,
    profile,
    provenance,
    schemaVersion: 1,
    validation,
  }
  return {
    digest: createHash('sha256').update(canonicalJson(normalized)).digest('hex'),
    package: normalized,
  }
}

export async function verifyProductPackageRoot(value, packageRoot) {
  const validated = validateProductPackage(value)
  const root = requireAbsoluteNormalizedPath(packageRoot, 'package root')
  const rootInfo = await lstat(root).catch((error) => {
    if (error?.code === 'ENOENT') fail('invalid_package_root', 'Package root does not exist.')
    throw error
  })
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    fail('invalid_package_root', 'Package root must be a real directory, not a symbolic link.')
  }

  rejectOverlappingArtifacts(validated.package.artifacts)
  const entries = await collectPackageEntries(root)
  const declared = validated.package.artifacts.map((artifact) => ({
    ...artifact,
    absolutePath: join(root, ...artifact.path.split('/')),
  }))

  for (const entry of entries) {
    if (entry.type === 'directory') {
      const allowed = declared.some((artifact) => (
        artifact.path.startsWith(`${entry.relativePath}/`) ||
        (
          artifact.kind === 'static-directory' &&
          (entry.relativePath === artifact.path || entry.relativePath.startsWith(`${artifact.path}/`))
        )
      ))
      if (!allowed) fail('undeclared_package_entry', `Undeclared package directory: ${entry.relativePath}`)
      const insideStaticArtifact = declared.some((artifact) => (
        artifact.kind === 'static-directory' &&
        (entry.relativePath === artifact.path || entry.relativePath.startsWith(`${artifact.path}/`))
      ))
      if (insideStaticArtifact && !entries.some((candidate) => (
        candidate.type === 'file' && candidate.relativePath.startsWith(`${entry.relativePath}/`)
      ))) fail('undeclared_package_entry', `Empty package directory is forbidden: ${entry.relativePath}`)
      continue
    }
    const owner = declared.find((artifact) => (
      artifact.kind === 'static-directory'
        ? entry.relativePath.startsWith(`${artifact.path}/`)
        : entry.relativePath === artifact.path
    ))
    if (!owner) fail('undeclared_package_entry', `Undeclared package file: ${entry.relativePath}`)
  }

  const receipts = []
  for (const artifact of declared) {
    const info = await lstat(artifact.absolutePath).catch((error) => {
      if (error?.code === 'ENOENT') fail('artifact_mismatch', `Declared artifact is missing: ${artifact.path}`)
      throw error
    })
    if (info.isSymbolicLink()) fail('unsafe_package_entry', `Symbolic link artifact is forbidden: ${artifact.path}`)
    const receipt = artifact.kind === 'static-directory'
      ? await verifyDirectoryArtifact(artifact, entries, info)
      : await verifyFileArtifact(artifact, info)
    receipts.push(receipt)
  }

  const primaryKind = validated.package.profile.kind === 'static-web'
    ? 'static-directory'
    : validated.package.profile.kind === 'mobile' ? 'mobile-package' : 'executable-file'
  const primaryArtifacts = receipts.filter((artifact) => artifact.kind === primaryKind)
  if (primaryArtifacts.length !== 1) {
    fail('invalid_artifacts', `Product Package must contain exactly one ${primaryKind} primary artifact.`)
  }

  const finalEntries = await collectPackageEntries(root)
  if (entrySnapshot(finalEntries) !== entrySnapshot(entries)) {
    fail('package_tree_changed', 'Package tree changed during verification.')
  }

  return {
    artifacts: receipts,
    materializationCandidate: {
      package: validated.package,
      packageDigest: validated.digest,
      primaryArtifact: primaryArtifacts[0],
      schemaVersion: 1,
      type: 'porta-product-materialization-candidate',
      version: 1,
    },
    packageDigest: validated.digest,
    packageSchemaVersion: validated.package.schemaVersion,
    type: 'porta-product-package-verification',
    version: 1,
  }
}

function validateDescriptor(value) {
  exactRecord(value, ['capabilities', 'summary'], [], 'descriptor')
  if (!Array.isArray(value.capabilities) || value.capabilities.length > 32) {
    fail('invalid_product_package', 'descriptor.capabilities must contain at most 32 identifiers.')
  }
  const capabilities = value.capabilities.map((item, index) => identifier(item, `descriptor.capabilities[${index}]`))
  if (new Set(capabilities).size !== capabilities.length) fail('invalid_product_package', 'descriptor.capabilities must be unique.')
  return {
    capabilities: [...capabilities].sort(compareUtf8Text),
    summary: boundedText(value.summary, 1, 2048, 'descriptor.summary'),
  }
}

function validateProvenance(value) {
  exactRecord(value, ['builder', 'skills', 'sourceRevision'], [], 'provenance')
  exactRecord(value.builder, ['id', 'version'], [], 'provenance.builder')
  if (!Array.isArray(value.skills) || value.skills.length > 32) {
    fail('invalid_product_package', 'provenance.skills must contain at most 32 entries.')
  }
  const skills = value.skills.map((skill, index) => {
    exactRecord(skill, ['id', 'version'], [], `provenance.skills[${index}]`)
    return {
      id: identifier(skill.id, `provenance.skills[${index}].id`),
      version: patternText(skill.version, VERSION_PATTERN, `provenance.skills[${index}].version`),
    }
  })
  if (new Set(skills.map(({ id }) => id)).size !== skills.length) fail('invalid_product_package', 'provenance.skills ids must be unique.')
  return {
    builder: {
      id: identifier(value.builder.id, 'provenance.builder.id'),
      version: patternText(value.builder.version, VERSION_PATTERN, 'provenance.builder.version'),
    },
    skills: [...skills].sort((left, right) => compareUtf8Text(left.id, right.id)),
    sourceRevision: patternText(value.sourceRevision, /^[A-Za-z0-9][A-Za-z0-9._:-]{6,127}$/, 'provenance.sourceRevision'),
  }
}

function validateValidation(value) {
  exactRecord(value, ['checks'], [], 'validation')
  if (!Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > 64) {
    fail('invalid_product_package', 'validation.checks must contain 1 through 64 checks.')
  }
  const checks = value.checks.map((check, index) => {
    exactRecord(check, ['evidenceRef', 'id', 'kind', 'observedAt', 'status'], [], `validation.checks[${index}]`)
    return {
      evidenceRef: boundedText(check.evidenceRef, 1, 256, `validation.checks[${index}].evidenceRef`),
      id: identifier(check.id, `validation.checks[${index}].id`),
      kind: enumText(check.kind, ['build', 'device', 'runtime', 'security', 'test'], `validation.checks[${index}].kind`),
      observedAt: isoDateTime(check.observedAt, `validation.checks[${index}].observedAt`),
      status: enumText(check.status, ['passed'], `validation.checks[${index}].status`),
    }
  })
  if (new Set(checks.map(({ id }) => id)).size !== checks.length) fail('invalid_product_package', 'validation check ids must be unique.')
  return { checks: [...checks].sort((left, right) => compareUtf8Text(left.id, right.id)) }
}

function validateProduct(value) {
  exactRecord(value, ['displayName', 'id', 'version'], [], 'product')
  return {
    displayName: boundedText(value.displayName, 1, 128, 'product.displayName'),
    id: identifier(value.id, 'product.id'),
    version: patternText(value.version, VERSION_PATTERN, 'product.version'),
  }
}

function validateProfile(value) {
  if (!isRecord(value) || typeof value.kind !== 'string') fail('invalid_profile', 'profile must declare a supported kind.')
  if (value.kind === 'static-web') {
    exactRecord(value, ['entryPath', 'kind', 'spaFallback'], [], 'static-web profile')
    return {
      entryPath: relativePath(value.entryPath, 'profile.entryPath'),
      kind: 'static-web',
      spaFallback: boolean(value.spaFallback, 'profile.spaFallback'),
    }
  }
  if (value.kind === 'local-runtime') {
    exactRecord(value, ['command', 'kind'], ['healthPath'], 'local-runtime profile')
    if (!Array.isArray(value.command) || value.command.length < 1 || value.command.length > 32) {
      fail('invalid_profile', 'profile.command must contain 1 through 32 arguments.')
    }
    const command = value.command.map((argument, index) => boundedText(argument, 1, 2048, `profile.command[${index}]`))
    return {
      command,
      ...(value.healthPath === undefined ? {} : { healthPath: httpPath(value.healthPath, 'profile.healthPath') }),
      kind: 'local-runtime',
    }
  }
  if (value.kind === 'mobile') {
    exactRecord(value, ['kind', 'platform'], ['applicationId', 'bundleId'], 'mobile profile')
    if (value.platform === 'android') {
      if (value.bundleId !== undefined) fail('invalid_profile', 'Android profile cannot declare bundleId.')
      return {
        applicationId: reverseDomainId(value.applicationId, 'profile.applicationId'),
        kind: 'mobile',
        platform: 'android',
      }
    }
    if (value.platform === 'ios') {
      if (value.applicationId !== undefined) fail('invalid_profile', 'iOS profile cannot declare applicationId.')
      return {
        bundleId: reverseDomainId(value.bundleId, 'profile.bundleId'),
        kind: 'mobile',
        platform: 'ios',
      }
    }
  }
  fail('invalid_profile', 'profile.kind must be static-web, local-runtime, or mobile.')
}

function validateArtifacts(value, profile) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    fail('invalid_artifacts', 'artifacts must contain 1 through 32 immutable artifacts.')
  }
  const ids = new Set()
  const artifacts = value.map((artifact, index) => {
    exactRecord(artifact, ['bytes', 'id', 'kind', 'path', 'sha256'], ['mediaType'], `artifacts[${index}]`)
    const normalized = {
      bytes: positiveSafeInteger(artifact.bytes, `artifacts[${index}].bytes`),
      id: identifier(artifact.id, `artifacts[${index}].id`),
      kind: enumText(artifact.kind, ['executable-file', 'mobile-package', 'static-directory'], `artifacts[${index}].kind`),
      ...(artifact.mediaType === undefined ? {} : { mediaType: boundedText(artifact.mediaType, 1, 128, `artifacts[${index}].mediaType`) }),
      path: relativePath(artifact.path, `artifacts[${index}].path`),
      sha256: patternText(artifact.sha256, SHA256_PATTERN, `artifacts[${index}].sha256`),
    }
    if (ids.has(normalized.id)) fail('invalid_artifacts', `Duplicate artifact id: ${normalized.id}`)
    ids.add(normalized.id)
    return normalized
  })
  const expectedPrimaryKind = profile.kind === 'static-web'
    ? 'static-directory'
    : profile.kind === 'mobile' ? 'mobile-package' : 'executable-file'
  if (!artifacts.some((artifact) => artifact.kind === expectedPrimaryKind)) {
    fail('incompatible_artifact', `${profile.kind} requires a ${expectedPrimaryKind} artifact.`)
  }
  if (artifacts.filter((artifact) => artifact.kind === expectedPrimaryKind).length !== 1) {
    fail('incompatible_artifact', `${profile.kind} requires exactly one ${expectedPrimaryKind} primary artifact.`)
  }
  rejectOverlappingArtifacts(artifacts)
  return artifacts
}

function rejectOverlappingArtifacts(artifacts) {
  for (let left = 0; left < artifacts.length; left += 1) {
    for (let right = left + 1; right < artifacts.length; right += 1) {
      const a = artifacts[left].path
      const b = artifacts[right].path
      if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
        fail('invalid_artifacts', `Artifact paths overlap: ${a} and ${b}`)
      }
    }
  }
}

function validateDeploymentTarget(value) {
  exactRecord(value, ['exposure', 'placement'], [], 'deploymentTarget')
  const placement = enumText(value.placement, [...DEPLOYMENT_MATRIX.keys()], 'deploymentTarget.placement')
  const exposure = enumText(value.exposure, ['loopback', 'private', 'public'], 'deploymentTarget.exposure')
  if (!DEPLOYMENT_MATRIX.get(placement).has(exposure)) {
    fail('invalid_deployment_target', `${placement} does not support ${exposure} exposure.`)
  }
  return { exposure, placement }
}

function validateDistribution(value, profile) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    fail('invalid_distribution', 'distribution must contain 1 through 16 destinations when present.')
  }
  const channels = new Set()
  return value.map((destination, index) => {
    exactRecord(destination, ['channel'], ['audience', 'track'], `distribution[${index}]`)
    const channel = enumText(destination.channel, [...DISTRIBUTION_CHANNELS], `distribution[${index}].channel`)
    if (channels.has(channel)) fail('invalid_distribution', `Duplicate distribution channel: ${channel}`)
    channels.add(channel)
    if (channel === 'google-play' && !(profile.kind === 'mobile' && profile.platform === 'android')) {
      fail('incompatible_distribution', 'google-play distribution requires an Android mobile profile.')
    }
    if (channel === 'app-store' && !(profile.kind === 'mobile' && profile.platform === 'ios')) {
      fail('incompatible_distribution', 'app-store distribution requires an iOS mobile profile.')
    }
    if (channel === 'porta-web-release' && profile.kind !== 'static-web') {
      fail('incompatible_distribution', 'porta-web-release distribution requires a static-web profile.')
    }
    return {
      ...(destination.audience === undefined ? {} : { audience: boundedText(destination.audience, 1, 128, `distribution[${index}].audience`) }),
      channel,
      ...(destination.track === undefined ? {} : { track: boundedText(destination.track, 1, 64, `distribution[${index}].track`) }),
    }
  })
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function compareUtf8Text(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

function exactRecord(value, required, optional, label) {
  if (!isRecord(value)) fail('invalid_product_package', `${label} must be an object.`)
  const allowed = new Set([...required, ...optional])
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    fail('invalid_product_package', `${label} has an invalid field set.`)
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function fail(code, message) {
  throw new ProductPackageValidationError(code, message)
}

function boundedText(value, minimum, maximum, label) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum || value.trim() !== value) {
    fail('invalid_product_package', `${label} must be bounded trimmed text.`)
  }
  return value
}

function patternText(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) fail('invalid_product_package', `${label} is invalid.`)
  return value
}

function identifier(value, label) {
  return patternText(value, ID_PATTERN, label)
}

function enumText(value, allowed, label) {
  if (!allowed.includes(value)) fail('invalid_product_package', `${label} is unsupported.`)
  return value
}

function boolean(value, label) {
  if (typeof value !== 'boolean') fail('invalid_product_package', `${label} must be boolean.`)
  return value
}

function relativePath(value, label) {
  const path = boundedText(value, 1, 1024, label)
  if (path.startsWith('/') || path.includes('\\') || posix.normalize(path) !== path || path === '.' || path.split('/').includes('..')) {
    fail('invalid_product_package', `${label} must be a normalized relative POSIX path.`)
  }
  return path
}

function httpPath(value, label) {
  const path = boundedText(value, 1, 1024, label)
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('?') || path.includes('#')) {
    fail('invalid_product_package', `${label} must be an absolute HTTP path without query or fragment.`)
  }
  return path
}

function reverseDomainId(value, label) {
  if (typeof value !== 'string' || value.length > 255 || !/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/.test(value)) {
    fail('invalid_profile', `${label} must be a reverse-domain identifier.`)
  }
  return value
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PACKAGE_BYTES) {
    fail('invalid_product_package', `${label} must be a positive safe integer within the package byte limit.`)
  }
  return value
}

function isoDateTime(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) fail('invalid_product_package', `${label} must be an ISO UTC date-time.`)
  return value
}

function requireAbsoluteNormalizedPath(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value) || resolve(value) !== value || value === sep) {
    fail('invalid_package_root', `${label} must be an absolute normalized non-root path.`)
  }
  return value
}

async function collectPackageEntries(root) {
  const entries = []
  let totalBytes = 0
  async function visit(directory, relativeDirectory = '') {
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((left, right) => compareUtf8Text(left.name, right.name))
    for (const child of children) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name
      const absolutePath = join(directory, child.name)
      const info = await lstat(absolutePath)
      if (info.isSymbolicLink()) fail('unsafe_package_entry', `Symbolic link is forbidden: ${relativePath}`)
      if (info.isDirectory()) {
        entries.push({ absolutePath, relativePath, type: 'directory', ...identityFields(info) })
        await visit(absolutePath, relativePath)
        continue
      }
      if (!info.isFile()) fail('unsafe_package_entry', `Only regular files and directories are allowed: ${relativePath}`)
      totalBytes += info.size
      if (totalBytes > MAX_PACKAGE_BYTES) fail('oversized_package_root', 'Package root exceeds the byte limit.')
      entries.push({ absolutePath, relativePath, type: 'file', ...identityFields(info) })
      if (entries.filter(({ type }) => type === 'file').length > MAX_PACKAGE_FILES) {
        fail('oversized_package_root', 'Package root exceeds the file-count limit.')
      }
    }
  }
  await visit(root)
  return entries
}

async function verifyDirectoryArtifact(artifact, entries, info) {
  if (!info.isDirectory()) fail('artifact_mismatch', `Directory artifact is not a directory: ${artifact.path}`)
  const ownedFiles = entries
    .filter((entry) => entry.type === 'file' && entry.relativePath.startsWith(`${artifact.path}/`))
    .map((entry) => ({ ...entry, artifactPath: entry.relativePath.slice(artifact.path.length + 1) }))
    .sort((left, right) => compareUtf8Text(left.artifactPath, right.artifactPath))
  if (ownedFiles.length < 1) fail('artifact_mismatch', `Directory artifact is empty: ${artifact.path}`)
  let bytes = 0
  const files = []
  const treeEntries = []
  for (const file of ownedFiles) {
    const contents = await readRegularFileWithoutFollowing(file.absolutePath, file.relativePath)
    bytes += contents.length
    const sha256 = createHash('sha256').update(contents).digest('hex')
    files.push({ bytes: contents.length, path: file.artifactPath, sha256 })
    treeEntries.push(`${file.artifactPath}\0${contents.length}\0${sha256}\n`)
  }
  const sha256 = createHash('sha256').update(treeEntries.join('')).digest('hex')
  if (bytes !== artifact.bytes || sha256 !== artifact.sha256) {
    fail('artifact_mismatch', `Directory artifact bytes or tree digest changed: ${artifact.path}`)
  }
  return { bytes, fileCount: ownedFiles.length, files, id: artifact.id, kind: artifact.kind, path: artifact.path, sha256 }
}

async function verifyFileArtifact(artifact, info) {
  if (!info.isFile()) fail('artifact_mismatch', `File artifact is not a regular file: ${artifact.path}`)
  const contents = await readRegularFileWithoutFollowing(artifact.absolutePath, artifact.path)
  const sha256 = createHash('sha256').update(contents).digest('hex')
  if (contents.length !== artifact.bytes || sha256 !== artifact.sha256) {
    fail('artifact_mismatch', `File artifact bytes or digest changed: ${artifact.path}`)
  }
  return {
    bytes: contents.length,
    fileCount: 1,
    files: [{ bytes: contents.length, path: artifact.path, sha256 }],
    id: artifact.id,
    kind: artifact.kind,
    path: artifact.path,
    sha256,
  }
}

async function readRegularFileWithoutFollowing(path, label) {
  let handle
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    const before = await handle.stat()
    if (!before.isFile() || before.nlink !== 1) fail('unsafe_package_entry', `File must be a singly linked regular file: ${label}`)
    const contents = await handle.readFile()
    const after = await handle.stat()
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      after.nlink !== 1 ||
      contents.length !== after.size
    ) fail('artifact_changed_during_verification', `Artifact changed while being verified: ${label}`)
    return contents
  } catch (error) {
    if (error instanceof ProductPackageValidationError) throw error
    if (error?.code === 'ELOOP') fail('unsafe_package_entry', `Symbolic link is forbidden: ${label}`)
    throw error
  } finally {
    await handle?.close()
  }
}

function identityFields(info) {
  return {
    ctimeMs: info.ctimeMs,
    dev: info.dev,
    ino: info.ino,
    mtimeMs: info.mtimeMs,
    nlink: info.nlink,
    size: info.size,
  }
}

function entrySnapshot(entries) {
  return JSON.stringify(entries.map((entry) => ({
    ctimeMs: entry.ctimeMs,
    dev: entry.dev,
    ino: entry.ino,
    mtimeMs: entry.mtimeMs,
    nlink: entry.nlink,
    relativePath: entry.relativePath,
    size: entry.size,
    type: entry.type,
  })))
}
