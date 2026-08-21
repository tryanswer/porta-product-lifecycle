import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, link, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ProductPackageValidationError,
  verifyProductPackageRoot,
} from '../scripts/product-package.mjs'

const clientPath = fileURLToPath(new URL('../scripts/porta-product-lifecycle.mjs', import.meta.url))

function sha(value) {
  return createHash('sha256').update(value).digest('hex')
}

function treeDigest(files) {
  const entries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right))
  return sha(entries.map(([path, bytes]) => `${path}\0${Buffer.byteLength(bytes)}\0${sha(bytes)}\n`).join(''))
}

function specForDirectory(files) {
  return {
    schemaVersion: 1,
    product: { id: 'product_example', displayName: 'Example', version: '1.0.0' },
    descriptor: { summary: 'Static example.', capabilities: ['web.ui'] },
    profile: { kind: 'static-web', entryPath: 'index.html', spaFallback: true },
    artifacts: [{
      id: 'artifact_web',
      kind: 'static-directory',
      path: 'dist',
      bytes: Object.values(files).reduce((total, value) => total + Buffer.byteLength(value), 0),
      sha256: treeDigest(files),
    }],
    validation: {
      checks: [{ id: 'check_build', kind: 'build', status: 'passed', evidenceRef: 'build:fixture', observedAt: '2026-08-22T00:00:00.000Z' }],
    },
    provenance: {
      builder: { id: 'builder.fixture', version: '1.0.0' },
      skills: [{ id: 'porta-product-lifecycle', version: '1.0.0' }],
      sourceRevision: 'abcdef1234567890',
    },
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'porta-product-package-'))
  const files = { 'assets/app.js': 'console.log("ok")\n', 'index.html': '<!doctype html>\n' }
  await mkdir(join(root, 'dist', 'assets'), { recursive: true })
  for (const [path, contents] of Object.entries(files)) await writeFile(join(root, 'dist', path), contents)
  return { files, root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

test('verifies actual regular-file bytes and exact static-directory tree digest', async () => {
  const value = await fixture()
  try {
    const receipt = await verifyProductPackageRoot(specForDirectory(value.files), value.root)
    assert.equal(receipt.artifacts[0].fileCount, 2)
    assert.equal(receipt.artifacts[0].sha256, treeDigest(value.files))
    assert.match(receipt.packageDigest, /^[a-f0-9]{64}$/)
  } finally {
    await value.cleanup()
  }
})

test('rejects bytes drift and content tampering', async () => {
  const value = await fixture()
  try {
    const spec = specForDirectory(value.files)
    await writeFile(join(value.root, 'dist', 'index.html'), '<!doctype html><p>tampered</p>\n')
    await assert.rejects(
      verifyProductPackageRoot(spec, value.root),
      (error) => error instanceof ProductPackageValidationError && error.code === 'artifact_mismatch',
    )
  } finally {
    await value.cleanup()
  }
})

test('rejects undeclared extra files anywhere in the package root', async () => {
  const value = await fixture()
  try {
    await writeFile(join(value.root, 'unexpected.txt'), 'not declared')
    await assert.rejects(
      verifyProductPackageRoot(specForDirectory(value.files), value.root),
      (error) => error instanceof ProductPackageValidationError && error.code === 'undeclared_package_entry',
    )
  } finally {
    await value.cleanup()
  }
})

test('rejects symbolic links without dereferencing them', async () => {
  const value = await fixture()
  try {
    await symlink('/etc/hosts', join(value.root, 'dist', 'assets', 'linked-hosts'))
    await assert.rejects(
      verifyProductPackageRoot(specForDirectory(value.files), value.root),
      (error) => error instanceof ProductPackageValidationError && error.code === 'unsafe_package_entry',
    )
  } finally {
    await value.cleanup()
  }
})

test('rejects undeclared empty directories even inside a static artifact', async () => {
  const value = await fixture()
  try {
    await mkdir(join(value.root, 'dist', 'empty'))
    await assert.rejects(
      verifyProductPackageRoot(specForDirectory(value.files), value.root),
      (error) => error instanceof ProductPackageValidationError && error.code === 'undeclared_package_entry',
    )
  } finally {
    await value.cleanup()
  }
})

test('rejects hard-linked regular files', async () => {
  const value = await fixture()
  const outsideLink = `${value.root}-hardlink`
  try {
    await link(join(value.root, 'dist', 'index.html'), outsideLink)
    await assert.rejects(
      verifyProductPackageRoot(specForDirectory(value.files), value.root),
      (error) => error instanceof ProductPackageValidationError && error.code === 'unsafe_package_entry',
    )
  } finally {
    await rm(outsideLink, { force: true })
    await value.cleanup()
  }
})

test('rejects a package entry added after the initial scan', async () => {
  const root = await mkdtemp(join(tmpdir(), 'porta-package-drift-'))
  try {
    const contents = Buffer.alloc(128 * 1024 * 1024, 0x61)
    await mkdir(join(root, 'dist'))
    await writeFile(join(root, 'dist', 'large.bin'), contents)
    const files = { 'large.bin': contents }
    const verification = verifyProductPackageRoot(specForDirectory(files), root)
    const mutation = new Promise((resolve) => setTimeout(async () => {
      await writeFile(join(root, 'dist', 'late.txt'), 'late')
      resolve()
    }, 20))
    await assert.rejects(
      verification,
      (error) => error instanceof ProductPackageValidationError && error.code === 'package_tree_changed',
    )
    await mutation
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('CLI verifies a local-runtime file but never executes its declared command', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'porta-local-package-'))
  const root = join(fixtureRoot, 'package')
  try {
    await mkdir(root)
    const marker = join(root, 'executed.txt')
    const artifactPath = join(root, 'bin', 'product')
    const contents = `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`
    await mkdir(join(root, 'bin'))
    await writeFile(artifactPath, contents, { mode: 0o755 })
    const spec = {
      schemaVersion: 1,
      product: { id: 'product_local', displayName: 'Local', version: '1.0.0' },
      descriptor: { summary: 'Local runtime.', capabilities: ['local.runtime'] },
      profile: { kind: 'local-runtime', command: ['bin/product'] },
      artifacts: [{ id: 'artifact_runtime', kind: 'executable-file', path: 'bin/product', bytes: Buffer.byteLength(contents), sha256: sha(contents) }],
      validation: { checks: [{ id: 'check_build', kind: 'build', status: 'passed', evidenceRef: 'build:local', observedAt: '2026-08-22T00:00:00.000Z' }] },
      provenance: { builder: { id: 'builder.fixture', version: '1.0.0' }, skills: [{ id: 'porta-product-lifecycle', version: '1.0.0' }], sourceRevision: 'abcdef1234567890' },
    }
    const specPath = join(fixtureRoot, 'descriptor.json')
    await writeFile(specPath, JSON.stringify(spec))
    const result = spawnSync(process.execPath, [clientPath, 'package-verify', '--spec', specPath, '--package-root', root], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).receipt.artifacts[0].sha256, sha(contents))
    await assert.rejects(access(marker), /ENOENT/)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
