import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, link, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { writePackageRouteReceipt } from './helpers/lifecycle-route-fixture.mjs'

import {
  ProductPackageValidationError,
  verifyProductPackageRoot,
} from '../scripts/product-package.mjs'

const clientPath = fileURLToPath(new URL('../scripts/porta-product-lifecycle.mjs', import.meta.url))

function sha(value) {
  return createHash('sha256').update(value).digest('hex')
}

function treeDigest(files) {
  const entries = Object.entries(files).sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
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
    assert.deepEqual(receipt.artifacts[0].files.map((file) => file.path), ['assets/app.js', 'index.html'])
    assert.match(receipt.packageDigest, /^[a-f0-9]{64}$/)
    assert.deepEqual(receipt.materializationCandidate, {
      artifactReceipts: receipt.artifacts,
      package: specForDirectory(value.files),
      packageDigest: receipt.packageDigest,
      primaryArtifact: receipt.artifacts[0],
      schemaVersion: 1,
      type: 'porta-product-materialization-candidate',
      version: 3,
    })
  } finally {
    await value.cleanup()
  }
})

test('uses locale-independent UTF-8 byte order for non-ASCII artifact paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'porta-product-package-unicode-'))
  const files = { 'z.txt': 'z', 'ä.txt': 'umlaut', '中.txt': 'han' }
  try {
    await mkdir(join(root, 'dist'), { recursive: true })
    for (const [path, contents] of Object.entries(files)) await writeFile(join(root, 'dist', path), contents)
    const receipt = await verifyProductPackageRoot(specForDirectory(files), root)
    assert.equal(receipt.artifacts[0].sha256, treeDigest(files))
    assert.deepEqual(receipt.artifacts[0].files.map((file) => file.path), ['z.txt', 'ä.txt', '中.txt'])
  } finally {
    await rm(root, { recursive: true, force: true })
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
    const routeReceipt = writePackageRouteReceipt(fixtureRoot)
    const result = spawnSync(process.execPath, [
      clientPath, 'package-verify', '--spec', specPath, '--package-root', root,
      '--route-receipt', routeReceipt,
    ], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).receipt.artifacts[0].sha256, sha(contents))
    await assert.rejects(access(marker), /ENOENT/)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('Product Package v2 emits digest-bound card assets in the candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'porta-presentation-package-'))
  try {
    const runtime = '#!/bin/sh\nexit 0\n'
    const logo = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('verified-logo')])
    const cover = Buffer.concat([Buffer.from('RIFF0000WEBP', 'ascii'), Buffer.from('verified-cover')])
    await mkdir(join(root, 'bin'), { recursive: true })
    await mkdir(join(root, 'presentation'), { recursive: true })
    await writeFile(join(root, 'bin', 'product'), runtime)
    await writeFile(join(root, 'presentation', 'logo.png'), logo)
    await writeFile(join(root, 'presentation', 'cover.webp'), cover)
    const spec = {
      artifacts: [
        { bytes: Buffer.byteLength(runtime), id: 'artifact_runtime', kind: 'executable-file', path: 'bin/product', sha256: sha(runtime) },
        { bytes: logo.length, id: 'presentation_logo', kind: 'presentation-file', mediaType: 'image/png', path: 'presentation/logo.png', sha256: sha(logo) },
        { bytes: cover.length, id: 'presentation_cover', kind: 'presentation-file', mediaType: 'image/webp', path: 'presentation/cover.webp', sha256: sha(cover) },
      ],
      descriptor: { capabilities: ['local.runtime'], summary: 'Local presentation fixture.' },
      presentation: { cover: { artifactId: 'presentation_cover' }, logo: { artifactId: 'presentation_logo' } },
      product: { displayName: 'Presentation', id: 'product_presentation', version: '1.0.0' },
      profile: { command: ['bin/product'], kind: 'local-runtime' },
      provenance: { builder: { id: 'builder.fixture', version: '1.0.0' }, skills: [{ id: 'porta-product-lifecycle', version: '1.0.5' }], sourceRevision: 'abcdef1234567890' },
      schemaVersion: 2,
      validation: { checks: [{ evidenceRef: 'build:presentation', id: 'check_build', kind: 'build', observedAt: '2026-08-27T00:00:00.000Z', status: 'passed' }] },
    }
    const receipt = await verifyProductPackageRoot(spec, root)
    assert.equal(receipt.materializationCandidate.version, 3)
    assert.deepEqual(receipt.materializationCandidate.presentationAssets, [
      { bytes: logo.length, contentBase64: logo.toString('base64'), mediaType: 'image/png', path: 'presentation/logo.png', role: 'logo', sha256: sha(logo) },
      { bytes: cover.length, contentBase64: cover.toString('base64'), mediaType: 'image/webp', path: 'presentation/cover.webp', role: 'cover', sha256: sha(cover) },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
