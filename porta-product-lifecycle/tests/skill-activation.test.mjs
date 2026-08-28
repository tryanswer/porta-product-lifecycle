import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  activatePortaProductLifecycleSkill,
  resolvePortaWorkflowSkillDestination,
} from '../scripts/porta-product-lifecycle-skill-activation.mjs'

const activationScriptPath = fileURLToPath(new URL('../scripts/porta-product-lifecycle-skill-activation.mjs', import.meta.url))
const repositoryUrl = 'https://github.com/tryanswer/porta-product-lifecycle.git'
const tag = 'porta-product-lifecycle-v1.0.0'
const previousTag = 'porta-product-lifecycle-v0.9.0'

function git(repository, ...args) {
  return execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

async function createSourceRepository() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'porta-product-lifecycle-activation-source-')))
  const repository = join(root, 'repository')
  await mkdir(join(repository, 'porta-product-lifecycle', 'scripts'), { recursive: true })
  execFileSync('git', ['init', '-q', repository])
  git(repository, 'config', 'user.email', 'porta-product-lifecycle-test@example.invalid')
  git(repository, 'config', 'user.name', 'Porta Product Lifecycle Test')
  git(repository, 'remote', 'add', 'origin', repositoryUrl)
  await writeFile(join(repository, 'porta-product-lifecycle', 'SKILL.md'), '---\nname: porta-product-lifecycle\ndescription: previous fixture\n---\n\n# Previous fixture\n')
  await writeFile(join(repository, 'porta-product-lifecycle', 'version.txt'), '0.9.0\n')
  git(repository, 'add', 'porta-product-lifecycle')
  git(repository, 'commit', '-qm', 'previous fixture release')
  git(repository, 'tag', '-a', previousTag, '-m', 'previous fixture release')
  const previousCommit = git(repository, 'rev-parse', 'HEAD')

  await writeFile(join(repository, 'porta-product-lifecycle', 'SKILL.md'), '---\nname: porta-product-lifecycle\ndescription: fixture\n---\n\n# Fixture\n')
  await writeFile(join(repository, 'porta-product-lifecycle', 'version.txt'), '1.0.0\n')
  await writeFile(join(repository, 'porta-product-lifecycle', 'scripts', 'tool.mjs'), '#!/usr/bin/env node\n')
  await chmod(join(repository, 'porta-product-lifecycle', 'scripts', 'tool.mjs'), 0o755)
  git(repository, 'add', 'porta-product-lifecycle')
  git(repository, 'commit', '-qm', 'fixture release')
  git(repository, 'tag', '-a', tag, '-m', 'fixture release')
  return {
    cleanup: () => rm(root, { force: true, recursive: true }),
    commit: git(repository, 'rev-parse', 'HEAD'),
    previousCommit,
    repository,
  }
}

async function createProviderFixture(provider = 'codex') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'porta-product-lifecycle-activation-provider-')))
  const providerHome = join(root, 'provider-home')
  const destination = resolvePortaWorkflowSkillDestination({ provider, providerHome })
  await mkdir(dirname(destination), { recursive: true })
  return {
    cleanup: () => rm(root, { force: true, recursive: true }),
    destination,
    provider,
    providerHome,
    root,
  }
}

async function writePreviousRelease(destination) {
  await mkdir(destination, { recursive: true })
  await writeFile(join(destination, 'SKILL.md'), 'previous release\n')
  await writeFile(join(destination, 'version.txt'), '0.1.1\n')
}

async function writeApprovedPreviousRelease(destination) {
  await mkdir(destination, { recursive: true })
  await writeFile(join(destination, 'SKILL.md'), '---\nname: porta-product-lifecycle\ndescription: previous fixture\n---\n\n# Previous fixture\n')
  await writeFile(join(destination, 'version.txt'), '0.9.0\n')
}

async function readInstalledVersion(destination) {
  return (await readFile(join(destination, 'version.txt'), 'utf8')).trim()
}

function activationInput(source, provider, overrides = {}) {
  return {
    expectedRepositoryUrl: repositoryUrl,
    helperRelease: { commitSha: source.commit, tag },
    provider: provider.provider,
    providerHome: provider.providerHome,
    sourceRepository: source.repository,
    transition: {
      intent: 'install',
      to: { commitSha: source.commit, tag },
    },
    ...overrides,
  }
}

