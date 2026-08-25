import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const clientPath = fileURLToPath(new URL('../scripts/porta-product-lifecycle.mjs', import.meta.url))
const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url))
const localReleaseReferencePath = fileURLToPath(new URL('../references/local-product-release-v1.md', import.meta.url))
const evalsPath = fileURLToPath(new URL('../evals/activation-cases.json', import.meta.url))
const metadataPath = fileURLToPath(new URL('../agents/openai.yaml', import.meta.url))

function sha(value) {
  return createHash('sha256').update(value).digest('hex')
}

function treeDigest(files) {
  return sha(Object.entries(files)
    .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map(([path, bytes]) => `${path}\0${Buffer.byteLength(bytes)}\0${sha(bytes)}\n`)
    .join(''))
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'porta-local-release-client-'))
  const project = join(root, 'project')
  const packageRoot = join(root, 'package')
  const home = join(root, 'home')
  const bridge = join(root, 'porta-bridge')
  const log = join(root, 'bridge.jsonl')
  const marker = join(root, 'registration-accepted')
  const specPath = join(root, 'product-package.json')
  const files = { 'index.html': '<!doctype html><title>Local</title>\n' }
  await mkdir(project)
  await mkdir(join(packageRoot, 'web'), { recursive: true })
  await mkdir(home)
  await writeFile(join(packageRoot, 'web', 'index.html'), files['index.html'])
  await writeFile(specPath, JSON.stringify({
    schemaVersion: 1,
    product: { id: 'local_product', displayName: 'Local Product', version: '1.0.0' },
    descriptor: { summary: 'Local product.', capabilities: ['web.ui'] },
    profile: { kind: 'static-web', entryPath: 'index.html', spaFallback: true },
    artifacts: [{
      id: 'web',
      kind: 'static-directory',
      path: 'web',
      bytes: Buffer.byteLength(files['index.html']),
      sha256: treeDigest(files),
      mediaType: 'text/html',
    }],
    validation: { checks: [{
      id: 'build', kind: 'build', status: 'passed', evidenceRef: 'build:fixture',
      observedAt: '2026-08-25T00:00:00.000Z',
    }] },
    provenance: {
      builder: { id: 'fixture', version: '1.0.0' },
      skills: [{ id: 'porta-product-lifecycle', version: '1.0.3' }],
      sourceRevision: 'abcdef1234567890',
    },
    deploymentTarget: { placement: 'local-machine', exposure: 'loopback' },
  }))
  await writeFile(bridge, `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const option = (name) => args[args.indexOf(name) + 1]
const command = args[1]
fs.appendFileSync(process.env.FAKE_BRIDGE_LOG, JSON.stringify(args) + '\\n')
if (command === 'capabilities') {
  console.log(JSON.stringify({
    capabilities: ['porta.workflow.product-materialization.v1'],
    commands: [
      'capabilities', 'product-work-begin', 'product-materialization-register',
      'product-materialization-status'
    ],
    eventContractVersion: 2, ok: true, platformSupported: true, protocolVersion: 1,
    runtimeVersion: process.env.FAKE_RUNTIME_VERSION || '1.16.6', staleAfterSeconds: 900,
    traceId: option('--trace-id'), type: 'workflow-capabilities', workflowProtocolVersion: 2
  }))
  process.exit(0)
}
if (command === 'product-work-begin') {
  console.log(JSON.stringify({
    created: true, ok: true, projectContext: { generation: 1, projectRef: 'project_fixture', rootPath: option('--cwd') },
    protocolVersion: 1, provider: option('--provider'), providerSessionId: option('--provider-session-id'),
    purpose: 'materialization', status: 'active', traceId: option('--trace-id'), type: 'product-work-begin',
    version: 1, workflowProtocolVersion: 2, workRunId: 'workrun_33333333-3333-4333-8333-333333333333'
  }))
  process.exit(0)
}
if (command === 'product-materialization-register') {
  const payload = JSON.parse(Buffer.from(option('--payload'), 'base64url').toString('utf8'))
  const projectRoot = fs.realpathSync(option('--cwd'))
  const candidatePath = fs.realpathSync(payload.candidatePath)
  const packageRoot = fs.realpathSync(payload.packageRoot)
  if (!candidatePath.startsWith(projectRoot + path.sep)) process.exit(5)
  if (candidatePath.startsWith(packageRoot + path.sep)) process.exit(6)
  const candidate = JSON.parse(fs.readFileSync(payload.candidatePath, 'utf8'))
  if (candidate.type !== 'porta-product-materialization-candidate') process.exit(3)
  if (process.env.FAKE_LOSE_REGISTRATION_ONCE === '1' && !fs.existsSync(process.env.FAKE_REGISTRATION_MARKER)) {
    fs.writeFileSync(process.env.FAKE_REGISTRATION_MARKER, 'accepted')
    process.stderr.write(JSON.stringify({ code: 'transport_lost', message: 'response lost' }))
    process.exit(2)
  }
  console.log(JSON.stringify({
    idempotent: fs.existsSync(process.env.FAKE_REGISTRATION_MARKER), ok: true, protocolVersion: 1,
    requestRef: 'materialization_fixture_1234', status: 'pending', traceId: option('--trace-id'),
    type: 'product-materialization-registration-receipt', version: 1, workflowProtocolVersion: 2
  }))
  process.exit(0)
}
if (command === 'product-materialization-status') {
  const ready = process.env.FAKE_LOCAL_READY === '1'
  console.log(JSON.stringify({
    ...(ready ? {
      adapter: 'static-web', artifactSha256: process.env.FAKE_ARTIFACT_SHA,
      custodyRef: 'custody_fixture', operationRef: process.env.FAKE_OPERATION_REF,
      packageDigest: process.env.FAKE_PACKAGE_DIGEST, receiptRef: 'receipt_fixture',
      settledAt: '2026-08-25T01:00:00.000Z', targetRef: 'target_fixture'
    } : {}),
    ok: true, protocolVersion: 1, requestRef: option('--request-ref'),
    status: ready ? 'local-ready' : 'pending', traceId: option('--trace-id'),
    type: 'product-materialization-status', version: 1, workflowProtocolVersion: 2
  }))
  process.exit(0)
}
process.exit(4)
`)
  await chmod(bridge, 0o755)
  return {
    bridge, home, log, marker, packageRoot, project, root, specPath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

function run(value, args, overrides = {}) {
  return spawnSync(process.execPath, [clientPath, ...args], {
    cwd: value.project,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: value.home,
      PORTA_BRIDGE_BIN: value.bridge,
      FAKE_BRIDGE_LOG: value.log,
      FAKE_REGISTRATION_MARKER: value.marker,
      ...overrides,
    },
  })
}

