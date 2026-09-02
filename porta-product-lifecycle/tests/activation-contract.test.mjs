import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url))
const metadataPath = fileURLToPath(new URL('../agents/openai.yaml', import.meta.url))
const activationReferencePath = fileURLToPath(new URL('../references/skill-activation.md', import.meta.url))
const migrationReferencePath = fileURLToPath(new URL('../references/legacy-migration.md', import.meta.url))
const releaseReferencePath = fileURLToPath(new URL('../references/bridge-workflow-v2.md', import.meta.url))
const activationCasesPath = fileURLToPath(new URL('../evals/activation-cases.json', import.meta.url))

test('canonical identity and natural-language lifecycle activation are installable', async () => {
  const [skill, metadata] = await Promise.all([readFile(skillPath, 'utf8'), readFile(metadataPath, 'utf8')])
  assert.match(skill, /^---\nname: porta-product-lifecycle\n/m)
  assert.match(skill, /concrete product.*Porta-governed lifecycle/)
  assert.match(metadata, /display_name: "Porta Product Lifecycle"/)
  assert.match(metadata, /allow_implicit_invocation:\s*true/)
  assert.match(metadata, /\$porta-product-lifecycle/)
})

test('deterministic routing separates planning, delegated installation, and mutation authority', async () => {
  const skill = (await readFile(skillPath, 'utf8')).replace(/\s+/g, ' ')
  assert.match(skill, /Natural language proposes an intent; it does not grant execution authority/)
  assert.match(skill, /Do not perform phase work before the route receipt is settled/)
  assert.match(skill, /Skill installation or discovery.*`skill-installer` or the Provider-native mechanism/)
  assert.match(skill, /These commands do not execute a constructor.*deploy, distribute, or create a WorkRun/)
  assert.match(skill, /Require explicit placement and exposure/)
  assert.match(skill, /Require current explicit intent and an exact channel/)
  assert.match(skill, /submission, approval, rollout, and\s+public target observation/)
})

test('publication and readiness preserve the fail-closed Bridge boundaries', async () => {
  const [skillSource, releaseSource] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(releaseReferencePath, 'utf8'),
  ])
  const skill = skillSource.replace(/\s+/g, ' ')
  const release = releaseSource.replace(/\s+/g, ' ')
  assert.match(skill, /Current explicit mutation intent comes only from the current user request/i)
  assert.match(skill, /Bridge remains the final fail-closed authority/)
  assert.match(release, /Agent-observed UX signal/)
  assert.match(release, /not verified or attested/i)
  assert.match(release, /not a security gate/i)
  assert.match(release, /cannot authorize `begin`, a WorkRun, or publication/i)
})

test('new identity installs atomically and migrates legacy input without mixed output identity', async () => {
  const [activation, migration] = await Promise.all([
    readFile(activationReferencePath, 'utf8'),
    readFile(migrationReferencePath, 'utf8'),
  ])
  assert.match(activation, /exact repository subdirectory \(`porta-product-lifecycle`\)/)
  assert.match(activation.replace(/\s+/g, ' '), /does not activate Porta Product Lifecycle, authorize publication, call `begin`, or create a WorkRun/)
  assert.match(migration, /version `1\.0\.0` is a new identity/)
  assert.match(migration.replace(/\s+/g, ' '), /New descriptors, client receipts, Scene claims, WorkRuns, package plans, and output types must use only the new identity/)
  assert.match(migration, /new client refuses old client-state identity\/version combinations/)
})

test('known one-file drift requires an explicit bounded repair transaction', async () => {
  const activation = (await readFile(activationReferencePath, 'utf8')).replace(/\s+/g, ' ')
  assert.match(activation, /repair source and target must name the same immutable release/i)
  assert.match(activation, /one exact regular file path and the SHA-256 of its currently installed bytes/i)
  assert.match(activation, /every other path, mode, and byte must still match the immutable release/i)
  assert.match(activation, /does not authorize arbitrary installed content/i)
})

test('activation boundary corpus delegates concerns no longer owned by Lifecycle', async () => {
  const cases = JSON.parse(await readFile(activationCasesPath, 'utf8'))
  const expected = new Map(cases.map((entry) => [entry.id, entry.expected]))
  assert.deepEqual(expected.get('skill-installation'), {
    disposition: 'delegate', selection: 'skill-installer', workRunAction: 'none',
  })
  assert.equal(expected.get('explicit-app-store-target')?.selection, 'porta-mobile-store-release')
  assert.equal(expected.get('explicit-vercel-target')?.selection, 'deliver-product')
  assert.equal(expected.get('single-file-phone-preview')?.selection, 'porta-agent-artifact-handoff')
  assert.equal(expected.get('inbox-file-delivery')?.selection, 'porta-agent-artifact-handoff')
  assert.equal(expected.get('cross-user-file-send')?.disposition, 'ignore')
})