function approvedUpdate(source) {
  return {
    helperRelease: { commitSha: source.commit, tag },
    transition: {
      from: { commitSha: source.previousCommit, tag: previousTag },
      intent: 'update',
      to: { commitSha: source.commit, tag },
    },
  }
}

function approvedRollback(source) {
  return {
    helperRelease: { commitSha: source.commit, tag },
    transition: {
      from: { commitSha: source.commit, tag },
      intent: 'rollback',
      to: { commitSha: source.previousCommit, tag: previousTag },
    },
  }
}

function approvedRepair(source, path, sourceContent) {
  return {
    helperRelease: { commitSha: source.commit, tag },
    transition: {
      from: { commitSha: source.commit, tag },
      intent: 'repair',
      repair: {
        path,
        sourceSha256: createHash('sha256').update(sourceContent).digest('hex'),
      },
      to: { commitSha: source.commit, tag },
    },
  }
}

test('resolves only the exact user-level provider skill destination', async () => {
  const providerHome = '/tmp/porta-product-lifecycle-provider-home'
  for (const provider of ['codex', 'claude', 'gemini']) {
    assert.equal(
      resolvePortaWorkflowSkillDestination({ provider, providerHome }),
      join(providerHome, 'skills', 'porta-product-lifecycle'),
    )
  }
  assert.throws(
    () => resolvePortaWorkflowSkillDestination({ provider: 'unknown', providerHome }),
    /provider/i,
  )
  assert.throws(
    () => resolvePortaWorkflowSkillDestination({ provider: 'codex', providerHome: 'relative' }),
    /absolute/i,
  )
})