const runKey = 'run_11111111-1111-4111-8111-111111111111'

test('registers one verified local package through non-publish Product Work', async () => {
  const value = await fixture()
  try {
    const result = run(value, [
      'local-release-register', '--run-key', runKey, '--spec', value.specPath,
      '--package-root', value.packageRoot, '--provider', 'codex',
      '--provider-session-id', 'session_fixture_1234', '--cwd', value.project,
    ])
    assert.equal(result.status, 0, result.stderr)
    const receipt = JSON.parse(result.stdout)
    assert.equal(receipt.status, 'pending')
    assert.equal(receipt.requestRef, 'materialization_fixture_1234')
    const calls = (await readFile(value.log, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.deepEqual(calls.map((call) => call[1]), [
      'capabilities', 'product-work-begin', 'product-materialization-register',
    ])
    assert.equal(calls[1][calls[1].indexOf('--purpose') + 1], 'materialization')
    assert.equal(calls[2][calls[2].indexOf('--work-run-id') + 1], 'workrun_33333333-3333-4333-8333-333333333333')
    const registrationPayload = JSON.parse(Buffer.from(
      calls[2][calls[2].indexOf('--payload') + 1],
      'base64url',
    ).toString('utf8'))
    assert.deepEqual(Object.keys(registrationPayload).sort(), [
      'candidatePath', 'mode', 'packageRoot', 'productRef', 'version',
    ])
    assert.equal(registrationPayload.productRef, null)
    const statePath = receipt.stateFile
    assert.equal((await stat(statePath)).mode & 0o777, 0o600)
  } finally {
    await value.cleanup()
  }
})

test('reuses the same bounded operation after registration response loss', async () => {
  const value = await fixture()
  try {
    const args = [
      'local-release-register', '--run-key', runKey, '--spec', value.specPath,
      '--package-root', value.packageRoot, '--provider', 'codex',
      '--provider-session-id', 'session_fixture_1234', '--cwd', value.project,
    ]
    const first = run(value, args, { FAKE_LOSE_REGISTRATION_ONCE: '1' })
    assert.notEqual(first.status, 0)
    const second = run(value, args, { FAKE_LOSE_REGISTRATION_ONCE: '1' })
    assert.equal(second.status, 0, second.stderr)
    const calls = (await readFile(value.log, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.equal(calls.filter((call) => call[1] === 'product-work-begin').length, 1)
    assert.equal(calls.filter((call) => call[1] === 'product-materialization-register').length, 2)
  } finally {
    await value.cleanup()
  }
})

test('reports complete only from exact Bridge local-ready status', async () => {
  const value = await fixture()
  try {
    const registered = run(value, [
      'local-release-register', '--run-key', runKey, '--spec', value.specPath,
      '--package-root', value.packageRoot, '--provider', 'codex',
      '--provider-session-id', 'session_fixture_1234', '--cwd', value.project,
    ])
    assert.equal(registered.status, 0, registered.stderr)
    const state = JSON.parse(await readFile(JSON.parse(registered.stdout).stateFile, 'utf8'))
    const pending = run(value, ['local-release-status', '--run-key', runKey], {})
    assert.equal(pending.status, 0, pending.stderr)
    assert.equal(JSON.parse(pending.stdout).complete, false)
    const ready = run(value, ['local-release-status', '--run-key', runKey], {
      FAKE_LOCAL_READY: '1',
      FAKE_ARTIFACT_SHA: state.artifactSha256,
      FAKE_PACKAGE_DIGEST: state.packageDigest,
      FAKE_OPERATION_REF: `local-release-op:deploy:${state.packageDigest}:none:${'a'.repeat(32)}`,
    })
    assert.equal(ready.status, 0, ready.stderr)
    assert.equal(JSON.parse(ready.stdout).complete, true)
  } finally {
    await value.cleanup()
  }
})

test('refuses Local Product Release before any mutation on an old Bridge runtime', async () => {
  const value = await fixture()
  try {
    const result = run(value, [
      'local-release-register', '--run-key', runKey, '--spec', value.specPath,
      '--package-root', value.packageRoot, '--provider', 'codex',
      '--provider-session-id', 'session_fixture_1234', '--cwd', value.project,
    ], { FAKE_RUNTIME_VERSION: '1.16.4' })
    assert.notEqual(result.status, 0)
    const calls = (await readFile(value.log, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.deepEqual(calls.map((call) => call[1]), ['capabilities'])
  } finally {
    await value.cleanup()
  }
})

test('Skill completion gate rejects project-local receipts as Porta access proof', async () => {
  const [skill, reference, metadata, evalsSource] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(localReleaseReferencePath, 'utf8'),
    readFile(metadataPath, 'utf8'),
    readFile(evalsPath, 'utf8'),
  ])
  assert.doesNotMatch(skill, /A local-only product is complete without either\./u)
  assert.match(skill, /project-specific deployment receipt/u)
  assert.match(skill, /local-release-register/u)
  assert.match(skill, /local-release-status/u)
  assert.match(reference, /product-materialization-registration-receipt/u)
  assert.match(reference, /local-ready/u)
  assert.match(reference, /SSH local-forward/u)
  assert.match(reference, /does\s+not prove that the user opened/u)
  assert.match(metadata, /never substitute a project-local receipt for Porta settlement/u)
  const evals = JSON.parse(evalsSource)
  assert.equal(evals.find((entry) => entry.id === 'explicit-local-product-release')?.expected.selection, 'local-product-release')
  assert.equal(evals.find((entry) => entry.id === 'local-loopback-is-not-porta-access')?.expected.workRunAction, 'require-registration-and-local-ready')
})