test('installs the complete immutable tagged subdirectory and preserves executable mode', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    const receipt = await activatePortaProductLifecycleSkill(activationInput(source, provider))
    assert.equal(receipt.action, 'installed')
    assert.equal(receipt.commitSha, source.commit)
    assert.equal(receipt.provider, 'codex')
    assert.equal(receipt.tag, tag)
    assert.match(receipt.treeDigest, /^[0-9a-f]{64}$/)
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
    assert.equal((await readFile(join(provider.destination, 'SKILL.md'), 'utf8')).includes('# Fixture'), true)
    const executable = await import('node:fs/promises').then(({ stat }) => stat(join(provider.destination, 'scripts', 'tool.mjs')))
    assert.equal(executable.mode & 0o111, 0o111)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('CLI resolves the current Codex user root and returns the bounded activation receipt', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    const result = spawnSync(process.execPath, [
      activationScriptPath,
      'activate',
      '--provider', 'codex',
      '--source-repository', source.repository,
      '--expected-repository-url', repositoryUrl,
      '--helper-tag', tag,
      '--helper-commit', source.commit,
      '--intent', 'install',
      '--target-tag', tag,
      '--target-commit', source.commit,
    ], {
      encoding: 'utf8',
      env: { ...process.env, CODEX_HOME: provider.providerHome },
    })
    assert.equal(result.status, 0, result.stderr)
    const receipt = JSON.parse(result.stdout)
    assert.equal(receipt.ok, true)
    assert.equal(receipt.action, 'installed')
    assert.equal(receipt.installedPath, provider.destination)
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('CLI repairs one approved file drift and reports the exact repair evidence', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  const repairPath = 'SKILL.md'
  try {
    await activatePortaProductLifecycleSkill(activationInput(source, provider))
    const driftedContent = Buffer.concat([
      await readFile(join(provider.destination, repairPath)),
      Buffer.from('\n'),
    ])
    await writeFile(join(provider.destination, repairPath), driftedContent)
    const sourceSha256 = createHash('sha256').update(driftedContent).digest('hex')
    const result = spawnSync(process.execPath, [
      activationScriptPath,
      'activate',
      '--provider', 'codex',
      '--source-repository', source.repository,
      '--expected-repository-url', repositoryUrl,
      '--helper-tag', tag,
      '--helper-commit', source.commit,
      '--intent', 'repair',
      '--source-tag', tag,
      '--source-commit', source.commit,
      '--repair-path', repairPath,
      '--repair-source-sha256', sourceSha256,
      '--target-tag', tag,
      '--target-commit', source.commit,
    ], {
      encoding: 'utf8',
      env: { ...process.env, CODEX_HOME: provider.providerHome },
    })
    assert.equal(result.status, 0, result.stderr)
    const receipt = JSON.parse(result.stdout)
    assert.equal(receipt.action, 'repaired')
    assert.equal(receipt.repairPath, repairPath)
    assert.equal(receipt.repairSourceSha256, sourceSha256)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('rejects a mismatched tag, commit, origin, or symbolic-link Git entry before mutation', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('claude')
  try {
    await writePreviousRelease(provider.destination)
    for (const override of [
      {
        transition: {
          intent: 'install',
          to: { commitSha: 'a'.repeat(40), tag },
        },
      },
      {
        transition: {
          intent: 'install',
          to: { commitSha: source.commit, tag: 'porta-product-lifecycle-v9.9.9' },
        },
      },
      { expectedRepositoryUrl: 'https://github.com/tryanswer/other.git' },
    ]) {
      await assert.rejects(activatePortaProductLifecycleSkill(activationInput(source, provider, override)))
      assert.equal(await readInstalledVersion(provider.destination), '0.1.1')
    }

    await symlink('../version.txt', join(source.repository, 'porta-product-lifecycle', 'linked-version'))
    git(source.repository, 'add', 'porta-product-lifecycle/linked-version')
    git(source.repository, 'commit', '-qm', 'unsafe symlink')
    git(source.repository, 'tag', '-f', '-a', tag, '-m', 'unsafe symlink')
    const unsafeCommit = git(source.repository, 'rev-parse', 'HEAD')
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, {
        helperRelease: { commitSha: unsafeCommit, tag },
        transition: { intent: 'install', to: { commitSha: unsafeCommit, tag } },
      })),
      /symbolic|mode|entry/i,
    )
    assert.equal(await readInstalledVersion(provider.destination), '0.1.1')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('rejects a dirty or non-release checkout even when the tagged Git objects are present', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    await writePreviousRelease(provider.destination)
    await writeFile(join(source.repository, 'porta-product-lifecycle', 'version.txt'), 'dirty\n')
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider)),
      /clean exact release checkout/i,
    )
    assert.equal(await readInstalledVersion(provider.destination), '0.1.1')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('updates an existing release and reports the exact previous and active tree digests', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('gemini')
  try {
    await writeApprovedPreviousRelease(provider.destination)
    const receipt = await activatePortaProductLifecycleSkill(activationInput(source, provider, approvedUpdate(source)))
    assert.equal(receipt.action, 'updated')
    assert.match(receipt.previousTreeDigest, /^[0-9a-f]{64}$/)
    assert.notEqual(receipt.previousTreeDigest, receipt.treeDigest)
    assert.equal(receipt.intent, 'update')
    assert.equal(receipt.sourceCommitSha, source.previousCommit)
    assert.equal(receipt.sourceTag, previousTag)
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('uses the newer helper checkout to perform an approved rollback to an older exact release', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('gemini')
  try {
    await activatePortaProductLifecycleSkill(activationInput(source, provider))
    const receipt = await activatePortaProductLifecycleSkill(activationInput(source, provider, approvedRollback(source)))
    assert.equal(receipt.action, 'rolled-back')
    assert.equal(receipt.intent, 'rollback')
    assert.equal(receipt.helperCommitSha, source.commit)
    assert.equal(receipt.helperTag, tag)
    assert.equal(receipt.commitSha, source.previousCommit)
    assert.equal(receipt.tag, previousTag)
    assert.equal(receipt.sourceCommitSha, source.commit)
    assert.equal(receipt.sourceTag, tag)
    assert.equal(await readInstalledVersion(provider.destination), '0.9.0')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('a failed approved rollback retains the exact newer source release', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('claude')
  try {
    await activatePortaProductLifecycleSkill(activationInput(source, provider))
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, {
        ...approvedRollback(source),
        hooks: {
          async onPhase(phase) {
            if (phase === 'after-activated') throw new Error('injected rollback failure')
          },
        },
      })),
      /injected rollback failure/,
    )
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('ignores local Git replace refs when reading an approved immutable release', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    git(source.repository, 'replace', source.commit, source.previousCommit)
    const receipt = await activatePortaProductLifecycleSkill(activationInput(source, provider))
    assert.equal(receipt.commitSha, source.commit)
    assert.equal(receipt.tag, tag)
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('rejects update when the installed tree is not the approved source release', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    await writePreviousRelease(provider.destination)
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, approvedUpdate(source))),
      /approved|source release|transition/i,
    )
    assert.equal(await readInstalledVersion(provider.destination), '0.1.1')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('repairs one explicitly approved file drift back to the same immutable release', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  const path = 'SKILL.md'
  try {
    await activatePortaProductLifecycleSkill(activationInput(source, provider))
    const exactContent = await readFile(join(provider.destination, path))
    const driftedContent = Buffer.concat([exactContent, Buffer.from('\n')])
    await writeFile(join(provider.destination, path), driftedContent)

    const receipt = await activatePortaProductLifecycleSkill(activationInput(
      source,
      provider,
      approvedRepair(source, path, driftedContent),
    ))

    assert.equal(receipt.action, 'repaired')
    assert.equal(receipt.intent, 'repair')
    assert.equal(receipt.repairPath, path)
    assert.deepEqual(await readFile(join(provider.destination, path)), exactContent)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('repair rejects an incorrect source hash or a second changed file without mutation', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    await activatePortaProductLifecycleSkill(activationInput(source, provider))
    const skillPath = join(provider.destination, 'SKILL.md')
    const versionPath = join(provider.destination, 'version.txt')
    const driftedSkill = Buffer.concat([await readFile(skillPath), Buffer.from('\n')])
    await writeFile(skillPath, driftedSkill)

    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(
        source,
        provider,
        approvedRepair(source, 'SKILL.md', Buffer.from('not-the-installed-bytes')),
      )),
      /repair source|transition/i,
    )
    assert.deepEqual(await readFile(skillPath), driftedSkill)

    const driftedVersion = Buffer.from('locally changed\n')
    await writeFile(versionPath, driftedVersion)
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(
        source,
        provider,
        approvedRepair(source, 'SKILL.md', driftedSkill),
      )),
      /repair source|transition/i,
    )
    assert.deepEqual(await readFile(skillPath), driftedSkill)
    assert.deepEqual(await readFile(versionPath), driftedVersion)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('repair rejects target bytes declared as drift evidence', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    await activatePortaProductLifecycleSkill(activationInput(source, provider))
    const exactContent = await readFile(join(provider.destination, 'SKILL.md'))
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(
        source,
        provider,
        approvedRepair(source, 'SKILL.md', exactContent),
      )),
      /must differ|repair/i,
    )
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('a failed repair restores the exact approved drift tree', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  const path = 'SKILL.md'
  try {
    await activatePortaProductLifecycleSkill(activationInput(source, provider))
    const driftedContent = Buffer.concat([await readFile(join(provider.destination, path)), Buffer.from('\n')])
    await writeFile(join(provider.destination, path), driftedContent)
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, {
        ...approvedRepair(source, path, driftedContent),
        hooks: {
          async onPhase(phase) {
            if (phase === 'after-activated') throw new Error('injected repair failure')
          },
        },
      })),
      /injected repair failure/,
    )
    assert.deepEqual(await readFile(join(provider.destination, path)), driftedContent)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('never removes a replacement transaction lock during settlement', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  const lockPath = join(dirname(provider.destination), '.porta-product-lifecycle.activation.lock')
  const replacement = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    token: '11111111-1111-4111-8111-111111111111',
    version: 1,
  }
  try {
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, {
        hooks: {
          async onPhase(phase) {
            if (phase !== 'after-activated') return
            await unlink(lockPath)
            await writeFile(lockPath, `${JSON.stringify(replacement)}\n`, { mode: 0o600 })
          },
        },
      })),
      /lock|ownership|filesystem/i,
    )
    assert.deepEqual(JSON.parse(await readFile(lockPath, 'utf8')), replacement)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('recovers exact dead lock and recovery-claim receipts before activation', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  const parent = dirname(provider.destination)
  const deadOwner = (token) => ({
    pid: 999_999_999,
    startedAt: '2026-08-13T00:00:00.000Z',
    token,
    version: 1,
  })
  try {
    await writeFile(
      join(parent, '.porta-product-lifecycle.activation.lock'),
      `${JSON.stringify(deadOwner('22222222-2222-4222-8222-222222222222'))}\n`,
      { mode: 0o600 },
    )
    await writeFile(
      join(parent, '.porta-product-lifecycle.activation.recovery'),
      `${JSON.stringify(deadOwner('33333333-3333-4333-8333-333333333333'))}\n`,
      { mode: 0o600 },
    )
    const receipt = await activatePortaProductLifecycleSkill(activationInput(source, provider))
    assert.equal(receipt.action, 'installed')
    await assert.rejects(readFile(join(parent, '.porta-product-lifecycle.activation.lock')), /ENOENT/)
    await assert.rejects(readFile(join(parent, '.porta-product-lifecycle.activation.recovery')), /ENOENT/)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('an exact installed release is a read-only idempotent replay', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    const installed = await activatePortaProductLifecycleSkill(activationInput(source, provider))
    const replayed = await activatePortaProductLifecycleSkill(activationInput(source, provider))
    assert.equal(installed.action, 'installed')
    assert.equal(replayed.action, 'unchanged')
    assert.equal(replayed.treeDigest, installed.treeDigest)
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('a failure before settlement restores the exact previous release across every activation phase', async () => {
  const source = await createSourceRepository()
  for (const phase of ['after-staged', 'after-previous-retired', 'after-activated']) {
    const provider = await createProviderFixture('codex')
    try {
      await writeApprovedPreviousRelease(provider.destination)
      await assert.rejects(
        activatePortaProductLifecycleSkill(activationInput(source, provider, {
          ...approvedUpdate(source),
          hooks: {
            async onPhase(current) {
              if (current === phase) throw new Error(`injected ${phase}`)
            },
          },
        })),
        new RegExp(`injected ${phase}`),
      )
      assert.equal(await readInstalledVersion(provider.destination), '0.9.0')
    } finally {
      await provider.cleanup()
    }
  }
  await source.cleanup()
})

test('recovers a legacy version 2 non-repair journal without weakening its evidence', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  const journalPath = join(dirname(provider.destination), '.porta-product-lifecycle.activation.json')
  try {
    await writeApprovedPreviousRelease(provider.destination)
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, {
        ...approvedUpdate(source),
        hooks: {
          async onPhase(phase) {
            if (phase !== 'after-staged') return
            const journal = JSON.parse(await readFile(journalPath, 'utf8'))
            delete journal.repairPath
            delete journal.repairSourceSha256
            journal.version = 2
            await writeFile(journalPath, `${JSON.stringify(journal)}\n`, { mode: 0o600 })
            throw new Error('injected legacy journal recovery')
          },
        },
      })),
      /injected legacy journal recovery/,
    )
    assert.equal(await readInstalledVersion(provider.destination), '0.9.0')
    await assert.rejects(readFile(journalPath), /ENOENT/)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('a failed fresh activation restores the previously absent installation', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, {
        hooks: {
          async onPhase(phase) {
            if (phase === 'after-activated') throw new Error('injected fresh activation failure')
          },
        },
      })),
      /injected fresh activation failure/,
    )
    await assert.rejects(readFile(join(provider.destination, 'SKILL.md')), /ENOENT/)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('an unknown replacement during activation is preserved and blocks destructive recovery', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    await writeApprovedPreviousRelease(provider.destination)
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, {
        ...approvedUpdate(source),
        hooks: {
          async onPhase(phase) {
            if (phase !== 'after-previous-retired') return
            await mkdir(provider.destination)
            await writeFile(join(provider.destination, 'SKILL.md'), 'replacement\n')
            await writeFile(join(provider.destination, 'version.txt'), 'unknown\n')
            throw new Error('injected replacement')
          },
        },
      })),
      /exact recovery|required|cannot be recovered/i,
    )
    assert.equal(await readInstalledVersion(provider.destination), 'unknown')
    const siblingNames = await import('node:fs/promises').then(({ readdir }) => readdir(dirname(provider.destination)))
    assert.equal(siblingNames.some((name) => name.startsWith('.porta-product-lifecycle.backup-')), true)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('a process killed after retiring the previous release is recovered before the next update', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    await writeApprovedPreviousRelease(provider.destination)
    const childCode = `
      import { activatePortaProductLifecycleSkill } from ${JSON.stringify(pathToFileURL(activationScriptPath).href)}
      await activatePortaProductLifecycleSkill({
        ...${JSON.stringify(activationInput(source, provider, approvedUpdate(source)))},
        hooks: { async onPhase(phase) { if (phase === 'after-previous-retired') process.kill(process.pid, 'SIGKILL') } },
      })
    `
    const child = spawn(process.execPath, ['--input-type=module', '--eval', childCode], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exit = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
    assert.equal(exit.signal, 'SIGKILL')

    const receipt = await activatePortaProductLifecycleSkill(activationInput(source, provider, approvedUpdate(source)))
    assert.equal(receipt.action, 'updated')
    assert.equal(receipt.recoveredPreviousRelease, true)
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('a process killed after activating but before settlement restores the prior release before retry', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  try {
    await writeApprovedPreviousRelease(provider.destination)
    const childCode = `
      import { activatePortaProductLifecycleSkill } from ${JSON.stringify(pathToFileURL(activationScriptPath).href)}
      await activatePortaProductLifecycleSkill({
        ...${JSON.stringify(activationInput(source, provider, approvedUpdate(source)))},
        hooks: { async onPhase(phase) { if (phase === 'after-activated') process.kill(process.pid, 'SIGKILL') } },
      })
    `
    const child = spawn(process.execPath, ['--input-type=module', '--eval', childCode], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exit = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
    assert.equal(exit.signal, 'SIGKILL')

    const receipt = await activatePortaProductLifecycleSkill(activationInput(source, provider, approvedUpdate(source)))
    assert.equal(receipt.action, 'updated')
    assert.equal(receipt.recoveredPreviousRelease, true)
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('a completed repair journal can only be settled by the exact original transition evidence', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  const repairPath = 'SKILL.md'
  try {
    await activatePortaProductLifecycleSkill(activationInput(source, provider))
    const driftedContent = Buffer.concat([
      await readFile(join(provider.destination, repairPath)),
      Buffer.from('\n'),
    ])
    await writeFile(join(provider.destination, repairPath), driftedContent)
    const originalRepair = approvedRepair(source, repairPath, driftedContent)
    const childCode = `
      import { activatePortaProductLifecycleSkill } from ${JSON.stringify(pathToFileURL(activationScriptPath).href)}
      await activatePortaProductLifecycleSkill({
        ...${JSON.stringify(activationInput(source, provider, originalRepair))},
        hooks: { async onPhase(phase) { if (phase === 'after-previous-settled') process.kill(process.pid, 'SIGKILL') } },
      })
    `
    const child = spawn(process.execPath, ['--input-type=module', '--eval', childCode], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exit = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
    assert.equal(exit.signal, 'SIGKILL')

    const differentRepair = approvedRepair(source, 'version.txt', Buffer.from('not-the-target-version\n'))
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, differentRepair)),
      /transaction|evidence|transition/i,
    )

    const receipt = await activatePortaProductLifecycleSkill(activationInput(source, provider, originalRepair))
    assert.equal(receipt.action, 'repaired')
    assert.equal(receipt.repairPath, repairPath)
  } finally {
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})

test('a concurrent activation fails closed while the exact first transaction owns the destination', async () => {
  const source = await createSourceRepository()
  const provider = await createProviderFixture('codex')
  let releaseStaged
  const staged = new Promise((resolve) => { releaseStaged = resolve })
  let continueFirst
  const blocked = new Promise((resolve) => { continueFirst = resolve })
  try {
    await writeApprovedPreviousRelease(provider.destination)
    const first = activatePortaProductLifecycleSkill(activationInput(source, provider, {
      ...approvedUpdate(source),
      hooks: {
        async onPhase(phase) {
          if (phase === 'after-staged') {
            releaseStaged()
            await blocked
          }
        },
      },
    }))
    await staged
    await assert.rejects(
      activatePortaProductLifecycleSkill(activationInput(source, provider, approvedUpdate(source))),
      /activation|lock|transaction/i,
    )
    continueFirst()
    await first
    assert.equal(await readInstalledVersion(provider.destination), '1.0.0')
  } finally {
    continueFirst?.()
    await Promise.all([source.cleanup(), provider.cleanup()])
  }
})
